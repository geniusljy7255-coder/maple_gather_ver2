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
test('boss voice and alarm settings are independent of hunting',()=>{
 const oldVoice=N.getVoice(),oldVolume=N.getVoiceVolume();
 const before=voices;
 N.setVoice(false,'boss');
 N.setVoiceVolume(35,'boss');
 N.notify('보스 알림 테스트','alert','boss-test');
 assert.equal(voices,before);
 assert.equal(N.getVoice(),oldVoice);
 assert.equal(N.getVoiceVolume(),oldVolume);
 assert.equal(N.getVoiceVolume('boss'),35);
 N.setVoice(true,'boss');
 N.notify('보스 알림 테스트','alert','boss-test');
 assert.equal(voices,before+1);
 N.setAlarmEnabled('boss-burst',false);
 N.notify('극딜','alert','boss-burst');
 assert.equal(voices,before+1);
 N.setAlarmEnabled('boss-burst',true);
});
const elements=new Map(),make=()=>({attributes:new Map(),getAttribute(name){return this.attributes.get(name)??null;},setAttribute(name,value){this.attributes.set(name,String(value));},removeAttribute(name){this.attributes.delete(name);},style:{setProperty(key,value){this[key]=value;}},classList:{toggle(){}},handlers:{},children:[],selectors:new Map(),addEventListener(k,fn){this.handlers[k]=fn;},append(...n){this.children.push(...n);},replaceChildren(){this.children=[];},querySelector(key){if(!this.selectors.has(key))this.selectors.set(key,make());return this.selectors.get(key);},remove(){},getContext:()=>({clearRect(){},putImageData(){}})});
globalThis.document={hidden:false,createElement:make,getElementById:id=>elements.get(id)||null};
const ui=await import('../js/tabs/hunting/ui.js');const S=await import('../js/tabs/hunting/session.js');
test('confirmed booster expiry speaks once even without a recent screen reading',()=>{
 const events=[];N.onNotify(e=>events.push(e));
 const before=voices;
 S.state.booster={deadline:30000,confirmedAt:1000,sample:null};
 S.tick(30000);S.tick(31000);
 assert.equal(events.filter(e=>e.channel==='booster').length,1);
 assert.equal(voices,before+1);
 assert.equal(S.state.booster.deadline,0);
});
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
 const history=elements.get('huntHistory');
 const rows=history.children;
 assert.equal(rows.length,1);
 assert.equal(rows[0].children[3].textContent,'0개');
 ui.render(204250);
 assert.equal(history.children,rows);
});

test('unconfirmed fragment reads never appear by themselves',()=>{
 const hunt=S.state.hunt,vision=S.state.vision;
 const previous={latestFragments:hunt.latestFragments,fragmentStart:hunt.fragmentStart,fragments:hunt.fragments};
 const previousReading=vision.fragments;
 try {
  Object.assign(hunt,{latestFragments:null,fragmentStart:null,fragments:0});
  vision.fragments={value:null,text:'49'};
  ui.render(205000);
  assert.equal(elements.get('huntFragments').textContent,'—');
  assert.equal(elements.get('huntFragmentsDetail').textContent,'조각 아이콘 탐색 중');
  hunt.latestFragments=49;
  ui.render(205500);
  assert.equal(elements.get('huntFragments').textContent,'+0개');
  assert.equal(elements.get('huntFragmentsDetail').textContent,'시작 — → 현재 49개');
 } finally {
  Object.assign(hunt,previous);
  vision.fragments=previousReading;
 }
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
 const started = [];
 N.onVoiceStart(event=>started.push(event.text));
 speechSynthesis.speak = utterance => spoken.push(utterance);
 try {
   N.setVoice(true);
   N.notify('first','alert','collect');
   N.notify('second','alert','janus');
   N.notify('third','alert','fountain');
   assert.equal(spoken.length,1);
   assert.deepEqual(started,[]);
   spoken[0].onstart();
   spoken[0].onend();
   assert.equal(spoken[1].text,'second');
   spoken[1].onstart();
   spoken[1].onerror();
   assert.equal(spoken[2].text,'third');
   spoken[2].onstart();
   assert.deepEqual(started,['first','second','third']);
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
   Object.assign(trackers.janus,{deadline:4000,needsReinstall:false,alerted:false});
   expireInstallers(-1);
   assert.equal(events.filter(e=>e.channel==='janus').length,0);
   expireInstallers(0);
   assert.equal(events.filter(e=>e.channel==='janus').length,1);
   assert.equal(trackers.janus.needsReinstall,false);
   expireInstallers(3999);
   expireInstallers(4000);
   expireInstallers(4500);
   assert.equal(trackers.janus.needsReinstall,true);
   assert.equal(events.filter(e=>e.channel==='janus').length,1);
 } finally {Object.assign(trackers.janus,previous);}
});
test('two Captain installer alerts are added, muted and removed independently',async()=>{
 const {addJobInstaller,updateJobInstaller,removeJobInstaller,jobAlarm,jobInstallers}=await import('../js/tabs/hunting/job-installers.js');
 const {trackers,expireInstallers}=await import('../js/tabs/hunting/trackers.js');
 const controls=elements.get('jobAlarmControls'),events=[];
 N.onNotify(event=>events.push(event));
 addJobInstaller();addJobInstaller();
 const [first,second]=jobInstallers;
 try {
   assert.equal(controls.children.length,0);
   updateJobInstaller(first.id,{skill:'캡틴_배틀쉽_봄버'});
   updateJobInstaller(second.id,{skill:'캡틴_시즈_봄버'});
   assert.equal(controls.children.length,2);
   const siege=controls.children[1].children[0];
   siege.checked=false;siege.handlers.change();
   assert.equal(N.isAlarmEnabled(jobAlarm(second).id),false);
   assert.equal(N.isAlarmEnabled(jobAlarm(first).id),true);
   const expiry=10000;
   for (const item of [first,second]) trackers[item.id]={id:item.id,deadline:expiry,alerted:false};
   expireInstallers(expiry-1001);
   assert.equal(events.filter(event=>event.channel.startsWith('job-')).length,0);
   expireInstallers(expiry-1000);expireInstallers(expiry);expireInstallers(expiry+1000);
   assert.deepEqual(events.filter(event=>event.channel.startsWith('job-')).map(event=>[event.text,event.muted]),
     [['배틀쉽 재설치',false],['시즈봄버 재설치',true]]);
   removeJobInstaller(first.id);
   assert.equal(controls.children.length,1);
   assert.equal(controls.children[0].children[1],'시즈봄버');
 } finally {
   for (const item of [first,second]) {delete trackers[item.id];removeJobInstaller(item.id);}
 }
});

