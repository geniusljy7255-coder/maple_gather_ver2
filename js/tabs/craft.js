/* 제작 계산기 탭 */
import { $, setText, getVal } from '../core/dom.js';
import { formatKoreanMoney, formatNumber } from '../core/format.js';
import { ITEMS, ITEM, GROUP_TITLES, SECTION_TITLES, CARDS, INPUT_IDS } from '../data/items.js';

/** 손익 표시: 이익=빨강, 손해=파랑 */
function setProfit(id, value, text = formatKoreanMoney(value)) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('pos', value >= 0);
  el.classList.toggle('neg', value < 0);
}

/* ============================================================
 * 제작 계산기: 렌더링
 * ============================================================ */
const iconBox = (item, size = 7) => `
  <span class="flex h-${size} w-${size} shrink-0 items-center justify-center">
    <img src="icon/${item.icon}.${item.ext || 'png'}" alt="" class="max-h-full max-w-full" onerror="this.style.display='none'">
  </span>`;

const drawerItem = i => `
  <div class="card p-2.5">
    <div class="mb-2 flex items-center gap-2">${iconBox(i)}<span class="label truncate">${i.name}</span></div>
    <div class="grid grid-cols-[2fr_1fr] gap-2">
      <div>
        <span class="text-[10px] font-bold text-slate-400">시세</span>
        <input type="text" id="${i.id}" value="${i.price || ''}" class="input mt-0.5 ${i.fixed ? 'cursor-not-allowed bg-slate-100' : ''}" ${i.fixed ? 'readonly' : 'oninput="handleInput(this)"'}>
        <div id="${i.id}Kor" class="kor"></div>
      </div>
      <div>
        <span class="text-[10px] font-bold text-slate-400">보유 수량</span>
        <input type="text" id="own_${i.id}" value="0" class="input mt-0.5" oninput="handleInput(this)">
        <div id="own_${i.id}Cnt" class="kor !text-slate-500"></div>
      </div>
    </div>
  </div>`;

function buildDrawer() {
  $('drawerBody').innerHTML = `
    <label class="card flex cursor-pointer items-center gap-2 p-3 text-sm font-bold text-slate-800">
      <input type="checkbox" id="guildCheck" class="cb" onchange="handleInput()">
      길드 가입 <span class="hint">(수수료 · 채집 도구 할인 4%)</span>
    </label>
    <label class="card flex cursor-pointer items-center gap-2 p-3 text-sm font-bold text-slate-800">
      <input type="checkbox" id="mvpCheck" class="cb" onchange="handleInput()">
      MVP 보유 <span class="hint">(경매장 수수료 5% → 3%)</span>
    </label>
    <div class="card p-2.5">
      <div class="mb-2 flex items-center gap-2">${iconBox({ icon: '피로도' })}<label class="label" for="dailyFatigue">사용 피로도</label></div>
      <input type="text" id="dailyFatigue" value="500" class="input" oninput="handleInput(this)">
      <div id="dailyFatigueKor" class="kor"></div>
    </div>` +
    GROUP_TITLES.map((title, g) => `
      <div class="space-y-2">
        <span class="sub-h">${title}</span>
        ${ITEMS.filter(i => i.g === g).map(drawerItem).join('')}
      </div>`).join('');
}

const cardHtml = c => {
  const out = ITEM[c.out];
  const desc = c.desc || `1회: 피로도 ${c.fatigue} → ${c.yield}개`;
  return `
    <div id="card_${c.id}" class="card flex flex-col gap-3 p-4 md:flex-row">
      <div class="space-y-1.5 md:w-56 md:shrink-0">
        <div class="flex items-center gap-1">${iconBox(out, 8)}<h3 class="text-sm font-bold leading-snug text-slate-900">${c.title || out.name}</h3></div>
        <p class="pl-3 text-xs text-slate-500">${desc}</p>
        <p id="${c.id}_fat" class="pl-3 text-xs font-semibold text-slate-700"></p>
        <div class="flex items-baseline justify-between gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5"><span id="${c.id}_outLabel" class="text-[11px] font-bold text-slate-500"></span><span id="${c.id}_outNum" class="text-2xl font-black leading-none text-indigo-600">0</span><span class="text-[11px] font-bold text-slate-500">개</span></div>
      </div>
      <div id="${c.id}_mats" class="flex flex-1 flex-wrap content-start gap-1.5 border-slate-100 md:border-x md:px-4"></div>
      <div class="space-y-1 text-xs md:w-52 md:shrink-0">
        <div class="flex justify-between gap-2"><span class="text-slate-500">추가 구매 비용</span><b id="${c.id}_cost" class="text-right"></b></div>
        <div class="flex justify-between gap-2"><span class="text-slate-500">판매가(수수료 포함)</span><b id="${c.id}_rev" class="text-right"></b></div>
        <div class="flex justify-between gap-2 border-t border-slate-100 pt-1.5"><span class="font-bold text-slate-800">순이익</span><b id="${c.id}_profit" class="text-right text-sm"></b></div>
      </div>
    </div>`;
};

