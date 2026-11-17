import { getTimerFormat, setTimerFormat } from './detector.js';
import { jobInstallers, jobSkill, jobIconFile, installerIcon, jobAlarm, onJobInstallersChange } from './job-installers.js';
import {runePresentation} from './rune-state.js';
import {experienceBuffGroups,experienceBuffIcon} from './experience-buffs.js';
/* 사냥 도우미: 화면 구성 · 이벤트 연결 · 렌더링 */
import { $, setText } from '../../core/dom.js';
import { formatHMS, formatMS } from '../../core/format.js';
import { unlockAudio, notify, getVoice, setVoice, getVoiceVolume, setVoiceVolume, ALARM_CHANNELS, isAlarmEnabled, setAlarmEnabled } from '../../core/notify.js';
import { startCapture, stopCapture, getInfo, onCaptureChange } from './capture.js';
import * as S from './session.js';
import { installersHtml, renderInstallers, bindJobInstallers, iconLabel, installerPresentation } from './installers.js';

const BTN_PRIMARY = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700';
const BTN_DANGER = 'rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700';
const BTN_GHOST = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100';
const HUNT_BUTTON_SIZE = 'inline-size:6rem;block-size:2.25rem;padding:0;font-size:.75rem;white-space:nowrap';
const SURFACE = { window: '창', monitor: '전체 화면', browser: '브라우저 탭' };

const dashCard = (label, valueHtml) => `
  <div class="card text-center"><div class="label mb-1 flex min-h-6 items-center justify-center">${label}</div>${valueHtml}</div>`;

