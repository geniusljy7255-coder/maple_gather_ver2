import {detect,makeTemplate,resizeIcon} from './matcher.js';
import {applyTimerFormat,readDigits} from './digits.js';
import {readScreenText} from './screen-text.js';
import {observeExperienceBuff,experienceBuffHud,experienceBuffPending} from './experience-buffs.js';

const sizes=[32,45,44,31,33,27,28,30,34,36,40,48,24,56,64];
const similarGroups={multiplier:'bonus',bonus:'multiplier',
  'experience-potion':'wealth-potion','wealth-potion':'experience-potion'};
const sameSlot=(a,b)=>Math.abs(a.x-b.x)<a.size*.40 && Math.abs(a.y-b.y)<a.size*.40;
const matchScore=({hit})=>hit.score+hit.color;
const modes=['wide-timer','minute-timer','coupon-top','vip-edges'];
const expIdentityGroup=group=>group==='multiplier' || group==='bonus' || group==='vip';
function templateFor(asset,size,mode='wide-timer'){
  const key=mode+'-'+size;
  if (!asset.templates.has(key)) {
    const image=resizeIcon(asset.main,size);
    if(mode==='bonus-badge' || mode==='coupon-top' || mode==='vip-mark' || mode==='vip-edges' || mode==='hud-header'){
      const pixels=image.rgba.slice();
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const outside=mode==='hud-header' ? y>=size*.35 :
          mode==='vip-edges'
          ? y>=size*.34 && (y<size*.65 || x<size*.45 || y>=size*.94)
          : mode==='vip-mark'
          ? y<size*.25 || y>=size*.68 || x<size*.12 || x>=size*.89
          : y>=size*.46 || (mode==='bonus-badge' && (y<size*.05 || x<size*.52 || x>=size*.96));
        if(outside)pixels[(y*size+x)*4+3]=0;
      }
      asset.templates.set(key,makeTemplate(pixels,size,size,true));
    } else asset.templates.set(key,makeTemplate(image.rgba,size,size,mode));
  }
  return asset.templates.get(key);
}
export function createExperienceBuffDetector(assets){
  return {
    assets:assets.map(asset=>({...asset,templates:new Map(),last:null,cursor:0})),
    records:{},checked:{},misses:{},format:null
  };
}

export function readExperienceBuffMinutes(hit,main){
  const {preview,size}=hit;
  const minute={min:10,longTimer:true,aligned:true,minuteLabel:true,light:true,minGlyphHeight:.14};
  const votes=new Map();
  let primary=null;
  const add=(reading,source)=>{
    if(!Number.isInteger(reading.seconds) || reading.seconds<10 || reading.seconds>180 || reading.confidence<.80)return;
    const vote=votes.get(reading.seconds) ?? {sources:new Set(),confidence:0};
    vote.sources.add(source);
    vote.confidence=Math.max(vote.confidence,reading.confidence);
    votes.set(reading.seconds,vote);
  };
  for (const area of [[.02,.63,.64,1],[0,.66,.55,.99],[.02,.63,.47,.97],[.095,.69,.46,.92],
    [0,.64,.42,.96],[.025,.70,.39,.98],[0,.66,.42,1],[0,.64,.34,1],[0,.69,.37,1]]) {
    for (const options of [{background:main.rgba},{lightThreshold:215},{background:main.rgba,lightThreshold:175},
      {background:main.rgba,lightThreshold:128},{lightThreshold:180}]) {
      const reading=readDigits(preview,size,{...minute,...options,area});
      if(primary===null && options.background && reading.seconds>=10 && reading.seconds<=180 && reading.confidence>=.85) {
        primary=reading.seconds;
      }
      add(reading,options.background ? 'background' : 'brightness');
    }
  }
  // The outlined minute text hugs the left and bottom edges of the slot.
  // Try that tighter crop when bright artwork bleeds into the usual box.
  for (const area of [[0,.65,.35,1],[0,.69,.4,1],[0,.57,.47,1],[0,.63,.46,1],[0,.68,.44,1],[0,.61,.55,1]]) {
    for (const lightThreshold of [145,185,215]) {
      const reading=readDigits(preview,size,{...minute,area,lightThreshold,outlinedLight:true});
      add(reading,'outline');
    }
  }
  const ranked=[...votes].sort((a,b)=>b[1].sources.size-a[1].sources.size || b[1].confidence-a[1].confidence);
  if(ranked[0]?.[1].sources.size>=2 &&
     (ranked[0][1].sources.size>(ranked[1]?.[1].sources.size ?? 0) ||
      ranked[0][1].confidence>=ranked[1][1].confidence+.055))return ranked[0][0];
  if(primary!==null && votes.get(primary)?.confidence>=.92)return primary;
  // The counter and the fragment HUD both use small, outlined digits.
  // Require the same result in more than one brightness mask.
  const frame={rgba:preview,w:size,h:size};
  for(const [top,width] of [[.67,.41],[.72,.45],[.61,.48]]){
    const box={x:0,y:Math.floor(size*top),w:Math.ceil(size*width),h:size-Math.floor(size*top)};
    const reads=['fragment','fragment-dim','fragment-soft'].map(tone=>readScreenText(frame,box,tone));
    for(const read of reads){
      if(!/^[1-9]\d{1,2}$/.test(read.text) || Number(read.text)>180 || read.confidence<.87)continue;
      if(reads.filter(other=>other.text===read.text && other.confidence>=.85).length>=2)return Number(read.text);
    }
  }
  return null;
}