function buildRecipes() {
  $('recipeList').innerHTML = SECTION_TITLES.map((title, sec) => `
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">${title}</span>
        <span class="h-px flex-1 bg-slate-200"></span>
      </div>
      ${CARDS.filter(c => c.sec === sec).map(cardHtml).join('')}
    </div>`).join('');
}

/* 시세·보유 패널 열기/닫기 */
let drawerOpen = true;
function setDrawer(open) {
  drawerOpen = open;
  $('drawerWrap').classList.toggle('-translate-x-full', !open);
  $('drawerBackdrop').classList.toggle('hidden', !open);
  const btn = $('drawerToggle');
  btn.textContent = open ? '닫기' : '시세 · 보유';
  btn.classList.toggle('py-10', open);
  btn.classList.toggle('py-4', !open);
}
const toggleDrawer = () => setDrawer(!drawerOpen);

// 스크롤바 대신, 아래로 더 내릴 수 있을 때만 하단 그라데이션 표시
function updateFade() {
  const el = $('drawerScroll');
  $('drawerFade').style.opacity = el.scrollTop + el.clientHeight < el.scrollHeight - 4 ? 1 : 0;
}

/* ============================================================
 * 입력 처리 / 저장
 * ============================================================ */
function saveInputs() {
  INPUT_IDS.forEach(id => {
    const el = $(id);
    if (el) localStorage.setItem(`input_${id}`, el.value);
  });
  localStorage.setItem('guild_member', $('guildCheck').checked ? '1' : '0');
  localStorage.setItem('mvp_member', $('mvpCheck').checked ? '1' : '0');
}

function loadInputs() {
  if (localStorage.getItem('defaults_version') !== '4') {   // 기본 시세를 바꾸면 버전을 올려 이전 저장값을 초기화
    ITEMS.filter(i => !i.fixed).forEach(i => localStorage.removeItem(`input_${i.id}`));
    localStorage.setItem('defaults_version', '4');
  }
  INPUT_IDS.forEach(id => {
    const el = $(id), saved = localStorage.getItem(`input_${id}`);
    if (el && saved !== null) el.value = saved;
  });
  $('guildCheck').checked = localStorage.getItem('guild_member') === '1';
  $('mvpCheck').checked = localStorage.getItem('mvp_member') === '1';
}

function handleInput(input) {
  if (input) formatNumber(input);
  saveInputs();
  calculate();
}

/* ============================================================
 * 제작 계산
 * ============================================================ */
const fmt1 = n => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

const matChip = (id, label, total, buy, note) => `
  <span class="chip flex !whitespace-normal items-center gap-1.5 !rounded-lg py-1">
    ${iconBox(ITEM[id], 5)}
    <span>${ITEM[id].name}${label ? ` <b>${label}</b>` : ''}
      <span class="block text-[10px] font-medium ${buy > 0 ? 'text-indigo-600' : 'text-slate-400'}">총 ${total.toLocaleString()} · ${note || (buy > 0 ? `구매 ${buy.toLocaleString()}` : '보유로 충당')}</span>
    </span>
  </span>`;