export const html = `
<div class="panel">
  <div class="grid gap-4 divide-y divide-slate-200 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:divide-x md:divide-y-0">
    <section class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-bold">화면 공유</h2>
        <span id="huntShareChip" class="chip">공유 안 함</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button id="huntShareBtn" class="${BTN_PRIMARY}">화면 공유 시작</button>
        <button id="huntPipBtn" class="${BTN_GHOST}">PiP 모드</button>
      </div>
      <p id="huntPipStatus" class="hint" role="status"></p>
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
        <input id="huntVoiceVolume" type="range" min="0" max="100" step="5" class="hunt-volume w-full min-w-0 flex-1">
        <output class="w-10 shrink-0 text-right tabular-nums" id="huntVoiceVolumeValue" for="huntVoiceVolume"></output>
      </label>
      <fieldset class="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
        <legend class="px-1 text-xs font-bold text-slate-600">알림별 소리</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">${ALARM_CHANNELS.map(c=>`<label class="flex items-center gap-2 whitespace-nowrap text-xs"><input id="alarm-${c.id}" type="checkbox" class="cb">${c.label}</label>`).join('')}</div>
        <div id="jobAlarmControls" class="flex flex-wrap gap-x-4 gap-y-2"></div>
      </fieldset>
    </section>
  </div>
</div>

<div class="panel">
  <h2 class="panel-h">
    <span><span class="dot"></span>사냥 현황</span>
    <div class="flex flex-wrap justify-end gap-2"><button type="button" style="${HUNT_BUTTON_SIZE}" id="huntStart" class="${BTN_PRIMARY}">측정 시작</button><button type="button" style="${HUNT_BUTTON_SIZE}" id="huntToggle" class="${BTN_DANGER}">일시정지</button><button type="button" style="${HUNT_BUTTON_SIZE}" id="huntRestart" class="${BTN_PRIMARY}">다시 측정</button><button type="button" style="${HUNT_BUTTON_SIZE}" id="huntStop" class="${BTN_GHOST}">측정 종료</button></div>
  </h2>
  <div class="grid grid-cols-2 gap-3">
    ${dashCard('사냥 시간', '<div id="huntTime" class="min-h-10 text-3xl leading-10 font-black tabular-nums text-indigo-600">00:00:00</div><div class="min-h-4" aria-hidden="true"></div>')}
    ${dashCard(iconLabel('솔 에르다 조각',new URL('../../../icon/솔_에르다_조각.png',import.meta.url).href)+' <span class="hint ml-1">(약 10초마다 갱신)</span>', '<div id="huntFragments" class="min-h-10 text-3xl leading-10 font-black tabular-nums text-indigo-600">—</div><div id="huntFragmentsDetail" class="hint min-h-4"></div>')}
  </div>
  <div class="card space-y-2">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <span class="label">획득 경험치 <span class="hint ml-1">(약 5초마다 갱신)</span></span><span id="huntExp" class="text-sm font-black text-indigo-600">인식 대기</span>
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
      <div class="flex items-center justify-between gap-2">
        <label class="label" for="collectSec">알림 시간 (초)</label>
        <label class="flex shrink-0 items-center gap-1 text-xs"><input id="collectEnabled" type="checkbox" class="cb">타이머 사용</label>
      </div>
      <div class="flex items-center gap-2">
        <input type="number" id="collectSec" min="10" max="600" class="input !h-9 w-full min-w-0 flex-1 !py-0">
        <button id="collectReset" class="${BTN_GHOST} !h-9 !py-0 shrink-0 whitespace-nowrap">회수 완료</button>
      </div>
      <p class="hint">회수 완료를 누르면 설정한 시간부터 다시 셉니다.</p>
    </div>
  </div>
</div>

<div class="panel">
  <h2 class="panel-h"><span><span class="dot"></span>룬 · 설치기</span><div class="flex flex-wrap items-center justify-end gap-2">
    <label class="flex items-center gap-1.5 text-xs text-slate-600">
      <span>인게임 시간 표기</span>
      <select id="huntTimerFormat" class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-bold text-slate-800">
        <option value="seconds">초</option>
        <option value="clock">분:초</option>
      </select>
    </label>
    <button id="huntAddInstaller" class="${BTN_GHOST}">설치기 추가하기</button>
  </div></h2>
  <div id="huntInstallerGrid" class="grid gap-3 md:grid-cols-3">
    <div class="card space-y-2 text-center">
      <div class="label">${iconLabel("룬",installerIcon("rune-normal"))}</div>
      <div id="runeState" class="text-sm font-bold">미니맵 탐색 중</div>
      <div id="runeRemaining" class="text-lg font-black text-indigo-600"></div>
    </div>
    ${installersHtml}
  </div>
</div>

<section class="panel">
  <h2 class="panel-h"><span><span class="dot"></span>경험치 버프</span></h2>
  <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
    ${experienceBuffGroups.map(({id,label,files})=>`
      <div class="card flex items-center justify-between gap-2">
        <span class="flex min-w-0 items-center gap-2">
          <img id="exp-buff-icon-${id}" src="${experienceBuffIcon(files[0])}" alt="" width="24" height="24" class="h-6 w-6 shrink-0 rounded">
          <span class="label" id="exp-buff-label-${id}">${label}</span>
        </span>
        <span id="exp-buff-time-${id}" class="hint shrink-0 tabular-nums">--:--</span>
      </div>
    `).join('')}
  </div>
</section>
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
const pipFields = [
  ['사냥 시간', 'huntTime'],
  ['획득 경험치', 'huntExp'],
  ['솔 에르다 조각', 'huntFragments'],
  ['아이템 회수', 'collectLeft'],
  ['룬', 'runeState'],
  ['솔 야누스', 'trk-janus-state'],
  ['에르다 파운틴', 'trk-fountain-state']
];
let pipWindow = null;
let pipValues = [];
let pipStrip = null;
let pipControls = [];
let pipJobKey = '';
const pipIcons = {
  collectLeft: new URL('../../../icon/메소.png',import.meta.url).href,
  huntExp: new URL('../../../icon/경험치.png',import.meta.url).href,
  huntFragments: new URL('../../../icon/솔_에르다_조각.png',import.meta.url).href,
  runeState: installerIcon('rune-normal'),
  'trk-janus-state': installerIcon('솔_야누스'),
  'trk-fountain-state': installerIcon('에르다_파운틴')
};
const pipJobCards = new Map();
export const isPipOpen = () => Boolean(pipWindow && !pipWindow.closed);

const huntButtonIds = ['huntStart','huntToggle','huntRestart','huntStop'];
const huntActions = [
  () => S.startHunt(),
  () => S.state.hunt.pausedAt !== null ? S.resumeHunt() : S.pauseHunt(),
  () => S.startHunt(),
  () => S.endHunt()
].map(action => () => { unlockAudio(); action(); render(Date.now()); });

function syncHuntControls(buttons) {
  const paused = S.state.hunt.pausedAt !== null;
  const started = S.state.hunt.running || paused;
  const labels = ['측정 시작',paused ? '이어서 측정' : '일시정지','다시 측정','측정 종료'];
  buttons.forEach((button,index) => {
    const display = (index === 0 ? !started : started) ? '' : 'none';
    if (button.style.display !== display) button.style.display = display;
    if (button.textContent !== labels[index]) button.textContent = labels[index];
  });
}

function newHuntButtons(doc,container) {
  return huntActions.map((action,index) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = index === 1 ? 'pip-pause' : index === 3 ? '' : 'pip-primary';
    button.addEventListener('click',action);
    container.append(button);
    return button;
  });
}

function makePipCard(doc, label, icon, featured = false) {
  const card = doc.createElement('div');
  card.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;min-height:22px;box-sizing:border-box';
  card.setAttribute('aria-label',label);
  card.title = label;
  if (featured) card.style.cssText += ';justify-content:center;height:100%';
  if (icon) {
    const image = doc.createElement('img');
    image.src = icon;
    image.alt = '';
    image.width = image.height = 16;
    image.style.cssText = 'flex:none;border-radius:3px';
    card.append(image);
  }
  const value = doc.createElement('span');
  value.style.cssText = 'font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere';
  if (featured) value.style.cssText += ';font-size:22px;color:var(--accent);white-space:nowrap';
  card.append(value);
  return {card,value};
}

function makePipColumn(doc, featured = false) {
  const column = doc.createElement('div');
  column.style.cssText = 'flex:1 0 auto;display:grid;grid-template-rows:repeat(2,24px);min-width:82px;align-content:center;padding:0 10px;border-right:1px solid var(--line)';
  if (featured) column.style.cssText += ';grid-template-rows:auto auto;min-width:158px';
  return column;
}

function pipTimeColor(text, fallback = 'var(--ink)') {
  const clock = text.match(/(?:^|\s)(\d+):(\d{2})(?![:\d])/);
  const seconds = clock ? Number(clock[1])*60 + Number(clock[2]) : Number(text.match(/(\d+)초/)?.[1]);
  if (/재설치|다시 설치/.test(text) || seconds <= 5) return 'var(--pip-danger)';
  if (seconds <= 15) return 'var(--pip-warning)';
  return Number.isFinite(seconds) ? 'var(--pip-success)' : fallback;
}

function compactPipInstaller(text) {
  return text?.match(/\d+초/)?.[0] ?? (text?.includes('다시 설치') ? '재설치' : '—');
}

const formatBuffTime=(ms,approx)=>approx ? '약 '+Math.ceil(ms/60000)+'분' : formatMS(ms);
function compactPipRune(now) {
  if (!getInfo().active) return '—';
  const rune = runePresentation(S.state.rune,now);
  if (rune.seconds !== null) {
    const time = formatBuffTime(rune.seconds*1000,rune.approx);
    return rune.label === '룬 재사용 대기' ? '대기 '+time : time;
  }
  if (rune.label === '룬이 나타났습니다') return '출현';
  return rune.label === '룬 재사용 대기' ? '대기' : '탐색';
}

function renderPip(now) {
  if (!isPipOpen()) return;
  const theme = document.documentElement.dataset.theme || 'light';
  const root = pipWindow.document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  pipFields.forEach(([, id], index) => {
    const hunt = S.state.hunt;
    const value = id === 'huntExp'
      ? (Number.isFinite(hunt.startExp?.percent) && Number.isFinite(hunt.percentAnchor?.percent)
        ? '+'+hunt.gainPercent.toFixed(4)+'%p' : '— %p')
      : id === 'runeState'
        ? compactPipRune(now)
        : id.startsWith('trk-')
          ? compactPipInstaller($(id)?.textContent)
          : $(id)?.textContent || '—';
    if (pipValues[index].textContent !== value) {
      pipValues[index].textContent = value;
      if (index >= 3) pipValues[index].style.color = pipTimeColor(value);
    }
  });
  syncHuntControls(pipControls);
  const entries = jobInstallers.filter(jobSkill);
  const jobKey = JSON.stringify(entries.map(item => [item.id,jobIconFile(item)]));
  if (jobKey !== pipJobKey) {
    pipJobKey = jobKey;
    while (pipStrip.children.length > 4) pipStrip.lastElementChild.remove();
    pipJobCards.clear();
    const doc = pipWindow.document;
    let column;
    entries.forEach((item,index) => {
      if (index % 2 === 0) {
        column = makePipColumn(doc);
        pipStrip.append(column);
      }
      const entry = makePipCard(doc,jobSkill(item).label,installerIcon(jobIconFile(item)));
      pipJobCards.set(item.id,entry);
      column.append(entry.card);
    });
  }
  for (const item of entries) {
    const entry = pipJobCards.get(item.id);
    const [label,color] = installerPresentation(item.id,now);
    const value = compactPipInstaller(label);
    if (entry.value.textContent !== value) {
      entry.value.textContent = value;
      entry.value.style.color = pipTimeColor(label, color.includes('red') ? 'var(--pip-danger)' : color.includes('emerald') ? 'var(--pip-success)' : 'var(--ink)');
    }
  }
}

async function togglePip() {
  if (isPipOpen()) { pipWindow.close(); return; }
  const api = globalThis.documentPictureInPicture;
  if (!api?.requestWindow) {
    setText('huntPipStatus', '이 브라우저는 문서 PiP를 지원하지 않습니다.');
    return;
  }
  const button = $('huntPipBtn');
  button.disabled = true;
  try {
    const jobColumns = Math.ceil(jobInstallers.filter(jobSkill).length / 2);
    const width = Math.min(565 + jobColumns * 106, globalThis.screen?.availWidth || 1000);
    const win = await api.requestWindow({width,height:105});
    pipWindow = win;
    const doc = win.document;
    doc.title = '땅캐라 · 사냥 현황';
    doc.documentElement.lang = 'ko';
    doc.body.style.cssText = 'margin:0;padding:10px;background:var(--canvas);color:var(--ink);font:13px system-ui,sans-serif';
    pipStrip = doc.createElement('div');
    pipStrip.className = 'pip-strip';
    pipStrip.style.cssText = 'display:flex;flex:1;min-width:0;overflow-x:auto;align-self:stretch';
    const style = doc.createElement('style');
    style.textContent = `
      :root {
        --pip-danger: var(--danger, #b91c1c); --pip-warning: #a16207; --pip-success: #047857;
      }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --pip-danger: #fda4af; --pip-warning: #fcd38a; --pip-success: #6ee7bb;
      }
      .pip-strip > div > div + div { border-top: 1px solid var(--line); }
      .pip-close:hover { background: var(--line); color: var(--ink); }
      .pip-hunt-controls { display: flex; }
      .pip-hunt-controls button {
        flex: 1 0 0; min-width: 0; height: 24px; padding: 0 3px;
        border: 0; background: transparent; color: var(--ink);
        font: 600 10px system-ui; white-space: nowrap; cursor: pointer;
      }
      .pip-hunt-controls button:nth-child(n+3) { border-left: 1px solid var(--line); }
      .pip-hunt-controls button.pip-pause { color: var(--pip-danger); }
      .pip-hunt-controls button.pip-primary { color: var(--accent); }
      .pip-hunt-controls button:hover { background: var(--canvas); }
    `;
    const paletteStyle = doc.createElement('link');
    paletteStyle.rel = 'stylesheet';
    paletteStyle.href = new URL('../../../css/style.css',import.meta.url).href;
    doc.documentElement.dataset.palette = document.documentElement.dataset.palette || '1';
    doc.head.append(paletteStyle,style);
    let column;
    pipValues = pipFields.map(([label,id], index) => {
      if (index === 0 || index % 2 === 1) {
        column = makePipColumn(doc,index===0);
        pipStrip.append(column);
      }
      const {card,value} = makePipCard(doc,label,pipIcons[id],index===0);
      column.append(card);
      return value;
    });
    const controls = doc.createElement('div');
    controls.className = 'pip-hunt-controls';
    pipControls = newHuntButtons(doc,controls);
    pipStrip.firstElementChild.append(controls);
    const panel = doc.createElement('div');
    panel.style.cssText = 'display:flex;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:5px 0';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'pip-close';
    close.textContent = '×';
    close.title = 'PiP 닫기';
    close.setAttribute('aria-label','PiP 닫기');
    close.style.cssText = 'flex:none;width:28px;height:28px;margin:0 5px;border:0;border-radius:6px;background:transparent;color:inherit;font-size:21px;line-height:1;cursor:pointer';
    close.addEventListener('click', () => win.close());
    panel.append(pipStrip,close);
    doc.body.append(panel);
    win.addEventListener('pagehide', () => {
      if (pipWindow !== win) return;
      pipWindow = null;
      pipValues = [];
      pipStrip = null;
      pipControls = [];
      pipJobKey = '';
      pipJobCards.clear();
      button.textContent = 'PiP 모드';
    }, {once:true});
    button.textContent = 'PiP 닫기';
    setText('huntPipStatus', '');
    render(Date.now());
  } catch {
    setText('huntPipStatus', 'PiP 창을 열지 못했습니다.');
  } finally {
    button.disabled = false;
  }
}

export function bind() {
  const timerFormat = $('huntTimerFormat');
  timerFormat.value = getTimerFormat();
  timerFormat.addEventListener('change',event=>setTimerFormat(event.target.value));
  bindJobInstallers();
  $('huntPipBtn').addEventListener('click', togglePip);
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
  const renderVolume=()=>{
    const percent=volume.value+'%';
    volume.style.setProperty('--volume-progress',percent);
    setText('huntVoiceVolumeValue',percent);
  };
  renderVolume();
  volume.addEventListener('input', () => {
    setVoiceVolume(volume.value);
    renderVolume();
  });
  const master = $('huntVoice');
  const jobControls=new Map();
  const allAlarmIds=()=>[...ALARM_CHANNELS.map(channel=>channel.id),...jobControls.keys()];
  function syncAlarmControls() {
    master.checked = allAlarmIds().some(isAlarmEnabled);
    setVoice(master.checked);
    for (const channel of ALARM_CHANNELS) {
      $('alarm-' + channel.id).checked = isAlarmEnabled(channel.id);
    }
    for (const [id,input] of jobControls) input.checked=isAlarmEnabled(id);
  }
  function renderJobAlarms() {
    const container=$('jobAlarmControls');
    container.replaceChildren();
    jobControls.clear();
    for (const item of jobInstallers) {
      const channel=jobAlarm(item);
      if (!channel) continue;
      const label=document.createElement('label'),input=document.createElement('input');
      label.className='flex items-center gap-2 whitespace-nowrap text-xs';
      input.type='checkbox';input.className='cb';
      input.addEventListener('change',()=>{setAlarmEnabled(channel.id,input.checked);syncAlarmControls();});
      label.append(input,channel.label);
      container.append(label);
      jobControls.set(channel.id,input);
    }
  }
  renderJobAlarms();
  onJobInstallersChange(()=>{renderJobAlarms();syncAlarmControls();});
  if (!getVoice()) {
    for (const id of allAlarmIds()) setAlarmEnabled(id, false);
  }
  syncAlarmControls();
  master.addEventListener('change', () => {
    for (const id of allAlarmIds()) setAlarmEnabled(id, master.checked);
    syncAlarmControls();
  });
  for (const channel of ALARM_CHANNELS) {
    $('alarm-' + channel.id).addEventListener('change', event => {
      setAlarmEnabled(channel.id, event.target.checked);
      syncAlarmControls();
    });
  }
  $('huntTestSound').addEventListener('click', () => notify('알림 테스트입니다', 'alert'));

  for (const [index,id] of huntButtonIds.entries()) {
    $(id).addEventListener('click',huntActions[index]);
  }

  $('collectEnabled').checked = S.state.collect.enabled;
  $('collectEnabled').addEventListener('change', event => {
    S.setCollectEnabled(event.target.checked);
    render(Date.now());
  });
  $('collectSec').value = S.state.collect.sec;
  $('collectSec').addEventListener('change', e => { e.target.value = S.setCollectSec(e.target.value); });
  $('collectReset').addEventListener('click', () => { S.restartCollect(); render(Date.now()); });


  renderShare();
}

/* ---------- 렌더링 (탭이 보일 때 0.25초마다) ---------- */
export function render(now) {
  setText('huntTime', formatHMS(S.huntMs(now)));
  syncHuntControls(huntButtonIds.map(id=>$(id)));

  const left = S.collectLeftMs(now), total = S.state.collect.sec * 1000;
  setText('collectLeft', !S.state.collect.enabled ? '꺼짐' : left === null ? '--:--' : formatMS(left));
  $('collectReset').disabled = !S.state.collect.enabled;
  $('collectSec').disabled = !S.state.collect.enabled;
  $('collectBar').style.width = left === null ? '0%' : `${Math.min(100, (1 - left / total) * 100).toFixed(1)}%`;

  renderMeasurements(now);

  renderShare();
  renderInstallers(now);
  renderPip(now);
}

let historyKey='';
const dateTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:"h23"});
const percent=value=>value==null?'미확인':Number(value).toFixed(4)+'%';
function renderMeasurements(now){
  const h=S.state.hunt,r=S.state.rune,v=S.state.vision,sharing=getInfo().active;
  const measureReason=(h.running||h.manuallyEnded)?h.reason:v.exp?.value?.raw?h.reason:(v.exp?.reason||'경험치 숫자 인식 대기');
  setText('huntMeasureState',h.manuallyEnded ? '측정 종료 · 측정 시작 버튼으로 시작' : measureReason+' · 실제 경험치 숫자 증가로 시작');
  const lastPercent = h.percentAnchor?.percent ?? h.lastExp?.percent;
  const gainedPercent = Number.isFinite(h.startExp?.percent) && Number.isFinite(lastPercent);
  setText('huntExp', h.startExp
    ? gainedPercent ? '+'+h.gainPercent.toFixed(4)+'%p' : '+'+BigInt(h.gainRaw).toLocaleString('ko-KR')
    : h.lastExp?.raw ? '+0' : '경험치 인식 대기');
  const expDetails = [];
  if (h.startExp?.raw) expDetails.push('시작 경험치 '+BigInt(h.startExp.raw).toLocaleString('ko-KR'));
  expDetails.push('현재 경험치 '+(h.lastExp?.raw ? BigInt(h.lastExp.raw).toLocaleString('ko-KR') : '숫자 인식 대기'));
  if (gainedPercent && h.startExp?.raw) expDetails.push('획득 경험치 +'+BigInt(h.gainRaw).toLocaleString('ko-KR'));
  if (h.startExp) expDetails.push(percent(h.startExp.percent)+' → '+percent(h.currentExp?.percent ?? lastPercent));
  setText('huntExpDetail',expDetails.join(' · '));
  const currentPercent = h.lastExp?.percent ?? lastPercent;
  const progress = $('huntExpProgress');
  const percentKnown = Number.isFinite(currentPercent);
  $('huntExpBar').style.width = percentKnown ? currentPercent + '%' : '0%';
  if (percentKnown) progress.setAttribute('aria-valuenow', String(currentPercent));
  else progress.removeAttribute('aria-valuenow');
  setText('huntFragments', '+'+h.fragments+'개');
  setText('huntFragmentsDetail',
    '시작 '+(h.fragmentStart === null ? '—' : h.fragmentStart+'개')+
    ' → 현재 '+(h.latestFragments === null ? '—' : h.latestFragments+'개'));
  const rune=runePresentation(r,now);
  for (const {id,label,files} of experienceBuffGroups) {
    const buff=sharing ? v.expBuffs?.[id] : null;
    const active=buff?.deadline>now;
    const icon=$('exp-buff-icon-'+id);
    const src=experienceBuffIcon(active && files.includes(buff.file) ? buff.file : files[0]);
    if (icon.src!==src) icon.src=src;
    setText('exp-buff-label-'+id,active && buff.multiplier ? label+' ×'+buff.multiplier : label);
    setText('exp-buff-time-'+id,active ? formatBuffTime(buff.deadline-now,buff.approx) :
      buff?.seenAt && now-buff.seenAt<6500 ? (buff.sample && now-buff.sample.at<6500 ? '시간 확인 중' : '시간 판독 중') : '--:--');
  }
  const runeLabel = rune.label.endsWith('버프 적용 중') ? '룬 버프 적용 중' : rune.label;
  setText('runeState', sharing ? runeLabel : '화면 공유 대기');
  setText('runeRemaining',!sharing?'':rune.seconds!==null?formatBuffTime(rune.seconds*1000,rune.approx):(rune.detail||''));
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
      for (const value of [started, formatHMS(item.durationMs ?? (item.endedAt - item.startedAt)), experience, item.fragments + '개']) {
        const cell = document.createElement('td');
        cell.className = 'whitespace-nowrap px-2 py-2';
        cell.textContent = value;
        row.append(cell);
      }
      host.append(row);
    }
  }
}
