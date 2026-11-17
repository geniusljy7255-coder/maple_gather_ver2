/* 알림: 효과음 + (선택) 음성 */
const VOICE_KEY = 'hunt_voice';
export const ALARM_CHANNELS=[{id:'collect',label:'아이템 회수'},{id:'rune',label:'룬 출현'},{id:'janus',label:'솔 야누스'},{id:'fountain',label:'에르다 파운틴'}];
const alarmMemory=new Map();
export function isAlarmEnabled(id){
  if(alarmMemory.has(id))return alarmMemory.get(id);
  try{return localStorage.getItem('hunt_alarm_'+id)!=='0';}catch{return true;}
}
export function setAlarmEnabled(id,on){
  if(!ALARM_CHANNELS.some(c=>c.id===id) && !/^job-\d+:[\p{L}\p{N}_]+$/u.test(id))return;
  alarmMemory.set(id,!!on);try{localStorage.setItem('hunt_alarm_'+id,on?'1':'0');}catch{}
}

const PATTERNS = { info: [880], alert: [1175, 1175, 1175] };
const subs = new Set();
const voiceStartListeners = new Set();
let ctx = null;

export const getVoice = () => localStorage.getItem(VOICE_KEY) !== '0';
export const setVoice = on => localStorage.setItem(VOICE_KEY, on ? '1' : '0');
const VOICE_VOLUME_KEY = 'hunt_voice_volume';
export function getVoiceVolume() {
  const saved = localStorage.getItem(VOICE_VOLUME_KEY);
  return saved === null ? 100 : Math.max(0, Math.min(100, Number(saved) || 0));
}
export function setVoiceVolume(value) {
  localStorage.setItem(VOICE_VOLUME_KEY, String(Math.max(0, Math.min(100, Number(value) || 0))));
}
export const onNotify = fn => subs.add(fn);
export const onVoiceStart = fn => voiceStartListeners.add(fn);

/** 브라우저는 사용자가 클릭한 뒤에만 소리를 허용하므로, 버튼 클릭 때 미리 호출해 둔다. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* 오디오를 쓸 수 없는 환경 */ }
}

function beep(freq, at, dur = 0.18) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

const voiceQueue = [];
let speaking = false;

function playNextVoice() {
  if (speaking) return;
  while (voiceQueue.length) {
    const {text, channel} = voiceQueue.shift();
    if (!getVoice() || !isAlarmEnabled(channel)) continue;
    speaking = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      speaking = false;
      playNextVoice();
    };
    const timeout = setTimeout(() => {
      if (done) return;
      try { speechSynthesis.cancel(); } finally { finish(); }
    }, 8000);
    try {
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = 'ko-KR';
      speech.volume = getVoiceVolume() / 100;
      speech.onstart = () => voiceStartListeners.forEach(listener=>listener({text,channel}));
      speech.onend = finish;
      speech.onerror = finish;
      speechSynthesis.speak(speech);
    } catch {
      finish();
    }
    return;
  }
}

/** kind: 'info'(1회) | 'alert'(3회) */
export function notify(text, kind = 'info', channel='general') {
  const audible=isAlarmEnabled(channel);
  if(audible)unlockAudio();
  try {
    if (audible && ctx) (PATTERNS[kind] || PATTERNS.info).forEach((f, i) => beep(f, ctx.currentTime + i * 0.25));
  } catch (e) { /* 무시 */ }

  if (audible && getVoice() && typeof speechSynthesis !== 'undefined') {
    if (voiceQueue.length < 12) voiceQueue.push({text, channel});
    playNextVoice();
  }
  subs.forEach(fn => fn({ text, kind, channel, muted:!audible, at: Date.now() }));
}
