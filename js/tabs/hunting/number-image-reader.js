import {COUNT_IMAGE_SPRITES,COUNT_WORD_MASKS,MINUTE_IMAGE_SPRITES} from '../../data/number-glyphs.js';

const minuteMasks = MINUTE_IMAGE_SPRITES.map(({digit,w,h,mask}) => {
  const ink = [], outline = [];
  for (let i=0; i<mask.length; i++) {
    const x=i%w,y=Math.floor(i/w);
    if (mask[i]!=='1' && mask[i]!=='0') continue;
    const rivals=MINUTE_IMAGE_SPRITES.filter(sprite=>sprite.w===w && sprite.mask[i]===(mask[i]==='1' ? '0' : '1'));
    const point=[x,y,1+Math.min(rivals.length,3)*.5];
    if (mask[i]==='1') ink.push(point);
    else outline.push(point);
  }
  return {digit,w,h,ink,outline};
});

function matchMinuteImage(pixels,size) {
  const leftLimit=Math.floor(size*.125), right=Math.ceil(size*.68);
  const readings = new Map();
  for (let y=Math.floor(size*.57); y+minuteMasks[0].h<=size; y++) {
    const hits=Array.from({length:right},()=>[]);
    for (let x=0; x<right; x++) for (const mask of minuteMasks) {
      if (x+mask.w>right) continue;
      const matches = (points,color) => {
        let matched=0,total=0;
        for (const [dx,dy,weight] of points) {
          const pixel=pixels[(y+dy)*size+x+dx];
          matched+=pixel===color ? weight : pixel===0 ? weight*.22 : 0;
          total+=weight;
        }
        return matched/total;
      };
      const ink=matches(mask.ink,1);
      if (ink<.80) continue;
      const outline=matches(mask.outline,2);
      if (outline<.72) continue;
        const score=.62*ink+.38*outline;
      if (score>=.84) hits[x].push({digit:mask.digit,end:x+mask.w,score});
    }
    const next=hit=>hits.slice(hit.end-2,hit.end+2).flat();
    const add=(value,score)=>readings.set(value,Math.max(readings.get(value) ?? 0,score));
    for (let x=0; x<=leftLimit; x++) for (const first of hits[x]) {
      if (first.digit===0) continue;
      for (const second of next(first)) {
        const value=first.digit*10+second.digit;
        const thirds=value<=18 ? next(second).filter(third=>value*10+third.digit<=180) : [];
        if (!thirds.length) add(value,(first.score+second.score)/2);
        for (const third of thirds) {
          const minutes=value*10+third.digit;
          add(minutes,(first.score+second.score+third.score)/3+.035);
        }
      }
    }
  }
  const [best,next]=[...readings].sort((a,b)=>b[1]-a[1]);
  if (!best) return {match:null,ambiguous:false};
  const ambiguous=Boolean(next && best[1]-next[1]<(best[1]>=.96 ? .006 : .018));
  return {match:ambiguous ? null : best,ambiguous};
}

export function readMinuteImage(rgba,size) {
  const probe = (width,phaseX,phaseY) => {
    const pixels=new Uint8Array(width*width);
    for (let y=Math.floor(width*.57); y<width; y++) for (let x=0; x<Math.ceil(width*.68); x++) {
      const sx=Math.floor((x+phaseX)*size/width), sy=Math.floor((y+phaseY)*size/width);
      const p=(sy*size+sx)*4, r=rgba[p],g=rgba[p+1],b=rgba[p+2];
      const light=(r+2*g+b)/4;
      if (light>=120 && b>=r-24 && g>=r-25) pixels[y*width+x]=1;
      else if (light<104) pixels[y*width+x]=2;
    }
    return matchMinuteImage(pixels,width);
  };
  const {match:native,ambiguous:nativeAmbiguous}=probe(size,.5,.5);
  if (size===32 || native?.[1]>=.97) return {minutes:native?.[0] ?? null,ambiguous:nativeAmbiguous};
  let ambiguous=nativeAmbiguous;
  const votes=new Map();
  for (const y of [.2,.35,.5,.65,.8]) for (const x of [.2,.35,.5,.65,.8]) {
    const result=probe(32,x,y);
    ambiguous ||= result.ambiguous;
    if (!result.match) continue;
    const [value,score]=result.match;
    const vote=votes.get(value) ?? {count:0,score:0};
    vote.count++;
    vote.score=Math.max(vote.score,score);
    votes.set(value,vote);
  }
  const candidates=[...votes];
  const ranked=candidates.filter(([value])=>value>=100 ||
    !candidates.some(([other,vote])=>Math.floor(other/10)===value && vote.score>=.92));
  const [strong,runner]=ranked.sort((a,b)=>b[1].score-a[1].score);
  if (strong?.[1].score>=.95 && strong[1].score-(runner?.[1].score ?? 0)>=.04) {
    return {minutes:strong[0],ambiguous:false};
  }
  const [best,next]=ranked.sort((a,b)=>b[1].count-a[1].count || b[1].score-a[1].score);
  if (best && (best[1].count>=2 || best[1].score>=.93) &&
      (!next || (best[1].count>=next[1].count+2 && best[1].score>=next[1].score))) {
    return {minutes:best[0],ambiguous:false};
  }
  if (next || ambiguous) return {minutes:null,ambiguous:true};
  return {minutes:native?.[0] ?? null,ambiguous:false};
}

