/* 룬 버프/재사용 대기 관측은 분리하고, 화면에는 우선순위에 따라 한 상태만 표시한다. */
export const createRuneState=()=>({announced:false,markerSince:null,markerMissing:null,markerSeen:0,
  buffSeen:0,buffKind:null,buffDeadline:0,cooldownDeadline:0,cooldownApprox:false,cooldownSeen:0,cooldownMode:null,
  buffSamples:[],cooldownSamples:[],lastMinute:null,diagnostics:{}});
export function cooldownSeconds(value,mode){
  if(!Number.isInteger(value)||value<1||value>900)return null;
  return value>=10&&value<=15&&mode!=='seconds'?{seconds:value*60,approx:true,mode:'minutes'}:
    {seconds:value,approx:false,mode:'seconds'};
}
function confirm(samples,n,now,minutes=false){
  samples.push({n,t:now});while(samples.length&&now-samples[0].t>2500)samples.shift();
  if(samples.length>8)samples.shift();
  const recent=samples.slice(-3);
  return recent.length===3&&recent.every(s=>minutes?s.n===n:Math.abs(s.t+s.n*1000-now-n*1000)<=1500);
}
export function updateRune(s,results,now){
  let alert=false;
  const buffs=(results||[]).filter(r=>r.found&&(r.id==='rune_normal'||r.id==='rune_blessed'));
  for(const r of results||[]){
    if(!r.id.startsWith('rune_')||r.mode==='wait')continue;
    s.diagnostics[r.id]=r;
    if(r.identity===false)continue;
    if(r.id==='rune_marker'){
      if(r.found){s.markerMissing=null;s.markerSeen=now;s.markerSince??=now;
        if(now-s.markerSince>=600&&!s.announced){s.announced=true;alert=true;}}
      else{s.markerSince=null;s.markerMissing??=now;if(now-s.markerMissing>=10000)s.announced=false;}
    }
    if((r.id==='rune_normal'||r.id==='rune_blessed')&&r.found){
      s.buffSeen=now;s.buffKind=r.id==='rune_blessed'?'축복의 룬':'룬';
      if(Number.isInteger(r.seconds)&&r.confidence>=.83&&r.seconds>0&&r.seconds<=900&&confirm(s.buffSamples,r.seconds,now)){
        const predicted=(s.buffDeadline-now)/1000;
        if(!s.buffDeadline||predicted<=0||(Math.abs(predicted-r.seconds)>2&&Math.abs(predicted-r.seconds)<=3))s.buffDeadline=now+r.seconds*1000;
      }
    }
    if(r.id==='rune_cooldown'&&r.found){
      if(buffs.some(b=>Number.isFinite(b.x)&&Number.isFinite(r.x)&&Math.abs(b.x-r.x)<(r.size||32)*.5&&Math.abs(b.y-r.y)<(r.size||32)*.5))continue;
      s.cooldownSeen=now;
      if(r.seconds==null||r.confidence<.83)continue;
      if(s.cooldownDeadline&&now>s.cooldownDeadline+1000)s.cooldownMode=null;
      const n=cooldownSeconds(r.seconds,s.cooldownMode);if(!n)continue;
      if(!confirm(s.cooldownSamples,n.seconds,now,n.approx))continue;
      // 분 숫자가 그대로인 동안 매 프레임 만료 시점을 뒤로 밀지 않는다.
      if(n.approx&&s.lastMinute===r.seconds&&s.cooldownMode==='minutes')continue;
      const predicted=(s.cooldownDeadline-now)/1000;
      if(s.cooldownMode==='seconds'&&predicted>0&&Math.abs(predicted-n.seconds)>3)continue;
      if(s.cooldownMode==='seconds'&&predicted>0&&Math.abs(predicted-n.seconds)<=2)continue;
      s.cooldownDeadline=now+n.seconds*1000;s.cooldownApprox=n.approx;s.cooldownMode=n.mode;s.lastMinute=n.approx?r.seconds:null;
    }
  }
  return alert;
}
export function runePresentation(s,now){
  if(s.buffDeadline>now)return {label:(s.buffKind||'룬')+' 버프 적용 중',seconds:Math.ceil((s.buffDeadline-now)/1000),approx:now-s.buffSeen>5000};
  if(s.buffSeen&&now-s.buffSeen<5000&&!s.buffDeadline)return {label:'룬 버프 적용 중',seconds:null,detail:'남은 시간 확인 중'};
  if(s.cooldownDeadline>now)return {label:'룬 재사용 대기',seconds:Math.ceil((s.cooldownDeadline-now)/1000),approx:s.cooldownApprox||now-s.cooldownSeen>5000};
  if(s.cooldownSeen&&now-s.cooldownSeen<5000&&!s.cooldownDeadline)return {label:'룬 재사용 대기',seconds:null,detail:'남은 시간 확인 중'};
  if(s.markerSeen&&now-s.markerSeen<5000)return {label:'룬이 나타났습니다',seconds:null};
  return {label:'미니맵 탐색 중',seconds:null};
}
