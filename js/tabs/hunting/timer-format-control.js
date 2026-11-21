import {getTimerFormat,onTimerFormatChange,setTimerFormat} from './detector.js';

export const timerFormatControl = id => `
  <label class="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
    <span>인게임 시간 표기</span>
    <span class="relative">
      <select id="${id}" class="appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-7 font-bold text-slate-800">
        <option value="seconds">초</option>
        <option value="clock">분:초</option>
      </select>
      <span class="hunt-select-arrow" aria-hidden="true"></span>
    </span>
  </label>`;

export function bindTimerFormat(select) {
  select.value=getTimerFormat();
  select.addEventListener('change',()=>setTimerFormat(select.value));
  onTimerFormatChange(format=>{select.value=format;});
}