/** 카드 하나의 계산 → { chips, cost(추가 구매 비용), revenue, lines, out: [라벨, 개수] } */
function calcCard(c, fatigue) {
  const own = id => getVal(`own_${id}`), price = id => getVal(id);
  const chips = [];
  let cost = 0, revenue = 0, lines, out;

  const need = (id, total, label = '', note = '') => {
    const buy = note ? 0 : Math.max(0, total - own(id));
    cost += buy * price(id);
    chips.push(matChip(id, label, total, buy, note));
  };
  const seedLine = (gather, owned) => `채집 ${gather.toLocaleString()}개${owned > 0 ? ` + 보유 ${owned.toLocaleString()}개` : ''}`;
  const seedNote = gather => `채집 ${gather.toLocaleString()}${own('seedPrice') > 0 ? ` + 보유 ${own('seedPrice').toLocaleString()}` : ''}`;

  if (c.id === 'seedSell') {
    const seeds = fatigue + own('seedPrice');
    need('toolPrice', Math.ceil(fatigue / 500));
    revenue = seeds * price('seedPrice');
    out = ['판매', seeds];
    lines = [`피로도 ${fatigue.toLocaleString()} → 씨앗 ${seedLine(fatigue, own('seedPrice'))}`, '채집한 씨앗 전량 판매'];

  } else if (c.id === 'shiningSell') {
    const n = own(c.out);
    revenue = n * price(c.out);
    out = ['판매', n];
    lines = [`보유 ${n.toLocaleString()}개 판매`, '재료 · 제작 비용 없음'];

  } else if (c.id === 'oilG') {
    const attempts = Math.floor((fatigue + own('seedPrice')) / 6);
    const oil = attempts * 0.9;
    need('seedPrice', attempts * 6, '×6', seedNote(fatigue));
    need('herbOilPrice', attempts, '×1');
    need('toolPrice', Math.ceil(fatigue / 500));
    revenue = oil * price('oilPrice');
    out = ['제작 (기댓값)', oil];
    lines = [`피로도 ${fatigue.toLocaleString()} → 씨앗 ${seedLine(fatigue, own('seedPrice'))}`, `${attempts.toLocaleString()}회 제작 (성공률 90%)`];

  } else if (c.id === 'potionG') {
    // 피로도를 채집과 비약 제작(5)에 나눠 쓰며, 오일이 충분한 최대 제작 횟수를 탐색
    let crafts = Math.floor(fatigue / 38.3333), gather, attempts, oil;
    const evaluate = () => {
      gather = fatigue - crafts * 5;
      attempts = Math.floor((gather + own('seedPrice')) / 6);
      oil = Math.floor(attempts * 0.9) + own('oilPrice');
    };
    for (; crafts > 0; crafts--) { evaluate(); if (oil >= crafts * 5) break; }
    if (crafts <= 0) { crafts = 0; evaluate(); }

    need('seedPrice', attempts * 6, '', seedNote(gather));
    need('herbOilPrice', attempts, '×1');
    need('toolPrice', Math.ceil(gather / 500));
    need('bottlePrice', crafts);
    need('crystalPrice', crafts * 2);
    need('recipePrice', crafts);
    if (crafts > 0) need('potionRecipePrice', 1, '×1 · 1일 1회');
    revenue = crafts * 6 * price('potionPrice');
    out = ['제작', crafts * 6];
    lines = [`피로도 ${fatigue.toLocaleString()} = 채집 ${gather.toLocaleString()} + 제작 ${(crafts * 5).toLocaleString()}`, `오일 ${oil.toLocaleString()}개 사용 · ${crafts.toLocaleString()}회 제작`];

  } else if (c.flower) {
    const flowers = own(c.flower);
    const attempts = Math.floor(flowers / 6);
    need(c.flower, attempts * 6, '×6', `보유 ${flowers.toLocaleString()}`);
    need('herbOilPrice', attempts, '×1');
    revenue = attempts * 0.9 * price(c.out);
    out = ['제작 (기댓값)', attempts * 0.9];
    lines = [`보유 ${ITEM[c.flower].name} ${flowers.toLocaleString()}개`, `${attempts.toLocaleString()}회 제작 (성공률 90%)`];

  } else if (c.id === 'advheroSelf') {
    // 고급 대영웅 1회(2개)마다 대영웅 1개 필요 → 대영웅은 5피로도에 2개씩 제작, 보유 대영웅은 먼저 사용
    const ownHero = own('t2HeroPotionPrice');
    const heroCrafts = n => Math.ceil(Math.max(0, n - ownHero) / 2);
    let n = Math.floor(fatigue / 10);
    while (n > 0 && heroCrafts(n) * 5 + n * 10 > fatigue) n--;
    const hc = heroCrafts(n);
    need('bottlePrice', hc);
    need('t2MagicCrystalPrice', hc * 10);
    need('hyssopOilPrice', hc * 10 + n * 10);
    need('t2TwistedTimePrice', hc * 15);
    need('t2TwilightPrice', hc * 3);
    need('t2AdvSpellPrice', n);
    need('t2ShiningTwilightPrice', n);
    revenue = n * 2 * price(c.out);
    out = ['제작', n * 2];
    lines = [`피로도 ${(hc * 5 + n * 10).toLocaleString()} = 대영웅 ${hc.toLocaleString()}회 + 고급 ${n.toLocaleString()}회`, `대영웅 ${(hc * 2).toLocaleString()}개 제작${ownHero > 0 ? ` (보유 ${ownHero.toLocaleString()}개 사용)` : ''}`];

  } else {
    const crafts = Math.floor(fatigue / c.fatigue);
    let canCraft = Infinity;
    Object.entries(c.mats).forEach(([id, qty]) => {
      need(id, qty * crafts, `×${qty}`);
      canCraft = Math.min(canCraft, Math.floor(own(id) / qty));
    });
    if (crafts > 0) Object.entries(c.once || {}).forEach(([id, qty]) => need(id, qty, '×1 · 1일 1회'));
    revenue = crafts * c.yield * price(c.out);
    out = ['제작', crafts * c.yield];
    lines = [`피로도 기준 ${crafts.toLocaleString()}회 제작`, `보유 재료로 ${Math.min(canCraft, crafts).toLocaleString()}회 제작 가능`];
  }
  return { chips, cost, revenue, lines, out };
}

