const KEY = 'boss_presets_v1';
export const BOSS_PRESET_LIMIT = 6;
export const BOSS_UTILITY_LIMIT = 5;
const BOSS_SAVED_UTILITY_LIMIT = 6;
export const BOSS_NAME_LIMIT = 8;
export const BOSS_UTILITY_NAME_LIMIT = 7;
export const bossName = (value,limit=BOSS_NAME_LIMIT) => value.trim().slice(0,limit).trimEnd();
const sections = new Set(['burst', 'semi', 'utility']);
const fixedSlots = [['burst','극딜'],['semi','준극딜']];
export const isAscent = skill => skill.type==='utility' && skill.name==='어센트';

function withFixedSlots(skills) {
  let utilityCount=0, hasAscent=false;
  const utility=skills.filter(skill=>{
    if (skill.type!=='utility') return false;
    if (!isAscent(skill)) return utilityCount++<BOSS_SAVED_UTILITY_LIMIT;
    if (hasAscent) return false;
    hasAscent=true;
    return true;
  });
  let id=Math.max(0,...skills.map(skill=>skill.id));
  const fixed=fixedSlots.map(([type,name])=>{
    const previous=skills.find(skill=>skill.type===type && skill.region) ?? skills.find(skill=>skill.type===type);
    return {id:previous?.id ?? ++id,type,name,alert:true,region:previous?.region ?? null,reference:previous?.reference ?? null};
  });
  return [...utility,...fixed];
}

function defaultPreset(index,includeGenesis=true) {
  const names=['어센트', '블링크', '홀리 파운틴'];
  if (includeGenesis) names.push('제네 무적');
  return {
    name: `프리셋 ${index+1}`,
    skills: withFixedSlots(names.map((name,index)=>({
      id:index+1, type:'utility', name, alert:name!=='어센트', region:null, reference:null
    })))
  };
}

const clamp = value => Math.min(1,Math.max(0,value));
export function bossRegion(start,end) {
  const [x1,y1]=start.map(clamp), [x2,y2]=end.map(clamp);
  const width=Math.abs(x2-x1), height=Math.abs(y2-y1);
  if (!Number.isFinite(width+height) || width===0 || height===0) return null;
  return {x:Math.min(x1,x2),y:Math.min(y1,y2),width,height};
}

export function loadBossPresets(storage) {
  let data;
  try { data=JSON.parse(storage.getItem(KEY)); } catch {}
  const source=Array.isArray(data?.presets) && data.presets.length ?
    data.presets.slice(0,BOSS_PRESET_LIMIT) : [null];
  const active=Number.isInteger(data?.active) && data.active>=0 && data.active<source.length ? data.active : 0;
  const presets=source.map((saved,index)=>{
    const fallback=defaultPreset(index,data?.version===3);
    if (!Array.isArray(saved?.skills)) return fallback;
    const ids=new Set();
    const skills=saved.skills.flatMap(skill=>{
      if (!skill || !Number.isSafeInteger(skill.id) || skill.id<1 || ids.has(skill.id) ||
          !sections.has(skill.type) || typeof skill.name!=='string') return [];
      ids.add(skill.id);
      const r=skill.region;
      const region=r && [r.x,r.y,r.width,r.height].every(Number.isFinite) && r.width>0 && r.height>0
        ? bossRegion([r.x,r.y],[r.x+r.width,r.y+r.height]) : null;
      const name=skill.type==='utility' && skill.id===3 && skill.name==='에르다 파운틴' ? '홀리 파운틴' : skill.name;
      const reference=Array.isArray(skill.reference) && skill.reference.length===768 &&
        skill.reference.every(v=>Number.isInteger(v) && v>=0 && v<=255) ? skill.reference : null;
      const normalized={id:skill.id,type:skill.type,name:bossName(name,skill.type==='utility' ? BOSS_UTILITY_NAME_LIMIT : BOSS_NAME_LIMIT)};
      return [{...normalized,alert:!isAscent(normalized) && skill.alert!==false,region,reference:region ? reference : null}];
    });
    return {name:(typeof saved.name==='string' && bossName(saved.name)) || fallback.name,
      skills:withFixedSlots(skills)};
  });
  if (data?.version===3) return {presets,active};
  let result={presets,active};
  if (data?.version!==2) {
    const selected=presets[active];
    const used=presets.filter((preset,index)=>index===0 || index===active ||
      JSON.stringify(preset)!==JSON.stringify(defaultPreset(index,false)));
    result={presets:used,active:used.indexOf(selected)};
  }
  for (const preset of result.presets) {
    if (preset.skills.some(skill=>skill.type==='utility' && skill.name==='제네 무적')) continue;
    const id=Math.max(0,...preset.skills.map(skill=>skill.id))+1;
    preset.skills=withFixedSlots([...preset.skills,{id,type:'utility',name:'제네 무적',alert:true,region:null,reference:null}]);
  }
  return result;
}

export function addBossPreset(state) {
  if (state.presets.length>=BOSS_PRESET_LIMIT) return;
  const used=new Set(state.presets.map(preset=>preset.name));
  let index=state.presets.length;
  while (used.has(`프리셋 ${index+1}`)) index++;
  state.presets.push(defaultPreset(index));
  state.active=state.presets.length-1;
}

export function applyBossPresetDraft(state,draft) {
  if (!draft.length) return;
  const selected=state.presets[state.active];
  state.presets=draft.map(({preset,name})=>{
    preset.name=bossName(name) || preset.name;
    return preset;
  });
  state.active=Math.max(0,state.presets.indexOf(selected));
}

export function saveBossPresets(storage,state) {
  let previous;
  try { previous=JSON.parse(storage.getItem(KEY)); } catch {}
  if (previous?.presets?.length>BOSS_PRESET_LIMIT) {
    storage.setItem(KEY+'_before_limit',JSON.stringify(previous));
  }
  storage.setItem(KEY,JSON.stringify({...state,version:3}));
}
