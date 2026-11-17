import {detect,makeTemplate,resizeIcon} from './matcher.js';
import {applyTimerFormat,readDigits} from './digits.js';
import {observeExperienceBuff,experienceBuffHud,experienceBuffPending} from './experience-buffs.js';

const sizes=[32,45,44,31,33,27,28,30,34,36,40,48,24,56,64];
const similarGroups={multiplier:'bonus',bonus:'multiplier',
  'experience-potion':'wealth-potion','wealth-potion':'experience-potion'};
function templateFor(asset,size,mode='wide-timer'){
  const key=mode+'-'+size;
  if (!asset.templates.has(key)) {
    const image=resizeIcon(asset.main,size);
    asset.templates.set(key,makeTemplate(image.rgba,size,size,mode));
  }
  return asset.templates.get(key);
}
export function createExperienceBuffDetector(assets){
  return {
    assets:assets.map(asset=>({...asset,templates:new Map(),last:null,cursor:0})),
    records:{},checked:{},misses:{},format:null
  };
}

function readMinutes(hit,main){
  const {preview,size}=hit;
  const minute={min:10,longTimer:true,aligned:true,minuteLabel:true,light:true,minGlyphHeight:.14};
  for (const area of [[.02,.63,.64,1],[0,.66,.55,.99],[.02,.63,.47,.97],[.095,.69,.46,.92],
    [0,.64,.42,.96],[.025,.70,.39,.98]]) {
    for (const options of [{background:main.rgba},{lightThreshold:215},{background:main.rgba,lightThreshold:175}]) {
      const reading=readDigits(preview,size,{...minute,...options,area});
      if (Number.isInteger(reading.seconds) && reading.seconds>=10 &&
          reading.seconds<=180 && reading.confidence>=.85) return reading.seconds;
    }
  }
  return null;
}

export function matchesUnionColor(frame,x,y,size,group){
  let gold=0,green=0;
  // The top of the icon stays clear of the central countdown and the
  // white minute label. Ignore the shared gray outline and white letters.
  for(let row=Math.ceil(size*.13);row<Math.floor(size*.41);row++){
    for(let col=Math.ceil(size*.13);col<Math.floor(size*.87);col++){
      const p=((y+row)*frame.w+x+col)*4;
      const r=frame.rgba[p],g=frame.rgba[p+1],b=frame.rgba[p+2];
      if (r>=g+19 && g>=b+19) gold++;
      if (g>=r+18 && g>=b+21) green++;
    }
  }
  const [wanted,other]=group==='wealth' ? [gold,green] : [green,gold];
  return wanted>=Math.max(4,Math.round(size*size*.018)) && wanted>=other*2.3;
}

function readTimer(hit,main,format){
  const {preview,size}=hit;
  const base={min:1,longTimer:true,aligned:true,runeCooldown:true};
  const center={...base,area:[.02,.26,.98,.77]};
  const acceptable=reading=>reading.seconds>0 && reading.seconds<=10800 && reading.confidence>=.85;
  for (const options of [{...center,clockOnly:true,background:main.rgba},{...center,clockOnly:true}]) {
    const reading=readDigits(preview,size,options);
    if (acceptable(reading)) return {seconds:reading.seconds,approx:false};
  }
  const minutes=readMinutes(hit,main);
  if (minutes!==null) return {seconds:minutes*60,approx:true};
  for (const options of [{...center,background:main.rgba},center,{...center,faintYellow:true,background:main.rgba}]) {
    const reading=applyTimerFormat(readDigits(preview,size,options),format);
    if (acceptable(reading)) return {seconds:reading.seconds,approx:false};
  }
  return {seconds:null,approx:false};
}

function readMultiplier(hit){
  for (const area of [[.62,.09,.90,.32],[.59,.08,.91,.35]]) {
    const reading=readDigits(hit.preview,hit.size,{area,light:true,lightThreshold:205,min:2});
    if (reading.confidence>=.89 && reading.seconds>=2 && reading.seconds<=5) return reading.seconds;
  }
  return null;
}

