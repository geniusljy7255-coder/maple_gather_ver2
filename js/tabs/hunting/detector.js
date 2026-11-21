/* 분석 Worker를 메인 스레드에서 다루는 얇은 래퍼 */
let generation = 0;
let installerDetector = null, monitorDetector = null;
let experienceWorker=null,experienceGeneration=0,experienceBusy=false,experienceBox=null;

const TIMER_FORMAT_KEY = 'hunt-timer-format';
const timerFormatListeners = new Set();
let timerFormat = 'seconds';
try {
  if (localStorage.getItem(TIMER_FORMAT_KEY)==='clock') timerFormat='clock';
} catch {}
export const getTimerFormat = () => timerFormat;
export const onTimerFormatChange = listener => timerFormatListeners.add(listener);
export function setTimerFormat(value) {
  const format=value==='clock' ? 'clock' : 'seconds';
  if (format===timerFormat) return;
  timerFormat=format;
  try { localStorage.setItem(TIMER_FORMAT_KEY,timerFormat); } catch {}
  timerFormatListeners.forEach(listener=>listener(timerFormat));
}

export const status = { error: '', lastAt: 0 };

function createDetector(onResult, reportError) {
  let worker;
  try {
    worker = new Worker(new URL('./detector.worker.js', import.meta.url), { type: 'module' });
  } catch (error) {
    if (reportError) status.error = error.message;
    return null;
  }
  const detector = {worker, busy:false, busySince:0};
  worker.onmessage = ({ data }) => {
    if (data.generation !== generation) return;
    if (data.type === 'experience-ready' || data.type === 'monitor-ready') {
      onResult(data);
      return;
    }
    detector.busy = false;
    if (data.type === 'error') {
      if (reportError) status.error = data.message;
      return;
    }
    if (reportError) {
      status.error = '';
      status.lastAt = Date.now();
    }
    onResult(data);
  };
  worker.onerror = error => {
    detector.busy = false;
    if (reportError) status.error = error.message || '설치기 분석 오류';
  };
  return detector;
}

export function startDetector(onResult) {
  installerDetector ??= createDetector(onResult,true);
  monitorDetector ??= createDetector(onResult,false);
}

export function resetExperienceDetector() {
  experienceGeneration++;
  experienceBusy=false;
  experienceBox=null;
}

export function startExperienceDetector(onResult) {
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

export function configure(installers, monitorTargets, experienceBuffAssets, captureRevision) {
  generation++;
  status.lastAt = 0;
  for (const [detector, targets, assets] of [
    [installerDetector,installers,[]],
    [monitorDetector,monitorTargets,experienceBuffAssets]
  ]) {
    if (!detector) continue;
    detector.busy = false;
    detector.worker.postMessage({type:'config',generation,targets,experienceBuffAssets:assets,captureRevision});
  }
}

function available(detector,now) {
  return Boolean(detector) && (!detector.busy || now-detector.busySince>=5000);
}
export const canAnalyzeInstallers = now => available(installerDetector,now);
export const canAnalyzeMonitor = now => available(monitorDetector,now);

export function analyzeInstallers(img,t) {
  return sendFrame(installerDetector,img,t,{installerOnly:true});
}
export function analyzeMonitor(img,t,externalExperience,scanRune,scanFragments,scanExperience) {
  return sendFrame(monitorDetector,img,t,{externalExperience,experienceBox,scanRune,scanFragments,scanExperience,earlyMonitor:true});
}
function sendFrame(detector,img,t,fields) {
  const now=Date.now();
  if (!available(detector,now)) return false;
  detector.busy = true;
  detector.busySince = now;
  detector.worker.postMessage({...fields,type:'frame',generation,t,timerFormat,
    w:img.width,h:img.height,contentHeight:img.contentHeight,buffer:img.data.buffer},[img.data.buffer]);
  return true;
}
