/* 화면 공유(getDisplayMedia) 시작/중지와 프레임 수신 */
import { stats } from './diag.js';
import { notify } from '../../core/notify.js';

let stream = null, track = null, video = null, reader = null;
let latest = null;                    // 가장 최근 프레임 (VideoFrame)
let pumpError = '';                   // 프레임 수신 루프에서 난 오류
const subs = new Set();

export const onCaptureChange = fn => subs.add(fn);
const emit = () => subs.forEach(fn => fn(getInfo()));

export function getInfo() {
  if (!track) return { active: false };
  const s = track.getSettings();
  return { active: true, width: s.width, height: s.height, fps: s.frameRate, surface: s.displaySurface, label: track.label };
}

/** 3단계에서 프레임을 분석할 때 쓰는 <video> */
export const getVideo = () => video;

export async function startCapture() {
  if (stream) return;
  const s = await navigator.mediaDevices.getDisplayMedia({
    // 작은 숫자를 읽어야 해서 가능한 한 원본 해상도를 요청한다
    video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 10, max: 15 } },
    audio: false
  });
  const t = s.getVideoTracks()[0];
  const v = document.createElement('video');
  v.muted = true;
  v.srcObject = s;
  v.playsInline = true;
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body?.appendChild(v);      // 화면 밖에 붙여 두면 영상 디코딩이 더 안정적이다
  await v.play();

  stream = s; track = t; video = v;
  pumpError = '';
  // 사용자가 브라우저의 "공유 중지"를 누르거나 게임 창이 닫히면 발생 (stop()으로는 발생하지 않음)
  t.addEventListener('ended', () => {
    if (track !== t) return;
    cleanup();
    notify('화면 공유가 끊겼어요', 'alert');
  });
  pumpVideoFrames(v);
  pumpProcessor(t);
  emit();
}

function pumpVideoFrames(v) {
  if (!v.requestVideoFrameCallback) return;
  const loop = () => {
    stats.rvfc.push(Date.now());
    if (video === v) v.requestVideoFrameCallback(loop);
  };
  v.requestVideoFrameCallback(loop);
}

async function pumpProcessor(t) {
  if (typeof MediaStreamTrackProcessor === 'undefined') return;
  try {
    const r = new MediaStreamTrackProcessor({ track: t }).readable.getReader();
    reader = r;
    while (track === t) {
      const { value, done } = await r.read();
      if (done) break;
      latest?.close();
      latest = value;                // 가장 최근 프레임을 보관한다 (이전 것은 닫음)
      stats.proc.push(Date.now());
    }
  } catch (e) { pumpError = String(e?.message || e); }
}

function cleanup() {
  const r = reader;
  latest?.close(); latest = null;
  stream?.getTracks().forEach(t => t.stop());
  video?.remove?.();
  stream = track = video = reader = null;
  r?.cancel().catch(() => {});
  emit();
}

export function stopCapture() { if (stream) cleanup(); }

const shot = document.createElement('canvas');
const experienceShot = document.createElement('canvas');
let experienceCtx = null;
let shotCtx = null, grabError = '';

/** 마지막으로 화면을 가져오지 못한 이유 (성공하면 빈 문자열) */
export const getGrabError = () => grabError;

export function grabExperienceFrame() {
  if (!video || video.readyState<2 || !video.videoWidth || !video.videoHeight) return null;
  const w=video.videoWidth,sourceHeight=video.videoHeight;
  const h=Math.min(sourceHeight,Math.max(72,Math.ceil(sourceHeight*.10)));
  try {
    if (!experienceCtx || experienceShot.width!==w || experienceShot.height!==h) {
      experienceShot.width=w;
      experienceShot.height=h;
      experienceCtx=experienceShot.getContext('2d',{willReadFrequently:true});
    }
    experienceCtx.drawImage(video,0,sourceHeight-h,w,h,0,0,w,h);
    return {image:experienceCtx.getImageData(0,0,w,h),sourceHeight};
  } catch {
    return null;
  }
}

/** 현재 화면 한 장을 ImageData로 가져온다. 실패하면 null이고, 이유는 getGrabError()로 확인한다. */
export function grabFrame() {
  const tries = [];
  if (latest) tries.push(['수신 프레임', latest, latest.displayWidth, latest.displayHeight]);
  if (video && video.videoWidth) tries.push(['영상 요소', video, video.videoWidth, video.videoHeight]);
  if (!tries.length) {
    grabError = `공유 화면의 프레임이 아직 도착하지 않았어요${pumpError ? ` (수신 오류: ${pumpError})` : ''}`;
    return null;
  }
  const errs = [];
  for (const [name, src, w, h] of tries) {
    try {
      if (!w || !h) throw new Error('크기가 0');
      if (!shotCtx || shot.width !== w || shot.height !== h) {
        shot.width = w; shot.height = h;
        shotCtx = shot.getContext('2d', { willReadFrequently: true });
      }
      shotCtx.drawImage(src, 0, 0);
      const img = shotCtx.getImageData(0, 0, w, h);
      grabError = '';
      return img;
    } catch (e) {
      errs.push(`${name}: ${e?.name || ''} ${e?.message || e}`.trim());
    }
  }
  grabError = errs.join(' / ');
  return null;
}
