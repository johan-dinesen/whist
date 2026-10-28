import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root,'administrering.html'),'utf8');
const sql = fs.readFileSync(path.join(root,'sql/25_admin_recent_game_deletion.sql'),'utf8');
const code = fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8')
  .replace(/^import .* from '\.\/profiles\.js';\s*/m, '')
  .replace(/\binit\(\);\s*$/, '');

class Node {
  constructor(id='') {
    this.id=id;
    this.textContent='';this.value='';this.disabled=false;
    this.children=[];this.listeners={};this.attributes={};
    this.classList={
      values:new Set(),
      add(name){this.values.add(name)},
      remove(name){this.values.delete(name)},
      contains(name){return this.values.has(name)},
      toggle(name,on){const yes=on===undefined?!this.values.has(name):on;yes?this.values.add(name):this.values.delete(name)}
    };
  }
  set className(value){this.classList.values=new Set(value.split(' ').filter(Boolean))}
  get className(){return [...this.classList.values].join(' ')}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler)}
  setAttribute(key,value){this.attributes[key]=value}
  replaceChildren(...elements){this.children=elements}
  append(...elements){this.children.push(...elements)}
  async fire(type){for(const fn of this.listeners[type]??[])await fn({preventDefault(){}})}
}
function setup() {
  const els = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Node(m[1])]));
  let confirmation=false;
  const rpcCalls=[];
  let games=[{
    id:'game-a', call_type:'halve',tricks:9,trump:'diamonds',score:-2,
    created_at:'2026-10-28T13:00:00Z',played_at:'2026-09-21T13:00:00Z',
    tournament_id:'t-1',participants:[
      {name:'David',is_caller:true,payout:-1.5},
      {name:'William',is_partner:true,payout:-1.5},
      {name:'Gustav',payout:1.5},
      {name:'Johan',payout:1.5}
    ]
  }];
  let approved=true;
  const client = {
    async rpc(name,args) {
      rpcCalls.push([name,args]);
      switch(name) {
        case 'admin_recent_games': return {data:games.slice(),error:null};
        case 'admin_delete_recent_game': {
          if (!approved) return {data:null,error:{message:'Spillet er ikke længere blandt de 10 seneste. Opdater listen.'}};
          const found=games.find(g=>g.id===args.p_game_id);
          if (!found) return {data:null,error:{message:'Spillet findes ikke længere'}};
          games=games.filter(g=>g.id!==args.p_game_id);
          return {data:found.id,error:null};
        }
        default: throw Error(`Unexpected RPC: ${name}`);
      }
    }
  };
  const context=vm.createContext({
    document:{getElementById(id){assert(els.has(id),`missing element ${id}`);return els.get(id)},createElement(){return new Node()}},
    location:{search:''},URLSearchParams,Date,Intl,console,
    window:{confirm(){return confirmation}}
  });
  vm.runInContext(code,context,{filename:'admin.js'});
  context.client=client;
  vm.runInContext('supabase=client;tournaments=[{id:"t-1",name:"Hals 2026"}];',context);
  return {els,rpcCalls,context,confirm(v){confirmation=v},approve(v){approved=v}};
}

test('SQL only exposes admin-gated recent-list and protected single-game delete RPCs',()=>{
  assert.match(html,/id="admin-recent-games"/);
  assert.match(html,/id="admin-recent-refresh-btn"/);
  assert.match(html,/id="admin-tournament-content"/);
  assert.match(sql,/create or replace function public\.admin_recent_games\(\)/i);
  assert.match(sql,/create or replace function public\.admin_delete_recent_game\(p_game_id uuid\)/i);
  assert.equal((sql.match(/if public\.admin_access_until\(\) is null/gi)??[]).length,2);
  assert.match(sql,/order by g\.created_at desc, g\.id desc\s+limit 10/gi);
  assert.match(sql,/for update;/i);
  assert.match(fs.readFileSync(path.join(root,'sql/01_schema.sql'),'utf8'),/game_id uuid not null references public\.games\(id\) on delete cascade/i);
  assert.match(sql,/insert into private\.admin_deleted_games/i);
  assert.match(sql,/revoke all on function public\.admin_delete_recent_game\(uuid\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.admin_delete_recent_game\(uuid\) to authenticated/i);
  assert.match(sql,/revoke delete on table public\.games, public\.game_participants from anon, authenticated/i);
  assert.doesNotMatch(code,/\.from\(['"]games['"]\)\.delete\(/);
});

test('only full admin can fetch and render last games, not profile-only access',async()=>{
  const a=setup();
  vm.runInContext('setAccess("profiles")',a.context);
  await vm.runInContext('fetchRecentGames()',a.context);
  assert.equal(a.rpcCalls.length,0);
  assert(a.els.get('admin-tournament-content').classList.contains('hidden'));
  vm.runInContext('setAccess("admin")',a.context);
  await vm.runInContext('fetchRecentGames()',a.context);
  assert.deepEqual(a.rpcCalls.map(x=>x[0]),['admin_recent_games']);
  const item=a.els.get('admin-recent-games').children[0];
  assert.match(item.children[0].children[0].textContent,/9 Halve ♦ · Resultat -2 · Hals 2026/);
  assert.match(item.children[0].children[2].textContent,/David \(melder\), −1,50/);
  assert.match(item.children[0].children[1].textContent,/Spillet/);
  vm.runInContext('setAccess("profiles")',a.context);
  assert.equal(a.els.get('admin-recent-games').children.length,0);
});

test('cancel leaves game intact; confirm deletes exactly one game then refreshes',async()=>{
  const a=setup();
  vm.runInContext('setAccess("admin")',a.context);
  await vm.runInContext('fetchRecentGames()',a.context);
  const deleteButton = () => a.els.get('admin-recent-games').children[0].children[1];
  await deleteButton().fire('click');
  assert.equal(a.rpcCalls.filter(x=>x[0]==='admin_delete_recent_game').length,0);
  a.confirm(true);
  await deleteButton().fire('click');
  assert.equal(a.rpcCalls.filter(x=>x[0]==='admin_delete_recent_game').length,1);
  assert.equal(a.rpcCalls.find(x=>x[0]==='admin_delete_recent_game')[1].p_game_id,'game-a');
  assert.match(a.els.get('admin-recent-games').children[0].textContent,/Ingen registrerede spil/);
  assert.match(a.els.get('admin-recent-message').textContent,/slettet/);
  assert.deepEqual(a.rpcCalls.map(x=>x[0]),[
    'admin_recent_games','admin_delete_recent_game','admin_recent_games']);
});

test('a server-side rejected delete displays an error, leaving game visible',async()=>{
  const a=setup();
  vm.runInContext('setAccess("admin")',a.context);
  await vm.runInContext('fetchRecentGames()',a.context);
  a.confirm(true);
  a.approve(false);
  await a.els.get('admin-recent-games').children[0].children[1].fire('click');
  assert.equal(a.els.get('admin-recent-games').children.length,1);
  assert.match(a.els.get('admin-recent-message').textContent,/ikke længere blandt de 10/i);
});
