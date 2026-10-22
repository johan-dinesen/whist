import assert from 'node:assert/strict';
import {normalizeHandsResponse, formatHandAverage} from '../assets/js/hands-model.js';
const input={
  players:[{id:'g',name:'Gustav'},{id:'d',name:'David'},{id:'j',name:'Johan'}],
  hands:[
    {label:'9Gode',call_type:'gode',count:3,average:0.67,is_solo:false,players:[
      {player_id:'g',count:2,average:0.5},{player_id:'d',count:1,average:1},{player_id:'j',count:0,average:null}
    ]},
    {label:'Sol',call_type:'sol',count:3,average:66.67,is_solo:true,players:[
      {player_id:'g',count:1,average:100},{player_id:'d',count:2,average:50}
    ]},
    {label:'13Vip3',is_solo:false,count:0,average:null,players:[]}
  ]
};
const model=normalizeHandsResponse(input);
assert.deepEqual(model.players.map(p=>p.name),['David','Gustav','Johan']);
assert.equal(model.hands.length,2);
assert.deepEqual(model.hands[0].byPlayer.map(p=>p.count),[1,2,0]);
assert.equal(formatHandAverage(0.67,false),'0,67');
assert.equal(formatHandAverage(-2,false),'-2');
assert.equal(formatHandAverage(66.67,true),'66,7 %');
assert.equal(formatHandAverage(0,true),'0 %');
assert.equal(formatHandAverage(null,false,0),'—');
assert.equal(model.hands[1].byPlayer[2].count,0);
assert.throws(()=>normalizeHandsResponse(null),/ugyldigt/);
assert.throws(()=>normalizeHandsResponse({players:{},hands:[]}),/ugyldigt/);
console.log('Hands model tests passed');
