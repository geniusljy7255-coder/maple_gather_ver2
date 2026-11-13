import { notify } from '../../core/notify.js';
import { createHuntModel, beginHunt, finishHunt, observeExperience, observeFragments, idleHunt } from './hunt-model.js';
import { createRuneState, updateRune } from './rune-state.js';
const HISTORY_KEY='hunt_history_v1', LS_SEC='hunt_collect_sec';
export const COLLECT_LIMITS={min:10,max:600,def:100};
const sanitizeSec=v=>Math.min(600,Math.max(10,Math.round(Number(v))||100));
let saved=[];
try { const v=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
  if(Array.isArray(v)) saved=v.filter(r=>Number.isFinite(r.startedAt)&&Number.isFinite(r.endedAt)&&
    (r.gainPercent===null||Number.isFinite(r.gainPercent))&&Number.isInteger(r.fragments)&&r.fragments>=0&&r.endedAt>=r.startedAt&&
    (!r.startExp||(r.startExp.percent===null||Number.isFinite(r.startExp.percent)))&&(!r.endExp||(r.endExp.percent===null||Number.isFinite(r.endExp.percent)))).slice(0,10);
} catch {}
export const state={hunt:createHuntModel(saved),collect:{sec:sanitizeSec(localStorage.getItem(LS_SEC)),repeat:true,deadline:0},
  rune:createRuneState(),vision:{exp:null,fragments:null,assets:[],error:'',lastAt:0}};
function persist(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(state.hunt.history));state.hunt.storageError=false;}catch{state.hunt.storageError=true;}}
export function startHunt(now=Date.now()) {if(state.hunt.running) stopHunt(now,'다시 측정');beginHunt(state.hunt,now);restartCollect(now);}
export function stopHunt(now=Date.now(),reason='일시정지') {if(finishHunt(state.hunt,now,reason))persist();state.collect.deadline=0;}
export function pauseHunt(now=Date.now()){stopHunt(now);state.hunt.reason='일시정지 · 다음 경험치 증가 시 새 기록';}
export function huntMs(now=Date.now()){const h=state.hunt;return h.startedAt?(h.running?now:h.endedAt)-h.startedAt:0;}
export function restartCollect(now=Date.now()){if(state.hunt.running)state.collect.deadline=now+state.collect.sec*1000;}
export function setCollectSec(v){state.collect.sec=sanitizeSec(v);try{localStorage.setItem(LS_SEC,String(state.collect.sec));}catch{}restartCollect();return state.collect.sec;}
export const collectLeftMs=(now=Date.now())=>state.collect.deadline?Math.max(0,state.collect.deadline-now):null;
export function handleMonitor(msg){
  if(msg.monitor){
    state.vision={...state.vision,...msg.monitor,lastAt:msg.t};
    // 현재 프레임보다 오래된 사냥은 먼저 마감한다.
    if(idleHunt(state.hunt,msg.t)){persist();state.collect.deadline=0;}
    const count=msg.monitor.fragments?.value;
    if(count!=null&&state.hunt.latestFragments===null)observeFragments(state.hunt,count);
    if(msg.monitor.exp?.value){const running=state.hunt.running;if(!state.hunt.lastExp&&msg.monitor.exp.previous)observeExperience(state.hunt,msg.monitor.exp.previous,msg.monitor.exp.previous.t);observeExperience(state.hunt,msg.monitor.exp.value,msg.t);if(!running&&state.hunt.running)restartCollect(msg.t);}
    if(count!=null)observeFragments(state.hunt,count);
  }
  if(updateRune(state.rune,msg.results,msg.t))notify('룬이 나타났습니다','alert','rune');
}
export function captureEnded(now=Date.now()){stopHunt(now,'화면 공유 종료');state.hunt.lastExp=null;state.hunt.latestFragments=null;state.vision.lastAt=0;}
export function tick(now=Date.now()){
  if(idleHunt(state.hunt,now)){persist();state.collect.deadline=0;}
  const c=state.collect;
  if(state.hunt.running&&c.deadline&&now>=c.deadline){notify('아이템을 회수하세요','alert','collect');c.deadline+= (Math.floor((now-c.deadline)/(c.sec*1000))+1)*c.sec*1000;}
}
