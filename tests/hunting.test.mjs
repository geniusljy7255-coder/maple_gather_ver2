import test from 'node:test';
import assert from 'node:assert/strict';
import {createHuntModel,beginHunt,finishHunt,observeExperience,observeFragments} from '../js/tabs/hunting/hunt-model.js';
import {createRuneState,updateRune,cooldownSeconds,runePresentation,runeScanInterval} from '../js/tabs/hunting/rune-state.js';
import {observeExperienceBuff,experienceBuffGroups} from '../js/tabs/hunting/experience-buffs.js';
import {createExperienceBuffDetector,scanExperienceBuffs,matchesUnionColor} from '../js/tabs/hunting/experience-buff-detector.js';
import {freshState,advance} from '../js/tabs/hunting/tracking-state.js';
import {parseExperience,readScreenText} from '../js/tabs/hunting/screen-text.js';
import {applyTimerFormat,readDigits} from '../js/tabs/hunting/digits.js';
import {BUILTIN} from '../js/data/builtin-icons.js';
import {makeTemplate,resizeIcon,prepareFrame,detect} from '../js/tabs/hunting/matcher.js';
const exp=(percent,level=288)=>({percent,level,raw:String(Math.round(percent*1000000000))});
test('automatic start, manual finish, new session and retained history',()=>{
 const m=createHuntModel();observeExperience(m,exp(28),1000);assert.equal(m.running,false);
 observeExperience(m,exp(28.1),2000);assert.equal(m.running,true);assert.equal(m.startExp.percent,28);
 assert.ok(finishHunt(m,32000));assert.equal(m.history.length,1);
 observeExperience(m,exp(28.2),40000);assert.equal(m.startedAt,40000);assert.equal(m.startExp.percent,28.1);
 assert.equal(m.history.length,1);assert.ok(Math.abs(m.gainPercent-.1)<1e-8);
});
test('fragment deposits do not subtract earned items',()=>{
 const m=createHuntModel();observeFragments(m,23);beginHunt(m,1000,exp(28));
 observeFragments(m,25);observeFragments(m,3);observeFragments(m,5);
 assert.equal(m.fragments,4);assert.equal(m.fragmentBaseline,5);
});
test('unknown fragment reads never become zero',()=>{
 const m=createHuntModel();beginHunt(m,1000,exp(28));observeFragments(m,null);assert.equal(m.fragmentBaseline,null);
 observeFragments(m,23);assert.equal(m.fragments,0);observeFragments(m,24);assert.equal(m.fragments,1);
});
test('manual pause, restart, and newest ten records',()=>{
 const m=createHuntModel();for(let i=0;i<12;i++){beginHunt(m,1000+i*1000,exp(i));finishHunt(m,1500+i*1000);}
 assert.equal(m.history.length,10);assert.equal(m.history[0].startedAt,12000);assert.equal(m.history[9].startedAt,3000);
 assert.equal(finishHunt(m,15000),null);assert.equal(m.history.length,10);
});
test('confirmed level up accumulates percent, unconfirmed drop does not',()=>{
 const m=createHuntModel();observeExperience(m,exp(99.8),1000);observeExperience(m,exp(.2,289),2000);
 assert.ok(Math.abs(m.gainPercent-.4)<1e-8);observeExperience(m,exp(.1,289),3000);assert.ok(Math.abs(m.gainPercent-.4)<1e-8);
});
test('only persistent rune appearance notifies, and disappearance rearms',()=>{
 const s=createRuneState(),marker=found=>[{id:'rune_marker',found,mode:'scan'}];
 assert.equal(updateRune(s,marker(true),1000),false);assert.equal(updateRune(s,marker(true),1500),true);
 assert.equal(updateRune(s,marker(true),3000),false);
 updateRune(s,marker(false),4000);updateRune(s,marker(false),14001);
 assert.equal(updateRune(s,marker(true),15000),false);assert.equal(updateRune(s,marker(true),15700),true);
});
test('rune buff and cooldown never emit an alert',()=>{
 const s=createRuneState();for(const now of [1000,1250,1500])assert.equal(updateRune(s,[
 {id:'rune_blessed',found:true,mode:'track',seconds:237,confidence:1},
 {id:'rune_cooldown',found:true,mode:'track',seconds:14,confidence:1}],now),false);
 assert.equal(s.buffKind,'축복의 룬');assert.equal(s.cooldownApprox,true);
 assert.deepEqual(cooldownSeconds(599,'minutes'),{seconds:599,approx:false,mode:'seconds'});
 assert.deepEqual(cooldownSeconds(14,'seconds'),{seconds:14,approx:false,mode:'seconds'});
});
test('measurement resets cannot reset independent rune state',()=>{
 const r=createRuneState(),m=createHuntModel();r.buffDeadline=100000;r.cooldownDeadline=900000;
 beginHunt(m,1000,exp(28));finishHunt(m,2000);beginHunt(m,2000,exp(28));
 assert.equal(r.buffDeadline,100000);assert.equal(r.cooldownDeadline,900000);
});
test('experience parser handles bracketed percent and large raw numbers',()=>{
 assert.equal(parseExperience('37530234185938[28.334%]').percent,28.334);
 assert.equal(parseExperience('37530234185938[28.334%]').raw,'37530234185938');
 assert.equal(parseExperience('23'),null);assert.equal(parseExperience('[128.334%]'),null);
});
test('installation early alert regression',()=>{
 const s=freshState(),r=n=>({found:true,x:10,y:20,size:32,seconds:n,confidence:n===null?0:1,digit:n===null?'absent':'visible'});
 for(let t=1000;t<5000;t+=250)advance(s,r(33-Math.floor((t-1000)/1000)),t);
 for(let t=5000;t<10000;t+=250)assert.equal(advance(s,r(null),t),false);
});
test('existing buff/slot matching across small and standard sizes remains intact',()=>{
 for(const [id,icons]of Object.entries(BUILTIN))for(const size of [16,18,20,22,24,26,28,30,32,34,36,40,48,64]){
 const img=resizeIcon(icons.buff,size),slot=resizeIcon(icons.slot,size),W=128,H=96;
 const target={thr:.78,main:makeTemplate(img.rgba,size,size),reject:makeTemplate(slot.rgba,size,size),last:null};
 for(const [kind,icon]of [['buff',img],['slot',slot]]){const pixels=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<size;y++)pixels.set(icon.rgba.subarray(y*size*4,(y+1)*size*4),((y+12)*W+20)*4);
 assert.equal(detect(prepareFrame(pixels,W,H),target).found,kind==='buff',id+kind+size);}}
});
test('new broad OCR did not change existing builtin timer readings',()=>{
 assert.equal(readDigits(BUILTIN.janus.buff.rgba,32).seconds,65);
 assert.equal(readDigits(BUILTIN.fountain.buff.rgba,32).seconds,48);
});

