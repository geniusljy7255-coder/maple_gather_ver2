import test from 'node:test';
import assert from 'node:assert/strict';
import {readStackCount,advanceStackCount,advanceStackClock} from '../js/tabs/hunting/stack-count.js';
import {freshState} from '../js/tabs/hunting/tracking-state.js';
import {DEATH_BLOSSOM,jobSkills,jobIconFiles} from '../js/tabs/hunting/job-installers.js';
import {readPNG} from './png-fixture.mjs';
import {resizeIcon,makeTemplate,detect,prepareFrame} from '../js/tabs/hunting/matcher.js';
const skill='렌_매화검_3초식_예인';
const art=file=>readPNG(new URL('../icon/hunting/'+file+'.png',import.meta.url));
function countedIcon(base,count){
 const rgba=base.rgba.slice(),size=base.w;
 const font={
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['01','11','01','01','01','01','01'],
  '2':['01110','10001','00001','00010','00100','01000','11111']
 };
 const rows=[...String(count)].map(c=>font[c]);
 const width=rows.reduce((w,g)=>w+g[0].length+1,0)-1;
 for(let y=22;y<32;y++)for(let x=17;x<32;x++)rgba.set([20,20,30,255],(y*size+x)*4);
 let pen=31-width;
 for(const g of rows){for(let y=0;y<7;y++)for(let x=0;x<g[0].length;x++)
  if(g[y][x]==='1')rgba.set([245,245,255,255],((24+y)*size+pen+x)*4);
  pen+=g[0].length+1;
 }
 return {...base,rgba};
}

test('Ren normal and sixth variants both use the independent count mode',()=>{
 const entry=jobSkills.find(s=>s.id===skill);
 assert.equal(entry.trackingMode,'count');assert.equal(entry.normal,true);assert.equal(entry.sixth,true);
 assert.deepEqual(jobIconFiles({skill}),[skill,skill+'_6차']);
 assert.deepEqual(jobIconFiles({skill:'라라_강줄기_흐르는_곳'}),['라라_강줄기_흐르는_곳']);
});

test('white corner counts are read without matching the flower artwork as digits',()=>{
 for(const file of [skill,skill+'_6차']){
  const base=art(file);
  assert.equal(readStackCount(base.rgba,base.w,base.rgba).count,null);
  for(const count of [0,1,2,10,20])for(const size of [32,40,45,64]){
   const icon=resizeIcon(countedIcon(base,count),size),background=resizeIcon(base,size);
   const reading=readStackCount(icon.rgba,size,background.rgba);
   assert.equal(reading.count,count,`${file} ${count} at ${size}`);
   assert.equal(reading.seconds,null);assert.equal(reading.unit,'count');
  }
 }
});

test('confirmed count does not tick down and one remaining alerts once until reloaded',()=>{
 const tr={id:'job-1',...freshState()},hit=count=>({found:true,count,confidence:1,x:100,y:20,size:32});
 assert.equal(advanceStackCount(tr,hit(20),1000),false);
 assert.equal(advanceStackCount(tr,hit(20),1500),false);
 assert.equal(tr.count,20);assert.equal(tr.deadline,null);
 advanceStackCount(tr,hit(20),60000);advanceStackCount(tr,hit(20),60500);
 assert.equal(tr.count,20);
 assert.equal(advanceStackCount(tr,hit(1),61000),false);
 assert.equal(advanceStackCount(tr,{found:false},61500),false);
 assert.equal(advanceStackCount(tr,hit(1),62000),false);
 assert.equal(advanceStackCount(tr,hit(1),62500),true);
 assert.equal(advanceStackCount(tr,hit(1),63000),false);
 advanceStackCount(tr,hit(20),63500);advanceStackCount(tr,hit(20),64000);
 advanceStackCount(tr,hit(1),64500);
 assert.equal(advanceStackCount(tr,hit(1),65000),true);
 advanceStackCount(tr,hit(0),65500);advanceStackCount(tr,hit(0),66000);
 assert.equal(tr.count,0);assert.equal(tr.needsReinstall,true);
});

