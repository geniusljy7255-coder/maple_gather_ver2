import {SCREEN_GLYPHS,FILLED_EXP_GLYPHS,WINDOW_EXP_GLYPHS} from '../../data/screen-glyphs.js';
import { normalize, getTemplates } from './digits.js';
let bank, nativeBank, filledBank, windowBank, clippedWindowBank;
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
let fragmentBank;
function fragmentGlyphs() {
  if (fragmentBank) return fragmentBank;
  const captured = [
    ['2',['1111100','1001100','0000001','0111111','1000000','1000000','1111111']],
    ['3',['1111110','0001000','0000001','0011111','0000001','0000001','1111110']]
  ].map(([char,rows])=>({char,...normalize(Uint8Array.from(rows.join(''),Number),7,7)}));
  return fragmentBank = captured;
}
function distinguishSimilarExperienceDigits(ranked,glyph) {
  const [best,second]=ranked;
  if (!second || best[1]-second[1]>.08) return ranked;

  const ink=(xs,ys)=>ys.flatMap(y=>xs.map(x=>glyph.bits[y*10+x])).reduce((sum,bit)=>sum+bit,0);
  const upperLeft=ink([0,1],[3,4]);
  let digit;
  if ([best[0],second[0]].every(value=>value==='5'||value==='9')) {
    // 9 has an upper-right stroke below the top bar. 5 is open there.
    const upperRight=ink([8,9],[3,4,5]);
    if (upperLeft>=2) digit=upperRight>=4 ? '9' : upperRight<=1 ? '5' : null;
  } else if ([best[0],second[0]].every(value=>value==='8'||value==='9')) {
    const lowerLeft=ink([0,1],[7,8]);
    const lowerRight=ink([8,9],[7,8]);
    if (lowerRight>=2) digit=lowerLeft>=3 ? '8' : lowerLeft===0 ? '9' : null;
  } else if ([best[0],second[0]].every(value=>value==='6'||value==='8')) {
    // The upper-right stroke closes the top loop of 8.
    const upperRight=ink([8,9],[3,4]);
    const middleLeft=ink([0,1],[5,6]);
    if (upperLeft>=2) digit=upperRight>=3 && middleLeft<=1 ? '8' : upperRight<=1 && middleLeft>=2 ? '6' : null;
  } else if ([best[0],second[0]].every(value=>value==='3'||value==='8')) {
    // The two left edges close the loops of 8 and stay open in 3.
    const lowerLeft=ink([0,1],[7,8]);
    const upperRight=ink([8,9],[3,4]);
    const lowerRight=ink([8,9],[7,8]);
    if (upperRight>=2 && lowerRight>=2) {
      digit=upperLeft>=3 && lowerLeft>=3 ? '8' : upperLeft<=1 && lowerLeft<=1 ? '3' : null;
    }
  }
  if (!digit || best[0]===digit) return ranked;
  return [[digit,best[1]],[best[0],second[1]],...ranked.slice(2)];
}