// 이전에는 합성 데이터만 검증했으므로 실제 사용자 캡처를 통한 회귀 검사를 추가한다.
import {readPNG} from './png-fixture.mjs';
import {MONITOR_REFERENCE} from '../js/data/monitor-reference.js';
import {analyzeScreen,resetScreenMonitor} from '../js/tabs/hunting/screen-monitor.js';
const screenshot=readPNG(new URL('../icon/hunting/reference-game.png',import.meta.url));
const markerTarget=()=>({main:makeTemplate(MONITOR_REFERENCE.rune_marker.rgba,12,12,true),marker:true,thr:.85,last:null});
test('game frame reads exp and fragment count',()=>{
 resetScreenMonitor();const F=prepareFrame(screenshot.rgba,screenshot.w,screenshot.h);
 const icon=MONITOR_REFERENCE.fragments_icon,hit=detect(F,{main:makeTemplate(icon.rgba,24,24,true),thr:.86,last:null});
 assert.equal(hit.found,true);
 let out;for(const t of [1000,6000])out=analyzeScreen(F,[{id:'fragments_icon',...hit}],t);
 assert.equal(out.exp.value.percent,28.693);assert.equal(out.exp.value.raw,'38003778803410');assert.equal(out.fragments.value,23);
});
test('window capture reads the first EXP value with a tinted bar and bottom border',()=>{
 const border=5, w=screenshot.w, h=screenshot.h+border;
 const rgba=new Uint8ClampedArray(w*h*4);
 rgba.set(screenshot.rgba);
 for(let y=screenshot.h-11;y<screenshot.h-1;y++)for(let x=570;x<797;x++){
  const p=(y*w+x)*4;
  if(Math.min(...rgba.subarray(p,p+3))>155)rgba.set([155,137,129,255],p);
  else if(x<690)rgba.set([141,38,34,255],p);
  else rgba.set([50,139,38,255],p);
 }
 for(let y=screenshot.h;y<h;y++)for(let x=0;x<w;x++)rgba.set([165,165,165,255],(y*w+x)*4);
 resetScreenMonitor();
 const result=analyzeScreen(prepareFrame(rgba,w,h),[],1000);
 assert.equal(result.exp.value?.raw,'38003778803410');
});
test('stationary EXP stays readable when the opening percent bracket disappears',()=>{
 const {w,h}=screenshot;
 const rgba=screenshot.rgba.slice();
 for(let y=h-11;y<h-4;y++)for(let x=714;x<718;x++)rgba.set([20,20,20,255],(y*w+x)*4);
 const frame=prepareFrame(rgba,w,h);
 resetScreenMonitor();
 for(const time of [1000,1600]){
  const {exp}=analyzeScreen(frame,[],time);
  assert.equal(exp.value?.raw,'38003778803410');
  assert.equal(exp.value?.percent,null);
 }
});
test('shared EXP is read when the bar color boundary widens a digit',()=>{
 const strip=readPNG(new URL('./exp-color-boundary.png',import.meta.url));
 const w=1368,h=80,rgba=new Uint8ClampedArray(w*h*4);
 const left=Math.floor((w-strip.w)/2);
 for(let y=0;y<strip.h;y++){
  const row=y*strip.w*4;
  rgba.set(strip.rgba.subarray(row,row+strip.w*4),((h-strip.h+y)*w+left)*4);
 }
 resetScreenMonitor();
 const frame={w,h,sourceHeight:800,rgba};
 for(const time of [1000,1750]){
  const {exp}=analyzeScreen(frame,[],time);
  assert.equal(exp.value?.raw,'61158328523525');
  assert.equal(exp.value?.percent,46.174);
 }
});
test('stationary EXP can be read above a window border that covers the bottom glyph row',()=>{
 const {w,h}=screenshot;
 const rgba=screenshot.rgba.slice();
 for(let y=h-5;y<h;y++)for(let x=0;x<w;x++)rgba.set([245,223,0,255],(y*w+x)*4);
 const frame=prepareFrame(rgba,w,h);
 resetScreenMonitor();
 for(const time of [1000,1600]){
  const {exp}=analyzeScreen(frame,[],time);
  assert.equal(exp.value?.raw,'38003778803410');
  assert.equal(exp.value?.percent,28.693);
  assert.equal(exp.box.tone,'exp-event-clipped');
 }
});
test('stationary EXP is tracked across capture sizes and fractional text scaling',()=>{
 for(const [w,h,scale,inset] of [[1366,768,1,26],[1600,900,1.25,34],[1920,1080,1.5,40],[2560,1440,2,46]]){
  const rgba=new Uint8ClampedArray(w*h*4);
  const bandWidth=Math.round(screenshot.w*.28*scale),bandHeight=Math.round(15*scale);
  const left=Math.round(w/2-screenshot.w*.14*scale),top=h-inset-bandHeight;
  for(let y=0;y<bandHeight;y++)for(let x=0;x<bandWidth;x++){
   const srcX=Math.round(screenshot.w*.36)+Math.floor(x/scale);
   const srcY=screenshot.h-15+Math.floor(y/scale);
   const src=(srcY*screenshot.w+srcX)*4;
   rgba.set(screenshot.rgba.subarray(src,src+4),((top+y)*w+left+x)*4);
  }
  const frame=prepareFrame(rgba,w,h);
  resetScreenMonitor();
  for(const time of [1000,1600]){
   const {exp}=analyzeScreen(frame,[],time);
   assert.equal(exp.value?.raw,'38003778803410',`${w} × ${h}`);
   assert.equal(exp.value?.percent,28.693);
  }
 }
});
test('window EXP worker reads a cropped first frame after each share reconnect',async()=>{
 const previousSelf=globalThis.self,previousPost=globalThis.postMessage;
 const messages=[];
 globalThis.self={};
 globalThis.postMessage=message=>messages.push(message);
 try {
  await import('../js/tabs/hunting/experience.worker.js');
  const {w,h:sourceHeight}=screenshot,h=80;
  for(const [generation,t] of [[1,1000],[2,5000]]){
   const buffer=screenshot.rgba.slice((sourceHeight-h)*w*4).buffer;
   globalThis.self.onmessage({data:{generation,t,w,h,sourceHeight,buffer}});
   const {monitor}=messages.at(-1);
   assert.equal(monitor.exp.value.raw,'38003778803410');
   assert.equal(monitor.exp.previous,undefined);
   assert.equal(monitor.exp.box.y,785);
   assert.equal(messages.at(-1).generation,generation);
  }
 } finally {
  globalThis.self=previousSelf;
  globalThis.postMessage=previousPost;
 }
});
test('actual minimap rune is found and removing it produces no false rune',()=>{
 const frame=prepareFrame(screenshot.rgba,screenshot.w,screenshot.h);const r=detect(frame,markerTarget());
 assert.equal(r.found,true);
 const pixels=new Uint8ClampedArray(screenshot.rgba);
 for(let y=r.y;y<r.y+r.size;y++)for(let x=r.x;x<r.x+r.size;x++)pixels.set([30,35,40,255],(y*screenshot.w+x)*4);
 assert.equal(detect(prepareFrame(pixels,screenshot.w,screenshot.h),markerTarget()).found,false);
});
test('small rune detection works at a moved location and on a different background',()=>{
 const pixels=new Uint8ClampedArray(320*240*4);for(let p=0;p<pixels.length;p+=4)pixels.set([20,40,60,255],p);
 const icon=MONITOR_REFERENCE.rune_marker;
 for(let y=0;y<12;y++)for(let x=0;x<12;x++){const p=(y*12+x)*4;if(icon.rgba[p+3])pixels.set(icon.rgba.subarray(p,p+4),((y+81)*320+x+203)*4);}
 const r=detect(prepareFrame(pixels,320,240),markerTarget());assert.equal(r.found,true);assert.equal(r.x,203);assert.equal(r.y,81);
});
test('raw experience increasing starts hunting even while rounded percentage is unchanged',()=>{
 const m=createHuntModel();observeExperience(m,{percent:28.693,raw:'38003778803410'},1000);
 observeExperience(m,{percent:28.693,raw:'38003778803411'},2000);
 assert.equal(m.running,true);assert.equal(m.startedAt,2000);assert.equal(m.gainPercent,0);
 observeExperience(m,{percent:28.693,raw:'38003778803412'},25000);
 assert.equal(m.running,true);
});

