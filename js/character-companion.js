import {fetchCharacterAppearance} from './core/nexon.js';
import {getSchedulerCharacters} from './tabs/scheduler.js';
import {onCompanionSpeech,onVoiceStart} from './core/notify.js';

const settingsKey='ddangkaera-character-companion';
const mapKey='ddangkaera-companion-map';
const chairKey='ddangkaera-companion-chair';
const defaultChair='03010001';
const chairAssets=new URL('../img/item/chair/03010/',import.meta.url);
const chairScale=72/41;
const apiKeyName='nexon_api_key';
const refreshMs=24*60*60*1000;
const frameMs=130;
const platforms={
  crane:{width:1241,height:698,maxWidth:745,left:380,right:930,y:437},
  mapleHill:{width:1818,height:1022,maxWidth:1000,left:175,right:1190,y:925},
  temple:{width:1952,height:544,left:110,right:1842,y:371,centered:true}
};
const idleLines=[
  '같이 산책하니까 좋다.',
  '너무 무리하지마!',
  '내가 있으닌까 좋지?'
];
const alarmLines={
  '회수하세요':'아이템 줍는 거 잊지 마!',
  '룬이 나타났습니다':'룬을 까면 경험치를 더 얻을 수 있어!',
  '화면 공유가 끊겼어요':'화면이 안보여!',
  '알림 테스트입니다':'내 목소리 들려?'
};
const standingFrames=[0,7,8,7];

function chairLayers(layers,scale){
  return layers.map(([file,x,y,width,height,depth])=>{
    const layer=document.createElement('span');
    layer.className='companion-chair-layer';
    layer.style.left=x*scale+'px';
    layer.style.top=y*scale+'px';
    layer.style.width=width*scale+'px';
    layer.style.height=height*scale+'px';
    layer.style.zIndex=depth>0 ? '2' : '0';
    layer.style.backgroundImage=`url("${new URL(file,chairAssets).href}")`;
    return layer;
  });
}

async function loadFrame(source,action){
  const url=new URL(source);
  if (url.origin!=='https://open.api.nexon.com') throw new Error('캐릭터 이미지 주소를 확인할 수 없어.');
  for (const [key,value] of Object.entries({action,emotion:'E00',width:128,height:112,x:64,y:84})) {
    url.searchParams.set(key,value);
  }
  const image=new Image();
  image.alt='';
  image.draggable=false;
  image.src=url.href;
  await image.decode();
  image.hidden=true;
  return image;
}
const preloadFrames=source=>Promise.all(['A00.0','A02.0','A02.1','A02.2','A02.3','A07.0','A04.0','A00.1','A00.2']
  .map(action=>loadFrame(source,action)));

function makeBalloon(){
  const node=document.createElement('div');
  node.className='companion-balloon';
  node.hidden=true;
  const name=document.createElement('span'),line=document.createElement('span');
  node.append(name,document.createElement('br'),line);
  let timer;
  function hide(){
    clearTimeout(timer);
    node.hidden=true;
  }
  return {node,name,hide,show(text){
    hide();
    line.textContent=text;
    node.hidden=false;
    timer=setTimeout(hide,5000);
  }};
}

