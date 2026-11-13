/* 진단: 프레임/타이머가 백그라운드에서도 일정하게 들어오는지 측정 */
import { onTick } from '../../core/clock.js';

/** 이벤트 사이의 "최대 간격"을 최근 10분 동안 기록한다 (5초 단위로 묶어 저장). */
export class GapStat {
  constructor(windowMs = 600000, bucketMs = 5000) {
    this.windowMs = windowMs;
    this.bucketMs = bucketMs;
    this.reset();
  }
  reset() { this.buckets = []; this.last = 0; }

  push(now) {
    const gap = this.last ? now - this.last : 0;
    this.last = now;
    const start = now - (now % this.bucketMs);
    let b = this.buckets[this.buckets.length - 1];
    if (!b || b.start !== start) { b = { start, n: 0, max: 0 }; this.buckets.push(b); }
    b.n++;
    if (gap > b.max) b.max = gap;
    const lim = now - this.windowMs;
    while (this.buckets.length && this.buckets[0].start < lim) this.buckets.shift();
  }

  stats(now) {
    const lim = now - this.windowMs, recent = now - 10000;
    let max = 0, n10 = 0, first = now;
    for (const b of this.buckets) {
      if (b.start < lim) continue;
      if (b.max > max) max = b.max;
      if (b.start >= recent) { n10 += b.n; first = Math.min(first, b.start); }
    }
    const since = this.last ? now - this.last : null;
    if (since !== null && since > max) max = since;       // 지금 진행 중인 끊김도 포함
    const span = Math.max(1000, now - first);
    return { max, since, fps: n10 / (span / 1000) };
  }
}

export const stats = {
  rvfc: new GapStat(),     // <video> 프레임 콜백
  proc: new GapStat(),     // MediaStreamTrackProcessor (Chromium)
  main: new GapStat(),     // 메인 스레드 setInterval(1초)
  worker: new GapStat()    // Worker 시계(0.25초)
};

/** 탭이 숨겨진 시간 */
export const vis = { hiddenSince: document.hidden ? Date.now() : 0, hiddenTotal: 0 };

let started = false;
export function startDiag() {
  if (started) return;
  started = true;
  setInterval(() => stats.main.push(Date.now()), 1000);
  onTick(now => stats.worker.push(now));
  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.hidden) vis.hiddenSince = now;
    else { vis.hiddenTotal += now - (vis.hiddenSince || now); vis.hiddenSince = 0; }
  });
}

export function resetDiag() {
  Object.values(stats).forEach(s => s.reset());
  vis.hiddenTotal = 0;
  if (document.hidden) vis.hiddenSince = Date.now();
}
