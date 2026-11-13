import test from 'node:test';import assert from 'node:assert/strict';
const saved=new Map();globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v))};
let beeps=0,voices=0;globalThis.AudioContext=class {state='running';currentTime=0;destination={};createOscillator(){return {frequency:{},connect(){},start(){beeps++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};globalThis.speechSynthesis={cancel(){},speak(speech){voices++;speech.onend?.();}};
const N=await import('../js/core/notify.js');
test('per-alarm mute suppresses sound and speech without suppressing event logs',()=>{
 const events=[];N.onNotify(e=>events.push(e));N.setAlarmEnabled('collect',false);
 N.notify('회수','alert','collect');assert.equal(beeps,0);assert.equal(voices,0);assert.equal(events[0].muted,true);assert.equal(saved.get('hunt_alarm_collect'),'0');
 N.notify('룬','alert','rune');assert.equal(beeps,3);assert.equal(voices,1);
 N.setAlarmEnabled('collect',true);N.notify('회수','alert','collect');assert.equal(beeps,6);assert.equal(voices,2);
});
const elements=new Map(),make=()=>({setAttribute(){},removeAttribute(){},style:{},classList:{toggle(){}},handlers:{},children:[],addEventListener(k,fn){this.handlers[k]=fn;},append(...n){this.children.push(...n);},replaceChildren(){this.children=[];},getContext:()=>({clearRect(){},putImageData(){}})});
globalThis.document={hidden:false,createElement:make,getElementById:id=>elements.get(id)||null};
const ui=await import('../js/tabs/hunting/ui.js');const S=await import('../js/tabs/hunting/session.js');
for(const match of ui.html.matchAll(/id="([^"]+)"/g))elements.set(match[1],make());
test('simplified UI binds and renders without removed image/rune elements',()=>{
 assert.ok(!ui.html.includes('<canvas'));assert.ok(!ui.html.includes('id="runeBuff"'));assert.ok(!ui.html.includes('id="runeLeft"'));
 ui.bind();ui.render(1000);for(const c of N.ALARM_CHANNELS)assert.ok(elements.get('alarm-'+c.id).handlers.change);
 elements.get('alarm-janus').handlers.change({target:{checked:false}});assert.equal(N.isAlarmEnabled('janus'),false);
});
test('raw-only observations start collection alerts and save percent-null history',()=>{
 S.handleMonitor({t:1000,results:[],monitor:{exp:{value:{raw:'38003778803410',percent:null}}}});
 S.handleMonitor({t:2000,results:[],monitor:{exp:{value:{raw:'38003778803411',percent:null}}}});
 assert.equal(S.state.hunt.running,true);assert.equal(S.state.collect.deadline,102000);
 for(let i=1;i<=5;i++)S.handleMonitor({t:2000+i*20000,results:[],monitor:{exp:{value:{raw:String(38003778803411n+BigInt(i)),percent:null}}}});
 const events=[];N.onNotify(e=>events.push(e));S.tick(102000);assert.ok(events.some(e=>e.channel==='collect'));
 S.pauseHunt(103000);assert.equal(JSON.parse(saved.get('hunt_history_v1'))[0].startExp.percent,null);ui.render(103000);
});

test('master and individual alarm controls stay in sync',()=>{
 const master=elements.get('huntVoice');
 master.checked=false;master.handlers.change();
 assert.ok(N.ALARM_CHANNELS.every(c=>!N.isAlarmEnabled(c.id)));
 for(const channel of N.ALARM_CHANNELS){
   const control=elements.get('alarm-'+channel.id);
   control.handlers.change({target:{checked:true}});
   assert.equal(master.checked,true);
   control.handlers.change({target:{checked:false}});
   assert.equal(master.checked,false);
 }
 master.checked=true;master.handlers.change();
 assert.ok(N.ALARM_CHANNELS.every(c=>N.isAlarmEnabled(c.id)));
});

test('overlapping announcements play in order and recover from a speech error',()=>{
 const previous = speechSynthesis.speak;
 const spoken = [];
 speechSynthesis.speak = utterance => spoken.push(utterance);
 try {
   N.setVoice(true);
   N.notify('first','alert','collect');
   N.notify('second','alert','janus');
   N.notify('third','alert','fountain');
   assert.equal(spoken.length,1);
   spoken[0].onend();
   assert.equal(spoken[1].text,'second');
   spoken[1].onerror();
   assert.equal(spoken[2].text,'third');
   spoken[2].onend();
 } finally {
   speechSynthesis.speak = previous;
   for (const item of spoken) item.onend();
 }
});
