/* 숫자 · 금액 포맷 */
/** 숫자 → "1억 2,000만 500 메소" */
export function formatKoreanMoney(num) {
  if (isNaN(num) || num === 0) return '0 메소';
  const abs = Math.abs(Math.round(num));
  const eok = Math.floor(abs / 1e8);
  const man = Math.floor((abs % 1e8) / 1e4);
  const rest = abs % 1e4;
  let out = '';
  if (eok > 0) out += `${eok.toLocaleString()}억 `;
  if (man > 0) out += `${man.toLocaleString()}만 `;
  if (rest > 0 || (!eok && !man)) out += rest.toLocaleString();
  return `${num < 0 ? '-' : ''}${out.trim()} 메소`;
}

/** 자동 콤마, 최대값 제한, 커서 위치 유지 */
export function formatNumber(input) {
  const pos = input.selectionStart || 0;
  const digitsBeforeCursor = input.value.slice(0, pos).replace(/\D/g, '').length;

  let num = Number(input.value.replace(/\D/g, '') || '0');
  if (num > 1e9) num = 1e9;
  const formatted = num.toLocaleString('ko-KR');
  input.value = formatted;

  let cursor = 0, count = 0;
  if (digitsBeforeCursor > 0) {
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) count++;
      if (count === digitsBeforeCursor) { cursor = i + 1; break; }
    }
  }
  input.setSelectionRange(cursor, cursor);
}

const p2 = n => String(n).padStart(2, '0');

/** 밀리초 → "01:23:45" (경과 시간용, 내림) */
export function formatHMS(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(s % 60)}`;
}

/** 밀리초 → "01:40" (남은 시간용, 올림) */
export function formatMS(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
}
