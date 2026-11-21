/* 화면 공유(getDisplayMedia) 시작/중지와 프레임 수신 */
import { cancelVoiceScope, companionSay, notify } from '../../core/notify.js';
import {gameContentHeight} from './frame-geometry.js';

let stream = null, track = null, video = null, reader = null;
let owner = null, starting = false;
let latest = null;                    // 가장 최근 프레임 (VideoFrame)
let pumpError = '';                   // 프레임 수신 루프에서 난 오류
const subs = new Set();

export function onCaptureChange(fn,scope='hunt') {
  let active=getInfo(scope).active;
  subs.add(()=>{
    const info=getInfo(scope);
    if (info.active===active) return;
    active=info.active;
    fn(info);
  });
}
const emit = () => subs.forEach(fn => fn());

export function getInfo(scope='hunt') {
  if (!track || owner!==scope) return { active: false };
  const s = track.getSettings();
  return { active: true, width: s.width, height: s.height, fps: s.frameRate, surface: s.displaySurface, label: track.label };
}

export async function startCapture(scope='hunt') {
  if (stream) {
    if (owner!==scope) {
      cancelVoiceScope(owner);
      owner=scope;
      emit();
    }
    return;
  }
  if (starting) return;
  starting=true;
  let s,v,t;
  try {
    s = await navigator.mediaDevices.getDisplayMedia({
    // 작은 숫자를 읽어야 해서 가능한 한 원본 해상도를 요청한다
      video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 10, max: 15 } },
      audio: false
    });
    t=s.getVideoTracks()[0];
    if (!t) throw new Error('화면 공유 영상이 없습니다.');
    v = document.createElement('video');
    v.muted = true;
    v.srcObject = s;
    v.playsInline = true;
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body?.appendChild(v);      // 화면 밖에 붙여 두면 영상 디코딩이 더 안정적이다
    await v.play();
    if (t.readyState==='ended') throw new Error('화면 공유가 종료됐습니다.');
  } catch (error) {
    s?.getTracks().forEach(item=>item.stop());
    v?.remove();
    throw error;
  } finally {
    starting=false;
  }

  stream = s; track = t; video = v; owner=scope;
  pumpError = '';
  // 사용자가 브라우저의 "공유 중지"를 누르거나 게임 창이 닫히면 발생 (stop()으로는 발생하지 않음)
  t.addEventListener('ended', () => {
    if (track !== t) return;
    const endedScope=owner;
    cleanup();
    notify('화면 공유가 끊겼어요', 'alert',endedScope==='boss' ? 'boss-share' : 'general');
  });
  pumpProcessor(t);
  emit();
  companionSay('내가 지켜볼게');
}

async function pumpProcessor(t) {
  if (typeof MediaStreamTrackProcessor === 'undefined') return;
  try {
    const r = new MediaStreamTrackProcessor({ track: t }).readable.getReader();
    reader = r;
    while (track === t) {
      const { value, done } = await r.read();
      if (done) break;
      if (track !== t) {
        value.close();
        break;
      }
      latest?.close();
      latest = value;                // 가장 최근 프레임을 보관한다 (이전 것은 닫음)
    }
  } catch (e) { pumpError = String(e?.message || e); }
}

function cleanup() {
  cancelVoiceScope(owner);
  geometryCache=null;
  const r = reader;
  latest?.close(); latest = null;
  stream?.getTracks().forEach(t => t.stop());
  video?.remove?.();
  stream = track = video = reader = null;
  owner=null;
  r?.cancel().catch(() => {});
  emit();
}

export function stopCapture(scope='hunt') { if (stream && owner===scope) cleanup(); }

const shot = document.createElement('canvas');
const experienceShot = document.createElement('canvas');
const geometryShot = document.createElement('canvas');
let geometryCache=null;
function contentHeight() {
  const w=video.videoWidth,h=video.videoHeight,now=Date.now();
  if(geometryCache?.w===w && geometryCache.h===h && now-geometryCache.at<1000)return geometryCache.height;
  geometryShot.width=64;geometryShot.height=h;
  const ctx=geometryShot.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(video,0,0,w,h,0,0,64,h);
  const height=gameContentHeight({w:64,h,rgba:ctx.getImageData(0,0,64,h).data});
  geometryCache={w,h,height,at:now};
  return height;
}
let shotCtx = null, grabError = '';

/** 마지막으로 화면을 가져오지 못한 이유 (성공하면 빈 문자열) */
export const getGrabError = () => grabError;

function grabVideoRegion(canvas,x,y,w,h) {
  try {
    if (canvas.width!==w || canvas.height!==h) {canvas.width=w;canvas.height=h;}
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,x,y,w,h,0,0,w,h);
    return ctx.getImageData(0,0,w,h);
  } catch {
    return null;
  }
}
export function grabExperienceFrame(scope='hunt') {
  if (owner!==scope) return null;
  if (!video || video.readyState<2 || !video.videoWidth || !video.videoHeight) return null;
  const w=video.videoWidth,sourceHeight=contentHeight();
  const h=Math.min(sourceHeight,Math.max(72,Math.ceil(sourceHeight*.10)));
  const image=grabVideoRegion(experienceShot,0,sourceHeight-h,w,h);
  return image ? {image,sourceHeight} : null;
}

/** 현재 화면 한 장을 ImageData로 가져온다. 실패하면 null이고, 이유는 getGrabError()로 확인한다. */
export function grabFrame(scope='hunt') {
  if (owner!==scope) return null;
  const tries = [];
  if (video?.readyState >= 2 && video.videoWidth) tries.push(['영상 요소', video, video.videoWidth, video.videoHeight]);
  if (latest) tries.push(['수신 프레임', latest, latest.displayWidth, latest.displayHeight]);
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
      const full = shotCtx.getImageData(0,0,w,h);
      const height=video?.videoWidth===w && video?.videoHeight===h
        ? contentHeight() : gameContentHeight({w,h,rgba:full.data});
      grabError = '';
      return {width:w,height:h,contentHeight:height,data:full.data};
    } catch (e) {
      errs.push(`${name}: ${e?.name || ''} ${e?.message || e}`.trim());
    }
  }
  grabError = errs.join(' / ');
  return null;
}
