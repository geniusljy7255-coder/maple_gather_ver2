/* 사냥 기록은 설치기/룬 상태와 독립적이다. 시간은 프레임 시각 기준. */
export function createHuntModel(history = []) {
  return { running:false, manuallyEnded:false, pausedAt:null, pausedMs:0, startedAt:0, endedAt:0, lastGainAt:0,
    startExp:null, currentExp:null, gainPercent:0, gainRaw:"0", fragments:0,
    fragmentStart:null, fragmentBaseline:null, latestFragments:null, lastExp:null, percentAnchor:null,
    history:history.slice(0,10), storageError:false, reason:'경험치 증가 대기' };
}
const copy = e => e ? {percent:e.percent,level:e.level ?? null,raw:e.raw ?? null} : null;
export function beginHunt(m, now, baseline = m.lastExp) {
  m.running=true;m.manuallyEnded=false;m.pausedAt=null;m.pausedMs=0;m.startedAt=now;m.endedAt=0;m.lastGainAt=now;
  m.startExp=copy(baseline);m.currentExp=copy(baseline);m.gainPercent=0;m.gainRaw="0";m.percentAnchor=copy(baseline);
  m.fragments=0;m.fragmentStart=m.latestFragments;m.fragmentBaseline=m.latestFragments;m.reason='사냥 측정 중';
}
export function finishHunt(m, now, reason='일시정지') {
  if(!m.running && m.pausedAt === null) return null;
  now = m.pausedAt ?? now;
  const record={startedAt:m.startedAt,endedAt:now,durationMs:Math.max(0,now-m.startedAt-m.pausedMs),startExp:copy(m.startExp),
    endExp:copy(m.currentExp ? {...m.currentExp,percent:m.currentExp.percent ?? m.percentAnchor?.percent ?? null} : null),gainPercent:Number.isFinite(m.startExp?.percent)&&Number.isFinite(m.percentAnchor?.percent)?Number(m.gainPercent.toFixed(4)):null,fragments:m.fragments};
  m.running=false;m.pausedAt=null;m.endedAt=now;m.reason=reason+' · 다음 경험치 증가 시 새 기록';
  m.history=[record,...m.history].slice(0,10);
  return record;
}
function experienceDelta(prev, next) {
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
  if (m.pausedAt !== null || m.manuallyEnded) {
    m.lastExp = copy(next);
    return false;
  }
  if (m.running && !m.startExp) m.startExp=copy(next);
  const leveled=prev?.level!=null&&next.level===prev.level+1;
  const grew=!!prev && (BigInt(next.raw)>BigInt(prev.raw)||leveled);
  // 퍼센트는 기록용이며 시작/유지 판단에는 사용하지 않는다.
  if(grew){
    const alreadyRunning = m.running;
    if(!alreadyRunning)beginHunt(m,now,prev);
    if (!leveled && prev?.raw) {
      m.gainRaw = String(BigInt(m.gainRaw) + BigInt(next.raw) - BigInt(prev.raw));
    }
    m.lastGainAt=now;m.reason='사냥 측정 중';
  }
  if (Number.isFinite(next.percent)) {
    if (m.running) {
      // The first complete reading becomes the percent baseline when OCR started with raw only.
      if (m.startExp && !Number.isFinite(m.startExp.percent)) m.startExp.percent = next.percent;
      const delta=experienceDelta(m.percentAnchor,next);
      if (delta!==null) m.gainPercent+=delta;
    }
    m.percentAnchor=copy(next);
  }
  m.lastExp=copy(next);
  if(m.running)m.currentExp=copy(next);
  return grew;
}
export function observeFragments(m,count) {
  if(!Number.isInteger(count) || count<0) return;
  m.latestFragments=count;
  if(!m.running) return;
  m.fragmentStart ??= count;
  if(m.fragmentBaseline!==null && count>m.fragmentBaseline) m.fragments+=count-m.fragmentBaseline;
  m.fragmentBaseline=count;
}
