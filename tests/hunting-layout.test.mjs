import test from 'node:test';
import assert from 'node:assert/strict';
import {gameContentHeight} from '../js/tabs/hunting/frame-geometry.js';
import {SCREEN_GLYPHS} from '../js/data/screen-glyphs.js';
import {analyzeScreen,analyzeExperience,resetScreenMonitor} from '../js/tabs/hunting/screen-monitor.js';
import {readPNG} from './png-fixture.mjs';

const screenshot=readPNG(new URL('../icon/hunting/reference-game.png',import.meta.url));
test('black game extensions are excluded, including the thin sharing border',()=>{
 for(const extra of [0,100,300,600]){
  const w=screenshot.w,h=screenshot.h+extra,rgba=new Uint8ClampedArray(w*h*4);
  rgba.set(screenshot.rgba);
  if(extra)for(let x=0;x<w;x++)rgba.set([255,220,0,255],((h-1)*w+x)*4);
  const height=gameContentHeight({w,h,rgba});
  if(!extra){assert.equal(height,h);continue;}
  assert.ok(height>=screenshot.h && height<=screenshot.h+6,`${extra}: ${height}`);
  const cropHeight=80,frame={w,h:cropHeight,sourceHeight:height,
   rgba:rgba.slice((height-cropHeight)*w*4,height*w*4)};
  resetScreenMonitor();
  const exp=analyzeExperience(frame,1000);
  assert.equal(exp.value?.raw,'38003778803410');
 }
});

