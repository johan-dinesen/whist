import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreGame,formatPoints} from '../assets/js/scoring.js';
const ids = ['David','Gustav','Johan','Samuel'];
const std = (callType, tricks, score, caller='Johan', partner='David', vipDepth=null) =>
  ({playerIds:ids, callType, tricks, score, callerIds:[caller], partnerId:partner, vipDepth, soloResults:{}});
const solo = (callType, results) => ({
  playerIds:ids,callType,callerIds:Object.keys(results),soloResults:results,partnerId:null,tricks:null,score:null
});
function got(obj) { return Object.fromEntries(scoreGame(obj)); }
function balanced(obj) { const amounts=Object.values(got(obj));assert.equal(Math.round(amounts.reduce((a,b)=>a+b,0)*100),0); }
test('9 Halve 0 = 0.5 for team, -0.5 for defenders', () => {
  assert.deepEqual(got(std('halve',9,0)),{David:.5,Gustav:-.5,Johan:.5,Samuel:-.5});
});
test('normal prices, doubling and score increments', () => {
  assert.equal(got(std('almindelig',9,0)).David,.3);
  assert.equal(got(std('gode',9,0)).David,.4);
  assert.equal(got(std('halve',9,0)).David,.5);
  assert.equal(got(std('vip',9,0,'Johan','David',1)).David,.6);
  assert.equal(got(std('almindelig',10,0)).David,.6);
  assert.equal(got(std('halve',10,0)).David,1.0); // Inconsistent 0.8 example intentionally NOT used.
  assert.equal(got(std('halve',11,0)).David,2.0);
  assert.equal(got(std('halve',10,1)).David,1.5);
  assert.equal(got(std('halve',10,2)).David,2.0);
  assert.equal(got(std('halve',10,-1)).David,-1.0);
  assert.equal(got(std('almindelig',9,-2)).David,-.45);
  assert.equal(got(std('almindelig',9,-3)).David,-.6);
});
test('VIP depth applied after bid and score',()=>{
  assert.equal(got(std('vip',9,-2,'Johan','David',3)).David,-2.7);
  assert.equal(got(std('vip',10,1,'Johan','David',2)).David,3.6);
});
test('Solo one win',()=>{
  assert.deepEqual(got(solo('sol',{David:'Vundet (0 stik)'})),{David:.3,Gustav:-.1,Johan:-.1,Samuel:-.1});
});
test('Two solo callers both win -> +0.2 each',()=>{
  assert.deepEqual(got(solo('sol',{David:'Vundet (1 stik)',Johan:'Vundet (0 stik)'})),{David:.2,Gustav:-.2,Johan:.2,Samuel:-.2});
});
test('Two solo callers win and lose -> +0.4/-0.4, rest 0',()=>{
  assert.deepEqual(got(solo('sol',{David:'Vundet (0 stik)',Johan:'Tabt'})),{David:.4,Gustav:0,Johan:-.4,Samuel:0});
});
test('two solo callers both lose',()=>{
  assert.deepEqual(got(solo('sol',{David:'Tabt',Johan:'Tabt'})),{David:-.2,Gustav:.2,Johan:-.2,Samuel:.2});
});
test('four callers, mixed results; all call values',()=>{
  for(const call of ['sol','ren_sol','bordlaegger','ren_bordlaegger']) {
    const obj=solo(call,{David:'Vundet',Gustav:'Tabt',Johan:'Vundet',Samuel:'Tabt'});
    balanced(obj);
  }
});
test('Legacy self-partner case remains zero sum',()=>{
  const result=got(std('almindelig',9,0,'David','David'));
  assert.deepEqual(result,{David:.9,Gustav:-.3,Johan:-.3,Samuel:-.3});
});
test('All sample settlements are zero sum',()=>{
  for(const call of ['almindelig','gode','halve','vip']) for(const score of [-7,-2,-1,0,1,4]) {
    balanced(std(call,12,score,'Johan','Gustav',call==='vip'?3:null));
  }
});
test('Points Danish formatting',()=>{
  assert.equal(formatPoints(-.5),'−0,5');
  assert.equal(formatPoints(.05),'+0,05');
  assert.equal(formatPoints(0),'0,0');
});
