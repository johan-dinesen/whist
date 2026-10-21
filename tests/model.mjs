import assert from 'node:assert/strict';
import {buildScoreHistory} from '../assets/js/score-history-model.js';

const raw = {
  game_count: 4,
  players:[{id:'w',name:'William'},{id:'d',name:'David'},{id:'g',name:'Gustav'},{id:'j',name:'Johan'},{id:'s',name:'Sofus'}],
  games:[
    {index:4,payouts:[{player_id:'w',points:-1},{player_id:'d',points:1},{player_id:'g',points:1},{player_id:'j',points:-1}]},
    {index:2,payouts:[{player_id:'w',points:0.2},{player_id:'d',points:-0.2},{player_id:'g',points:0.2},{player_id:'j',points:-0.2}]},
    {index:1,payouts:[{player_id:'s',points:0.5},{player_id:'d',points:-0.5},{player_id:'g',points:-0.5},{player_id:'j',points:0.5}]},
    {index:3,payouts:[{player_id:'w',points:0.05},{player_id:'s',points:0.05},{player_id:'g',points:-0.05},{player_id:'j',points:-0.05}]}
  ]
};
const m=buildScoreHistory(raw);
assert.equal(m.gameCount,4);
assert.deepEqual(m.players.map(x=>x.name),['David','Gustav','Johan','Sofus','William']);
assert.deepEqual(m.players.find(x=>x.id==='d').series,[0,-0.5,-0.7,-0.7,0.3]);
assert.deepEqual(m.players.find(x=>x.id==='w').series,[0,0,0.2,0.25,-0.75]);
assert.deepEqual(m.players.find(x=>x.id==='s').series,[0,0.5,0.5,0.55,0.55]);
for(let i=0;i<=4;i++) assert.ok(Math.abs(m.players.reduce((v,p)=>v+p.series[i],0))<1e-10);
assert.deepEqual(buildScoreHistory({game_count:0,players:[],games:[]}),{gameCount:0,players:[]});
assert.throws(()=>buildScoreHistory({...raw,game_count:5}),/Antallet/);
assert.throws(()=>buildScoreHistory({...raw,games:[...raw.games.slice(0,3),{index:5,payouts:raw.games[3].payouts}]}),/fortløbende/);
assert.throws(()=>buildScoreHistory({...raw,games:[...raw.games.slice(0,3),{index:3,payouts:[{player_id:'w',points:0.2}]}]}),/fortløbende|mangler/);
console.log('PASS score history: chronology, continuous x, flat lines, cent precision, zero sum, empty, invalid data');
