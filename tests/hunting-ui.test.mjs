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
 S.pauseHunt(103000);
 const elapsed=S.huntMs(103000),left=S.collectLeftMs(103000),eventCount=events.length;
 S.handleMonitor({t:150000,results:[],monitor:{exp:{value:{raw:'38003778803430',percent:null}}}});
 S.tick(200000);
 assert.equal(S.state.hunt.running,false);
 assert.equal(S.huntMs(200000),elapsed);
 assert.equal(S.collectLeftMs(200000),left);
 assert.equal(events.length,eventCount);
 S.resumeHunt(201000);
 assert.equal(S.huntMs(202000),elapsed+1000);
 assert.equal(S.collectLeftMs(202000),left-1000);
 S.setCollectEnabled(false,202000);
 assert.equal(S.collectLeftMs(202000),null);
 S.tick(203000);
 assert.equal(events.length,eventCount);
 S.setCollectEnabled(true,203000);
 assert.equal(S.collectLeftMs(203000),100000);
 S.stopHunt(204000);
 assert.equal(JSON.parse(saved.get('hunt_history_v1'))[0].startExp.percent,null);ui.render(204000);
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

test('manual end saves the hunt and keeps collection stopped until restart',()=>{
 S.startHunt(250000);
 S.tick(281000);
 assert.equal(S.state.hunt.running,true);
 S.endHunt(282000);
 const records=S.state.hunt.history.length;
 const raw=String(BigInt(S.state.hunt.lastExp.raw)+1n);
 S.handleMonitor({t:283000,results:[],monitor:{exp:{value:{raw,percent:null}}}});
 assert.equal(S.state.hunt.running,false);
 assert.equal(S.state.hunt.history.length,records);
 assert.equal(S.state.collect.deadline,0);
 S.startHunt(284000);
 assert.equal(S.state.hunt.running,true);
 assert.equal(S.state.hunt.startExp.raw,raw);
 S.endHunt(285000);
 S.captureEnded(286000);
});
test('a confirmed first fragment increase preserves the earlier starting count',()=>{
 S.captureEnded(300000);
 S.startHunt(301000);
 S.handleMonitor({t:302000,results:[],monitor:{fragments:{value:24,previous:23}}});
 assert.equal(S.state.hunt.fragmentStart,23);
 assert.equal(S.state.hunt.latestFragments,24);
 assert.equal(S.state.hunt.fragments,1);
 S.endHunt(303000);
 S.captureEnded(304000);
});
test('confirmed installer expires and notifies once without further frame results',async()=>{
 const {trackers,expireInstallers}=await import('../js/tabs/hunting/trackers.js');
 const previous={...trackers.janus};
 const events=[];N.onNotify(e=>events.push(e));
 try {
   N.setAlarmEnabled('janus',true);
   Object.assign(trackers.janus,{deadline:3000,needsReinstall:false,alerted:false});
   expireInstallers(-1);
   assert.equal(events.filter(e=>e.channel==='janus').length,0);
   expireInstallers(0);
   assert.equal(events.filter(e=>e.channel==='janus').length,1);
   assert.equal(trackers.janus.needsReinstall,false);
   expireInstallers(2999);
   expireInstallers(3000);
   expireInstallers(3500);
   assert.equal(trackers.janus.needsReinstall,true);
   assert.equal(events.filter(e=>e.channel==='janus').length,1);
 } finally {Object.assign(trackers.janus,previous);}
});
