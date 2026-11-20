import {readDigits} from './digits.js';
import {readScreenText} from './screen-text.js';
import {readCounterImage,readCountWord} from './number-image-reader.js';
export const STACK_COUNT_INTERVAL=2000;
// 161121005/number contains count icons 1 through 60.
const MAX_STACK_COUNT=60;

function countForeground(rgba,size,background,threshold) {
  const mask=new Uint8Array(size*size),changed=new Uint8Array(mask.length),seen=new Uint8Array(mask.length);
  const output=new Uint8ClampedArray(rgba.length),left=Math.floor(size*.38),top=Math.floor(size*.57);
  // The white icon frame can touch the tiny counter. Do not join that frame
  // to the numeral and mistake the resulting shape for one large glyph.
  for(let y=top;y<size-1;y++)for(let x=left;x<size-1;x++) {
    const i=y*size+x,p=i*4,low=Math.min(rgba[p],rgba[p+1],rgba[p+2]);
    const r=rgba[p],g=rgba[p+1],b=rgba[p+2];
    const neutral=low>threshold && Math.max(r,g,b)-low<=70;
    const warm=r>threshold && g>threshold && r-b>=40 && g-b>=25;
    if(!neutral && !warm)continue;
    mask[i]=1;
    const brighter=!background || Math.max(r-background[p],g-background[p+1],b-background[p+2])>35;
    const newWarm=background && warm && !(background[p]-background[p+2]>=40 && background[p+1]-background[p+2]>=25);
    changed[i]=brighter || newWarm ? 1 : 0;
  }
  for(let y=top;y<size;y++)for(let x=left;x<size;x++) {
    const i=y*size+x;if(!mask[i] || seen[i])continue;
    const component=[i];seen[i]=1;let supported=false;
    for(let j=0;j<component.length;j++) {
      const n=component[j],px=n%size,py=Math.floor(n/size);
      supported ||= Boolean(changed[n]);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
        const nx=px+dx,ny=py+dy,k=ny*size+nx;
        if(nx<left || nx>=size-1 || ny<top || ny>=size-1 || !mask[k] || seen[k])continue;
        seen[k]=1;component.push(k);
      }
    }
    // Keep the whole connected numeral, including white strokes that overlap
    // white artwork, only when part of it differs from the original icon.
    if(supported)for(const n of component)output.set([255,255,255,255],n*4);
  }
  return output;
}