test('percent changes alone do not start hunting; unreadable percent does not block raw increments',()=>{
 const m=createHuntModel();observeExperience(m,{raw:'38003778803410',percent:28.693},1000);
 observeExperience(m,{raw:'38003778803410',percent:28.694},1600);assert.equal(m.running,false);
 observeExperience(m,{raw:'38003778803411',percent:null},2200);assert.equal(m.running,true);
 assert.equal(m.lastGainAt,2200);assert.equal(m.currentExp.raw,'38003778803411');
});
test('a missing start percent preserves the first raw EXP and counts the first gain',()=>{
 const m=createHuntModel();
 observeExperience(m,{raw:'1400000000',percent:null},1000);
 observeExperience(m,{raw:'1400000001',percent:null},1600);
 assert.equal(m.startedAt,1600);
 assert.equal(m.startExp.raw,'1400000000');
 assert.equal(m.gainRaw,'1');
 observeExperience(m,{raw:'1400000001',percent:79.9},2200);
 assert.equal(m.startExp.percent,79.9);
 observeExperience(m,{raw:'1400000010',percent:79.95},2800);
 observeExperience(m,{raw:'1400000011',percent:null},3400);
 assert.equal(m.startExp.raw,'1400000000');
 assert.equal(m.gainRaw,'11');
 assert.equal(finishHunt(m,4000).gainPercent,.05);
});
test('raw number parsing is independent of percent and rejects missing middle digits',()=>{
 assert.equal(parseExperience('38,003,778,803,410[??.?%]').raw,'38003778803410');
 assert.equal(parseExperience('38,003,778,803,410').percent,null);
 assert.equal(parseExperience('38,003,?78,803,410[28.693%]').raw,null);
 assert.equal(parseExperience('28.693%'),null);
});
test('actual screenshot raw-only frames start hunting and survive absent percent',()=>{
 const pixels=screenshot.rgba.slice();
 for(let y=screenshot.h-11;y<screenshot.h-2;y++)for(let x=714;x<772;x++)pixels.set([20,20,20,255],(y*screenshot.w+x)*4);
 resetScreenMonitor();const first=prepareFrame(pixels,screenshot.w,screenshot.h);
 const initial=analyzeScreen(first,[],1000).exp.value;
 assert.equal(initial.raw,'38003778803410');assert.equal(initial.percent,null);
 const m=createHuntModel();observeExperience(m,initial,1000);assert.equal(m.running,false);
 for(let y=screenshot.h-10;y<screenshot.h-4;y++)for(let x=705;x<710;x++)pixels.set([20,20,20,255],(y*screenshot.w+x)*4);
 for(let y=screenshot.h-10;y<screenshot.h-4;y++)for(let x=701;x<703;x++){const p=(y*screenshot.w+x)*4;pixels.set(screenshot.rgba.subarray(p,p+4),(y*screenshot.w+x+6)*4);}
 const next=analyzeScreen(prepareFrame(pixels,screenshot.w,screenshot.h),[],2200).exp.value;
 assert.equal(next.raw,'38003778803411');observeExperience(m,next,2200);assert.equal(m.running,true);
});
test('cooldown classifier rejects the colored rune buff and accepts the gray icon',()=>{
 const gray=readPNG(new URL('../icon/hunting/rune-cooldown.png',import.meta.url));
 const blue=readPNG(new URL('../icon/hunting/rune-normal.png',import.meta.url));
 const t={main:makeTemplate(gray.rgba,32,32,'cooldown'),colorMode:'gray',thr:.85,last:null};
 for(const [img,expected]of [[blue,false],[gray,true]]){
  const rgba=new Uint8ClampedArray(96*80*4);for(let y=0;y<32;y++)rgba.set(img.rgba.subarray(y*128,(y+1)*128),((y+20)*96+30)*4);
  assert.equal(detect(prepareFrame(rgba,96,80),t).found,expected);
 }
 const blank=readDigits(gray.rgba,32,{min:1,area:[.03,.56,.75,.97],dark:true});assert.equal(blank.seconds,null);
});
test('a yellow central countdown keeps a gray rune in the cooldown class at FHD scale',()=>{
 const gray=resizeIcon(readPNG(new URL('../icon/hunting/rune-cooldown.png',import.meta.url)),45);
 const blue=resizeIcon(readPNG(new URL('../icon/hunting/rune-normal.png',import.meta.url)),45);
 const pixels=gray.rgba.slice();
 for(let y=16;y<29;y++)for(let x=14;x<30;x++) {
  if(x%4===0 || y%6===0) pixels.set([255,240,0,255],(y*45+x)*4);
 }
 const frame=prepareFrame(pixels,45,45),last={x:0,y:0};
 const grayHit=detect(frame,{main:makeTemplate(gray.rgba,45,45,'cooldown'),colorMode:'gray',thr:.88,last});
 assert.equal(grayHit.found,true);
 assert.equal(detect(frame,{main:makeTemplate(blue.rgba,45,45),colorMode:'color',thr:.88,last}).found,false);
 const state=createRuneState();
 for(const now of [1000,1500])updateRune(state,[{id:'rune_normal',found:true,seconds:98,confidence:1,x:0,y:0}],now);
 for(const now of [2000,2500])updateRune(state,[{...grayHit,id:'rune_cooldown',seconds:97,confidence:1}],now);
 assert.equal(state.buffDeadline,0);
 assert.equal(runePresentation(state,2500).seconds,97);
});
test('single rune presentation follows buff, cooldown, search, appearance',()=>{
 const s=createRuneState();s.buffKind='룬';s.buffSeen=1000;s.buffDeadline=10000;s.cooldownSeen=1000;s.cooldownDeadline=20000;
 assert.equal(runePresentation(s,2000).label,'룬 버프 적용 중');assert.equal(runePresentation(s,2000).seconds,8);
 assert.equal(runePresentation(s,11000).label,'룬 재사용 대기');
 assert.equal(runePresentation(s,21000).label,'미니맵 탐색 중');
 s.markerSeen=22000;assert.equal(runePresentation(s,22500).label,'룬이 나타났습니다');
});
test('same-location buff/cooldown cannot share a timer and repeated minute reading does not freeze timer',()=>{
 const s=createRuneState();for(const t of [1000,1250,1500])updateRune(s,[
 {id:'rune_normal',found:true,mode:'track',seconds:237,confidence:1,x:100,y:10,size:32},
 {id:'rune_cooldown',found:true,mode:'track',seconds:237,confidence:1,x:100,y:10,size:32}],t);
 assert.ok(s.buffDeadline>0);assert.equal(s.cooldownDeadline,0);
 for(const t of [2000,2250,2500])updateRune(s,[{id:'rune_cooldown',found:true,mode:'track',seconds:14,confidence:1,x:140,y:10,size:32}],t);
 const end=s.cooldownDeadline;assert.ok(end>0);
 for(const t of [3000,3250,3500])updateRune(s,[{id:'rune_cooldown',found:true,mode:'track',seconds:14,confidence:1,x:140,y:10,size:32}],t);
 assert.equal(s.cooldownDeadline,end);
});