function readMinuteAtSlot(frame,hit){
  const size=hit.size,margin=Math.max(1,Math.round(size*.06));
  const width=size+margin*2;
  const rgba=new Uint8ClampedArray(width*width*4);
  const left=hit.x-margin;
  const top=hit.y;
  for(let y=0;y<width && top+y<frame.h;y++)for(let x=0;x<width;x++){
    const sourceX=left+x;
    if(sourceX<0 || sourceX>=frame.w)continue;
    const i=((top+y)*frame.w+sourceX)*4;
    rgba.set(frame.rgba.subarray(i,i+4),(y*width+x)*4);
  }
  // Match the usable lower row after allowing for a slightly offset icon box.
  const reads=new Map();
  const view={rgba,w:width,h:width};
  for(const [y,w] of [[.62,.53],[.66,.48],[.70,.45],[.74,.42],[.70,.37]]){
    const box={x:0,y:size*y,w:size*w+margin,h:size*(1-y)+margin};
    for(const tone of ['fragment-outline','fragment','fragment-dim','fragment-soft']){
      const result=readScreenText(view,box,tone);
      if(!/^[1-9]\d{1,2}$/.test(result.text) || Number(result.text)>180 || result.confidence<.82)continue;
      const reading=reads.get(result.text) ?? {tones:new Set(),confidence:0};
      reading.tones.add(tone);
      reading.confidence=Math.max(reading.confidence,result.confidence);
      reads.set(result.text,reading);
    }
  }
  const confirmed=[...reads].filter(([,reading])=>reading.tones.size>=2 && reading.confidence>=.86);
  const best=confirmed.length===1 ? confirmed[0][0] : null;
  return best ? {seconds:Number(best)*60,approx:true} : null;
}

export function matchesUnionColor(frame,x,y,size,group){
  let gold=0,green=0;
  // The top of the icon stays clear of the central countdown and the
  // white minute label. Ignore the shared gray outline and white letters.
  for(let row=Math.ceil(size*.13);row<Math.floor(size*.41);row++){
    for(let col=Math.ceil(size*.13);col<Math.floor(size*.87);col++){
      const p=((y+row)*frame.w+x+col)*4;
      const r=frame.rgba[p],g=frame.rgba[p+1],b=frame.rgba[p+2];
      const sum=r+g+b;
      if (r>=g+Math.max(10,sum*.028) && g>=b+Math.max(12,sum*.035)) gold++;
      if (g>=r+Math.max(11,sum*.034) && g>=b+Math.max(12,sum*.039)) green++;
    }
  }
  const [wanted,other]=group==='wealth' ? [gold,green] : [green,gold];
  return wanted>=Math.max(4,Math.round(size*size*.016)) && wanted>=other*2.3;
}

