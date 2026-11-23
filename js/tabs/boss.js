import {esc} from '../core/dom.js';
import {alarmRecordingControl,bindAlarmRecording} from '../core/alarm-recordings.js';
import {onTick} from '../core/clock.js';
import {formatMS} from '../core/format.js';
import {BOSS_ALARM_CHANNELS,getVoice,setVoice,getVoiceVolume,setVoiceVolume,isAlarmEnabled,setAlarmEnabled,notify} from '../core/notify.js';
import {getInfo,grabFrame,onCaptureChange,startCapture,stopCapture} from './hunting/capture.js';
import {imageData,crop} from './hunting/monitor-assets.js';
import {getTimerFormat,onTimerFormatChange} from './hunting/detector.js';
import {kalosLabels} from './kalos-minimap.js';
import {bindTimerFormat,timerFormatControl} from './hunting/timer-format-control.js';
import {advanceBossAlert,bossReference,confirmBossRegion,readBossRegion} from './boss-recognition.js';
import {BOSS_NAME_LIMIT,BOSS_PRESET_LIMIT,BOSS_UTILITY_LIMIT,addBossPreset,applyBossPresetDraft,bossName,bossRegion,
  isAscent,loadBossPresets,saveBossPresets} from './boss-presets.js';
import {correctKaringConfusion,estimateKaringGauge,karingAlertTransitions,karingBand,karingNames,karingThreadAttack,karingThreads,karingWarning,
  planKaringThreads} from './karing-gauge.js';

const buffGroups = [
  ['보스 킬링 머신'], ['길드의 이름으로'], ['크게 한방'],
  [['반짝이는 빨간 별 물약','반짝이는_빨간_별']],
  ['세이람의 영약'], ['콜렉터의 영약'],
  ['명예의 영약','Lv300의 축복','Lv275의 축복','Lv250의 축복'],
  ['고급 대영웅의 비약','전설의 영웅 비약','고급 무기 제련'],
  ['마슈르의 선물'], ['달콤한 붕어빵'], ['MVP 슈퍼파워'],
  ['유니온의 힘'], [['VIP 버프(능력치)','VIP_버프_능력치']],
  ['익스트림 레드'], ['익스트림 그린'], ['익스트림 블루'],
  ['향상된 10단계 물약'], ['챔피언의 가호'], [['영원한 달빛의 포션','영롱한_달빛_포션']]
];
const titles={burst:'극딜',semi:'준극딜',utility:'생존기·유틸기'};
const button='rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50';
const accentButton='rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700';
const shareStart='rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50';
const shareStop='rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50';
const alarmControl=({id,label})=>`<label class="flex items-center gap-2 whitespace-nowrap text-xs">
  <input type="checkbox" class="cb" data-boss-channel="${id}">${label}
</label>`;
const input='min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';
const burstOverlapMs=3000;
const threadTextClass={'빨간색':'karing-red','초록색':'karing-green','노란색':'karing-yellow'};
const utilityColumns='grid grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_1.75rem] items-center gap-1 sm:gap-2';
const buffIcon=file=>new URL('../../icon/buff/'+encodeURIComponent(file)+'.png',import.meta.url).href;
const buffFile=entry=>Array.isArray(entry) ? entry[1] : entry.replaceAll(' ','_');
const buffAssets=buffGroups.flatMap((group,index)=>group.map(entry=>({group:'boss-buff-'+index,file:buffFile(entry)})));
buffAssets.push({group:'boss-strike',file:'일격필살'});

function buffGroup(group) {
  return `<div class="rounded-lg border px-2.5 py-2" style="border-color:var(--line)" data-boss-buff-group>
    ${group.length>1 ? '<div class="hint mb-1">택 1</div>' : ''}
    <ul class="space-y-1.5">${group.map(entry=>{
      const [name,file]=Array.isArray(entry) ? entry : [entry,entry.replaceAll(' ','_')];
      return `<li class="flex items-center gap-2 text-xs font-semibold">
        <img src="${buffIcon(file)}" width="24" height="24" loading="lazy" alt="" class="h-6 w-6 shrink-0 rounded">
        <span class="min-w-0 flex-1">${name}</span>
        <span class="hint shrink-0 tabular-nums" aria-label="남은 시간 미확인" data-boss-buff-time="${file}">--:--</span>
      </li>`;
    }).join('')}</ul>
  </div>`;
}

