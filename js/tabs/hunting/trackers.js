import { loadMonitorAssets } from './monitor-assets.js';
import { handleMonitor, captureEnded, state as sessionState } from './session.js';
let extraTargets=[];
/* 인식 결과 → 설치기 상태(없음 / 유지 중 / 곧 종료)로 바꾸고 알림을 낸다 */
import { onTick } from '../../core/clock.js';
import { notify } from '../../core/notify.js';
import { getInfo, grabFrame, onCaptureChange } from './capture.js';
import { TARGETS, getIcon, getThreshold, loadIcons, onIconsChange } from './icons.js';
import { startDetector, configure, analyze } from './detector.js';

import { freshState, advance } from './tracking-state.js';


const fresh = t => ({ id: t.id, label: t.label, ...freshState(), last: null });
export const trackers = Object.fromEntries(TARGETS.map(t => [t.id, fresh(t)]));
export function resetTrackers() { TARGETS.forEach(t => { trackers[t.id] = fresh(t); }); }

export function handleResult(msg) {
  if (!getInfo().active) return;
  handleMonitor(msg);
  for (const r of msg.results) {
    const tr = trackers[r.id];
    if (!tr) continue;
    tr.last = r;
    if (advance(tr, r, msg.t)) notify(tr.label + ' 곧 종료됩니다. 다시 설치하세요', 'alert', tr.id);
  }
}

export function pushConfig() {
  const list = TARGETS.filter(t => getIcon(t.id, 'buff')).map(t => ({
    id: t.id, thr: getThreshold(t.id), main: getIcon(t.id, 'buff'), reject: getIcon(t.id, 'slot')
  }));
  configure([...list,...extraTargets]);
  resetTrackers();
}

let lastGrab = 0;
export async function initTracking() {
  startDetector(handleResult);
  onIconsChange(pushConfig);
  onCaptureChange(info => { if(!info.active)captureEnded();pushConfig(); });
  await loadIcons();
  const assets=await loadMonitorAssets();extraTargets=assets.targets;sessionState.vision.assets=assets.missing;pushConfig();
  onTick(now => {
    if (!getInfo().active || now - lastGrab < 200) return;
    const img = grabFrame();
    if (img && analyze(img, now)) lastGrab = now;
  });
}
