/* 사냥 도우미 탭 */
import { onTick } from '../../core/clock.js';
import { html, bind, render, isPipOpen } from './ui.js';
import { tick } from './session.js';
import { getInfo } from './capture.js';
import { initTracking } from './trackers.js';

let visible = false;

function mount() {
  bind();
  initTracking().catch(console.error);
  // 타이머 로직은 탭이 숨겨져 있어도 계속 돌고, 화면 갱신은 보일 때만 한다
  onTick(now => {
    if (getInfo().active) tick(now);
    if (visible || isPipOpen()) render(now);
  });
}

export default {
  id: 'hunting',
  title: '사냥 도우미',
  className: 'space-y-5',
  html,
  mount,
  onShow() { visible = true; render(Date.now()); },
  onHide() { visible = false; }
};
