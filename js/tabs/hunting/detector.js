/* 분석 Worker를 메인 스레드에서 다루는 얇은 래퍼 */
let generation = 0;
let worker = null, busy = false, busySince = 0, onResult = null;

export const status = { error: '', frames: 0, ms: 0, lastAt: 0 };

export function startDetector(cb) {
  if (worker) return;
  onResult = cb;
  try {
    worker = new Worker(new URL('./detector.worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    status.error = `분석 Worker를 만들지 못했어요: ${e.message}`;
    return;
  }
  worker.onmessage = ({ data }) => {
    busy = false;
    if (data.generation !== generation) return;
    if (data.type === 'error') { status.error = data.message; return; }
    status.error = '';
    status.frames++;
    status.ms = data.ms;
    status.lastAt = Date.now();
    onResult(data);
  };
  worker.onerror = e => { busy = false; status.error = e.message || '분석 Worker 오류 (localhost 같은 서버로 열었는지 확인하세요)'; };
}

/** targets: [{ id, thr, main:{w,h,rgba}, reject?:{w,h,rgba} }] */
export function configure(targets) { generation++; worker?.postMessage({ type: 'config', generation, targets }); }

/** 프레임 한 장을 보낸다. 이전 분석이 끝나지 않았으면 건너뛰고 false를 돌려준다. */
export function canAnalyze(now = Date.now()) {
  return Boolean(worker) && (!busy || now - busySince >= 5000);
}

export function analyze(img, t, targetIds = null) {
  if (!canAnalyze()) return false;
  busy = true; busySince = Date.now();
  worker.postMessage({ type: 'frame', generation, t, targetIds, w: img.width, h: img.height, buffer: img.data.buffer }, [img.data.buffer]);
  return true;
}
