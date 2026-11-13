/* 설치기 패널: 자동 감시와 실제 감지 화면 진단 */
import { $, setText } from '../../core/dom.js';
import { getInfo, getGrabError } from './capture.js';
import { TARGETS, getIcon } from './icons.js';
import { trackers } from './trackers.js';


const targetCard=t=>`<div class="card space-y-2 text-center">
  <div class="label">${t.label}</div>
  <div id="trk-${t.id}-state" class="text-lg font-black text-slate-400">자동 탐색 대기</div>
</div>`;

export const installersHtml = TARGETS.map(targetCard).join('');

const VIEW = {
  unknown: ['판독 불확실 · 자동 탐색 중', 'text-amber-600'],
  none: ['자동 탐색 대기', 'text-slate-400'],
  active: ['유지 중', 'text-emerald-600'],
  expiring: ['곧 종료! 다시 설치', 'text-red-600 animate-pulse']
};
export function renderInstallers(now = Date.now()) {
  const sharing = getInfo().active, ge = getGrabError();
  for (const t of TARGETS) {
    const tr = trackers[t.id], has = !!getIcon(t.id, 'buff');
    const [label, color] = !has ? ['기준 이미지 없음', 'text-slate-400']
      : !sharing ? ['화면 공유 필요', 'text-slate-400']
      : ge ? ['화면 프레임 오류', 'text-red-600']
      : VIEW[tr.state];
    const seconds = tr.deadline === null ? null : Math.max(0, Math.ceil((tr.deadline - now) / 1000));
    setText(`trk-${t.id}-state`, sharing && !ge && tr.state === 'active' && seconds > 0 ? `유지 중 · 약 ${seconds}초` : label);
    $(`trk-${t.id}-state`).className = `text-center text-lg font-black ${color}`;

  }
}
