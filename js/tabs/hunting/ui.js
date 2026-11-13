import {runePresentation} from './rune-state.js';
/* 사냥 도우미: 화면 구성 · 이벤트 연결 · 렌더링 */
import { $, setText } from '../../core/dom.js';
import { formatHMS, formatMS } from '../../core/format.js';
import { unlockAudio, notify, getVoice, setVoice, getVoiceVolume, setVoiceVolume, ALARM_CHANNELS, isAlarmEnabled, setAlarmEnabled } from '../../core/notify.js';
import { startCapture, stopCapture, getInfo, onCaptureChange } from './capture.js';
import * as S from './session.js';
import { installersHtml, renderInstallers } from './installers.js';

const BTN_PRIMARY = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700';
const BTN_DANGER = 'rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700';
const BTN_GHOST = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100';
const SURFACE = { window: '창', monitor: '전체 화면', browser: '브라우저 탭' };

const dashCard = (label, valueHtml) => `
  <div class="card text-center"><div class="label mb-1">${label}</div>${valueHtml}</div>`;

export const html = `
<div class="panel">
  <div class="grid gap-4 divide-y divide-slate-200 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:divide-x md:divide-y-0">
    <section class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-bold">화면 공유</h2>
        <span id="huntShareChip" class="chip">공유 안 함</span>
      </div>
      <button id="huntShareBtn" class="${BTN_PRIMARY}">화면 공유 시작</button>
      <p id="huntShareInfo" class="hint break-words"></p>
      <p id="huntShareWarn" class="hidden text-xs text-amber-700"></p>
    </section>
    <section class="min-w-0 space-y-3 pt-4 md:pl-4 md:pt-0">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" id="huntVoice" class="cb"> 음성 알림</label>
        <button id="huntTestSound" class="${BTN_GHOST}">알림 테스트</button>
      </div>
      <label class="flex items-center gap-2 text-xs font-bold">
        <span class="shrink-0 whitespace-nowrap">음성 크기</span>
        <input id="huntVoiceVolume" type="range" min="0" max="100" step="5" class="w-full min-w-0 flex-1 accent-indigo-600">
        <output class="w-10 shrink-0 text-right tabular-nums" id="huntVoiceVolumeValue" for="huntVoiceVolume"></output>
      </label>
      <fieldset class="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
        <legend class="px-1 text-xs font-bold text-slate-600">알림별 소리</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">${ALARM_CHANNELS.map(c=>`<label class="flex items-center gap-2 whitespace-nowrap text-xs"><input id="alarm-${c.id}" type="checkbox" class="cb">${c.label}</label>`).join('')}</div>
      </fieldset>
    </section>
  </div>
</div>

<div class="panel">
  <h2 class="panel-h">
    <span><span class="dot"></span>사냥 현황</span>
    <div class="flex gap-2"><button id="huntToggle" class="${BTN_GHOST}">일시정지</button><button id="huntRestart" class="${BTN_PRIMARY}">다시 측정</button></div>
  </h2>
  <div class="grid grid-cols-2 gap-3">
    ${dashCard('사냥 시간', '<div id="huntTime" class="text-3xl md:text-4xl font-black tabular-nums text-indigo-600">00:00:00</div>')}
    ${dashCard('솔 에르다 조각', '<div id="huntFragments" class="text-2xl font-black text-indigo-600">—</div><div id="huntFragmentsDetail" class="hint"></div>')}
  </div>
  <div class="card space-y-2">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <span class="label">획득 경험치</span><span id="huntExp" class="text-sm font-black text-indigo-600">인식 대기</span>
    </div>
    <div id="huntExpProgress" role="progressbar" aria-label="현재 레벨 경험치" aria-valuemin="0" aria-valuemax="100" class="h-2 overflow-hidden rounded-full bg-slate-200">
      <div id="huntExpBar" class="h-full bg-emerald-500" style="width:0%"></div>
    </div>
    <div id="huntExpDetail" class="hint"></div>
  </div>
  <p id="huntMeasureState" class="hint"></p>
  <details class="card">
    <summary class="cursor-pointer text-sm font-bold">최근 사냥 기록</summary>
    <div class="mt-2 overflow-x-auto">
      <table class="w-full text-left text-xs tabular-nums">
        <thead class="border-b border-slate-200 text-slate-600"><tr>
          ${['시작 시간','사냥 시간','경험치','솔 에르다 조각'].map(label=>`<th scope="col" class="whitespace-nowrap px-2 py-2">${label}</th>`).join('')}
        </tr></thead>
        <tbody id="huntHistory" class="divide-y divide-slate-100"></tbody>
      </table>
    </div>
    <p id="huntHistoryWarn" class="hint mt-1"></p>
  </details>
</div>

<div class="panel">
  <h2 class="panel-h">
    <span><span class="dot"></span>아이템 회수</span>
    <span class="hint">경험치 증가 시 시작 · 일시정지 시 중단</span>
  </h2>
  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
    <div class="card text-center">
      <div class="label mb-1">알림까지 남은 시간</div>
      <div id="collectLeft" class="text-3xl font-black text-slate-800">--:--</div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div id="collectBar" class="h-full w-0 bg-indigo-500"></div></div>
    </div>
    <div class="card space-y-2">
      <label class="label block" for="collectSec">알림 시간 (초)</label>
      <div class="flex items-center gap-2">
        <input type="number" id="collectSec" min="10" max="600" class="input !h-9 w-full min-w-0 flex-1 !py-0">
        <button id="collectReset" class="${BTN_GHOST} !h-9 !py-0 shrink-0 whitespace-nowrap">회수 완료</button>
      </div>
      <p class="hint">회수 완료를 누르면 설정한 시간부터 다시 셉니다.</p>
    </div>
  </div>
</div>

<div class="panel">
  <h2 class="panel-h"><span><span class="dot"></span>룬 · 설치기</span></h2>
  <div class="grid gap-3 md:grid-cols-3">
    <div class="card space-y-2 text-center">
      <div class="label">룬</div>
      <div id="runeState" class="text-sm font-bold">미니맵 탐색 중</div>
      <div id="runeRemaining" class="text-lg font-black text-indigo-600"></div>
    </div>
    ${installersHtml}
  </div>
</div>
`;

