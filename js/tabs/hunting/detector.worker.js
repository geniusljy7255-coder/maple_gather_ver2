/* 크기별 전체 탐색은 순환 실행하고, 발견한 크기와 위치는 매 프레임 추적한다. */
import { makeTemplate, prepareFrame, detect, resizeIcon } from './matcher.js';
import { readDigits } from './digits.js';
import { analyzeScreen, resetScreenMonitor } from './screen-monitor.js';

const SIZES = [32, 24, 28, 20, 26, 30, 22, 18, 16, 34, 36, 40, 48, 64];
let targets = [], generation = 0, dimensions = '', scanCursor = 0, localCursor = 0;
let experienceBox = null;
let previewTarget = null;
const isInstaller = target => target.id === "janus" || target.id === "fountain" || target.id.startsWith("job-");
const tpl = (img,whole=false) => makeTemplate(img.rgba, img.w, img.h,whole);

function cropFrame(frame, x, y, w, h) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * frame.w + x) * 4;
    pixels.set(frame.rgba.subarray(start, start + w * 4), row * w * 4);
  }
  return { frame: prepareFrame(pixels, w, h), x, y };
}

const isBuff = target => target.id !== 'rune_marker' && target.id !== 'fragments_icon';

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'installer-preview') {
      previewTarget = data.id;
      return;
    }
    if (data.type === 'config') {
      generation = data.generation;
      targets = data.targets.map(t => ({
        id: t.id, cursor: 0, localSize: 0, locked: null, misses: 0,
        variants: [...new Set([t.main.w, ...(t.sizes || SIZES)])].map(size => ({
          thr: t.thr, colorMode:t.colorMode, marker: !!t.marker, main: tpl(resizeIcon(t.main, size),t.whole),
          reject: t.reject ? tpl(resizeIcon(t.reject, size)) : null, last: null
        }))
      }));
      dimensions = '';scanCursor=0;localCursor=0;resetScreenMonitor(); experienceBox = null;
      return;
    }
    if (data.type !== 'frame' || data.generation !== generation) return;
    const t0 = performance.now();
    const dims = data.w + 'x' + data.h;
    if (dimensions !== dims) {
      targets.forEach(t => { t.locked = null; t.misses = 0; t.cursor = 0; t.localSize = 0; t.variants.forEach(v => v.last = null); });
      dimensions = dims;resetScreenMonitor(); experienceBox = null;
    }
    const F = prepareFrame(new Uint8ClampedArray(data.buffer), data.w, data.h);
    const searching = targets.filter(t => t.locked === null);
    const nearbyTargets = searching.filter(isBuff);
    const localTarget = nearbyTargets[localCursor++ % nearbyTargets.length];
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
    const results = targets.map(t => {
      let r;
      if (t.locked !== null) {
        const v = t.variants[t.locked];
        r = detect(F, v, { allowScan: false, trackRadius: isInstaller(t) && t.misses ? 8 : 3 });
        if (r.found) { t.misses = 0; v.last = { x: r.x, y: r.y }; return { id: t.id, ...r }; }
        if (++t.misses < 3) return { id: t.id, ...r };
        v.last = null;
        t.cursor = t.locked;
        t.locked = null;
      }
      let index = t.cursor % t.variants.length;
      if (area && t === localTarget) {
        index = t.localSize++ % t.variants.length;
        const variant = t.variants[index];
        r = detect(area.frame, isInstaller(t)
          ? { ...variant, scanOptions: { coarseMin: .42, maxCands: 24 } }
          : variant);
        if (r.found) { r.x += area.x; r.y += area.y; }
      }
      if (!r?.found && t === fullScanTarget) {
        index = t.cursor++ % t.variants.length;
        const variant = t.variants[index];
        r = detect(F, isInstaller(t) && variant.main.w <= 24
          ? { ...variant, scanOptions: { coarseMin: .40, maxCands: 24 } }
          : variant);
      }
      if (!r?.found && t !== fullScanTarget) {
        r = detect(F, t.variants[index], { allowScan: false });
      }
      const v = t.variants[index];
      if (r.found) {
        v.last = { x: r.x, y: r.y };
        t.locked = index;
        if (isInstaller(t)) {
          for (const peer of targets) {
            if (peer !== t && isInstaller(peer) && peer.locked === null) {
              const matchingSize = peer.variants.findIndex(v => v.main.w === r.size);
              if (matchingSize >= 0) peer.localSize = matchingSize;
            }
          }
        }
        t.misses = 0;
      }
      return { id: t.id, ...r };
    });
    for (const result of results) {
      if (!result.id.startsWith('job-') || !result.found) continue;
      const target = targets.find(item => item.id === result.id);
      const background = target?.variants[target.locked]?.main.rgba;
      if (!background) continue;
      // Prefer the centered countdown strip, above which some icons have
      // a gold border. Try the strip without subtraction too: yellow art
      // underneath a real digit can otherwise erase part of its stroke.
      const center = [.16,.31,.84,.69];
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
      // Keep a valid unmasked reading when the overlay shares the base art's color.
      if (reading.seconds !== null || result.seconds === null) Object.assign(result,reading);
    }
    const buffHits=results.filter(r=>r.found&&(r.id==='rune_normal'||r.id==='rune_blessed'));
    for(const r of results)if(r.id==='rune_cooldown'&&r.found){
      // 버프와 재사용 대기를 같은 좌표에서 동시에 인정하지 않는다.
      if(buffHits.some(b=>Math.abs(b.x-r.x)<r.size*.5&&Math.abs(b.y-r.y)<r.size*.5)){
        r.found=false;r.identity=false;r.seconds=null;
        const target=targets.find(t=>t.id===r.id);target.locked=null;target.variants.forEach(v=>v.last=null);
        continue;
      }
      const options={min:1,area:[.03,.56,.75,.97]};
      const a=readDigits(r.preview,r.size,{...options,light:true}),b=readDigits(r.preview,r.size,{...options,dark:true});
      const reading=a.seconds!==null&&b.seconds!==null&&a.seconds!==b.seconds?{seconds:null,confidence:0,digit:'uncertain'}:a.seconds!==null?a:b;
      Object.assign(r,reading);
    }
    const monitor=analyzeScreen(F,results,data.t);
    if (monitor?.exp.box) {
      if (!experienceBox) {
        for (const target of targets.filter(isInstaller)) target.localSize = 0;
      }
      experienceBox = monitor.exp.box;
    }
    for (const result of results) if (result.id !== previewTarget) delete result.preview;
    postMessage({ type: 'result', generation, t: data.t, ms: performance.now() - t0, results, monitor });
  } catch (e) {
    postMessage({ type: 'error', generation, message: String(e?.message || e) });
  }
};
