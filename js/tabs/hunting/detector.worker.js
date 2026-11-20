import { WINDOW_RUNE_COOLDOWN } from '../../data/monitor-reference.js';
/* 크기별 전체 탐색은 순환 실행하고, 발견한 크기와 위치는 매 프레임 추적한다. */
import { makeTemplate, prepareFrame, detect, resizeIcon } from './matcher.js';
import { applyTimerFormat, readDigits } from './digits.js';
import { analyzeExperience, analyzeScreen, resetScreenMonitor } from './screen-monitor.js';
import {createExperienceBuffDetector,scanExperienceBuffs} from './experience-buff-detector.js';
import {readVipBooster} from './vip-booster.js';
import {readStackCount} from './stack-count.js';
import {isDeathBlossom} from './job-installers.js';

const SIZES = [32, 45, 44, 24, 28, 20, 26, 30, 22, 18, 16, 34, 36, 40, 48, 64];
// Keep the common sizes first, then cover intermediate UI scales.
const INSTALLER_SIZES = [...new Set([
  ...SIZES, ...Array.from({length:49}, (_, i) => i+16), 68,72,76,80,88,96
])];
let targets = [], generation = 0, dimensions = '', scanCursor = 0;
let installerSize = null;
let experienceBox = null;
let boosterDimensions = '', boosterTile = 0, lastBoosterTile = null;
let buffDetector=createExperienceBuffDetector([]),buffConfig='',buffDimensions='';
const isLara = target => target.file?.startsWith('라라_');
const isInstaller = target => target.id === "janus" || target.id === "fountain" || target.id.startsWith("job-");
const runeTypes = ['rune_normal','rune_blessed','rune_cooldown'];
const isCaptainBomber = target => target.file?.startsWith('캡틴_');
const isBattleship = target => target.file?.includes('배틀쉽_봄버');
const tpl = (img,whole=false) => makeTemplate(img.rgba, img.w, img.h,whole);

function readBlossomTimer(hit, format) {
  const options = {
    area:[.27,.378,.74,.667],min:1,goldTimer:true,aligned:true
  };
  const outlined = readDigits(hit.preview,hit.size,{...options,goldRatio:.82,outlinedGold:true});
  const reading = outlined.seconds !== null ? outlined : readDigits(hit.preview,hit.size,options);
  return applyTimerFormat(reading,format);
}

function readInstallerClock(hit, background) {
  const wide = {area:[.02,.24,1,.79],min:1,aligned:true};
  const strip = {...wide,area:[.125,.36,.875,.67]};
  for (const settings of [{...wide,background},{...strip,faintYellow:true},
    {...wide,faintYellow:true,background}]) {
    const clock = readDigits(hit.preview,hit.size,{...settings,clockOnly:true});
    if (clock.seconds !== null) return clock;
  }
  let inferred, seconds;
  for (const settings of [{...strip,background},strip]) {
    const reading = applyTimerFormat(readDigits(hit.preview,hit.size,settings),'clock');
    if (reading.seconds === null) continue;
    if (reading.clock) {
      if (!inferred || reading.confidence > inferred.confidence) inferred = reading;
    } else if (!seconds || reading.confidence > seconds.confidence) {
      seconds = reading;
    }
  }
  return inferred ?? (hit.clock ? hit : seconds) ?? {seconds:null,confidence:0,digit:'uncertain'};
}

function cropFrame(frame, x, y, w, h) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * frame.w + x) * 4;
    pixels.set(frame.rgba.subarray(start, start + w * 4), row * w * 4);
  }
  const crop=prepareFrame(pixels,w,h);
  crop.timerFormat=frame.timerFormat;
  return {frame:crop,x,y};
}

function trackInCrop(frame,variant,radius,variantAt) {
  const {x,y}=variant.last;
  const left=Math.max(0,x-radius),top=Math.max(0,y-radius);
  const right=Math.min(frame.w,x+variant.main.w+radius);
  const bottom=Math.min(frame.h,y+variant.main.h+radius);
  const region=cropFrame(frame,left,top,right-left,bottom-top);
  const tracked={...variantAt(variant,region),last:{x:x-left,y:y-top}};
  const result=detect(region.frame,tracked,{allowScan:false,trackRadius:radius});
  result.x+=left;
  result.y+=top;
  return result;
}