function readTimer(hit,main,format,region){
  const {preview,size}=hit;
  const base={min:1,longTimer:true,aligned:true,runeCooldown:true,buffSeconds:true};
  const center={...base,area:[.02,.26,.98,.77]};
  const acceptable=reading=>reading.seconds>0 && reading.seconds<=10800 && reading.confidence>=.85;
  for (const options of [{...center,clockOnly:true,background:main.rgba},{...center,clockOnly:true}]) {
    const reading=readDigits(preview,size,options);
    if (acceptable(reading)) return {seconds:reading.seconds,approx:false};
  }
  // White bottom-left labels and yellow center digits represent different units.
  // A centered three-digit result is more reliable than white icon artwork.
  const secondsReadings=[];
  for (const options of [{...center,background:main.rgba},center,{...center,faintYellow:true,background:main.rgba},
    {...center,area:[0,.21,1,.84],faintYellow:true,background:main.rgba,minGlyphHeight:.14},
    {...center,area:[.05,.28,.97,.76],faintYellow:true,minGlyphHeight:.14}]) {
    const raw=readDigits(preview,size,options);
    const reading=applyTimerFormat(raw,format);
    if (!acceptable(reading) || reading.seconds>=600)continue;
    secondsReadings.push({seconds:reading.seconds,confidence:reading.confidence,raw:raw.seconds});
  }
  const repeatedSeconds=secondsReadings.find(read=>read.raw>=100 &&
    secondsReadings.filter(other=>other.raw===read.raw).length>=2);
  if(repeatedSeconds)return {seconds:repeatedSeconds.seconds,approx:false};
  const minutes=readExperienceBuffMinutes(hit,main);
  if (minutes!==null) return {seconds:minutes*60,approx:true};
  if(secondsReadings.length) {
    const best=secondsReadings.sort((a,b)=>b.confidence-a.confidence)[0];
    return {seconds:best.seconds,approx:false};
  }
  return readMinuteAtSlot(region,hit) ?? {seconds:null,approx:false};
}

function readMultiplier(hit){
  for (const area of [[.62,.09,.90,.32],[.59,.08,.91,.35]]) {
    const reading=readDigits(hit.preview,hit.size,{area,light:true,lightThreshold:205,min:2});
    if (reading.confidence>=.89 && reading.seconds>=2 && reading.seconds<=5) return reading.seconds;
  }
  return null;
}

function identityAt(region,asset,hit,refs){
  const {x,y,size}=hit;
  const match=(reference,mode,thr=.75)=>detect(region,{
    main:templateFor(reference,size,mode),minColor:.88,thr,readTimer:false,last:{x,y}
  },{allowScan:false,trackRadius:0});
  const vip=refs.find(reference=>reference.group==='vip');
  const own=match(asset,'coupon-top');
  const vipTop=vip && (vip===asset ? own : match(vip,'coupon-top'));
  const vipMark=vip && match(vip,'vip-mark',.65);
  const score=matched=>matched?.found ? matched.score+matched.color : 0;
  const vipEdges=vip && match(vip,'vip-edges',.86);
  const header=match(asset,'hud-header',.78);
  const vipHeader=vip && (asset===vip ? header : match(vip,'hud-header',.78));
  const headerWins=vipHeader?.found && vipHeader.color>=.92 && !refs.some(reference=>{
    if(reference.group==='vip')return false;
    return score(match(reference,'hud-header',.78))>=score(vipHeader)-.045;
  });
  const vipIdentity=[vipTop,vipEdges,headerWins ? vipHeader : null].sort((a,b)=>score(b)-score(a))[0];
  const ownsVip=(vipTop?.found && vipTop.color>=.92 &&
    (vipTop.score>=.84 || vipMark?.found)) || (vipEdges?.found && vipEdges.color>=.94) || headerWins;
  if(asset.group==='vip' && !ownsVip)return false;
  if(asset.group!=='vip' && ownsVip &&
     (!own.found || score(vipIdentity)>=score(own)-.02))return false;
  return !refs.some(reference=>{
    if(reference.group===asset.group || reference.group==='vip')return false;
    const other=match(reference,'coupon-top');
    const margin=asset.group==='vip' ? .025 : .04;
    const otherHeader=match(reference,'hud-header',.78);
    const strongerHeader=header.found && score(header)>=score(otherHeader)+.055;
    return other.found && !strongerHeader && score(other)>(asset.group==='vip' ? score(vipIdentity) : score(own))+margin;
  });
}

