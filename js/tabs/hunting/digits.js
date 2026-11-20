import { RUNE_COOLDOWN_GLYPHS, SCREEN_GLYPHS } from '../../data/screen-glyphs.js';
import { BUILTIN } from '../../data/builtin-icons.js';
import {TIMER_IMAGE_GLYPHS,COUNT_IMAGE_GLYPHS} from '../../data/number-glyphs.js';
/* 작은 노란 숫자 전용 판독. 낮은 점수/비슷한 후보는 읽지 않는다. */
const LARGE_TIMER_GLYPHS = [[5,7,"000000000000000000000000000000000001111111111111111000001100000110000011100001111110000011100000110000011000011111111111111110000000000000000000000000000000000000000000"],[4,8,"000000000000000000000000000000000000000000001110000011100001111000011110000111100011111001101110011111101111111011111111000001100000011000000000000000000000000000000000000000000000000000000000"],[7,8,"000000000000000000000000000000000000000011111111011111110000011100000110000001100000110000001100000110000001100000110000001100000111000000100000000000000000000000000000000000000000000000000000"],[5,7,"000000000000000000000000000000000001111111111111111000001100000111000011100001111111000011100000110000011000011111111111111110000000000000000000000000000000000000000000"],[4,8,"000000000000000000000000000000000000000000001100000011100001111000011110001111100111011001101110011011101111111111111111000011100000011000000110000000000000000000000000000000000000000000000000"],[8,8,"000000000000000000000000000000000000000001111110111111111100001111000011110000111110111101111110111001111100001111000011111001111111111101111110000000000000000000000000000000000000000000000000"],[6,8,"000000000000000000000000000000000000000000111111011111111100000011000000110000001100000011111110111001111100001111000011110001111111111101111110000000000000000000000000000000000000000000000000"],[9,8,"000000000000000000000000000000000000000001111110111111111100001111000011110000111100001101111111000111110000001100000011000001110111111001111110000000000000000000000000000000000000000000000000"],[3,7,"000000000000000000000000000000000001111110111111100000110000011000011100001110111111000011100000110000011000011111111111111110000000000000000000000000000000000000000000"],[8,8,"000000000000000000000000000000000000000001111110111111111100001111000011111000111111011101111110111101111110001111000011111000111111111101111110000000000000000000000000000000000000000000000000"],[5,7,"000000000000000000000000000000000001111111111111111000001100000110000011100001111111000011100000110000011000011111111111111110000000000000000000000000000000000000000000"],[9,8,"000000000000000000000000000000000000000001111110111111111100001111000011110000111100001101111111000111110000001100000011000001110111111001111100000000000000000000000000000000000000000000000000"]];
const GOLD_GLYPHS = [[3,6,"111110111111000011000011000011000111111111000011000011000011000011111111111110"],[1,3,"111111111111111111011011011011111011011"],[3,7,"1111110111111100000110000011000011100001111111111000011100000110000011000011111111111111110"],[0,8,"01111110111111111100001111000011110000111100001111000011110000111100001111000011111001111111111101111110"],[2,7,"1111111111111100000010000001000000100000110000111000111000011000011000111100011111111111111"],[9,8,"01111110111111111100001111000011110000111100001111111111000111110000001100000011000001111111111011111110"],[2,7,"1111111111111100000010000001000000100000110000111000111000011000011000111100011111111111111"],[7,7,"1111111111111100000110000110000011000011100001100001110000110000011000011000011100001110000"],[2,7,"1111111111111100000110000001000000100000110000111000111000011000011000111100011111111111111"],[5,7,"1111111111111111100001110000111000011100001111111000011100000110000011000011111111111111110"],[2,7,"1111111111111100000010000001000000100000110000111000111000011000011000111100011111111111111"],[3,7,"1111110111111100001110000111000011100001111111110000011100001110000011000011111111111111100"],[2,7,"1111111111111100000010000001000000100000110000111000111000011000011000111100011111111111111"],[2,7,"1111110111111100000110000011000001100000110000111000111000011000111000111100011111111111111"],[2,7,"1111111111111100000010000001000000100000110000111000111000011000011000111100011111111111111"],[0,8,"01111110111111111100001111000011110000111100001111000011110000111100001111000011111001111111111101111110"]];
let goldTemplates;
let largeTemplates;
const FONT = [
 '01110/10001/10011/10101/11001/10001/01110',
 '00100/01100/00100/00100/00100/00100/01110',
 '01110/10001/00001/00010/00100/01000/11111',
 '11110/00001/00001/01110/00001/00001/11110',
 '00010/00110/01010/10010/11111/00010/00010',
 '11111/10000/10000/11110/00001/00001/11110',
 '01110/10000/10000/11110/10001/10001/01110',
 '11111/00001/00010/00100/01000/01000/01000',
 '01110/10001/10001/01110/10001/10001/01110',
 '01110/10001/10001/01111/00001/00001/01110'
];
export function normalize(bits, w, h) {
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(bits[y*w+x]) {
    x0=Math.min(x0,x); y0=Math.min(y0,y); x1=Math.max(x1,x); y1=Math.max(y1,y);
  }
  if(x1<0) return null;
  const bw=x1-x0+1,bh=y1-y0+1, out=new Uint8Array(120);
  for(let y=0;y<12;y++) for(let x=0;x<10;x++)
    out[y*10+x]=bits[(y0+Math.min(bh-1,Math.floor((y+.5)*bh/12)))*w+x0+Math.min(bw-1,Math.floor((x+.5)*bw/10))];
  return {bits:out,aspect:bw/bh};
}
let templates;
export function getTemplates() {
  if(templates) return templates;
  templates=FONT.map((rows,digit)=>({digit,...normalize(Uint8Array.from(rows.replaceAll('/',''),Number),5,7)}));
  // 브라우저 기본 글꼴도 후보로 준비. 외부 OCR 서비스나 다운로드는 사용하지 않는다.
  if(typeof OffscreenCanvas !== 'undefined') {
    const c=new OffscreenCanvas(32,32),ctx=c.getContext('2d',{willReadFrequently:true});
    for(const family of ['Arial','Tahoma','Verdana']) for(const weight of ['normal','bold'])
      for(const size of [11,12,13,14]) for(let digit=0;digit<10;digit++) {
        ctx.clearRect(0,0,32,32); ctx.font=weight+' '+size+'px '+family;
        ctx.fillStyle='white'; ctx.fillText(String(digit),4,22);
        const rgba=ctx.getImageData(0,0,32,32).data;
        const n=normalize(Uint8Array.from({length:1024},(_,i)=>rgba[i*4+3]>=120?1:0),32,32);
        if(n) templates.push({digit,...n});
      }
  }
  // 내장 실제 게임 캡처의 숫자: 야누스 65/40, 파운틴 48/42.
  // 판독 로직과 독립적으로 육안 확인한 라벨이며 사용자 등록은 필요 없다.
  for(const [img,label] of [[BUILTIN.janus.buff,'65'],[BUILTIN.janus.slot,'40'],
    [BUILTIN.fountain.buff,'48'],[BUILTIN.fountain.slot,'42']]) {
    const size=img.w, mask=new Uint8Array(size*size), runs=[];
    for(let y=6;y<26;y++) for(let x=4;x<28;x++) {
      const p=(y*size+x)*4,r=img.rgba[p],g=img.rgba[p+1],b=img.rgba[p+2];
      mask[y*size+x]=r>140 && g>115 && Math.min(r,g)-b>65 && g>r*.60 ? 1:0;
    }
    let start=null;
    for(let x=4;x<=28;x++) {
      let n=0;if(x<28) for(let y=6;y<26;y++) n+=mask[y*size+x];
      if(n && start===null) start=x;
      if(!n && start!==null) {runs.push([start,x]);start=null;}
    }
    if(runs.length!==label.length) continue;
    runs.forEach(([left,right],index)=>{
      const w=right-left,bits=new Uint8Array(w*size);
      for(let y=0;y<size;y++) for(let x=left;x<right;x++) bits[y*w+x-left]=mask[y*size+x];
      templates.push({digit:Number(label[index]),...normalize(bits,w,size)});
    });
  }
  return templates;
}
export function applyTimerFormat(reading,format) {
  if (format==='clock' && !reading.clock && reading.unit!=='minutes' && reading.seconds>=60) {
    const digits=reading.seconds;
    const seconds=digits%100;
    // This display mode uses M:SS below ten minutes and SS below one minute.
    if (Number.isInteger(digits) && digits>=100 && digits<=959 && seconds<60) {
      return {...reading,seconds:Math.floor(digits/100)*60+seconds,unit:'seconds',clock:true};
    }
    return {...reading,seconds:null,confidence:0,digit:'uncertain'};
  }
  return reading;
}

