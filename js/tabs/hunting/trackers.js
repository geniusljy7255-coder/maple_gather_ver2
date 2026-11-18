import { jobInstallers, jobIconFile, jobAlarm, installerIcon, onJobInstallersChange } from "./job-installers.js";
import { runeScanInterval } from './rune-state.js';
import {loadExperienceBuffAssets,experienceBuffPending} from './experience-buffs.js';
import { loadMonitorAssets, imageData, crop } from './monitor-assets.js';
import { handleMonitor, captureEnded, state as sessionState } from './session.js';
let extraTargets = [], jobTargets = [], jobRevision = 0;
let experienceBuffAssets=[],captureRevision=0;
export const jobLoadErrors = new Set();
async function configureJobInstallers() {
  const revision = ++jobRevision;
  const previous = jobTargets;
  for (const target of previous) {
    const item=jobInstallers.find(item=>item.id===target.id);
    if (!item || jobIconFile(item)!==target.file) delete trackers[target.id];
  }
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
      return {id:item.id,file,main,thr:.84};
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
import { getInfo, grabFrame, grabExperienceFrame, grabBuffFrame, onCaptureChange } from './capture.js';
import { TARGETS, getIcon, getThreshold, loadIcons, onIconsChange } from './icons.js';
import { startDetector, configure, analyze, analyzeBuffFrame, canAnalyze, startExperienceDetector, resetExperienceDetector,
  hasExperienceDetector, canAnalyzeExperience, analyzeExperienceFrame } from './detector.js';

import { freshState, advance } from './tracking-state.js';


const fresh = t => ({ id: t.id, label: t.label, ...freshState(), last: null });
export const trackers = Object.fromEntries(TARGETS.map(t => [t.id, fresh(t)]));
export function resetTrackers() { [...TARGETS,...jobTargets].forEach(t => { trackers[t.id] = fresh(t); }); }

function notifyInstaller(id) {
  const item=jobInstallers.find(item=>item.id===id);
  const alarm=item && jobAlarm(item);
  if (alarm) {
    notify(alarm.label+' 재설치','alert',alarm.id);
    return;
  }
  if (id === 'janus' || id === 'fountain') {
    notify(id === 'janus' ? '야누스 재설치' : '파운틴 재설치', 'alert', id);
  }
}

export function expireInstallers(now) {
  for (const tracker of Object.values(trackers)) {
    if (tracker.deadline === null) continue;
    if (now >= tracker.deadline && !tracker.needsReinstall) {
      tracker.needsReinstall = true;
      tracker.recoveryUntil = now + 8000;
    }
    const lead=tracker.id.startsWith('job-') ? 0 : 3000;
    if (now >= tracker.deadline - lead && !tracker.alerted) {
      tracker.alerted = true;
      notifyInstaller(tracker.id);
    }
  }
}

export function handleResult(msg) {
  if (!getInfo().active) return;
  const exp=msg.monitor?.exp;
  if (exp?.recheck && (!experienceRetryUntil || msg.t>=experienceRetryUntil+5000)) {
    experienceRetryUntil=msg.t+2500;
  } else if (exp?.value && !exp.recheck) {
    experienceRetryUntil=0;
  }
  if (msg.type==='experience-ready' || msg.type==='buff-ready') {
    handleMonitor(msg);
    return;
  }
  expireInstallers(msg.t);
  handleMonitor(msg);
  const lost = msg.results.some(r => trackers[r.id]?.deadline > msg.t &&
    !r.found && r.mode === 'scan');
  if (lost && msg.t >= nextRecoveryAt) {
    fastUntil = Math.max(fastUntil,msg.t+2500);
    nextRecoveryAt = msg.t+15000;
  }
  if (msg.results.some(r => r.found && trackers[r.id]?.deadline == null && trackers[r.id]) &&
      msg.t >= nextRecoveryAt) {
    fastUntil = Math.max(fastUntil,msg.t+2500);
    nextRecoveryAt = msg.t+15000;
  }
  for (const r of msg.results) {
    const tr = trackers[r.id];

    if (!tr) continue;
    tr.last = r;
    if (r.found) {
      tr.lastSeen = msg.t;
      if ((tr.deadline === null || tr.needsReinstall) &&
          msg.t >= (tr.nextTimerRetryAt ?? 0)) {
        tr.nextTimerRetryAt = msg.t + 8000;
        tr.recoveryUntil = Math.max(tr.recoveryUntil ?? 0,msg.t + 3200);
      }
    }
    advance(tr, r, msg.t);
    if (tr.deadline > msg.t && !tr.needsReinstall) tr.recoveryUntil = 0;
  }
}

export function pushConfig() {
  const list = TARGETS.filter(t => getIcon(t.id, 'buff')).map(t => ({
    id: t.id, thr: getThreshold(t.id), main: getIcon(t.id, 'buff'), reject: getIcon(t.id, 'slot')
  }));
  configure([...list,...extraTargets,...jobTargets],experienceBuffAssets,captureRevision);
}

const refreshMs = 5000;
const confirmationMs = 500;
let lastGrab = 0;
let burstStartedAt = 0;
let burstFrames = 0;
let retryAt = 0;
let fastUntil = 0;
let initialExpUntil = 0;
let nextRecoveryAt = 0;
let lastExperienceGrab = 0;
let experienceRetryUntil = 0;
let lastRuneGrab = 0;
let lastBuffGrab = 0;
const experienceInterval = now => !sessionState.hunt.lastExp || now<experienceRetryUntil ? 750 : 5000;
function sendFullFrame(img,now,externalExperience) {
  const scanRune=now-lastRuneGrab>=runeScanInterval(sessionState.rune,now);
  const fragmentsReadAt=sessionState.vision.fragmentsReadAt ?? 0;
  const scanFragments=!fragmentsReadAt || now-fragmentsReadAt>=10000;
  const scanExperience=!externalExperience && now-lastExperienceGrab>=experienceInterval(now);
  if (!analyze(img,now,null,externalExperience,scanRune,scanFragments,scanExperience)) return false;
  if (scanRune) lastRuneGrab=now;
  if (scanExperience) lastExperienceGrab=now;
  return true;
}
function submitFrame(now) {
  const info=getInfo();
  if (!info.active) return;
  const externalExperience=info.surface==='window' && hasExperienceDetector();
  if (externalExperience && now-lastExperienceGrab>=experienceInterval(now) && canAnalyzeExperience()) {
    const frame=grabExperienceFrame();
    if (frame && analyzeExperienceFrame(frame,now)) lastExperienceGrab=now;
  }
  if (!canAnalyze(now)) return;
  if (now < fastUntil || (now < initialExpUntil &&
      ((!externalExperience && !sessionState.hunt.lastExp) || sessionState.hunt.latestFragments === null))) {
    if (now-lastGrab < 250) return;
    const img = grabFrame();
    if (img && sendFullFrame(img,now,externalExperience)) {
      if (initialExpUntil===Infinity) initialExpUntil=now+8000;
      lastGrab=now;
      burstFrames=0;
      retryAt=now+refreshMs;
    }
    return;
  }
  // Check all recovering installers on the same frame.
  if (!burstFrames && now < retryAt) {
    const waiting = Object.values(trackers).filter(tr => tr.needsReinstall ||
      (tr.deadline === null && tr.recoveryUntil > now));
    const pending=Object.values(sessionState.vision.expBuffs ?? {}).some(record=>experienceBuffPending(record,now));
    const interval=pending || sessionState.booster.deadline>now ? 750 : 1250;
    if (now-lastBuffGrab>=interval && (!waiting.length || lastBuffGrab<=lastGrab)) {
      const frame=grabBuffFrame();
      if (frame && analyzeBuffFrame(frame,now)) {lastBuffGrab=now;return;}
    }
    if (!waiting.length || now-lastGrab < 600) return;
    const img = grabFrame();
    if (img && analyze(img,now,waiting.map(target=>target.id))) lastGrab=now;
    return;
  }
  if (!burstFrames && now >= retryAt) {
    burstStartedAt = now;
    burstFrames = 3;
  }
  if (!burstFrames || now - lastGrab < confirmationMs) return;
  const img = grabFrame();
  if (img && sendFullFrame(img,now,externalExperience)) {
    lastGrab = now;
    if (--burstFrames === 0) retryAt = burstStartedAt + refreshMs;
  }
}
export async function initTracking() {
  startDetector(result => {
    handleResult(result);
    submitFrame(Date.now());
  });
  startExperienceDetector();
  onIconsChange(pushConfig);
  onCaptureChange(info => {
    captureRevision++;
    const now=Date.now();
    fastUntil = info.active ? now+4000 : 0;
    // Keep the startup window available until the browser delivers a frame.
    initialExpUntil = info.active ? Infinity : 0;
    nextRecoveryAt = fastUntil+5000;
    burstFrames = 0;
    retryAt = 0;
    lastGrab = 0;
    lastExperienceGrab = 0;
    experienceRetryUntil = 0;
    lastRuneGrab = 0;
    lastBuffGrab = 0;
    resetExperienceDetector();
    if (!info.active) captureEnded();
    resetTrackers();
    pushConfig();
    if (info.active) submitFrame(now);
  });
  onJobInstallersChange(configureJobInstallers);
  await loadIcons();
  await configureJobInstallers();
  const [assets,buffs]=await Promise.all([loadMonitorAssets(),loadExperienceBuffAssets()]);
  extraTargets=assets.targets;experienceBuffAssets=buffs.assets;
  sessionState.vision.assets=[...assets.missing,...buffs.missing];
  pushConfig();
  onTick(now => {
    if (getInfo().active) expireInstallers(now);
    submitFrame(now);
  });
}
