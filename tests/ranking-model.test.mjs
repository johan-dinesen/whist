import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Load the pure ranking-model module without imposing Node module settings on
// the static GitHub Pages app or its hosting project.
const file = new URL('../assets/js/ranking-model.js', import.meta.url);
const js = readFileSync(file,'utf8');
const {normalizeStandings,pointShares}=await import('data:text/javascript,'+encodeURIComponent(js));
const data=[
  {player_id:'a',player_name:'David',net_points:'-1.20',games_played:5},
  {player_id:'b',player_name:'Gustav',net_points:'2.40',games_played:7},
  {player_id:'c',player_name:'Johan',net_points:'0',games_played:1},
  {player_id:'d',player_name:'Samuel',net_points:'-1.20',games_played:4},
];
const ranking=normalizeStandings(data);
assert.deepEqual(ranking.map(x=>x.name),['Gustav','Johan','David','Samuel']);
assert.equal(ranking.length,4); // Zero-point participants must not disappear
const wins=pointShares(ranking,'positive');
const losses=pointShares(ranking,'negative');
assert.equal(wins.length,1);
assert.equal(wins[0].share,1);
assert.equal(losses.length,2);
assert.equal(losses[0].share,.5);
assert.equal(losses[1].share,.5);
assert.deepEqual(pointShares([], 'positive'),[]);
assert.throws(()=>normalizeStandings([{player_id:'1',player_name:'X',net_points:'NaN',games_played:1}]));
console.log('ranking-model tests: OK');
