/* 스케줄러 탭 (Nexon Open API) */
import { $, setText, esc } from '../core/dom.js';
import { readJSON } from '../core/storage.js';
import { formatKoreanMoney } from '../core/format.js';
import { nexonApi } from '../core/nexon.js';
import { companionSay } from '../core/notify.js';
import {
  BOSS_PRICES, DIFF_KOR, DIFF_PRICE_KOR, DAILY_DIFF_KEYS, WEEKLY_DIFF_KEYS, MONTHLY_DIFF_KEYS,
  EXCLUDED_WEEKLY, getBossPrice
} from '../data/boss-prices.js';

/* ============================================================
 * 스케줄러: 상태 / API
 * ============================================================ */
const STATE_KEY = 'maple_scheduler_state';
const MAX_NAMES = 8;
let characters = [];      // 조회된 캐릭터: { name, ocid, basic, scheduler }
let selectedIdx = -1;     // 선택된 캐릭터 번호
let charNames = [''];     // 닉네임 입력칸 값

// 체크 상태는 캐릭터(ocid)마다 따로 저장
const stateKeyOf = ocid => `${STATE_KEY}_${ocid}`;
const loadStateOf = ocid => readJSON(stateKeyOf(ocid));
const currentChar = () => characters[selectedIdx];
const guestBossState = {};

const patchState = (key, value) => {
  const c = currentChar();
  if (c) {
    localStorage.setItem(stateKeyOf(c.ocid), JSON.stringify({ ...loadStateOf(c.ocid), [key]: value }));
  } else {
    guestBossState[key] = value;
  }
  renderScheduler();
};
const toggleTask = (key, checked) => patchState(key, checked);
const updatePartyCount = (bossName, count) => patchState(`party_${bossName}`, Number(count));

function resetScheduler() {
  const c = currentChar();
  if (c && confirm(`${c.name}의 모든 체크 및 파티 인원 설정을 초기화하시겠습니까?`)) {
    localStorage.removeItem(stateKeyOf(c.ocid));
    renderScheduler();
  }
}

function saveApiKey(val) { localStorage.setItem('nexon_api_key', val.trim()); }

/* ---------- 닉네임 입력 행 (+ 버튼으로 추가) ---------- */
function loadNames() {
  try {
    const arr = JSON.parse(localStorage.getItem('nexon_character_names') || 'null');
    if (Array.isArray(arr) && arr.length) return arr.slice(0, MAX_NAMES);
  } catch (e) { /* 무시 */ }
  return [localStorage.getItem('nexon_character_name') || ''];   // 이전 버전에서 저장한 닉네임
}
function saveNames() {
  let saved;
  try { saved = readJSON('nexon_character_names'); } catch {}
  if (Array.isArray(saved) && saved.length > MAX_NAMES) {
    localStorage.setItem('nexon_character_names_before_limit', JSON.stringify(saved));
  }
  localStorage.setItem('nexon_character_names', JSON.stringify(charNames));
}
export function getSchedulerCharacters() {
  const loaded=new Map(characters.map(({name,basic})=>[name,basic.character_image]));
  return [...new Set([...loaded.keys(),...loadNames().filter(name=>typeof name==='string').map(name=>name.trim()).filter(Boolean)])]
    .map(name=>({name,image:loaded.get(name)}));
}

function renderNameRows() {
  $('nameList').innerHTML = charNames.map((n, i) => `
    <div class="scheduler-name-entry">
      <button type="button" onclick="${i ? `removeName(${i})` : 'addName()'}" aria-label="${i ? '닉네임 칸 삭제' : '닉네임 칸 추가'}" class="scheduler-name-action" ${!i && charNames.length >= MAX_NAMES ? 'disabled' : ''}>${i ? '−' : '+'}</button>
      <input type="text" value="${esc(n)}" placeholder="닉네임을 입력하세요" class="input text-left" data-idx="${i}"
             oninput="setName(this.dataset.idx, this.value)" onkeyup="if(event.key==='Enter') fetchCharacterInfo()">
    </div>`).join('');
}
function addName() {
  if (charNames.length >= MAX_NAMES) return;
  charNames.push('');
  saveNames(); renderNameRows();
  const inputs = $('nameList').querySelectorAll('input');
  inputs[inputs.length - 1].focus();
}
function removeName(i) { charNames.splice(i, 1); saveNames(); renderNameRows(); }
function setName(i, v) { charNames[i] = v.trim(); saveNames(); }

