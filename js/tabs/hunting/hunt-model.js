/* 사냥 기록은 설치기/룬 상태와 독립적이다. 시간은 프레임 시각 기준. */
export function createHuntModel(history = []) {
  return { running:false, startedAt:0, endedAt:0, lastGainAt:0,
    startExp:null, currentExp:null, gainPercent:0, fragments:0,
    fragmentBaseline:null, latestFragments:null, lastExp:null, percentAnchor:null,
    history:history.slice(0,10), storageError:false, reason:'경험치 증가 대기' };
}
const copy = e => e ? {percent:e.percent,level:e.level ?? null,raw:e.raw ?? null} : null;
export function beginHunt(m, now, baseline = m.lastExp) {
  m.running=true;m.startedAt=now;m.endedAt=0;m.lastGainAt=now;
  m.startExp=copy(baseline);m.currentExp=copy(baseline);m.gainPercent=0;m.percentAnchor=copy(baseline);
  m.fragments=0;m.fragmentBaseline=m.latestFragments;m.reason='사냥 측정 중';
}
export function finishHunt(m, now, reason='일시정지') {
  if(!m.running) return null;
  const record={startedAt:m.startedAt,endedAt:now,startExp:copy(m.startExp),
    endExp:copy(m.currentExp),gainPercent:Number.isFinite(m.startExp?.percent)&&Number.isFinite(m.currentExp?.percent)?Number(m.gainPercent.toFixed(4)):null,fragments:m.fragments};
  m.running=false;m.endedAt=now;m.reason=reason+' · 다음 경험치 증가 시 새 기록';
  m.history.unshift(record);m.history=m.history.slice(0,10);
  return record;
}
export function experienceDelta(prev, next) {
  if(!prev || !next || !Number.isFinite(prev.percent)||!Number.isFinite(next.percent)) return null;
  if(prev.level!=null && next.level!=null && next.level!==prev.level) {
    return next.level===prev.level+1 ? 100-prev.percent+next.percent : null;
  }
  return next.percent>=prev.percent ? next.percent-prev.percent : null;
}
export function observeExperience(m,value,now){
  if(!value || !/^\d+$/.test(value.raw??''))return false;
  const prev=m.lastExp;
  const next={...value,percent:Number.isFinite(value.percent)&&value.percent>=0&&value.percent<100?value.percent:null};
  const leveled=prev?.level!=null&&next.level===prev.level+1;
  const grew=!!prev && (BigInt(next.raw)>BigInt(prev.raw)||leveled);
  // 퍼센트는 기록용이며 시작/유지 판단에는 사용하지 않는다.
  if(grew){
    if(!m.running)beginHunt(m,now,prev);
    const delta=experienceDelta(m.percentAnchor,next);
    if(delta!==null&&delta>=0)m.gainPercent+=delta;
    m.lastGainAt=now;m.reason='사냥 측정 중';
  }
  if(Number.isFinite(next.percent))m.percentAnchor=copy(next);
  m.lastExp=copy(next);
  if(m.running)m.currentExp=copy(next);
  return grew;
}
export function observeFragments(m,count) {
  if(!Number.isInteger(count) || count<0) return;
  m.latestFragments=count;
  if(!m.running) return;
  if(m.fragmentBaseline!==null && count>m.fragmentBaseline) m.fragments+=count-m.fragmentBaseline;
  m.fragmentBaseline=count;
}
export function idleHunt(m,now) {
  return m.running && now-m.lastGainAt>=30000 ? finishHunt(m,m.lastGainAt+30000,'30초간 경험치 증가 없음') : null;
}
