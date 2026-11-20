import test from 'node:test';
import assert from 'node:assert/strict';
import {readPNG} from './png-fixture.mjs';
import {readDigits} from '../js/tabs/hunting/digits.js';
import {readStackCount} from '../js/tabs/hunting/stack-count.js';
import {resizeIcon} from '../js/tabs/hunting/matcher.js';
const load=file=>readPNG(new URL('../icon/number/'+file,import.meta.url));
const art=file=>readPNG(new URL('../icon/hunting/'+file+'.png',import.meta.url));
function stamp(frame,sprite,x,y){
 for(let py=0;py<sprite.h;py++)for(let px=0;px<sprite.w;px++){
  if(x+px<0 || y+py<0 || x+px>=frame.w || y+py>=frame.h)continue;
  const src=(py*sprite.w+px)*4,dst=((y+py)*frame.w+x+px)*4,a=sprite.rgba[src+3]/255;
  for(let c=0;c<3;c++)frame.rgba[dst+c]=Math.round(sprite.rgba[src+c]*a+frame.rgba[dst+c]*(1-a));
  frame.rgba[dst+3]=255;
 }
}
function textSprites(text,family){return [...text].map(c=>load(family==='count'?`count_num/count_${c}.png`:`${family}/${c===':'?'colon':c}.png`));}
function drawText(frame,text,family,right,top,overlap){
 const sprites=textSprites(text,family),width=sprites.reduce((n,g)=>n+g.w-overlap,0)+overlap;
 let left=right-width;
 for(const sprite of sprites){stamp(frame,sprite,left,top);left+=sprite.w-overlap;}
 return frame;
}

test('original timer PNGs distinguish rounded digits at multiple icon scales',()=>{
 for(const family of ['buff_time_1','buff_time_2'])for(const value of [0,1,2,3,4,5,6,7,8,9,19,59,109,359,599]){
  const native={w:32,h:32,rgba:new Uint8ClampedArray(32*32*4)};
  drawText(native,String(value),family,30,9,2);
  for(const size of [32,40,48,64]){
   const icon=resizeIcon(native,size);
   const r=readDigits(icon.rgba,size,{area:[0,.18,1,.85],min:0,buffSeconds:true});
   assert.equal(r.seconds,value,`${family} ${value} at ${size}`);
  }
 }
});

test('original colon PNG supports the clock time format',()=>{
 for(const family of ['buff_time_1','buff_time_2']){
  const native={w:32,h:32,rgba:new Uint8ClampedArray(32*32*4)};
  drawText(native,'3:14',family,30,9,2);
  for(const size of [32,40,48,64]){
   const icon=resizeIcon(native,size);
   const r=readDigits(icon.rgba,size,{area:[0,.18,1,.85],min:0,buffSeconds:true,longTimer:true,clockOnly:true});
   assert.equal(r.seconds,194,`${family} clock at ${size}`);assert.equal(r.clock,true);
  }
 }
});

test('actual gradient quantity PNGs are read over both Ren skill backgrounds',()=>{
 for(const file of ['렌_매화검_3초식_예인','렌_매화검_3초식_예인_6차'])for(const value of [0,1,2,3,4,5,6,7,8,9,10,14,17,19,20,40,49,99]){
  const base=art(file),native={...base,rgba:base.rgba.slice()};
  drawText(native,String(value),'count',32,21,1);
  for(const size of [32,40,45,64]){
   const icon=resizeIcon(native,size),background=resizeIcon(base,size);
   const r=readStackCount(icon.rgba,size,background.rgba);
   assert.equal(r.count,value,`${file} ${value} at ${size}`);
  }
 }
});
test('complete count sprites remain readable with tinted strokes and shadows',()=>{
 const file='렌_매화검_3초식_예인',base=art(file);
 for(const count of [17,19,24,26]){
  const frame={...base,rgba:base.rgba.slice()};
  const sprite=load(`count_num/count_${count}.png`);
  for(let p=0;p<sprite.rgba.length;p+=4){
   for(let c=0;c<3;c++)sprite.rgba[p+c]=32+sprite.rgba[p+c]*.74;
  }
  stamp(frame,sprite,29-sprite.w,20);
  assert.equal(readStackCount(frame.rgba,32,base.rgba).count,count);
 }
});
test('undersized original timer sprites remain unknown instead of inventing another digit',()=>{
 for(const family of ['buff_time_1','buff_time_2'])for(const value of [1,3,4,5,6,8,9,19,59,109,359,599]){
  const native={w:32,h:32,rgba:new Uint8ClampedArray(32*32*4)};
  drawText(native,String(value),family,30,9,2);
  const icon=resizeIcon(native,24),r=readDigits(icon.rgba,24,{area:[0,.18,1,.85],min:0,buffSeconds:true});
  assert.ok(r.seconds===null || r.seconds===value,`${family} ${value} became ${r.seconds}`);
 }
});