/* ---------- 캐릭터 조회 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchCharacterInfo() {
  const apiKey = (localStorage.getItem('nexon_api_key') || '').trim();
  const names = [...new Set(charNames.map(n => n.trim()).filter(Boolean))];
  const errBox = $('charError'), btn = $('fetchBtn');
  const showError = msg => { errBox.textContent = msg; errBox.classList.remove('hidden'); };

  errBox.classList.add('hidden');
  if (!apiKey) return showError('Nexon Open API Key를 입력해주세요.');
  if (!names.length) return showError('캐릭터 닉네임을 입력해주세요.');

  const api = nexonApi(apiKey);
  const prevOcid = currentChar()?.ocid;
  const found = [], errors = [];

  btn.disabled = true; btn.textContent = '조회 중...';
  try {
    for (const name of names) {      // API 호출 제한을 피하기 위해 캐릭터를 순서대로 조회
      try {
        const idRes = await api(`id?character_name=${encodeURIComponent(name)}`);
        const idData = await idRes.json();
        if (!idRes.ok || !idData.ocid) throw new Error(idData.error?.message || '캐릭터를 찾을 수 없습니다.');

        const [basicRes, schedulerRes] = await Promise.all([
          api(`character/basic?ocid=${idData.ocid}`),
          api(`scheduler/character-state?ocid=${idData.ocid}`)
        ]);
        const basic = await basicRes.json();
        const scheduler = await schedulerRes.json();
        if (!basicRes.ok) throw new Error(basic.error?.message || '캐릭터 정보 조회 실패');

        found.push({ name, ocid: idData.ocid, basic, scheduler: schedulerRes.ok ? scheduler : null });
      } catch (err) {
        errors.push(`${name}: ${err.message || '데이터를 불러오는 중 오류가 발생했습니다.'}`);
      }
      await sleep(250);
    }
  } finally {
    btn.disabled = false; btn.textContent = '조회';
  }

  found.forEach(c => localStorage.removeItem(stateKeyOf(c.ocid)));   // 조회할 때마다 게임 데이터 기준으로 초기화
  characters = found;
  const keep = found.findIndex(c => c.ocid === prevOcid);
  selectedIdx = found.length ? Math.max(keep, 0) : -1;
  if (errors.length) showError(errors.join(' / '));
  renderScheduler();
  if (found.length) companionSay('앗! 기억났다!');
}

function selectChar(i) { selectedIdx = i; renderScheduler(); }

/* ---------- 캐릭터 카드 / 계정 수익 ---------- */
function renderCharCards() {
  $('charCards').innerHTML = characters.map((c, i) => {
    const b = c.basic, name = b.character_name || c.name, job = b.character_class || '-';
    return `
      <button type="button" onclick="selectChar(${i})" aria-pressed="${i === selectedIdx}" class="scheduler-character card flex flex-col items-center gap-1 p-2.5 text-center hover:border-slate-300">
        <span class="flex h-[7.5rem] w-[7.5rem] items-center justify-center overflow-hidden rounded-lg bg-white">
          <img src="${esc(b.character_image || '')}" alt="" class="h-full w-full scale-x-[-2.8] scale-y-[2.8] object-contain">
        </span>
        <span class="w-full truncate text-xs font-black text-slate-900" title="${esc(name)}">${esc(name)}</span>
        <span class="w-full truncate text-[11px] font-semibold text-slate-600" title="${esc(job)}">Lv.${b.character_level ?? 0} · ${esc(job)}</span>
        <span class="w-full truncate text-[11px] text-slate-400">${esc(b.character_guild_name || '길드 없음')}</span>
      </button>`;
  }).join('');
  $('charEmpty').classList.toggle('hidden', characters.length > 0);
}

