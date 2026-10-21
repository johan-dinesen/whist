const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const scoring=fs.readFileSync(root+'/assets/js/scoring.js','utf8').replace(/\bexport /g,'');
const app=fs.readFileSync(root+'/assets/js/app.js','utf8').replace(/^import \{scoreGame, formatPoints\} from '.\/scoring.js';\n/,'');
const html=fs.readFileSync(root+'/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
class Classes {constructor(v=[]){this.a=new Set(v)}toggle(k,f){const should=f===undefined?!this.a.has(k):f;should?this.a.add(k):this.a.delete(k)}contains(k){return this.a.has(k)}add(k){this.a.add(k)}}
class Node {constructor(id){this.id=id;this.classList=new Classes(['call-step','caller-step','tricks-step','vip-step','trump-step','partner-step','result-step','review-panel','password-panel','success-panel'].includes(id)?['hidden']:[]);this.children=[];this.handlers={};this.style={};this.checked=false;this.textContent='';this.disabled=false;this.value='';}set className(x){this.classList=new Classes(x.split(' '))}get className(){return [...this.classList.a].join(' ')}addEventListener(name,fn){(this.handlers[name]??=[]).push(fn)}click(){(this.handlers.click??[]).forEach(f=>f())}replaceChildren(...xs){this.children=[...xs]}append(...xs){this.children.push(...xs)}setAttribute(n,v){this[n]=v}scrollIntoView(){}focus(){}}
const els=new Map(ids.map(id=>[id,new Node(id)]));
const context=vm.createContext({document:{getElementById:id=>{assert(els.has(id),'missing '+id);return els.get(id)},createElement:tag=>new Node(tag)},window:{matchMedia:()=>({matches:true}),scrollTo(){}},location:{search:'?preview=1'},console,Date,Intl,crypto:require('crypto').webcrypto,URLSearchParams,setTimeout(cb){cb();return 1},clearTimeout(){}});
vm.runInContext(scoring+'\n'+app,context);
function byText(node,text){if(node.textContent===text && node.handlers.click)return node;for(const ch of node.children){const v=byText(ch,text);if(v)return v}return null}
function click(id,text){const b=byText(els.get(id),text);assert(b,`${id}: ${text}`);b.click()}
for(const name of ['David','Gustav','Johan','Samuel'])click('players-options',name);
click('call-options','Halve');click('caller-options','Johan');click('tricks-options','9');click('trump-options','♦️ Ruder');click('partner-options','David');click('result-options','0');
let activeId='a0000000-0000-4000-8000-000000000001';
let reads=0,saves=[];
const server={
  from: table=> {assert.equal(table,'tournaments');return {
    select: cols=>{assert.equal(cols,'id');return {eq: async (column,value)=>{assert.equal(column,'is_active');assert.equal(value,true);reads++;return {data:activeId?[{id:activeId}]:[],error:null}}}}
  }},
  rpc: async (name,params)=> {
    if(name==='registration_access_until')return {data:new Date(Date.now()+24*3600*1000).toISOString(),error:null};
    if(name==='register_game'){saves.push(params);return {data:'new-game-id',error:null}}
    throw Error('Unexpected RPC: '+name)
  }
};
context.server=server;
vm.runInContext('supabase=server;canSave=true;',context);
(async()=>{
 await vm.runInContext('saveGame()',context);
 assert.equal(reads,1);assert.equal(saves[0].p_tournament_id,activeId);
 assert(!els.get('success-panel').classList.contains('hidden'));
 vm.runInContext('newGame()',context);
 for(const name of ['David','Gustav','Johan','Samuel'])click('players-options',name);
 click('call-options','Halve');click('caller-options','Johan');click('tricks-options','9');click('trump-options','♦️ Ruder');click('partner-options','David');click('result-options','0');
 activeId=null;
 await vm.runInContext('saveGame()',context);
 assert.equal(reads,2);assert.equal(saves[1].p_tournament_id,null);
 assert.equal(saves.length,2);
 assert.equal(els.get('review-content').children.some(n=>n.textContent==='Spilsamling'),false);
 console.log('Automatic active tournament and Kredsspil selection at submission passed');
})().catch(e=>{console.error(e);process.exit(1)})
