/* DOM 헬퍼 */
export const $ = id => document.getElementById(id);
export const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function getVal(id) {
  const el = $(id);
  return el ? Number(el.value.replace(/,/g, '')) || 0 : 0;
}