function renderAccountRevenue() {
  let daily = 0, weekly = 0, monthly = 0;
  characters.forEach(c => {
    const state = loadStateOf(c.ocid), boss = c.scheduler?.boss_contents;
    daily += renderBossGrid(groupBossContentsByCycle(boss, 'daily'), DAILY_DIFF_KEYS, state, false).revenue;
    weekly += renderBossGrid(groupBossContentsByCycle(boss, 'weekly'), WEEKLY_DIFF_KEYS, state, true).revenue;
    monthly += renderBossGrid(groupBossContentsByCycle(boss, 'monthly'), MONTHLY_DIFF_KEYS, state, true).revenue;
  });
  const hasSchedule = characters.some(c => c.scheduler);
  setText('accDailyRevenue', hasSchedule ? formatKoreanMoney(daily) : '조회 전');
  setText('accWeeklyRevenue', hasSchedule ? formatKoreanMoney(weekly) : '조회 전');
  setText('accMonthlyRevenue', hasSchedule ? formatKoreanMoney(monthly) : '조회 전');
}

/* ============================================================
 * 스케줄러: 렌더링
 * ============================================================ */
function isTaskCompleted(item, type) {
  if (!item) return false;
  if (type === 'boss') return item.complete_flag === 'true' || item.complete_flag === true;

  const name = item.content_name || '';
  if (name.includes('지하 수로') || name.includes('플래그')) return (item.now_count || 0) >= 1;
  if (name.includes('에픽 던전')) return (item.now_count || 0) >= (item.max_count || 5);
  if (item.quest_state === '2') return true;
  return Boolean(item.max_count && item.now_count >= item.max_count);
}

const bossCycleKeywords = {
  daily: ['일간', '일일', '하루', '1일', 'daily'],
  weekly: ['주간', '주일', '1주', 'weekly'],
  monthly: ['월간', '매월', '1개월', 'monthly']
};
const dailyBossDifficulties = new Map([
  ['자쿰', ['easy', 'normal']], ['파풀라투스', ['easy', 'normal']],
  ['매그너스', ['easy', 'normal']], ['힐라', ['normal', 'hard']],
  ['혼테일', ['easy', 'normal', 'chaos']], ['반 레온', ['easy', 'normal', 'hard']],
  ['아카이럼', ['easy', 'normal']], ['카웅', ['normal']],
  ['핑크빈', ['normal', 'chaos']], ['시그너스', ['normal']],
  ...['블러디퀸', '반반', '피에르', '벨룸'].map(name => [name, ['normal']])
]);
const weeklyBossOrder = new Map([
  '자쿰', '매그너스', '파풀라투스', '블러디퀸', '반반', '피에르', '벨룸',
  '스우', '데미안', '가디언 엔젤 슬라임', '루시드', '윌', '더스크', '듄켈', '진 힐라',
  '선택받은 세렌', '감시자 칼로스', '최초의 대적자', '카링', '벨로나', '찬란한 흉성',
  '림보', '발드릭스', '유피테르'
].map((name, index) => [name.replace(/\s+/g, ''), index]));
const guestBossContents = Object.keys(BOSS_PRICES).map(entry => {
  const space = entry.indexOf(' ');
  const name = entry.slice(space + 1);
  const difficulty = Object.keys(DIFF_PRICE_KOR).find(key => DIFF_PRICE_KOR[key] === entry.slice(0, space));
  const cycle = name === '검은 마법사' ? 'monthly'
    : dailyBossDifficulties.get(name)?.includes(difficulty) ? 'daily' : 'weekly';
  return {content_name: name, difficulty, cycle};
});

