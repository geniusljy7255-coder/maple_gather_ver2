/* DOM 헬퍼 */
export const $ = id => document.getElementById(id);
export function setText(id, text) {
  const el = $(id);
  const value = text == null ? '' : String(text);
  if (el && el.textContent !== value) el.textContent = value;
}
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function getVal(id) {
  const el = $(id);
  return el ? Number(el.value.replace(/,/g, '')) || 0 : 0;
}
