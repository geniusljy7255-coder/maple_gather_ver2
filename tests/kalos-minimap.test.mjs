import test from 'node:test';
import assert from 'node:assert/strict';
import {locateKalosMinimap,readKalosCharge,readKalosStars,trackKalosStars,updateKalosInterference} from '../js/tabs/kalos-minimap.js';

test('finds differently sized minimaps and isolates a red star from blue stars',()=>{
  for (const [x,y,w,h] of [[7,50,173,97],[134,86,214,115]]) {
    const frame={w:640,h:400,rgba:new Uint8ClampedArray(640*400*4)};
    const pixel=(px,py,color)=>frame.rgba.set([...color,255],(py*frame.w+px)*4);
    const white=[235,233,225];
    for (let col=x+3;col<x+w-3;col++) {
      pixel(col,y,white);
      pixel(col,y+h-1,white);
    }
    for (let row=y+3;row<y+h-3;row++) {
      pixel(x,row,white);
      pixel(x+w-1,row,white);
    }
    for (const [px,py,red] of [[x+9,y+46,false],[x+w-10,y+46,false],[x+51,y+59,true]]) {
      const color=red ? [226,90,43] : [44,179,232];
      pixel(px,py,color);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        for (let d=1;d<4;d++) pixel(px+dx*d,py+dy*d,color);
        pixel(px+dx*5,py+dy*5,white);
      }
    }
    const panel=locateKalosMinimap(frame);
    assert.deepEqual(panel,{x,y,w,h});
    assert.equal(readKalosStars(frame,panel).filter(star=>star.color==='red').length,1);
  }
});

test('alerts once for a fixed side, horizontal drone and bouncing orb',()=>{
  const type=(x,y)=>({color:'red',x,y});
  for (const [kind,path] of [
    ['left',[[.07,.42],[.07,.42],[.07,.42]]],
    ['right',[[.93,.42],[.93,.42],[.93,.42]]],
    ['drone',[[.42,.19],[.48,.19],[.55,.19],[.48,.19]]],
    ['orb',[[.28,.60],[.38,.70],[.48,.61],[.58,.51]]]
  ]) {
    let tracks=[];
    let active=[];
    const alerts=[];
    for (const [index,[x,y]] of path.entries()) {
      const result=trackKalosStars(tracks,[type(x,y)],index*250);
      tracks=result.tracks;
      const resultState=updateKalosInterference(active,result.active,result.blue);
      active=resultState.active;
      alerts.push(...resultState.alerts);
    }
    assert.deepEqual(alerts,[kind]);
  }
});

test('interference remains active across missed reads and rearms only on its blue marker',()=>{
  const start=updateKalosInterference([],['orb','left'],[]);
  assert.deepEqual(start.alerts,['orb','left']);
  assert.deepEqual(updateKalosInterference(start.active,[],[]),{active:['orb','left'],alerts:[]});
  const obscured=updateKalosInterference(start.active,['orb'],['right']);
  assert.deepEqual(obscured,{active:['orb','left'],alerts:[]});
  assert.deepEqual(updateKalosInterference(obscured.active,[],['orb']).active,['orb','left']);
  const reset=updateKalosInterference(obscured.active,[],[],{orbGone:true});
  assert.deepEqual(updateKalosInterference(reset.active,['orb'],[]),{active:['left','orb'],alerts:['orb']});
});

test('reads low and full fill in the selected charge area',()=>{
  const frame={w:40,h:40,rgba:new Uint8ClampedArray(40*40*4)};
  const paint=height=>{
    for (let y=0;y<40;y++) for (let x=0;x<40;x++) {
      frame.rgba.set(y>=40-height ? [40,164,220,255] : [70,77,82,255],(y*40+x)*4);
    }
  };
  const region={x:0,y:0,width:1,height:1};
  paint(8);
  const charge=readKalosCharge(frame,region);
  assert.ok(charge.percent>0 && charge.percent<30);
  assert.equal(charge.full,false);
  paint(40);
  assert.deepEqual(readKalosCharge(frame,region),{percent:100,full:true});
});
