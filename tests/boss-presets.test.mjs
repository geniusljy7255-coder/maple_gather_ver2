import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {addBossPreset,applyBossPresetDraft,bossRegion,loadBossPresets,saveBossPresets} from '../js/tabs/boss-presets.js';
import {advanceBossAlert,bossReference,confirmBossRegion,readBossRegion} from '../js/tabs/boss-recognition.js';

test('eight boss presets restore names and areas independently',()=>{
  const saved=new Map();
  const storage={getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value)};
  const settings=loadBossPresets(storage);
  assert.equal(settings.presets.length,1);
  assert.deepEqual(settings.presets[0].skills.map(skill=>skill.name),['어센트','블링크','홀리 파운틴','제네 무적','극딜','준극딜']);
  const region=bossRegion([1.2,.75],[.25,.5]);
  assert.deepEqual(region,{x:.25,y:.5,width:.75,height:.25});
  assert.equal(bossRegion([.2,.5],[.2,.7]),null);
  for(let i=0;i<9;i++)addBossPreset(settings);
  assert.deepEqual(settings.presets.map(preset=>preset.name),Array.from({length:8},(_,i)=>`프리셋 ${i+1}`));
  settings.active=2;
  settings.presets[2].name='검은 마법사';
  settings.presets[2].skills.find(skill=>skill.type==='burst').region=region;
  saveBossPresets(storage,settings);
  const restored=loadBossPresets(storage);
  assert.equal(restored.active,2);
  assert.deepEqual(restored.presets[2],settings.presets[2]);
  assert.equal(restored.presets[0].skills.length,6);
  assert.equal(restored.presets[0].skills.find(skill=>skill.type==='burst').region,null);
  const draft=restored.presets.map(preset=>({preset,name:preset.name}));
  draft.shift();
  draft[1].name='검마';
  assert.equal(restored.presets[restored.active].name,'검은 마법사');
  applyBossPresetDraft(restored,draft);
  assert.equal(restored.active,1);
  assert.equal(restored.presets[restored.active].name,'검마');
  draft.splice(1,1);
  applyBossPresetDraft(restored,draft);
  assert.equal(restored.presets[restored.active].name,'프리셋 2');
});

test('saved preset labels use eight characters and Ascent does not use a utility slot',()=>{
  const name='가나다라마바사아자차';
  const skills=Array.from({length:7},(_,index)=>({id:index+1,type:'utility',name}));
  skills.push({id:8,type:'utility',name:'어센트'});
  const {presets:[preset]}=loadBossPresets({getItem:()=>JSON.stringify({version:3,presets:[{name,skills}]})});
  assert.equal(preset.name,'가나다라마바사아');
  assert.equal(preset.skills.filter(skill=>skill.name==='가나다라마바사아').length,6);
  assert.equal(preset.skills.filter(skill=>skill.name==='어센트').length,1);
});

test('a selected skill region recognizes its reference and only alerts after a confirmed cooldown',()=>{
  const frame={w:32,h:32,rgba:new Uint8ClampedArray(32*32*4)};
  for(let p=0;p<frame.rgba.length;p+=4) frame.rgba.set(p%8 ? [20,90,150,255] : [3,5,8,255],p);
  const region={x:0,y:0,width:1,height:1};
  const skill={type:'burst',region,reference:bossReference(frame,region)};
  assert.ok(skill.reference);
  const ready=readBossRegion(frame,skill,'seconds');
  assert.deepEqual(ready,{kind:'ready'});
  const started=confirmBossRegion(null,{kind:'time',value:4},1000);
  const cooldown=confirmBossRegion(started,{kind:'time',value:3},2000);
  assert.equal(cooldown.deadline,5000);
  const first=confirmBossRegion(cooldown,ready,5100);
  assert.equal(first.completed,false);
  const finished=confirmBossRegion(first,ready,5800);
  assert.equal(finished.completed,true);
  assert.equal(confirmBossRegion(finished,ready,6500).completed,false);
  assert.equal(advanceBossAlert(cooldown,3999),false);
  assert.equal(advanceBossAlert(cooldown,4000),true);
  assert.equal(advanceBossAlert(cooldown,4250),false);
  const updated=confirmBossRegion(cooldown,{kind:'time',value:1},4250);
  assert.equal(advanceBossAlert(updated,4500),false);
  assert.equal(confirmBossRegion(confirmBossRegion(updated,ready,5100),ready,5800).completed,false);
});