const html=`
<div class="panel">
  <div class="grid gap-4 divide-y divide-slate-200 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:divide-x md:divide-y-0">
    <section class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-bold">화면 공유</h2>
        <span class="chip" data-boss-share-chip>공유 안 함</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="${shareStart}" data-boss-share>화면 공유 시작</button>
        <button type="button" class="${button}" data-boss-pip>PiP 모드</button>
      </div>
      <p class="hint">화면 공유 시작 버튼을 눌러 MapleStory 화면을 공유 해주세요.</p>
      <p class="hint">퀵슬롯 &amp; 버프 시간 표시는 ‘중앙, 크게’로 설정해 주세요.</p>
      <p class="hint">화면 공유 후 영역 지정 버튼을 눌러 원하는 스킬의 영역을 지정해 주세요.</p>
      <p class="hint" role="status" data-boss-status hidden></p>
      <p class="hint" role="status" data-boss-pip-status hidden></p>
    </section>
    <section class="min-w-0 space-y-3 pt-4 md:pl-4 md:pt-0">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-sm font-bold"><input id="bossVoice" type="checkbox" class="cb">음성 알림</label>
        <button type="button" class="${button} !py-2" data-boss-voice-test>알림 테스트</button>
      </div>
      <label class="flex items-center gap-2 text-xs font-bold">
        <span class="shrink-0 whitespace-nowrap">음성 크기</span>
        <input id="bossVoiceVolume" type="range" min="0" max="100" step="5" class="hunt-volume w-full min-w-0 flex-1">
        <output class="w-10 shrink-0 text-right tabular-nums" for="bossVoiceVolume" data-boss-volume-value></output>
      </label>
      ${alarmRecordingControl('bossAlarmRecording')}
      <fieldset class="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
        <legend class="px-1 text-xs font-bold text-slate-600">알림별 소리</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">${BOSS_ALARM_CHANNELS.filter(channel=>channel.id!=='boss-karing').map(alarmControl).join('')}</div>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">${alarmControl(BOSS_ALARM_CHANNELS.find(channel=>channel.id==='boss-karing'))}</div>
      </fieldset>
    </section>
  </div>
</div>
<div class="grid gap-3 md:grid-cols-2">
  <div class="grid min-w-0 content-stretch gap-3 md:self-stretch">
<section class="card min-w-0 space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-sm font-bold">프리셋</h2>
    <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
      ${timerFormatControl('bossTimerFormat')}
      <button type="button" class="${button}" data-boss-preset-edit>수정</button>
      <button type="button" class="${button}" data-boss-preset-add>+ 추가</button>
      <button type="button" class="${button}" data-boss-preset-save hidden>저장</button>
      <button type="button" class="${button}" data-boss-preset-cancel hidden>취소</button>
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-2" data-boss-presets></div>
  <p class="hint" role="status" data-boss-preset-status hidden></p>
</section>
<dialog class="card !fixed !inset-auto !left-1/2 !top-1/2 !m-0 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-6xl space-y-3 overflow-auto overscroll-contain text-[color:var(--ink)] backdrop:bg-black/50" data-boss-editor aria-labelledby="boss-editor-title">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 id="boss-editor-title" class="text-sm font-bold" data-boss-editor-title>인식 영역 지정</h2>
    <div class="ml-auto flex flex-wrap justify-end gap-2">
      <button type="button" class="${button}" data-boss-refresh>화면 다시 가져오기</button>
      <button type="button" class="${button}" data-boss-clear disabled>영역 초기화</button>
      <button type="button" class="${button}" data-boss-save disabled>영역 저장</button>
      <button type="button" class="${button}" data-boss-close>닫기</button>
    </div>
  </div>
  <p class="hint" data-boss-editor-hint></p>
  <div class="relative overflow-hidden rounded-lg border" style="border-color:var(--line)">
    <canvas class="block h-auto w-full touch-none cursor-crosshair" aria-label="인식 영역을 지정할 공유 화면" data-boss-frame></canvas>
    <div class="pointer-events-none absolute border-2 border-indigo-400 bg-indigo-400/20" data-boss-selection hidden></div>
  </div>
</dialog>
    ${['burst','semi'].map(type=>`<section class="card flex items-center">
      <div class="flex w-full items-center justify-between gap-2">
        <h2 class="text-sm font-bold">${titles[type]} 알림</h2>
        <div data-boss-list="${type}"></div>
      </div>
    </section>`).join('')}
    <section class="card flex items-center gap-2">
      <h2 class="text-sm font-bold">일격필살</h2><span class="hint ml-auto" data-boss-buff-time="일격필살">--:--</span>
    </section>
  </div>
  <section class="card min-w-0 space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-bold">생존기·유틸기</h2>
      <button type="button" class="${button}" data-boss-add="utility">스킬 추가</button>
    </div>
    <div class="${utilityColumns} text-[10px] font-semibold text-slate-500">
      <span class="text-center">음성 알림</span>
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-1">
        <span>이름 (변경 가능)</span><span class="text-center">쿨타임</span>
      </div>
      <span class="text-center">영역 지정</span><span class="text-center">삭제</span>
    </div>
    <div class="space-y-2" data-boss-list="utility"></div>
  </section>
</div>
<section class="card space-y-2">
  <h2 class="text-sm font-bold">패턴 도우미</h2>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex gap-2">
      <button type="button" class="${accentButton}" data-pattern-boss="off" aria-pressed="true">사용 안 함</button>
      <button type="button" class="${button}" data-pattern-boss="karing" aria-pressed="false" aria-controls="karing-pattern-panel">카링</button>
      <button type="button" class="${button}" data-pattern-boss="kalos" aria-pressed="false" aria-controls="kalos-pattern-panel">칼로스</button>
    </div>
    <div data-karing-controls hidden><div class="flex flex-wrap items-center gap-2 [&_button]:h-8">
      <label class="flex items-center gap-1.5 whitespace-nowrap text-xs">게이지 알림
        <input type="number" min="5" max="495" step="5" value="100" class="${input} h-8 w-16" data-karing-threshold>
      </label>
      <button type="button" data-karing-area></button>
    </div></div>
    <button type="button" data-kalos-area hidden></button>
  </div>
  <div id="karing-pattern-panel" class="space-y-2" hidden>
    <div class="grid gap-2" data-karing-gauges></div>
    <p class="hint font-bold" data-karing-recommendation hidden></p>
  </div>
  <div id="kalos-pattern-panel" class="space-y-3" hidden>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      ${Object.entries(kalosLabels).map(([key,name])=>`<div class="flex items-center justify-between gap-2 rounded-lg border border-slate-300 px-2.5 py-2 text-xs" data-kalos-kind="${key}">
        <strong>✦ ${name}</strong><span class="hint" data-kalos-kind-state>—</span>
      </div>`).join('')}
    </div>
    <div class="flex items-center gap-2 text-xs">
      <strong>제거 게이지</strong>
      <div class="h-2 flex-1 overflow-hidden rounded-full" style="background:var(--surface-soft)" aria-hidden="true"><div class="h-full bg-indigo-500" data-kalos-charge-fill style="width:0"></div></div>
      <span class="hint tabular-nums" data-kalos-charge>—</span>
    </div>
  </div>
</section>
<section class="card space-y-2">
  <h2 class="text-sm font-bold">보스 도핑</h2>
  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">${buffGroups.map(buffGroup).join('')}</div>
</section>
<div class="fixed z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs shadow-md"
  data-boss-area-message role="status" hidden></div>`;

function skillRow(skill) {
  const areaButton=`<button type="button" class="${skill.region ? button : accentButton} whitespace-nowrap" data-boss-edit>${skill.region ? '영역 수정' : '영역 지정'}</button>`;
  if (skill.type!=='utility') return `<div class="flex items-center gap-2" data-boss-skill="${skill.id}">
    <span class="hint tabular-nums" aria-label="남은 시간" data-boss-reading="${skill.id}">--:--</span>${areaButton}</div>`;
  const ascent=isAscent(skill);
  return `<div class="${utilityColumns}" data-boss-skill="${skill.id}">
    <input type="checkbox" class="cb justify-self-center" aria-label="${esc(skill.name)} 음성 알림" data-boss-alert ${ascent ? 'disabled' : skill.alert ? 'checked' : ''}>
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-1">
      <input type="text" maxlength="${BOSS_NAME_LIMIT}" class="${input} w-full" aria-label="스킬 이름" value="${esc(skill.name)}"
        ${ascent ? 'disabled style="background-color:var(--surface-soft);color:var(--muted)"' : 'data-boss-skill-name'}>
      <span class="hint whitespace-nowrap text-center tabular-nums" aria-label="${ascent ? '남은 충전 횟수' : '남은 시간'}" data-boss-reading="${skill.id}">${ascent ? '—' : '--:--'}</span>
    </div>
    ${areaButton}
    <button type="button" class="grid h-7 w-7 place-items-center rounded-lg border border-slate-300 bg-white p-0 text-sm leading-none text-slate-700 transition enabled:hover:bg-slate-100 enabled:hover:text-red-600 disabled:opacity-50" aria-label="스킬 삭제" title="스킬 삭제" data-boss-remove ${ascent ? 'disabled' : ''}>×</button>
  </div>`;
}

