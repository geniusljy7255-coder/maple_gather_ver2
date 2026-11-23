import {PlazaConnection,sendPlazaChat} from './plaza-transport.js';

export function mountPlaza(panel,getCharacter,{onJoin,onLeave,renderMembers,showChat}){
  const button=panel.querySelector('[data-plaza-toggle]');
  const status=panel.querySelector('[data-plaza-status]');
  const countLabel=panel.querySelector('[data-plaza-count]');
  const stage=document.createElement('section');
  stage.className='plaza-stage';
  stage.hidden=true;
  stage.setAttribute('aria-label','광장 1');
  stage.innerHTML=`
    <form class="plaza-chat">
      <div class="plaza-chat-compose">
        <input name="message" aria-label="광장 채팅" placeholder="광장 채팅" maxlength="120" required autocomplete="off">
        <button type="submit">보내기</button>
      </div>
      <button type="button" data-exit>나가기</button>
      <p class="plaza-chat-status" role="status"></p>
    </form>`;
  document.body.append(stage);
  const chat=stage.querySelector('form');
  const message=chat.elements.message;
  const chatStatus=chat.querySelector('[role=status]');
  const hint='저장한 캐릭터로 광장에 입장할 수 있어요.';
  const full='광장이 가득 찼어요.';
  const unavailable='광장 인원수를 불러오지 못했어요.';
  let connection, observer, count=null, capacity=10, token, sending=false;

  function showStage(visible){
    if (stage.hidden===!visible) return;
    stage.hidden=!visible;
    if (!visible) onLeave();
  }

  async function sendAction(action){
    return sendPlazaChat(token,action.text);
  }

  chat.addEventListener('submit',async event=>{
    event.preventDefault();
    const text=message.value.trim(), session=connection;
    if (!token || !text || sending) return;
    sending=true;
    const sent=await sendAction({text});
    sending=false;
    if (connection!==session) return;
    chatStatus.textContent=sent ? '' : '잠시 후 다시 보내 주세요.';
    if (sent && message.value.trim()===text) message.value='';
  });

  function renderCount(){
    countLabel.textContent=`${count ?? '–'}/${capacity}`;
    button.disabled=!connection && (count===null || count>=capacity);
  }

  function updateCount(data){
    ({count,capacity}=data);
    renderCount();
  }

  function stopWatching(){
    observer?.close();
    observer=null;
  }

  function show(){
    if (observer || connection) return;
    if (!['http:','https:'].includes(location.protocol)) {
      status.textContent='광장 서버 주소에서 땅캐라를 열어 주세요.';
      return;
    }
    const stream=new PlazaConnection();
    observer=stream;
    stream.addEventListener('message',event=>{
      if (observer!==stream) return;
      updateCount(JSON.parse(event.data));
      if (status.textContent===unavailable || (status.textContent===full && count<capacity)) status.textContent=hint;
    });
    stream.addEventListener('error',()=>{
      if (observer!==stream) return;
      count=null;
      renderCount();
      status.textContent=unavailable;
      stopWatching();
    });
  }

  function leave(message=hint){
    connection?.close();
    connection=null;
    token=null;
    showStage(false);
    chat.reset();
    chatStatus.textContent='';
    button.textContent='입장';
    status.textContent=message;
    renderCount();
  }

  function hide(){
    stopWatching();
    if (!connection) {
      count=null;
      renderCount();
    }
  }

  function exit(){
    count=null;
    leave();
    if (!panel.hidden && panel.closest(':popover-open')) show();
  }
  stage.querySelector('[data-exit]').addEventListener('click',exit);
  button.addEventListener('click',()=>{
    if (connection) {
      exit();
      return;
    }
    const character=getCharacter();
    if (!character?.name || !character.image) {
      leave('캐릭터 관리에서 캐릭터를 먼저 적용해 주세요.');
      return;
    }
    stopWatching();
    const stream=new PlazaConnection(character);
    connection=stream;
    button.textContent='나가기';
    status.textContent='광장에 연결하는 중…';
    stream.addEventListener('message',event=>{
      if (connection!==stream) return;
      const snapshot=JSON.parse(event.data);
      updateCount(snapshot);
      token=snapshot.token;
      renderMembers(snapshot.members,snapshot.self);
      const firstSnapshot=stage.hidden;
      showStage(true);
      if (firstSnapshot) onJoin();
      status.textContent='광장에 접속 중이에요.';
    });
    stream.addEventListener('chat',event=>{
      if (connection!==stream) return;
      const {id,text}=JSON.parse(event.data);
      showChat(id,text);
    });
    stream.addEventListener('full',event=>{
      if (connection!==stream) return;
      updateCount(JSON.parse(event.data));
      leave(full);
      if (!panel.hidden && panel.closest(':popover-open')) show();
    });
    stream.addEventListener('error',()=>{
      if (connection!==stream) return;
      if (stream.readyState===PlazaConnection.CLOSED) {
        count=null;
        leave('광장에 입장하지 못했어요. 서버 상태와 저장한 캐릭터를 확인해 주세요.');
        if (!panel.hidden && panel.closest(':popover-open')) show();
        return;
      }
      token=null;
      showStage(false);
      status.textContent='광장에 다시 연결하는 중…';
    });
  });
  window.addEventListener('pagehide',()=>{hide();leave();});
  window.addEventListener('pageshow',event=>{
    if (event.persisted && !panel.hidden && panel.closest(':popover-open')) show();
  });
  return {show,hide,exit};
}
