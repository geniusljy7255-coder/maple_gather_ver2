import { jobInstallers, jobIconFile, installerIcon, onJobInstallersChange } from "./job-installers.js";
import { loadMonitorAssets, imageData, crop } from './monitor-assets.js';
import { handleMonitor, captureEnded, state as sessionState } from './session.js';
let extraTargets = [], jobTargets = [], jobRevision = 0;
export const jobLoadErrors = new Set();
async function configureJobInstallers() {
  const revision = ++jobRevision;
  const previous = jobTargets;
  const loaded = await Promise.all(jobInstallers.map(async item => {
    const file = jobIconFile(item);
    if (!file) return null;
    const existing = previous.find(target => target.id === item.id && target.file === file);
    if (existing) return existing;
    try {
      const img = await imageData(installerIcon(file));
      const size = Math.min(img.width, img.height);
      if (size < 12 || size > 128) return {id:item.id, error:true};
      const main = crop(img, Math.floor((img.width-size)/2), Math.floor((img.height-size)/2), size, size);
      // Ignore the outer frame, which differs between supplied skill art and the HUD.
      for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
        if (x<2 || y<2 || x>=size-2 || y>=size-2) main.rgba[(y*size+x)*4+3]=0;
      }
      return {id:item.id,file,main,thr:.80};
    } catch { return {id:item.id,error:true}; }
  }));
  if (revision !== jobRevision) return;
  jobLoadErrors.clear();
  for (const item of loaded) if (item?.error) jobLoadErrors.add(item.id);
  jobTargets = loaded.filter(item => item && !item.error);
  for (const target of previous) {
    if (!jobTargets.includes(target)) delete trackers[target.id];
  }
  for (const target of jobTargets) trackers[target.id] ??= fresh(target);
  pushConfig();
}
/* 인식 결과 → 설치기 상태(없음 / 유지 중 / 곧 종료)로 바꾸고 알림을 낸다 */
import { onTick } from '../../core/clock.js';
import { notify } from '../../core/notify.js';
import { getInfo, grabFrame, onCaptureChange } from './capture.js';
import { TARGETS, getIcon, getThreshold, loadIcons, onIconsChange } from './icons.js';
import { startDetector, configure, analyze } from './detector.js';

import { freshState, advance } from './tracking-state.js';


const fresh = t => ({ id: t.id, label: t.label, ...freshState(), last: null });
export const trackers = Object.fromEntries(TARGETS.map(t => [t.id, fresh(t)]));
export function resetTrackers() { [...TARGETS,...jobTargets].forEach(t => { trackers[t.id] = fresh(t); }); }

export function handleResult(msg) {
  if (!getInfo().active) return;
  handleMonitor(msg);
  for (const r of msg.results) {
    const tr = trackers[r.id];
    if (!tr) continue;
    tr.last = r;
    if (r.found) tr.lastSeen = msg.t;
    if (advance(tr, r, msg.t) && (tr.id === 'janus' || tr.id === 'fountain')) notify(tr.id === 'janus' ? '야누스 재설치' : '파운틴 재설치', 'alert', tr.id);
  }
}

export function pushConfig() {
  const list = TARGETS.filter(t => getIcon(t.id, 'buff')).map(t => ({
    id: t.id, thr: getThreshold(t.id), main: getIcon(t.id, 'buff'), reject: getIcon(t.id, 'slot')
  }));
  configure([...list,...extraTargets,...jobTargets]);
}

let lastGrab = 0;
export async function initTracking() {
  startDetector(handleResult);
  onIconsChange(pushConfig);
  onCaptureChange(info => { if(!info.active)captureEnded();resetTrackers();pushConfig(); });
  onJobInstallersChange(configureJobInstallers);
  await loadIcons();
  await configureJobInstallers();
  const assets=await loadMonitorAssets();extraTargets=assets.targets;sessionState.vision.assets=assets.missing;pushConfig();
  onTick(now => {
    if (!getInfo().active || now - lastGrab < 200) return;
    const img = grabFrame();
    if (img && analyze(img, now)) lastGrab = now;
  });
}