let runeCooldownTemplates,minuteLabelTemplates,buffSecondsTemplates;
const imageTemplateCache=new Map();
function getImageNumberTemplates(kind='timer',height=0) {
  const key=kind+':'+height;
  if(imageTemplateCache.has(key))return imageTemplateCache.get(key);
  const templates=[],exact=new Map();
  for(const g of kind==='count'?COUNT_IMAGE_GLYPHS:TIMER_IMAGE_GLYPHS){
    const shapes=g.shapes.filter(([,h])=>kind==='count' || !height || h===height);
    if(!shapes.length)continue;
    const bits=Uint8Array.from(g.bits,Number);
    for(const [w,h] of shapes){
      const template={digit:g.digit,bits,aspect:w/h};templates.push(template);
      const matches=exact.get(g.bits)??[];matches.push(template);exact.set(g.bits,matches);
    }
  }
  templates.exact=exact;imageTemplateCache.set(key,templates);return templates;
}
export function readDigits(rgba,size,options={}) {
  const primary=readDigitPass(rgba,size,options);
  if(primary.imageFont || options.light || options.dark || options.goldTimer)return primary;
  for(const timerThreshold of [115,96,175]){
    const reading=readDigitPass(rgba,size,{...options,timerThreshold});
    if(reading.seconds!==null && reading.imageFont)return reading;
  }
  if(size>32){
    const votes=new Map();
    for(const phaseY of [.5,.2,.8,.95])for(const phaseX of [.5,.2,.8,.95]){
      const sample=new Uint8ClampedArray(32*32*4),background=options.background && new Uint8ClampedArray(sample.length);
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        const sx=Math.min(size-1,Math.floor((x+phaseX)*size/32)),sy=Math.min(size-1,Math.floor((y+phaseY)*size/32));
        const p=(sy*size+sx)*4,q=(y*32+x)*4;
        sample.set(rgba.subarray(p,p+4),q);
        if(background)background.set(options.background.subarray(p,p+4),q);
      }
      const phaseReads=new Map();
      for(const timerThreshold of [140,115,96,175]){
        const read=readDigitPass(sample,32,{...options,background,timerThreshold});
        if(read.seconds!==null && read.imageFont && read.confidence>=.95)phaseReads.set(read.seconds,read);
      }
      for(const read of phaseReads.values()){
        const vote=votes.get(read.seconds)??{hits:0,reading:read};vote.hits++;votes.set(read.seconds,vote);
      }
    }
    const ranked=[...votes.values()].sort((a,b)=>b.hits-a.hits);
    if(ranked[0] && (ranked.length===1 || ranked[0].hits>=ranked[1].hits+2))return ranked[0].reading;
  }
  if(size<28 && options.buffSeconds && !primary.imageFont)
    return {seconds:null,confidence:0,digit:'uncertain'};
  return primary;
}
function readDigitPass(rgba,size,options) {
  const mask=new Uint8Array(size*size);
  const area=options.area||[.125,.1875,.875,.8125];
  const [x0,y0,x1,y1]=area.map(v=>Math.floor(v*size));
  let count=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
    const p=(y*size+x)*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];
    const yellow = options.faintYellow
      ? r>125 && g>100 && Math.min(r,g)-b>45 && g>r*.60
      : r>(options.timerThreshold??140) && g>(options.timerThreshold??140)*.82 && Math.min(r,g)-b>65 && g>r*.60;
    const selected = options.dark
      ? Math.max(r,g,b)<105 && Math.max(r,g,b)-Math.min(r,g,b)<50
      : options.light
        ? Math.min(r,g,b)>(options.lightThreshold ?? 150) && Math.max(r,g,b)-Math.min(r,g,b)<100
        : options.goldTimer ? yellow && g >= r*(options.goldRatio ?? .87) : yellow;
    if (!selected) continue;
    if (options.outlinedLight || options.outlinedGold) {
      let outline=false;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(x+dx<0 || x+dx>=size || y+dy<0 || y+dy>=size)continue;
        const q=((y+dy)*size+x+dx)*4;
        outline ||= Math.max(rgba[q],rgba[q+1],rgba[q+2])<95;
      }
      if(!outline)continue;
    }
    const base = options.background;
    if (base && base[p+3]>=128) {
      const br=base[p], bg=base[p+1], bb=base[p+2];
      const sameColor=Math.max(Math.abs(r-br),Math.abs(g-bg),Math.abs(b-bb))<=45;
      const baseYellow=br>140 && bg>115 && Math.min(br,bg)-bb>65 && bg>br*.60;
      if (sameColor || (!options.light && baseYellow && r<br+25 && g<bg+25)) continue;
    }
    mask[y*size+x]=1;
    count++;
  }
  if (options.goldTimer) {
    const seen = new Uint8Array(mask.length);
    for (let y=y0; y<y1; y++) for (let x=x0; x<x1; x++) {
      const start=y*size+x;
      if (!mask[start] || seen[start]) continue;
      const component=[start];
      seen[start]=1;
      for (let i=0;i<component.length;i++) {
        const p=component[i], px=p%size, py=Math.floor(p/size);
        for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
          const next=p+dy*size+dx;
          if (px+dx<x0 || px+dx>=x1 || py+dy<y0 || py+dy>=y1 || !mask[next] || seen[next]) continue;
          seen[next]=1;
          component.push(next);
        }
      }
      if (component.length < Math.max(3,Math.round(size*size*.003))) {
        for (const pixel of component) mask[pixel]=0;
        count-=component.length;
      }
    }
  }
  const runs=[]; let start=null;
  for(let x=x0;x<=x1;x++) {
    let n=0; if(x<x1) for(let y=y0;y<y1;y++) n+=mask[y*size+x];
    if(n && start===null) start=x;
    if(!n && start!==null) {runs.push([start,x]);start=null;}
  }
  const unknown={seconds:null,confidence:0,digit:count*(32/size)**2<=2?'absent':'uncertain'};
  if(!runs.length || runs.length>(options.longTimer?5:4) || (!options.longTimer && options.clockOnly && runs.length!==4)) return unknown;
  const colonIndex=options.longTimer && runs.length>=4 ? runs.length-3 : 1;
  const [colonLeft,colonRight]=runs[colonIndex] ?? [];
  let colonGroups=0,colonPrevious=false;
  for(let y=y0;y<y1 && colonLeft!==undefined;y++){
    let lit=false;
    for(let x=colonLeft;x<colonRight;x++) lit ||= Boolean(mask[y*size+x]);
    if(lit && !colonPrevious) colonGroups++;
    colonPrevious=lit;
  }
  const clockLayout=options.longTimer
    ? runs.length>=4 && colonRight-colonLeft<=Math.ceil(size*.10) && colonGroups===2
    : runs.length===4;
  if((options.clockOnly || runs.length===5) && !clockLayout) return unknown;
  let text='', confidence=1, firstBounds,allNative=true;
  for(const [index,[left,right]] of runs.entries()) {
    const w=right-left,bits=new Uint8Array(w*size);
    let top=size,bottom=-1;
    for(let y=y0;y<y1;y++) for(let x=left;x<right;x++) if(mask[y*size+x]) {
      bits[y*w+x-left]=1; top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if (clockLayout && index===colonIndex) {
      if (w>Math.ceil(size*.10) || !firstBounds ||
          top<firstBounds.top || bottom>firstBounds.bottom || bottom-top>=firstBounds.bottom-firstBounds.top) return unknown;
      if (colonGroups!==2) return unknown;
      text+=':';
      continue;
    }
    if(bottom-top+1<size*(options.minGlyphHeight ?? .18) || bottom-top+1>size*.55) return unknown;
    if (options.aligned || clockLayout) {
      const tolerance = Math.max(1, Math.round(size * .08));
      if (firstBounds && (Math.abs(top-firstBounds.top)>tolerance || Math.abs(bottom-firstBounds.bottom)>tolerance)) return unknown;
    }
    firstBounds ??= {top,bottom};
    const glyph=normalize(bits,w,size),scores=Array(10).fill(0);
    const templates = options.minuteLabel
      ? (minuteLabelTemplates ??= [...getTemplates(),
          ...SCREEN_GLYPHS.filter(g=>g.h<=7 && /^\d$/.test(g.char)).map(g=>({
            digit:Number(g.char),...normalize(Uint8Array.from(g.bits,Number),g.w,g.h)
          })),
          {digit:1,...normalize(new Uint8Array(5).fill(1),1,5)}
        ])
      : options.buffSeconds
      ? (buffSecondsTemplates ??= [...getTemplates(),...RUNE_COOLDOWN_GLYPHS,
          ...SCREEN_GLYPHS.filter(g=>g.h<=8 && /^\d$/.test(g.char)).map(g=>({...g,digit:Number(g.char)}))]
          .map(g=>typeof g.bits==='string' ? {...g,...normalize(Uint8Array.from(g.bits,Number),g.w,g.h)} : g))
      : options.runeCooldown || clockLayout
      ? (runeCooldownTemplates ??= [...getTemplates(),...RUNE_COOLDOWN_GLYPHS.map(g=>({
          digit:g.digit,...normalize(Uint8Array.from(g.bits,Number),g.w,g.h)
        }))])
      : options.goldTimer
      ? (goldTemplates ??= GOLD_GLYPHS.map(([digit,width,bits]) => ({
        digit,...normalize(Uint8Array.from(bits,Number),width,13)
      })))
      : size >= 40
      ? (largeTemplates ??= LARGE_TIMER_GLYPHS.map(([digit,width,bits]) => ({
          digit,...normalize(Uint8Array.from(bits,Number),width,24)
        })))
      : getTemplates();
    for(const t of templates) {
      let intersection=0,total=0;
      for(let i=0;i<120;i++) {intersection+=glyph.bits[i]&t.bits[i];total+=glyph.bits[i]+t.bits[i];}
      const score=2*intersection/Math.max(1,total)-Math.abs(glyph.aspect-t.aspect)*.12;
      scores[t.digit]=Math.max(scores[t.digit],score);
    }
    let nativeExact=false;
    if(options.stackCount || options.minuteLabel || !options.light && !options.dark) {
      const nativeScores=Array(10).fill(0);
      const references=getImageNumberTemplates(options.stackCount || options.minuteLabel ? 'count' : 'timer',bottom-top+1);
      const matches=references.exact.get(glyph.bits.join(''))?.filter(t=>Math.abs(t.aspect-glyph.aspect)<.2);
      const precise=matches && new Set(matches.map(t=>t.digit)).size===1;
      for(const t of precise ? matches : references) {
        let intersection=0,total=0;
        for(let i=0;i<120;i++){intersection+=glyph.bits[i]&t.bits[i];total+=glyph.bits[i]+t.bits[i];}
        nativeScores[t.digit]=Math.max(nativeScores[t.digit],2*intersection/Math.max(1,total)-Math.abs(glyph.aspect-t.aspect)*.12);
      }
      const order=[...nativeScores].sort((a,b)=>b-a);
      nativeExact=order[0]>=.96 && order[0]-order[1]>=.055;
      for(let digit=0;digit<10;digit++)scores[digit]=nativeExact ? nativeScores[digit] : Math.max(scores[digit],nativeScores[digit]);
    }
    allNative &&= nativeExact;
    if (!nativeExact && size >= 40 && Math.max(...scores) < .83) {
      const fallback = clockLayout
        ? (largeTemplates ??= LARGE_TIMER_GLYPHS.map(([digit,width,bits])=>({
            digit,...normalize(Uint8Array.from(bits,Number),width,24)
          })))
        : getTemplates();
      for (const t of fallback) {
        let intersection=0,total=0;
        for(let i=0;i<120;i++){intersection+=glyph.bits[i]&t.bits[i];total+=glyph.bits[i]+t.bits[i];}
        scores[t.digit]=Math.max(scores[t.digit],2*intersection/Math.max(1,total)-Math.abs(glyph.aspect-t.aspect)*.12);
      }
    }
    if(!nativeExact && (options.minuteLabel || options.buffSeconds)) {
      const middle=Array.from({length:4},(_,x)=>glyph.bits[5*10+x+3]+glyph.bits[6*10+x+3]).reduce((a,b)=>a+b,0);
      const leftStroke=(start,end)=>{
        let count=0;
        for(let y=start;y<=end;y++)for(let x=0;x<=2;x++)count+=glyph.bits[y*10+x];
        return count;
      };
      const upperLeft=leftStroke(2,4),lowerLeft=leftStroke(7,9);
      // 0 has an open center. The other rounded digits carry a center
      // stroke, and 6/8 retain more of the lower-left edge than 5/9.
      if(middle>=5 && Math.max(scores[3],scores[5],scores[6],scores[8],scores[9])>=scores[0]-.10)scores[0]-=.10;
      if(middle<=1 && scores[0]>=Math.max(...scores)-.045)scores[0]+=.065;
      if(middle>=4 && upperLeft>=5 && scores[9]>=scores[8]-.07 && lowerLeft<=2)scores[9]+=.05;
      if(middle>=4 && lowerLeft>=6 && scores[6]>=scores[5]-.07)scores[6]+=.045;
    }
    const order=scores.map((score,digit)=>({score,digit})).sort((a,b)=>b.score-a.score);
    const relaxedMinute=options.minuteLabel && options.outlinedLight;
    if(order[0].score<(relaxedMinute ? .79 : .83) || order[0].score-order[1].score<(relaxedMinute ? .032 : .055)) return unknown;
    text+=order[0].digit; confidence=Math.min(confidence,order[0].score);
  }
  if (text.includes(':')) {
    const clock=text.match(options.longTimer ? /^([1-9]\d?):([0-5]\d)$/ : /^([1-9]):([0-5]\d)$/);
    if (!clock) return unknown;
    return {seconds:Number(clock[1])*60+Number(clock[2]),confidence,digit:'visible',unit:'seconds',clock:true,...(allNative?{imageFont:true}:{})};
  }
  const seconds=Number(text);
  if((text.length>1 && text[0]==='0') || seconds<(options.min??6) || seconds>(options.longTimer?9999:999)) return unknown;
  return {seconds,confidence,digit:'visible',...(allNative?{imageFont:true}:{})};
}
