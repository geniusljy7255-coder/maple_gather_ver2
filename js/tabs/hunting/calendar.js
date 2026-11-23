import {formatHMS} from '../../core/format.js';

const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const huntDateKey=time=>dateFormat.format(new Date(time));
export const recordsForDate=(history,date)=>history.filter(item=>huntDateKey(item.startedAt)===date);
export const calendarHtml=`
<details class="panel hunt-calendar" aria-labelledby="huntCalendarTitle">
  <summary class="panel-h" id="huntCalendarTitle"><span><span class="dot"></span>사냥 캘린더</span><span class="hunt-calendar-disclosure"><span class="hunt-calendar-open-label">펼치기</span><span class="hunt-calendar-close-label">접기</span><span class="hunt-calendar-chevron" aria-hidden="true">▾</span></span></summary>
  <div class="hunt-calendar-nav">
    <div class="hunt-calendar-month-navigation">
    <button type="button" id="huntCalendarPrev" aria-label="이전 달">‹</button>
    <strong id="huntCalendarMonth" aria-live="polite"></strong>
    <button type="button" id="huntCalendarNext" aria-label="다음 달">›</button>
    </div>
    <button type="button" id="huntCalendarToday">오늘로 이동</button>
  </div>
  <div class="hunt-calendar-week" aria-hidden="true">${['일','월','화','수','목','금','토'].map(day=>`<span>${day}</span>`).join('')}</div>
  <div id="huntCalendarDays" class="hunt-calendar-days" role="group" aria-label="사냥 기록 날짜 선택"></div>
  <h3 id="huntCalendarDate" class="text-sm font-bold" aria-live="polite"></h3>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs tabular-nums">
      <thead><tr>${['시작 시간','사냥 시간','경험치','솔 에르다 조각','삭제'].map(label=>`<th scope="col" class="whitespace-nowrap px-2 py-2">${label}</th>`).join('')}</tr></thead>
      <tbody id="huntHistory"></tbody>
    </table>
  </div>
  <p id="huntHistoryWarn" class="hint" role="status"></p>
  <dialog id="huntHistoryDelete" class="hunt-delete-dialog" aria-labelledby="huntDeleteTitle">
    <form method="dialog">
      <h3 id="huntDeleteTitle">삭제 하시겠습니까?</h3>
      <p>선택한 사냥 기록이 삭제됩니다.</p>
      <div><button value="yes">예</button><button value="no" autofocus>아니요</button></div>
    </form>
  </dialog>
</details>`;

export function mountHuntCalendar(root,getHunt,removeRecord){
  const find=id=>root.getElementById(id);
  let selected=huntDateKey(Date.now()), month=selected.slice(0,7), rendered, pending=null;
  const dialog=find('huntHistoryDelete');
  function render(force=false){
    const {history,storageError}=getHunt();
    const today=huntDateKey(Date.now());
    const signature=month+'|'+selected+'|'+today;
    find('huntHistoryWarn').textContent=storageError ? '브라우저 저장에 실패했습니다. 변경 내용은 새로고침 후 유지되지 않을 수 있습니다.' : '사냥 시작일 기준 · 이 브라우저에 저장됩니다.';
    if (!force && rendered?.history===history && rendered.signature===signature) return;
    rendered={history,signature};
    const [year,number]=month.split('-').map(Number);
    find('huntCalendarMonth').textContent=`${year}년 ${number}월`;
    const counts=new Map();
    for (const item of history){const key=huntDateKey(item.startedAt);counts.set(key,(counts.get(key)||0)+1);}
    const days=find('huntCalendarDays');
    days.replaceChildren();
    const offset=new Date(Date.UTC(year,number-1,1)).getUTCDay();
    for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');days.append(blank);}
    const total=new Date(Date.UTC(year,number,0)).getUTCDate();
    for(let day=1;day<=total;day++){
      const key=month+'-'+String(day).padStart(2,'0'), count=counts.get(key)||0;
      const button=document.createElement('button');
      button.type='button';
      button.textContent=String(day);
      button.setAttribute('aria-label',`${year}년 ${number}월 ${day}일, 사냥 기록 ${count}개`);
      button.setAttribute('aria-pressed',String(selected===key));
      if(key===today)button.setAttribute('aria-current','date');
      const badge=document.createElement('small');badge.textContent=count ? `${count}건` : '\u00a0';button.append(badge);
      button.addEventListener('click',()=>{selected=key;render();find('huntCalendarDays').children[offset+day-1].focus();});
      days.append(button);
    }
    const trailingDays=(7-(offset+total)%7)%7;
    for(let i=0;i<trailingDays;i++){
      const blank=document.createElement('span');
      blank.setAttribute('aria-hidden','true');
      days.append(blank);
    }
    const records=recordsForDate(history,selected);
    find('huntCalendarDate').textContent=`${selected.replaceAll('-','. ')} · 사냥 기록 ${records.length}건`;
    const host=find('huntHistory');host.replaceChildren();
    if(!records.length){
      const row=document.createElement('tr'),cell=document.createElement('td');
      cell.colSpan=5;cell.className='px-2 py-2';cell.textContent='해당 날짜의 사냥 기록이 없습니다.';row.append(cell);host.append(row);
    }
    for(const item of records){
      const row=document.createElement('tr');
      const values=[timeFormat.format(item.startedAt),formatHMS(item.durationMs ?? item.endedAt-item.startedAt),item.gainPercent===null ? '미확인' : '+'+item.gainPercent.toFixed(4)+'%p',item.fragments+'개'];
      for(const value of values){const cell=document.createElement('td');cell.className='whitespace-nowrap px-2 py-2';cell.textContent=value;row.append(cell);}
      const cell=document.createElement('td'),button=document.createElement('button');
      button.type='button';button.className='hunt-history-delete';button.textContent='×';
      button.setAttribute('aria-label',`${values[0]} 사냥 기록 삭제`);
      button.addEventListener('click',()=>{pending=item;dialog.showModal();});
      cell.append(button);row.append(cell);host.append(row);
    }
  }
  function moveMonth(delta){
    const [year,number]=month.split('-').map(Number),date=new Date(Date.UTC(year,number-1+delta,1));
    month=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
    selected=month+'-01';render();
  }
  find('huntCalendarPrev').addEventListener('click',()=>moveMonth(-1));
  find('huntCalendarNext').addEventListener('click',()=>moveMonth(1));
  find('huntCalendarToday').addEventListener('click',()=>{selected=huntDateKey(Date.now());month=selected.slice(0,7);render();});
  dialog.addEventListener('close',()=>{
    if(dialog.returnValue==='yes' && pending){removeRecord(pending);render();find('huntCalendarToday').focus();}
    pending=null;dialog.returnValue='';
  });
  render();
  return render;
}
