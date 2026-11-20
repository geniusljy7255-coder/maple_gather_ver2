import { companionSay, notify } from '../../core/notify.js';
import { observeVipBooster } from './vip-booster.js';
import { createHuntModel, beginHunt, finishHunt, observeExperience, observeFragments } from './hunt-model.js';
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
  rune:createRuneState(),booster:{deadline:0,sample:null,confirmedAt:0},vision:{exp:null,fragments:null,assets:[],error:'',lastAt:0}};
function persist(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(state.hunt.history));state.hunt.storageError=false;}catch{state.hunt.storageError=true;}}
export function startHunt(now=Date.now(),restarting=false) {
  if(state.hunt.running || state.hunt.pausedAt !== null) stopHunt(now,'다시 측정');
  beginHunt(state.hunt,now);
  restartCollect(now);
  companionSay(restarting ? '다시 힘내보자!' : '사냥 힘내!');
}
export function stopHunt(now=Date.now(),reason='일시정지') {
  const record=finishHunt(state.hunt,now,reason);
  if(record)persist();
  state.collect.deadline=0;
  state.collect.pausedLeft=null;
  return record;
}
export function endHunt(now=Date.now()) {
  const record=stopHunt(now,'측정 종료');
  state.hunt.manuallyEnded=true;
  state.hunt.reason='측정 종료';
  if (!record) return;
  const minutes=(record.durationMs/60000).toLocaleString('ko-KR',{maximumFractionDigits:2});
  const experience=record.gainPercent===null ? '미확인' : `${record.gainPercent}%`;
  companionSay(`수고했어! ${minutes}분 동안 경험치는 ${experience}, 조각은 ${record.fragments.toLocaleString('ko-KR')}개 얻었어!`);
}
export function pauseHunt(now=Date.now()) {
  const h=state.hunt,c=state.collect;
  if (!h.running) return;
  h.running=false;
  h.pausedAt=now;
  h.reason='일시정지';
  c.pausedLeft=c.deadline ? Math.max(0,c.deadline-now) : null;
  c.deadline=0;
  companionSay('잠깐 쉬면서해!');
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
  companionSay('다시 힘내보자!');
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
    if ('vipBooster' in msg.monitor && observeVipBooster(state.booster,msg.monitor.vipBooster,msg.t)) {
      state.booster.confirmedAt=msg.t;
    }
    state.vision={...state.vision,...msg.monitor,lastAt:msg.t};
    const count=msg.monitor.fragments?.value;
    if (count != null) state.vision.fragmentsReadAt = msg.t;
    if (count!=null && state.hunt.latestFragments===null) {
      observeFragments(state.hunt,msg.monitor.fragments.previous ?? count);
    }
    if(msg.monitor.exp?.value){
      const running=state.hunt.running;
      if(!state.hunt.lastExp&&msg.monitor.exp.previous)observeExperience(state.hunt,msg.monitor.exp.previous,msg.monitor.exp.previous.t);
      observeExperience(state.hunt,msg.monitor.exp.value,msg.t);
      if(!running&&state.hunt.running){
        restartCollect(msg.t);
        companionSay('사냥 힘내!');
      }
    }
    if(count!=null)observeFragments(state.hunt,count);
  }
  if(msg.type!=='experience-ready' && updateRune(state.rune,msg.results,msg.t))notify('룬이 나타났습니다','alert','rune');
}
const announcedBuffDeadlines=new Map();
export function captureEnded(){state.hunt.lastExp=null;state.hunt.fragmentBaseline=null;state.hunt.latestFragments=null;state.rune=createRuneState();state.booster={deadline:0,sample:null,confirmedAt:0};state.vision.expBuffs={};state.vision.lastAt=0;state.vision.fragmentsReadAt=0;announcedBuffDeadlines.clear();}
export function tick(now=Date.now()){
  const booster=state.booster;
  if(booster.deadline && now>=booster.deadline){
    state.booster={deadline:0,sample:null,confirmedAt:0};
    if(booster.confirmedAt){
      notify('부스터 종료','alert','booster');
      companionSay('부스터가 끝났어!');
    }
  }
  const c=state.collect;
  if(c.enabled&&state.hunt.running&&c.deadline&&now>=c.deadline){notify('회수하세요','alert','collect');c.deadline+= (Math.floor((now-c.deadline)/(c.sec*1000))+1)*c.sec*1000;}
  let buffExpired=false;
  for(const [id,buff] of Object.entries(state.vision.expBuffs ?? {})){
    if(!buff.deadline || buff.deadline>now || announcedBuffDeadlines.get(id)===buff.deadline)continue;
    announcedBuffDeadlines.set(id,buff.deadline);
    buffExpired=true;
  }
  if(buffExpired)companionSay('경험치 버프가 끝났어 사냥 더 할꺼야?');
}