function findAsset(region,asset,large,format,neighbors=[],coupons=[]) {
  const first=large?45:32;
  const candidates=asset.last ? [asset.last.size,first] :
    [first,asset.main.w,sizes[asset.cursor++%sizes.length]];
  const acceptPosition=asset.group==='luck' || asset.group==='wealth'
    ? (x,y,size)=>matchesUnionColor(region,x,y,size,asset.group)
    : expIdentityGroup(asset.group) ? (x,y,size)=>identityAt(region,asset,{x,y,size},coupons) : undefined;
  if(asset.last){
    const {size,mode}=asset.last;
    const main=templateFor(asset,size);
    const hit=detect(region,{main:templateFor(asset,size,mode),minColor:.90,thr:.87,
      readTimer:false,acceptPosition,last:asset.last},{allowScan:false,trackRadius:2});
    if(hit.found){
      const reading=readTimer(hit,main,format,region);
      if(reading.seconds){
        asset.last={x:hit.x,y:hit.y,size,mode};
        return {hit,main,mode,reading,file:asset.file,group:asset.group};
      }
    }
  }
  let best=null,bestTimed=null;
  for (const size of new Set(candidates)) {
    const main=templateFor(asset,size);
    const target={main,minColor:.86,thr:.86,readTimer:false,acceptPosition,scanOptions:{coarseMin:.48,maxCands:12}};
    const last=asset.last?.size===size ? asset.last : null;
    const hit=(last && detect(region,{...target,last},{allowScan:false,trackRadius:3})) || {};
    const match=hit.found ? hit : detect(region,target);
    if (!match.found) continue;
    const candidate={hit:match,main,mode:'wide-timer',reading:readTimer(match,main,format,region)};
    if (!best || matchScore(candidate)>matchScore(best)) best=candidate;
    if(candidate.reading.seconds && (!bestTimed || matchScore(candidate)>matchScore(bestTimed)))bestTimed=candidate;
  }
  best=bestTimed ?? best;
  // Match the upper artwork even when the normal match found a candidate
  // but couldn't read its timer. Keep a strong untimed match as pending.
  if (!best?.reading?.seconds) {
    // Probe the current size first when no slot has been found yet.
    const minuteSizes=best ? [best.hit.size,first] : [first,asset.main.w,candidates.at(-1)];
    for (const size of new Set(minuteSizes)) {
      const main=templateFor(asset,size);
      const hit=detect(region,{main:templateFor(asset,size,'minute-timer'),minColor:.91,thr:.91,
        readTimer:false,acceptPosition,scanOptions:{coarseMin:.46,maxCands:18}});
      if (!hit.found) continue;
      const reading=readTimer(hit,main,format,region);
      const score=hit.score+hit.color;
      if (reading.seconds!==null) {
        if (!best?.reading?.seconds || score>best.hit.score+best.hit.color) {
          best={hit,main,mode:'minute-timer',reading};
        }
      } else if (!best || (!best.reading?.seconds && score>best.hit.score+best.hit.color)) {
        best={hit,main,mode:'minute-timer',reading:{seconds:null,approx:false}};
      }
    }
  }
  if(!best?.reading?.seconds){
    for(const size of new Set([best?.hit.size ?? asset.main.w,asset.main.w,first])){
      const main=templateFor(asset,size);
      const mode=asset.group==='vip' ? 'vip-edges' : 'coupon-top';
      const last=best?.hit.size===size ? {x:best.hit.x,y:best.hit.y} : null;
      const target={main:templateFor(asset,size,mode),minColor:.94,thr:.88,
        readTimer:false,acceptPosition,scanOptions:{coarseMin:.50,maxCands:20}};
      const tracked=last && detect(region,{...target,last},{allowScan:false,trackRadius:2});
      const hit=tracked?.found ? tracked : detect(region,target);
      if(!hit.found)continue;
      const reading=readTimer(hit,main,format,region);
      const candidate={hit,main,mode,reading};
      if(reading.seconds ? !best?.reading?.seconds || matchScore(candidate)>matchScore(best) :
        !best || (!best.reading.seconds && matchScore(candidate)>matchScore(best)))best=candidate;
    }
  }
  if(!best?.reading?.seconds && (asset.group==='vip' || asset.group==='gold')){
    for(const slot of neighbors){
      const size=slot.size,mode=asset.group==='vip' ? 'vip-edges' : 'coupon-top';
      const main=templateFor(asset,size);
      const target={main:templateFor(asset,size,mode),minColor:.94,thr:.84,readTimer:false,acceptPosition};
      for(const n of [-1,1,-2,2,-3,3]){
        const last={x:slot.x+n*size,y:slot.y};
        const hit=detect(region,{...target,last},{allowScan:false,trackRadius:3});
        if(!hit.found)continue;
        const reading=readTimer(hit,main,format,region);
        const candidate={hit,main,mode,reading};
        if(reading.seconds ? !best?.reading?.seconds || matchScore(candidate)>matchScore(best) :
          !best || (!best.reading.seconds && matchScore(candidate)>matchScore(best)))best=candidate;
      }
    }
  }
  if(!best?.reading?.seconds && expIdentityGroup(asset.group)){
    for(const size of new Set([asset.main.w,first])){
      const mode='hud-header';
      const main=templateFor(asset,size);
      const hit=detect(region,{main:templateFor(asset,size,mode),minColor:.93,thr:.82,
        readTimer:false,acceptPosition,scanOptions:{coarseMin:.45,maxCands:16}});
      if(!hit.found)continue;
      const reading=readTimer(hit,main,format,region);
      const candidate={hit,main,mode,reading};
      if(reading.seconds ? !best?.reading?.seconds || matchScore(candidate)>matchScore(best) :
        !best || (!best.reading.seconds && matchScore(candidate)>matchScore(best)))best=candidate;
    }
  }
  // The lower timer overlay can darken the coupon artwork but leaves the
  // upper-right plus or R+ badge visible. Check nearby HUD slots first.
  if(asset.group==='bonus' && !best?.reading?.seconds){
    const badgeSizes=new Set([best?.hit.size ?? first,asset.main.w,...neighbors.map(slot=>slot.size)]);
    for(const size of badgeSizes) {
      const main=templateFor(asset,size);
      const badge=templateFor(asset,size,'bonus-badge');
      const target={main:badge,minColor:.92,thr:.92,readTimer:false,acceptPosition,
        scanOptions:{coarseMin:.58,maxCands:12}};
      const offsets=[-1,1,-2,2];
      const nearby=neighbors.filter(slot=>slot.size===size).flatMap(slot=>offsets.map(n=>({
        x:slot.x+n*size,y:slot.y
      })));
      const matches=nearby.map(last=>detect(region,{...target,last},{allowScan:false,trackRadius:3}));
      if(!matches.some(hit=>hit.found))matches.push(detect(region,target));
      for(const hit of matches){
        if(!hit.found)continue;
        const reading=readTimer(hit,main,format,region);
        if(!reading.seconds)continue;
        const candidate={hit,main,mode:'bonus-badge',reading};
        if(best?.reading?.seconds && matchScore(best)>=matchScore(candidate))continue;
        best=candidate;
      }
    }
  }
  asset.last=best?{x:best.hit.x,y:best.hit.y,size:best.hit.size,mode:best.mode}:null;
  return best && {...best,file:asset.file,group:asset.group};
}