export function readScreenText(F,box,tone='white', mergeGaps=false){
  const x0=Math.max(0,Math.round(box.x)),y0=Math.max(0,Math.round(box.y));
  const w=Math.min(Math.round(box.w),F.w-x0),h=Math.min(Math.round(box.h),F.h-y0);
  if(w<1||h<1)return {text:'',confidence:0};
  const bits=new Uint8Array(w*h),runs=[];
  const clippedWindow = tone.startsWith('exp-event-clipped');
  const eventThreshold = tone.endsWith('-dim') ? 98 : tone.endsWith('-bright') ? 145 :
    tone==='exp-event' || clippedWindow ? 115 : null;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=((y+y0)*F.w+x+x0)*4,r=F.rgba[p],g=F.rgba[p+1],b=F.rgba[p+2];
    if (tone === 'exp') {
      // White digits over the filled part of the EXP bar can pick up its yellow tint.
      bits[y*w+x] = r > 175 && b > 105 ? 1 : 0;
      continue;
    }
    if (eventThreshold!==null) {
      bits[y*w+x] = Math.min(r,g,b)>=eventThreshold ? 1 : 0;
      continue;
    }
    if (tone === 'exp-window') {
      // Compare the lightest shared RGB component against nearby bar pixels.
      const low=Math.min(r,g,b);
      const neighbors=[];
      for (const offset of [-12,-8,8,12]) {
        const nx=x+x0+offset;
        if (nx<0 || nx>=F.w) continue;
        const q=((y+y0)*F.w+nx)*4;
        neighbors.push(Math.min(F.rgba[q],F.rgba[q+1],F.rgba[q+2]));
      }
      neighbors.sort((a,b)=>a-b);
      const background=neighbors[Math.floor(neighbors.length/2)] ?? 0;
      bits[y*w+x] = low>=105 && low-background>=30 ? 1 : 0;
      continue;
    }
    if (tone === 'exp-overlay') {
      // Pale glyphs retain all three channels even over a saturated event bar.
      const low=Math.min(r,g,b), high=Math.max(r,g,b);
      bits[y*w+x] = low>112 && high>168 && low>=high*.61 ? 1 : 0;
      continue;
    }
    if (tone === 'fragment') {
      bits[y*w+x] = Math.min(r,g,b)>155 ? 1 : 0;
      continue;
    }
    bits[y*w+x]=tone==='purple'?(r>135&&b>150&&g>65&&g<r*.95?1:0):Math.min(r,g,b)>(tone==='dim'?125:155)&&Math.max(r,g,b)-Math.min(r,g,b)<65?1:0;
  }
  let start=null;
  for(let x=0;x<=w;x++){let count=0;if(x<w)for(let y=0;y<h;y++)count+=bits[y*w+x];
    if(count&&start===null)start=x;if(!count&&start!==null){if(mergeGaps && runs.length && start-runs.at(-1)[1]===1) runs.at(-1)[1]=x;
      else runs.push([start,x]);
      start=null;}}
  if (eventThreshold!==null) {
    // At this HUD scale two touching digits occupy about twelve pixels.
    for (let i=runs.length-1;i>=0;i--) {
      const [left,right]=runs[i];
      if (right-left>=11 && right-left<=14) {
        const pitch=7;
        runs.splice(i,1,[left,left+pitch-2],[left+pitch-1,right]);
      }
    }
  }
  if (tone === 'exp') {
    // The percent sign can split into several narrow segments after encoding.
    for (let i=runs.length-2;i>=0;i--) {
      const [left,right]=runs[i], next=runs[i+1];
      if (next[0]-right===1 && next[1]-left<=10 &&
          (right-left<=2 || next[1]-next[0]<=2)) {
        runs.splice(i,2,[left,next[1]]);
      }
    }
  }
  let text='',confidence=1,previousRight=null,lastRunRight=null;
  let baseline=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(bits[y*w+x])baseline=Math.max(baseline,y);
  const decimalBetween=(left,right)=>{
    for(let y=baseline;y<=Math.min(h-1,baseline+2);y++)for(let x=left;x<right;x++){
      const p=((y0+y)*F.w+x0+x)*4,colors=[F.rgba[p],F.rgba[p+1],F.rgba[p+2]];
      if(Math.min(...colors)<45||Math.max(...colors)>160||Math.max(...colors)-Math.min(...colors)>3)continue;
      const l=p-4,r=p+4;if(Math.max(F.rgba[l],F.rgba[l+1],F.rgba[l+2])<colors[0]-20&&Math.max(F.rgba[r],F.rgba[r+1],F.rgba[r+2])<colors[0]-20)return true;
    }return false;
  };
  for(const [index,[left,right]] of runs.entries()){
    if(lastRunRight!==null&&left-lastRunRight>=Math.max(8,h))text+=" ";
    lastRunRight=right;
    const width=right-left;if(width>h*1.5){text+='?';continue;}
    const sub=new Uint8Array(width*h);let top=h,bottom=-1;
    for(let y=0;y<h;y++)for(let x=left;x<right;x++)if(bits[y*w+x]){sub[y*width+x-left]=1;top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const height=bottom-top+1;
    if(height<=Math.max(2,Math.floor((baseline+1)*.35)) && width<=3){if(!text.endsWith(','))text+=',';previousRight=right;continue;}
    const n=normalize(sub,width,h),scores=new Map(),native=new Map();
    const compare = (templates, output, sample=n) => {
      for (const t of templates) {
        let intersect=0,total=0;
        for(let i=0;i<120;i++){intersect+=sample.bits[i]&t.bits[i];total+=sample.bits[i]+t.bits[i];}
        const score=2*intersect/Math.max(1,total)-Math.abs(sample.aspect-t.aspect)*.15;
        output.set(t.char,Math.max(output.get(t.char)||0,score));
      }
      return [...output].sort((a,b)=>b[1]-a[1]);
    };
    const resolveFiveNine = ranked => {
      const [best]=ranked;
      if (!/^[59]$/.test(best[0]) || width<5 || height<5) return null;
      const other=ranked.find(([char])=>char===(best[0]==='5'?'9':'5'));
      if (!other || other[1]<.65 || best[1]-other[1]>.27) return null;
      const light=(x,y)=>{
        const p=((y+y0)*F.w+x0+x)*4;
        return Math.min(F.rgba[p],F.rgba[p+1],F.rgba[p+2]);
      };
      // Look for the upper-right stroke in the original pixels. Thresholded
      // masks can erase it on 9 even when it stands out against the bar.
      const middle=left+Math.floor(width/2);
      const start=top+Math.max(1,Math.round(height*.18));
      const end=top+Math.max(2,Math.floor(height*.37));
      // The full top bar of 5 reaches the right edge. Preserve that evidence
      // when the bar behind the digit brightens pixels below it.
      if (best[0]==='5' && light(right-1,top)>=light(middle,top)*.82) return null;
      let closed=0,open=0;
      for(let y=start;y<=end;y++) {
        const background=light(middle,y);
        const leftStroke=Math.max(light(left,y),light(left+1,y))-background;
        const rightStroke=light(right-1,y)-background;
        if (leftStroke<25) continue;
        if (rightStroke>=Math.max(22,leftStroke*.30)) closed++;
        else if (rightStroke<=Math.max(10,leftStroke*.12)) open++;
      }
      if (closed>=2 && !open) return '9';
      return null;
    };
    if (tone === 'exp') {
      filledBank ??= FILLED_EXP_GLYPHS.map(g=>({char:g.char,...normalize(Uint8Array.from(g.bits,Number),g.w,g.h)}));
      const ranked = distinguishSimilarExperienceDigits(compare(filledBank,native),n);
      if (ranked[0][1]>=.80 && ranked[0][1]-ranked[1][1]>=.025) {
        text+=resolveFiveNine(ranked) ?? ranked[0][0];previousRight=right;confidence=Math.min(confidence,ranked[0][1]);
        continue;
      }
      native.clear();
    }
    if (clippedWindow) {
      clippedWindowBank ??= [...WINDOW_EXP_GLYPHS,...SCREEN_GLYPHS.filter(g=>g.h===7)]
        .map(g=>({char:g.char,...normalize(Uint8Array.from(g.bits.slice(0,g.w*5),Number),g.w,5)}));
      const [best,second]=compare(clippedWindowBank,native);
      if (best[1]>=.86 && best[1]-second[1]>=.035) {
        text+=best[0];previousRight=right;confidence=Math.min(confidence,best[1]);
      } else text+='?';
      continue;
    }
    if (eventThreshold!==null && height>=5 && width>=3 && width<=8) {
      windowBank ??= [...WINDOW_EXP_GLYPHS, ...SCREEN_GLYPHS.filter(g=>g.h===7 && /^\d$/.test(g.char))]
        .map(g=>({char:g.char,...normalize(Uint8Array.from(g.bits,Number),g.w,g.h)}));
      let ranked = distinguishSimilarExperienceDigits(compare(windowBank,native),n);
      const strokeDigit=resolveFiveNine(ranked);
      if (strokeDigit && ranked[0][1]>=.86) {
        text+=strokeDigit;previousRight=right;confidence=Math.min(confidence,ranked[0][1]);
        continue;
      }
      const closeFiveNine = /^[59]$/.test(ranked[0][0]) && /^[59]$/.test(ranked[1][0]) &&
        ranked[0][1]-ranked[1][1]<=.10;
      if (closeFiveNine || ranked[0][1]<.90 || ranked[0][1]-ranked[1][1]<.055) {
        const votes=new Map();
        for (const threshold of [105,130,155]) {
          const sampleBits=new Uint8Array(width*h);
          for (let y=0;y<h;y++) for (let x=0;x<width;x++) {
            const p=((y0+y)*F.w+x0+left+x)*4;
            sampleBits[y*width+x]=Math.min(F.rgba[p],F.rgba[p+1],F.rgba[p+2])>=threshold ? 1 : 0;
          }
          const sample=normalize(sampleBits,width,h);
          if (!sample) continue;
          const [best,second]=distinguishSimilarExperienceDigits(compare(windowBank,new Map(),sample),sample);
          if (best[1]>=.86 && best[1]-second[1]>=.035) {
            const vote=votes.get(best[0]) ?? {hits:0,ranked:[best,second]};
            vote.hits++;
            if (best[1]>vote.ranked[0][1]) vote.ranked=[best,second];
            votes.set(best[0],vote);
          }
        }
        const agreed=[...votes.values()].find(vote=>vote.hits>=2);
        if (agreed) ranked=agreed.ranked;
        else if (closeFiveNine && votes.size>1) {text+='?';continue;}
      }
      if (ranked[0][1]>=.86 && ranked[0][1]-ranked[1][1]>=.035) {
        text+=ranked[0][0];previousRight=right;confidence=Math.min(confidence,ranked[0][1]);
        continue;
      }
      // A bright outline at the bar boundary can widen a digit. If its
      // neighbors fit the native pitch, read the five-pixel slot they imply.
      const before=runs[index-1],after=runs[index+1];
      if (width>5 && before && after && before[1]-before[0]===5 &&
          after[1]-after[0]===5 && after[0]-before[0]===14) {
        const slot=before[0]+7;
        if (left<=slot && slot+5<=right) {
          const core=new Uint8Array(h*5);
          for(let y=0;y<h;y++)for(let x=0;x<5;x++){
            const p=((y+y0)*F.w+x0+slot+x)*4;
            core[y*5+x]=Math.min(F.rgba[p],F.rgba[p+1],F.rgba[p+2])>=205 ? 1 : 0;
          }
          const sample=normalize(core,5,h);
          if (sample) {
            const [best,second]=compare(windowBank,new Map(),sample);
            if (best[1]>=.92 && best[1]-second[1]>=.055) {
              text+=best[0];previousRight=slot+5;confidence=Math.min(confidence,best[1]);
              continue;
            }
          }
        }
      }
      native.clear();
    }
    if (tone === 'fragment') {
      const nativeRanked = compare(fragmentGlyphs(),native);
      const ranked = nativeRanked[0][1]>=.95 ? nativeRanked : compare(glyphBank().filter(g=>/^\d$/.test(g.char)),scores);
      if (ranked[0][1]<.80 || ranked[0][1]-ranked[1][1]<.025) {text+='?';continue;}
      text+=ranked[0][0];
      confidence=Math.min(confidence,ranked[0][1]);
      continue;
    }
    const trained=compare(nativeGlyphs(),native);
    const useNative=trained[0][1]>=.90&&trained[0][1]-trained[1][1]>=.04;
    let ranked=useNative?trained:compare(glyphBank(),scores);
    if (tone.startsWith('exp')) ranked=distinguishSimilarExperienceDigits(ranked,n);
    if(ranked[0][1]<.80||ranked[0][1]-ranked[1][1]<.025){text+='?';continue;}
    const char=(tone.startsWith('exp') ? resolveFiveNine(ranked) : null) ?? ranked[0][0];
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
  const candidates=[...prefix.matchAll(/\d{1,3}(?:[,.]\d{3}){2,}|\d{7,}/g)];
  const valid=candidates.filter(m=>!/[\d,?]/.test(prefix[m.index-1]||'')&&!/[\d,?]/.test(prefix[m.index+m[0].length]||''));
  const token=valid.sort((a,b)=>b[0].length-a[0].length)[0];
  // Short values are only admitted next to a valid percent marker.
  const short = percent!==null && percent>=0 && percent<100 ? prefix.trim().match(/^\d{1,3}(?:[,.]\d{3})?$/)?.[0] : null;
  const raw=(token?.[0] ?? short)?.replace(/[,.]/g,'') ?? null;
  if(raw===null && percent===null)return null;
  return {percent:percent!==null&&percent>=0&&percent<100?percent:null,raw,level:null};
}
