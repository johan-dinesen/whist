const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'administrering.html'),'utf8');
const sql = fs.readFileSync(path.join(root,'sql/07_administration.sql'),'utf8');
assert.match(html,/id="admin-login-panel"/);
assert.match(html,/id="admin-content"/);
assert.match(sql,/create or replace function public\.unlock_admin\(/i);
assert.match(sql,/create or replace function public\.admin_create_tournament\(/i);
assert.match(sql,/create or replace function public\.admin_set_active_tournament\(/i);
assert.match(sql,/create or replace function public\.lock_admin\(/i);
assert.match(sql,/admin_access_until\(\) is null/i);
assert.match(sql,/revoke insert,update,delete on public\.tournaments from anon, authenticated/i);

class Node {
  constructor(id='') {
    this.id=id;this.value='';this.type='';this.name='';this.checked=false;
    this.disabled=false;this.children=[];this.listeners={};this.textContent='';
    const classes=new Set(['admin-login-panel','admin-content'].includes(id)?['hidden']:[]);
    this.classList={
      contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n),
      toggle:(n,v)=>{if(v===undefined?v=!classes.has(n):v)classes.add(n);else classes.delete(n)}
    };
  }
  addEventListener(event,handler){(this.listeners[event]??=[]).push(handler)}
  async fire(event){const callbacks=this.listeners[event]??[];for(const fn of callbacks)await fn({preventDefault(){}})}
  replaceChildren(...args){this.children=args}
  append(...args){this.children.push(...args)}
}
const els=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Node(m[1])]));
const groups=[{id:'a-uuid',name:'Klitmøller 2026',is_active:true},{id:'b-uuid',name:'Hals 2025',is_active:false}];
const rpcCalls=[];
let approved=false;
const mock={
  from(name){assert.equal(name,'tournaments');return{
    select(fields){assert.equal(fields,'id,name,is_active');return{
      async order(field){assert.equal(field,'name');return{data:groups.map(g=>({...g})),error:null}}
    }}
  }},
  async rpc(name,arg){rpcCalls.push([name,arg]);switch(name){
    case 'unlock_admin': if(arg.p_password !== 'top-secret-admin')return{data:null,error:null};approved=true;return{data:new Date(Date.now()+12*3600_000).toISOString(),error:null};
    case 'admin_create_tournament': if(!approved)return{data:null,error:{message:'Administrationsadgang mangler eller er udløbet'}};
      groups.push({id:'c-uuid',name:arg.p_name,is_active:false});return{data:'c-uuid',error:null};
    case 'admin_set_active_tournament': if(!approved)return{data:null,error:{message:'Administrationsadgang mangler eller er udløbet'}};
      groups.forEach(g=>g.is_active=g.id === arg.p_tournament_id);return{data:null,error:null};
    case 'lock_admin': approved=false;return{data:null,error:null};
    default: throw Error(`Unexpected RPC ${name}`);
  }}
};
let code=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8').replace(/\binit\(\);\s*$/,'');
const context=vm.createContext({
  document:{getElementById(id){assert(els.has(id),`Unknown element ${id}`);return els.get(id)},createElement(){return new Node()}},
  console,Date,URLSearchParams,location:{search:''}
});
vm.runInContext(code,context,{filename:'admin.js'});
vm.runInContext('supabase = testClient;',Object.assign(context,{testClient:mock}));
const e = id=>{assert(els.has(id));return els.get(id)};
(async()=>{
  e('admin-password').value='incorrect';
  await e('admin-password-form').fire('submit');
  assert(e('admin-password-message').textContent.includes('Forkert kode'));
  assert(e('admin-content').classList.contains('hidden'));
  e('admin-password').value='top-secret-admin';
  await e('admin-password-form').fire('submit');
  assert(!e('admin-content').classList.contains('hidden'));
  assert(e('admin-tournament-options').children.length===3);
  assert(e('admin-save-active-btn').disabled);
  e('admin-new-name').value='Hals 2027';
  await e('admin-create-form').fire('submit');
  assert(groups.some(g=>g.name==='Hals 2027'));
  assert.equal(e('admin-tournament-options').children.length,4);
  const hals=e('admin-tournament-options').children.find(label=>label.children.find(c=>c.textContent==='Hals 2027'));
  await hals.children[0].fire('change');
  await e('admin-active-form').fire('submit');
  assert(groups.find(g=>g.name==='Hals 2027').is_active);
  const kred=e('admin-tournament-options').children[0];
  await kred.children[0].fire('change');
  await e('admin-active-form').fire('submit');
  assert(groups.every(g=>!g.is_active));
  await e('admin-lock-btn').fire('click');
  assert(e('admin-content').classList.contains('hidden'));
  assert(!approved);
  assert.deepEqual(rpcCalls.map(v=>v[0]),[
    'unlock_admin','unlock_admin','admin_create_tournament',
    'admin_set_active_tournament','admin_set_active_tournament','lock_admin']);
  console.log('Admin separate password, create, activate, Kredsspil reset and lock passed');
})().catch(e=>{console.error(e);process.exitCode=1});
