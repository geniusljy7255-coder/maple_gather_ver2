import {SCREEN_GLYPHS} from '../../data/screen-glyphs.js';
import { normalize, getTemplates } from './digits.js';
let bank, nativeBank;
function nativeGlyphs() {
  return nativeBank ??= SCREEN_GLYPHS.map(g => ({
    char:g.char,...normalize(Uint8Array.from(g.bits,Number),g.w,g.h)
  }));
}
function glyphBank(){
  if(bank)return bank;
  bank=getTemplates().map(t=>({...t,char:String(t.digit)}));
  bank.push(...nativeGlyphs());
  const small={'.':'0/0/0/0/0/1/1',',':'00/00/00/00/01/01/10','[':'11/10/10/10/10/10/11',']':'11/01/01/01/01/01/11','%':'11001/11010/00100/01000/10110/00110/00000'};
  for(const [char,pattern] of Object.entries(small)){const rows=pattern.split('/');bank.push({char,...normalize(Uint8Array.from(rows.join(''),Number),rows[0].length,rows.length)});}
  if(typeof OffscreenCanvas!=='undefined'){
    const canvas=new OffscreenCanvas(40,40),ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(const family of ['Arial','Tahoma','Verdana'])for(const weight of ['normal','bold'])for(const size of [8,9,10,11,12,14])for(const char of '0123456789.,[]%Lv'){
      ctx.clearRect(0,0,40,40);ctx.font=weight+' '+size+'px '+family;ctx.fillStyle='white';ctx.fillText(char,4,28);
      const data=ctx.getImageData(0,0,40,40).data,n=normalize(Uint8Array.from({length:1600},(_,i)=>data[i*4+3]>120?1:0),40,40);
      if(n)bank.push({char,...n});
    }
  }
  return bank;
}
export function readScreenText(F,box,tone='white'){
  const x0=Math.max(0,Math.round(box.x)),y0=Math.max(0,Math.round(box.y));
  const w=Math.min(Math.round(box.w),F.w-x0),h=Math.min(Math.round(box.h),F.h-y0);
  if(w<1||h<1)return {text:'',confidence:0};
  const bits=new Uint8Array(w*h),runs=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=((y+y0)*F.w+x+x0)*4,r=F.rgba[p],g=F.rgba[p+1],b=F.rgba[p+2];
    bits[y*w+x]=tone==='purple'?(r>135&&b>150&&g>65&&g<r*.95?1:0):Math.min(r,g,b)>(tone==='dim'?125:155)&&Math.max(r,g,b)-Math.min(r,g,b)<65?1:0;
  }
  let start=null;
  for(let x=0;x<=w;x++){let count=0;if(x<w)for(let y=0;y<h;y++)count+=bits[y*w+x];
    if(count&&start===null)start=x;if(!count&&start!==null){runs.push([start,x]);start=null;}}
  let text='',confidence=1,previousRight=null,lastRunRight=null;
  let baseline=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(bits[y*w+x])baseline=Math.max(baseline,y);
  const decimalBetween=(left,right)=>{
    for(let y=baseline;y<=Math.min(h-1,baseline+2);y++)for(let x=left;x<right;x++){
      const p=((y0+y)*F.w+x0+x)*4,colors=[F.rgba[p],F.rgba[p+1],F.rgba[p+2]];
      if(Math.min(...colors)<45||Math.max(...colors)>160||Math.max(...colors)-Math.min(...colors)>3)continue;
      const l=p-4,r=p+4;if(Math.max(F.rgba[l],F.rgba[l+1],F.rgba[l+2])<colors[0]-20&&Math.max(F.rgba[r],F.rgba[r+1],F.rgba[r+2])<colors[0]-20)return true;
    }return false;
  };
  for(const [left,right]of runs){
    if(lastRunRight!==null&&left-lastRunRight>=Math.max(8,h))text+=" ";
    lastRunRight=right;
    const width=right-left;if(width>h*1.5){text+='?';continue;}
    const sub=new Uint8Array(width*h);let top=h,bottom=-1;
    for(let y=0;y<h;y++)for(let x=left;x<right;x++)if(bits[y*w+x]){sub[y*width+x-left]=1;top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const height=bottom-top+1;
    if(height<=2 && width<=2){text+=',';previousRight=right;continue;}
    const n=normalize(sub,width,h),scores=new Map(),native=new Map();
    const compare = (templates, output) => {
      for (const t of templates) {
        let intersect=0,total=0;
        for(let i=0;i<120;i++){intersect+=n.bits[i]&t.bits[i];total+=n.bits[i]+t.bits[i];}
        const score=2*intersect/Math.max(1,total)-Math.abs(n.aspect-t.aspect)*.15;
        output.set(t.char,Math.max(output.get(t.char)||0,score));
      }
      return [...output].sort((a,b)=>b[1]-a[1]);
    };
    const trained=compare(nativeGlyphs(),native);
    const useNative=trained[0][1]>=.90&&trained[0][1]-trained[1][1]>=.04;
    const ranked=useNative?trained:compare(glyphBank(),scores);
    if(ranked[0][1]<.80||ranked[0][1]-ranked[1][1]<.025){text+='?';continue;}
    const char=ranked[0][0];
    if(previousRight!==null&&left-previousRight>=4&&/\d$/.test(text)&&/\d/.test(char)&&decimalBetween(previousRight,left))text+='.';
    text+=char;previousRight=right;confidence=Math.min(confidence,ranked[0][1]);
  }
  return {text,confidence:text.includes('?')?0:confidence};
}
export function parseExperience(text){
  const percentMatch=text.match(/\[(\d{1,2}[.,]\d{1,4})%?\]/);
  const percent=percentMatch?Number(percentMatch[1].replace(',', '.')):null;
  // 퍼센트나 괄호가 깨져도 큰 경험치 숫자를 독립적으로 읽는다. 중간에 빠진 자릿수는 거부한다.
  const prefix=percentMatch?text.slice(0,percentMatch.index):text;
  const candidates=[...prefix.matchAll(/\d{1,3}(?:,\d{3}){2,}|\d{7,}/g)];
  const valid=candidates.filter(m=>!/[\d,?]/.test(prefix[m.index-1]||'')&&!/[\d,?]/.test(prefix[m.index+m[0].length]||''));
  const token=valid.sort((a,b)=>b[0].length-a[0].length)[0];
  const raw=token?token[0].replaceAll(',',''):null;
  if(raw===null && percent===null)return null;
  return {percent:percent!==null&&percent>=0&&percent<100?percent:null,raw,level:null};
}