/* ---------- 화면 공유 ---------- */
let shareError = '';

function surfaceWarn(surface) {
  if (surface === 'window') return '';
  if (surface === 'monitor') return '전체 화면을 공유 중이에요. 게임 창만 선택하면 더 안정적이에요.';
  if (surface === 'browser') return '브라우저 탭이 공유되고 있어요. 게임 창을 선택해주세요.';
  return '';
}

function renderShare() {
  const i = getInfo();
  const chip = $('huntShareChip');
  chip.textContent = i.active ? '공유 중' : '공유 안 함';
  ['!border-emerald-300', '!bg-emerald-50', '!text-emerald-700'].forEach(c => chip.classList.toggle(c, i.active));

  const btn = $('huntShareBtn');
  btn.textContent = i.active ? '화면 공유 중지' : '화면 공유 시작';
  btn.className = i.active ? BTN_DANGER : BTN_PRIMARY;

  setText('huntShareInfo', i.active ? `${i.width}×${i.height} · ${SURFACE[i.surface] || '알 수 없음'} 공유 중${i.label ? ` (${i.label})` : ''}` : '공유할 게임 창을 선택하세요.');

  const warn = i.active ? surfaceWarn(i.surface) : shareError;
  setText('huntShareWarn', warn);
  $('huntShareWarn').classList.toggle('hidden', !warn);
}

/* ---------- 이벤트 연결 ---------- */
export function bind() {
  $('huntShareBtn').addEventListener('click', async () => {
    if (getInfo().active) { stopCapture(); return; }
    unlockAudio();
    shareError = '';
    try {
      await startCapture();
    } catch (e) {
      shareError = e?.name === 'NotAllowedError' ? '화면 공유가 취소되었어요.' : `화면 공유를 시작하지 못했어요: ${e?.message || e}`;
    }
    renderShare();
  });
  onCaptureChange(renderShare);

  const volume = $('huntVoiceVolume');
  volume.value = getVoiceVolume();
  setText('huntVoiceVolumeValue', volume.value + '%');
  volume.addEventListener('input', () => {
    setVoiceVolume(volume.value);
    setText('huntVoiceVolumeValue', volume.value + '%');
  });
  const master = $('huntVoice');
  function syncAlarmControls() {
    master.checked = ALARM_CHANNELS.some(channel => isAlarmEnabled(channel.id));
    setVoice(master.checked);
    for (const channel of ALARM_CHANNELS) {
      $('alarm-' + channel.id).checked = isAlarmEnabled(channel.id);
    }
  }
  if (!getVoice()) {
    for (const channel of ALARM_CHANNELS) setAlarmEnabled(channel.id, false);
  }
  syncAlarmControls();
  master.addEventListener('change', () => {
    for (const channel of ALARM_CHANNELS) setAlarmEnabled(channel.id, master.checked);
    syncAlarmControls();
  });
  for (const channel of ALARM_CHANNELS) {
    $('alarm-' + channel.id).addEventListener('change', event => {
      setAlarmEnabled(channel.id, event.target.checked);
      syncAlarmControls();
    });
  }
  $('huntTestSound').addEventListener('click', () => notify('알림 테스트입니다', 'alert'));

  $('huntToggle').addEventListener('click', () => {
    unlockAudio();
    S.pauseHunt();
    render(Date.now());
  });

  $('huntRestart').addEventListener('click', () => { unlockAudio(); S.startHunt(); render(Date.now()); });

  $('collectSec').value = S.state.collect.sec;
  $('collectSec').addEventListener('change', e => { e.target.value = S.setCollectSec(e.target.value); });
  $('collectReset').addEventListener('click', () => { S.restartCollect(); render(Date.now()); });


  renderShare();
}

