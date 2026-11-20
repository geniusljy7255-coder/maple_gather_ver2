/* 설치기 패널 */
import { $, setText } from '../../core/dom.js';
import { getInfo, getGrabError } from './capture.js';
import { status as detectorStatus } from './detector.js';
import { TARGETS } from './icons.js';
import { jobInstallers, jobSkills, jobSkill, jobIconFile, installerIcon, addJobInstaller, updateJobInstaller, removeJobInstaller, onJobInstallersChange } from './job-installers.js';
import { trackers, jobLoadErrors } from './trackers.js';


export const iconLabel = (label, url) => `<span class="inline-flex items-center justify-center gap-2"><img src="${url}" alt="" width="24" height="24" class="h-6 w-6 shrink-0 rounded">${label}</span>`;
const targetCard=t=>`<div class="card space-y-2 text-center">
  <div class="label">${iconLabel(t.label,installerIcon(t.id === "janus" ? "솔_야누스" : "에르다_파운틴"))}</div>
  <div id="trk-${t.id}-state" class="text-lg font-black text-slate-400">자동 탐색 대기</div>
</div>`;

export const installersHtml = TARGETS.map(targetCard).join('');

const VIEW = {
  unknown: ['탐색 중', 'text-amber-600'],
  none: ['자동 탐색 대기', 'text-slate-400'],
  active: ['유지 중', 'text-emerald-600'],
  expiring: ['곧 종료! 다시 설치', 'text-red-600 animate-pulse']
};
export function installerPresentation(id, now) {
  const tr = trackers[id];
  if (!getInfo().active) return ['화면 공유 필요', 'text-slate-400'];
  if (getGrabError()) return ['화면 프레임 오류', 'text-red-600'];
  if (detectorStatus.error) return ['설치기 분석 오류', 'text-red-600'];
  if (!detectorStatus.lastAt || now-detectorStatus.lastAt>5000) return ['분석 프레임 대기', 'text-amber-600'];
  if (!tr) return [jobLoadErrors.has(id) ? '아이콘 로드 실패' : '자동 탐색 대기', 'text-slate-400'];
  if(tr.trackingMode==='count') {
    if(tr.count==null || !tr.lastReadAt)
      return [tr.lastSeen && now-tr.lastSeen<=6500 ? '아이콘 확인 · 개수 확인 중' : '탐색 중','text-amber-600'];
    if(tr.count===0)return ['0개 · 다시 설치','text-red-600'];
    return [`남은 개수 · ${tr.count}개`,tr.count<=1 ? 'text-red-600' : 'text-emerald-600'];
  }
  const seconds = tr.deadline === null ? null : Math.max(0, Math.ceil((tr.deadline - now) / 1000));
  if (tr.state === 'expiring' && seconds > 0) return [`재설치 임박 · ${seconds}초`, 'text-red-600'];
  if (tr.needsReinstall || seconds === 0) return ['다시 설치', 'text-red-600'];
  if (seconds > 0) return [`유지 중 · ${seconds}초`, 'text-emerald-600'];
  if (tr.lastSeen && now - tr.lastSeen <= 6500 && tr.state !== 'expiring') {
    return ['아이콘 감지 · 시간 확인 중', 'text-emerald-600'];
  }
  return VIEW[tr.state];
}

export function bindJobInstallers() {
  const grid = $('huntInstallerGrid');
  const add = $('huntAddInstaller');
  if (!grid || !add) return;
  const cards = new Map();
  const sync = () => {
    for (const [id, card] of cards) {
      if (!jobInstallers.some(item => item.id === id)) { card.remove(); cards.delete(id); }
    }
    for (const item of jobInstallers) {
      let card = cards.get(item.id);
      if (!card) {
        card = document.createElement('div');
        card.className = 'card min-w-0 space-y-2 text-center';
        card.innerHTML = `<div class="flex items-center gap-2">
            <img width="24" height="24" alt="" class="hidden h-6 w-6 shrink-0 rounded" data-icon>
            <select aria-label="직업 및 스킬" class="min-w-0 flex-1 rounded border border-slate-300 bg-white p-1 text-xs">
              <option value="">직업 - 스킬 선택</option>
              ${jobSkills.map(skill => `<option value="${skill.id}">${skill.label}</option>`).join('')}
            </select>
            <label class="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" class="cb">6차</label>
          </div><div id="trk-${item.id}-state" class="text-lg font-black text-slate-400">스킬 선택</div>
          <div class="flex justify-end"><button type="button" class="text-xs text-slate-500 hover:text-red-600" data-remove>삭제</button></div>`;
        card.querySelector('select').addEventListener('change', event => updateJobInstaller(item.id,{skill:event.target.value}));
        card.querySelector('input').addEventListener('change', event => updateJobInstaller(item.id,{sixth:event.target.checked}));
        card.querySelector('[data-remove]').addEventListener('click', () => removeJobInstaller(item.id));
        cards.set(item.id, card);
        grid.append(card);
      }
      const skill = jobSkill(item);
      card.querySelector('select').value = skill?.id || '';
      const checkbox = card.querySelector('input');
      checkbox.checked = !!item.sixth;
      checkbox.disabled = !skill?.sixth || !skill.normal;
      const icon = card.querySelector('[data-icon]');
      const file = jobIconFile(item);
      icon.classList.toggle('hidden', !file);
      if (file) icon.src = installerIcon(file);
    }
    add.disabled = jobInstallers.length >= 12;
  };
  add.addEventListener('click', addJobInstaller);
  onJobInstallersChange(sync);
  sync();
}

export function renderInstallers(now = Date.now()) {
  for (const item of [...TARGETS,...jobInstallers]) {
    const element = $(`trk-${item.id}-state`);
    if (!element) continue;
    const [label,color] = item.id.startsWith('job-') && !jobSkill(item)
      ? ['스킬 선택', 'text-slate-400'] : installerPresentation(item.id, now);
    element.textContent = label;
    element.className = `text-center text-lg font-black ${color}`;
  }
}
