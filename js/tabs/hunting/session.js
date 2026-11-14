import { notify } from '../../core/notify.js';
import { createHuntModel, beginHunt, finishHunt, observeExperience, observeFragments, idleHunt } from './hunt-model.js';
import { createRuneState, updateRune } from './rune-state.js';
const HISTORY_KEY='hunt_history_v1', LS_SEC='hunt_collect_sec', LS_ENABLED='hunt_collect_enabled';
export const COLLECT_LIMITS={min:10,max:600,def:100};
const sanitizeSec=v=>Math.min(600,Math.max(10,Math.round(Number(v))||100));
let saved=[];
try { const v=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
  if(Array.isArray(v)) saved=v.filter(r=>Number.isFinite(r.startedAt)&&Number.isFinite(r.endedAt)&&
    (r.gainPercent===null||Number.isFinite(r.gainPercent))&&Number.isInteger(r.fragments)&&r.fragments>=0&&r.endedAt>=r.startedAt&&
    (!r.startExp||(r.startExp.percent===null||Number.isFinite(r.startExp.percent)))&&(!r.endExp||(r.endExp.percent===null||Number.isFinite(r.endExp.percent)))).slice(0,10);
} catch {}
export const state={hunt:createHuntModel(saved),collect:{sec:sanitizeSec(localStorage.getItem(LS_SEC)),repeat:true,deadline:0,pausedLeft:null,enabled:localStorage.getItem(LS_ENABLED)!=='0'},
  rune:createRuneState(),vision:{exp:null,fragments:null,assets:[],error:'',lastAt:0}};
function persist(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(state.hunt.history));state.hunt.storageError=false;}catch{state.hunt.storageError=true;}}
export function startHunt(now=Date.now()) {if(state.hunt.running || state.hunt.pausedAt !== null) stopHunt(now,'다시 측정');beginHunt(state.hunt,now);restartCollect(now);}
export function stopHunt(now=Date.now(),reason='일시정지') {if(finishHunt(state.hunt,now,reason))persist();state.collect.deadline=0;state.collect.pausedLeft=null;}
export function endHunt(now=Date.now()) {
  stopHunt(now,'측정 종료');
  state.hunt.manuallyEnded=true;
  state.hunt.reason='측정 종료';
}
export function pauseHunt(now=Date.now()) {
  const h=state.hunt,c=state.collect;
  if (!h.running) return;
  h.running=false;
  h.pausedAt=now;
  h.reason='일시정지';
  c.pausedLeft=c.deadline ? Math.max(0,c.deadline-now) : null;
  c.deadline=0;
}
export function resumeHunt(now=Date.now()) {
  const h=state.hunt,c=state.collect;
  if (h.pausedAt === null) return;
  h.pausedMs += Math.max(0,now-h.pausedAt);
  h.pausedAt=null;
  h.running=true;
  h.lastGainAt=now;
  h.percentAnchor=h.lastExp;
  h.fragmentBaseline=h.latestFragments;
  h.reason='사냥 측정 중';
  if (c.enabled) c.deadline=now+(c.pausedLeft ?? c.sec*1000);
  c.pausedLeft=null;
}
export function huntMs(now=Date.now()) {
  const h=state.hunt;
  return h.startedAt ? Math.max(0,(h.pausedAt ?? (h.running ? now : h.endedAt))-h.startedAt-h.pausedMs) : 0;
}
export function restartCollect(now=Date.now()) {
  const c=state.collect;
  if (!c.enabled) return;
  if (state.hunt.running) c.deadline=now+c.sec*1000;
  else if (state.hunt.pausedAt !== null) c.pausedLeft=c.sec*1000;
}
export function setCollectEnabled(enabled,now=Date.now()) {
  const c=state.collect;
  c.enabled=Boolean(enabled);
  c.deadline=0;
  c.pausedLeft=null;
  try { localStorage.setItem(LS_ENABLED,c.enabled?'1':'0'); } catch {}
  if (c.enabled) restartCollect(now);
}
export function setCollectSec(v){state.collect.sec=sanitizeSec(v);try{localStorage.setItem(LS_SEC,String(state.collect.sec));}catch{}restartCollect();return state.collect.sec;}
export const collectLeftMs=(now=Date.now())=> !state.collect.enabled ? null : state.collect.deadline
  ? Math.max(0,state.collect.deadline-now) : state.collect.pausedLeft;
export function handleMonitor(msg){
  if(msg.monitor){
    state.vision={...state.vision,...msg.monitor,lastAt:msg.t};
    // 현재 프레임보다 오래된 사냥은 먼저 마감한다.
    if(idleHunt(state.hunt,msg.t)){persist();state.collect.deadline=0;}
    const count=msg.monitor.fragments?.value;
    if (count != null) state.vision.fragmentsReadAt = msg.t;
    if (count!=null && state.hunt.latestFragments===null) {
      observeFragments(state.hunt,msg.monitor.fragments.previous ?? count);
    }
    if(msg.monitor.exp?.value){const running=state.hunt.running;if(!state.hunt.lastExp&&msg.monitor.exp.previous)observeExperience(state.hunt,msg.monitor.exp.previous,msg.monitor.exp.previous.t);observeExperience(state.hunt,msg.monitor.exp.value,msg.t);if(!running&&state.hunt.running)restartCollect(msg.t);}
    if(count!=null)observeFragments(state.hunt,count);
  }
  if(updateRune(state.rune,msg.results,msg.t))notify('룬이 나타났습니다','alert','rune');
}
export function captureEnded(now=Date.now()){stopHunt(now,'화면 공유 종료');state.hunt.lastExp=null;state.hunt.manuallyEnded=false;state.hunt.latestFragments=null;state.vision.lastAt=0;state.vision.fragmentsReadAt=0;}
export function tick(now=Date.now()){
  if(idleHunt(state.hunt,now)){persist();state.collect.deadline=0;}
  const c=state.collect;
  if(c.enabled&&state.hunt.running&&c.deadline&&now>=c.deadline){notify('회수하세요','alert','collect');c.deadline+= (Math.floor((now-c.deadline)/(c.sec*1000))+1)*c.sec*1000;}
}
