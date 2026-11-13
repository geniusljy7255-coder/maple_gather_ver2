/* Web Worker 기반 시계 (0.25초 간격)
 * 탭이 백그라운드로 가면 메인 스레드의 setInterval은 브라우저가 늦출 수 있어서,
 * Worker 안에서 타이머를 돌리고 메시지로 깨워 쓴다. Worker를 못 만들면 setInterval로 대체. */
const listeners = new Set();
let worker = null, fallback = null;

const emit = () => { const now = Date.now(); listeners.forEach(fn => fn(now)); };

function start() {
  if (worker || fallback) return;
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 250);'], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = emit;
  } catch (e) {
    fallback = setInterval(emit, 250);
  }
}

/** 0.25초마다 fn(Date.now())를 호출한다. 해제 함수를 돌려준다. */
export function onTick(fn) {
  listeners.add(fn);
  start();
  return () => listeners.delete(fn);
}