function mount(section) {
  const $=selector=>section.querySelector(selector);
  bindAlarmRecording($('#bossAlarmRecording'),'boss');
  const settings=loadBossPresets(localStorage);
  const current=()=>settings.presets[settings.active];
  const utilityAtLimit=()=>current().skills.filter(skill=>skill.type==='utility' && !isAscent(skill)).length>=BOSS_UTILITY_LIMIT;
  let karingSettings;
  try { karingSettings=JSON.parse(localStorage.getItem('boss_karing_gauges')); } catch {}
  const karingPanel=$('#karing-pattern-panel');
  const kalosPanel=$('#kalos-pattern-panel');
  const kalosAreaButton=$('[data-kalos-area]');
  const kalosFields=[...section.querySelectorAll('[data-kalos-kind]')];
  const kalosChargeText=$('[data-kalos-charge]');
  const kalosChargeFill=$('[data-kalos-charge-fill]');
  const kalosChargePanel={type:'gauge',name:'칼로스 제거 게이지',region:null};
  try {
    const region=JSON.parse(localStorage.getItem('boss_kalos_charge_region'));
    if (region) kalosChargePanel.region=bossRegion([region.x,region.y],[region.x+region.width,region.y+region.height]);
  } catch {}
  let patternSession=0,kalosCharge=null,kalosChargeSample=null;
  let kalosActive=[];
  function renderKalosPip() {
    if (!pip || pip.closed) return;
    const gauge=pip.document.querySelector('[data-pip-kalos-charge]');
    if (gauge) {
      const percent=kalosCharge?.percent ?? 0;
      gauge.firstElementChild.style.height=`${kalosCharge?.full ? 100 : percent}%`;
      gauge.classList.toggle('full',Boolean(kalosCharge?.full));
      gauge.title=kalosCharge?.full ? '간섭 제거 가능' : kalosCharge ? `제거 게이지 ${percent}%` : '제거 게이지 미확인';
      gauge.setAttribute('aria-label',gauge.title);
    }
    for (const label of pip.document.querySelectorAll('[data-pip-kalos-kind]')) {
      const active=kalosActive.includes(label.dataset.pipKalosKind);
      label.classList.toggle('active',active);
      label.setAttribute('aria-label',label.textContent+(active ? ' 간섭 활성' : ' 간섭 없음'));
    }
  }
  function renderKalos({found=false,active=[]}={}) {
    kalosActive=active;
    renderKalosPip();
    for (const field of kalosFields) {
      const on=active.includes(field.dataset.kalosKind);
      field.classList.toggle('border-red-500',on);
      field.classList.toggle('border-slate-300',!on);
      field.classList.toggle('text-red-600',on);
      field.querySelector('[data-kalos-kind-state]').textContent=on ? '간섭' : found ? '대기' : '—';
    }
    kalosChargeFill.style.width=`${kalosCharge?.percent ?? 0}%`;
    kalosChargeText.textContent=kalosCharge?.full ? '제거 가능' : kalosCharge ? kalosCharge.percent+'%' : '—';
  }
  function saveKalosCharge() {
    kalosCharge=kalosChargeSample=null;
    try { localStorage.setItem('boss_kalos_charge_region',JSON.stringify(kalosChargePanel.region)); } catch {}
    kalosChargeFill.style.width='0';
    kalosChargeText.textContent='—';
    renderKalosPip();
  }
  const karingAreaButton=$('[data-karing-area]');
  const karingControls=$('[data-karing-controls]');
  const thresholdInput=$('[data-karing-threshold]');
  const normalizeThreshold=value=>Math.max(5,Math.min(495,Math.round(value/5)*5));
  let gaugeThreshold=Number.isFinite(karingSettings?.threshold) ? normalizeThreshold(karingSettings.threshold) : 100;
  thresholdInput.value=String(gaugeThreshold);
  const patternButtons=[...section.querySelectorAll('[data-pattern-boss]')];
  const isKaringEnabled=()=>!karingPanel.hidden;
  const gauges=Object.entries(karingNames).map(([key,name])=>({key,name}));
  const savedGaugeRegion=karingSettings?.region;
  const gaugePanel={type:'gauge',name:'카링 게이지 전체',region:null};
  if (savedGaugeRegion && [savedGaugeRegion.x,savedGaugeRegion.y,savedGaugeRegion.width,
    savedGaugeRegion.height].every(Number.isFinite)) {
    const {x,y,width,height}=savedGaugeRegion;
    gaugePanel.region=bossRegion([x,y],[x+width,y+height]);
  }
  const gaugeReads=new Map();
  const gaugeAlarmBands=new Map();
  let gaugeReachedEndpoint=false;
  function clearGaugeReadings() {
    gaugeReads.clear();
    gaugeAlarmBands.clear();
    gaugeReachedEndpoint=false;
  }
  function saveGaugeSettings() {
    try {
      localStorage.setItem('boss_karing_gauges',JSON.stringify({region:gaugePanel.region,threshold:gaugeThreshold}));
    } catch {}
  }
  const presets=$('[data-boss-presets]');
  const presetEdit=$('[data-boss-preset-edit]');
  const presetSave=$('[data-boss-preset-save]');
  const presetCancel=$('[data-boss-preset-cancel]');
  const presetAdd=$('[data-boss-preset-add]');
  const share=$('[data-boss-share]');
  const shareChip=$('[data-boss-share-chip]');
  const editor=$('[data-boss-editor]');
  const canvas=$('[data-boss-frame]');
  const selection=$('[data-boss-selection]');
  const save=$('[data-boss-save]');
  const clear=$('[data-boss-clear]');
  const pipButton=$('[data-boss-pip]');
  let editing=null, draft=null, drag=null, pip=null, presetDraft=null;
  let editorFrame=null, editorViewport=null, worker=null, busy=false, lastScan=0, lastFullScan=0, revision=0, buffs={}, strikeDeadline=0;
  const observations=new Map();
  let pendingSemi=null,lastBurstAlert=-Infinity;
  const buffFields=[...section.querySelectorAll('[data-boss-buff-time]')];

  function status(selector,text) {
    const node=$(selector);
    node.textContent=text;
    node.hidden=!text;
  }
  function persist() {
    try {
      saveBossPresets(localStorage,settings);
      status('[data-boss-preset-status]','');
    }
    catch { status('[data-boss-preset-status]','프리셋을 브라우저에 저장하지 못했습니다.'); }
  }
  function renderPip() {
    if (!pip || pip.closed) return;
    const doc=pip.document,body=doc.body;
    body.replaceChildren();
    const heading=doc.createElement('h1');
    heading.textContent=current().name;
    const header=doc.createElement('header');
    header.append(heading);
    if (isKaringEnabled()) {
      const advice=doc.createElement('span');
      advice.dataset.karingRecommendation='';
      advice.hidden=true;
      header.append(advice);
    }
    body.append(header);
    const skills=current().skills;
    const cell=(name,attribute,value)=>`<div class="pip-skill"><strong>${esc(name)}</strong><span ${attribute}="${value}">--:--</span></div>`;
    const skillCell=skill=>skill ? cell(skill.name,'data-boss-reading',skill.id) : '<div></div>';
    const strip=doc.createElement('div');
    strip.className='pip-strip';
    const cells=[
      ...['burst','semi'].map(type=>skillCell(skills.find(skill=>skill.type===type))),
      cell('일격필살','data-boss-buff-time','일격필살'),skillCell(skills.find(isAscent)),
      ...skills.filter(skill=>skill.type==='utility' && !isAscent(skill)).map(skillCell)
    ];
    for (let i=0;i<cells.length;i+=2) {
      const column=doc.createElement('div');
      column.className='pip-pair';
      column.innerHTML=cells.slice(i,i+2).join('');
      strip.append(column);
    }
    if (isKaringEnabled()) {
      const panel=doc.createElement('section');
      panel.className='pip-gauges';
      panel.innerHTML=gaugeRows({compact:true});
      strip.append(panel);
    } else if (!kalosPanel.hidden) {
      const panel=doc.createElement('section');
      panel.className='pip-kalos';
      panel.setAttribute('aria-label','칼로스 간섭');
      const gauge=doc.createElement('div');
      gauge.dataset.pipKalosCharge='';
      gauge.setAttribute('role','img');
      gauge.append(doc.createElement('span'));
      panel.append(gauge);
      for (const [key,name] of Object.entries(kalosLabels)) {
        const label=doc.createElement('span');
        label.dataset.pipKalosKind=key;
        label.textContent=name;
        panel.append(label);
      }
      strip.append(panel);
    }
    body.append(strip);
    renderKalosPip();
    renderReadings(Date.now());
  }
  function clearReadings() {
    revision++;
    observations.clear();
    pendingSemi=null;
    lastBurstAlert=-Infinity;
  }
  function announceSkill(skill,now) {
    const channel='boss-'+skill.type;
    if (skill.type==='burst' && isAlarmEnabled(channel)) {
      lastBurstAlert=now;
      pendingSemi=null;
    }
    if (skill.type==='semi' && isAlarmEnabled('boss-burst')) {
      if (now-lastBurstAlert<=burstOverlapMs) return;
      const burst=current().skills.find(item=>item.type==='burst' && item.region);
      const state=burst && observations.get(burst.id);
      if (burst && (!state?.kind || (state.kind==='time' && !state.alerted &&
          Math.abs(state.deadline-1000-now)<=burstOverlapMs))) {
        pendingSemi={skill,due:now+burstOverlapMs};
        return;
      }
    }
    notify(skill.name+' 사용 가능','alert',channel);
  }
  function updateGauges(readings,now) {
    if (Object.values(readings).some(value=>value===0 || value===1000)) gaugeReachedEndpoint=true;
    const previousDirect=Object.fromEntries(gauges.map(({key})=>[key,gaugeReads.get(key)?.directValue]));
    const values=gaugeReachedEndpoint ? readings : correctKaringConfusion(readings,previousDirect);
    const previousValues=Object.fromEntries(gauges.map(({key})=>[key,gaugeReads.get(key)?.value ?? 500]));
    const confirmed={};
    for (const {key} of gauges) {
      const value=values?.[key];
      const previous=gaugeReads.get(key);
      if (!Number.isInteger(value)) continue;
      const band=karingBand(value,gaugeThreshold);
      const largeJump=Number.isInteger(previous?.directValue) && Math.abs(value-previous.directValue)>=200;
      if (previous?.sample===band && now-previous.sampleAt<=3000 &&
          (!largeJump || Math.abs(value-previous.sampleValue)<=25)) {
        gaugeReads.set(key,{value,directValue:value,sample:band,sampleAt:now,sampleValue:value});
        confirmed[key]=value;
      } else {
        gaugeReads.set(key,{...previous,sample:band,sampleAt:now,sampleValue:value});
      }
    }
    if (Object.keys(confirmed).length) {
      for (const {key} of gauges) {
        const state=gaugeReads.get(key);
        if (state?.value===undefined) gaugeReads.set(key,{...state,value:500});
      }
      const estimate=estimateKaringGauge(previousValues,confirmed,values);
      if (estimate) {
        const {key,value}=estimate;
        gaugeReads.set(key,{...gaugeReads.get(key),value});
      }
    }
    notifyGaugeWarnings();
  }
  function notifyGaugeWarnings() {
    if (!getInfo('boss').active || !isKaringEnabled()) return;
    if (!isAlarmEnabled('boss-karing')) {
      gaugeAlarmBands.clear();
      return;
    }
    const values=Object.fromEntries(gauges.map(({key})=>[key,gaugeReads.get(key)?.value]));
    const alerts=karingAlertTransitions(values,gaugeAlarmBands,gaugeThreshold);
    if (alerts.length) {
      const text=alerts.map(({key,band,thread})=>`${karingNames[key]} ${band==='low' ? '낮음' : '높음'}, ${thread} 실.`).join(' ');
      notify(text,'alert','boss-karing');
    }
  }
  function renderGauges() {
    const roots=[section];
    if (pip && !pip.closed) roots.push(pip.document);
    const values=Object.fromEntries(gauges.map(({key})=>[key,gaugeReads.get(key)?.value]));
    const plan=isKaringEnabled() ? planKaringThreads(values,gaugeThreshold) : [];
    const labels=plan.map(color=>`${color} 실 (${karingThreadAttack(color)} 공격)`);
    for (const root of roots) {
      const advice=root.querySelector('[data-karing-recommendation]');
      if (!advice) continue;
      const prefix=root===section && labels.length ? '추천 · ' : '';
      const text=prefix+labels.join(' → ');
      if (advice.textContent!==text) {
        const doc=advice.ownerDocument;
        advice.replaceChildren(prefix,...plan.flatMap((color,index)=>{
          const label=doc.createElement('span');
          label.className=threadTextClass[color];
          label.textContent=labels[index];
          return index ? [doc.createTextNode(' → '),label] : [label];
        }));
      }
      advice.hidden=!text;
    }
    for (const root of roots) for (const {key} of gauges) {
      const reading=gaugeReads.get(key);
      const value=reading?.value ?? null;
      const warning=value===null ? null : karingWarning(key,value,gaugeThreshold);
      const field=root.querySelector(`[data-karing-value="${key}"]`);
      if (field) {
        const label=value===null ? '—' : value+(value===1000 ? '(붕괴)' : warning ? `(${warning.label})` : '');
        if (field.textContent!==label) field.textContent=label;
        field.classList.toggle('text-red-600',Boolean(warning));
        const bar=root.querySelector(`[data-karing-bar="${key}"]`);
        const fill=bar.firstElementChild;
        fill.style.width=`${(value ?? 0)/10}%`;
        fill.classList.toggle('bg-red-500',Boolean(warning));
        fill.classList.toggle('bg-indigo-500',!warning);
      }
    }
  }
  function renderReadings(now) {
    renderGauges();
    const labels=new Map(current().skills.map(skill=>{
      const state=observations.get(skill.id);
      let text=isAscent(skill) ? '—' : '--:--';
      if (state?.kind==='time') text=now>=state.deadline ? '사용 가능' : formatMS(state.deadline-now);
      if (state?.kind==='ready') text='사용 가능';
      if (state?.kind==='count' && now-state.at<=5500) text=state.value+'개';
      return [String(skill.id),text];
    }));
    const fields=[...section.querySelectorAll('[data-boss-reading]')];
    if (pip && !pip.closed) fields.push(...pip.document.querySelectorAll('[data-boss-reading]'));
    for (const field of fields) {
      const text=labels.get(field.dataset.bossReading) ?? '—';
      if (field.textContent!==text) field.textContent=text;
    }
    const timeFields=pip && !pip.closed ? [...buffFields,...pip.document.querySelectorAll('[data-boss-buff-time]')] : buffFields;
    for (const field of timeFields) {
      const file=field.dataset.bossBuffTime;
      const record=buffs[buffAssets.find(asset=>asset.file===file)?.group];
      const left=record?.file===file ? record.deadline-now : 0;
      const seenFile=record?.seenFile ?? record?.sample?.file;
      const text=left>0 ? (record.approx ? '약 '+Math.ceil(left/60000)+'분' : formatMS(left)) :
        seenFile===file && now-record.seenAt<5000 ? '확인 중' : '--:--';
      if (field.textContent!==text) {
        field.textContent=text;
        field.setAttribute('aria-label',text==='--:--' ? '남은 시간 미확인' : '남은 시간 '+text);
      }
    }
    const strike=buffs['boss-strike'];
    if (getInfo('boss').active && strike?.deadline>0 && strike.deadline-1000<=now &&
        Math.abs(strike.deadline-strikeDeadline)>2000 &&
        strike.deadline-strike.readAt<=12000) {
      strikeDeadline=strike.deadline;
      notify('일격필살 준비','alert','boss-strike');
    }
  }
  async function startMonitor() {
    let instance;
    try {
      instance=new Worker(new URL('./boss.worker.js',import.meta.url),{type:'module'});
      worker=instance;
      instance.onmessage=({data})=>{
        if (worker!==instance) return;
        if (data.type==='regions') {
          if (data.gaugeOnly) busy=false;
          if (data.revision!==revision) return;
          if (isKaringEnabled()) updateGauges(data.gaugeValues,data.time);
          if (!kalosPanel.hidden && data.kalos) {
            const {alerts,charge}=data.kalos;
            if (alerts.length) notify(alerts.map(key=>kalosLabels[key]).join(', '),'alert','boss-karing');
            if (charge) {
              if (kalosChargeSample?.full===charge.full && data.time-kalosChargeSample.at<=2000) {
                if (charge.full && !kalosCharge?.full) notify('간섭 제거 가능','alert','boss-karing');
                kalosCharge=charge;
              }
              kalosChargeSample={full:charge.full,at:data.time};
            }
            renderKalos(data.kalos);
          }
          for (const reading of data.readings) {
            const skill=current().skills.find(item=>item.id===reading.id);
            if (!skill?.region) continue;
            const state=confirmBossRegion(observations.get(skill.id),reading,data.time);
            observations.set(skill.id,state);
            if (state.completed && skill.alert && !isAscent(skill)) announceSkill(skill,Date.now());
          }
        } else {
          busy=false;
          if (data.type==='buffs' && data.format===getTimerFormat()) buffs=data.buffs;
          if (data.type==='error') status('[data-boss-status]','보스 인식 오류: '+data.message);
        }
        renderReadings(Date.now());
      };
      instance.onerror=()=>{
        if (worker===instance) {
          busy=false;
          status('[data-boss-status]','보스 인식기를 실행하지 못했습니다.');
        }
      };
      const assets=(await Promise.all(buffAssets.map(async asset=>{
        try {
          const img=await imageData(buffIcon(asset.file));
          const size=Math.min(img.width,img.height);
          return {...asset,main:crop(img,Math.floor((img.width-size)/2),Math.floor((img.height-size)/2),size,size)};
        } catch { return null; }
      }))).filter(Boolean);
      if (worker===instance) {
        instance.postMessage({type:'assets',assets});
        if (assets.length!==buffAssets.length) status('[data-boss-status]','일부 버프 아이콘을 불러오지 못했습니다.');
      }
    } catch {
      status('[data-boss-status]','보스 인식기를 실행하지 못했습니다.');
    }
  }
  onTick(now=>{
    if (!getInfo('boss').active) return;
    for (const skill of current().skills) {
      if (skill.alert && !isAscent(skill) && advanceBossAlert(observations.get(skill.id),now)) {
        announceSkill(skill,now);
      }
    }
    if (pendingSemi && now>=pendingSemi.due) {
      notify(pendingSemi.skill.name+' 사용 가능','alert','boss-semi');
      pendingSemi=null;
    }
    renderReadings(now);
    if (!worker) {
      startMonitor();
      return;
    }
    const karingRegion=isKaringEnabled() ? gaugePanel.region : null;
    const kalosEnabled=!kalosPanel.hidden;
    const patternActive=Boolean(karingRegion || kalosEnabled);
    if (busy || now-lastScan<(patternActive ? 250 : 750)) return;
    const frame=grabFrame('boss');
    if (!frame) return;
    lastScan=now;
    const gaugeOnly=patternActive && now-lastFullScan<750;
    if (!gaugeOnly) lastFullScan=now;
    busy=true;
    worker.postMessage({w:frame.width,h:frame.height,data:frame.data,format:getTimerFormat(),
      skills:current().skills.filter(skill=>skill.region),
      karingRegion,kalosEnabled,kalosChargeRegion:kalosEnabled ? kalosChargePanel.region : null,
      patternSession,gaugeOnly,time:now,revision},[frame.data.buffer]);
  });
  bindTimerFormat($('#bossTimerFormat'));
  onTimerFormatChange(()=>{
    revision++;
    pendingSemi=null;
    for (const skill of current().skills) {
      if (!isAscent(skill)) observations.delete(skill.id);
    }
    buffs={};
    lastScan=lastFullScan=0;
    renderReadings(Date.now());
  });
  function renderPresets() {
    const editing=Boolean(presetDraft);
    presetEdit.hidden=editing;
    presetAdd.hidden=editing;
    presetSave.hidden=!editing;
    presetCancel.hidden=!editing;
    presetAdd.disabled=settings.presets.length>=BOSS_PRESET_LIMIT;
    presets.innerHTML=editing ? presetDraft.map(({name},index)=>`<div class="inline-flex min-w-0 items-center gap-1">
      <input class="${input} box-border h-8 w-32 !py-0" maxlength="${BOSS_NAME_LIMIT}" data-boss-preset-name="${index}" aria-label="프리셋 이름" value="${esc(name)}">
      <button type="button" class="${button} box-border !h-8 !w-8 !p-0" data-boss-preset-remove="${index}"
        aria-label="${esc(name)} 삭제" ${presetDraft.length===1 ? 'disabled' : ''}>×</button>
    </div>`).join('') : settings.presets.map((preset,index)=>`<button type="button"
      aria-pressed="${index===settings.active}" class="${index===settings.active ? accentButton : button}" data-boss-preset-select="${index}">${esc(preset.name)}</button>`).join('');
  }
  function gaugeRows({compact=false}={}) {
    return gauges.map(({key,name})=>{
      const {up,down}=karingThreads(key);
      return `<div class="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-2 py-1.5 md:grid-cols-[2rem_minmax(0,1fr)_auto_20rem]" data-karing-row>
        <span class="text-xs font-bold">${name}</span>
        <div class="h-2 overflow-hidden rounded-full" style="background:var(--surface-soft)" data-karing-bar="${key}" aria-hidden="true">
          <div class="h-full rounded-full bg-indigo-500" style="width:0"></div>
        </div>
        <span class="hint min-w-[6.5rem] text-right tabular-nums" data-karing-value="${key}">—</span>
        ${compact ? '' : `<div class="hint col-span-3 flex flex-wrap gap-x-3 border-t pt-1 md:col-span-1 md:justify-end md:border-l md:border-t-0 md:pl-2 md:pt-0" style="border-color:var(--line)">
          <span class="whitespace-nowrap"><span class="karing-red" aria-label="상승">↑</span> <span class="${threadTextClass[up]}">${up} 실 (${karingThreadAttack(up)} 공격)</span></span>
          <span class="whitespace-nowrap"><span class="karing-blue" aria-label="하락">↓</span> <span class="${threadTextClass[down]}">${down} 실 (${karingThreadAttack(down)} 공격)</span></span>
        </div>`}
      </div>`;
    }).join('');
  }
  function render() {
    renderPresets();
    $('[data-boss-add="utility"]').disabled=utilityAtLimit();
    karingAreaButton.className=gaugePanel.region ? button : accentButton;
    karingAreaButton.textContent=gaugePanel.region ? '게이지 영역 수정' : '게이지 영역 지정';
    kalosAreaButton.className=`${kalosChargePanel.region ? button : accentButton} h-8`;
    kalosAreaButton.textContent=kalosChargePanel.region ? '게이지 영역 수정' : '게이지 영역 지정';
    $('[data-karing-gauges]').innerHTML=gaugeRows();
    for (const [type,title] of Object.entries(titles)) {
      const list=current().skills.filter(skill=>skill.type===type);
      $(`[data-boss-list="${type}"]`).innerHTML=list.map(skillRow).join('') ||
        `<p class="hint">${title}에 등록된 스킬이 없습니다.</p>`;
    }
    renderPip();
    renderReadings(Date.now());
  }
  function paintSelection() {
    selection.hidden=!draft;
    save.disabled=!draft;
    clear.disabled=!draft && !editing?.region;
    if (draft && editorViewport) {
      const {x,y,width,height}=editorViewport;
      Object.assign(selection.style,{left:`${(draft.x-x)/width*100}%`,top:`${(draft.y-y)/height*100}%`,
        width:`${draft.width/width*100}%`,height:`${draft.height/height*100}%`});
    }
  }
  function closeEditor() {
    if (editor.open) editor.close();
    editing=draft=drag=null;
    editorFrame=editorViewport=null;
    canvas.width=canvas.height=0;
    paintSelection();
  }
  const areaMessage=$('[data-boss-area-message]');
  let areaMessageTimer=0;
  function hideAreaMessage() {
    clearTimeout(areaMessageTimer);
    areaMessage.hidden=true;
  }
  document.addEventListener('scroll',hideAreaMessage,true);
  document.addEventListener('pointerdown',hideAreaMessage);
  window.addEventListener('resize',hideAreaMessage);
  function showAreaMessage(anchor,text) {
    hideAreaMessage();
    areaMessage.textContent=text;
    areaMessage.hidden=false;
    const rect=anchor.getBoundingClientRect();
    const width=areaMessage.offsetWidth,height=areaMessage.offsetHeight;
    areaMessage.style.left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8))+'px';
    areaMessage.style.top=Math.max(8,rect.bottom-8+height<window.innerHeight ? rect.bottom-8 : rect.top-height-20)+'px';
    areaMessageTimer=setTimeout(hideAreaMessage,4500);
  }
  function captureFor(skill,anchor) {
    if (!getInfo('boss').active) {
      showAreaMessage(anchor,'인식 영역을 지정하거나 수정하려면 먼저 게임 창을 공유해 주세요.');
      return;
    }
    const frame=grabFrame('boss');
    if (!frame) {
      status('[data-boss-status]','공유 화면을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (editing!==skill) draft=skill.region;
    const {width,height,contentHeight=height}=frame;
    const full=skill.type==='gauge';
    const left=full ? 0 : Math.floor(width*Math.min(.54,draft?.x ?? 1));
    const top=full ? 0 : Math.floor(Math.min(contentHeight*.80,(draft?.y ?? 1)*height));
    const bottom=full ? height : Math.min(height,Math.ceil(Math.max(contentHeight,
      draft ? (draft.y+draft.height)*height : 0)));
    canvas.width=width-left;
    canvas.height=bottom-top;
    editorViewport={x:left/width,y:top/height,width:canvas.width/width,height:canvas.height/height};
    editorFrame={w:width,h:height,rgba:frame.data};
    canvas.getContext('2d').putImageData(new ImageData(frame.data,width,height),-left,-top);
    editing=skill;
    $('[data-boss-editor-hint]').textContent=skill===kalosChargePanel
      ? '미니맵 아래 장치의 가운데 구체와 금색 테두리를 함께 드래그하세요.'
      : skill.type==='gauge'
      ? '궁기·도올·혼돈이 모여 있는 원형 게이지 전체가 들어오도록 드래그하세요.'
      : '스킬이 사용 가능한 상태에서 아이콘 하나를 테두리까지 드래그하세요.';
    drag=null;
    $('[data-boss-editor-title]').textContent=skill.name+' 인식 영역';
    status('[data-boss-status]','');
    paintSelection();
    if (!editor.open) editor.showModal();
  }
  function updateShare() {
    const active=getInfo('boss').active;
    if (!active) kalosCharge=kalosChargeSample=null;
    renderKalos();
    share.textContent=active ? '화면 공유 중지' : '화면 공유 시작';
    share.className=active ? shareStop : shareStart;
    shareChip.textContent=active ? '공유 중' : '공유 안 함';
    for (const color of ['!border-emerald-300','!bg-emerald-50','!text-emerald-700']) shareChip.classList.toggle(color,active);
    if (!active) {
      closeEditor();
      worker?.terminate();
      worker=null;
      busy=false;
      lastScan=lastFullScan=0;
      buffs={};
      strikeDeadline=0;
      clearGaugeReadings();
      clearReadings();
      renderReadings(Date.now());
    }
  }

  presets.addEventListener('input',event=>{
    const field=event.target.closest('[data-boss-preset-name]');
    if (field && presetDraft) presetDraft[Number(field.dataset.bossPresetName)].name=field.value;
  });
  presets.addEventListener('click',event=>{
    if (presetDraft) {
      const remove=event.target.closest('[data-boss-preset-remove]');
      if (remove && presetDraft.length>1) {
        presetDraft.splice(Number(remove.dataset.bossPresetRemove),1);
        renderPresets();
      }
      return;
    }
    const selected=event.target.closest('[data-boss-preset-select]');
    if (!selected) return;
    settings.active=Number(selected.dataset.bossPresetSelect);
    clearReadings();
    closeEditor();
    persist();
    render();
  });
  presetAdd.addEventListener('click',()=>{
    addBossPreset(settings);
    clearReadings();
    closeEditor();
    persist();
    render();
  });
  presetEdit.addEventListener('click',()=>{
    presetDraft=settings.presets.map(preset=>({preset,name:preset.name}));
    renderPresets();
    presets.querySelector('input')?.select();
  });
  presetCancel.addEventListener('click',()=>{
    presetDraft=null;
    renderPresets();
  });
  presetSave.addEventListener('click',()=>{
    if (!presetDraft) return;
    const selected=current();
    applyBossPresetDraft(settings,presetDraft);
    if (selected!==current()) {
      closeEditor();
      clearReadings();
    }
    presetDraft=null;
    persist();
    render();
  });

  const master=$('#bossVoice');
  const volume=$('#bossVoiceVolume');
  const channels=[...section.querySelectorAll('[data-boss-channel]')];
  function syncVoice() {
    master.checked=getVoice('boss');
    for (const control of channels) control.checked=isAlarmEnabled(control.dataset.bossChannel);
  }
  function renderVolume() {
    const percent=volume.value+'%';
    volume.style.setProperty('--volume-progress',percent);
    $('[data-boss-volume-value]').textContent=percent;
  }
  master.addEventListener('change',()=>{
    setVoice(master.checked,'boss');
    for (const control of channels) setAlarmEnabled(control.dataset.bossChannel,master.checked);
    syncVoice();
  });
  for (const control of channels) control.addEventListener('change',()=>{
    setAlarmEnabled(control.dataset.bossChannel,control.checked);
    setVoice(channels.some(input=>isAlarmEnabled(input.dataset.bossChannel)),'boss');
    syncVoice();
  });
  volume.value=getVoiceVolume('boss');
  volume.addEventListener('input',()=>{
    setVoiceVolume(volume.value,'boss');
    renderVolume();
  });
  $('[data-boss-voice-test]').addEventListener('click',()=>notify('알림 테스트입니다','alert','boss-test'));
  syncVoice();
  renderVolume();
  share.addEventListener('click',async()=>{
    if (getInfo('boss').active) {
      stopCapture('boss');
      return;
    }
    share.disabled=true;
    try { await startCapture('boss'); status('[data-boss-status]',''); }
    catch (error) {
      status('[data-boss-status]',error?.name==='NotAllowedError' ? '' : '화면 공유를 시작하지 못했습니다.');
    }
    finally { share.disabled=false; }
  });
  onCaptureChange(updateShare,'boss');

  for (const add of section.querySelectorAll('[data-boss-add]')) add.addEventListener('click',()=>{
    if (utilityAtLimit()) return;
    const type=add.dataset.bossAdd, skills=current().skills;
    const id=Math.max(0,...skills.map(skill=>skill.id))+1;
    skills.push({id,type,name:titles[type]+' 스킬',alert:true,region:null});
    persist();
    render();
    $(`[data-boss-skill="${id}"] [data-boss-skill-name]`).select();
  });
  section.addEventListener('change',event=>{
    const row=event.target.closest('[data-boss-skill]');
    if (!row) return;
    const skill=current().skills.find(item=>item.id===Number(row.dataset.bossSkill));
    if (!skill || isAscent(skill)) return;
    if (event.target.matches('[data-boss-alert]')) skill.alert=event.target.checked;
    if (event.target.matches('[data-boss-skill-name]')) {
      const name=bossName(event.target.value) || titles[skill.type]+' 스킬';
      if (isAscent({...skill,name}) && current().skills.some(isAscent)) {
        event.target.value=skill.name;
        return;
      }
      skill.name=name;
      if (isAscent(skill)) {
        skill.alert=false;
        skill.reference=null;
        observations.delete(skill.id);
        revision++;
        persist();
        render();
        return;
      }
      event.target.value=skill.name;
      if (editing===skill) $('[data-boss-editor-title]').textContent=skill.name+' 인식 영역';
    }
    persist();
    renderPip();
  });
  section.addEventListener('click',event=>{
    const kalosButton=event.target.closest('[data-kalos-area]');
    if (kalosButton) {
      captureFor(kalosChargePanel,kalosButton);
      return;
    }
    const gaugeButton=event.target.closest('[data-karing-area]');
    if (gaugeButton) {
      captureFor(gaugePanel,gaugeButton);
      return;
    }
    const action=event.target.closest('[data-boss-edit],[data-boss-remove]');
    if (!action) return;
    const id=Number(action.closest('[data-boss-skill]').dataset.bossSkill);
    const skill=current().skills.find(item=>item.id===id);
    if (!skill) return;
    if (action.matches('[data-boss-edit]')) {
      captureFor(skill,action);
    } else {
      if (isAscent(skill)) return;
      if (editing===skill) closeEditor();
      current().skills=current().skills.filter(item=>item.id!==id);
      observations.delete(id);
      revision++;
      persist();
      render();
    }
  });

  const point=event=>{
    const rect=canvas.getBoundingClientRect();
    const {x,y,width,height}=editorViewport;
    const clamp=value=>Math.max(0,Math.min(1,value));
    return [x+clamp((event.clientX-rect.left)/rect.width)*width,
      y+clamp((event.clientY-rect.top)/rect.height)*height];
  };
  canvas.addEventListener('pointerdown',event=>{
    if (!editing || event.button!==0 || drag) return;
    drag={id:event.pointerId,start:point(event),previous:draft};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if (drag?.id!==event.pointerId) return;
    draft=bossRegion(drag.start,point(event));
    paintSelection();
  });
  canvas.addEventListener('pointerup',event=>{
    if (drag?.id!==event.pointerId) return;
    const region=bossRegion(drag.start,point(event));
    draft=region && region.width*editorFrame.w>=4 && region.height*editorFrame.h>=4 ? region : drag.previous;
    drag=null;
    paintSelection();
  });
  canvas.addEventListener('pointercancel',event=>{
    if (drag?.id!==event.pointerId) return;
    draft=drag.previous;
    drag=null;
    paintSelection();
  });
  save.addEventListener('click',()=>{
    if (!editing || !draft || !editorFrame) return;
    editing.region=draft;
    if (editing.type==='gauge') {
      revision++;
      if (editing===kalosChargePanel) saveKalosCharge();
      else {
        clearGaugeReadings();
        saveGaugeSettings();
      }
      closeEditor();
      render();
      return;
    }
    const sample=isAscent(editing) ? null : readBossRegion(editorFrame,{...editing,reference:null},getTimerFormat());
    editing.reference=!sample || sample.kind==='time' ? null : bossReference(editorFrame,draft);
    if (sample && !editing.reference) status('[data-boss-status]','사용 가능 알림을 받으려면 스킬이 준비된 화면에서 영역을 다시 저장해 주세요.');
    observations.delete(editing.id);
    revision++;
    persist();
    closeEditor();
    render();
  });
  clear.addEventListener('click',()=>{
    if (!editing) return;
    editing.region=draft=drag=null;
    revision++;
    if (editing.type==='gauge') {
      if (editing===kalosChargePanel) saveKalosCharge();
      else {
        clearGaugeReadings();
        saveGaugeSettings();
      }
    } else {
      editing.reference=null;
      observations.delete(editing.id);
      if (editing.type==='burst' || editing.type==='semi') {
        pendingSemi=null;
        lastBurstAlert=-Infinity;
      }
      persist();
    }
    paintSelection();
    render();
  });
  $('[data-boss-close]').addEventListener('click',closeEditor);
  editor.addEventListener('cancel',event=>{
    event.preventDefault();
    closeEditor();
  });
  $('[data-boss-refresh]').addEventListener('click',event=>{ if (editing) captureFor(editing,event.currentTarget); });
  thresholdInput.addEventListener('change',()=>{
    const value=thresholdInput.valueAsNumber;
    const next=Number.isFinite(value) ? normalizeThreshold(value) : gaugeThreshold;
    thresholdInput.value=String(next);
    if (next===gaugeThreshold) return;
    gaugeThreshold=next;
    for (const reading of gaugeReads.values()) {
      reading.sample=null;
    }
    saveGaugeSettings();
    notifyGaugeWarnings();
    renderGauges();
  });
  for (const choice of patternButtons) {
    choice.addEventListener('click',()=>{
      const showKaring=choice.dataset.patternBoss==='karing';
      if (choice.getAttribute('aria-pressed')==='true') return;
      karingPanel.hidden=!showKaring;
      kalosPanel.hidden=choice.dataset.patternBoss!=='kalos';
      kalosAreaButton.hidden=kalosPanel.hidden;
      kalosCharge=kalosChargeSample=null;
      if (!kalosPanel.hidden) renderKalos();
      karingControls.hidden=!showKaring;
      for (const item of patternButtons) {
        item.className=item===choice ? accentButton : button;
        item.setAttribute('aria-pressed',String(item===choice));
      }
      if (!showKaring && editing===gaugePanel) closeEditor();
      if (kalosPanel.hidden && editing===kalosChargePanel) closeEditor();
      clearGaugeReadings();
      patternSession++;
      revision++;
      renderGauges();
      renderPip();
    });
  }

  pipButton.addEventListener('click',async()=>{
    if (pip && !pip.closed) { pip.close(); return; }
    const api=globalThis.documentPictureInPicture;
    if (!api?.requestWindow) {
      status('[data-boss-pip-status]','이 브라우저는 문서 PiP를 지원하지 않습니다.');
      return;
    }
    pipButton.disabled=true;
    try {
      const extra=current().skills.filter(skill=>skill.type==='utility' && !isAscent(skill)).length;
      const width=24+(2+Math.ceil(extra/2))*142+(isKaringEnabled() ? 222 : kalosPanel.hidden ? 0 : 156);
      const window=await api.requestWindow({width,height:108});
      pip=window;
      window.document.title='보스 도우미';
      const theme=getComputedStyle(document.documentElement);
      const style=window.document.createElement('style');
      const dark=document.documentElement.dataset.theme==='dark';
      style.textContent=`
        :root{--surface-soft:${theme.getPropertyValue('--surface-soft')};--surface:${theme.getPropertyValue('--surface')};
          --muted:${theme.getPropertyValue('--muted')};--accent:${theme.getPropertyValue('--accent')};
          --line:${theme.getPropertyValue('--line')};--pip-thread-red:${dark ? '#f87171' : '#b91c1c'};
          --pip-thread-green:${dark ? '#4ade80' : '#166534'};--pip-thread-yellow:${dark ? '#fde047' : '#854d0e'}}
        body{margin:0;padding:10px;background:var(--surface-soft);color:${theme.getPropertyValue('--ink')};font:12px system-ui,sans-serif}
        header{display:flex;align-items:center;gap:8px;min-height:15px;margin:0 0 6px}
        h1{margin:0;font-size:11px;color:var(--muted)}
        [data-karing-recommendation]{margin-left:auto;color:var(--muted);font-size:11px;font-weight:700;text-align:right}
        .karing-red{color:var(--pip-thread-red)}.karing-green{color:var(--pip-thread-green)}.karing-yellow{color:var(--pip-thread-yellow)}
        .pip-strip{display:flex;align-items:stretch;gap:6px;min-height:62px}
        .pip-strip>*+*{border-left:1px solid var(--line)}
        .pip-pair{display:grid;grid-template-rows:repeat(2,minmax(0,1fr));flex:0 0 136px;min-width:0}
        .pip-pair>*+*,[data-karing-row]+[data-karing-row]{border-top:1px solid var(--line)}
        .pip-skill{display:flex;justify-content:space-between;align-items:center;gap:5px;padding:0 6px}
        .pip-skill strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pip-skill span,[data-karing-value]{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
        .pip-gauges{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));flex:0 0 216px;min-width:0}
        .pip-kalos{display:grid;grid-template-columns:7px repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,1fr);
          grid-template-areas:"charge left drone right" "charge left orb right";flex:0 0 150px;box-sizing:border-box;
          align-items:center;gap:3px 4px;padding-left:6px;text-align:center;color:var(--muted)}
        [data-pip-kalos-charge]{grid-area:charge;align-self:stretch;display:flex;align-items:end;margin-block:4px;
          overflow:hidden;border:1px solid var(--line);border-radius:4px;background:var(--surface)}
        [data-pip-kalos-charge]>span{width:100%;background:var(--accent)}
        [data-pip-kalos-charge].full{border-color:var(--accent)}
        [data-pip-kalos-kind="left"]{grid-area:left}
        [data-pip-kalos-kind="right"]{grid-area:right}
        [data-pip-kalos-kind="drone"]{grid-area:drone}
        [data-pip-kalos-kind="orb"]{grid-area:orb}
        [data-pip-kalos-kind]{border:1px solid var(--line);border-radius:5px;padding:2px;white-space:nowrap}
        [data-pip-kalos-kind].active{border-color:var(--pip-thread-red);color:var(--pip-thread-red);font-weight:800}
        [data-karing-row]{display:grid;grid-template-columns:2rem minmax(0,1fr) 5.5rem;align-items:center;
          gap:4px;padding:0 6px}
        [data-karing-bar]{height:5px;overflow:hidden;border-radius:5px;background:var(--line)!important}
        [data-karing-bar]>div{height:100%;background:var(--accent);border-radius:5px}
        [data-karing-bar]>.bg-red-500{background:#ef4444}
        [data-karing-value]{text-align:left;min-width:0}
        [data-karing-value].text-red-600{color:#e64646}`;
      window.document.head.append(style);
      window.addEventListener('pagehide',()=>{
        if (pip===window) pip=null;
        pipButton.textContent='PiP 모드';
      },{once:true});
      pipButton.textContent='PiP 닫기';
      status('[data-boss-pip-status]','');
      renderPip();
    } catch {
      status('[data-boss-pip-status]','PiP 창을 열지 못했습니다.');
    } finally {
      pipButton.disabled=false;
    }
  });
  updateShare();
  render();
}

export default {id:'boss',title:'보스 도우미',className:'space-y-4',html,mount};