function findAsset(region,asset,large,format) {
  const first=large?45:32;
  const candidates=asset.last ? [asset.last.size,first] :
    [first,asset.main.w,sizes[asset.cursor++%sizes.length]];
  const acceptPosition=asset.group==='luck' || asset.group==='wealth'
    ? (x,y,size)=>matchesUnionColor(region,x,y,size,asset.group)
    : undefined;
  let best=null;
  for (const size of new Set(candidates)) {
    const main=templateFor(asset,size);
    const target={main,minColor:.86,thr:.86,readTimer:false,acceptPosition,scanOptions:{coarseMin:.48,maxCands:12}};
    const last=asset.last?.size===size ? asset.last : null;
    const hit=(last && detect(region,{...target,last},{allowScan:false,trackRadius:3})) || {};
    const match=hit.found ? hit : detect(region,target);
    if (!match.found || (best && best.hit.score+best.hit.color>=match.score+match.color)) continue;
    best={hit:match,main,mode:'wide-timer'};
  }
  if (best) best.reading=readTimer(best.hit,best.main,format);
  // Match the upper artwork even when the normal match found a candidate
  // but couldn't read its timer. Keep a strong untimed match as pending.
  if (!best?.reading?.seconds) {
    // Probe the current size first when no slot has been found yet.
    const minuteSizes=best ? [best.hit.size] : [candidates.at(-1)];
    for (const size of minuteSizes) {
      const main=templateFor(asset,size);
      const hit=detect(region,{main:templateFor(asset,size,'minute-timer'),minColor:.91,thr:.91,
        readTimer:false,acceptPosition,scanOptions:{coarseMin:.46,maxCands:18}});
      if (!hit.found) continue;
      const minutes=readMinutes(hit,main);
      const score=hit.score+hit.color;
      if (minutes!==null) {
        if (!best?.reading?.seconds || score>best.hit.score+best.hit.color) {
          best={hit,main,mode:'minute-timer',reading:{seconds:minutes*60,approx:true}};
        }
      } else if (!best || (!best.reading?.seconds && score>best.hit.score+best.hit.color)) {
        best={hit,main,mode:'minute-timer',reading:{seconds:null,approx:false}};
      }
    }
  }
  asset.last=best?{x:best.hit.x,y:best.hit.y,size:best.hit.size}:null;
  return best && {...best,file:asset.file,group:asset.group};
}

function identifyBuff(candidate,region,assets) {
  const {hit,group,mode}=candidate;
  const multiplier=(group==='multiplier' || group==='bonus') ? readMultiplier(hit) : null;
  if (group==='multiplier' && !multiplier) return {multiplier:null,seconds:null,approx:false};
  for (const rival of assets) {
    if (rival.group!==similarGroups[group] || (rival.group==='multiplier' && !multiplier)) continue;
    const other=detect(region,{main:templateFor(rival,hit.size,mode),minColor:.84,thr:.84,
      readTimer:false,last:{x:hit.x,y:hit.y}},{allowScan:false,trackRadius:1});
    if (other.found && other.score+other.color>=hit.score+hit.color-.06) {
      return {multiplier:null,seconds:null,approx:false};
    }
  }
  return {...candidate.reading,multiplier:group==='multiplier' ? multiplier : null};
}

export function scanExperienceBuffs(detector,frame,now,cropFrame,onlyPending=false){
  const {assets,records,checked,misses}=detector;
  if (detector.format!==frame.timerFormat) {
    detector.format=frame.timerFormat;
    for (const [group,record] of Object.entries(records)) {
      record.sample=null;
      if (record.deadline<=now) delete checked[group];
    }
  }
  const due=assets.filter(asset=>{
    const record=records[asset.group];
    const pending=experienceBuffPending(record,now);
    if (onlyPending && !pending) return false;
    const active=record?.deadline>now;
    const interval=active
      ? (record.deadline-now<=12000 ? 450 : 30000)
      : pending ? 450 : 3000*2**Math.max(0,(misses[asset.group] ?? 0)-1);
    return now-(checked[asset.group] ?? -Infinity)>=interval;
  });
  if (!due.length) return records;
  const {x,h}=experienceBuffHud(frame.w,frame.h);
  const region=onlyPending ? frame : cropFrame(frame,x,0,frame.w-x,h).frame;
  const hits=due.map(asset=>findAsset(region,asset,(frame.sourceWidth ?? frame.w)>=1800,frame.timerFormat)).filter(Boolean)
    .sort((a,b)=>(b.hit.score+b.hit.color)-(a.hit.score+a.hit.color));
  const groups=new Set(due.map(asset=>asset.group));
  for (const group of groups) {
    checked[group]=now;
    const candidates=hits.filter(({group:id,hit})=>id===group && !hits.some(other=>
      other.group!==group && other.group!==similarGroups[group] && Math.abs(other.hit.x-hit.x)<hit.size*.40 &&
      Math.abs(other.hit.y-hit.y)<hit.size*.40 &&
      other.hit.score+other.hit.color>=hit.score+hit.color-.04));
    const candidate=candidates.find(hit=>hit.reading?.seconds) ?? candidates[0];
    if (!candidate) {
      if (!experienceBuffPending(records[group],now)) misses[group]=Math.min((misses[group] ?? 0)+1,3);
      continue;
    }
    misses[group]=0;
    records[group]=observeExperienceBuff(records[group],
      {file:candidate.file,...identifyBuff(candidate,region,assets)},now);
  }
  return records;
}