function groupBossContentsByCycle(bossItems, targetCycle) {
  const grouped = {};

  (bossItems || []).forEach((item, originalIdx) => {
    const name = item.content_name?.trim();
    if (!name || name.includes('메이린')) return;

    const rawDifficulty = String(item.difficulty || 'normal').trim().toLowerCase();
    const difficulty = Object.keys(DIFF_KOR).find(key => DIFF_KOR[key] === rawDifficulty)
      || (rawDifficulty === '익스트림' ? 'extreme' : rawDifficulty);
    const cycleText = [item.cycle, item.boss_type].filter(Boolean).join(' ').toLowerCase();
    const cycle = Object.entries(bossCycleKeywords).find(([, labels]) => labels.some(label => cycleText.includes(label)))?.[0]
      || (dailyBossDifficulties.get(name)?.includes(difficulty) ? 'daily' : undefined);
    if (cycle !== targetCycle) return;

    grouped[name] ??= { name, cycle: item.cycle || item.boss_type, difficulties: {} };
    grouped[name].difficulties[difficulty] = { ...item, originalIdx };
  });

  const bosses = Object.values(grouped);
  if (targetCycle === 'weekly') {
    const rank = boss => weeklyBossOrder.get(boss.name.replace(/\s+/g, '')) ?? weeklyBossOrder.size;
    bosses.sort((a, b) => rank(a) - rank(b));
  }
  return bosses;
}

const taskRow = (key, name, checked, rightHtml = '') => `
  <label class="row cursor-pointer">
    <span class="flex items-center gap-2 overflow-hidden">
      <input type="checkbox" class="cb" data-key="${esc(key)}" onchange="toggleTask(this.dataset.key, this.checked)" ${checked ? 'checked' : ''}>
      <span class="truncate ${checked ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}">${esc(name)}</span>
    </span>
    ${rightHtml}
  </label>`;

const countLabel = item => item.max_count
  ? `<span class="ml-1 whitespace-nowrap text-[11px] font-bold text-slate-500">(${item.now_count}/${item.max_count})</span>` : '';

const emptyMsg = text => `<p class="p-2 text-center text-xs text-slate-400">${text}</p>`;

// 보스 표의 컬럼 폭을 헤더/행에서 동일하게 맞추기 위한 헬퍼
const COL_PARTY = 'w-14 shrink-0 text-center';
const COL_DIFF = 'w-10 shrink-0 flex justify-center items-center';

function bossHeaderHtml(diffKeys, party) {
  return `
    <div class="flex items-center gap-1 border-b border-slate-100 px-1.5 pb-1 text-[10px] font-bold text-slate-400">
      <span class="min-w-0 flex-1">보스</span>
      ${party ? `<span class="${COL_PARTY}">인원수</span>` : ''}
      ${diffKeys.map(d => `<span class="${COL_DIFF}">${DIFF_KOR[d]}</span>`).join('')}
    </div>`;
}

