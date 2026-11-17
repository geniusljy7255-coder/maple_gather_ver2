import {crop,imageData} from './monitor-assets.js';

export const experienceBuffGroups=[
  {id:'multiplier',label:'경험치 배율',files:['경험치_x배']},
  {id:'bonus',label:'추가 경험치',files:['MVP_추가_경험치_50%','MVP_추가_경험치_70%','추가_경험치_50%']},
  {id:'vip',label:'VIP 버프 경험치',files:['VIP_버프_경험치']},
  {id:'luck',label:'유니온의 행운',files:['유니온의_행운']},
  {id:'wealth',label:'유니온의 부',files:['유니온의_부']},
  {id:'experience-potion',label:'경험 축적의 비약',files:['고농축_경험축적의_비약','경험_축적의_비약']},
  {id:'wealth-potion',label:'재물 획득의 비약',files:['재물_획득의_비약']},
  {id:'gold',label:'익스트림 골드',files:['익스트림_골드']}
];

export const experienceBuffIcon = file => new URL('../../../icon/buff/'+encodeURIComponent(file)+'.png',import.meta.url).href;
export const experienceBuffHud = (w,h) => ({x:Math.floor(w*.48),h:Math.ceil(h*.18)});
export const experienceBuffPending = (record,now) => record?.deadline<=now &&
  Number.isFinite(record.pendingSince) && now-record.pendingSince<=6500 && now-record.seenAt<=6500;

export async function loadExperienceBuffAssets(){
  const loaded=await Promise.all(experienceBuffGroups.flatMap(group=>group.files.map(async file=>{
    try {
      const image=await imageData(experienceBuffIcon(file));
      const size=Math.min(image.width,image.height);
      const main=crop(image,Math.floor((image.width-size)/2),Math.floor((image.height-size)/2),size,size);
      if (group.id==='multiplier') {
        // The W on the reference icon is replaced by the in-game multiplier.
        for(let y=Math.floor(size*.09);y<Math.ceil(size*.32);y++) {
          for(let x=Math.floor(size*.60);x<Math.ceil(size*.90);x++) main.rgba[(y*size+x)*4+3]=0;
        }
      }
      return {group:group.id,file,main};
    } catch { return {file,missing:true}; }
  })));
  return {assets:loaded.filter(asset=>!asset.missing),missing:loaded.filter(asset=>asset.missing).map(asset=>asset.file)};
}

export function observeExperienceBuff(previous,hit,now){
  const record=previous ?? {deadline:0,readAt:0,sample:null,multiplier:null,approx:false};
  if (!hit) return record;
  const pendingSince=record.pendingSince!=null && now-record.seenAt<=6500 ? record.pendingSince : now;
  const {seconds,approx,multiplier}=hit;
  if (!seconds) return {...record,seenAt:now,pendingSince:record.deadline>now ? null : pendingSince};
  const sample={...hit,at:now,deadline:now+seconds*1000};
  const last=record.sample;
  if (record.deadline>now && record.file===hit.file) {
    const consistent=approx
      ? record.approx && Math.abs(record.deadline-sample.deadline)<=65000
      : Math.abs(record.deadline-sample.deadline)<=(record.approx?65000:2000);
    if (consistent) return {...record,seenAt:now,readAt:now,sample,
      multiplier:multiplier && last?.multiplier===multiplier ? multiplier : record.multiplier,
      deadline:record.approx&&!approx ? sample.deadline : record.deadline,
      approx:record.approx&&approx};
  }
  const confirmed=last && last.file===hit.file && now-last.at<=8500 && last.approx===approx &&
    (!multiplier || previous?.deadline>now || last.multiplier===multiplier) &&
    (approx ? last.seconds===seconds : Math.abs(last.deadline-sample.deadline)<=1500);
  if (!confirmed) return {...record,sample,seenAt:now,pendingSince:record.deadline>now ? null : pendingSince};
  return {file:hit.file,deadline:sample.deadline,approx,readAt:now,seenAt:now,sample,
    multiplier:multiplier && last.multiplier===multiplier ? multiplier : null};
}