test('experience follows a game window offset inside a larger share',()=>{
 const w=screenshot.w+280,h=screenshot.h+320,rgba=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<screenshot.h;y++){
  const row=y*screenshot.w*4;
  rgba.set(screenshot.rgba.subarray(row,row+screenshot.w*4),((y+35)*w+123)*4);
 }
 resetScreenMonitor();
 const frame=prepareFrame(rgba,w,h);
 analyzeScreen(frame,[],1000);
 assert.equal(analyzeScreen(frame,[],1600).exp.value.raw,'38003778803410');
});

test('custom expiry survives scan misses until a fresh countdown is confirmed',()=>{
 const tr={...freshState(),id:'job-1',deadline:1000,lastReadAt:500};
 const miss={found:false,mode:'wait'};
 advance(tr,miss,1200);
 advance(tr,miss,4000);
 assert.equal(tr.needsReinstall,true);
 const hit={found:true,x:10,y:20,size:32,confidence:1,digit:'visible'};
 advance(tr,{...hit,seconds:30},4250);
 assert.equal(tr.needsReinstall,true);
 advance(tr,{...hit,seconds:29},4750);
 assert.equal(tr.needsReinstall,false);
 assert.equal(tr.state,'active');
});

test('built-in installers retain expiry across search gaps and clear it on a new countdown',()=>{
 for (const id of ['janus','fountain']) {
   const tr={...freshState(),id,deadline:1000,alerted:true};
   advance(tr,{found:false},1100);
   advance(tr,{found:false},4000);
   assert.equal(tr.needsReinstall,true);
   const hit={found:true,x:10,y:20,size:32,confidence:1,digit:'visible'};
   advance(tr,{...hit,seconds:30},4250);
   advance(tr,{...hit,seconds:30},4750);
   assert.equal(tr.needsReinstall,true);
   advance(tr,{...hit,seconds:29},5250);
   assert.equal(tr.needsReinstall,false);
   assert.equal(tr.alerted,false);
 }
});