export function readCountWord(rgba,size,{singleCorner=false}={}){
  if(size!==32)return null;
  const luminance=new Float32Array(size*size);
  for(let i=0;i<luminance.length;i++){
    const p=i*4;
    luminance[i]=.25*rgba[p]+.55*rgba[p+1]+.20*rgba[p+2];
  }
  const candidates=[];
  for(const {count,w,h,mask} of COUNT_WORD_MASKS){
    if(singleCorner && count>9)continue;
    let best=null;
    for(let bottom=singleCorner ? 25 : 29;bottom<=32;bottom++)
      for(let right=singleCorner ? 25 : 27;right<=32;right++){
      let matchedShadow=0,misses=0,shadow=0,ink=0,shadowSum=0,inkSum=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const expected=mask[y*w+x];
        if(expected===' ')continue;
        const light=luminance[(bottom-h+y)*size+right-w+x];
        if(expected==='0'){
          shadow++;shadowSum+=light;
          if(light<90)matchedShadow++;
          else misses++;
        }else{
          ink++;inkSum+=light;
          if(light<90)misses++;
        }
      }
      const contrast=inkSum/ink-shadowSum/shadow;
      if(contrast<(singleCorner ? 60 : 85))continue;
      const score=singleCorner ? 30*(1-misses/(shadow+ink))+contrast/40 : matchedShadow-2*misses;
      if(!best || score>best.score)best={count,score,misses,total:shadow+ink};
    }
    if(best)candidates.push(best);
  }
  candidates.sort((a,b)=>b.score-a.score);
  const [best,next]=candidates;
  if(!best || best.misses>best.total*(singleCorner ? .10 : .04) || best.score-(next?.score??0)<(singleCorner ? 1.5 : 3))return null;
  return {count:best.count,confidence:1-best.misses/best.total,unit:'count',seconds:null,digit:'visible'};
}

const wordCache=new Map();
function countWords(size=32){
  if(wordCache.has(size))return wordCache.get(size);
  if(size!==32){
    const scale=size/32;
    const scaled=countWords().map(word=>{
      const left=Math.floor((32-word.w)*scale),top=Math.floor((32-word.h)*scale);
      const w=size-left,h=size-top,rgba=new Uint8ClampedArray(w*h*4);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const u=Math.min(word.w-1,(left+x+.5)/scale-.5-(32-word.w));
        const v=Math.min(word.h-1,(top+y+.5)/scale-.5-(32-word.h));
        const sx=Math.floor(u),sy=Math.floor(v),dx=u-sx,dy=v-sy;
        let alpha=0;const rgb=[0,0,0];
        for(const [ox,oy,weight] of [[0,0,(1-dx)*(1-dy)],[1,0,dx*(1-dy)],[0,1,(1-dx)*dy],[1,1,dx*dy]]){
          const xx=sx+ox,yy=sy+oy;if(xx<0||xx>=word.w||yy<0||yy>=word.h)continue;
          const p=(yy*word.w+xx)*4,a=word.rgba[p+3]/255*weight;alpha+=a;
          for(let c=0;c<3;c++)rgb[c]+=word.rgba[p+c]*a;
        }
        const q=(y*w+x)*4;
        if(alpha)for(let c=0;c<3;c++)rgba[q+c]=rgb[c]/alpha;
        rgba[q+3]=alpha*255;
      }
      return {value:word.value,w,h,rgba};
    });
    wordCache.set(size,scaled);return scaled;
  }
  const digits=new Map(COUNT_IMAGE_SPRITES.map(g=>[g.digit,g]));
  const words=Array.from({length:1000},(_,value)=>{
    const glyphs=[...String(value)].map(c=>digits.get(Number(c)));
    const w=glyphs.reduce((n,g)=>n+g.w-1,0)+1,h=Math.max(...glyphs.map(g=>g.h));
    const rgba=new Uint8ClampedArray(w*h*4);let left=0;
    for(const g of glyphs){
      for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){
        const p=(y*g.w+x)*4,q=(y*w+left+x)*4,a=g.rgba[p+3]/255,old=rgba[q+3]/255;
        const combined=a+old*(1-a);
        if(!combined)continue;
        for(let c=0;c<3;c++)rgba[q+c]=(g.rgba[p+c]*a+rgba[q+c]*old*(1-a))/combined;
        rgba[q+3]=combined*255;
      }
      left+=g.w-1;
    }
    return {value,w,h,rgba};
  });
  wordCache.set(size,words);return words;
}