/* ---------- 렌더링 (탭이 보일 때 0.25초마다) ---------- */
export function render(now) {
  const running = S.state.hunt.running;
  setText('huntTime', formatHMS(S.huntMs(now)));
  setText('huntToggle', running ? '일시정지' : '자동 시작 대기');
  $('huntToggle').disabled=!running;
  $('huntRestart').disabled=!S.state.hunt.lastExp;
  $('huntToggle').className = `${running ? BTN_DANGER : BTN_PRIMARY} !py-1.5`;

  const left = S.collectLeftMs(now), total = S.state.collect.sec * 1000;
  setText('collectLeft', left === null ? '--:--' : formatMS(left));
  $('collectBar').style.width = left === null ? '0%' : `${Math.min(100, (1 - left / total) * 100).toFixed(1)}%`;

  renderMeasurements(now);

  renderShare();
  renderInstallers(now);
}

let historyKey='';
const dateTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:"h23"});
const percent=value=>value==null?'미확인':Number(value).toFixed(4)+'%';
function renderMeasurements(now){
  const h=S.state.hunt,r=S.state.rune,v=S.state.vision,sharing=getInfo().active;
  const measureReason=h.running?h.reason:v.exp?.value?.raw?h.reason:(v.exp?.reason||'경험치 숫자 인식 대기');
  setText('huntMeasureState',measureReason+' · 실제 경험치 숫자 증가로 시작 · 30초간 증가가 없으면 마감');
  setText('huntExp',h.startExp?(Number.isFinite(h.startExp.percent)&&Number.isFinite(h.currentExp?.percent)?'+'+h.gainPercent.toFixed(4)+'%p':'숫자 측정 중 · 증가율 미확인'):'경험치 인식 대기');
  setText('huntExpDetail',(h.startExp?percent(h.startExp.percent)+' → '+percent(h.currentExp?.percent)+' · ':'')+'현재 경험치 '+(h.lastExp?.raw?BigInt(h.lastExp.raw).toLocaleString('ko-KR'):'숫자 인식 대기'));
  const currentPercent = h.lastExp?.percent;
  const progress = $('huntExpProgress');
  const percentKnown = Number.isFinite(currentPercent);
  $('huntExpBar').style.width = percentKnown ? currentPercent + '%' : '0%';
  if (percentKnown) progress.setAttribute('aria-valuenow', String(currentPercent));
  else progress.removeAttribute('aria-valuenow');
  setText('huntFragments',h.fragmentBaseline!==null?'+'+h.fragments+'개':h.latestFragments!==null?h.latestFragments+'개':'수량 인식 대기');
  setText('huntFragmentsDetail',h.latestFragments===null?'':h.fragmentBaseline===null?'현재 보유량':'현재 '+h.latestFragments+'개');
  const rune=runePresentation(r,now);
  const runeLabel = rune.label.endsWith('버프 적용 중') ? '룬 버프 적용 중' : rune.label;
  setText('runeState', sharing ? runeLabel : '화면 공유 대기');
  setText('runeRemaining',!sharing?'':rune.seconds!==null?(rune.approx?'약 ':'')+formatMS(rune.seconds*1000):(rune.detail||''));
  setText('huntHistoryWarn',h.storageError?'브라우저 저장에 실패했습니다. 현재 기록은 이 화면에서만 유지됩니다.':'최근 10개 저장');
  const key=JSON.stringify(h.history);
  if(key!==historyKey){
    historyKey=key;const host=$('huntHistory');host.replaceChildren();
    if (!h.history.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'px-2 py-2 text-slate-500';
      cell.textContent = '완료된 사냥 기록이 없습니다.';
      row.append(cell);
      host.append(row);
    }
    for (const item of h.history) {
      const parts = Object.fromEntries(dateTime.formatToParts(item.startedAt).map(part => [part.type, part.value]));
      const started = `${parts.year}. ${parts.month}. ${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
      const row = document.createElement('tr');
      const experience = item.gainPercent === null ? '미확인' : '+' + item.gainPercent.toFixed(4) + '%p';
      for (const value of [started, formatHMS(item.endedAt - item.startedAt), experience, item.fragments + '개']) {
        const cell = document.createElement('td');
        cell.className = 'whitespace-nowrap px-2 py-2';
        cell.textContent = value;
        row.append(cell);
      }
      host.append(row);
    }
  }
}