test('custom timer OCR removes yellow pixels belonging to the skill art',()=>{
 const size=32,background=new Uint8ClampedArray(size*size*4);
 for(let i=3;i<background.length;i+=4)background[i]=255;
 const yellow=[255,235,0,255];
 for(let y=10;y<17;y++)background.set(yellow,(y*size+8)*4);
 const overlay=background.slice();
 const glyph=['01110','10001','10001','01110','10001','10001','01110'];
 for(let y=0;y<glyph.length;y++)for(let x=0;x<5;x++){
   if(glyph[y][x]==='1')overlay.set(yellow,((y+11)*size+x+14)*4);
 }
 assert.notEqual(readDigits(overlay,size).seconds,8);
 assert.equal(readDigits(overlay,size,{background,min:1}).seconds,8);
 assert.equal(readDigits(background,size,{background,min:1}).seconds,null);
});

test('confirmed installer deadline survives missed frames and reacquisition at a moved slot',()=>{
 const tr={...freshState(),id:'janus',anchor:{x:10,y:20,size:32},deadline:31000,lastAt:1000};
 assert.equal(advance(tr,{found:false},5000),false);
 assert.equal(tr.deadline,31000);
 assert.equal(tr.remaining,26);
 const hit={found:true,x:50,y:20,size:32,confidence:1,digit:'visible'};
 for (const [t,seconds] of [[5500,25],[6000,25],[6500,24]]) advance(tr,{...hit,seconds},t);
 assert.equal(tr.state,'active');
 assert.equal(tr.deadline,31000);
});

test('clear repeated custom timer readings start the countdown before the digit changes',()=>{
 const tr={...freshState(),id:'job-1'};
 const hit={found:true,x:10,y:20,size:32,confidence:.95,digit:'visible',seconds:30};
 advance(tr,hit,1000);
 assert.equal(tr.deadline,null);
 advance(tr,hit,1500);
 assert.equal(tr.remaining,30);
 assert.equal(tr.state,'active');
});

test('center strip reads a two-digit timer below gold icon decoration',()=>{
 const size=32, pixels=new Uint8ClampedArray(size*size*4), yellow=[255,235,0,255];
 for(let x=4;x<28;x++)pixels.set(yellow,(7*size+x)*4);
 const digits=[['00100','01100','00100','00100','00100','00100','01110'],
 ['01110','10000','10000','11110','10001','10001','01110']];
 digits.forEach((glyph,index)=>glyph.forEach((row,y)=>[...row].forEach((bit,x)=>{
   if(bit==='1')pixels.set(yellow,((y+11)*size+10+index*6+x)*4);
 })));
 assert.equal(readDigits(pixels,size,{area:[.16,.31,.84,.69],min:1,aligned:true}).seconds,16);
});

test('rune marker survives intermittent misses and longest buff precedes cooldown',()=>{
 const s=createRuneState();
 const marker=found=>({id:'rune_marker',found,mode:'scan'});
 updateRune(s,[marker(true)],1000);
 updateRune(s,[marker(false)],2000);
 assert.equal(runePresentation(s,8000).label,'룬이 나타났습니다');
 updateRune(s,[marker(false)],8500);
 assert.equal(runePresentation(s,8500).label,'룬 버프 탐색 중');
 const reading=(id,seconds)=>({id,found:true,mode:'track',seconds,confidence:1});
 for(const now of [9000,9500]) updateRune(s,[reading('rune_normal',30),reading('rune_blessed',219),reading('rune_cooldown',14)],now);
 assert.equal(runePresentation(s,9500).seconds,219);
 assert.equal(runePresentation(s,s.buffDeadline+1).label,'룬 재사용 대기');
 assert.equal(runePresentation(s,s.cooldownDeadline+1).label,'미니맵 탐색 중');
});

