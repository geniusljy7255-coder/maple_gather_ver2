/* 확실한 감소 수열과 종료 근처 관측이 모두 있어야 알린다. */
export const freshState = () => ({
  state:'none', lastAt:0, anchor:null, samples:[], deadline:null,
  lastReadAt:0, lastSeconds:null, remaining:null, absentSince:null,
  alerted:false, needsReinstall:false, reason:'남은 시간 자동 판독 대기'
});
function predictedSampleCount(custom, deadline) {
  return custom || deadline === null ? 2 : 3;
}
export function advance(tr,r,now) {
  const custom = tr.id?.startsWith('job-');
  if (tr.deadline !== null && now >= tr.deadline) tr.needsReinstall = true;
  const gap=tr.lastAt && now-tr.lastAt>2500;
  tr.lastAt=now;
  const same=tr.anchor && r.found && tr.anchor.size===r.size &&
    Math.abs(tr.anchor.x-r.x)<=r.size/4 && Math.abs(tr.anchor.y-r.y)<=r.size/4;
  if(gap || (r.found && tr.anchor && !same)) {
    tr.samples=[];tr.lastReadAt=0;tr.absentSince=null;
  }
  if(r.found) tr.anchor={x:r.x,y:r.y,size:r.size};
  const valid=r.found && Number.isInteger(r.seconds) && r.seconds >= (custom ? 1 : 6) && r.confidence>=.83;
  let accepted=false;
  if(valid) {
    tr.samples.push({n:r.seconds,t:now});
    tr.samples=tr.samples.filter(s=>now-s.t<=4000).slice(-20);
    const required = predictedSampleCount(custom, tr.deadline);
    const tail=tr.samples.slice(-required);
    const stable=tail.length===required &&
      tail.every(s=>Math.abs((s.t+s.n*1000)-(now+r.seconds*1000))<=1200);
    const decreased=tr.samples.some(s=>now-s.t >= (custom || tr.deadline === null ? 250 : 1000) && s.n>r.seconds &&
      Math.abs((s.t+s.n*1000)-(now+r.seconds*1000))<=1200);
    const predicted=tr.deadline===null?null:(tr.deadline-now)/1000;
    const consistent=predicted!==null && Math.abs(predicted-r.seconds)<=2;
    const refreshed = predicted !== null && r.seconds > 5 &&
      (predicted <= 0 || r.seconds > predicted + 5) && decreased;
    // A clear repeated reading can seed a custom timer while the same
    // displayed second is still on screen. Reinstallation needs a decrease.
    const repeated = custom && predicted === null && r.confidence >= .9 &&
      tr.samples.some(sample => sample.n === r.seconds &&
        now - sample.t >= 250 && now - sample.t <= 950);
    if (stable && (predicted === null || predicted > 0 || refreshed) && (consistent || decreased || repeated)) {
      if (refreshed) {
        tr.needsReinstall = false;
        tr.alerted = false;
      }
      if (!consistent || refreshed || (decreased && Math.abs(predicted-r.seconds)>1)) {
        tr.deadline = now+r.seconds*1000;
      }
      tr.lastReadAt=now;tr.lastSeconds=r.seconds;accepted=true;
    }
  }
  tr.remaining=tr.deadline===null?null:Math.max(0,Math.ceil((tr.deadline-now)/1000));
  const recent=now-tr.lastReadAt<= (r.found && same ? 4500 : 2500);
  if (custom && tr.deadline !== null && tr.remaining > 0 && r.found && same && recent) {
    tr.state = tr.remaining <= 5 ? 'expiring' : 'active';
    if (tr.remaining <= 5) return false;
  }
  if(accepted) {tr.state='active';tr.reason='남은 숫자와 시간 흐름 확인';}
  else if(tr.remaining>5 && recent) {tr.state='active';tr.reason='최근 판독 기준 추정 · 재확인 중';}
  else {tr.state='unknown';tr.reason=r.found?'숫자 재확인 중 · 알림 보류':'아이콘 재탐색 중 · 알림 보류';}
  const ending=r.found && same && r.digit==='absent' &&
    tr.deadline!==null && tr.remaining<=5 && tr.remaining>0 &&
    tr.lastSeconds<=10 && now-tr.lastReadAt<=6500 && !gap;
  if(!ending) tr.absentSince=null;
  else {
    tr.absentSince??=now;
    if(now-tr.absentSince>=1000) {
      tr.state='expiring';tr.reason='종료 근처 시간과 숫자 사라짐 확인';
    }
  }
  return false;
}