export function mountCharacterCompanion(trigger){
  const sprite=document.createElement('div');
  sprite.className='character-companion';
  sprite.hidden=true;
  sprite.setAttribute('aria-hidden','true');
  const balloon=makeBalloon();
  const visitor=document.createElement('div');
  visitor.className='character-companion companion-visitor';
  visitor.hidden=true;
  visitor.setAttribute('aria-hidden','true');
  const visitorBalloon=makeBalloon();
  const visitorChair=document.createElement('span');
  visitorChair.className='companion-chair';
  const visitorHitbox=document.createElement('span');
  visitorHitbox.className='companion-hitbox';
  const ground=document.createElement('div');
  ground.className='companion-ground';
  ground.hidden=true;
  ground.setAttribute('aria-hidden','true');
  const chair=document.createElement('span');
  chair.className='companion-chair';
  const chairFront=document.createElement('span');
  chairFront.className='companion-chair companion-chair-front';
  const hitbox=document.createElement('span');
  hitbox.className='companion-hitbox';
  const menu=document.createElement('div');
  menu.className='companion-menu';
  menu.hidden=true;
  menu.setAttribute('aria-label','캐릭터 동작');
  const menuButtons=new Map();
  for(const [pose,label] of [['sit','앉기'],['prone','엎드리기'],['walk','일어서기'],['keep','계속 두기'],['send','보내기']]) {
    const button=document.createElement('button');
    button.type='button';
    button.dataset.pose=pose;
    button.textContent=label;
    menu.append(button);
    menuButtons.set(pose,button);
  }
  document.body.append(sprite,ground,menu,visitor);

  const dialog=document.createElement('dialog');
  dialog.id='characterCompanionSettings';
  dialog.className='companion-settings';
  dialog.setAttribute('aria-labelledby','companionTitle');
  dialog.innerHTML=`
    <form class="companion-form">
      <div class="companion-heading">
        <h2 id="companionTitle">내 캐릭터</h2>
        <button type="button" data-close aria-label="닫기">×</button>
      </div>
      <label>넥슨 API 키 <input name="apiKey" type="password" autocomplete="off" spellcheck="false"></label>
      <div class="companion-nickname">
        <label for="companionNickname">캐릭터 닉네임</label>
        <input id="companionNickname" name="nickname" type="text" required maxlength="30" autocomplete="off">
        <span class="companion-saved" data-saved>
          <select aria-label="스케줄러 캐릭터 목록"><option value="">목록</option></select>
        </span>
      </div>
      <label>방문 캐릭터 닉네임 <input name="visitors" type="text" maxlength="200" placeholder="닉네임을 쉼표로 구분" autocomplete="off"></label>
      <label>맵
        <select name="map">
          <option value="arcana">아르카나</option>
          <option value="crane">커닝시티 크레인</option>
          <option value="mapleHill">단풍나무 언덕</option>
          <option value="temple">현혹의 신전</option>
        </select>
      </label>
      <div class="companion-chair-setting">
        <div class="companion-chair-preview" role="img" aria-label="의자 미리보기">
          <div data-chair-preview></div>
        </div>
        <label>의자
          <select name="chair">
            <option value="03010001">기본 의자 · 03010001</option>
          </select>
        </label>
      </div>
      <div class="companion-preview" data-preview hidden></div>
      <p class="companion-status" data-status role="status"></p>
      <div class="companion-buttons">
        <button type="submit" data-load>미리보기</button>
        <button type="button" data-apply>적용</button>
        <button type="button" data-summon disabled>소환</button>
      </div>
    </form>`;
  document.body.append(dialog);
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.setAttribute('aria-controls',dialog.id);

  const find=selector=>dialog.querySelector(selector);
  const form=find('form'), saved=find('[data-saved] select'), nickname=find('[name=nickname]'), apiKey=find('[name=apiKey]');
  const preview=find('[data-preview]'), status=find('[data-status]');
  const visitorNames=find('[name=visitors]');
  const mapSelect=find('[name=map]');
  const chairSelect=find('[name=chair]'), chairPreview=find('[data-chair-preview]');
  let selectedChair=defaultChair, chairs, chairRequest;
  try {selectedChair=localStorage.getItem(chairKey) || defaultChair;} catch {}

  function renderChair(){
    const entry=chairs?.[selectedChair];
    if (!entry) return;
    const {layers,offset}=entry;
    chair.classList.add('companion-chair-custom');
    chair.replaceChildren(...chairLayers(layers.filter(layer=>layer[5]<=0),chairScale));
    chairFront.replaceChildren(...chairLayers(layers.filter(layer=>layer[5]>0),chairScale));
    sprite.style.setProperty('--companion-chair-x',offset[0]*chairScale+'px');
    sprite.style.setProperty('--companion-chair-y',offset[1]*chairScale+'px');
    const bottom=Math.max(...layers.map(layer=>layer[2]+layer[4]));
    sprite.style.setProperty('--companion-chair-bottom',bottom*chairScale+'px');
  }
  function renderChairPreview(){
    const layers=chairs?.[chairSelect.value]?.layers;
    if (!layers) return;
    const left=Math.min(...layers.map(layer=>layer[1]));
    const top=Math.min(...layers.map(layer=>layer[2]));
    const right=Math.max(...layers.map(layer=>layer[1]+layer[3]));
    const bottom=Math.max(...layers.map(layer=>layer[2]+layer[4]));
    const scale=Math.min(chairScale,82/(right-left),66/(bottom-top));
    chairPreview.style.left=`calc(50% + ${-(left+right)*scale/2}px)`;
    chairPreview.style.top=`calc(50% + ${-(top+bottom)*scale/2}px)`;
    chairPreview.replaceChildren(...chairLayers(layers,scale));
  }
  function loadChairs(){
    chairRequest ??= fetch(new URL('chairs.json',chairAssets)).then(response=>{
      if (!response.ok) throw new Error('의자 목록을 불러오지 못했어.');
      return response.json();
    }).then(catalog=>{
      chairs=catalog;
      chairSelect.replaceChildren(...Object.entries(chairs).map(([id,entry])=>
        new Option(entry.name || (id===defaultChair ? '기본 의자 · '+id : id),id)));
      if (!Object.hasOwn(chairs,selectedChair)) selectedChair=defaultChair;
      chairSelect.value=selectedChair;
      renderChair();
      renderChairPreview();
    }).catch(()=>{
      chairRequest=null;
    });
  }
  chairSelect.addEventListener('change',()=>{
    renderChairPreview();
    if (!load.disabled) apply.disabled=false;
  });
  if (selectedChair!==defaultChair) loadChairs();
  let selectedMap='arcana';
  try {
    const savedMap=localStorage.getItem(mapKey);
    if ([...mapSelect.options].some(option=>option.value===savedMap)) selectedMap=savedMap;
  } catch {}
  ground.dataset.map=selectedMap;
  mapSelect.value=selectedMap;
  mapSelect.addEventListener('change',()=>{
    ground.dataset.map=mapSelect.value;
    try {localStorage.setItem(mapKey,mapSelect.value);} catch {}
    alignScene();
  });
  const load=find('[data-load]'), apply=find('[data-apply]'), summon=find('[data-summon]');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let settings=null;
  try { settings=JSON.parse(localStorage.getItem(settingsKey)); } catch {}
  let listed=[],candidate=null,frames=[],activeFrame=0,offset=0;
  let timer=0,animation=0,request=0,hasRested=false;
  let visitTimer=0,visitRevision=0,visitPending=false,visitorKept=false;
  let guestFrames=null,visitorX=0,menuForVisitor=false,idleCount=0,lastIdle=-1;
  let guestTimer=0,guestAnimation=0,standingTimer=0,standingIndex=0,greeted=false;
  const cachedVisitors=new Map();
  let pose='walk';
  const canWalk=()=>settings?.visible && frames.length && !document.hidden && !reducedMotion.matches &&
    pose==='walk' && menu.hidden;
  const guestCanWalk=()=>!visitor.hidden && !document.hidden && !reducedMotion.matches &&
    visitor.dataset.pose==='walk' && menu.hidden;

  function save(){
    try {localStorage.setItem(settingsKey,JSON.stringify(settings));} catch {}
  }
  function showFrame(index){
    if (!frames[index]) return;
    frames[activeFrame].hidden=true;
    frames[index].hidden=false;
    activeFrame=index;
  }
  function place(){
    sprite.style.setProperty('--companion-x',offset+'px');
  }
  function stopVisits(){
    clearTimeout(visitTimer);
    stopGuestWalk();
    visitTimer=0;
    visitRevision++;
    visitPending=false;
    visitorKept=false;
    visitor.hidden=true;
    visitorBalloon.hide();
    guestFrames=null;
    if (menuForVisitor) menu.hidden=true;
  }
  function queueVisit(delay){
    if (visitTimer || visitPending || !visitor.hidden || sprite.hidden || document.hidden || !settings?.visitors?.length) return;
    visitTimer=setTimeout(showVisitor,delay);
  }
  async function showVisitor(){
    visitTimer=0;
    const names=settings?.visitors;
    if (sprite.hidden || document.hidden || !names?.length) return;
    const revision=visitRevision;
    const name=names[Math.floor(Math.random()*names.length)];
    visitPending=true;
    try {
      let guest=cachedVisitors.get(name);
      if (!guest) {
        const appearance=getSchedulerCharacters().find(character=>character.name===name && character.image) ??
          await fetchCharacterAppearance(name,localStorage.getItem(apiKeyName) || '');
        const images=await preloadFrames(appearance.image);
        guest={name:appearance.name,images};
        cachedVisitors.set(name,guest);
      }
      if (revision!==visitRevision || document.hidden) return;
      const {left,right}=walkBounds();
      visitorX=right-offset>=145 ? offset+145 : Math.max(left,offset-145);
      visitor.style.setProperty('--companion-x',visitorX+'px');
      visitor.dataset.direction=visitorX<offset ? 'right' : 'left';
      guestFrames=guest.images;
      setVisitorPose('walk');
      visitorBalloon.name.textContent=guest.name+' :';
      visitor.replaceChildren(visitorChair,...guestFrames,visitorBalloon.node,visitorHitbox);
      visitor.hidden=false;
      visitorBalloon.show('잠깐 놀러 왔어!');
      guestTimer=setTimeout(()=>walk(true),1800);
      visitTimer=setTimeout(sendVisitorAway,30000);
    } catch {
      // An unavailable guest leaves the summoned character in place.
    } finally {
      if (revision===visitRevision) {
        visitPending=false;
        queueVisit(45000+Math.random()*45000);
      }
    }
  }
  function setVisitorPose(action){
    visitor.dataset.pose=action;
    showGuestFrame(action==='sit' ? 5 : action==='prone' ? 6 : 0);
  }
  function showGuestFrame(index){
    guestFrames?.forEach((frame,i)=>{frame.hidden=i!==index;});
  }
  function stopGuestWalk(){
    clearTimeout(guestTimer);
    cancelAnimationFrame(guestAnimation);
    guestAnimation=0;
    if (visitor.dataset.pose==='walk') showGuestFrame(0);
  }
  function sendVisitorAway(){
    stopVisits();
    queueVisit(45000+Math.random()*45000);
    sync();
  }
  function stop(){
    clearTimeout(timer);
    cancelAnimationFrame(animation);
    animation=0;
    showFrame(pose==='sit' ? 5 : pose==='prone' ? 6 : 0);
  }
  function rest(duration){
    showFrame(0);
    hasRested=true;
    if (idleCount++%3===0) speakIdle();
    timer=setTimeout(walk,duration);
  }
  function speakIdle(){
    if (!balloon.node.hidden) return;
    const index=lastIdle<0 ? Math.floor(Math.random()*idleLines.length) :
      (lastIdle+1+Math.floor(Math.random()*(idleLines.length-1)))%idleLines.length;
    lastIdle=index;
    balloon.show(idleLines[index]);
  }
  function scheduleStationarySpeech(){
    timer=setTimeout(()=>{
      speakIdle();
      scheduleStationarySpeech();
    },12000+Math.random()*8000);
  }
  function walkBounds(){
    const width=document.documentElement.clientWidth;
    const platform=platforms[ground.dataset.map];
    if (platform) {
      const scale=Math.min(width,platform.maxWidth ?? width)/platform.width;
      const start=(width-scale*platform.width)/(platform.centered ? 2 : 1);
      return {left:start+platform.left*scale,right:start+platform.right*scale};
    }
    const margin=Math.min(80,width/3);
    return {left:margin,right:width-margin};
  }
  function walk(guest=false){
    const allowed=guest ? guestCanWalk : canWalk;
    if (!allowed()) return;
    const from=guest ? visitorX : offset;
    const {left,right}=walkBounds();
    const minDistance=Math.min(96,(right-left)/3);
    const leftRange=Math.max(0,from-minDistance-left);
    const rightRange=Math.max(0,right-from-minDistance);
    if (!leftRange && !rightRange) return;
    const choice=Math.random()*(leftRange+rightRange);
    const to=choice<leftRange ? left+choice : from+minDistance+choice-leftRange;
    if (from===to) return;
    const duration=Math.max(400,Math.abs(to-from)*9);
    const character=guest ? visitor : sprite;
    const displayFrame=guest ? showGuestFrame : showFrame;
    character.dataset.direction=to<from ? 'left' : 'right';
    let start;
    function nextFrame(){
      const id=requestAnimationFrame(step);
      if (guest) guestAnimation=id;
      else animation=id;
    }
    function step(now){
      if (guest) guestAnimation=0;
      else animation=0;
      if (!allowed()) return;
      start ??= now;
      const elapsed=now-start;
      const x=from+(to-from)*Math.min(1,elapsed/duration);
      if (guest) visitorX=x;
      else offset=x;
      character.style.setProperty('--companion-x',x+'px');
      if (elapsed>=duration) {
        const delay=2500+Math.random()*3000;
        if (guest) {
          showGuestFrame(0);
          guestTimer=setTimeout(()=>walk(true),delay);
        } else rest(delay);
      } else {
        displayFrame(1+Math.floor(elapsed/frameMs)%4);
        nextFrame();
      }
    }
    nextFrame();
  }
  function sync(){
    stop();
    stopGuestWalk();
    clearInterval(standingTimer);
    sprite.hidden=!settings?.visible || !frames.length;
    ground.hidden=sprite.hidden;
    document.body.classList.toggle('companion-visible',!sprite.hidden);
    document.body.dataset.companionMap=sprite.hidden ? '' : ground.dataset.map;
    if (sprite.hidden || document.hidden) {
      if (sprite.hidden) stopVisits();
      balloon.hide();
      visitorBalloon.hide();
    } else {
      queueVisit(18000+Math.random()*12000);
    }
    if (sprite.hidden || document.hidden) menu.hidden=true;
    sprite.dataset.pose=pose;
    summon.disabled=!settings?.name;
    summon.textContent=settings?.visible ? '소환 해제' : '소환';
    if (canWalk()) {
      if (!hasRested) rest(2800);
      else timer=setTimeout(walk,850);
    } else if (!sprite.hidden && !document.hidden && menu.hidden) {
      scheduleStationarySpeech();
    }
    if (guestCanWalk()) guestTimer=setTimeout(()=>walk(true),850);
    if (!sprite.hidden && !document.hidden && !reducedMotion.matches) {
      standingTimer=setInterval(()=>{
        const frame=standingFrames[++standingIndex%standingFrames.length];
        if (pose==='walk' && !animation) showFrame(frame);
        if (!visitor.hidden && visitor.dataset.pose==='walk' && !guestAnimation) showGuestFrame(frame);
      },330);
    }
    if (!greeted && !sprite.hidden && !document.hidden) {
      greeted=true;
      balloon.show('안녕! 기다렸어!');
    }
  }
  function install(images){
    stop();
    stopVisits();
    balloon.hide();
    frames=images;
    activeFrame=0;
    hasRested=false;
    idleCount=0;
    pose='walk';
    menu.hidden=true;
    offset=walkBounds().right;
    place();
    sprite.dataset.direction='left';
    balloon.name.textContent=settings.name+' :';
    sprite.replaceChildren(chair,...images,chairFront,balloon.node,hitbox);
    sync();
  }
  function speak(text){
    if (!sprite.hidden && !document.hidden) balloon.show(text);
  }
  onCompanionSpeech(speak);
  onVoiceStart(({text,channel})=>{
    const line=alarmLines[text] ?? ((channel==='janus' || channel==='fountain' || channel.startsWith('job-'))
      ? text.replace(/ 재설치$/,' 시간이 끝나버렸어') : text);
    speak(line);
  });

  function closeMenu(){
    if (menu.hidden) return;
    menu.hidden=true;
    sync();
  }
  document.addEventListener('contextmenu',event=>{
    if (sprite.hidden || dialog.open) return;
    const contains=box=>{
      const {left,right,top,bottom}=box.getBoundingClientRect();
      return event.clientX>=left && event.clientX<=right && event.clientY>=top && event.clientY<=bottom;
    };
    const hitsMain=contains(hitbox);
    const hitsVisitor=!visitor.hidden && contains(visitorHitbox);
    if (!hitsVisitor && !hitsMain) return;
    menuForVisitor=hitsVisitor && (!hitsMain || Math.abs(event.clientX-visitorX)<Math.abs(event.clientX-offset));
    event.preventDefault();
    const keep=menuButtons.get('keep');
    keep.hidden=!menuForVisitor || visitorKept;
    menuButtons.get('send').hidden=!menuForVisitor;
    const currentPose=menuForVisitor ? visitor.dataset.pose : pose;
    menuButtons.get('sit').hidden=currentPose==='sit';
    menuButtons.get('prone').hidden=currentPose==='prone';
    menuButtons.get('walk').hidden=currentPose==='walk';
    menu.hidden=false;
    stop();
    stopGuestWalk();
    menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
    menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';
    menu.querySelector('button:not([hidden])').focus({preventScroll:true});
  });
  menu.addEventListener('click',event=>{
    const action=event.target.dataset.pose;
    if (!action) return;
    if (menuForVisitor && !visitor.hidden) {
      if (action==='send') {sendVisitorAway();return;}
      if (action==='keep') {
        visitorKept=true;
        clearTimeout(visitTimer);
        visitTimer=0;
      } else setVisitorPose(action);
    } else if (action!=='keep' && action!=='send') pose=action;
    closeMenu();
  });
  document.addEventListener('pointerdown',event=>{if (!menu.contains(event.target)) closeMenu();});
  document.addEventListener('keydown',event=>{if (event.key==='Escape') closeMenu();});
  async function restore(){
    const current=settings;
    if (!current?.visible || !current.name) return;
    try {
      const appearance=Date.now()-current.updatedAt<refreshMs ? current :
        await fetchCharacterAppearance(current.name,localStorage.getItem(apiKeyName) || '');
      const images=await preloadFrames(appearance.image);
      if (settings!==current || !settings.visible) return;
      if (appearance!==current) {
        settings={...current,...appearance,updatedAt:Date.now()};
        save();
      }
      install(images);
    } catch {
      if (settings===current && dialog.open) status.textContent='저장한 캐릭터를 불러오지 못했어. 미리보기로 다시 연결해 줘.';
    }
  }

  function clearPreview(){
    request++;
    candidate=null;
    preview.replaceChildren();
    preview.hidden=true;
    apply.disabled=false;
    load.disabled=false;
    status.textContent='';
  }
  trigger.addEventListener('click',()=>{
    loadChairs();
    if (chairs) {
      chairSelect.value=selectedChair;
      renderChairPreview();
    }
    closeMenu();
    clearPreview();
    listed=getSchedulerCharacters();
    saved.replaceChildren(new Option('목록',''),
      ...listed.map(character=>new Option(character.name,character.name)));
    find('[data-saved]').hidden=!listed.length;
    nickname.value=settings?.name ?? '';
    visitorNames.value=settings?.visitors?.join(', ') ?? '';
    apiKey.value=localStorage.getItem(apiKeyName) || '';
    sync();
    dialog.showModal();
  });
  find('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if (event.target!==dialog) return;
    const {left,right,top,bottom}=dialog.getBoundingClientRect();
    if (event.clientX<left || event.clientX>right || event.clientY<top || event.clientY>bottom) dialog.close();
  });
  dialog.addEventListener('close',clearPreview);
  saved.addEventListener('change',()=>{
    if (saved.value) nickname.value=saved.value;
    saved.value='';
    clearPreview();
  });
  nickname.addEventListener('input',clearPreview);
  apiKey.addEventListener('input',clearPreview);
  visitorNames.addEventListener('input',()=>{if (!load.disabled) apply.disabled=false;});
  summon.addEventListener('click',()=>{
    if (!settings?.name) return;
    settings={...settings,visible:!settings.visible};
    save();
    sync();
    if (settings.visible) {
      if (!frames.length) void restore();
      dialog.close();
    }
  });
  async function loadCharacter(showPreview){
    clearPreview();
    const version=request,name=nickname.value.trim(),key=apiKey.value.trim();
    if (!name) {status.textContent='닉네임을 입력해 줘.';return;}
    const existing=listed.find(character=>character.name===name && character.image);
    if (!existing && !key) {status.textContent='넥슨 API 키를 입력해 줘.';return;}
    load.disabled=true;
    apply.disabled=true;
    try {
      const appearance=existing ?? await fetchCharacterAppearance(name,key);
      const images=await preloadFrames(appearance.image);
      if (showPreview) {
        const image=new Image();
        image.src=appearance.image;
        image.alt=appearance.name;
        await image.decode();
        if (version!==request) return null;
        preview.replaceChildren(image);
        preview.hidden=false;
      }
      if (version!==request) return null;
      candidate={appearance,images,key};
      return candidate;
    } catch(error) {
      if (version===request) status.textContent=error.message || '캐릭터를 불러오지 못했어.';
    } finally {
      if (version===request) {
        load.disabled=false;
        apply.disabled=false;
      }
    }
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    void loadCharacter(true);
  });
  apply.addEventListener('click',async ()=>{
    const name=nickname.value.trim();
    const keyInput=apiKey.value.trim();
    const savedKey=localStorage.getItem(apiKeyName) || '';
    const visitors=[...new Set(visitorNames.value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean))]
      .filter(visitorName=>visitorName!==name).slice(0,10);
    if (chairs?.[chairSelect.value] && chairSelect.value!==selectedChair) {
      selectedChair=chairSelect.value;
      try {localStorage.setItem(chairKey,selectedChair);} catch {}
      renderChair();
      if (!name || (name===settings?.name && keyInput===savedKey &&
          JSON.stringify(visitors)===JSON.stringify(settings.visitors ?? []))) {
        status.textContent='의자를 적용했어.';
        return;
      }
    }
    const existing=name===settings?.name && frames.length && keyInput===savedKey
      ? {appearance:{name:settings.name,image:settings.image},images:frames,key:keyInput}
      : null;
    const selected=candidate ?? existing ?? await loadCharacter(false);
    if (!selected) return;
    const {appearance,images,key}=selected;
    const sameCharacter=appearance.name===settings?.name;
    settings={...appearance,visitors,
      visible:sameCharacter && Boolean(settings.visible),updatedAt:Date.now()};
    save();
    try {if (key) localStorage.setItem(apiKeyName,key);} catch {}
    if (images!==frames) install(images);
    else {stopVisits();sync();}
    apply.disabled=true;
    status.textContent=settings.visible ? '캐릭터 설정을 저장했어.' : '캐릭터를 저장했어. 소환을 누르면 화면에 나타나.';
  });
  document.addEventListener('visibilitychange',sync);
  reducedMotion.addEventListener('change',sync);
  function alignScene(){
    const width=document.documentElement.clientWidth;
    const platform=platforms[ground.dataset.map];
    ground.classList.toggle('companion-platform',Boolean(platform));
    if (platform) {
      const maxWidth=platform.maxWidth ? platform.maxWidth+'px' : '100%';
      ground.style.setProperty('--platform-width',maxWidth);
      ground.style.setProperty('--platform-ratio',platform.width+' / '+platform.height);
      document.body.style.setProperty('--companion-backdrop-width',maxWidth);
      document.body.style.setProperty('--companion-backdrop-ratio',platform.width+' / '+platform.height);
    }
    const lift=platform ? (platform.height-platform.y)*Math.min(width,platform.maxWidth ?? width)/platform.width-14 : 0;
    document.body.style.setProperty('--companion-lift',lift+'px');
    for(const character of [sprite,visitor]) character.style.setProperty('--companion-lift',lift+'px');
    const {left,right}=walkBounds();
    offset=frames.length ? Math.max(left,Math.min(right,offset)) : right;
    if (!visitor.hidden) {
      visitorX=Math.max(left,Math.min(right,visitorX));
      visitor.style.setProperty('--companion-x',visitorX+'px');
    }
    place();
    sync();
  }
  window.addEventListener('resize',alignScene);
  alignScene();
  void restore();
}
