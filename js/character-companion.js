import {fetchCharacterAppearance} from './core/nexon.js';
import {getSchedulerCharacters} from './tabs/scheduler.js';
import {onVoiceStart} from './core/notify.js';

const settingsKey='ddangkaera-character-companion';
const mapKey='ddangkaera-companion-map';
const apiKeyName='nexon_api_key';
const refreshMs=24*60*60*1000;
const frameMs=130;
const platforms={
  crane:{width:1241,height:698,maxWidth:745,left:380,right:930,y:437},
  mapleHill:{width:1818,height:1022,maxWidth:1000,left:175,right:1190,y:925},
  temple:{width:1480,height:870,maxWidth:1050,left:150,right:1325,y:699,centered:true}
};
const idleLines=[
  '여기서 잠깐 쉬어갈까?',
  '오늘도 한 걸음씩!',
  '잔디가 푹신해서 걷기 좋네.',
  '이쪽 길도 한번 가볼까?',
  '조금 쉬었다 다시 출발하자!',
  '같이 산책하니까 좋다.'
];

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
const preloadFrames=source=>Promise.all(['A00.0','A02.0','A02.1','A02.2','A02.3','A07.0','A04.0']
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
  const hitbox=document.createElement('span');
  hitbox.className='companion-hitbox';
  const menu=document.createElement('div');
  menu.className='companion-menu';
  menu.hidden=true;
  menu.setAttribute('aria-label','캐릭터 동작');
  const menuButtons=new Map();
  for(const [pose,label] of [['sit','앉기'],['prone','엎드리기'],['walk','다시 걷기'],['keep','계속 두기']]) {
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
  const cachedVisitors=new Map();
  let pose='walk';
  const canWalk=()=>settings?.visible && frames.length && !document.hidden && !reducedMotion.matches &&
    pose==='walk' && menu.hidden && (visitor.hidden || visitorKept);

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
        const images=await Promise.all(['A00.0','A07.0','A04.0'].map(action=>loadFrame(appearance.image,action)));
        guest={name:appearance.name,images};
        cachedVisitors.set(name,guest);
      }
      if (revision!==visitRevision) return;
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
      stop();
      visitTimer=setTimeout(sendVisitorAway,12000);
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
    const index=action==='sit' ? 1 : action==='prone' ? 2 : 0;
    visitor.dataset.pose=action;
    guestFrames?.forEach((frame,i)=>{frame.hidden=i!==index;});
  }
  function sendVisitorAway(){
    stopVisits();
    queueVisit(45000+Math.random()*45000);
    sync();
  }
  function stop(){
    clearTimeout(timer);
    cancelAnimationFrame(animation);
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
      const scale=Math.min(width,platform.maxWidth)/platform.width;
      const start=(width-scale*platform.width)/(platform.centered ? 2 : 1);
      return {left:start+platform.left*scale,right:start+platform.right*scale};
    }
    const margin=Math.min(80,width/3);
    return {left:margin,right:width-margin};
  }
  function walk(){
    if (!canWalk()) return;
    const from=offset;
    const {left,right}=walkBounds();
    const minDistance=Math.min(96,(right-left)/3);
    const leftRange=Math.max(0,from-minDistance-left);
    const rightRange=Math.max(0,right-from-minDistance);
    const choice=Math.random()*(leftRange+rightRange);
    const to=choice<leftRange ? left+choice : from+minDistance+choice-leftRange;
    if (from===to) return;
    const duration=Math.max(400,Math.abs(to-from)*9);
    sprite.dataset.direction=to<from ? 'left' : 'right';
    let start;
    function step(now){
      if (!canWalk()) return;
      start ??= now;
      const elapsed=now-start;
      offset=from+(to-from)*Math.min(1,elapsed/duration);
      place();
      if (elapsed>=duration) {
        rest(2500+Math.random()*3000);
      } else {
        showFrame(1+Math.floor(elapsed/frameMs)%4);
        animation=requestAnimationFrame(step);
      }
    }
    animation=requestAnimationFrame(step);
  }
  function sync(){
    stop();
    sprite.hidden=!settings?.visible || !frames.length;
    ground.hidden=sprite.hidden;
    document.body.classList.toggle('companion-visible',!sprite.hidden);
    document.body.dataset.companionMap=sprite.hidden ? '' : ground.dataset.map;
    if (sprite.hidden || document.hidden) {
      if (sprite.hidden || !visitorKept) stopVisits();
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
    sprite.replaceChildren(chair,...images,balloon.node,hitbox);
    sync();
  }
  onVoiceStart(({text})=>{
    if (sprite.hidden || document.hidden) return;
    balloon.show(text);
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
    menuForVisitor=!visitor.hidden && contains(visitorHitbox) &&
      (!contains(hitbox) || Math.abs(event.clientX-visitorX)<Math.abs(event.clientX-offset));
    if (!menuForVisitor && !contains(hitbox)) return;
    event.preventDefault();
    const keep=menuButtons.get('keep');
    keep.hidden=!menuForVisitor;
    keep.textContent=visitorKept ? '보내기' : '계속 두기';
    menuButtons.get('walk').textContent=menuForVisitor ? '일어서기' : '다시 걷기';
    menu.hidden=false;
    stop();
    menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
    menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';
    menu.firstElementChild.focus({preventScroll:true});
  });
  menu.addEventListener('click',event=>{
    const action=event.target.dataset.pose;
    if (!action) return;
    if (menuForVisitor && !visitor.hidden) {
      if (action==='keep') {
        if (visitorKept) {sendVisitorAway();return;}
        visitorKept=true;
        clearTimeout(visitTimer);
        visitTimer=0;
      } else setVisitorPose(action);
    } else if (action!=='keep') pose=action;
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
    const existing=name===settings?.name && frames.length && apiKey.value.trim()===(localStorage.getItem(apiKeyName) || '')
      ? {appearance:{name:settings.name,image:settings.image},images:frames,key:apiKey.value.trim()}
      : null;
    const selected=candidate ?? existing ?? await loadCharacter(false);
    if (!selected) return;
    const visitors=[...new Set(visitorNames.value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean))];
    const {appearance,images,key}=selected;
    const sameCharacter=appearance.name===settings?.name;
    settings={...appearance,visitors:visitors.filter(name=>name!==appearance.name).slice(0,10),
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
      ground.style.setProperty('--platform-width',platform.maxWidth+'px');
      ground.style.setProperty('--platform-ratio',platform.width+' / '+platform.height);
      document.body.style.setProperty('--companion-backdrop-width',platform.maxWidth+'px');
      document.body.style.setProperty('--companion-backdrop-ratio',platform.width+' / '+platform.height);
    }
    const lift=platform ? (platform.height-platform.y)*Math.min(width,platform.maxWidth)/platform.width-14 : 0;
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
