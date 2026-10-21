const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'assets/js/history.js'), 'utf8')
  .replace(/^import \{formatPoints\} from '.\/scoring.js';\s*/, '')
  .replace(/\binit\(\);\s*$/, '');
const historyHtml = fs.readFileSync(path.join(root, 'historik.html'),'utf8');
const appHtml = fs.readFileSync(path.join(root, 'index.html'),'utf8');
const sql = fs.readFileSync(path.join(root, 'sql/08_public_history.sql'),'utf8');
assert(!historyHtml.includes('id="history-password-form"'), 'No history password prompt');
assert(!historyHtml.includes('id="unlock-history"'), 'No history unlock panel');
assert(!appHtml.includes('id="scope-options"'), 'Registration must not show a category selector');
assert(!appHtml.includes('id="scope-title"'), 'Registration must not show a category section');
assert(!sql.includes('public.is_registrar()'), 'Read permissions must not depend on registration password');
assert(sql.includes('if auth.uid() is null'), 'History read should require anonymous auth session');
assert(sql.includes('grant execute on function public.get_game_history_for_notes'), 'Read only RPC access');
const ids = [...historyHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
class Node {
  constructor(tag='') {this.children=[];this.textContent='';this.disabled=false;this.checked=false;this.handlers={};this.style={};this.classList={toggle(){}};}
  append(...x){this.children.push(...x)} replaceChildren(...x){this.children=x}
  setAttribute(k,v){this[k]=v} addEventListener(k,f){this.handlers[k]=f}
}
const elements = new Map(ids.map(id=>[id,new Node()]));
const ctx=vm.createContext({document:{getElementById:id=>elements.get(id),createElement:tag=>new Node(tag)},Date,Set,Map,Number,console,setTimeout,clearTimeout,formatPoints:()=>''});
vm.runInContext(code,ctx);
const names=vm.runInContext(`sortGroups([
 {id:'1',name:'Slettestrand 2023',created_at:'2026-10-01T10:00:00Z'},
 {id:'2',name:'Hals 2024',created_at:'2026-10-01T10:00:00Z'},
 {id:'3',name:'Helsinki 2024',created_at:'2026-10-01T10:00:00Z'},
 {id:'4',name:'Hals 2025',created_at:'2026-10-01T10:00:00Z'},
 {id:'5',name:'Klitmøller 2026',created_at:'2026-09-01T10:00:00Z'},
 {id:'6',name:'Hals 2027',created_at:'2027-01-01T10:00:00Z'},
 {id:'7',name:'Hals 2028',created_at:'2028-01-01T10:00:00Z'}
]).map(g=>g.name)`,ctx);
assert.deepEqual([...names],['Hals 2028','Hals 2027','Klitmøller 2026','Hals 2025','Helsinki 2024','Hals 2024','Slettestrand 2023']);
vm.runInContext(`groups=sortGroups([{id:'1',name:'Slettestrand 2023',created_at:'2026-01-01'}, {id:'2',name:'Klitmøller 2026',created_at:'2026-01-01'},{id:'3',name:'Hals 2027',created_at:'2027-01-01'}]); drawNotes()`,ctx);
const chips=elements.get('note-options').children.map(c=>c.textContent);
assert.deepEqual(chips,['Kredsspil','Hals 2027','Klitmøller 2026','Slettestrand 2023','Alle']);
console.log('Public read, no registration scope, tournament category sort passed');