test('confirmed boss timers survive missed reads and reject isolated cooldown jumps',()=>{
  const timer=value=>({kind:'time',value});
  let state=confirmBossRegion(null,timer(60),1000);
  state=confirmBossRegion(state,timer(59),2000);
  state=confirmBossRegion(state,{kind:'unknown'},12000);
  assert.equal(state.deadline,61000);
  state=confirmBossRegion(state,timer(10),13000);
  state=confirmBossRegion(state,timer(9),14000);
  assert.equal(state.deadline,61000);
  state=confirmBossRegion(state,timer(8),15000);
  assert.equal(state.deadline,23000);
  state=confirmBossRegion(state,timer(60),22000);
  state=confirmBossRegion(state,timer(59),23000);
  assert.equal(advanceBossAlert(state,23000),false);
  state=confirmBossRegion(state,timer(58),24000);
  assert.equal(state.deadline,82000);
  assert.equal(advanceBossAlert(state,81000),true);
});

test('only the helper that started sharing can read frames or stop the stream',async(t)=>{
  let requests=0,stopped=0;
  const track={getSettings:()=>({}),addEventListener(){},stop(){stopped++;}};
  const stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
  for (const [key,value] of Object.entries({
    navigator:{mediaDevices:{async getDisplayMedia(){requests++;return stream;}}},
    document:{createElement:()=>({style:{},async play(){},remove(){}})}
  })) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]);
  }
  const {startCapture,stopCapture,getInfo,grabFrame,onCaptureChange}=await import('../js/tabs/hunting/capture.js');
  const hunt=[],boss=[];
  onCaptureChange(info=>hunt.push(info.active));
  onCaptureChange(info=>boss.push(info.active),'boss');
  await startCapture('boss');
  assert.equal(getInfo('boss').active,true);
  assert.equal(getInfo().active,false);
  assert.equal(grabFrame(),null);
  stopCapture();
  assert.equal(stopped,0);
  await startCapture();
  assert.equal(getInfo().active,true);
  assert.equal(getInfo('boss').active,false);
  assert.equal(grabFrame('boss'),null);
  stopCapture('boss');
  stopCapture();
  assert.equal(stopped,1);
  assert.equal(requests,1);
  assert.deepEqual(hunt,[true,false]);
  assert.deepEqual(boss,[true,false]);
});

test('legacy presets hide untouched slots while keeping edited and selected slots',()=>{
  const legacy=loadBossPresets({getItem:()=>null});
  for(let i=0;i<4;i++)addBossPreset(legacy);
  legacy.active=2;
  legacy.presets[4].name='검은 마법사';
  for (const preset of legacy.presets) {
    preset.skills=preset.skills.filter(skill=>skill.name!=='제네 무적')
      .map(skill=>skill.type==='utility' ? skill : {...skill,id:skill.id-1});
  }
  const restored=loadBossPresets({getItem:()=>JSON.stringify(legacy)});
  assert.deepEqual(restored.presets.map(preset=>preset.name),['프리셋 1','프리셋 3','검은 마법사']);
  assert.equal(restored.active,1);
  assert.ok(restored.presets.every(preset=>preset.skills.some(skill=>skill.name==='제네 무적')));
});

test('the boss tab includes the nineteen buff groups and resolves every supplied icon',async()=>{
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>({})};
  try {
    const {default:boss}=await import('../js/tabs/boss.js');
    assert.equal(boss.id,'boss');
    assert.equal((boss.html.match(/data-boss-buff-group/g) ?? []).length,19);
    for(const [,src] of boss.html.matchAll(/<img src="([^"]+)"/g)) assert.ok(existsSync(new URL(src)),src);
    assert.equal((boss.html.match(/aria-label="남은 시간 미확인"/g) ?? []).length,24);
    assert.doesNotMatch(boss.html,/data-boss-add="(?:burst|semi)"/);
    for(const level of [250,275,300]) assert.match(boss.html,new RegExp(`Lv${level}의 축복`));
  } finally {
    globalThis.document=previousDocument;
  }
});
