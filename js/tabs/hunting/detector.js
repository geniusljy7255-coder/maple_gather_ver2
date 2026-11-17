/* 분석 Worker를 메인 스레드에서 다루는 얇은 래퍼 */
let generation = 0;
let worker = null, busy = false, busySince = 0, onResult = null;
let experienceWorker=null,experienceGeneration=0,experienceBusy=false,experienceBox=null;

const TIMER_FORMAT_KEY = 'hunt-timer-format';
let timerFormat = 'seconds';
try {
  if (localStorage.getItem(TIMER_FORMAT_KEY)==='clock') timerFormat='clock';
} catch {}
export const getTimerFormat = () => timerFormat;
export function setTimerFormat(value) {
  timerFormat=value==='clock' ? 'clock' : 'seconds';
  try { localStorage.setItem(TIMER_FORMAT_KEY,timerFormat); } catch {}
}

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
    if (data.type === 'experience-ready') {
      if (data.generation === generation) onResult(data);
      return;
    }
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

export function resetExperienceDetector() {
  experienceGeneration++;
  experienceBusy=false;
  experienceBox=null;
}

export function startExperienceDetector() {
  try {
    experienceWorker=new Worker(new URL('./experience.worker.js',import.meta.url),{type:'module'});
  } catch { return; }
  experienceWorker.onmessage=({data})=>{
    if (data.generation!==experienceGeneration) return;
    experienceBusy=false;
    if (data.monitor?.exp?.value && data.monitor.exp.box) experienceBox=data.monitor.exp.box;
    onResult(data);
  };
  experienceWorker.onerror=()=>{
    experienceWorker.terminate();
    experienceWorker=null;
    resetExperienceDetector();
  };
}
export const hasExperienceDetector=()=>Boolean(experienceWorker);
export const canAnalyzeExperience=()=>hasExperienceDetector() && !experienceBusy;
export function analyzeExperienceFrame({image,sourceHeight},t) {
  if (!canAnalyzeExperience()) return false;
  experienceBusy=true;
  experienceWorker.postMessage({generation:experienceGeneration,t,w:image.width,h:image.height,sourceHeight,buffer:image.data.buffer},[image.data.buffer]);
  return true;
}

/** targets: [{ id, thr, main:{w,h,rgba}, reject?:{w,h,rgba} }] */
export function configure(targets,experienceBuffAssets=[],captureRevision=0) {
  generation++;
  worker?.postMessage({type:'config',generation,targets,experienceBuffAssets,captureRevision});
}

/** 프레임 한 장을 보낸다. 이전 분석이 끝나지 않았으면 건너뛰고 false를 돌려준다. */
export function canAnalyze(now = Date.now()) {
  return Boolean(worker) && (!busy || now - busySince >= 5000);
}

export function analyze(img, t, targetIds = null, externalExperience = false, scanRune = true, scanFragments = true, scanExperience = true) {
  return sendFrame(img,t,{type:'frame',targetIds,externalExperience,experienceBox,scanRune,scanFragments,scanExperience});
}
export function analyzeBuffFrame({image,sourceWidth,sourceHeight},t) {
  return sendFrame(image,t,{type:'buff-frame',sourceWidth,sourceHeight});
}
function sendFrame(img,t,fields) {
  if (!canAnalyze()) return false;
  busy = true; busySince = Date.now();
  worker.postMessage({ ...fields,generation,t,timerFormat,
    w: img.width, h: img.height, buffer: img.data.buffer }, [img.data.buffer]);
  return true;
}
