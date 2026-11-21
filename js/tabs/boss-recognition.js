import {applyTimerFormat,readDigits} from './hunting/digits.js';
import {readStackCount} from './hunting/stack-count.js';
import {readCountWord} from './hunting/number-image-reader.js';
import {isAscent} from './boss-presets.js';

function sample(frame,region,size) {
  const pixels=new Uint8ClampedArray(size*size*4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const sx=Math.min(frame.w-1,Math.floor(frame.w*(region.x+(x+.5)*region.width/size)));
    const sy=Math.min(frame.h-1,Math.floor(frame.h*(region.y+(y+.5)*region.height/size)));
    const offset=(sy*frame.w+sx)*4;
    pixels.set(frame.rgba.subarray(offset,offset+4),(y*size+x)*4);
  }
  return pixels;
}

export function bossReference(frame,region) {
  const pixels=sample(frame,region,16);
  const rgb=Array.from(pixels).filter((_,index)=>index%4!==3);
  return Math.max(...rgb)-Math.min(...rgb)>=35 ? rgb : null;
}

export function readBossRegion(frame,skill,format) {
  const region=skill.region;
  const reference=skill.reference && bossReference(frame,region);
  let difference=Infinity;
  if (reference) {
    difference=reference.reduce((sum,value,index)=>sum+Math.abs(value-skill.reference[index]),0)/reference.length;
  }
  const size=Math.max(16,Math.min(80,Math.round(Math.max(frame.w*region.width,frame.h*region.height))));
  const rgba=sample(frame,region,size);
  if (isAscent(skill)) {
    const native=readStackCount(rgba,size);
    const count=native.count===null
      ? readCountWord(size===32 ? rgba : sample(frame,region,32),32,{singleCorner:true})
      : native;
    return Number.isInteger(count?.count) && count.count>=0 && count.count<=3 && count.confidence>=.9
      ? {kind:'count',value:count.count} : {kind:'unknown'};
  }
  if (difference<=3) return {kind:'ready'};
  const options={area:[.02,.20,.98,.81],min:1,longTimer:true,aligned:true,buffSeconds:true};
  for (const settings of [{...options,clockOnly:true},options,{...options,faintYellow:true}]) {
    const reading=applyTimerFormat(readDigits(rgba,size,settings),format);
    if (reading.seconds!==null && reading.confidence>=.9) return {kind:'time',value:reading.seconds};
  }
  return difference<=11 ? {kind:'ready'} : {kind:'unknown'};
}

export function confirmBossRegion(previous,reading,now) {
  const state=previous ?? {};
  if (reading.kind==='unknown') return {...state,sample:null};
  const last=state.sample;
  const compatible=last?.kind===reading.kind && now-last.at<=5000 &&
    (reading.kind==='time' ? Math.abs((now-last.at)/1000+reading.value-last.value)<=1.4 :
      last.value===reading.value);
  const sample={...reading,at:now,matches:compatible ? last.matches+1 : 1};
  const deadline=reading.kind==='time' ? now+reading.value*1000 : null;
  const inCooldown=state.kind==='time';
  const sameCooldown=inCooldown && deadline!==null && Math.abs(deadline-state.deadline)<=2000;
  const correction=inCooldown && deadline!==null && !sameCooldown;
  if (sample.matches<(correction ? 3 : 2)) return {...state,sample,completed:false};
  return {sample,kind:reading.kind,value:reading.value,at:now,
    deadline:sameCooldown ? state.deadline : deadline,
    alerted:sameCooldown && state.alerted,
    completed:state.kind==='time' && reading.kind==='ready' && !state.alerted};
}

export function advanceBossAlert(state,now) {
  if (state?.kind!=='time' || state.alerted || now<state.deadline-1000) return false;
  const sample=state.sample;
  if (sample?.kind==='time' && sample.matches>=2 && now-sample.at<=2500 &&
      sample.at+sample.value*1000>state.deadline+2000) return false;
  state.alerted=true;
  return true;
}
