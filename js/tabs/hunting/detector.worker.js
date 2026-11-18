import { WINDOW_RUNE_COOLDOWN } from '../../data/monitor-reference.js';
/* 크기별 전체 탐색은 순환 실행하고, 발견한 크기와 위치는 매 프레임 추적한다. */
import { makeTemplate, prepareFrame, detect, resizeIcon } from './matcher.js';
import { applyTimerFormat, readDigits } from './digits.js';
import { analyzeExperience, analyzeScreen, resetScreenMonitor } from './screen-monitor.js';
import {createExperienceBuffDetector,scanExperienceBuffs} from './experience-buff-detector.js';
import {experienceBuffHud} from './experience-buffs.js';
import {readVipBooster,vipBoosterRegion} from './vip-booster.js';

const SIZES = [32, 45, 44, 24, 28, 20, 26, 30, 22, 18, 16, 34, 36, 40, 48, 64];
// Keep the common sizes first, then cover intermediate UI scales.
const INSTALLER_SIZES = [...new Set([
  ...SIZES, ...Array.from({length:49}, (_, i) => i+16), 68,72,76,80,88,96
])];
let targets = [], generation = 0, dimensions = '', scanCursor = 0, localCursor = 0;
let experienceBox = null;
let buffDetector=createExperienceBuffDetector([]),buffConfig='',buffDimensions='';
const isLara = target => target.file?.startsWith('라라_');
const isInstaller = target => target.id === "janus" || target.id === "fountain" || target.id.startsWith("job-");
const runeTypes = ['rune_normal','rune_blessed','rune_cooldown'];
const isCaptainBomber = target => target.file?.startsWith('캡틴_');
const tpl = (img,whole=false) => makeTemplate(img.rgba, img.w, img.h,whole);

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
function readExperienceBuffs(frame,now,dimensions,onlyPending=false) {
  if (buffDimensions!==dimensions) {
    buffDimensions=dimensions;
    for (const asset of buffDetector.assets) asset.last=null;
  }
  return scanExperienceBuffs(buffDetector,frame,now,cropFrame,onlyPending);
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
        id: t.id, file: t.file, cursor: 0, localSize: 0, locked: null, misses: 0,
        variants: [...new Set([t.main.w, ...(isInstaller(t) ? INSTALLER_SIZES : t.sizes || SIZES)])].map(size => ({
          thr: !t.id.startsWith('job-') && isInstaller(t) && size >= 40 && size !== t.main.w ? t.thr-.045 : t.thr,
          minColor:t.id.startsWith('job-') ? .85 : undefined,
          colorMode:t.colorMode, marker: !!t.marker, main: tpl(resizeIcon(t.fhd && size >= 15 ? t.fhd : t.main, size),isLara(t) ? 'wide-timer' : t.whole),
          reject: t.reject ? tpl(resizeIcon(t.reject, size)) : null, last: null
        }))
      }));
      dimensions = '';scanCursor=0;localCursor=0;resetScreenMonitor(); experienceBox = null;
      return;
    }
    if (data.generation !== generation) return;
    const t0 = performance.now();
    if (data.type==='buff-frame') {
      const frame=prepareFrame(new Uint8ClampedArray(data.buffer),data.w,data.h);
      frame.timerFormat=data.timerFormat;
      const timer=vipBoosterRegion(data.sourceWidth,data.sourceHeight);
      const hud=experienceBuffHud(data.sourceWidth,data.sourceHeight);
      const origin=data.sourceWidth-data.w;
      const buffFrame=cropFrame(frame,hud.x-origin,0,data.sourceWidth-hud.x,hud.h).frame;
      buffFrame.sourceWidth=data.sourceWidth;
      const expBuffs=readExperienceBuffs(buffFrame,data.t,data.sourceWidth+'x'+data.sourceHeight,true);
      const vipBooster=readVipBooster(cropFrame(frame,timer.x-origin,timer.y,timer.w,timer.h).frame);
      postMessage({type:'buff-ready',generation,t:data.t,ms:performance.now()-t0,results:[],monitor:{expBuffs,vipBooster}});
      return;
    }
    if (data.type!=='frame') return;
    const dims = data.w + 'x' + data.h;
    if (dimensions !== dims) {
      targets.forEach(t => { t.locked = null; t.misses = 0; t.cursor = 0; t.localSize = 0; t.variants.forEach(v => v.last = null); });
      if (data.w >= 1800 && data.h >= 1000) {
        for (const target of targets.filter(isInstaller)) {
          const index = target.variants.findIndex(variant => variant.main.w === 45);
          if (index >= 0) target.cursor = target.localSize = index;
        }
      }
      dimensions = dims;resetScreenMonitor(); experienceBox = null;
    }
    const F = prepareFrame(new Uint8ClampedArray(data.buffer), data.w, data.h);
    if (data.externalExperience) {
      const box=data.experienceBox;
      experienceBox=box?.sourceWidth===F.w && box.sourceHeight===F.h ? box : null;
    }
    const readExp=!data.externalExperience && data.scanExperience!==false;
    const firstExperience = !data.targetIds && !experienceBox && readExp
      ? analyzeExperience(F,data.t)
      : undefined;
    if (firstExperience?.value) {
      experienceBox=firstExperience.box;
      postMessage({type:'experience-ready',generation,t:data.t,results:[],monitor:{exp:firstExperience}});
    }
    F.timerFormat=data.timerFormat;
    const selected = targets.filter(t => (!data.targetIds || data.targetIds.includes(t.id)) &&
      (data.scanRune!==false || !t.id.startsWith('rune_')) &&
      (data.scanFragments!==false || t.id!=='fragments_icon'));
    const searching = selected.filter(t => t.locked === null);
    const nearbyTargets = searching.filter(isBuff);
    const installerTargets = nearbyTargets.filter(isInstaller);
    // Give installer HUD searches half of the local turns even when other buffs are absent.
    const localTurn = localCursor++;
    const pool = installerTargets.length && localTurn % 2 === 0 ? installerTargets : nearbyTargets;
    const localTarget = pool[Math.floor(localTurn/2) % pool.length];
    const fullScanTarget = searching[scanCursor++ % searching.length];
    const anchors = targets.filter(t => isBuff(t) && t.locked !== null && isInstaller(t) === (localTarget && isInstaller(localTarget)))
      .map(t => t.variants[t.locked].last).filter(Boolean);
    const left = anchors.length ? Math.max(0, Math.min(...anchors.map(a => a.x)) - 320) : Math.floor(F.w * .65);
    const top = anchors.length ? Math.max(0, Math.min(...anchors.map(a => a.y)) - 96) : 0;
    const bottom = anchors.length ? Math.min(F.h, Math.max(...anchors.map(a => a.y)) + 160) : Math.ceil(F.h * .23);
    const right = anchors.length && localTarget && isInstaller(localTarget)
      ? Math.min(F.w, Math.max(...anchors.map(a => a.x)) + 320)
      : F.w;
    let area = localTarget ? cropFrame(F, left, top, right - left, bottom - top) : null;
    // Installed skill icons can appear beside the chat panel, below the buff list.
    if (localTarget && isInstaller(localTarget) && !anchors.length && experienceBox?.y > 0) {
      const x = experienceBox.x;
      const y = Math.max(0, experienceBox.y - 180);
      area = cropFrame(F, x, y, Math.min(F.w - x, Math.ceil(F.w * .55)), experienceBox.y - y);
    }
    if (localTarget && isInstaller(localTarget) && (!anchors.length || anchors.every(anchor => anchor.y < F.h*.5)) && F.w >= 1800 && F.h >= 1000) {
      const x = Math.floor(F.w*.22), y = Math.floor(F.h*.76);
      area = cropFrame(F,x,y,Math.ceil(F.w*.24),F.h-y);
    }
    // Nearby installer slots can shift whenever another buff appears or expires.
    const hudX = Math.floor(F.w*.16), hudY = Math.floor(F.h*.74);
    const searchesHud = t => (['janus','fountain'].includes(t.id) || isCaptainBomber(t)) &&
      (t.locked === null || t.misses > 0 || t.variants[t.locked].last?.y < F.h*.5);
    const hud = selected.some(searchesHud) ? cropFrame(F,hudX,hudY,Math.ceil(F.w*.38),F.h-hudY) : null;
    const lara = selected.some(t=>isLara(t) && t.locked===null);
    const jobBuffX = Math.floor(F.w*.65);
    const jobBuffHud = searching.some(t=>t.id.startsWith('job-')) ?
      cropFrame(F,jobBuffX,0,F.w-jobBuffX,Math.ceil(F.h*.21)) : null;
    const laraInstallerHud = lara && (hud ?? cropFrame(F,hudX,hudY,Math.ceil(F.w*.38),F.h-hudY));
    const runeX = Math.floor(F.w*.53);
    const runeHud = selected.some(t => runeTypes.includes(t.id) && t.locked === null)
      ? cropFrame(F,runeX,0,F.w-runeX,Math.ceil(F.h*.24)) : null;
    const markerHud = selected.some(t => t.id === 'rune_marker')
      ? cropFrame(F,0,0,Math.ceil(F.w*.30),Math.ceil(F.h*.40)) : null;
    const fragmentsX = Math.floor(F.w*.28), fragmentsY = Math.floor(F.h*.63);
    const fragmentsHud = selected.some(t=>t.id==='fragments_icon' && t.locked===null)
      ? cropFrame(F,fragmentsX,fragmentsY,Math.ceil(F.w*.44),Math.ceil(F.h*.32)) : null;
    const results = selected.map(t => {
      let r;
      // Reject shortcut-bar candidates, including when following a previous match.
      const inBuffArea = (x,y,size) => x+size*.5 < F.w*.57 || y+size*.5 < F.h*.86;
      const variantAt = (variant, region) => t.id.startsWith('job-')
        ? {...variant,acceptPosition:(x,y,size)=>inBuffArea(x+(region?.x ?? 0),y+(region?.y ?? 0),size)}
        : variant;
      if (jobBuffHud && t.id.startsWith('job-') && t.locked===null) {
        const preferred = F.w>=1800 ? [45,44,32,46,43] : [32,31,33,30,34];
        const sizes=[preferred[0],preferred[1+t.localSize++%(preferred.length-1)]];
        for (const region of isLara(t) ? [jobBuffHud,laraInstallerHud] : [jobBuffHud]) {
          for (const size of new Set(sizes)) {
            const index=t.variants.findIndex(v=>v.main.w===size);
            if (index<0) continue;
            const variant=t.variants[index];
            const hit=detect(region.frame,{
              ...variantAt(variant,region),last:null,scanOptions:{coarseMin:.37,maxCands:24}
            });
            if (!hit.found || hit.score<variant.thr || hit.color<.84) continue;
            hit.x+=region.x;
            hit.y+=region.y;
            variant.last={x:hit.x,y:hit.y};
            t.locked=index;
            t.misses=0;
            return {id:t.id,...hit};
          }
        }
      }
      if (fragmentsHud && t.id === 'fragments_icon') {
        const sizes = F.w >= 1800 ? [34,33,32,35,36,24] : [24,23,25,26,27,28,30,32,34];
        for (const size of sizes) {
          const index = t.variants.findIndex(v=>v.main.w===size);
          if (index<0) continue;
          const variant=t.variants[index];
          const hit=detect(fragmentsHud.frame,{...variant,scanOptions:{coarseMin:.44,maxCands:16}});
          if (!hit.found) continue;
          hit.x+=fragmentsHud.x;
          hit.y+=fragmentsHud.y;
          variant.last={x:hit.x,y:hit.y};
          t.locked=index;
          t.misses=0;
          return {id:t.id,...hit};
        }
      }
      if (markerHud && t.id === 'rune_marker') {
        const size = t.variants[t.localSize++ % t.variants.length].main.w;
        const preferred = F.w >= 1800 ? [17,16,18,12,14] : [12,14,16,17];
        const trackedSize = t.variants[t.locked]?.main.w;
        const candidates = new Set([trackedSize,...preferred,size]);
        let best = null;
        for (const candidate of candidates) {
          const index = t.variants.findIndex(v=>v.main.w===candidate);
          if (index<0) continue;
          const variant=t.variants[index];
          const hit=detect(markerHud.frame,variant);
          if (hit.found && (!best || hit.score > best.hit.score)) best = {index,hit};
        }
        if (best) {
          const {index,hit}=best;
          if (t.locked!==null && t.locked!==index) t.variants[t.locked].last=null;
          t.variants[index].last={x:hit.x,y:hit.y};
          t.locked=index;
          t.misses=0;
          return {id:t.id,...hit};
        }
      }
      if (runeHud && runeTypes.includes(t.id) && t.locked === null) {
        const sizes = F.w >= 1800 && F.h >= 1000 ? [45,44,43,46,48,32] : [32,31,33,34,30];
        for (const size of sizes) {
          const index = t.variants.findIndex(variant => variant.main.w === size);
          if (index < 0) continue;
          const variant = t.variants[index];
          const hit = detect(runeHud.frame,{
            ...variant,thr:t.id==='rune_cooldown' ? .83 : variant.thr,
            scanOptions:{coarseMin:.40,maxCands:24}
          });
          if (!hit.found) continue;
          hit.x += runeHud.x;
          hit.y += runeHud.y;
          variant.last = {x:hit.x,y:hit.y};
          t.locked=index;
          t.misses=0;
          return {id:t.id,...hit};
        }
      }
      if (hud && searchesHud(t)) {
        const sizes = F.w >= 1800 && F.h >= 1000 ? [45,44,32] : [32,31,33];
        const trackedSize = t.locked === null ? null : t.variants[t.locked].main.w;
        for (const size of new Set([trackedSize,...sizes])) {
          const index = t.variants.findIndex(v => v.main.w === size);
          if (index < 0) continue;
          const variant = t.variants[index];
          const hit = detect(hud.frame,{...variantAt(variant,hud),last:null,scanOptions:{coarseMin:.42,maxCands:24}});
          if (!hit.found) continue;
          if (t.locked !== null) t.variants[t.locked].last = null;
          hit.x += hud.x;
          hit.y += hud.y;
          variant.last = {x:hit.x,y:hit.y};
          t.locked=index;
          t.misses=0;
          return {id:t.id,...hit};
        }
      }
      if (t.locked !== null) {
        const v = t.variants[t.locked];
        r = trackInCrop(F,v,isInstaller(t) && t.misses ? 8 : 3,variantAt);
        if (r.found) { t.misses = 0; v.last = { x: r.x, y: r.y }; return { id: t.id, ...r }; }
        if (t.id === 'rune_marker') {
          const marker = detect(markerHud.frame,{...v,last:null});
          if (marker.found) {
            v.last={x:marker.x,y:marker.y};
            t.misses=0;
          }
          if (marker.found) return {id:t.id,...marker};
        }
        if (++t.misses < (t.id === 'rune_marker' || t.id === 'fragments_icon' || runeTypes.includes(t.id) || isCaptainBomber(t) || isLara(t) ? 1 : 3)) return { id: t.id, ...r };
        v.last = null;
        t.cursor = t.locked;
        t.locked = null;
      }
      let index = t.cursor % t.variants.length;
      if (area && t === localTarget) {
        index = t.localSize++ % t.variants.length;
        const variant = t.variants[index];
        r = detect(area.frame, isInstaller(t)
          ? { ...variantAt(variant,area), scanOptions: { coarseMin: .42, maxCands: 24 } }
          : variant);
        if (!r.found && isInstaller(t) && F.w >= 1800 && area.frame.w <= F.w*.5 &&
            variant.main.w >= 43 && variant.main.w <= 46) {
          const neighbor = t.variants.findIndex(v => v.main.w === (variant.main.w === 45 ? 44 : 45));
          if (neighbor >= 0) {
            const alternate = detect(area.frame, {...variantAt(t.variants[neighbor],area),scanOptions:{coarseMin:.42,maxCands:24}});
            if (alternate.found) { index=neighbor; r=alternate; }
          }
        }
        if (r.found) { r.x += area.x; r.y += area.y; }
      }
      if (!r?.found && t === fullScanTarget) {
        index = t.cursor++ % t.variants.length;
        const variant = t.variants[index];
        const localResult = r;
        r = detect(F, isInstaller(t) && variant.main.w <= 24
          ? { ...variantAt(variant), scanOptions: { coarseMin: .40, maxCands: 24 } }
          : variantAt(variant));
        if (!r.found && localResult?.score > r.score) r = localResult;
      }
      if (!r) {
        r = detect(F, t.variants[index], { allowScan: false });
      }
      if (t.id === 'rune_marker' && !r.found && markerHud) r.mode = 'scan';
      const v = t.variants[index];
      if (r.found) {
        v.last = { x: r.x, y: r.y };
        t.locked = index;
        if (isInstaller(t)) {
          for (const peer of targets) {
            if (peer !== t && isInstaller(peer) && peer.locked === null && peer.localSize === 0) {
              const matchingSize = peer.variants.findIndex(v => v.main.w === r.size);
              if (matchingSize >= 0) peer.localSize = matchingSize;
            }
          }
        }
        t.misses = 0;
      }
      return { id: t.id, ...r };
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
      if (!result.found || !target?.file?.includes('배틀쉽_봄버')) continue;
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
      if (!result.id.startsWith('job-') || !result.found || result.unit==='seconds') continue;
      const target = targets.find(item => item.id === result.id);
      const background = target?.variants[target.locked]?.main.rgba;
      if (!background) continue;
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
      const goldArt = target.file?.includes('칼리_데스_블로섬');
      let reading = goldArt ? readDigits(result.preview,result.size,{
        area:[.27,.378,.74,.667],min:1,goldTimer:true,aligned:true
      }) : {seconds:null};
      if (reading.seconds === null) {
        reading = readDigits(result.preview,result.size,{area:center,min:1,background,aligned:true});
      }
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
      Object.assign(result,applyTimerFormat(result,F.timerFormat));
    }
    for (const alternate of bomberAlternates) {
      const primary = results.find(result => result.id === alternate.id);
      if (alternate.seconds !== null && (primary.seconds === null || alternate.seconds < primary.seconds)) {
        Object.assign(primary,alternate);
      }
    }
    // A gray icon can pick up a blue fringe from the HUD or the scene.
    // Compare the gray template at each colored candidate before trusting its timer.
    const grayTarget = selected.find(t=>t.id==='rune_cooldown');
    if (grayTarget) {
      const gray = results.find(r=>r.id==='rune_cooldown');
      if (runeHud && !gray.found) {
        const known = detect(runeHud.frame,{main:windowCooldown,thr:.90,scanOptions:{coarseMin:.38,maxCands:24}});
        if (known.found && known.color>=.90) {
          Object.assign(gray,known,{x:known.x+runeHud.x,y:known.y+runeHud.y,chroma:{grayTemplate:true}});
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
    const monitor=data.targetIds ? null : analyzeScreen(F,results,data.t,
      !readExp || firstExperience?.value ? null : firstExperience);
    if (monitor) {
      const timer=vipBoosterRegion(F.w,F.h);
      monitor.expBuffs=readExperienceBuffs(F,data.t,dims);
      monitor.vipBooster=readVipBooster(cropFrame(F,timer.x,timer.y,timer.w,timer.h).frame);
    }
    if (monitor?.exp?.value && monitor.exp.box) {
      if (!experienceBox) {
        for (const target of targets.filter(isInstaller)) target.localSize = target.cursor % target.variants.length;
      }
      experienceBox = monitor.exp.box;
    }
    for (const result of results) delete result.preview;
    postMessage({ type: 'result', generation, t: data.t, ms: performance.now() - t0, results, monitor });
  } catch (e) {
    postMessage({ type: 'error', generation, message: String(e?.message || e) });
  }
};