function renderBossGrid(bossList, diffKeys, state, showParty) {
  if (!bossList.length) return { html: emptyMsg('해당 보스 없음'), cleared: 0, revenue: 0 };

  let cleared = 0, revenue = 0;

  const html = bossList.map(boss => {
    const party = showParty ? (state[`party_${boss.name}`] || 1) : 1;
    const imgSrc = `icon/boss/${boss.name.replace(/\s+/g, '')}.png`;
    let isCleared = false;

    const cells = diffKeys.map(diff => {
      const item = boss.difficulties[diff];
      if (!item) return `<div class="${COL_DIFF} text-slate-300">-</div>`;

      const key = `b_api_${item.originalIdx}`;
      const checked = state[key] !== undefined ? state[key] : isTaskCompleted(item, 'boss');
      if (checked) {
        isCleared = true;
        revenue += getBossPrice(diff, boss.name) / party;
      }
      return `<div class="${COL_DIFF}"><input type="checkbox" class="cb !h-5 !w-5" data-key="${key}" onchange="toggleTask(this.dataset.key, this.checked)" ${checked ? 'checked' : ''}></div>`;
    }).join('');

    if (isCleared) cleared++;

    const partySelect = showParty ? `
      <div class="${COL_PARTY}">
        <select data-boss="${esc(boss.name)}" onchange="updatePartyCount(this.dataset.boss, this.value)"
                class="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500">
          ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${party === n ? 'selected' : ''}>${n}인</option>`).join('')}
        </select>
      </div>` : '';

    return `
      <div class="flex items-center gap-1 rounded border-b border-slate-100 p-1.5 hover:bg-slate-50">
        <div class="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-bold ${isCleared ? 'text-slate-400 line-through' : 'text-slate-800'}" title="${esc(boss.name)}">
          <img src="${esc(imgSrc)}" alt="" class="h-8 w-8 flex-shrink-0 rounded object-contain" onerror="this.style.display='none'">
          <span class="truncate">${esc(boss.name)}</span>
        </div>
        ${partySelect}${cells}
      </div>`;
  }).join('');

  return { html, cleared, revenue };
}

function renderScheduler() {
  renderAccountRevenue();
  renderCharCards();
  const c = currentChar();
  $('schedulerReset').hidden = !c;
  setText('schedulerCharName', c ? `· ${c.basic.character_name || c.name}` : '');
  setText('schedulerDate', c?.scheduler?.date ? `(${c.scheduler.date} 기준)` : '');
  const apiData = c?.scheduler || {};
  const state = c ? loadStateOf(c.ocid) : guestBossState;
  const resolve = (key, apiDone) => state[key] !== undefined ? state[key] : apiDone;

  $('bossSummaryBar').classList.toggle('hidden', Boolean(c) && apiData.weekly_boss_clear_count === undefined);
  setText('bossClearCount', apiData.weekly_boss_clear_count ?? '0');
  setText('bossClearLimit', apiData.weekly_boss_clear_limit_count || 12);

  // 일일 콘텐츠
  const dailyItems = (apiData.daily_contents || []).filter(i => i.registration_flag === 'true' || i.registration_flag === true);
  let dailyDone = 0;
  $('dailyList').innerHTML = !dailyItems.length ? emptyMsg(c ? '등록된 일일 콘텐츠가 없습니다.' : '캐릭터 조회 후 이용할 수 있어요.') : dailyItems.map(item => {
    const key = `d_api_${item.content_name}`;
    const checked = resolve(key, isTaskCompleted(item, 'daily'));
    if (checked) dailyDone++;

    if (item.content_name.includes('몬스터') && item.content_name.includes('파크')) {
      return `
        <div class="row border-indigo-100 bg-indigo-50/60">
          <span class="truncate font-bold text-indigo-950">${esc(item.content_name)}</span>
          <span class="chip border-indigo-200 text-indigo-700">${item.now_count ?? 0} / ${item.max_count ?? 14} 판</span>
        </div>`;
    }
    return taskRow(key, item.content_name, checked, countLabel(item));
  }).join('');
  setText('dailyProgress', `${dailyDone}/${dailyItems.length}`);

  // 주간 콘텐츠
  const weeklyItems = (apiData.weekly_contents || [])
    .map((item, idx) => ({ ...item, _idx: idx }))
    .filter(item => {
      const isEpic = item.content_name.includes('에픽 던전');
      const registered = item.registration_flag === 'true' || item.registration_flag === true;
      return (isEpic || registered) && !EXCLUDED_WEEKLY.some(k => item.content_name.includes(k));
    });

  let weeklyDone = 0;
  $('weeklyList').innerHTML = !weeklyItems.length ? emptyMsg(c ? '등록된 주간 콘텐츠가 없습니다.' : '캐릭터 조회 후 이용할 수 있어요.') : weeklyItems.map(item => {
    const key = `w_api_${item._idx}_${item.content_name}`;
    const checked = resolve(key, isTaskCompleted(item, 'weekly'));
    if (checked) weeklyDone++;

    let right;
    if (item.content_name.includes('지하 수로') || item.content_name.includes('플래그')) {
      right = `<span class="chip ml-1 border-indigo-200 bg-indigo-50 text-indigo-700">${(item.now_count || 0).toLocaleString()}점</span>`;
    } else if (item.content_name.includes('에픽 던전')) {
      right = `<span class="ml-1 whitespace-nowrap text-[11px] font-bold text-slate-500">(${item.now_count || 0} / 5 단계)</span>`;
    } else {
      right = countLabel(item);
    }
    return taskRow(key, item.content_name, checked, right);
  }).join('');
  setText('weeklyProgress', `${weeklyDone}/${weeklyItems.length}`);

  // 보스 콘텐츠
  const sections = [
    { cycle: 'daily',   keys: DAILY_DIFF_KEYS,   party: false, list: 'dailyBossList',   progress: 'dailyBossProgress',   revenue: 'dailyBossRevenue' },
    { cycle: 'weekly',  keys: WEEKLY_DIFF_KEYS,  party: true,  list: 'weeklyBossList',  progress: 'weeklyBossProgress',  revenue: 'weeklyBossRevenue' },
    { cycle: 'monthly', keys: MONTHLY_DIFF_KEYS, party: true,  list: 'monthlyBossList', progress: 'monthlyBossProgress', revenue: 'monthlyBossRevenue' }
  ];
  sections.forEach(s => {
    const bosses = groupBossContentsByCycle(c ? apiData.boss_contents : guestBossContents, s.cycle);
    const res = renderBossGrid(bosses, s.keys, state, s.party);
    $(s.list).innerHTML = s.cycle === 'daily' && !bosses.length
      ? emptyMsg('조회 응답에 일간 보스 기록이 없습니다.')
      : res.html;
    setText(s.progress, `${res.cleared}/${bosses.length}`);
    setText(s.revenue, formatKoreanMoney(res.revenue));
    if (!c && s.cycle === 'weekly') setText('bossClearCount', res.cleared);
  });
}

/* ============================================================
 * 탭 정의
 * ============================================================ */
const html = `
    <section id="schedulerSetup" class="panel scheduler-setup">
      <h2>캐릭터 조회</h2>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div class="min-w-0">
          <label class="label mb-1.5 block" for="apiKey">넥슨 Open API 키</label>
          <input type="password" id="apiKey" placeholder="API Key 입력" class="input text-left" onchange="saveApiKey(this.value)">
        </div>
        <div class="min-w-0 md:col-span-2">
          <div class="scheduler-name-heading"><span class="label">캐릭터 닉네임</span></div>
          <div class="scheduler-lookup-row"><div id="nameList"></div><button id="fetchBtn" type="button" onclick="fetchCharacterInfo()" class="tool-button tool-primary">조회</button></div>
        </div>
      </div>

      <p class="hint">이번 주에 게임에 접속한 캐릭터의 기록을 조회할 수 있어요.</p>
      <div id="charError" class="hidden rounded-lg border border-red-200 bg-red-50 p-2 text-center text-xs font-bold text-red-500"></div>
    </section>

    <section id="schedulerAccount" class="panel scheduler-account">
      <h3 class="panel-h">계정 보스 수익</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="card text-center"><div class="label mb-1">일간</div><div id="accDailyRevenue" class="text-sm font-black text-indigo-600">조회 전</div></div>
        <div class="card text-center"><div class="label mb-1">주간</div><div id="accWeeklyRevenue" class="text-sm font-black text-indigo-600">조회 전</div></div>
        <div class="card text-center"><div class="label mb-1">월간</div><div id="accMonthlyRevenue" class="text-sm font-black text-indigo-600">조회 전</div></div>
      </div>
    </section>

    <div id="schedulerCharacters" class="panel scheduler-characters">
      <h3 class="panel-h">캐릭터 선택</h3>
      <div id="charCards" class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"></div>
      <p id="charEmpty" class="hint py-4 text-center">위에서 캐릭터 닉네임을 입력하고 조회해 주세요.</p>
    </div>

    <div id="schedulerBody" class="panel">
      <h2 class="panel-h">
        <span><span class="dot"></span>인게임 스케줄러 현황 <span id="schedulerCharName" class="text-indigo-600"></span> <span id="schedulerDate" class="hint ml-1"></span></span>
        <button id="schedulerReset" type="button" onclick="resetScheduler()" class="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50" hidden>체크 초기화</button>
      </h2>
      <div id="schedulerDetails" class="space-y-4">

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="card space-y-2">
          <h3 class="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-900"><span>일일 콘텐츠 (Daily)</span><span id="dailyProgress" class="text-indigo-600">0/0</span></h3>
          <div id="dailyList" class="max-h-80 space-y-1 overflow-y-auto text-xs"></div>
        </div>
        <div class="card space-y-2">
          <h3 class="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-900"><span>주간 콘텐츠 (Weekly)</span><span id="weeklyProgress" class="text-indigo-600">0/0</span></h3>
          <div id="weeklyList" class="max-h-80 space-y-1 overflow-y-auto text-xs"></div>
        </div>
      </div>

      <div id="bossSummaryBar" class="card hidden flex items-center justify-between text-xs font-bold text-slate-900">
        <span>주간 보스 처치 현황</span>
        <span><strong id="bossClearCount" class="text-sm font-black text-indigo-600">0</strong> / <span id="bossClearLimit">12</span> 회</span>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div class="card text-center"><div class="label mb-1">일간 보스 수익</div><div id="dailyBossRevenue" class="text-sm font-black text-indigo-600">0 메소</div></div>
        <div class="card text-center"><div class="label mb-1">주간 보스 수익</div><div id="weeklyBossRevenue" class="text-sm font-black text-indigo-600">0 메소</div></div>
        <div class="card text-center"><div class="label mb-1">월간 보스 수익</div><div id="monthlyBossRevenue" class="text-sm font-black text-indigo-600">0 메소</div></div>
      </div>

      <div class="card space-y-2">
        <h3 class="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-900"><span>주간 보스</span><span id="weeklyBossProgress" class="text-indigo-600">0/0</span></h3>
        <div class="boss-table-scroll max-h-96"><div id="weeklyBossHead"></div>
        <div id="weeklyBossList" class="space-y-1 text-xs"></div></div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="card space-y-2">
          <h3 class="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-900"><span>일간 보스</span><span id="dailyBossProgress" class="text-indigo-600">0/0</span></h3>
          <div class="boss-table-scroll max-h-60"><div id="dailyBossHead"></div>
          <div id="dailyBossList" class="space-y-1 text-xs"></div></div>
        </div>
        <div class="card space-y-2">
          <h3 class="flex justify-between border-b border-slate-100 pb-2 text-xs font-bold text-slate-900"><span>월간 보스</span><span id="monthlyBossProgress" class="text-indigo-600">0/0</span></h3>
          <div class="boss-table-scroll max-h-60"><div id="monthlyBossHead"></div>
          <div id="monthlyBossList" class="space-y-1 text-xs"></div></div>
        </div>
      </div>
      </div>
    </div>
`;

function mount() {
  $('dailyBossHead').innerHTML = bossHeaderHtml(DAILY_DIFF_KEYS, false);
  $('weeklyBossHead').innerHTML = bossHeaderHtml(WEEKLY_DIFF_KEYS, true);
  $('monthlyBossHead').innerHTML = bossHeaderHtml(MONTHLY_DIFF_KEYS, true);

  $('apiKey').value = localStorage.getItem('nexon_api_key') || '';
  charNames = loadNames();
  renderNameRows();
  renderScheduler();
}

// HTML 문자열 안의 인라인 핸들러(onclick 등)가 호출할 수 있도록 전역에 노출
Object.assign(window, {
  saveApiKey, resetScheduler, addName, removeName, setName,
  fetchCharacterInfo, selectChar, toggleTask, updatePartyCount
});

export default { id: 'scheduler', title: '스케줄러', className: 'space-y-5', html, mount, onShow: renderScheduler };