test('an uncertain one or a moved icon cannot produce a count alert',()=>{
 const tr={id:'job-1',...freshState()},hit={found:true,count:1,confidence:1,x:20,y:20,size:32};
 advanceStackCount(tr,hit,1000);
 assert.equal(advanceStackCount(tr,{...hit,confidence:.5},1500),false);
 assert.equal(advanceStackCount(tr,hit,2000),false);
 assert.equal(advanceStackCount(tr,{...hit,x:100},2500),false);
 assert.equal(tr.alerted,false);
});
test('repeated out-of-range Ren counts never start a countdown',()=>{
 const tr={id:'job-1',...freshState()};
 const hit={found:true,count:888,confidence:1,x:20,y:20,size:32};
 advanceStackCount(tr,hit,1000);
 advanceStackCount(tr,hit,1500);
 assert.equal(advanceStackClock(tr,3500),false);
 assert.equal(tr.confirmedCount,undefined);
 advanceStackCount(tr,{...hit,count:60},4000);
 advanceStackCount(tr,{...hit,count:60},4500);
 assert.equal(tr.confirmedCount,60);
});
test('worker recognizes both Ren variants and keeps count units in clock mode',async()=>{
 const oldSelf=globalThis.self,oldPost=globalThis.postMessage,messages=[];
 globalThis.self={};globalThis.postMessage=m=>messages.push(m);
 try {
  await import('../js/tabs/hunting/detector.worker.js');
  const artwork=[skill,skill+'_6차'].map(art);
  self.onmessage({data:{type:'config',generation:1,targets:[
   {id:'job-1',file:skill,main:artwork[0],artwork,trackingMode:'count',thr:.84}
  ]}});
  let time=1000;
  for(const file of [skill,skill+'_6차'])for(const count of [20,1]){
   const base=art(file),icon=countedIcon(base,count),w=640,h=360;
   const rgba=new Uint8ClampedArray(w*h*4);
   for(let y=0;y<32;y++)rgba.set(icon.rgba.subarray(y*32*4,(y+1)*32*4),((10+y)*w+580)*4);
   self.onmessage({data:{type:'frame',generation:1,t:time,w,h,buffer:rgba.buffer,timerFormat:'clock',externalExperience:true}});
   time+=500;
   const message=messages.at(-1);assert.equal(message.type,'result',message.message);
   const result=message.results.find(r=>r.id==='job-1');
   assert.equal(result.found,true,file);assert.equal(result.count,count,file);
   assert.equal(result.preview, undefined);
   assert.equal(result.unit,'count');assert.equal(result.seconds,null);
  }
 }finally{globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
test('worker tracks sixth-job Death Blossom across frames and finds it again at a distant location',async()=>{
 const oldSelf=globalThis.self,oldPost=globalThis.postMessage,messages=[];
 globalThis.self={};globalThis.postMessage=message=>messages.push(message);
 try {
  await import('../js/tabs/hunting/detector.worker.js?blossom-test');
  const file=DEATH_BLOSSOM+'_6차';
  const base=resizeIcon(art(file),32);
  const icon=base.rgba.slice();
  const w=1920,h=1080,x=202,y=803,rgba=new Uint8ClampedArray(w*h*4);
  for(let p=0;p<icon.length;p+=4){
   const [r,g,b]=icon.subarray(p,p+3);
   icon[p]=r+(b-r)*.29;
   icon[p+1]=g+(r-g)*.29;
   icon[p+2]=b+(g-b)*.29;
  }
  for(let row=10;row<22;row++)for(let col=1;col<31;col++){
   const ink=(col%7<=1 || row%5<=1) && col%7<6;
   icon.set(ink ? [255,234,45,255] : [22,18,9,255],(row*32+col)*4);
  }
  for(let row=0;row<32;row++)rgba.set(icon.subarray(row*32*4,(row+1)*32*4),((y+row)*w+x)*4);
  for(let row=0;row<32;row++)for(let col=0;col<32;col++){
   if(row<2 || row>=30 || col<2 || col>=30)base.rgba[(row*32+col)*4+3]=0;
  }
  const standard=makeTemplate(base.rgba,32,32);
  const before=detect(prepareFrame(rgba,w,h),{main:standard,thr:.84,minColor:.85,last:{x,y}},{allowScan:false});
  self.onmessage({data:{type:'config',generation:1,targets:[
   {id:'job-2',file:skill,main:art(skill),trackingMode:'count',thr:.84},
   {id:'job-1',file:DEATH_BLOSSOM,main:art(DEATH_BLOSSOM),
    artwork:[art(DEATH_BLOSSOM),base],trackingMode:'timer',thr:.84}
  ]}});
  const beforeCasting=new Uint8ClampedArray(w*h*4);
  for(let frame=0;frame<8;frame++){
   self.onmessage({data:{type:'frame',generation:1,t:100+frame*100,w,h,buffer:beforeCasting.buffer,
    installerOnly:true}});
   const idle=messages.at(-1);
   assert.equal(idle.type,'result',idle.message);
   assert.equal(idle.results.some(hit=>hit.found),false);
  }
  self.onmessage({data:{type:'frame',generation:1,t:1000,w,h,buffer:rgba.buffer,timerFormat:'clock',externalExperience:true}});
  const message=messages.at(-1);
  assert.equal(message.type,'result',message.message);
  const result=message.results.find(hit=>hit.id==='job-1');
  assert.equal(result.found,true);
  assert.ok(result.score>before.score);
  assert.ok(result.color>=.78 && result.color<.85);
  assert.deepEqual([result.x,result.y],[x,y]);
  assert.equal(result.preview,undefined);
  const move=(left,top,t)=>{
   rgba.fill(0);
   for(let row=0;row<32;row++)rgba.set(icon.subarray(row*32*4,(row+1)*32*4),((top+row)*w+left)*4);
   self.onmessage({data:{type:'frame',generation:1,t,w,h,buffer:rgba.buffer,externalExperience:true}});
   const message=messages.at(-1);
   assert.equal(message.type,'result',message.message);
   return message.results.find(hit=>hit.id==='job-1');
  };
  const moved=move(x+6,y-5,2300);
  assert.equal(moved.found,true);
  assert.equal(moved.mode,'track');
  assert.deepEqual([moved.x,moved.y],[x+6,y-5]);
  const shortcut=move(w-100,h-40,2900);
  assert.equal(shortcut.found,false);
  assert.equal(move(105,133,3500).found,false);
  const reacquired=move(105,133,4100);
  assert.equal(reacquired.found,true);
  assert.deepEqual([reacquired.x,reacquired.y],[105,133]);
 }finally{globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('stack count matcher finds a counter over bright skill art without a dark plate',()=>{
 for(const file of [skill,skill+'_6차']){
  const base=art(file),plated=countedIcon(base,20),rgba=base.rgba.slice(),ink=[];
  for(let y=22;y<32;y++)for(let x=17;x<32;x++){
   const p=(y*32+x)*4;
   if(plated.rgba[p]===245 && plated.rgba[p+1]===245 && plated.rgba[p+2]===255)ink.push([x,y]);
  }
  for(const [x,y] of ink)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(x+dx<0 || x+dx>=32 || y+dy<0 || y+dy>=32)continue;
   rgba.set([15,15,20,255],((y+dy)*32+x+dx)*4);
  }
  for(const [x,y] of ink)rgba.set([245,245,255,255],(y*32+x)*4);
  const w=120,h=80,frame=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)frame.set([55,105,190,255],i*4);
  for(let y=0;y<32;y++)frame.set(rgba.subarray(y*32*4,(y+1)*32*4),((20+y)*w+70)*4);
  const main=makeTemplate(base.rgba,32,32,'stack-count');
  const hit=detect(prepareFrame(frame,w,h),{main,thr:.84,minColor:.85,last:null,readTimer:false});
  assert.equal(hit.found,true,file);assert.equal(hit.x,70);assert.equal(hit.y,20);
  assert.equal(readStackCount(rgba,32,base.rgba).count,20,file);
 }
});

test('missing count reads estimate one use per two seconds and alert once at one',()=>{
 const tr={id:'job-1',...freshState()},hit=count=>({found:true,count,confidence:1,x:100,y:20,size:32});
 advanceStackCount(tr,hit(5),1000);advanceStackCount(tr,hit(5),1500);
 assert.equal(advanceStackCount(tr,{found:false},2000),false);
 advanceStackClock(tr,2999);assert.equal(tr.count,5);
 advanceStackClock(tr,3000);assert.equal(tr.count,4);assert.equal(tr.countApprox,true);
 assert.equal(advanceStackClock(tr,9000),true);assert.equal(tr.count,1);
 assert.equal(advanceStackClock(tr,9500),false);
 advanceStackClock(tr,11000);assert.equal(tr.count,0);
 advanceStackCount(tr,hit(20),22000);advanceStackCount(tr,hit(20),22500);
 assert.equal(tr.count,20);assert.equal(tr.countApprox,false);assert.equal(tr.alerted,false);
 assert.equal(tr.deadline,null);
});

test('fresh actual counts override estimates without resetting the two-second phase every scan',()=>{
 const tr={id:'job-1',...freshState()},hit=count=>({found:true,count,confidence:1,x:10,y:10,size:32});
 advanceStackCount(tr,hit(5),1000);advanceStackCount(tr,hit(5),1500);
 advanceStackCount(tr,hit(5),2000);advanceStackCount(tr,hit(5),2500);
 advanceStackCount(tr,{found:false},3000);advanceStackClock(tr,4000);
 assert.equal(tr.count,4);
 advanceStackCount(tr,hit(3),5100);advanceStackCount(tr,hit(3),5600);
 assert.equal(tr.count,3);assert.equal(tr.countApprox,false);
 const empty={id:'job-2',...freshState()};
 advanceStackClock(empty,100000);assert.equal(empty.count,undefined);assert.equal(empty.alerted,false);
});
test('the tiny corner one is separated from a touching white icon frame',async()=>{
 const {RUNE_COOLDOWN_GLYPHS}=await import('../js/data/screen-glyphs.js');
 for(const file of [skill,skill+'_6차']){
  const base=art(file),background=base.rgba.slice();
  for(let i=0;i<32;i++){
   background.set([245,245,255,255],(i*32+31)*4);
   background.set([245,245,255,255],(31*32+i)*4);
  }
  for(const tiny of [false,true]){
   let rgba;
   if(!tiny)rgba=countedIcon({...base,rgba:background},1).rgba;
   else{
    rgba=background.slice();
    for(let y=20;y<31;y++)for(let x=17;x<31;x++)rgba.set([20,20,30,255],(y*32+x)*4);
    const g=RUNE_COOLDOWN_GLYPHS.find(g=>g.digit===1);
    for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++)
     if(g.bits[y*g.w+x]==='1')rgba.set([245,245,255,255],((22+y)*32+28+x)*4);
   }
   for(let i=0;i<32;i++){
    rgba.set([245,245,255,255],(i*32+31)*4);
    rgba.set([245,245,255,255],(31*32+i)*4);
   }
   const r=readStackCount(rgba,32,background);
   assert.equal(r.count,1,`${file} tiny=${tiny}`);
  }
 }
});
