import { jobInstallers, jobSkill, jobIconFiles, jobAlarm, installerIcon, onJobInstallersChange } from "./job-installers.js";
import {advanceStackCount,advanceStackClock} from './stack-count.js';
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
    if (!item || item.skill!==target.file) delete trackers[target.id];
  }
  const loaded = await Promise.all(jobInstallers.map(async item => {
    const skill = jobSkill(item);
    if (!skill) return null;
    const existing = previous.find(target => target.id === item.id && target.file === skill.id);
    if (existing) return existing;
    const artwork = (await Promise.all(jobIconFiles(item).map(async file => {
      try {
        const img = await imageData(installerIcon(file));
        const size = Math.min(img.width, img.height);
        if (size < 12 || size > 128) return null;
        const main = crop(img, Math.floor((img.width-size)/2), Math.floor((img.height-size)/2), size, size);
        // Ignore the outer frame, which differs between supplied skill art and the HUD.
        for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
          if (x<2 || y<2 || x>=size-2 || y>=size-2) main.rgba[(y*size+x)*4+3]=0;
        }
        return main;
      } catch {
        return null;
      }
    }))).filter(Boolean);
    if (!artwork.length) return {id:item.id,error:true};
    return {id:item.id,file:skill.id,main:artwork[0],artwork,thr:.84,trackingMode:skill.trackingMode};
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
import { getInfo, grabFrame, grabExperienceFrame, onCaptureChange } from './capture.js';
import { TARGETS, getIcon, getThreshold, loadIcons, onIconsChange } from './icons.js';
import { startDetector, configure, analyzeInstallers, analyzeMonitor, canAnalyzeInstallers, canAnalyzeMonitor,
  startExperienceDetector, resetExperienceDetector,
  hasExperienceDetector, canAnalyzeExperience, analyzeExperienceFrame } from './detector.js';

import { freshState, advance } from './tracking-state.js';


const fresh = t => ({ id: t.id, label: t.label, ...freshState(), trackingMode:t.trackingMode, count:null,last: null });
export const trackers = Object.fromEntries(TARGETS.map(t => [t.id, fresh(t)]));
function resetTrackers() { [...TARGETS,...jobTargets].forEach(t => { trackers[t.id] = fresh(t); }); }

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
    if(tracker.trackingMode==='count') {
      if(advanceStackClock(tracker,now))notifyInstaller(tracker.id);
      continue;
    }
    if (tracker.deadline === null) continue;
    if (now >= tracker.deadline && !tracker.needsReinstall) {
      tracker.needsReinstall = true;
    }
    const lead=tracker.id.startsWith('job-') ? 1000 : 4000;
    if (now >= tracker.deadline - lead && !tracker.alerted) {
      tracker.alerted = true;
      notifyInstaller(tracker.id);
    }
  }
}

function handleResult(msg) {
  if (!getInfo().active) return;
  const exp=msg.monitor?.exp;
  if (exp?.recheck && (!experienceRetryUntil || msg.t>=experienceRetryUntil+5000)) {
    experienceRetryUntil=msg.t+2500;
  } else if (exp?.value && !exp.recheck) {
    experienceRetryUntil=0;
  }
  if (msg.monitor) {
    handleMonitor(msg);
    return;
  }
  expireInstallers(msg.t);
  for (const r of msg.results) {
    const tr = trackers[r.id];

    if (!tr) continue;
    tr.last = r;
    if(tr.trackingMode==='count') {
      if(r.found)tr.lastSeen=msg.t;
      if(advanceStackCount(tr,r,msg.t))notifyInstaller(tr.id);
      continue;
    }
    if (r.found) tr.lastSeen = msg.t;
    advance(tr, r, msg.t);
  }
}

function pushConfig() {
  const list = TARGETS.filter(t => getIcon(t.id, 'buff')).map(t => ({
    id: t.id, thr: getThreshold(t.id), main: getIcon(t.id, 'buff'), reject: getIcon(t.id, 'slot')
  }));
  configure([...list,...jobTargets],extraTargets,experienceBuffAssets,captureRevision);
}

let lastInstallerGrab = 0;
let lastMonitorGrab = 0;
let lastExperienceGrab = 0;
let experienceRetryUntil = 0;
let lastRuneGrab = 0;
const experienceInterval = now => !sessionState.hunt.lastExp || now<experienceRetryUntil ? 750 : 5000;

function submitFrame(now) {
  const info = getInfo();
  if (!info.active) return;
  const externalExperience = info.surface==='window' && hasExperienceDetector();
  if (externalExperience && now-lastExperienceGrab>=experienceInterval(now) && canAnalyzeExperience()) {
    const frame = grabExperienceFrame();
    if (frame && analyzeExperienceFrame(frame,now)) lastExperienceGrab = now;
  }
  const needsConfirmation = Object.values(trackers).some(tr => tr.trackingMode==='count'
    ? tr.count == null || tr.count<=3
    : tr.deadline === null || tr.needsReinstall);
  const installerInterval = needsConfirmation ? 300 : 500;
  const scanInstallers = now-lastInstallerGrab>=installerInterval && canAnalyzeInstallers(now);
  const pendingBuff = Object.values(sessionState.vision.expBuffs ?? {}).some(record=>experienceBuffPending(record,now));
  const monitorInterval = pendingBuff ? 500 : sessionState.booster.deadline>now ? 750 : 1250;
  const scanMonitor = now-lastMonitorGrab>=monitorInterval && canAnalyzeMonitor(now);
  if (!scanInstallers && !scanMonitor) return;
  const frame = grabFrame();
  if (!frame) return;
  const monitorFrame = scanInstallers && scanMonitor ? {...frame,data:frame.data.slice()} : frame;
  if (scanInstallers && analyzeInstallers(frame,now)) lastInstallerGrab = now;
  if (scanMonitor) {
    const scanRune = now-lastRuneGrab>=runeScanInterval(sessionState.rune,now);
    const scanFragments = now-(sessionState.vision.fragmentsReadAt ?? 0)>=10000;
    const scanExperience = !externalExperience && now-lastExperienceGrab>=experienceInterval(now);
    if (analyzeMonitor(monitorFrame,now,externalExperience,scanRune,scanFragments,scanExperience)) {
      lastMonitorGrab = now;
      if (scanRune) lastRuneGrab = now;
      if (scanExperience) lastExperienceGrab = now;
    }
  }
}
export async function initTracking() {
  const onResult = result => {
    handleResult(result);
    submitFrame(Date.now());
  };
  startDetector(onResult);
  startExperienceDetector(onResult);
  onIconsChange(pushConfig);
  onCaptureChange(info => {
    captureRevision++;
    const now=Date.now();
    lastInstallerGrab = 0;
    lastMonitorGrab = 0;
    lastExperienceGrab = 0;
    experienceRetryUntil = 0;
    lastRuneGrab = 0;
    resetExperienceDetector();
    if (!info.active) captureEnded();
    resetTrackers();
    pushConfig();
    if (info.active) submitFrame(now);
  });
  onJobInstallersChange(configureJobInstallers);
  onTick(now => {
    if (getInfo().active) expireInstallers(now);
    submitFrame(now);
  });
  await loadIcons();
  await configureJobInstallers();
  const [assets,buffs]=await Promise.all([loadMonitorAssets(),loadExperienceBuffAssets()]);
  extraTargets=assets.targets;experienceBuffAssets=buffs.assets;
  sessionState.vision.assets=[...assets.missing,...buffs.missing];
  pushConfig();
}