test('a longer rune timer from the same template replaces a confirmed short effect',()=>{
 const state=createRuneState();
 const buff=(x,seconds)=>({id:'rune_normal',found:true,x,y:58,size:45,seconds,confidence:1});
 for(const now of [1000,1500]) updateRune(state,[buff(1647,152)],now);
 assert.equal(runePresentation(state,1500).seconds,152);
 updateRune(state,[buff(1647,151),buff(1692,241)],2000);
 updateRune(state,[buff(1647,150),buff(1692,240)],3000);
 assert.equal(runePresentation(state,3000).seconds,240);
});

test('a confirmed minute rune timer rejects spurious short centered seconds',()=>{
 const state=createRuneState();
 const read=(seconds,unit)=>[{id:'rune_cooldown',found:true,seconds,unit,confidence:1}];
 updateRune(state,read(14,'minutes'),1000);
 updateRune(state,read(14,'minutes'),1500);
 updateRune(state,read(11,'seconds'),2000);
 updateRune(state,read(10,'seconds'),3000);
 assert.equal(runePresentation(state,3000).seconds,839);
 assert.equal(cooldownSeconds(10,null,'seconds').seconds,10);
 assert.equal(cooldownSeconds(10,null,'minutes').seconds,600);
});
test('confirmed rune cooldown stays in PiP despite later colored buff candidates',()=>{
 const s=createRuneState();
 const gray=(seconds)=>({id:'rune_cooldown',found:true,chroma:{},unit:'seconds',seconds,confidence:1,x:100,y:16,size:32});
 for (const t of [1000,1500]) updateRune(s,[gray(223)],t);
 const deadline=s.cooldownDeadline;
 for (const t of [20000,21000]) updateRune(s,[{...gray(203),id:'rune_normal',x:135}],t);
 assert.equal(s.buffDeadline,0);
 assert.equal(s.cooldownDeadline,deadline);
 assert.equal(runePresentation(s,21500).seconds,203);
 assert.equal(runePresentation(s,21500).approx,false);
 assert.equal(runeScanInterval(s,21500),30000);
 s.cooldownApprox=true;
 assert.equal(runeScanInterval(s,21500),30000);
 s.cooldownSamples.push({n:203,t:21500});
 assert.equal(runeScanInterval(s,21500),0);
 s.cooldownApprox=false;
 assert.equal(runeScanInterval(s,deadline-8000),0);
 for (const t of [deadline+100,deadline+600]) updateRune(s,[{...gray(120),id:'rune_normal'}],t);
 assert.ok(s.buffDeadline>deadline);
 s.cooldownDeadline=s.buffDeadline+600000;
 assert.equal(runeScanInterval(s,s.buffDeadline-8000),0);
});

