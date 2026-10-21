const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const path = require('path');
const root = path.resolve(__dirname, '..');
let code = fs.readFileSync(path.join(root, 'assets/js/history.js'), 'utf8')
  .replace(/^import \{formatPoints\} from '.\/scoring.js';\s*/, '')
  .replace(/\binit\(\);\s*$/, '');
const html = fs.readFileSync(path.join(root, 'historik.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
class Node {
  constructor(id) {
    this.id = id; this.children = []; this.textContent = ''; this.checked = false;
    this.style = {}; this.disabled = false; this.handlers = {};
    this.classList = {has: new Set(), toggle:(c,on)=>{if(on)this.classList.has.add(c);else this.classList.has.delete(c)}};
  }
  addEventListener(name, cb) { (this.handlers[name] ??= []).push(cb); }
  setAttribute(name, value) { this[name] = value; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  click() { for(const cb of this.handlers.click ?? []) cb(); }
}
const els = new Map(ids.map(id => [id, new Node(id)]));
let rpcCalls = [];
const mockSupabase = {rpc: async (name,args) => {
  assert.equal(name, 'get_game_history_for_notes');
  rpcCalls.push(args);
  return {data:[],error:null};
}};
const context = vm.createContext({
  document: {getElementById(id) {assert(els.has(id), `Missing ${id}`);return els.get(id)},createElement: tag => new Node(tag)},
  console,Set,Map,Number,Date,Intl,setTimeout,clearTimeout,
  formatPoints: n => String(n)
});
vm.runInContext(code,context,{filename:'history.js'});
vm.runInContext(`groups = [
  {id:'a0000000-0000-4000-8000-000000000001',name:'Hals 2025'},
  {id:'b0000000-0000-4000-8000-000000000002',name:'Klitmøller 2026'}
];supabase = globalMock;drawNotes();`,vm.createContext(Object.assign(context, {globalMock: mockSupabase})));
const note = label => {
  const btn = els.get('note-options').children.find(c=>c.textContent===label);
  assert(btn,`Missing filter ${label}`);
  btn.click();
};
const tick = () => new Promise(resolve => setTimeout(resolve,5));
(async () => {
  await vm.runInContext('refreshHistory()',context);
  assert.equal(rpcCalls.at(-1).p_tournament_ids,null);
  note('Hals 2025');await tick();
  assert.deepEqual([...rpcCalls.at(-1).p_tournament_ids],['a0000000-0000-4000-8000-000000000001']);
  assert.equal(rpcCalls.at(-1).p_include_kredsspil,false);
  note('Klitmøller 2026');await tick();
  assert.equal(rpcCalls.at(-1).p_tournament_ids.length,2);
  note('Alle');await tick();
  assert.equal(rpcCalls.at(-1).p_tournament_ids,null);
  note('Kredsspil');await tick();
  assert.equal(rpcCalls.at(-1).p_tournament_ids.length,0);
  assert.equal(rpcCalls.at(-1).p_include_kredsspil,true);
  assert(!html.includes('id="from-date"') && !html.includes('id="to-date"'));
  console.log('Multi-note filtering, Kredsspil, all reset and no date inputs passed');
})().catch(err=>{console.error(err);process.exit(1)});
