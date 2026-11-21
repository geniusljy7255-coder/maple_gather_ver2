import test from 'node:test';
import assert from 'node:assert/strict';
import {KARING_GLYPHS} from '../js/data/karing-glyphs.js';
import {correctKaringConfusion,estimateKaringGauge,karingAlertTransitions,karingBand,karingWarning,planKaringThreads,
  readKaringGauge,readKaringPanel} from '../js/tabs/karing-gauge.js';

function renderNumber(value,red,scale,redColor=[255,34,68]) {
  const frame={w:Math.round(48*scale),h:Math.round(19*scale)};
  frame.rgba=new Uint8ClampedArray(frame.w*frame.h*4).fill(24);
  const color=red ? redColor : [255,255,255];
  let left=3;
  for (const character of String(value)) {
    const [,w,h,alpha]=KARING_GLYPHS[Number(character)+(red ? 10 : 0)];
    for (let y=0;y<Math.round(h*scale);y++) for (let x=0;x<Math.round(w*scale);x++) {
      const a=parseInt(alpha[Math.floor(y/scale)*w+Math.floor(x/scale)],16)/15;
      const offset=((y+Math.round(3*scale))*frame.w+x+Math.round(left*scale))*4;
      color.forEach((channel,index)=>{frame.rgba[offset+index]=24+(channel-24)*a;});
    }
    left+=w+1;
  }
  return frame;
}

test('reads Karing sprite digits and red endpoints at different scales',()=>{
  const region={x:0,y:0,width:1,height:1};
  for (const scale of [1,1.25,1.5,2]) for (const value of [0,99,100,900,901,1000]) {
    assert.equal(readKaringGauge(renderNumber(value,value===0 || value===1000,scale),region),value,`${value} at ${scale}x`);
  }
  assert.equal(readKaringGauge(renderNumber('',false,1),region),null);
  for (const value of [465,765,515,815]) {
    assert.equal(readKaringGauge(renderNumber(value,false,1),region),value);
  }
  for (const value of [0,1000]) {
    assert.equal(readKaringGauge(renderNumber(value,true,1,[175,36,60]),region),value);
  }
});

test('resolves digit confusions using the intact gauges and prior readings',()=>{
  const screenshot={goongi:515,dool:390,hondon:295};
  assert.deepEqual(correctKaringConfusion(screenshot),{...screenshot,goongi:815});
  const ambiguous={goongi:465,dool:500,hondon:235};
  assert.deepEqual(correctKaringConfusion(ambiguous),ambiguous);
  const previous={goongi:765,dool:500,hondon:235};
  assert.deepEqual(correctKaringConfusion(ambiguous,previous),previous);
  const endpoint={goongi:0,dool:500,hondon:700};
  assert.deepEqual(correctKaringConfusion(endpoint),endpoint);
});

test('uses inclusive configurable limits and gives each gauge its attack and thread color',()=>{
  assert.deepEqual([99,100,101,899,900,901].map(value=>karingBand(value)),['low','low','normal','normal','high','high']);
  assert.equal(karingWarning('goongi',60).label,'100 미만');
  assert.equal(karingWarning('goongi',150,150).label,'150 이하');
  assert.equal(karingWarning('goongi',849,150),null);
  assert.equal(karingWarning('goongi',850,150).label,'850 이상');
  const attack=(key,value)=>karingWarning(key,value).advice;
  assert.equal(attack('goongi',100),'궁기 공격 또는 빨간색 실을 맞으세요.');
  assert.equal(attack('goongi',900),'도올 공격 또는 초록색 실을 맞으세요.');
  assert.equal(attack('dool',100),'도올 공격 또는 초록색 실을 맞으세요.');
  assert.equal(attack('dool',900),'혼돈 공격 또는 노란색 실을 맞으세요.');
  assert.equal(attack('hondon',100),'혼돈 공격 또는 노란색 실을 맞으세요.');
  assert.equal(attack('hondon',900),'궁기 공격 또는 빨간색 실을 맞으세요.');
});

test('warns once per displayed risk, including an estimated value crossing the threshold',()=>{
  const bands=new Map();
  const values={goongi:500,dool:120,hondon:500};
  assert.deepEqual(karingAlertTransitions(values,bands),[]);
  const estimate=estimateKaringGauge(values,{hondon:550});
  values[estimate.key]=estimate.value;
  const alert={key:'dool',band:'low',thread:'초록색'};
  assert.deepEqual(karingAlertTransitions(values,bands),[alert]);
  assert.deepEqual(karingAlertTransitions({...values,dool:55},bands),[]);
  assert.deepEqual(karingAlertTransitions({...values,dool:110},bands),[]);
  assert.deepEqual(karingAlertTransitions({...values,dool:100},bands),[alert]);
  assert.deepEqual(karingAlertTransitions({...values,dool:1000},bands),[]);
});

test('orders thread advice to create room before moving a second high gauge',()=>{
  assert.deepEqual(planKaringThreads({goongi:950,dool:950,hondon:500}),['노란색','초록색']);
  assert.deepEqual(planKaringThreads({goongi:765,dool:500,hondon:235}),['노란색','초록색']);
  assert.deepEqual(planKaringThreads({goongi:150,dool:500,hondon:850},150),['빨간색']);
  assert.deepEqual(planKaringThreads({goongi:500,dool:500,hondon:500}),[]);
  assert.deepEqual(planKaringThreads({goongi:1000,dool:500,hondon:500}),[]);
});

test('estimates an unread gauge from one confirmed change without overriding visible values',()=>{
  const initial={goongi:500,dool:500,hondon:500};
  assert.deepEqual(estimateKaringGauge(initial,{hondon:550}),{key:'dool',value:450});
  assert.deepEqual(estimateKaringGauge(initial,{dool:450}),{key:'hondon',value:550});
  assert.equal(estimateKaringGauge(initial,{hondon:550},{hondon:550,dool:450}),null);
  assert.equal(estimateKaringGauge(initial,{hondon:550,dool:450}),null);
  assert.equal(estimateKaringGauge(initial,{hondon:1000}),null);
  assert.equal(estimateKaringGauge({...initial,dool:0},{hondon:550}),null);
  assert.equal(estimateKaringGauge(initial,{}),null);
});

test('one selected panel maps to all three number locations at different screen positions',()=>{
  for (const [left,top,scale] of [[25,31,1],[302,156,2]]) {
    const w=920,h=600,rgba=new Uint8ClampedArray(w*h*4);
    const frame={w,h,rgba};
    const places=[[138,133,901],[16,137,99],[83,18,500]];
    for (const [x,y,value] of places) {
      const number=renderNumber(value,false,scale);
      const dx=left+(x-3)*scale,dy=top+(y-3)*scale;
      for (let row=0;row<number.h;row++) {
        rgba.set(number.rgba.subarray(row*number.w*4,(row+1)*number.w*4),((dy+row)*w+dx)*4);
      }
    }
    const panel={x:left/w,y:top/h,width:188*scale/w,height:188*scale/h};
    assert.deepEqual(readKaringPanel(frame,panel),{goongi:901,dool:99,hondon:500});
  }
});
