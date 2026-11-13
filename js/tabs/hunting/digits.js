import { BUILTIN } from '../../data/builtin-icons.js';
/* 작은 노란 숫자 전용 판독. 낮은 점수/비슷한 후보는 읽지 않는다. */
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
export function readDigits(rgba,size,options={}) {
  const mask=new Uint8Array(size*size);
  const area=options.area||[.125,.1875,.875,.8125];
  const [x0,y0,x1,y1]=area.map(v=>Math.floor(v*size));
  let count=0;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
    const p=(y*size+x)*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];
    const yellow = r>140 && g>115 && Math.min(r,g)-b>65 && g>r*.60;
    const selected = options.dark
      ? Math.max(r,g,b)<105 && Math.max(r,g,b)-Math.min(r,g,b)<50
      : options.light
        ? Math.min(r,g,b)>150 && Math.max(r,g,b)-Math.min(r,g,b)<100
        : yellow;
    if (!selected) continue;
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
  const runs=[]; let start=null;
  for(let x=x0;x<=x1;x++) {
    let n=0; if(x<x1) for(let y=y0;y<y1;y++) n+=mask[y*size+x];
    if(n && start===null) start=x;
    if(!n && start!==null) {runs.push([start,x]);start=null;}
  }
  const unknown={seconds:null,confidence:0,digit:count*(32/size)**2<=2?'absent':'uncertain'};
  if(!runs.length || runs.length>3) return unknown;
  let text='', confidence=1, firstBounds;
  for(const [left,right] of runs) {
    const w=right-left,bits=new Uint8Array(w*size);
    let top=size,bottom=-1;
    for(let y=y0;y<y1;y++) for(let x=left;x<right;x++) if(mask[y*size+x]) {
      bits[y*w+x-left]=1; top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(bottom-top+1<size*.18 || bottom-top+1>size*.55) return unknown;
    if (options.aligned) {
      const tolerance = Math.max(1, Math.round(size * .08));
      if (firstBounds && (Math.abs(top-firstBounds.top)>tolerance || Math.abs(bottom-firstBounds.bottom)>tolerance)) return unknown;
      firstBounds ??= {top,bottom};
    }
    const glyph=normalize(bits,w,size),scores=Array(10).fill(0);
    for(const t of getTemplates()) {
      let intersection=0,total=0;
      for(let i=0;i<120;i++) {intersection+=glyph.bits[i]&t.bits[i];total+=glyph.bits[i]+t.bits[i];}
      const score=2*intersection/Math.max(1,total)-Math.abs(glyph.aspect-t.aspect)*.12;
      scores[t.digit]=Math.max(scores[t.digit],score);
    }
    const order=scores.map((score,digit)=>({score,digit})).sort((a,b)=>b.score-a.score);
    if(order[0].score<.83 || order[0].score-order[1].score<.055) return unknown;
    text+=order[0].digit; confidence=Math.min(confidence,order[0].score);
  }
  const seconds=Number(text);
  if((text.length>1 && text[0]==='0') || seconds<(options.min??6) || seconds>999) return unknown;
  return {seconds,confidence,digit:'visible'};
}
