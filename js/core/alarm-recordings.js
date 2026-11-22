const clips = new Map(Object.entries({
  '알림 테스트입니다':'voice-test',
  '화면 공유가 끊겼어요':'share-ended',
  '룬이 나타났습니다':'rune-appeared',
  '회수하세요':'collect',
  '부스터 종료':'booster-ending',
  '야누스 재설치':'janus-reinstall',
  '파운틴 재설치':'fountain-reinstall',
  '예인 재설치':'yein-reinstall',
  '강줄기 재설치':'river-reinstall',
  '플레어 재설치':'flare-reinstall',
  '코스믹 재설치':'cosmic-reinstall',
  '썬스 재설치':'thunder-sphere-reinstall',
  '소혼장막 재설치':'spirit-incarnation-reinstall',
  '블로섬 재설치':'death-blossom-reinstall',
  '배틀쉽 재설치':'battleship-reinstall',
  '시즈봄버 재설치':'siege-bomber-reinstall',
  '흡성와류 재설치':'vortex-reinstall',
  '극딜 사용 가능':'burst-ready',
  '준극딜 사용 가능':'semi-burst-ready',
  '일격필살 준비':'fatal-strike-ready',
  '궁기 낮음, 빨간색 실.':'karing-goongi-low',
  '궁기 높음, 초록색 실.':'karing-goongi-high',
  '도올 낮음, 초록색 실.':'karing-dool-low',
  '도올 높음, 노란색 실.':'karing-dool-high',
  '혼돈 낮음, 노란색 실.':'karing-hondon-low',
  '혼돈 높음, 빨간색 실.':'karing-hondon-high',
  '왼비':'kalos-left',
  '드론':'kalos-drone',
  '구체':'kalos-orb',
  '오비':'kalos-right',
  '간섭 제거 가능':'kalos-charge-ready'
}));

const choices = [['default','기본'],['Haena','Haena'],['Harper','Harper'],['서현','서현']];

export function getAlarmRecording(scope) {
  try {
    const saved=localStorage.getItem(`${scope}_alarm_recording`);
    return choices.some(([id])=>id===saved) ? saved : 'default';
  } catch { return 'default'; }
}

export function alarmClips(text,channel,scope) {
  const voice=getAlarmRecording(scope);
  if (voice==='default' || channel==='boss-utility') return [];
  const lines=channel==='boss-karing' ? text.split(text.endsWith('.') ? /(?<=\.)\s+/ : /,\s+/) : [text];
  if (!lines.every(line=>clips.has(line))) return [];
  return lines.map(line=>({text:line,url:new URL(`../../voice/${voice}/${clips.get(line)}.mp3`,import.meta.url).href}));
}

export const alarmRecordingControl=id=>`
  <label class="flex items-center gap-2 text-xs font-bold">
    <span class="shrink-0">알림 목소리</span>
    <span class="relative min-w-0 flex-1">
      <select id="${id}" class="w-full appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-7 text-slate-800">
        ${choices.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}
      </select>
      <span class="hunt-select-arrow" aria-hidden="true"></span>
    </span>
  </label>`;

export function bindAlarmRecording(select,scope) {
  select.value=getAlarmRecording(scope);
  select.addEventListener('change',()=>{
    try { localStorage.setItem(`${scope}_alarm_recording`,select.value); } catch {}
  });
}