test('saved sixth-job installers keep their selected skill without the obsolete toggle',async()=>{
 const key='hunt_job_installers',previous=saved.get(key),skill='렌_매화검_3초식_예인';
 try {
  saved.set(key,JSON.stringify([{id:'job-1',skill,sixth:true}]));
  const {jobInstallers,jobIconFiles}=await import('../js/tabs/hunting/job-installers.js?legacy-sixth-test');
  assert.deepEqual(jobInstallers,[{id:'job-1',skill}]);
  assert.deepEqual(jobIconFiles(jobInstallers[0]),[skill,skill+'_6차']);
 } finally {
  if(previous===undefined) saved.delete(key);
  else saved.set(key,previous);
 }
});

test('Ren count installer has its own sound switch and removes it with the installer',async()=>{
 const J=await import('../js/tabs/hunting/job-installers.js');
 const controls=elements.get('jobAlarmControls');
 const before=controls.children.length;
 J.addJobInstaller();const item=J.jobInstallers.at(-1);
 try{
  J.updateJobInstaller(item.id,{skill:'렌_매화검_3초식_예인',sixth:true});
  assert.equal(controls.children.length,before+1);
  assert.deepEqual(J.jobIconFiles(item),['렌_매화검_3초식_예인','렌_매화검_3초식_예인_6차']);
  assert.equal(Object.hasOwn(item,'sixth'),false);
  const alarm=J.jobAlarm(item);assert.equal(alarm.label,'예인');
  N.setAlarmEnabled(alarm.id,false);assert.equal(N.isAlarmEnabled(alarm.id),false);
  const previousVoices=voices;N.notify('예인 재설치','alert',alarm.id);
  assert.equal(voices,previousVoices);
  N.setAlarmEnabled(alarm.id,true);
 }finally{J.removeJobInstaller(item.id);}
 assert.equal(controls.children.length,before);
});
test('Ren fallback clock emits one reinstall alert even without further frame results',async()=>{
 const J=await import('../js/tabs/hunting/job-installers.js');
 const {trackers,expireInstallers}=await import('../js/tabs/hunting/trackers.js');
 const {freshState}=await import('../js/tabs/hunting/tracking-state.js');
 J.addJobInstaller();const item=J.jobInstallers.at(-1),events=[];
 try{
  J.updateJobInstaller(item.id,{skill:'렌_매화검_3초식_예인'});
  const alarm=J.jobAlarm(item);N.setAlarmEnabled(alarm.id,true);
  N.onNotify(e=>events.push(e));
  trackers[item.id]={id:item.id,...freshState(),trackingMode:'count',confirmedCount:2,
   countAnchorAt:1000,lastReadAt:1500,countNeedsEstimate:true,count:2};
  expireInstallers(2999);assert.equal(events.filter(e=>e.channel===alarm.id).length,0);
  expireInstallers(3000);expireInstallers(3500);expireInstallers(5000);
  assert.deepEqual(events.filter(e=>e.channel===alarm.id).map(e=>e.text),['예인 재설치']);
  assert.equal(trackers[item.id].deadline,null);
 }finally{delete trackers[item.id];J.removeJobInstaller(item.id);}
});
