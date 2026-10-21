const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname+'/..';
const scores=fs.readFileSync(root+'/assets/js/scoring.js','utf8').replace(/\bexport /g,'');
const app=fs.readFileSync(root+'/assets/js/app.js','utf8').replace(/^import \{scoreGame, formatPoints\} from '.\/scoring.js';\n/,'');
const ids=[...fs.readFileSync(root+'/index.html','utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
let els=new Map();
class Classes {constructor(v=[]){this.a=new Set(v)}toggle(k,f){const should=f===undefined?!this.a.has(k):f;should?this.a.add(k):this.a.delete(k)}contains(k){return this.a.has(k)}add(k){this.a.add(k)}remove(k){this.a.delete(k)}}
class Node {constructor(id){this.id=id;this.classList=new Classes(['call-step','caller-step','tricks-step','vip-step','trump-step','partner-step','result-step','review-panel','password-panel','success-panel'].includes(id)?['hidden']:[]);this.children=[];this.handlers={};this.style={};this.checked=false;this.textContent='';this.disabled=false;this.value='';}set className(x){this.classList=new Classes(x.split(' '))}get className(){return [...this.classList.a].join(' ')}addEventListener(name,fn){(this.handlers[name]??=[]).push(fn)}click(){(this.handlers.click??[]).forEach(f=>f())}replaceChildren(...xs){this.children=[...xs]}append(...xs){this.children.push(...xs)}setAttribute(n,v){this[n]=v}scrollIntoView(){}focus(){}}
for(const id of ids) els.set(id,new Node(id));
const doc={getElementById(id){if(!els.has(id))throw Error('Unknown element '+id);return els.get(id)},createElement(tag){return new Node(tag)}};
const globals={document:doc,window:{matchMedia:()=>({matches:true}),scrollTo(){}},location:{search:'?preview=1'},console,Date,Intl,crypto:require('crypto').webcrypto,URLSearchParams,setTimeout(cb){cb();return 1},clearTimeout(){}};
vm.runInNewContext(scores+'\n'+app,globals,{filename:'app-and-scoring.js'});
function byText(node,label){if(node.textContent===label && node.handlers.click)return node;for(const n of node.children){const x=byText(n,label);if(x)return x;}return null;}
function click(id,label){const button=byText(els.get(id),label);assert(button,`${id} must contain ${label}`);button.click()}
const chosen=['David','Gustav','Johan','Samuel'];
for(const n of chosen)click('players-options',n);
click('call-options','Halve');click('caller-options','Johan');click('tricks-options','9');click('trump-options','♦️ Ruder');click('partner-options','David');click('result-options','0');
assert(!els.get('review-panel').classList.contains('hidden'));
let text=els.get('payout-preview').children[1].children.filter((v,i)=>i%2===1).map(x=>x.textContent);
assert.equal(JSON.stringify(text),JSON.stringify(['+0,5','−0,5','+0,5','−0,5']),text);
console.log('Review payout preview test passed',text);
