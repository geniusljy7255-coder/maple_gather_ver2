/* 앱 진입점: 탭 등록 · 전환 */
import craft from './tabs/craft.js';
import scheduler from './tabs/scheduler.js';
import hunting from './tabs/hunting/index.js';
import boss from './tabs/boss.js';
import { mountCharacterCompanion } from './character-companion.js';
import { companionSay } from './core/notify.js';

// 새 탭은 파일을 만든 뒤 여기에 한 줄만 추가하면 됩니다.
// 탭 정의: { id, title, className?, html, mount?(section), onShow?(), onHide?() }
const TABS = [craft, hunting, boss, scheduler];

const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;
themeToggle.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
themeToggle.addEventListener('click', () => {
  const dark = root.dataset.theme !== 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-checked', String(dark));
  try { localStorage.setItem('site-theme', root.dataset.theme); } catch {}
  companionSay(dark ? '밤이야!' : '아침이야!');
});

mountCharacterCompanion(document.getElementById('ideaButton'));

const nav = document.getElementById('tabNav');
const tabIndicator = document.createElement('span');
tabIndicator.className = 'tab-indicator';
tabIndicator.setAttribute('aria-hidden', 'true');
nav.appendChild(tabIndicator);

function positionTabIndicator() {
  const tab = nav.querySelector('[aria-selected="true"]');
  if (!tab) return;
  nav.style.setProperty('--tab-offset', `${tab.offsetLeft}px`);
  nav.style.setProperty('--tab-width', `${tab.offsetWidth}px`);
}

const panels = document.getElementById('tabPanels');
const views = new Map();
let current = null;

function showTab(id) {
  TABS.forEach(t => {
    const { btn, section } = views.get(t.id);
    section.hidden = t.id !== id;
    btn.setAttribute('aria-selected', String(t.id === id));
    btn.tabIndex = t.id === id ? 0 : -1;
  });
  positionTabIndicator();
}

function switchTab(id) {
  const prev = TABS.find(t => t.id === current);
  if (prev && prev.id !== id) prev.onHide?.();
  showTab(id);
  TABS.find(t => t.id === id)?.onShow?.();
  current = id;
}

TABS.forEach(tab => {
  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.id = `tabBtn-${tab.id}`;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-controls', 'tab-' + tab.id);
  btn.textContent = tab.title;
  btn.addEventListener('click', () => {
    switchTab(tab.id);
    if (tab.id === 'hunting') companionSay('사냥하는 거야?');
    if (tab.id === 'scheduler') companionSay('내가 뭘 안 했더라?');
  });
  nav.appendChild(btn);

  const section = document.createElement('section');
  section.id = `tab-${tab.id}`;
  section.className = `tab-content ${tab.className || ''}`;
  section.setAttribute('role', 'tabpanel');
  section.setAttribute('aria-labelledby', btn.id);
  section.innerHTML = tab.html;
  panels.appendChild(section);

  views.set(tab.id, { btn, section });
});

TABS.forEach(tab => tab.mount?.(views.get(tab.id).section));
switchTab(TABS[0].id);

nav.addEventListener('keydown', event => {
  if (event.target.getAttribute('role') !== 'tab') return;
  const index = TABS.findIndex(tab => tab.id === current);
  const last = TABS.length - 1;
  const next = { ArrowLeft: (index + last) % TABS.length, ArrowRight: (index + 1) % TABS.length, Home: 0, End: last }[event.key];
  if (!Number.isInteger(next)) return;
  event.preventDefault();
  switchTab(TABS[next].id);
  views.get(TABS[next].id).btn.focus();
});

const tabResize = new ResizeObserver(positionTabIndicator);
tabResize.observe(nav);
for (const {btn} of views.values()) tabResize.observe(btn);
requestAnimationFrame(() => { nav.dataset.ready = ''; });