test('fragment 40 through 49 survive different UI scales and positions',()=>{
 for(const scale of [1,1.25,1.5,1.75,2])for(let count=40;count<=49;count++){
  const w=220,h=200,rgba=new Uint8ClampedArray(w*h*4),left=53,top=31;
  for(const [i,c] of [...String(count)].entries()){
   const g=SCREEN_GLYPHS.find(g=>g.char===c&&g.h===7)??SCREEN_GLYPHS.find(g=>g.char===c&&g.h===6);
   for(let y=0;y<Math.ceil(g.h*scale);y++)for(let x=0;x<Math.ceil(g.w*scale);x++){
    if(g.bits[Math.min(g.h-1,Math.floor(y/scale))*g.w+Math.min(g.w-1,Math.floor(x/scale))]!=='1')continue;
    rgba.set([190,175,210,255],((top+Math.round(32*scale)+y)*w+left+Math.round((8+i*7)*scale)+x)*4);
   }
  }
  resetScreenMonitor();let result;
  const icon={id:'fragments_icon',found:true,x:left,y:top,size:24*scale};
  for(const time of [1000,1500])result=analyzeScreen({w,h,rgba},[icon],time,null);
  assert.equal(result.fragments.value,count,`count ${count} at ${scale}x`);
 }
});
test('fragment icon and count are found through the real worker at different capture scales',async()=>{
 const {MONITOR_REFERENCE}=await import('../js/data/monitor-reference.js');
 const oldSelf=globalThis.self,oldPost=globalThis.postMessage,messages=[];
 globalThis.self={};globalThis.postMessage=m=>messages.push(m);
 try{
  await import('../js/tabs/hunting/detector.worker.js');
  const dispatch=globalThis.self.onmessage;
  for(const scale of [1,1.25,1.5]){
   const w=Math.round(screenshot.w*scale),h=Math.round(screenshot.h*scale);
   const rgba=new Uint8ClampedArray(w*h*4);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const src=(Math.min(screenshot.h-1,Math.floor(y/scale))*screenshot.w+Math.min(screenshot.w-1,Math.floor(x/scale)))*4;
    rgba.set(screenshot.rgba.subarray(src,src+4),(y*w+x)*4);
   }
   dispatch({data:{type:'config',generation:1,targets:[{id:'fragments_icon',main:MONITOR_REFERENCE.fragments_icon,whole:true,thr:.83,sizes:[24,30,36]}]}});
   for(const t of [1000,1500])dispatch({data:{type:'frame',generation:1,t,w,h,buffer:rgba.buffer,externalExperience:true}});
   const result=messages.at(-1);
   assert.equal(result.type,'result',result.message);
   assert.equal(result.results.find(r=>r.id==='fragments_icon').found,true,`icon ${scale}`);
   assert.equal(result.monitor.fragments.value,23,`count ${scale}`);
  }
 }finally{globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
test('fragment label position and font scale need not match its icon scale',()=>{
 for(const [offset,fontScale] of [[32,1],[37,1.25],[40,1.5],[42,1.5]]){
  const w=180,h=160,rgba=new Uint8ClampedArray(w*h*4),left=70,top=20;
  for(const [i,c] of [...'49'].entries()){
   const g=SCREEN_GLYPHS.find(g=>g.char===c&&g.h===7);
   for(let y=0;y<Math.ceil(7*fontScale);y++)for(let x=0;x<Math.ceil(g.w*fontScale);x++){
    if(g.bits[Math.min(6,Math.floor(y/fontScale))*g.w+Math.min(g.w-1,Math.floor(x/fontScale))]!=='1')continue;
    rgba.set([190,175,210,255],((top+offset+y)*w+left+Math.round(i*7*fontScale)+x)*4);
   }
  }
  resetScreenMonitor();let result;
  const icon={id:'fragments_icon',found:true,x:left,y:top,size:24};
  for(const t of [1000,1500])result=analyzeScreen({w,h,rgba},[icon],t,null);
  assert.equal(result.fragments.value,49,`offset ${offset} font ${fontScale}`);
 }
});
test('a pale blue leading 4 is retained rather than accepting the trailing digit alone',()=>{
 const w=160,h=130,rgba=new Uint8ClampedArray(w*h*4);
 for(const [i,c] of [...'49'].entries()){
  const g=SCREEN_GLYPHS.find(g=>g.char===c&&g.h===7);
  for(let y=0;y<7;y++)for(let x=0;x<g.w;x++)if(g.bits[y*g.w+x]==='1')
   rgba.set(i ? [210,205,245,255] : [120,160,220,255],((61+y)*w+68+i*7+x)*4);
 }
 resetScreenMonitor();let result;
 const icon={id:'fragments_icon',found:true,x:65,y:20,size:24};
 for(const t of [1000,1500])result=analyzeScreen({w,h,rgba},[icon],t,null);
 assert.equal(result.fragments.value,49);
 resetScreenMonitor();
 const blank=analyzeScreen({w,h,rgba:new Uint8ClampedArray(w*h*4)},[icon],1000,null);
 assert.equal(blank.fragments.value,null);
});
test('upright quantity-font fours are read across counts and independent UI scales',()=>{
 const fours=[
  ['1000001','1000001','1000001','1111111','0000001','0000001','0000001'],
  ['1100011','1100011','1100011','1111111','0000011','0000011','0000011'],
  ['1000010','1000010','1000010','1111111','0000010','0000010','0000010']
 ];
 for(const rows of fours)for(const scale of [1,1.25,1.5,2])for(const text of ['4','14','24','40','43','44','45','48','49']){
  const w=200,h=160,rgba=new Uint8ClampedArray(w*h*4);
  const glyphs=[...text].map(c=>c==='4'?{w:7,h:7,bits:rows.join('')}:
   SCREEN_GLYPHS.find(g=>g.char===c&&g.h===7)??SCREEN_GLYPHS.find(g=>g.char===c&&g.h===6));
  let pen=60;
  for(const g of glyphs){
   for(let y=0;y<Math.ceil(g.h*scale);y++)for(let x=0;x<Math.ceil(g.w*scale);x++){
    if(g.bits[Math.min(g.h-1,Math.floor(y/scale))*g.w+Math.min(g.w-1,Math.floor(x/scale))]!=='1')continue;
    rgba.set([190,175,230,255],((61+y)*w+pen+x)*4);
   }
   pen+=Math.ceil((g.w+2)*scale);
  }
  resetScreenMonitor();let result;
  const icon={id:'fragments_icon',found:true,x:60,y:20,size:24*scale};
  // Keep the label independently anchored beneath the icon at each scale.
  icon.y=61-Math.round(32*scale);
  for(const t of [1000,1500])result=analyzeScreen({w,h,rgba},[icon],t,null);
  assert.equal(result.fragments.value,Number(text),`${text} at ${scale}x ${rows[0]}`);
 }
});