// Stack counts are white numbers at the lower right, independent of the
// game's countdown format. Never convert them to minutes or a deadline.
export function readStackCount(rgba,size,background) {
  const candidates=[];
  const images=[{rgba,size,background}];
  if(size!==32)for(const phaseY of [.2,.5,.8])for(const phaseX of [.2,.5,.8]) {
    const sample=new Uint8ClampedArray(32*32*4),base=background && new Uint8ClampedArray(sample.length);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
      const sx=Math.min(size-1,Math.floor((x+phaseX)*size/32));
      const sy=Math.min(size-1,Math.floor((y+phaseY)*size/32));
      const p=(sy*size+sx)*4,q=(y*32+x)*4;
      sample.set(rgba.subarray(p,p+4),q);
      if(base)base.set(background.subarray(p,p+4),q);
    }
    images.push({rgba:sample,size:32,background:base});
  }
  for(const image of images){
    const native=readCounterImage(image.rgba,image.background,image.size);
    if(native)return native;
  }
  const words=images.map(image=>readCountWord(image.rgba,image.size)).filter(Boolean);
  if(words.length && words.every(word=>word.count===words[0].count))return words[0];
  for(const image of images) {
    for(const threshold of [120,150,190]) {
      const foreground=countForeground(image.rgba,image.size,image.background,threshold);
      for(const area of [[.38,.57,1,1],[.48,.64,1,1],[.38,.68,1,1],[.55,.70,.98,.98]]) {
        const reading=readDigits(foreground,image.size,{area,min:0,light:true,buffSeconds:true,stackCount:true});
        if(reading.seconds!==null && !reading.clock && reading.confidence>=.90)candidates.push(reading);
        // The corner counter also uses the small quantity font, whose shapes
        // differ from central countdown digits (especially the upright 4).
        const [x,y,right,bottom]=area.map(v=>Math.floor(v*image.size));
        const quantity=readScreenText({w:image.size,h:image.size,rgba:foreground},
          {x,y,w:right-x,h:bottom-y},'fragment');
        if(/^(?:0|[1-9]\d{0,2})$/.test(quantity.text) && quantity.confidence>=.90)
          candidates.push({seconds:Number(quantity.text),confidence:quantity.confidence});
      }
    }
    // Clear native readings do not need every resampling phase.
    const strongest=candidates.reduce((best,r)=>!best || r.confidence>best.confidence ? r : best,null);
    if(strongest?.confidence>=.98 && !candidates.some(r=>r.seconds!==strongest.seconds &&
        r.confidence>=strongest.confidence-.035))break;
  }
  candidates.sort((a,b)=>b.confidence-a.confidence);
  const best=candidates[0];
  if(!best)return {count:null,confidence:0,unit:'count',seconds:null,digit:'unknown'};
  // Equally plausible different numbers remain unconfirmed.
  if(candidates.some(r=>r.seconds!==best.seconds && r.confidence>=best.confidence-.035))
    return {count:null,confidence:0,unit:'count',seconds:null,digit:'unknown'};
  return {count:best.seconds,confidence:best.confidence,unit:'count',seconds:null,digit:'visible'};
}

export function advanceStackClock(tr,now) {
  if(!Number.isInteger(tr.confirmedCount) || tr.countAnchorAt==null)return false;
  tr.countApprox=Boolean(tr.countNeedsEstimate || now-tr.lastReadAt>1000);
  tr.count=tr.countApprox ? Math.max(0,tr.confirmedCount-
    Math.floor(Math.max(0,now-tr.countAnchorAt)/STACK_COUNT_INTERVAL)) : tr.confirmedCount;
  tr.needsReinstall=tr.count===0;tr.state='active';
  if(tr.count===1 && !tr.alerted){tr.alerted=true;return true;}
  return false;
}

export function advanceStackCount(tr,r,now) {
  tr.deadline=null;tr.trackingMode='count';tr.lastAt=now;
  const same=tr.anchor && r.found && tr.anchor.size===r.size &&
    Math.abs(tr.anchor.x-r.x)<=r.size/4 && Math.abs(tr.anchor.y-r.y)<=r.size/4;
  if(!same)tr.countSample=null;
  if(r.found)tr.anchor={x:r.x,y:r.y,size:r.size};
  const valid=r.found && r.identity!==false && Number.isInteger(r.count) &&
    r.count>=0 && r.count<=MAX_STACK_COUNT && r.confidence>=.90;
  if(!valid){
    tr.countSample=null;tr.state='unknown';tr.countNeedsEstimate=true;
    return advanceStackClock(tr,now);
  }
  const previous=tr.countSample;
  tr.countSample={count:r.count,t:now};
  if(!previous || previous.count!==r.count || now-previous.t<250 || now-previous.t>3000) {
    tr.state='unknown';tr.countNeedsEstimate=true;return advanceStackClock(tr,now);
  }
  if(tr.confirmedCount!==r.count || now-tr.countAnchorAt>=STACK_COUNT_INTERVAL)tr.countAnchorAt=previous.t;
  tr.confirmedCount=r.count;tr.countNeedsEstimate=false;
  tr.count=r.count;tr.countApprox=false;tr.lastReadAt=now;tr.state='active';tr.needsReinstall=r.count===0;
  if(r.count>1)tr.alerted=false;
  if(r.count===1 && !tr.alerted){tr.alerted=true;return true;}
  return false;
}
