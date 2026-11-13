/* 내장 이미지와 내부 판정 기준. 이전 수동 설정은 사용하지 않는다. */
import { BUILTIN } from '../../data/builtin-icons.js';
export const TARGETS = [
  { id: 'janus', label: '솔 야누스', thr: 0.85 },
  { id: 'fountain', label: '에르다 파운틴', thr: 0.78 }
];
const subs = new Set();
export const onIconsChange = fn => subs.add(fn);
export const getIcon = (id, kind = 'buff') => BUILTIN[id]?.[kind] || null;
export const getThreshold = id => TARGETS.find(t => t.id === id)?.thr ?? 0.85;
export async function loadIcons() { subs.forEach(fn => fn()); }
