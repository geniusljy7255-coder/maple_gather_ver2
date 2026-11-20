/* 룬 버프/재사용 대기 관측은 분리하고, 화면에는 우선순위에 따라 한 상태만 표시한다. */
export const createRuneState=()=>({announced:false,markerSince:null,markerMissing:null,markerSeen:0,markerPresent:false,markerMisses:0,awaitingBuff:false,
  buffSeen:0,buffKind:null,buffDeadline:0,cooldownDeadline:0,cooldownApprox:false,cooldownSeen:0,cooldownMode:null,
  buffAnchor:null,buffSamples:[],buffConfirmedAt:0,cooldownSamples:[],lastMinute:null,diagnostics:{}});
export function runeScanInterval(s,now){
  const deadline=s.buffDeadline>now ? s.buffDeadline : s.cooldownDeadline;
  const sample=s.cooldownSamples.at(-1);
  const confirmingSeconds=s.cooldownApprox && sample?.n<=599 && now-sample.t<=6500;
  if (deadline-now<=8000 || confirmingSeconds || (s.buffDeadline>now && now-s.buffConfirmedAt<5000)) return 0;
  return 30000;
}
export function cooldownSeconds(value,mode,unit){
  if(!Number.isInteger(value)||value<1||value>900)return null;
  if (unit==='minutes' && (value<10 || value>15)) return null;
  return value>=10&&value<=15&&(unit==='minutes'||(!unit&&mode!=='seconds'))?{seconds:value*60,approx:true,mode:'minutes'}:
    {seconds:value,approx:false,mode:'seconds'};
}
function confirm(samples,n,now,minutes=false,windowMs=2500){
  samples.push({n,t:now});while(samples.length&&now-samples[0].t>windowMs)samples.shift();
  if(samples.length>8)samples.shift();
  const recent=samples.slice(-3);
  return recent.length>=2&&recent.every(s=>minutes?s.n===n:Math.abs(s.t+s.n*1000-now-n*1000)<=1500);
}
export function updateRune(s,results,now){
  let alert=false;
  const gray = (results||[]).find(r=>r.id==='rune_cooldown'&&r.found&&r.identity!==false&&r.chroma);
  const cooldownLocked=s.cooldownDeadline>now && s.buffDeadline<=now;
  const buffs=(results||[]).filter(r=>r.found&&r.identity!==false&&
    !cooldownLocked &&
    (s.buffDeadline>now || s.cooldownDeadline<=now)&&
    (r.id==='rune_normal'||r.id==='rune_blessed') &&
    !(gray && Math.abs(gray.x-r.x)<gray.size*.5 && Math.abs(gray.y-r.y)<gray.size*.5));
  const timed = buffs.filter(r=>Number.isInteger(r.seconds)&&r.confidence>=.83&&r.seconds>0&&r.seconds<=900);
  const longest = timed.reduce((best,r)=>!best || r.seconds>best.seconds ? r : best,null);
  if (buffs.length) {
    s.buffSeen=now;
    s.buffKind=buffs.some(r=>r.id==='rune_blessed') ? "축복의 룬" : "룬";
    s.awaitingBuff=false;
  }
  if (longest && s.buffSamples.length) {
    const last = s.buffSamples.at(-1);
    if (Math.abs(last.t + last.n*1000 - now - longest.seconds*1000)>1500) s.buffSamples=[];
  }
  if (longest && (s.buffDeadline<=now || now-s.buffConfirmedAt<5000) && confirm(s.buffSamples,longest.seconds,now)) {
    const deadline=now+longest.seconds*1000;
    // A shorter combat effect must not replace the longer experience effect.
    if (s.buffDeadline<=now || deadline>s.buffDeadline+1500) {
      s.buffDeadline=deadline;
      s.buffConfirmedAt=now;
      s.buffAnchor={x:longest.x,y:longest.y};
    }
  }
  for(const r of results||[]){
    if(!r.id.startsWith('rune_')||r.mode==='wait')continue;
    s.diagnostics[r.id]=r;
    if(r.identity===false)continue;
    if(r.id==='rune_marker'){
      if (r.found) {
        s.markerMissing=null;
        s.markerMisses=0;
        const previousSeen = s.markerSeen;
        s.markerSeen=now;
        s.markerSince??=now;
        s.markerPresent=true;
        if (now-s.markerSince>=450 && previousSeen && now-previousSeen<=6500 &&
            !s.announced && s.cooldownDeadline<=now &&
            !(results||[]).some(hit=>hit.id==='rune_cooldown' && hit.found && hit.identity!==false)) {
          s.announced=true;
          alert=true;
        }
      } else {
        s.markerSince=null;
        s.markerMissing??=now;
        if (++s.markerMisses>=2 && now-s.markerMissing>=500 && s.markerPresent) {
          s.markerPresent=false;
          s.announced=false;
          s.markerSeen=0;
          s.awaitingBuff=!buffs.length && s.buffDeadline<=now;
        }
      }
    }
    if(r.id==='rune_cooldown'&&r.found){
      if(buffs.some(b=>Number.isFinite(b.x)&&Number.isFinite(r.x)&&Math.abs(b.x-r.x)<(r.size||32)*.5&&Math.abs(b.y-r.y)<(r.size||32)*.5))continue;
      s.cooldownSeen=now;
      if(r.seconds==null||r.confidence<.83)continue;
      if(s.cooldownDeadline&&now>s.cooldownDeadline+1000)s.cooldownMode=null;
      s.awaitingBuff=false;
      const n=cooldownSeconds(r.seconds,s.cooldownMode,r.unit);if(!n)continue;
      const predicted=(s.cooldownDeadline-now)/1000;
      // Reject a stray short OCR reading while a minute countdown still has time.
      if (!n.approx && s.cooldownMode==='minutes' && predicted>0 &&
          (n.seconds>599 || n.seconds<predicted-65)) continue;
      if (s.cooldownMode==='seconds' && predicted>0 && n.approx) continue;
      if(!confirm(s.cooldownSamples,n.seconds,now,n.approx,6500))continue;
      // 분 숫자가 그대로인 동안 매 프레임 만료 시점을 뒤로 밀지 않는다.
      if(n.approx&&s.lastMinute===r.seconds&&s.cooldownMode==='minutes')continue;
      if(s.cooldownMode==='seconds'&&predicted>0)continue;
      s.cooldownDeadline=now+n.seconds*1000;s.cooldownApprox=n.approx;s.cooldownMode=n.mode;s.lastMinute=n.approx?r.seconds:null;
      if (r===gray && s.buffAnchor &&
          Math.abs(r.x-s.buffAnchor.x)<r.size*.5 && Math.abs(r.y-s.buffAnchor.y)<r.size*.5) {
        s.buffSeen=0;s.buffDeadline=0;s.buffAnchor=null;s.buffSamples=[];
      }
    }
  }
  return alert;
}
export function runePresentation(s,now){
  if(s.buffDeadline>now)return {label:'룬 버프 적용 중',seconds:Math.ceil((s.buffDeadline-now)/1000),approx:false};
  if(s.cooldownDeadline>now)return {label:'룬 재사용 대기',seconds:Math.ceil((s.cooldownDeadline-now)/1000),approx:s.cooldownApprox};
  if(s.cooldownSeen&&now-s.cooldownSeen<6500&&(!s.cooldownDeadline||s.cooldownSeen>s.cooldownDeadline))return {label:'룬 재사용 대기',seconds:null,detail:'남은 시간 확인 중'};
  if(s.buffSeen&&now-s.buffSeen<5000&&!s.buffDeadline)return {label:'룬 버프 적용 중',seconds:null,detail:'남은 시간 확인 중'};
  if(s.markerPresent || (s.markerSeen&&now-s.markerSeen<5000))return {label:'룬이 나타났습니다',seconds:null};
  if(s.awaitingBuff)return {label:'룬 버프 탐색 중',seconds:null};
  return {label:'미니맵 탐색 중',seconds:null,detail:s.cooldownDeadline ? '마지막 확인 · 재사용 대기 종료' : s.buffDeadline ? '마지막 확인 · 룬 버프 종료' : s.markerSeen ? '마지막 확인 · 룬 출현' : ''};
}
