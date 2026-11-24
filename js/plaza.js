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
      <div class="plaza-chat-surface">
      <div class="plaza-chat-history">
        <button type="button" class="plaza-chat-history-toggle" aria-label="채팅 내역 펼치기" aria-expanded="false" aria-controls="plazaChatHistoryPanel"></button>
        <div class="plaza-chat-summary" data-chat-preview>아직 채팅이 없어요.</div>
        <div id="plazaChatHistoryPanel" class="plaza-chat-history-panel" inert>
          <div class="plaza-chat-history-content">
            <ol aria-label="최근 광장 채팅" data-chat-history></ol>
          </div>
        </div>
      </div>
      <div class="plaza-chat-compose">
        <input name="message" aria-label="광장 채팅" placeholder="광장 채팅" maxlength="120" required autocomplete="off">
        <button type="submit">보내기</button>
      </div>
      </div>
      <button type="button" data-exit>광장 나가기</button>
      <p class="plaza-chat-status" role="status"></p>
    </form>`;
  document.body.append(stage);
  const chat=stage.querySelector('form');
  const message=chat.elements.message;
  const chatStatus=chat.querySelector('[role=status]');
  const history=chat.querySelector('.plaza-chat-history');
  const historyToggle=chat.querySelector('.plaza-chat-history-toggle');
  const historyPanel=history.querySelector('.plaza-chat-history-panel');
  const historyList=chat.querySelector('[data-chat-history]');
  const historyPreview=chat.querySelector('[data-chat-preview]');
  function appendHistory(messages,members){
    if (!messages.length) return;
    const pinned=historyList.scrollHeight-historyList.scrollTop-historyList.clientHeight<=8;
    const names=new Map(members.map(member=>[member.id,member.name]));
    for (const {id,name,text} of messages.slice(-10)) {
      const entry=document.createElement('li');
      const author=document.createElement('strong');
      author.textContent=name || names.get(id) || '참가자';
      const body=document.createElement('span');
      body.textContent=text;
      entry.append(author,': ',body);
      historyList.append(entry);
      historyPreview.replaceChildren(author.cloneNode(true),': ',body.cloneNode(true));
    }
    while (historyList.children.length>10) historyList.firstElementChild.remove();
    if (pinned) historyList.scrollTop=historyList.scrollHeight;
  }
  function setHistoryOpen(open){
    history.toggleAttribute('data-open',open);
    historyToggle.setAttribute('aria-expanded',String(open));
    historyToggle.setAttribute('aria-label',open ? '채팅 내역 접기' : '채팅 내역 펼치기');
    historyPanel.inert=!open;
    if (open) historyList.scrollTop=historyList.scrollHeight;
  }
  historyToggle.addEventListener('click',()=>setHistoryOpen(!history.hasAttribute('data-open')));
  const hint='저장한 캐릭터로 광장에 입장할 수 있어요.';
  const setup='캐릭터 관리에서 캐릭터를 먼저 저장해 주세요.';
  const loading='광장 인원을 불러오는 중…';
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
    const character=getCharacter();
    countLabel.textContent=count===null ? '' : `${count}/${capacity}`;
    button.disabled=!connection && (!character?.name || !character.image || count===null || count>=capacity);
  }

  function updateCount(data){
    ({count,capacity}=data);
    renderCount();
  }

  function stopWatching(){
    observer?.close();
    observer=null;
  }

  function show(initialStatus){
    if (observer || connection) return;
    if (!['http:','https:'].includes(location.protocol)) {
      status.textContent='광장 서버 주소에서 땅캐라를 열어 주세요.';
      return;
    }
    const stream=new PlazaConnection();
    observer=stream;
    status.textContent=initialStatus || loading;
    renderCount();
    stream.addEventListener('message',event=>{
      if (observer!==stream) return;
      updateCount(JSON.parse(event.data));
      if (initialStatus) return;
      const character=getCharacter();
      status.textContent=count===null ? unavailable
        : count>=capacity ? full : character?.name && character.image ? hint : setup;
    });
    stream.addEventListener('error',()=>{
      if (observer!==stream) return;
      count=null;
      renderCount();
      status.textContent=initialStatus || unavailable;
      stopWatching();
    });
  }

  function leave(message=hint){
    connection?.close();
    connection=null;
    token=null;
    showStage(false);
    chat.reset();
    setHistoryOpen(false);
    historyList.replaceChildren();
    historyPreview.textContent='아직 채팅이 없어요.';
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
      appendHistory(snapshot.messages ?? [],snapshot.members);
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
    stream.addEventListener('duplicate',event=>{
      if (connection!==stream) return;
      updateCount(JSON.parse(event.data));
      const duplicate='이미 광장에 접속 중인 캐릭터예요. 기존 접속을 종료한 뒤 다시 입장해 주세요. 이미 종료했다면 15초 뒤에 다시 시도해 주세요.';
      leave(duplicate);
      if (!panel.hidden && panel.closest(':popover-open')) show(duplicate);
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