function calculate() {
  const guild = $('guildCheck').checked;
  const mvp = $('mvpCheck').checked;
  const feeRate = mvp ? 0.03 : 0.05;

  ITEMS.filter(i => i.fixed).forEach(i => { $(i.id).value = i.fixed[guild ? 1 : 0].toLocaleString('ko-KR'); });

  const fatigue = getVal('dailyFatigue');
  ITEMS.forEach(i => {
    setText(`${i.id}Kor`, formatKoreanMoney(getVal(i.id)));
    setText(`own_${i.id}Cnt`, `${getVal(`own_${i.id}`).toLocaleString()} 개`);
  });
  setText('dailyFatigueKor', `${fatigue.toLocaleString()} 피로도`);
  setText('toolPriceKor', `${formatKoreanMoney(getVal('toolPrice'))} (씨앗 1개 ≈ ${Math.round(getVal('toolPrice') / 500).toLocaleString()} 메소)`);
  setText('craftHint', `사용 피로도 ${fatigue.toLocaleString()} 전부 사용 기준 · 길드 ${guild ? '가입' : '미가입'} · MVP ${mvp ? '적용' : '미적용'} · 경매장 수수료 ${mvp ? '3%' : '5%'}`);

  CARDS.forEach(c => {
    const r = calcCard(c, fatigue);
    const netRevenue = Math.floor(r.revenue * (1 - feeRate));
    setText(`${c.id}_outLabel`, r.out[0]);
    setText(`${c.id}_outNum`, fmt1(r.out[1]));
    setText(`${c.id}_fat`, r.lines[0]);
    setText(`${c.id}_own`, r.lines[1]);
    $(`${c.id}_mats`).innerHTML = r.chips.join('');
    setText(`${c.id}_cost`, formatKoreanMoney(r.cost));
    setText(`${c.id}_rev`, formatKoreanMoney(netRevenue));
    setProfit(`${c.id}_profit`, netRevenue - r.cost);
  });
}

/* ============================================================
 * 탭 정의
 * ============================================================ */
const html = `
    <div class="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
      <p id="craftHint" class="text-xs font-semibold text-slate-700"></p>
      <p class="hint">오일류는 부캐릭터로도 제작 레벨과 관계없이 만들 수 있습니다.</p>
    </div>
    <div id="recipeList" class="space-y-7"></div>
`;

function mount() {
  buildDrawer();
  buildRecipes();
  loadInputs();
  calculate();

  $('drawerScroll').addEventListener('scroll', updateFade);
  window.addEventListener('resize', updateFade);
  setDrawer(window.innerWidth >= 900);
  updateFade();
}

// HTML 문자열 안의 인라인 핸들러(oninput 등)가 호출할 수 있도록 전역에 노출
Object.assign(window, { handleInput, toggleDrawer });

// 시세·보유 패널은 제작 계산기 탭에서만 보인다
function onShow() {
  $('drawerWrap').classList.remove('hidden');
  setDrawer(drawerOpen);
  updateFade();
}
function onHide() {
  $('drawerWrap').classList.add('hidden');
  $('drawerBackdrop').classList.add('hidden');
}

export default { id: 'craft', title: '제작 계산기', className: 'space-y-3', html, mount, onShow, onHide };
