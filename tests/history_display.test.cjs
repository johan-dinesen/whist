const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets/js/history.js'), 'utf8')
  .replace(/^import \{formatPoints\} from '.\/scoring.js';\s*/, '')
  .replace(/\binit\(\);\s*$/, '');
const css = fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'historik.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(a => a[1]);
class Node {
  constructor(tag) { this.tag = tag; this.textContent = ''; this.children = []; this.classList = {list:new Set(),add:(x)=>this.classList.list.add(x),toggle:()=>{}}; this.style={}; this.checked=false; this.disabled=false; }
  replaceChildren(...xs) {this.children=xs}
  append(...xs) {this.children.push(...xs)}
  addEventListener() {}
  setAttribute() {}
}
const els = new Map(ids.map(id => [id,new Node(id)]));
const ctx = vm.createContext({
  document: {getElementById:id=>{assert(els.has(id),`Missing HTML element ${id}`);return els.get(id)},createElement:tag=>new Node(tag)},
  Set,Map,Number,Date,console,setTimeout,clearTimeout,
  formatPoints: n => n < 0 ? '−0,5' : n > 0 ? '+0,5' : '0,0'
});
vm.runInContext(js,ctx,{filename:'history.js'});
vm.runInContext("groups=[{id:'t1',name:'Hals 2025'}]",ctx);
const game = {call_type:'almindelig',tricks:9,trump:'diamonds',vip_depth:null,score:0,tournament_id:'t1',callers:'Johan',partners:'William',participants:[
  {name:'David',payout:-.5,is_guest:false},
  {name:'Gustav',payout:-.5,is_guest:false},
  {name:'Johan',payout:.5,is_guest:false},
  {name:'William',payout:.5,is_guest:false}
]};
vm.runInContext('drawTable(sample)',Object.assign(ctx,{sample:[game]}));
const headers=()=>els.get('history-head').children[0].children.map(x=>x.textContent);
const columns=()=>els.get('history-body').children[0].children.map(x=>x.textContent);
assert.deepEqual(headers().slice(0,5),['Melding','Res.','Melder','Makker','Note']);
assert.equal(columns()[0],'9Alm♦');
assert.equal(columns()[4],'Hals 2025');
assert(headers().includes('David') && headers().includes('William'));
assert(!headers().includes('Dato') && !headers().includes('Resultat'));
vm.runInContext("selectedNotes.add('t1');drawTable(sample)",ctx);
assert.deepEqual(headers().slice(0,5),['Melding','Res.','Melder','Makker','David']);
assert.equal(columns()[4],'−0,5');
assert.match(css,/\.history-table thead th\s*\{[^}]*position:sticky;[^}]*top:0/s);
assert.match(css,/\.history-table tbody tr:nth-child\(even\)\s*\{/);
assert.match(css,/\.history-table \.payout-heading,\.history-table \.payout-cell\s*\{/);
console.log('Compact results, no suit spacing, optional Note, sticky header, striped rows and narrow payouts passed');
