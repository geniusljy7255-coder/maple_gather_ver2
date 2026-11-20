import test from 'node:test';
import assert from 'node:assert/strict';
import {readPNG} from './png-fixture.mjs';
import {readDigits} from '../js/tabs/hunting/digits.js';
import {readStackCount} from '../js/tabs/hunting/stack-count.js';
import {prepareFrame,resizeIcon} from '../js/tabs/hunting/matcher.js';
import {readMinuteImage} from '../js/tabs/hunting/number-image-reader.js';
import {createExperienceBuffDetector,scanExperienceBuffs} from '../js/tabs/hunting/experience-buff-detector.js';
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

const buffArt=file=>readPNG(new URL('../icon/buff/'+file+'.png',import.meta.url));
const minuteBuffArt=buffArt('VIP_버프_경험치');

test('new framed potion and Extreme Gold icons retain their native slot size',()=>{
 const w=360,h=240;
 const assets=[
  {group:'experience-potion',file:'경험_축적의_비약',main:buffArt('경험_축적의_비약')},
  {group:'wealth-potion',file:'재물_획득의_비약',main:buffArt('재물_획득의_비약')},
  {group:'gold',file:'익스트림_골드',main:buffArt('익스트림_골드')},
  {group:'experience-potion',file:'고농축_경험축적의_비약',main:buffArt('고농축_경험축적의_비약')}
 ];
 const makeFrame=(shown,secondsVisible)=>{
  const rgba=new Uint8ClampedArray(w*h*4);
  for(const [index,{main}] of shown.entries()){
   const icon={...main,rgba:main.rgba.slice()};
   assert.equal(icon.w,35);
   if(index===1 && secondsVisible)drawText(icon,'9:54','buff_time_1',31,11,2);
   else drawText(icon,['19','10','29'][index],'buff_time_3',16,24,1);
   stamp({w,h,rgba},icon,51+index*70,121);
  }
  const frame=prepareFrame(rgba,w,h);
  frame.timerFormat='clock';
  return frame;
 }
 for(const potion of [assets[0],assets[3]]){
  const shown=[potion,assets[1],assets[2]];
  const detector=createExperienceBuffDetector(assets);
  const frame=makeFrame(shown,false);
  scanExperienceBuffs(detector,frame,1000);
  const records=scanExperienceBuffs(detector,frame,1500);
  for(const [index,{group,file}] of shown.entries()){
   assert.equal(records[group]?.sample?.seconds,[19,10,29][index]*60,group);
   assert.equal(records[group].file,file);
   assert.equal(detector.assets.find(asset=>asset.file===file).last?.size,35,group);
   assert.equal(records[group].approx,true,group);
   assert.ok(records[group].deadline>1500,group);
  }
  const underTen=scanExperienceBuffs(detector,makeFrame(shown,true),6500)['wealth-potion'];
  assert.equal(underTen.sample.seconds,594);
  assert.equal(underTen.approx,false);
 }
});

test('buff_time_3 minute digits retain their black outlines at multiple icon scales',()=>{
 for(const value of [10,13,15,16,18,19,23,29,48,59,79,86,99,109,120,180]){
  const base=minuteBuffArt,icon={...base,rgba:base.rgba.slice()};
  const sprites=textSprites(String(value),'buff_time_3');
  const width=sprites.reduce((n,sprite)=>n+sprite.w-1,0)+1;
  drawText(icon,String(value),'buff_time_3',width+1,21,1);
  for(const size of [32,40,45,64]){
   const scaled=resizeIcon(icon,size);
   assert.equal(readMinuteImage(scaled.rgba,size).minutes,value,`${value} minutes at ${size}`);
   if (value===18 || value===19) {
    for(let p=0;p<scaled.rgba.length;p+=4)for(let c=0;c<3;c++)scaled.rgba[p+c]*=.9;
    assert.equal(readMinuteImage(scaled.rgba,size).minutes,value,`${value} dimmed minutes at ${size}`);
   }
  }
 }
 assert.equal(readMinuteImage(minuteBuffArt.rgba,minuteBuffArt.w).minutes,null);
});

test('Extreme Gold can read its timer when the HUD background differs from the reference',()=>{
 const main=buffArt('익스트림_골드'),icon={...main,rgba:main.rgba.slice()};
 for(let p=0;p<icon.rgba.length;p+=4){
  const [r,g,b]=icon.rgba.subarray(p,p+3);
  if(r-b<48 || g-b<18) icon.rgba.set([61,90,145,255],p);
 }
 drawText(icon,'26','buff_time_3',16,24,1);
 const w=320,h=240,rgba=new Uint8ClampedArray(w*h*4);
 stamp({w,h,rgba},icon,w-icon.w,95);
 const detector=createExperienceBuffDetector([{group:'gold',file:'익스트림_골드',main}]);
 const frame=prepareFrame(rgba,w,h);
 scanExperienceBuffs(detector,frame,1000);
 const gold=scanExperienceBuffs(detector,frame,1500).gold;
 assert.equal(gold?.sample?.seconds,26*60);
 assert.equal(gold?.deadline,1561500);
});

test('two verified 19-minute readings correct a previously confirmed 10-minute reading',()=>{
 const main=minuteBuffArt,w=320,h=240;
 const detector=createExperienceBuffDetector([{group:'vip',file:'vip',main}]);
 for(const [t,label,expected] of [[1000,'10',null],[1500,'10',601500],
  [6500,'19',601500],[11500,'19',1151500]]){
  const icon={...main,rgba:main.rgba.slice()},rgba=new Uint8ClampedArray(w*h*4);
  drawText(icon,label,'buff_time_3',13,21,1);
  stamp({w,h,rgba},icon,51,125);
  const record=scanExperienceBuffs(detector,prepareFrame(rgba,w,h),t).vip;
  assert.equal(record.sample.seconds,Number(label)*60);
  assert.equal(record.deadline || null,expected);
 }
});

test('experience buff tracking changes from minute labels to precise seconds in either timer mode',()=>{
 const main=minuteBuffArt,w=320,h=240,left=51,top=125;
 for(const format of ['clock','seconds']){
  const detector=createExperienceBuffDetector([{group:'vip',file:'vip',main}]);
  for(const [t,label,minutes] of [[1000,'10',true],[1500,'10',true],[6500,format==='clock'?'9:54':'594',false]]){
   const icon={...main,rgba:main.rgba.slice()};
   const rgba=new Uint8ClampedArray(w*h*4);
   if(minutes)drawText(icon,label,'buff_time_3',13,21,1);
   else {
    drawText(icon,label,'buff_time_1',29,9,2);
   }
   stamp({w,h,rgba},icon,left,top);
   const frame=prepareFrame(rgba,w,h);frame.timerFormat=format;
   const records=scanExperienceBuffs(detector,frame,t);
   assert.equal(records.vip?.sample?.seconds,minutes ? 600 : 594,JSON.stringify({
    format,label,checked:detector.checked.vip,seenAt:records.vip?.seenAt,
    read:readDigits(icon.rgba,32,{min:1,longTimer:true,aligned:true,runeCooldown:true,buffSeconds:true,
     area:[.02,.26,.98,.77],clockOnly:format==='clock'})
   }));
   assert.equal(records.vip?.sample?.approx,minutes,format+' '+label);
   if(!minutes){
    assert.equal(records.vip.approx,false);
    assert.equal(records.vip.deadline,t+594000);
   }
  }
 }
});

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