// Match the actual coloured counter (including alpha, gradient and shadow)
// composited over its original skill artwork. This avoids throwing away the
// yellow upper strokes or mistaking the icon's white flower for a numeral.
export function readCounterImage(rgba,background,size=32){
  if(!background)return null;
  const scale=size/32,left=Math.floor(10*scale),top=Math.floor(18*scale),right=size-1,bottom=size-1;
  const coarseStep=Math.max(2,Math.round(2*scale));
  let baseline=0,pixels=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const p=(y*size+x)*4;if(background[p+3]<128)continue;
    for(let c=0;c<3;c++)baseline+=Math.abs(rgba[p+c]-background[p+c]);
    pixels++;
  }
  if(baseline<Math.max(400,pixels*3*2))return null;
  const gain=(word,x0,y0,step)=>{
    let sum=0;
    const minY=Math.max(top,y0),minX=Math.max(left,x0);
    for(let y=minY;y<Math.min(bottom,y0+word.h);y++){
      for(let x=minX;x<Math.min(right,x0+word.w);x++){
        if(step>1 && (x-left+y-top)%step)continue;
        const p=(y*size+x)*4,q=((y-y0)*word.w+x-x0)*4,a=word.rgba[q+3]/255;
        if(!a || background[p+3]<128)continue;
        for(let c=0;c<3;c++){
          const expected=word.rgba[q+c]*a+background[p+c]*(1-a);
          sum+=Math.abs(rgba[p+c]-background[p+c])-Math.abs(rgba[p+c]-expected);
        }
      }
    }
    return sum;
  };
  const bestByValue=new Map();
  const edges=[size,size-Math.round(scale),size-Math.round(2*scale)];
  for(const edgeX of edges)for(const edgeY of edges){
    const shortlist=[];
    for(const word of countWords(size)){
      const x=edgeX-word.w,y=edgeY-word.h,score=gain(word,x,y,coarseStep);
      if(score<=0 || shortlist.length===6 && score<=shortlist.at(-1).score)continue;
      shortlist.push({word,x,y,score});shortlist.sort((a,b)=>b.score-a.score);
      if(shortlist.length>6)shortlist.pop();
    }
    for(const entry of shortlist){
      const score=gain(entry.word,entry.x,entry.y,1);
      const previous=bestByValue.get(entry.word.value);
      if(previous===undefined || score>previous)bestByValue.set(entry.word.value,score);
    }
  }
  const ranked=[...bestByValue].sort((a,b)=>b[1]-a[1]),best=ranked[0];
  if(!best)return null;
  const fit=best[1]/baseline,margin=(best[1]-(ranked[1]?.[1]??0))/baseline;
  const error=(baseline-best[1])/Math.max(1,pixels*3*255);
  const confidence=Math.sqrt(Math.max(0,fit*(1-error)));
  if(fit<.82 || margin<(fit>=.90 ? .012 : .035) || confidence<.90)return null;
  return {count:best[0],confidence:Math.min(1,confidence),unit:'count',seconds:null,digit:'visible'};
}