test('experience buff groups keep individual deadlines and replace only confirmed mutually exclusive buffs',()=>{
 const active=(file,seconds,approx=false,multiplier=null)=>({file,seconds,approx,multiplier});
 const confirm=(state,hit,t)=>observeExperienceBuff(observeExperienceBuff(state,hit,t),hit,t+500);
 let bonus=confirm(null,active('mvp50',1800,true),1000);
 const multiplier=confirm(null,active('coupon',1800,true,3),6000);
 assert.equal(experienceBuffGroups.length,8);
 assert.equal(multiplier.multiplier,3);
 assert.equal(multiplier.deadline-bonus.deadline,5000);
 bonus=observeExperienceBuff(bonus,active('mvp70',1800,true),10000);
 assert.equal(bonus.file,'mvp50');
 bonus=observeExperienceBuff(bonus,active('mvp70',1800,true),10500);
 assert.equal(bonus.file,'mvp70');
 bonus=observeExperienceBuff(bonus,active('mvp70',599),1211000);
 assert.equal(bonus.approx,false);
 assert.equal(bonus.deadline,1810000);
 assert.equal(multiplier.deadline,1806500);
});
test('experience buff HUD reads two icons with separate visible minute timers',()=>{
 const assets=[['bonus','추가_경험치_50%'],['vip','VIP_버프_경험치']].map(([group,file])=>({
  group,file,main:readPNG(new URL('../icon/buff/'+encodeURIComponent(file)+'.png',import.meta.url))
 }));
 const w=640,h=420;
 const createFrame=(withVip,withTimer=true)=>{
  const rgba=new Uint8ClampedArray(w*h*4);
  for (const [i,{main}] of assets.entries()) {
   if (i && !withVip) continue;
   const x=510+i*42;
   for(let y=0;y<32;y++)rgba.set(main.rgba.subarray(y*128,(y+1)*128),((y+10)*w+x)*4);
   if(!withTimer) continue;
   if(!i) for(let y=33;y<42;y++) for(let col=0;col<32;col++){
    rgba.set([24,35,52,255],(y*w+x+col)*4);
   }
   const digits=i ? ['11110/00001/00001/01110/00001/00001/11110','01110/10001/10011/10101/11001/10001/01110'] :
     ['01110/10001/00001/00010/00100/01000/11111','01110/10001/10001/01111/00001/00001/01110'];
   for(const [j,glyph] of digits.entries())for(const [y,row] of glyph.split('/').entries()) {
    for(const [col,bit] of [...row].entries()) {
     rgba.set(bit==='1'?[255,255,255,255]:[30,30,30,255],((y+(i?32:34))*w+x+(i?3:1)+j*6+col)*4);
    }
   }
  }
  return prepareFrame(rgba,w,h);
 };
 const crop=(frame,x,y,width,height)=>{
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let row=0;row<height;row++){
   const from=((y+row)*frame.w+x)*4;
   rgba.set(frame.rgba.subarray(from,from+width*4),row*width*4);
  }
  return {frame:prepareFrame(rgba,width,height)};
 };
 const detector=createExperienceBuffDetector(assets);
 const originalTemplate=makeTemplate(assets[0].main.rgba,32,32,'wide-timer');
 const originalHit=detect(createFrame(false),{main:originalTemplate,thr:.86,minColor:.86,last:{x:510,y:10}},
   {allowScan:false,trackRadius:0});
 assert.equal(originalHit.found,false);
 for(const t of [1000,1500,5000,5500]) scanExperienceBuffs(detector,createFrame(t>=5000),t,crop);
 assert.equal(detector.records.bonus.deadline,1741500);
 assert.equal(detector.records.vip.deadline,1805500);
 assert.equal(detector.records.bonus.approx,true);
 const untimed=createExperienceBuffDetector(assets);
 for(const t of [1000,4000,7000]) scanExperienceBuffs(untimed,createFrame(true,false),t,crop);
 assert.equal(untimed.records.bonus.seenAt,7000);
 assert.equal(untimed.records.bonus.sample,null);
 assert.ok(Object.values(untimed.records).every(record=>record.deadline===0));
 const quick=createExperienceBuffDetector(assets);
 scanExperienceBuffs(quick,createFrame(false,false),1000,crop);
 const x=Math.floor(w*.48);
 const {frame:region}=crop(createFrame(true),x,0,w-x,Math.ceil(h*.18));
 region.sourceWidth=w;
 scanExperienceBuffs(quick,region,1750,crop,true);
 assert.equal(quick.records.bonus.sample.seconds,1740);
 assert.equal(quick.records.vip,undefined);
 scanExperienceBuffs(quick,region,2500,crop,true);
 assert.equal(quick.records.bonus.deadline,1742500);
 const couponOnly=createExperienceBuffDetector([assets[0],{...assets[0],group:'multiplier',file:'multiplier'}]);
 for(const t of [1000,1500]) scanExperienceBuffs(couponOnly,createFrame(false),t,crop);
 assert.ok(couponOnly.records.bonus.deadline>0);
 assert.ok(!(couponOnly.records.multiplier?.deadline>0));
 const ambiguous=createExperienceBuffDetector([
  {...assets[0],group:'experience-potion',file:'experience-potion'},
  {...assets[0],group:'wealth-potion',file:'wealth-potion'}
 ]);
 // Only one group is due, but its rival artwork must still be checked at the same slot.
 ambiguous.checked['wealth-potion']=1000;
 for(const t of [1000,1500]) scanExperienceBuffs(ambiguous,createFrame(false),t,crop);
 assert.equal(ambiguous.records['experience-potion']?.deadline,0);
});
test('union buffs require different artwork colors despite identical countdowns',()=>{
 const w=32,rgba=new Uint8ClampedArray(w*w*4);
 const fill=(color)=>{
  for(let p=0;p<rgba.length;p+=4) rgba.set(color,p);
  for(let y=13;y<20;y++)for(let x=10;x<23;x++)rgba.set([255,226,0,255],(y*w+x)*4);
 };
 const frame={w,rgba};
 fill([210,155,45,255]);
 assert.equal(matchesUnionColor(frame,0,0,w,'wealth'),true);
 assert.equal(matchesUnionColor(frame,0,0,w,'luck'),false);
 fill([90,173,56,255]);
 assert.equal(matchesUnionColor(frame,0,0,w,'luck'),true);
 assert.equal(matchesUnionColor(frame,0,0,w,'wealth'),false);
 fill([128,128,128,255]);
 assert.equal(matchesUnionColor(frame,0,0,w,'wealth'),false);
 assert.equal(matchesUnionColor(frame,0,0,w,'luck'),false);
});
test('unused buffs back off to twelve seconds between searches',()=>{
 const icon=readPNG(new URL('../icon/buff/VIP_버프_경험치.png',import.meta.url));
 const detector=createExperienceBuffDetector([{group:'vip',file:'vip',main:icon}]);
 const frame=prepareFrame(new Uint8ClampedArray(192*192*4),192,192);
 let scans=0;
 const crop=()=>{scans++;return {frame};};
 for(const t of [1000,2000,4000,5000,10000,15000,21000,22000]) scanExperienceBuffs(detector,frame,t,crop);
 assert.equal(scans,4);
 assert.equal(detector.checked.vip,22000);
 assert.equal(detector.records.vip,undefined);
});
test('compact white minute OCR accepts two thin digits in the lower left',()=>{
 const size=32,rgba=new Uint8ClampedArray(size*size*4);
 for(let y=24;y<29;y++){
  for(const x of [2,7])rgba.set([223,224,230,255],(y*size+x)*4);
 }
 const reading=readDigits(rgba,size,{area:[0,.64,.42,.96],min:10,minuteLabel:true,minGlyphHeight:.14,light:true});
 assert.equal(reading.seconds,11);
});

test('event bar OCR separates 6, 8, 3, 5 and 9 at seven pixels high',()=>{
 const glyphs=[
  ['01110','10001','10000','11110','10001','10001','01110'],
  ['01110','10001','10001','01110','10001','10001','01110'],
  ['01110','10001','00001','00110','00001','10001','01110'],
  ['11111','10000','10000','01110','00001','10001','01110'],
  ['01110','10001','10001','01111','00001','10001','01110']
 ];
 const w=glyphs.length*7,h=7,rgba=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const ink=glyphs[Math.floor(x/7)][y][x%7]==='1';
  const faintNineStroke=x===32 && (y===1 || y===2);
  rgba.set(ink ? [190,175,faintNineStroke?116:150,255] : [145,38,31,255],(y*w+x)*4);
 }
 assert.equal(readScreenText({w,h,rgba},{x:0,y:0,w,h},'exp-event').text,'68359');
});

