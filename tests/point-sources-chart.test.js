import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pointSourceLayout, drawPointSources} from '../assets/js/point-sources-chart.js';

const player = (negative, positive = 0) => ({
  id:'william', name:'William', netPoints:positive - negative, totalGames:2,
  roles:{
    opponent:{points:-negative, games:1},
    partner:{points:positive, games:1},
    caller:{points:0, games:0},
    solo:{points:0, games:0}
  }
});

test('Fordeling uses a symmetric axis rounded UP to multiples of five', () => {
  assert.equal(pointSourceLayout([player(20.9)]).scaleMax, 25);
  assert.equal(pointSourceLayout([player(25)]).scaleMax, 25);
  assert.equal(pointSourceLayout([player(25.01)]).scaleMax, 30);
  assert.equal(pointSourceLayout([player(0, 21.4)]).scaleMax, 25);
  assert.equal(pointSourceLayout([player(0, 0)]).scaleMax, 5);
  assert.equal(pointSourceLayout([]).scaleMax, 5);
});

class FakeNode {
  constructor(tag) {
    this.tagName=tag;
    this.children=[];
    this.attributes={};
    this.style={setProperty(k,v){this[k]=v;}};
    this.classList={add() {},remove() {},contains(){return false;}};
    this.dataset={};
  }
  append(...nodes){this.children.push(...nodes); for(const n of nodes)n.parentElement=this;}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(key,val){this.attributes[key]=val;}
  addEventListener(){}
}

test('Fordeling has unnumbered quarter lines and only the extrema are labelled', () => {
  const oldDocument=globalThis.document;
  globalThis.document={
    createElement:tag=>new FakeNode(tag),
    addEventListener(){},
    removeEventListener(){}
  };
  try {
    const outer=new FakeNode('div');
    const wrap=new FakeNode('div');
    const scroll=new FakeNode('div');
    outer.append(wrap); wrap.append(scroll);
    drawPointSources({container:scroll,players:[player(20.9)],avatar:()=>new FakeNode('div')});
    const chart=scroll.children[0];
    const ticks=chart.children.filter(n => n.className?.includes('point-source-axis-tick'));
    assert.equal(ticks.length,8);
    assert.deepEqual(ticks.map(n=>n.style.top),['84%','75.25%','66.5%','57.75%','40.25%','31.5%','22.75%','14%']);
    const limits=ticks.filter(t=>t.className.includes('is-limit'));
    assert.equal(limits.length,2);
    assert.deepEqual(limits.map(t=>t.children[0].textContent),['−25','+25']);
    assert.ok(ticks.every(t=>t.className.includes('is-limit') || !t.children.length));
    const column=chart.children.find(n=>n.className?.includes('point-source-column'));
    const negativeStack=column.children.find(n=>n.className==='point-source-vertical-stack point-source-stack-negative');
    assert.equal(negativeStack.style.height,(35*20.9/25).toFixed(5)+'%');
  } finally {
    globalThis.document=oldDocument;
  }
});