const windowCooldown = makeTemplate(WINDOW_RUNE_COOLDOWN.rgba,32,32,true);

const isBuff = target => target.id !== 'rune_marker' && target.id !== 'fragments_icon';
function readExperienceBuffs(frame,now,dimensions) {
  if (buffDimensions!==dimensions) {
    buffDimensions=dimensions;
    for (const asset of buffDetector.assets) asset.last=null;
  }
  return scanExperienceBuffs(buffDetector,frame,now,{maxGroups:frame.w>=1800 ? 1 : 2});
}

function findVipBooster(frame) {
  const size = frame.w+'x'+frame.h;
  if (size !== boosterDimensions) {
    boosterDimensions = size;
    boosterTile = 0;
    lastBoosterTile = null;
  }
  const w = Math.min(frame.w,Math.max(180,Math.ceil(frame.w*.38)));
  const h = Math.min(frame.h,Math.max(100,Math.ceil(frame.h*.38)));
  for (const tile of new Set([lastBoosterTile,boosterTile++%16,boosterTile++%16])) {
    if (tile === null) continue;
    const x = Math.round((tile%4)*(frame.w-w)/3);
    const y = Math.round(Math.floor(tile/4)*(frame.h-h)/3);
    const timer = readVipBooster(cropFrame(frame,x,y,w,h).frame);
    if (timer === null) continue;
    lastBoosterTile = tile;
    return timer;
  }
  lastBoosterTile = null;
  return null;
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'config') {
      generation = data.generation;
      const assets=data.experienceBuffAssets ?? [];
      const buffKey=JSON.stringify([data.captureRevision,assets.map(asset=>asset.file)]);
      if (buffKey!==buffConfig) {
        buffConfig=buffKey;
        buffDetector=createExperienceBuffDetector(assets);
        buffDimensions='';
      }
      targets = data.targets.map(t => ({
        id: t.id, file: t.file, trackingMode:t.trackingMode, cursor: 0, lastScan: 0, locked: null, misses: 0,
        installerAttempts: 0, lastMatchedSize: null,
        variants: [...new Set([t.main.w, ...(isInstaller(t) ? INSTALLER_SIZES : t.sizes || SIZES),
          ...(t.id==='fragments_icon' || runeTypes.includes(t.id) ? Array.from({length:45},(_,i)=>i+20) : [])])].map(size => ({
          thr: !t.id.startsWith('job-') && isInstaller(t) && size >= 40 && size !== t.main.w ? t.thr-.045 : t.thr,
          minColor:t.id.startsWith('job-') ? .85 : undefined,
          strongShape:isDeathBlossom(t.file) ? {score:.92,minColor:.78} : undefined,
          readTimer:t.trackingMode==='count' ? false : undefined,
          colorMode:t.colorMode, marker: !!t.marker, main: tpl(resizeIcon(t.fhd && size >= 15 ? t.fhd : t.main, size),
            t.trackingMode==='count' ? 'stack-count' : isLara(t) || isDeathBlossom(t.file) ? 'wide-timer' : t.whole),
          reject: t.reject ? tpl(resizeIcon(t.reject, size)) : null, last: null
        }))
      }));
      dimensions = '';scanCursor=0;resetScreenMonitor(); experienceBox = null; boosterDimensions = '';
      return;
    }
    if (data.generation !== generation) return;
    const t0 = performance.now();
    if (data.type!=='frame') return;
    const installerOnly = data.installerOnly || Boolean(data.targetIds);
    const dims = data.w + 'x' + data.h;
    if (dimensions !== dims) {
      targets.forEach(t => {
        t.locked = null;
        t.misses = 0;
        t.cursor = 0;
        t.lastScan = 0;
        t.installerAttempts = 0;
        t.lastMatchedSize = null;
        t.variants.forEach(v => v.last = null);
      });
      installerSize = null;
      dimensions = dims;resetScreenMonitor(); experienceBox = null;
    }
    const F = prepareFrame(new Uint8ClampedArray(data.buffer), data.w, data.h);
    if (data.externalExperience) {
      const box=data.experienceBox;
      experienceBox=box?.sourceWidth===F.w && box.sourceHeight===(data.contentHeight ?? F.h) ? box : null;
    }
    const readExp=!installerOnly && !data.externalExperience && data.scanExperience!==false;
    const expFrame = readExp && data.contentHeight > 0 && data.contentHeight < F.h
      ? {rgba:F.rgba,w:F.w,h:data.contentHeight} : F;
    const firstExperience = !data.targetIds && readExp ? analyzeExperience(expFrame,data.t) : null;
    const publishExperienceEarly = firstExperience?.value && !experienceBox;
    if (publishExperienceEarly) {
      experienceBox=firstExperience.box;
      postMessage({type:'experience-ready',generation,t:data.t,results:[],monitor:{exp:firstExperience}});
    }
    F.timerFormat=data.timerFormat;
    const selected = targets.filter(t => (!data.targetIds || data.targetIds.includes(t.id)) &&
      (data.scanRune!==false || !t.id.startsWith('rune_')) &&
      (data.scanFragments!==false || t.id!=='fragments_icon'));
    const searching = selected.filter(target => target.locked === null)
      .sort((a,b) => a.lastScan - b.lastScan);
    const fullScanTargets = new Set(searching.slice(0,2));
    const outsideShortcutBar = (x,y,size) => x+size*.5 < F.w*.57 || y+size*.5 < F.h*.86;
    const results = selected.map(target => {
      const variantAt = (variant, region) => ({
        ...variant, acceptPosition:(x,y,size)=>outsideShortcutBar(x+(region?.x ?? 0),y+(region?.y ?? 0),size)
      });
      if (target.locked !== null) {
        const variant = target.variants[target.locked];
        const radius = target.misses ? variant.main.w : isInstaller(target) ? 8 : 3;
        const trackingVariant = isDeathBlossom(target.file) ? {...variant,thr:variant.thr-.04} : variant;
        const hit = trackInCrop(F,trackingVariant,radius,variantAt);
        if (hit.found) {
          variant.last = {x:hit.x,y:hit.y};
          target.misses = 0;
          return {id:target.id,...hit};
        }
        if (++target.misses < 2) return {id:target.id,...hit};
        variant.last = null;
        target.cursor = target.locked;
        target.locked = null;
        target.lastScan = 0;
        target.installerAttempts = 0;
      }
      if (!fullScanTargets.has(target)) {
        return {id:target.id,found:false,score:0,mode:'wait'};
      }
      target.lastScan = ++scanCursor;
      let result = {found:false,score:0,mode:'scan'};
      const blossom = isDeathBlossom(target.file);
      const sizeChecks = target.id === 'fragments_icon' ? 3 : 1;
      for (let attempt=0; attempt<sizeChecks; attempt++) {
        let index;
        if (isInstaller(target)) {
          // Keep checking the usual scale even if the icon was absent when sharing began.
          const preferredSize = target.lastMatchedSize ?? installerSize ?? target.variants[0].main.w;
          const preferred = Math.max(0,target.variants.findIndex(variant => variant.main.w === preferredSize));
          if (target.installerAttempts++ % 2 === 0) {
            index = preferred;
          } else {
            index = target.cursor++ % target.variants.length;
            if (index === preferred) index = target.cursor++ % target.variants.length;
          }
        } else {
          index = target.cursor++ % target.variants.length;
        }
        const variant = target.variants[index];
        const hit = detect(F,{
          ...variantAt(variant),
          scanOptions: (blossom || target.id === 'fountain') && (index === 0 || variant.main.w === installerSize)
            ? {coarseMin:.20,maxCands:96} : {coarseMin:.40,maxCands:24},
          preferResult: blossom ? candidate => {
            const reading = readBlossomTimer(candidate,F.timerFormat);
            if (reading.seconds === null || reading.confidence < .87) return false;
            Object.assign(candidate,reading);
            return true;
          } : undefined
        });
        if (!hit.found) {
          if (hit.score > result.score) result = hit;
          continue;
        }
        variant.last = {x:hit.x,y:hit.y};
        target.locked = index;
        target.misses = 0;
        if (isInstaller(target)) {
          target.lastMatchedSize = hit.size;
          if (!blossom || hit.seconds !== null) installerSize = hit.size;
        }
        return {id:target.id,...hit};
      }
      return {id:target.id,...result};
    });
    const jobHits=results.filter(r=>r.found && r.id.startsWith('job-'));
    const fileOf=id=>targets.find(target=>target.id===id)?.file;
    for (const hit of jobHits) {
      const ambiguous=jobHits.some(other=>other!==hit && fileOf(other.id)!==fileOf(hit.id) &&
        Math.abs(other.x-hit.x)<hit.size*.4 && Math.abs(other.y-hit.y)<hit.size*.4 &&
        other.score+other.color>=hit.score+hit.color-.06);
      if (ambiguous) {
        const target=targets.find(t=>t.id===hit.id);
        if (target.locked!==null) target.variants[target.locked].last=null;
        target.locked=null;
        Object.assign(hit,{found:false,identity:false,seconds:null});
      }
    }
    const bomberAlternates = [];
    for (const result of results) {
      const target = targets.find(item => item.id === result.id);
      if (!result.found || !target || !isBattleship(target)) continue;
      const variant = target.variants[target.locked];
      const size = result.size;
      const x = Math.max(0,result.x-size*3), y = Math.max(0,result.y-size);
      const right = Math.min(F.w,result.x+size*4), bottom = Math.min(F.h,result.y+size*2);
      const nearby = cropFrame(F,x,y,right-x,bottom-y);
      const alternate = detect(nearby.frame,{
        ...variant,last:null,scanOptions:{coarseMin:.42,maxCands:24},
        acceptPosition:(px,py,w) => {
          const ax=px+x, ay=py+y;
          return (ax+w*.5<F.w*.57 || ay+w*.5<F.h*.86) &&
            (Math.abs(ax-result.x)>=size*.8 || Math.abs(ay-result.y)>=size*.8);
        }
      });
      if (alternate.found) bomberAlternates.push({id:result.id,...alternate,x:alternate.x+x,y:alternate.y+y});
    }
    for (const result of [...results,...bomberAlternates]) {
      if (!result.id.startsWith('job-') || !result.found) continue;
      const target = targets.find(item => item.id === result.id);
      const background = target?.variants[target.locked]?.main.rgba;
      if (!background) continue;
      if (F.timerFormat==='clock' && (isLara(target) || isBattleship(target))) {
        Object.assign(result,readInstallerClock(result,background));
        continue;
      }
      if (result.unit==='seconds') continue;
      if(target.trackingMode==='count') {
        Object.assign(result,readStackCount(result.preview,result.size,background));
        continue;
      }
      if (isDeathBlossom(target.file)) {
        const reading = readBlossomTimer(result,F.timerFormat);
        if (reading.seconds !== null) {
          Object.assign(result,reading);
          continue;
        }
      }
      // All registered skills use the same countdown OCR. Keep the full
      // width so three digits or a clock can extend past the central strip.
      const wide={area:[.02,.27,1,.77],min:1,aligned:true};
      const strip={...wide,area:[.045,.34,.97,.71]};
      const clock={...wide,clockOnly:true};
      const passes=[
        {...clock,background},clock,
        {...clock,faintYellow:true,background},
        {...wide,background},wide,
        {...strip,background},strip,
        {...strip,background,faintYellow:true,runeCooldown:true},
        {...strip,faintYellow:true,runeCooldown:true},
        {...wide,background,light:true}
      ];
      let shared;
      for (const options of passes) {
        const reading=applyTimerFormat(readDigits(result.preview,result.size,options),F.timerFormat);
        if (reading.seconds===null) continue;
        if (reading.clock || reading.seconds>=100 || reading.confidence>=.90) {
          shared=reading;
          break;
        }
        if (!shared || reading.confidence>shared.confidence) shared=reading;
      }
      if (shared && (shared.clock || shared.seconds>=100 || shared.confidence>=.90)) {
        Object.assign(result,shared);
        continue;
      }

      // Gold skill art can touch the numbers. A narrower crop remains a
      // fallback for those icons when the shared pass is uncertain.
      const center = [.16,.31,.84,.69];
      if (isCaptainBomber(target)) {
        for (const area of [[.29,.36,.71,.66],[.27,.38,.73,.70]]) {
          const timer=applyTimerFormat(readDigits(result.preview,result.size,{area,min:1,aligned:true}),F.timerFormat);
          if (timer.seconds===null) continue;
          Object.assign(result,timer);
          break;
        }
        if (result.seconds!==null) continue;
      }
      let reading = readDigits(result.preview,result.size,{area:center,min:1,background,aligned:true});
      if (reading.seconds === null) {
        reading = readDigits(result.preview,result.size,{area:center,min:1,aligned:true});
      }
      if (reading.seconds !== null) {
        Object.assign(result,reading);
        continue;
      }
      for (const area of [[.08,.16,.92,.87],[.06,.29,.94,.72],[.06,.38,.94,.78],[.06,.52,.94,.96]]) {
        const options = {area,min:1,background};
        reading = readDigits(result.preview,result.size,options);
        if (reading.seconds !== null) break;
        reading = readDigits(result.preview,result.size,{...options,light:true});
        if (reading.seconds !== null) break;
      }
      if (reading.seconds === null && result.size !== 32) {
        const normalized = resizeIcon({rgba:result.preview,w:result.size,h:result.size},32);
        reading = readDigits(normalized.rgba,32,{area:[.10,.28,.90,.76],min:1,aligned:true});
      }
      // Keep the shared reading if the narrower passes found no timer.
      if (reading.seconds!==null) Object.assign(result,reading);
      else if (shared) Object.assign(result,shared);
    }
    for (const result of results) {
      if (!result.found || result.seconds !== null || result.size < 40 ||
          !['janus','fountain'].includes(result.id)) continue;
      const normalized = resizeIcon({rgba:result.preview,w:result.size,h:result.size},32);
      const reading = readDigits(normalized.rgba,32);
      if (reading.seconds !== null) Object.assign(result,reading);
    }
    // Both colored effects can match the same template. Read the other
    // slots in the same buff row even while the primary match is locked.
    const runeBuffIds = ['rune_normal','rune_blessed'];
    const runeAlternates = [];
    for (const primary of results) {
      if (!primary.found || !runeBuffIds.includes(primary.id)) continue;
      const target = targets.find(t => t.id === primary.id);
      const variant = target.variants[target.locked];
      const {size} = primary;
      const x = Math.max(0,primary.x-size*2), y = Math.max(0,primary.y-Math.ceil(size*.25));
      const right = Math.min(F.w,primary.x+size*3);
      const bottom = Math.min(F.h,primary.y+Math.ceil(size*1.25));
      const region = cropFrame(F,x,y,right-x,bottom-y);
      const neighbors = results.filter(r=>r.found && runeTypes.includes(r.id)).concat(runeAlternates);
      const hit = detect(region.frame,{
        ...variant,last:null,thr:variant.thr-.04,
        scanOptions:{coarseMin:.38,maxCands:32},
        acceptPosition:(px,py)=>neighbors.every(r=>
          Math.abs(x+px-r.x)>=size*.65 || Math.abs(y+py-r.y)>=size*.65)
      });
      if (hit.found) runeAlternates.push({id:primary.id,...hit,x:hit.x+x,y:hit.y+y});
    }
    results.push(...runeAlternates);
    for (const result of results) {
      if (!result.found || !runeBuffIds.includes(result.id) ||
          (result.seconds !== null && result.confidence >= .83)) continue;
      const icon = resizeIcon({rgba:result.preview,w:result.size,h:result.size},32);
      for (const reading of [
        readDigits(result.preview,result.size,{min:1,area:[.10,.28,.90,.72],aligned:true}),
        readDigits(icon.rgba,32,{min:1})
      ]) {
        if (reading.seconds !== null && reading.confidence >= .83) {
          Object.assign(result,reading);
          break;
        }
      }
    }
    for (const result of [...results,...bomberAlternates]) {
      if(result.unit==='count')continue;
      Object.assign(result,applyTimerFormat(result,F.timerFormat));
    }
    for (const alternate of bomberAlternates) {
      const primary = results.find(result => result.id === alternate.id);
      if (alternate.seconds !== null && (F.timerFormat!=='clock' || alternate.confidence>=.83) &&
          (primary.seconds === null || (F.timerFormat==='clock' && primary.confidence<.83) || alternate.seconds < primary.seconds)) {
        Object.assign(primary,alternate);
      }
    }
    // A gray icon can pick up a blue fringe from the HUD or the scene.
    // Compare the gray template at each colored candidate before trusting its timer.
    const grayTarget = selected.find(t=>t.id==='rune_cooldown');
    if (grayTarget) {
      const gray = results.find(r=>r.id==='rune_cooldown');
      if (fullScanTargets.has(grayTarget) && !gray.found) {
        const known = detect(F,{main:windowCooldown,thr:.90,acceptPosition:outsideShortcutBar,
          scanOptions:{coarseMin:.38,maxCands:24}});
        if (known.found && known.color>=.90) {
          Object.assign(gray,known,{chroma:{grayTemplate:true}});
        }
      }
      for (const buff of results) {
        if (!buff.found || !runeBuffIds.includes(buff.id)) continue;
        const variant = grayTarget.variants.find(v=>v.main.w===buff.size);
        if (!variant) continue;
        const hit = detect(F,{...variant,colorMode:null,last:{x:buff.x,y:buff.y},thr:.90},
          {allowScan:false,trackRadius:2});
        if (!hit.found || hit.score < buff.score+.025 || hit.color < .91) continue;
        if (!gray.found || hit.score>gray.score) Object.assign(gray,hit,{chroma:{grayTemplate:true}});
        Object.assign(buff,{found:false,identity:false,seconds:null});
      }
    }
    for(const r of results)if(r.id==='rune_cooldown'&&r.found){
      for (const buff of results) {
        if (!buff.found || !['rune_normal','rune_blessed'].includes(buff.id) ||
            Math.abs(buff.x-r.x)>=r.size*.5 || Math.abs(buff.y-r.y)>=r.size*.5) continue;
        Object.assign(buff,{found:false,identity:false,seconds:null});
        const target = targets.find(t=>t.id===buff.id);
        const slot = target.variants[target.locked]?.last;
        if (slot && Math.abs(slot.x-buff.x)<r.size*.5 && Math.abs(slot.y-buff.y)<r.size*.5) {
          target.variants[target.locked].last=null;
          target.locked=null;
        }
      }
      if (r.unit==='seconds') continue;
      const clock=readDigits(r.preview,r.size,{area:[.02,.27,1,.76],aligned:true,runeCooldown:true,clockOnly:true});
      if (clock.unit==='seconds') {
        Object.assign(r,clock);
        continue;
      }
      // The minute label is white and confined to the lower-left slot.
      const minuteArea=[.02,.65,.58,1];
      const minuteOptions={min:10,area:minuteArea,light:true,aligned:true};
      const nativeMinute=readDigits(r.preview,r.size,minuteOptions);
      const icon=resizeIcon({rgba:r.preview,w:r.size,h:r.size},32);
      const minute=nativeMinute.seconds!==null && nativeMinute.confidence>=.83
        ? nativeMinute : readDigits(icon.rgba,32,minuteOptions);
      if (minute.seconds>=10 && minute.seconds<=15 && minute.confidence>=.83) {
        Object.assign(r,minute,{unit:'minutes'});
        continue;
      }
      const secondsOptions={min:1,area:[.08,.34,.92,.68],runeCooldown:true};
      const nativeSeconds=readDigits(r.preview,r.size,secondsOptions);
      const seconds=nativeSeconds.seconds!==null && nativeSeconds.confidence>=.83
        ? nativeSeconds : readDigits(icon.rgba,32,secondsOptions);
      const fallback = seconds.seconds === null
        ? readDigits(r.preview,r.size,{min:1,area:[.10,.25,.90,.75],aligned:true})
        : seconds;
      Object.assign(r,applyTimerFormat({...fallback,unit:'seconds'},F.timerFormat));
    }
    const monitor=installerOnly ? null : analyzeScreen(F,results,data.t,publishExperienceEarly ? null : firstExperience);
    if (monitor) {
      monitor.expBuffs=readExperienceBuffs(F,data.t,dims);
      monitor.vipBooster=findVipBooster(F);
    }
    if (monitor?.exp?.value && monitor.exp.box) experienceBox = monitor.exp.box;
    for (const result of results) delete result.preview;
    postMessage({ type: 'result', generation, t: data.t, ms: performance.now() - t0, results, monitor });
  } catch (e) {
    postMessage({ type: 'error', generation, message: String(e?.message || e) });
  }
};