test('event bar OCR recovers the faint upper-right stroke of 9 from the original pixels',()=>{
 const five=['11111','10000','10000','01110','00001','10001','01110'];
 const nine=['01110','10001','10001','01111','00001','10001','01110'];
 const box={x:0,y:0,w:13,h:7};
 const rgba=new Uint8ClampedArray(box.w*box.h*4);
 for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++){
  const ink=x<7 ? five[y][x]==='1' : nine[y][x-7]==='1';
  let blue=ink ? 175 : 48;
  if(x===7 && y===0) blue=145;
  if(x===11 && (y===1||y===2)) blue=94;
  rgba.set([Math.max(blue,145),Math.max(blue,90),blue,255],(y*box.w+x)*4);
 }
 assert.equal(readScreenText({...box,rgba},box,'exp-event').text,'59');
 // The same brightness can come from the bar behind a 5. Its top bar still
 // reaches the right edge, and neither digit should change.
 for(let y=1;y<=2;y++)rgba.set([145,103,103,255],(y*box.w+4)*4);
 assert.equal(readScreenText({...box,rgba},box,'exp-event').text,'59');
});

test('repeated high-digit OCR errors do not replace EXP when the percent stays fixed',()=>{
 const {w,h}=screenshot;
 const rgba=screenshot.rgba.slice();
 resetScreenMonitor();
 assert.equal(analyzeScreen(prepareFrame(rgba,w,h),[],1000).exp.value.raw,'38003778803410');
 for(let y=786;y<=791;y++) {
  const from=(y*w+743)*4;
  rgba.set(screenshot.rgba.subarray(from,from+20),(y*w+633)*4);
 }
 const mistaken=prepareFrame(rgba,w,h);
 for(const time of [1600,2200]){
  const {exp}=analyzeScreen(mistaken,[],time);
  assert.match(exp.text,/^38,009,778,803,410/);
  assert.equal(exp.value,null);
  assert.equal(exp.recheck,true);
 }
 assert.equal(analyzeScreen(prepareFrame(screenshot.rgba,w,h),[],2800).exp.value.raw,'38003778803410');
 for(let y=786;y<=791;y++) {
  const from=(y*w+726)*4;
  rgba.set(screenshot.rgba.subarray(from,from+20),(y*w+750)*4);
 }
 const realGain=prepareFrame(rgba,w,h);
 assert.equal(analyzeScreen(realGain,[],3400).exp.value,null);
 assert.equal(analyzeScreen(realGain,[],4000).exp.value.raw,'38009778803410');
});

test('confirmed cooldown survives an untimed colored candidate and a five-second scan gap',()=>{
 const state=createRuneState();
 const read=seconds=>({id:'rune_cooldown',found:true,seconds,unit:'seconds',confidence:1});
 updateRune(state,[read(375)],1000);
 updateRune(state,[read(370)],6000);
 updateRune(state,[{id:'rune_normal',found:true,seconds:null}],6500);
 assert.equal(runePresentation(state,6500).label,'룬 재사용 대기');
 assert.equal(runePresentation(state,6500).seconds,370);
});

test('countdown OCR converts minute and second notation without changing plain seconds',()=>{
 const glyphs={
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '9':['01110','10001','10001','01111','00001','00001','01110'],
  ':':['0','0','1','0','1','0','0']
 };
 function read(text,options,faintColon=false) {
   const size=32,rgba=new Uint8ClampedArray(size*size*4);
   let x=5;
   for(const char of text) {
     const glyph=glyphs[char];
     for(const [y,row] of glyph.entries())for(const [dx,ink] of [...row].entries()) {
       if(ink==='1') rgba.set(faintColon && char===':' ? [145,108,52,255] : [255,230,0,255],((y+12)*size+x+dx)*4);
     }
     x+=glyph[0].length+1;
   }
   return readDigits(rgba,size,options);
 }
 assert.equal(read('1:00').seconds,60);
 const missedColon=read('1:05',undefined,true);
 assert.equal(missedColon.seconds,105);
 const inferred=applyTimerFormat(missedColon,'clock');
 assert.equal(inferred.seconds,65);
 assert.equal(applyTimerFormat(inferred,'clock').seconds,65);
 assert.equal(applyTimerFormat({seconds:540},'clock').seconds,340);
 assert.equal(applyTimerFormat({seconds:160},'clock').seconds,null);
 assert.equal(applyTimerFormat(missedColon,'seconds').seconds,105);
 const recovered=read('1:05',{clockOnly:true,faintYellow:true},true);
 assert.equal(applyTimerFormat(recovered,'clock').seconds,65);
 assert.equal(applyTimerFormat({seconds:59},'clock').seconds,59);
 assert.equal(applyTimerFormat({seconds:14,unit:'minutes'},'clock').seconds,14);
 assert.equal(read('1:19').seconds,79);
 assert.equal(read('1:33').seconds,93);
 assert.equal(read('5:40').seconds,340);
 assert.equal(read('5:40').unit,'seconds');
 assert.equal(read('540').seconds,540);
 assert.equal(read('540',{clockOnly:true}).seconds,null);
 assert.equal(read('5:40',{clockOnly:true}).seconds,340);
 assert.equal(read('1100',{longTimer:true,area:[0,0,1,1]}).seconds,1100);
 assert.equal(read('30:00',{longTimer:true,area:[0,0,1,1]}).seconds,1800);
 assert.equal(cooldownSeconds(14,null,'minutes').seconds,840);
});

test('experience parser accepts shorter character values next to the percent',()=>{
 assert.equal(parseExperience('7,114,772[0.322%]').raw,'7114772');
 assert.equal(parseExperience('114,772[0.322%]').raw,'114772');
 assert.equal(parseExperience('114,772'),null);
});
