import {fetchCharacterAppearance} from './core/nexon.js';
import {getSchedulerCharacters} from './tabs/scheduler.js';
import {onCompanionSpeech,onVoiceStart} from './core/notify.js';
import {mapFooting} from './companion-footing.js';

import {mountPlaza} from './plaza.js';

const settingsKey='ddangkaera-character-companion';
const mapKey='ddangkaera-companion-map';
const chairKey='ddangkaera-companion-chair';
const defaultChair='03010001';
const chairAssets=new URL('../img/item/chair/03010/',import.meta.url);
const chairScale=72/41;
const apiKeyName='nexon_api_key';
const refreshMs=24*60*60*1000;
const frameMs=130;
const jumpDurationMs=380;
// Positions are relative to the exported map's top-left corner.
const spiritTreeRopes=[
  {x:522,left:249,right:571,rise:300},
  {x:2790,left:2319,right:2821,rise:420}
];
const walkConnection=0, jumpConnection=1;
const footingCosts=[1,12,3,3];
const footingY=([left,y,right,endY],x)=>y+(endY-y)*Math.max(0,Math.min(1,(x-left)/(right-left)));
const platforms={
  spiritTree:{width:3326,height:880,left:110,right:3216,y:704,foregroundTop:269,centered:true},
  eurel:{width:3984,height:1650,left:110,right:3874,y:1460,foregroundTop:783,centered:true},
  edelstein:{width:4588,height:1841,left:130,right:4458,y:1651,foregroundTop:180,centered:true},
  ludibrium:{width:5385,height:1428,left:130,right:5255,y:1230,foregroundTop:142,centered:true},
  kerning:{width:3870,height:1540,left:475,right:3395,y:1366,foregroundTop:132,centered:true},
  nautilus:{width:4613,height:1557,left:130,right:4483,y:1505,foregroundTop:252,centered:true}
};
const mapImages={
  nautilus:'nautilus',ludibrium:'ludibrium',spiritTree:'arcana-spirit-tree-background',
  edelstein:'edelstein',eurel:'eurel',kerning:'kerning-city'
};
const idleLines=[
  '같이 산책하니까 좋다.',
  '너무 무리하지마!',
  '내가 있으닌까 좋지?'
];
const alarmLines={
  '예인 재설치':'예인이 1개 남았어! 다시 설치해줘!',
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

function makePlazaName(name){
  const label=document.createElement('span');
  label.className='companion-plaza-name';
  label.textContent=name;
  return label;
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

  const settingsPopup=document.createElement('div');
  settingsPopup.id='characterCompanionSettings';
  settingsPopup.className='companion-settings';
  settingsPopup.popover='auto';
  settingsPopup.innerHTML=`
    <nav class="companion-quick-menu" aria-label="캐릭터 설정 메뉴">
      <button type="button" data-open-section="character">캐릭터 관리</button>
      <button type="button" data-open-section="map">맵 관리</button>
      <button type="button" data-open-section="plaza">광장</button>
    </nav>
    <section class="companion-form" data-settings-body aria-labelledby="companionTitle" hidden>
      <div class="companion-heading">
        <h2 id="companionTitle">캐릭터 설정</h2>
        <button type="button" data-close aria-label="닫기">×</button>
      </div>
      <div class="companion-sections" role="tablist" aria-label="캐릭터 설정 탭">
        <button type="button" class="tab-btn" role="tab" id="companion-character-tab" aria-controls="companion-character-panel" data-section="character">캐릭터 관리</button>
        <button type="button" class="tab-btn" role="tab" id="companion-map-tab" aria-controls="companion-map-panel" data-section="map">맵 관리</button>
        <button type="button" class="tab-btn" role="tab" id="companion-plaza-tab" aria-controls="companion-plaza-panel" data-section="plaza">광장</button>
      </div>
      <div role="tabpanel" id="companion-character-panel" aria-labelledby="companion-character-tab" data-panel="character" hidden>
      <form class="companion-form">
      <label>넥슨 API 키 <input name="apiKey" type="password" autocomplete="off" spellcheck="false"></label>
      <div class="companion-preview" data-preview hidden></div>
      <div class="companion-nickname">
        <label for="companionNickname">캐릭터 닉네임</label>
        <div class="companion-nickname-field">
          <input id="companionNickname" name="nickname" type="text" required maxlength="30" autocomplete="off">
          <button type="button" data-list-toggle aria-label="저장된 캐릭터 목록" aria-expanded="false" aria-controls="companionSaved"><span class="companion-select-arrow" aria-hidden="true">▾</span></button>
          <div id="companionSaved" data-saved popover="manual" hidden></div>
        </div>
        <button type="submit" data-load>미리보기</button>
      </div>
      <label>방문 캐릭터 닉네임 <input name="visitors" type="text" maxlength="200" placeholder="닉네임을 쉼표로 구분" autocomplete="off"></label>
      <div class="companion-chair-setting">
        <div class="companion-chair-preview" role="img" aria-label="의자 미리보기">
          <div data-chair-preview></div>
        </div>
        <div class="companion-chair-picker">
          <span id="companionChairLabel">의자</span>
          <select name="chair" hidden aria-hidden="true" tabindex="-1">
            <option value="03010001">기본 의자 · 03010001</option>
          </select>
          <button type="button" data-chair-toggle aria-labelledby="companionChairLabel companionChairValue" aria-haspopup="listbox" aria-expanded="false" aria-controls="companionChairs">
            <span id="companionChairValue">기본 의자 · 03010001</span><span class="companion-select-arrow" aria-hidden="true">▾</span>
          </button>
          <div id="companionChairs" role="listbox" aria-labelledby="companionChairLabel" popover="manual" hidden></div>
        </div>
      </div>
      <p class="companion-status" data-status role="status"></p>
      <div class="companion-buttons">
        <button type="button" data-apply>적용</button>
        <button type="button" data-summon disabled>소환</button>
      </div>
      </form>
      </div>
      <section class="companion-form" role="tabpanel" id="companion-map-panel" aria-labelledby="companion-map-tab" data-panel="map" hidden>
        <div class="companion-map-preview">
          <img data-map-preview alt="" hidden>
          <span data-no-map>선택한 맵이 없어요.</span>
        </div>
      <label>맵
        <select name="map">
          <option value="none">없음</option>
          <option value="nautilus">노틸러스</option>
          <option value="ludibrium">루디브리엄</option>
          <option value="spiritTree">아르카나 : 정령의 나무가 있는 곳</option>
          <option value="edelstein">에델슈타인</option>
          <option value="eurel">요정의 숲 : 에우렐</option>
          <option value="kerning">커닝시티</option>
        </select>
      </label>
        <p class="companion-status" data-map-status role="status"></p>
        <div class="companion-buttons"><button type="button" data-apply-map>적용</button></div>
      </section>
      <section class="companion-form" role="tabpanel" id="companion-plaza-panel" aria-labelledby="companion-plaza-tab" data-panel="plaza" hidden>
        <div class="companion-plaza-room">
          <strong>광장 1</strong>
          <span data-plaza-count aria-label="광장 인원">–/10</span>
          <button type="button" data-plaza-toggle disabled>입장</button>
        </div>
        <p class="companion-status" data-plaza-status role="status">저장한 캐릭터로 광장에 입장할 수 있어요.</p>
      </section>
    </section>`;
  document.body.append(settingsPopup);
  trigger.popoverTargetElement=settingsPopup;
  trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-controls',settingsPopup.id);

  const find=selector=>settingsPopup.querySelector(selector);
  const form=find('form'), saved=find('[data-saved]'), listToggle=find('[data-list-toggle]'), nickname=find('[name=nickname]'), apiKey=find('[name=apiKey]');
  const preview=find('[data-preview]'), status=find('[data-status]');
  const visitorNames=find('[name=visitors]');
  const mapSelect=find('[name=map]');
  const chairSelect=find('[name=chair]'), chairPreview=find('[data-chair-preview]');
  const chairToggle=find('[data-chair-toggle]'), chairList=find('#companionChairs');
  const chairValue=find('#companionChairValue'), chairPicker=find('.companion-chair-picker');
  function positionChoiceList(list,anchor){
    const rect=anchor.getBoundingClientRect();
    const width=Math.min(rect.width,window.innerWidth-16);
    const below=window.innerHeight-rect.bottom-12;
    const above=rect.top-12;
    const upward=below<80 && above>below;
    const height=Math.max(0,Math.min(180,upward ? above : below));
    list.style.width=width+'px';
    list.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
    list.style.maxHeight=height+'px';
    list.style.top=upward ? 'auto' : rect.bottom+4+'px';
    list.style.bottom=upward ? window.innerHeight-rect.top+4+'px' : 'auto';
  }
  function toggleChoiceList(list,anchor,open){
    if (open) {
      list.hidden=false;
      positionChoiceList(list,anchor);
      if (!list.matches(':popover-open')) list.showPopover();
    } else {
      if (list.matches(':popover-open')) list.hidePopover();
      list.hidden=true;
    }
  }
  function repositionChoiceLists(){
    if (!chairList.hidden) positionChoiceList(chairList,chairToggle);
    if (!saved.hidden) positionChoiceList(saved,nickname);
  }
  window.addEventListener('resize',repositionChoiceLists);
  window.addEventListener('scroll',event=>{
    if (event.target!==chairList && event.target!==saved) repositionChoiceLists();
  },true);
  function setChairListOpen(open){
    toggleChoiceList(chairList,chairToggle,open);
    chairToggle.setAttribute('aria-expanded',String(open));
    if (open) setListOpen(false);
  }
  function syncChairPicker(){
    chairValue.textContent=chairSelect.selectedOptions[0]?.textContent ?? '';
    chairList.replaceChildren(...[...chairSelect.options].map(option=>{
      const item=document.createElement('button');
      item.type='button';
      item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(option.selected));
      item.tabIndex=-1;
      item.textContent=option.textContent;
      item.addEventListener('click',()=>{
        chairSelect.value=option.value;
        chairSelect.dispatchEvent(new Event('change'));
        setChairListOpen(false);
        chairToggle.focus();
      });
      return item;
    }));
  }
  chairToggle.addEventListener('click',()=>setChairListOpen(chairList.hidden));
  chairPicker.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !chairList.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setChairListOpen(false);
      chairToggle.focus();
      return;
    }
    if (event.key==='Tab') {setChairListOpen(false);return;}
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const items=[...chairList.children];
    if (!items.length) return;
    const index=items.indexOf(document.activeElement);
    let next=index<0 ? Math.max(0,items.findIndex(item=>item.getAttribute('aria-selected')==='true'))
      : (index+(event.key==='ArrowUp' ? -1 : 1)+items.length)%items.length;
    if (event.key==='Home') next=0;
    if (event.key==='End') next=items.length-1;
    setChairListOpen(true);
    items[next].focus();
  });
  chairPicker.addEventListener('focusout',event=>{
    if (!chairPicker.contains(event.relatedTarget)) setChairListOpen(false);
  });
  syncChairPicker();
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
      syncChairPicker();
      renderChair();
      renderChairPreview();
    }).catch(()=>{
      chairRequest=null;
    });
  }
  chairSelect.addEventListener('change',()=>{
    syncChairPicker();
    renderChairPreview();
    if (!load.disabled) apply.disabled=false;
  });
  if (selectedChair!==defaultChair) loadChairs();
  let selectedMap='spiritTree';
  try {
    const savedMap=localStorage.getItem(mapKey);
    if ([...mapSelect.options].some(option=>option.value===savedMap)) selectedMap=savedMap;
  } catch {}
  ground.dataset.map=selectedMap;
  mapSelect.value=selectedMap;
  const mapStatus=find('[data-map-status]'), mapPreview=find('[data-map-preview]');
  function renderMapPreview(){
    const image=mapImages[mapSelect.value];
    mapPreview.hidden=!image;
    find('[data-no-map]').hidden=Boolean(image);
    if (image) {
      mapPreview.src=new URL(`../img/map/${image}.png`,import.meta.url).href;
      mapPreview.alt=mapSelect.selectedOptions[0].textContent;
    }
  }
  mapSelect.addEventListener('change',()=>{
    mapStatus.textContent='';
    renderMapPreview();
  });
  find('[data-apply-map]').addEventListener('click',()=>{
    if (mapSelect.value!==ground.dataset.map) {
      ground.dataset.map=mapSelect.value;
      upperPlatforms.clear();
      footingPositions.clear();
      try {localStorage.setItem(mapKey,mapSelect.value);} catch {}
      alignScene();
    }
    mapStatus.textContent='맵을 적용했어요.';
  });
  const load=find('[data-load]'), apply=find('[data-apply]'), summon=find('[data-summon]');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let settings=null;
  try { settings=JSON.parse(localStorage.getItem(settingsKey)); } catch {}
  let listed=[],candidate=null,frames=[],activeFrame=0,offset=0;
  let timer=0,animation=0,request=0,hasRested=false;
  let visitTimer=0,visitRevision=0,visitPending=false,visitorKept=false;
  let visitorLeaving=false;
  let guestFrames=null,visitorX=0,menuForVisitor=false,idleCount=0,lastIdle=-1;
  let guestTimer=0,guestAnimation=0,standingTimer=0,standingIndex=0,greeted=false;
  const cachedVisitors=new Map();
  const upperPlatforms=new Map();
  const footingPositions=new Map();
  const ropeImages=new WeakMap();
  const jumpImages=new WeakMap();
  const ladderImages=new WeakMap();
  const swimImages=new WeakMap();
  let pose='walk', plazaSelf=null;
  const plazaGuests=new Map();
  const plazaMessage=makeBalloon();
  plazaMessage.node.classList.add('companion-plaza-message');
  const plazaName=makePlazaName('');
  plazaName.hidden=true;
  const plaza=mountPlaza(find('[data-panel=plaza]'),()=>settings,{
    onJoin(){
      if (settingsPopup.matches(':popover-open') && settingsPopup.dataset.section==='plaza') settingsPopup.hidePopover();
    },
    onLeave:leavePlaza,
    renderMembers:renderPlazaMembers,
    showChat(id,text){
      if (id===plazaSelf) plazaMessage.show(text);
      else plazaGuests.get(id)?.balloon.show(text);
    }
  });
  const selfActor={
    element:sprite,showFrame,canWalk:()=>canWalk(),
    get images(){return frames;},
    get x(){return offset;},set x(value){offset=value;},
    get animation(){return animation;},set animation(value){animation=value;},
    rest(delay,swimming){if (swimming) timer=setTimeout(walk,delay);else rest(delay);}
  };
  const visitorActor={
    element:visitor,showFrame:showGuestFrame,canWalk:()=>guestCanWalk(),
    get images(){return guestFrames;},
    get x(){return visitorX;},set x(value){visitorX=value;},
    get animation(){return guestAnimation;},set animation(value){guestAnimation=value;},
    rest(delay){guestTimer=setTimeout(()=>walk(visitorActor),delay);}
  };
  const canWalk=()=>isSummoned() && frames.length && !document.hidden && !reducedMotion.matches &&
    pose==='walk' && menu.hidden;
  const guestCanWalk=()=>!visitor.hidden && !visitorLeaving && !document.hidden && !reducedMotion.matches &&
    visitor.dataset.pose==='walk' && menu.hidden;

  const isSummoned=()=>Boolean(plazaSelf || settings?.visible);

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
    visitorLeaving=false;
    visitor.hidden=true;
    upperPlatforms.delete(visitor);
    footingPositions.delete(visitor);
    visitorBalloon.hide();
    guestFrames=null;
    if (menuForVisitor) menu.hidden=true;
  }
  function queueVisit(delay){
    if (plazaSelf || visitTimer || visitPending || !visitor.hidden || sprite.hidden || document.hidden || !settings?.visitors?.length) return;
    visitTimer=setTimeout(showVisitor,delay);
  }
  async function showVisitor(){
    visitTimer=0;
    const names=settings?.visitors;
    if (plazaSelf || sprite.hidden || document.hidden || !names?.length) return;
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
      setElevation(visitor,0);
      visitorBalloon.name.textContent=guest.name+' :';
      visitor.replaceChildren(visitorChair,...guestFrames,visitorBalloon.node,visitorHitbox);
      visitor.hidden=false;
      visitorBalloon.show('잠깐 놀러 왔어!');
      speak('반가워!');
      guestTimer=setTimeout(()=>walk(visitorActor),1800);
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
    settleFooting(visitorActor);
    setElevation(visitor);
    ropeImages.get(guestFrames)?.frames?.forEach(frame=>{frame.hidden=true;});
    jumpImages.get(guestFrames)?.frames?.forEach(frame=>{frame.hidden=true;});
    ladderImages.get(guestFrames)?.frames?.forEach(frame=>{frame.hidden=true;});
    swimImages.get(guestFrames)?.frames?.forEach(frame=>{frame.hidden=true;});
    delete visitor.dataset.swimming;
    if (visitor.dataset.pose==='walk') showGuestFrame(0);
  }
  function sendVisitorAway(){
    if (visitor.hidden || visitorLeaving) return;
    visitorLeaving=true;
    clearTimeout(visitTimer);
    stopGuestWalk();
    if (menuForVisitor) menu.hidden=true;
    if (!document.hidden) {
      visitorBalloon.show('잘있어!');
      speak('조심히가!');
    }
    visitTimer=setTimeout(()=>{
      stopVisits();
      queueVisit(45000+Math.random()*45000);
      sync();
    },2300);
    sync();
  }
  function stop(){
    clearTimeout(timer);
    cancelAnimationFrame(animation);
    animation=0;
    settleFooting(selfActor);
    setElevation(sprite);
    ropeImages.get(frames)?.frames?.forEach(frame=>{frame.hidden=true;});
    jumpImages.get(frames)?.frames?.forEach(frame=>{frame.hidden=true;});
    ladderImages.get(frames)?.frames?.forEach(frame=>{frame.hidden=true;});
    swimImages.get(frames)?.frames?.forEach(frame=>{frame.hidden=true;});
    delete sprite.dataset.swimming;
    showFrame(pose==='sit' ? 5 : pose==='prone' ? 6 : 0);
  }
  function rest(duration){
    showFrame(0);
    hasRested=true;
    if (idleCount++%3===0) speakIdle();
    timer=setTimeout(walk,duration);
  }
  function speakIdle(){
    if (plazaSelf || !balloon.node.hidden) return;
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
  function setElevation(character,rise=footingPositions.get(character)?.rise ?? upperPlatforms.get(character)?.rise ?? 0){
    const width=document.documentElement.clientWidth;
    character.style.setProperty('--companion-elevation',rise*width/(platforms[ground.dataset.map]?.width ?? width)+'px');
  }
  function getMovementImages(actor,cache,actions){
    const {images,element:character}=actor;
    if (!cache.has(images)) {
      const state={frames:null};
      cache.set(images,state);
      Promise.all(actions.map(action=>loadFrame(images[0].src,action))).then(loaded=>{
        state.frames=loaded;
        if (actor.images===images && character.isConnected) character.append(...loaded);
      }).catch(()=>{});
    }
    const loaded=cache.get(images).frames;
    if (loaded && loaded[0].parentElement!==character) character.append(...loaded);
    return loaded;
  }
  function walkBounds(upper){
    const width=document.documentElement.clientWidth;
    const platform=platforms[ground.dataset.map];
    if (platform) {
      const scale=Math.min(width,platform.maxWidth ?? width)/platform.width;
      const start=(width-scale*platform.width)/(platform.centered ? 2 : 1);
      return {left:start+(upper?.left ?? platform.left)*scale,right:start+(upper?.right ?? platform.right)*scale};
    }
    const margin=Math.min(80,width/3);
    return {left:margin,right:width-margin};
  }
  function placeFooting(actor,x){
    const map=platforms[ground.dataset.map];
    const screenX=x*document.documentElement.clientWidth/map.width;
    actor.x=screenX;
    actor.element.style.setProperty('--companion-x',screenX+'px');
  }
  function settleFooting(actor){
    const position=footingPositions.get(actor.element);
    if (position) placeFooting(actor,position.x);
  }
  function planFootingRoute(footing,position,poses,map){
    const {surfaces}=footing;
    const queues=[[position.id]];
    const costs=new Map([[position.id,0]]);
    const previous=new Map([[position.id,null]]);
    for (let cost=0;cost<queues.length;cost++) {
      for (const from of queues[cost] ?? []) {
        if (cost!==costs.get(from)) continue;
        for (const connection of surfaces[from][4]) {
          const [to,kind]=connection;
          if (kind!==walkConnection && !poses[kind]) continue;
          const nextCost=cost+footingCosts[kind];
          if (nextCost>=(costs.get(to) ?? Infinity)) continue;
          costs.set(to,nextCost);
          previous.set(to,{from,connection});
          (queues[nextCost] ??= []).push(to);
        }
      }
    }
    const candidates=[...previous.keys()].slice(1);
    const currentY=footingY(surfaces[position.id],position.x);
    const distant=candidates.filter(id=>{
      const [left,y,right]=surfaces[id];
      return Math.abs((left+right)/2-position.x)>map.width*.25 || Math.abs(y-currentY)>map.height*.23;
    });
    const destinations=distant.length ? distant : candidates;
    let goal=destinations[Math.floor(Math.random()*destinations.length)];
    const route=[];
    while (goal!==undefined && goal!==position.id) {
      const {from,connection}=previous.get(goal);
      route.push(connection);
      goal=from;
    }
    return route.reverse();
  }
  function walkOnFooting(actor,footing,continuedAt){
    const {element:character,images,showFrame:displayFrame,canWalk:allowed}=actor;
    const mapName=ground.dataset.map;
    const map=platforms[mapName];
    const scale=document.documentElement.clientWidth/map.width;
    let position=footingPositions.get(character);
    if (!position) {
      const x=actor.x/scale;
      const id=footing.start.find(id=>x>=footing.surfaces[id][0] && x<=footing.surfaces[id][2]) ?? footing.start[0];
      const [left,,right]=footing.surfaces[id];
      position={id,x:Math.max(left,Math.min(right,x)),rise:0,route:[]};
      footingPositions.set(character,position);
    }
    const current=footing.surfaces[position.id];
    const inWater=surface=>mapName==='nautilus' && surface[1]===map.y && surface[3]===map.y;
    const swimming=inWater(current);
    const swim=mapName==='nautilus' ? getMovementImages(actor,swimImages,['A05.0','A05.1']) : null;
    const riseAt=(surface,x)=>map.y-footingY(surface,x)+(inWater(surface) ? 62 : 0);
    const poses=[
      null,
      getMovementImages(actor,jumpImages,['A06.0']),
      mapName!=='eurel' ? getMovementImages(actor,ropeImages,['A09.0','A09.1']) : null,
      mapName!=='eurel' ? getMovementImages(actor,ladderImages,['A08.0','A08.1']) : null
    ];
    if (!position.route.length) position.route=planFootingRoute(footing,position,poses,map);
    const [id,kind,takeoff,landing]=position.route[0] ??
      [position.id,walkConnection,(current[0]+current[2])/2,(current[0]+current[2])/2];
    const target=footing.surfaces[id];
    const startX=position.x;
    const startRise=riseAt(current,takeoff);
    const endRise=riseAt(target,landing);
    const walkTime=Math.abs(takeoff-startX)*scale*(swimming ? 11 : 9);
    const moveTime=kind===walkConnection ? 0 : kind===jumpConnection ? jumpDurationMs : Math.max(850,Math.abs(endRise-startRise)*scale*11);
    const motion=poses[kind];
    function showSwim(elapsed){
      if (!swim) {
        displayFrame(0);
        return;
      }
      character.dataset.swimming='';
      for (const frame of images) frame.hidden=true;
      swim.forEach((frame,index)=>{frame.hidden=index!==Math.floor(elapsed/230)%swim.length;});
    }
    let start=continuedAt;
    function next(){
      const id=requestAnimationFrame(step);
      actor.animation=id;
    }
    function step(now){
      actor.animation=0;
      if (!allowed()) return;
      start ??= now;
      const elapsed=now-start;
      if (elapsed<walkTime) {
        const x=startX+(takeoff-startX)*elapsed/walkTime;
        position.x=x;
        position.rise=riseAt(current,x);
        character.dataset.direction=takeoff<startX ? 'left' : 'right';
        placeFooting(actor,x);
        setElevation(character,position.rise+(swimming ? Math.sin(now/190)*9 : 0));
        if (swimming) showSwim(now);
        else displayFrame(1+Math.floor(now/frameMs)%4);
      } else if (elapsed<walkTime+moveTime) {
        const progress=(elapsed-walkTime)/moveTime;
        const jumping=kind===jumpConnection;
        const arc=jumping ? 4*progress*(1-progress)*35 : 0;
        const liftProgress=jumping ? progress : progress*progress*(3-2*progress);
        position.x=takeoff;
        position.rise=startRise;
        placeFooting(actor,takeoff+(landing-takeoff)*progress);
        setElevation(character,startRise+(endRise-startRise)*liftProgress+arc);
        swim?.forEach(frame=>{frame.hidden=true;});
        delete character.dataset.swimming;
        if (landing!==takeoff) character.dataset.direction=landing<takeoff ? 'left' : 'right';
        for (const frame of images) frame.hidden=true;
        motion.forEach((frame,index)=>{frame.hidden=index!==Math.floor((elapsed-walkTime)/200)%motion.length;});
      } else {
        const route=position.route.slice(1);
        footingPositions.set(character,{id,x:landing,rise:endRise,route});
        placeFooting(actor,landing);
        setElevation(character);
        motion?.forEach(frame=>{frame.hidden=true;});
        if (inWater(target)) showSwim(now);
        else {
          swim?.forEach(frame=>{frame.hidden=true;});
          delete character.dataset.swimming;
          displayFrame(route.length ? 1+Math.floor(now/frameMs)%4 : 0);
        }
        if (route.length) {
          const nextStart=Math.max(now-32,start+walkTime+moveTime);
          walkOnFooting(actor,footing,nextStart);
          return;
        }
        const delay=1000+Math.random()*2200;
        actor.rest(delay,inWater(target));
        return;
      }
      next();
    }
    next();
  }
  function walk(actor=selfActor){
    const {element:character,images,showFrame:displayFrame,canWalk:allowed}=actor;
    if (!allowed()) return;
    const footing=mapFooting[ground.dataset.map];
    if (footing) {
      walkOnFooting(actor,footing);
      return;
    }
    const from=actor.x;
    const upper=upperPlatforms.get(character);
    const {left,right}=walkBounds(upper);
    const map=ground.dataset.map;
    const width=document.documentElement.clientWidth;
    const scale=width/(platforms[map]?.width ?? width);
    const jumpingFrames=getMovementImages(actor,jumpImages,['A06.0']);
    const climbingFrames=map==='spiritTree'
      ? getMovementImages(actor,ropeImages,['A09.0','A09.1']) : null;
    const rope=climbingFrames && Math.random()<(upper ? .5 : .3)
      ? upper ?? spiritTreeRopes[Math.floor(Math.random()*spiritTreeRopes.length)] : null;
    const jump=!rope && jumpingFrames && Math.random()<.1
      ? {x:from/scale,rise:0} : null;
    const transition=jump || rope;
    const minDistance=(right-left)*.27;
    const leftRange=Math.max(0,from-minDistance-left);
    const rightRange=Math.max(0,right-from-minDistance);
    if (!transition && !leftRange && !rightRange) return;
    const choice=Math.random()*(leftRange+rightRange);
    const landing=transition ? transition.x*scale : null;
    const takeoff=jump ? Math.max(left,Math.min(right,landing-100*scale)) : landing;
    const to=transition ? takeoff : choice<leftRange ? left+choice : from+minDistance+choice-leftRange;
    if (!transition && from===to) return;
    const duration=Math.abs(to-from)<1 ? 0 : Math.max(400,Math.abs(to-from)*9);
    const transitionDuration=jump ? jumpDurationMs : rope ? Math.max(850,rope.rise*scale*11) : 0;
    const transitionFrames=jump ? jumpingFrames : climbingFrames;
    character.dataset.direction=to<from ? 'left' : 'right';
    let start;
    function nextFrame(){
      const id=requestAnimationFrame(step);
      actor.animation=id;
    }
    function step(now){
      actor.animation=0;
      if (!allowed()) return;
      start ??= now;
      const elapsed=now-start;
      const progress=transition ? Math.max(0,Math.min(1,(elapsed-duration)/transitionDuration)) : 0;
      const x=elapsed<duration ? from+(to-from)*elapsed/duration : jump ? to+(landing-to)*progress : to;
      actor.x=x;
      character.style.setProperty('--companion-x',x+'px');
      if (transition && elapsed>=duration && elapsed<duration+transitionDuration) {
        const arc=jump ? 4*progress*(1-progress)*35 : 0;
        const rise=transition.rise ? transition.rise*(upper ? 1-progress : progress) : upper?.rise ?? 0;
        setElevation(character,rise+arc);
        if (jump && landing!==to) character.dataset.direction=landing<to ? 'left' : 'right';
        for (const frame of images) frame.hidden=true;
        transitionFrames.forEach((frame,index)=>{
          frame.hidden=index!==Math.floor((elapsed-duration)/200)%transitionFrames.length;
        });
        nextFrame();
      } else if (elapsed>=duration+transitionDuration) {
        if (transition) {
          if (transition.rise) {
            if (upper) upperPlatforms.delete(character);
            else upperPlatforms.set(character,transition);
          }
          setElevation(character);
          transitionFrames.forEach(frame=>{frame.hidden=true;});
        }
        const delay=2500+Math.random()*3000;
        actor.rest(delay,false);
      } else {
        displayFrame(1+Math.floor(now/frameMs)%4);
        nextFrame();
      }
    }
    nextFrame();
  }
  function stopPlazaGuest(actor){
    clearTimeout(actor.timer);
    cancelAnimationFrame(actor.animation);
    actor.animation=0;
    settleFooting(actor);
    setElevation(actor.element);
    for (const cache of [ropeImages,jumpImages,ladderImages,swimImages]) {
      cache.get(actor.images)?.frames?.forEach(frame=>{frame.hidden=true;});
    }
    delete actor.element.dataset.swimming;
    actor.showFrame(0);
  }
  function syncPlazaGuest(actor){
    stopPlazaGuest(actor);
    if (actor.canWalk()) actor.rest(850);
  }
  function removePlazaGuest(id,actor){
    stopPlazaGuest(actor);
    actor.balloon.hide();
    upperPlatforms.delete(actor.element);
    footingPositions.delete(actor.element);
    actor.element.remove();
    plazaGuests.delete(id);
  }
  function leavePlaza(){
    if (!plazaSelf) return;
    plazaSelf=null;
    plazaName.hidden=true;
    plazaMessage.hide();
    for (const [id,actor] of plazaGuests) removePlazaGuest(id,actor);
    sync();
  }
  function renderPlazaMembers(members,self){
    if (!plazaSelf) {
      plazaSelf=self;
      plazaName.textContent=members.find(member=>member.id===self)?.name ?? settings?.name ?? '';
      plazaName.hidden=false;
      balloon.hide();
      stopVisits();
      sync();
      if (!frames.length) void restore();
    }
    const current=new Set(members.filter(member=>member.id!==self).map(member=>member.id));
    for (const [id,actor] of plazaGuests) {
      if (!current.has(id)) removePlazaGuest(id,actor);
    }
    for (const member of members) {
      if (!current.has(member.id) || plazaGuests.has(member.id)) continue;
      const element=document.createElement('div');
      element.className='character-companion companion-plaza-guest';
      element.hidden=true;
      element.dataset.direction='left';
      element.dataset.pose='walk';
      const balloon=makeBalloon();
      balloon.node.classList.add('companion-plaza-message');
      balloon.name.textContent=member.name+' :';
      const {left,right}=walkBounds();
      const actor={
        element,balloon,x:left+(right-left)*(.15+Math.random()*.7),animation:0,timer:0,
        showFrame(index){actor.images?.forEach((frame,i)=>{frame.hidden=i!==index;});},
        canWalk(){return !element.hidden && !document.hidden && !reducedMotion.matches && menu.hidden;},
        rest(delay){actor.timer=setTimeout(()=>walk(actor),delay);}
      };
      plazaGuests.set(member.id,actor);
      element.style.setProperty('--companion-x',actor.x+'px');
      element.append(makePlazaName(member.name),balloon.node);
      document.body.append(element);
      preloadFrames(member.image).then(images=>{
        if (plazaGuests.get(member.id)!==actor) return;
        actor.images=images;
        element.prepend(...images);
        element.hidden=false;
        syncPlazaGuest(actor);
      }).catch(()=>{
        if (plazaGuests.get(member.id)===actor) removePlazaGuest(member.id,actor);
      });
    }
  }
  function sync(){
    stop();
    stopGuestWalk();
    clearInterval(standingTimer);
    sprite.hidden=!isSummoned() || !frames.length;
    ground.hidden=sprite.hidden || ground.dataset.map==='none';
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
    } else if (!plazaSelf && !sprite.hidden && !document.hidden && menu.hidden) {
      scheduleStationarySpeech();
    }
    if (guestCanWalk()) guestTimer=setTimeout(()=>walk(visitorActor),850);
    for (const actor of plazaGuests.values()) syncPlazaGuest(actor);
    if (!sprite.hidden && !document.hidden && !reducedMotion.matches) {
      standingTimer=setInterval(()=>{
        const frame=standingFrames[++standingIndex%standingFrames.length];
        if (pose==='walk' && !animation && !('swimming' in sprite.dataset)) showFrame(frame);
        if (!visitor.hidden && visitor.dataset.pose==='walk' && !guestAnimation && !('swimming' in visitor.dataset)) showGuestFrame(frame);
        for (const actor of plazaGuests.values()) {
          if (actor.images && !actor.animation && !('swimming' in actor.element.dataset)) actor.showFrame(frame);
        }
      },330);
    }
    if (!plazaSelf && !greeted && !sprite.hidden && !document.hidden) {
      greeted=true;
      balloon.show('안녕! 기다렸어!');
    }
  }
  function install(images){
    stop();
    stopVisits();
    upperPlatforms.delete(sprite);
    footingPositions.delete(sprite);
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
    plazaMessage.name.textContent=balloon.name.textContent;
    sprite.replaceChildren(chair,...images,chairFront,balloon.node,plazaMessage.node,plazaName,hitbox);
    sync();
  }
  function speak(text){
    if (!plazaSelf && !sprite.hidden && !document.hidden) balloon.show(text);
  }
  onCompanionSpeech(speak);
  onVoiceStart(({text,channel})=>{
    if (channel==='booster') return;
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
    if (sprite.hidden || settingsPopup.matches(':popover-open')) return;
    const contains=box=>{
      const {left,right,top,bottom}=box.getBoundingClientRect();
      return event.clientX>=left && event.clientX<=right && event.clientY>=top && event.clientY<=bottom;
    };
    const hitsMain=contains(hitbox);
    const hitsVisitor=!plazaSelf && !visitor.hidden && !visitorLeaving && contains(visitorHitbox);
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
    for (const actor of plazaGuests.values()) stopPlazaGuest(actor);
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
    if (!isSummoned() || !current?.name) return;
    try {
      const appearance=Date.now()-current.updatedAt<refreshMs ? current :
        await fetchCharacterAppearance(current.name,localStorage.getItem(apiKeyName) || '');
      const images=await preloadFrames(appearance.image);
      if (settings!==current || !isSummoned()) return;
      if (appearance!==current) {
        settings={...current,...appearance,updatedAt:Date.now()};
        save();
      }
      install(images);
    } catch {
      if (settings===current && settingsPopup.matches(':popover-open')) status.textContent='저장한 캐릭터를 불러오지 못했어. 미리보기로 다시 연결해 줘.';
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
  function setListOpen(open){
    if (open) setChairListOpen(false);
    toggleChoiceList(saved,nickname,open);
    listToggle.setAttribute('aria-expanded',String(open));
  }
  const quickMenu=find('.companion-quick-menu');
  const settingsBody=find('[data-settings-body]');
  const tabs=[...settingsPopup.querySelectorAll('[role=tab]')];
  function positionPopup(){
    const {right,bottom}=trigger.getBoundingClientRect();
    settingsPopup.style.setProperty('--companion-popup-top',Math.max(8,bottom+8)+window.scrollY+'px');
    settingsPopup.style.setProperty('--companion-popup-height',Math.max(96,window.innerHeight-bottom-16)+'px');
    settingsPopup.style.setProperty('--companion-popup-right',Math.max(8,document.documentElement.clientWidth-right)+'px');
  }
  function showSection(section){
    settingsPopup.dataset.section=section;
    quickMenu.hidden=Boolean(section);
    settingsBody.hidden=!section;
    for (const panel of settingsPopup.querySelectorAll('[data-panel]')) panel.hidden=panel.dataset.panel!==section;
    for (const tab of tabs) {
      const selected=tab.dataset.section===section;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected ? 0 : -1;
    }
    if (section==='character') loadChairs();
    if (section==='map') renderMapPreview();
    if (section==='plaza') plaza.show();
    else plaza.hide();
    setListOpen(false);
    setChairListOpen(false);
  }
  for (const tab of tabs) tab.addEventListener('click',()=>showSection(tab.dataset.section));
  find('[role=tablist]').addEventListener('keydown',event=>{
    const current=tabs.indexOf(event.target);
    if (current<0) return;
    const next={ArrowLeft:(current+tabs.length-1)%tabs.length,ArrowRight:(current+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if (next===undefined) return;
    event.preventDefault();
    showSection(tabs[next].dataset.section);
    tabs[next].focus();
  });
  for (const item of quickMenu.querySelectorAll('button')) {
    item.addEventListener('click',()=>{
      showSection(item.dataset.openSection);
      tabs.find(tab=>tab.dataset.section===item.dataset.openSection).focus();
    });
  }
  window.addEventListener('resize',positionPopup);
  settingsPopup.addEventListener('beforetoggle',event=>{
    if (event.target!==settingsPopup) return;
    const opening=event.newState==='open';
    trigger.setAttribute('aria-expanded',String(opening));
    if (!opening) {
      setListOpen(false);
      setChairListOpen(false);
      clearPreview();
      plaza.hide();
      return;
    }
    positionPopup();
    mapSelect.value=ground.dataset.map;
    mapStatus.textContent='';
    if (chairs) {
      chairSelect.value=selectedChair;
      syncChairPicker();
      renderChairPreview();
    }
    closeMenu();
    clearPreview();
    listed=getSchedulerCharacters();
    saved.replaceChildren(...listed.map(character=>{
      const option=document.createElement('button');
      option.type='button';
      option.textContent=character.name;
      option.addEventListener('click',()=>{
        nickname.value=character.name;
        setListOpen(false);
        clearPreview();
        nickname.focus();
      });
      return option;
    }));
    listToggle.hidden=!listed.length;
    nickname.value=settings?.name ?? '';
    visitorNames.value=settings?.visitors?.join(', ') ?? '';
    apiKey.value=localStorage.getItem(apiKeyName) || '';
    sync();
    showSection('');
  });
  find('[data-close]').addEventListener('click',()=>settingsPopup.hidePopover());
  document.addEventListener('click',event=>{
    if (!chairPicker.contains(event.target)) setChairListOpen(false);
    if (!find('.companion-nickname-field').contains(event.target)) setListOpen(false);
  });
  settingsPopup.addEventListener('keydown',event=>{
    if (event.key!=='Escape' || saved.hidden) return;
    event.preventDefault();
    setListOpen(false);
    listToggle.focus();
  });
  listToggle.addEventListener('click',()=>setListOpen(saved.hidden));
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
      settingsPopup.hidePopover();
    }
  });
  async function loadCharacter(showPreview){
    // Keep the displayed preview until its replacement has finished decoding.
    request++;
    candidate=null;
    status.textContent='';
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
        if (preview.firstElementChild?.src!==image.src) preview.replaceChildren(image);
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
    const chairChanged=chairs?.[chairSelect.value] && chairSelect.value!==selectedChair;
    if (chairChanged) {
      selectedChair=chairSelect.value;
      try {localStorage.setItem(chairKey,selectedChair);} catch {}
      renderChair();
    }
    if (chairChanged && (!name || (name===settings?.name && keyInput===savedKey &&
        JSON.stringify(visitors)===JSON.stringify(settings.visitors ?? [])))) {
      status.textContent='의자를 적용했어.';
      return;
    }
    const existing=name===settings?.name && frames.length && keyInput===savedKey
      ? {appearance:{name:settings.name,image:settings.image},images:frames,key:keyInput}
      : null;
    const selected=candidate ?? existing ?? await loadCharacter(false);
    if (!selected) return;
    const {appearance,images,key}=selected;
    const sameCharacter=appearance.name===settings?.name;
    if (plazaSelf && !sameCharacter) plaza.exit();
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
    const foregroundHeight=platform ? (platform.height-platform.foregroundTop)*width/platform.width : 0;
    document.body.style.setProperty('--companion-foreground-height',foregroundHeight+'px');
    for(const character of [sprite,visitor]) character.style.setProperty('--companion-lift',lift+'px');
    const {left,right}=walkBounds(upperPlatforms.get(sprite));
    offset=frames.length ? Math.max(left,Math.min(right,offset)) : right;
    if (!visitor.hidden) {
      const guestBounds=walkBounds(upperPlatforms.get(visitor));
      visitorX=Math.max(guestBounds.left,Math.min(guestBounds.right,visitorX));
      visitor.style.setProperty('--companion-x',visitorX+'px');
    }
    for (const actor of plazaGuests.values()) {
      const bounds=walkBounds(upperPlatforms.get(actor.element));
      actor.x=Math.max(bounds.left,Math.min(bounds.right,actor.x));
      actor.element.style.setProperty('--companion-x',actor.x+'px');
    }
    place();
    sync();
  }
  window.addEventListener('resize',alignScene);
  alignScene();
  void restore();
}
