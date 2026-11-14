import test from 'node:test';
import assert from 'node:assert/strict';
import {createHuntModel,beginHunt,finishHunt,observeExperience,observeFragments,idleHunt} from '../js/tabs/hunting/hunt-model.js';
import {createRuneState,updateRune,cooldownSeconds,runePresentation} from '../js/tabs/hunting/rune-state.js';
import {freshState,advance} from '../js/tabs/hunting/tracking-state.js';
import {parseExperience} from '../js/tabs/hunting/screen-text.js';
import {readDigits} from '../js/tabs/hunting/digits.js';
import {BUILTIN} from '../js/data/builtin-icons.js';
import {makeTemplate,resizeIcon,prepareFrame,detect} from '../js/tabs/hunting/matcher.js';
const exp=(percent,level=288)=>({percent,level,raw:String(Math.round(percent*1000000000))});
test('automatic start, 30-second boundary, new session and retained history',()=>{
 const m=createHuntModel();observeExperience(m,exp(28),1000);assert.equal(m.running,false);
 observeExperience(m,exp(28.1),2000);assert.equal(m.running,true);assert.equal(m.startExp.percent,28);
 assert.equal(idleHunt(m,31999),null);assert.ok(idleHunt(m,32000));assert.equal(m.history.length,1);
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
 assert.equal(idleHunt(m,32000),null);assert.ok(idleHunt(m,55000));
});

test('percent changes alone do not start hunting; unreadable percent does not block raw increments',()=>{
 const m=createHuntModel();observeExperience(m,{raw:'38003778803410',percent:28.693},1000);
 observeExperience(m,{raw:'38003778803410',percent:28.694},1600);assert.equal(m.running,false);
 observeExperience(m,{raw:'38003778803411',percent:null},2200);assert.equal(m.running,true);
 assert.equal(m.lastGainAt,2200);assert.equal(m.currentExp.raw,'38003778803411');
});
test('a missing start percent uses the first complete EXP reading and keeps it across OCR misses',()=>{
 const m=createHuntModel();
 observeExperience(m,{raw:'1400000000',percent:null},1000);
 observeExperience(m,{raw:'1400000001',percent:null},1600);
 assert.equal(m.startedAt,1600);
 assert.equal(m.startExp.raw,'1400000001');
 observeExperience(m,{raw:'1400000001',percent:79.9},2200);
 assert.equal(m.startExp.percent,79.9);
 observeExperience(m,{raw:'1400000010',percent:79.95},2800);
 observeExperience(m,{raw:'1400000011',percent:null},3400);
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