function identifyBuff(candidate,region,assets) {
  const {hit,group,mode,file}=candidate;
  const fixedMultiplier=Number(file.match(/_([345])배$/)?.[1]) || null;
  const visibleMultiplier=(group==='multiplier' || group==='bonus') ? readMultiplier(hit) : null;
  const multiplier=fixedMultiplier ?? visibleMultiplier;
  if (group==='multiplier' && !multiplier) return null;
  for (const rival of assets) {
    if (rival.group!==similarGroups[group]) continue;
    if (rival.group==='multiplier' && rival.file==='경험치_x배' && !visibleMultiplier) continue;
    const rivalMode=modes.includes(mode) ? mode : 'coupon-top';
    const own=mode==='bonus-badge' ? detect(region,{main:templateFor(candidate,hit.size,rivalMode),
      minColor:.82,thr:.72,readTimer:false,last:{x:hit.x,y:hit.y}},{allowScan:false,trackRadius:0}) : hit;
    const other=detect(region,{main:templateFor(rival,hit.size,rivalMode),minColor:.84,thr:.84,
      readTimer:false,last:{x:hit.x,y:hit.y}},{allowScan:false,trackRadius:1});
    const margin=group==='bonus' || group==='multiplier'
      ? (rival.group==='multiplier' && !visibleMultiplier ? .065 : .018) : -.06;
    if (other.found && (!own.found || other.score+other.color>own.score+own.color+margin)) {
      return expIdentityGroup(group) ? null : {multiplier:null,seconds:null,approx:false};
    }
  }
  return {...candidate.reading,multiplier:group==='multiplier' ? multiplier : null};
}

