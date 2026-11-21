/* 알림: 효과음 + (선택) 음성 */
export const ALARM_CHANNELS=[{id:'collect',label:'아이템 회수'},{id:'rune',label:'룬 출현'},{id:'janus',label:'솔 야누스'},{id:'fountain',label:'에르다 파운틴'},{id:'booster',label:'VIP 부스터'}];
export const BOSS_ALARM_CHANNELS=[
  {id:'boss-burst',label:'극딜'},{id:'boss-semi',label:'준극딜'},
  {id:'boss-strike',label:'일격필살'},{id:'boss-utility',label:'생존기·유틸기'},
  {id:'boss-karing',label:'패턴 도우미 - 카링'}
];
const alarmScope = id => id.startsWith('boss-') ? 'boss' : 'hunt';
const alarmKey = id => alarmScope(id)==='boss' ? 'boss_alarm_'+id.slice(5) : 'hunt_alarm_'+id;
const alarmMemory=new Map();
export function isAlarmEnabled(id){
  if(alarmMemory.has(id))return alarmMemory.get(id);
  try{return localStorage.getItem(alarmKey(id))!=='0';}catch{return true;}
}
export function setAlarmEnabled(id,on){
  if(!ALARM_CHANNELS.some(c=>c.id===id) && !BOSS_ALARM_CHANNELS.some(c=>c.id===id) &&
      !/^job-\d+:[\p{L}\p{N}_]+$/u.test(id))return;
  alarmMemory.set(id,!!on);try{localStorage.setItem(alarmKey(id),on?'1':'0');}catch{}
}

const PATTERNS = { info: [880], alert: [1175, 1175, 1175] };
const subs = new Set();
const voiceStartListeners = new Set();
const companionListeners = new Set();
let ctx = null;

export const getVoice = (scope='hunt') => localStorage.getItem(`${scope}_voice`) !== '0';
export const setVoice = (on,scope='hunt') => localStorage.setItem(`${scope}_voice`, on ? '1' : '0');
export function getVoiceVolume(scope='hunt') {
  const saved = localStorage.getItem(`${scope}_voice_volume`);
  return saved === null ? 100 : Math.max(0, Math.min(100, Number(saved) || 0));
}
export function setVoiceVolume(value,scope='hunt') {
  localStorage.setItem(`${scope}_voice_volume`, String(Math.max(0, Math.min(100, Number(value) || 0))));
}
export const onNotify = fn => subs.add(fn);
export const onVoiceStart = fn => voiceStartListeners.add(fn);
export const onCompanionSpeech = fn => companionListeners.add(fn);
export const companionSay = text => companionListeners.forEach(fn => fn(text));

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
let speechScope = null, stopSpeech = null;

export function cancelVoiceScope(scope) {
  for(let index=voiceQueue.length-1;index>=0;index--) {
    if(alarmScope(voiceQueue[index].channel)===scope) voiceQueue.splice(index,1);
  }
  if(speechScope===scope) stopSpeech?.();
}

function playNextVoice() {
  if (speaking) return;
  while (voiceQueue.length) {
    const {text, channel} = voiceQueue.shift();
    const scope=alarmScope(channel);
    if (!getVoice(scope) || !isAlarmEnabled(channel)) continue;
    speaking = true;
    speechScope = scope;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      speaking = false;
      speechScope = null;
      stopSpeech = null;
      playNextVoice();
    };
    const timeout = setTimeout(() => {
      if (done) return;
      try { speechSynthesis.cancel(); } finally { finish(); }
    }, 8000);
    stopSpeech=()=>{
      try { speechSynthesis.cancel(); } finally { finish(); }
    };
    try {
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = 'ko-KR';
      speech.volume = getVoiceVolume(scope) / 100;
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

  if (audible && getVoice(alarmScope(channel)) && typeof speechSynthesis !== 'undefined') {
    if (voiceQueue.length < 12) voiceQueue.push({text, channel});
    playNextVoice();
  }
  subs.forEach(fn => fn({ text, kind, channel, muted:!audible, at: Date.now() }));
}
