/* 앱 진입점: 탭 등록 · 전환 */
import craft from './tabs/craft.js';
import scheduler from './tabs/scheduler.js';
import hunting from './tabs/hunting/index.js';
import { mountCharacterCompanion } from './character-companion.js';

// 새 탭은 파일을 만든 뒤 여기에 한 줄만 추가하면 됩니다.
// 탭 정의: { id, title, className?, html, mount?(section), onShow?(), onHide?() }
const TABS = [craft, scheduler, hunting];

const themeToggle = document.getElementById('themeToggle');
const root = document.documentElement;
themeToggle.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
themeToggle.addEventListener('click', () => {
  const dark = root.dataset.theme !== 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-checked', String(dark));
  try { localStorage.setItem('site-theme', root.dataset.theme); } catch {}
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
    section.classList.toggle('hidden', t.id !== id);
    btn.setAttribute('aria-selected', String(t.id === id));
  });
  positionTabIndicator();
}

function switchTab(id) {
  const prev = TABS.find(t => t.id === current);
  if (prev && prev.id !== id) prev.onHide?.();
  showTab(id);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  TABS.find(t => t.id === id)?.onShow?.();
  current = id;
}

TABS.forEach(tab => {
  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.id = `tabBtn-${tab.id}`;
  btn.setAttribute('role', 'tab');
  btn.textContent = tab.title;
  btn.addEventListener('click', () => switchTab(tab.id));
  nav.appendChild(btn);

  const section = document.createElement('section');
  section.id = `tab-${tab.id}`;
  section.className = `tab-content ${tab.className || ''}`;
  section.innerHTML = tab.html;
  panels.appendChild(section);

  views.set(tab.id, { btn, section });
});

TABS.forEach(tab => tab.mount?.(views.get(tab.id).section));
showTab(TABS[0].id);
current = TABS[0].id;

const tabResize = new ResizeObserver(positionTabIndicator);
tabResize.observe(nav);
for (const {btn} of views.values()) tabResize.observe(btn);
requestAnimationFrame(() => { nav.dataset.ready = ''; });