export function scanExperienceBuffs(detector,frame,now,cropFrame,onlyPending=false,cropped=onlyPending){
  const {assets,records,checked,misses}=detector;
  if (detector.format!==frame.timerFormat) {
    detector.format=frame.timerFormat;
    for (const [group,record] of Object.entries(records)) {
      record.sample=null;
      if (record.deadline<=now) delete checked[group];
    }
  }
  const isUnion=asset=>asset.group==='luck' || asset.group==='wealth';
  const besideUnion=asset=>asset.group==='vip' || asset.group==='gold';
  const unionSeen=assets.some(asset=>isUnion(asset) && asset.last);
  const due=assets.filter(asset=>{
    const record=records[asset.group];
    const pending=experienceBuffPending(record,now);
    const active=record?.deadline>now;
    if (onlyPending && !pending && !(active && record.deadline-now<=12000)) return false;
    if (onlyPending && pending && record.sample && now-record.sample.at<3500 &&
        record.sample.file!==asset.file && assets.some(other=>other.file===record.sample.file && other.last)) return false;
    const often=asset.group==='bonus' || asset.group==='multiplier' || (unionSeen && besideUnion(asset));
    const interval=active
      ? (record.deadline-now<=12000 ? 450 : record.approx || record.sample?.deadline!==record.deadline ? 5000 : 30000)
      : pending ? (now-record.pendingSince>6500 ? 1500 : 450) :
        (often ? 2500 : 3000*2**Math.max(0,(misses[asset.group] ?? 0)-1));
    return now-(checked[asset.group] ?? -Infinity)>=interval;
  });
  if (!due.length) return records;
  const {x,h}=experienceBuffHud(frame.w,frame.h);
  const region=cropped ? frame : cropFrame(frame,x,0,frame.w-x,h).frame;
  const large=(frame.sourceWidth ?? frame.w)>=1800;
  const coupons=assets.filter(asset=>expIdentityGroup(asset.group));
  const hits=due.filter(asset=>asset.group!=='bonus' && !besideUnion(asset))
    .map(asset=>findAsset(region,asset,large,frame.timerFormat,[],coupons)).filter(Boolean);
  const anchors=assets.filter(asset=>isUnion(asset) && asset.last).map(asset=>asset.last);
  for(const asset of due.filter(besideUnion)){
    const hit=findAsset(region,asset,large,frame.timerFormat,anchors,coupons);
    if(hit)hits.push(hit);
  }
  const neighbors=assets.filter(asset=>asset.group==='multiplier' && asset.last).map(asset=>asset.last);
  for (const asset of due.filter(asset=>asset.group==='bonus')) {
    const hit=findAsset(region,asset,large,frame.timerFormat,neighbors,coupons);
    if(hit)hits.push(hit);
  }
  hits.sort((a,b)=>matchScore(b)-matchScore(a));
  const classified=hits.map(candidate=>({...candidate,reading:identifyBuff(candidate,region,assets)}))
    .filter(candidate=>candidate.reading);
  const groups=new Set(due.map(asset=>asset.group));
  for (const group of groups) {
    checked[group]=now;
    const candidates=classified.filter((candidate,index)=>candidate.group===group && !classified.some((other,otherIndex)=>{
      if(other.group===group || !sameSlot(candidate.hit,other.hit))return false;
      if(expIdentityGroup(group) && expIdentityGroup(other.group))return otherIndex<index;
      if(other.group===similarGroups[group]) {
        return candidate.reading.seconds && other.reading.seconds && otherIndex<index;
      }
      return matchScore(other)>=matchScore(candidate)-.04;
    }));
    const candidate=candidates.find(hit=>hit.reading.seconds) ?? candidates[0];
    if (!candidate) {
      if (!experienceBuffPending(records[group],now)) misses[group]=Math.min((misses[group] ?? 0)+1,3);
      continue;
    }
    misses[group]=0;
    records[group]=observeExperienceBuff(records[group],{file:candidate.file,...candidate.reading},now);
  }
  return records;
}
