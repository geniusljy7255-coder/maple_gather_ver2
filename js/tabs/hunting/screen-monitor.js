import {readScreenText,parseExperience} from './screen-text.js';
let expJump=null, expLower=null, expBox=null,expPending=null,fragmentPending=null,fragmentConfirmed=null,lastRun=0,lastExpSuccess=0;
export function resetScreenMonitor(){expJump=null;expLower=null;expBox=null;expPending=null;fragmentPending=null;fragmentConfirmed=null;lastRun=0;lastExpSuccess=0;}
// Require every three-digit group even when the percent delimiter is damaged.
const groupedExperienceRow = /^\s*(\d{1,3}(?:[,.]\d{3}){2,})(?=\s*\[|\s*$|\s*\??\s*(?:\d{1,2}[.,]\d{1,4}|\d{5})%\]?\s*$)/;
function parseExperienceRow(text){
  const value=parseExperience(text);
  if (value?.raw && value.percent!==null) return value;
  const grouped=text.match(groupedExperienceRow);
  return grouped ? parseExperience(grouped[1]) : null;
}
function readEventExperience(F,box) {
  const tones=['exp-event'];
  for (const tone of tones) {
    const reading=readScreenText(F,box,tone);
    // A tiny decimal dot can disappear while all five percent digits survive.
    const text=reading.text.replace(/^\s*,(?=\d{1,3}[,.]\d{3})/,'').replace(/\[(\d{2})(\d{3})%\]/,'[$1.$2%]');
    const value=parseExperienceRow(text);
    if (value?.raw) return {value,text,box};
    if (tone==='exp-event' && /^\s*[0-9?,.]{8,}/.test(text)) {
      tones.push('exp-event-dim','exp-event-bright');
    }
  }
  return null;
}
function readClippedExperience(F,box) {
  // The bottom pixel row carries the commas. Use the complete percent suffix
  // to anchor the integer when only the top five rows are legible.
  const parseClipped = reading => {
    const text=reading.text.trim().replace(/\[(\d{1,2})(\d{3})%\]$/,'[$1.$2%]');
    if (reading.confidence<.90 || !/^\d{7,18}\[\d{1,2}[.,]\d{3}%\]$/.test(text)) return null;
    const value=parseExperience(text);
    return value?.raw && value.percent!==null ? {value,text,box} : null;
  };
  const reading=readScreenText(F,box,box.tone);
  const primary=parseClipped(reading);
  if (primary || !/^\s*[\d?]{7,18}\[/.test(reading.text)) return primary;
  const dim=parseClipped(readScreenText(F,box,'exp-event-clipped-dim'));
  const bright=parseClipped(readScreenText(F,box,'exp-event-clipped-bright'));
  return dim && bright && dim.text!==bright.text ? null : dim ?? bright;
}
function readScaledExperience(F,box) {
  const {x,y,w,h,sampleHeight,scale,phase,verticalPhase}=box;
  const sampleWidth=Math.floor(w/scale);
  const rgba=new Uint8ClampedArray(sampleWidth*sampleHeight*4);
  for(let row=0;row<sampleHeight;row++) {
    const sy=y+Math.min(h-1,Math.floor((row+verticalPhase)*scale));
    for(let col=0;col<sampleWidth;col++) {
      const sx=x+Math.floor((col+phase)*scale);
      const src=(sy*F.w+sx)*4,dst=(row*sampleWidth+col)*4;
      rgba[dst]=F.rgba[src];rgba[dst+1]=F.rgba[src+1];rgba[dst+2]=F.rgba[src+2];
    }
  }
  const sample={w:sampleWidth,h:sampleHeight,rgba};
  const area={x:0,y:0,w:sampleWidth,h:sampleHeight};
  const tones=sampleHeight<=7 ? ['exp-event'] : ['exp-overlay'];
  for(const tone of tones) {
    const reading=readScreenText(sample,area,tone);
    const text=reading.text.trim().replace(/^,(?=\d{1,3}[,.]\d{3})/,'')
      .replace(/\[(\d{1,2})(\d{3})%\]$/,'[$1.$2%]');
    if (tones.length===1 && /^[\d?,.]{8,}\s*\[/.test(text)) {
      tones.push(...(sampleHeight<=7 ? ['exp-event-dim','exp-event-bright'] : ['white','dim']));
    }
    if (!/^\d{1,3}(?:[,.]\d{3}){2,}\s*\[\d{1,2}[.,]\d{1,4}%?\]$/.test(text)) continue;
    const value=parseExperience(text);
    if (reading.confidence>=.84 && value?.raw && value.percent!==null) return {value,text,box};
  }
  return null;
}
function findScaledExperience(F) {
  const w=Math.ceil(F.w*.24),x=Math.floor((F.w-w)/2);
  const minY=Math.max(0,F.h-Math.max(32,Math.ceil((F.sourceHeight ?? F.h)*.08)));
  let bottom=null,bands=0;
  // Locate the text band by its repeated bright strokes. A title bar or
  // capture border changes its position without changing the glyph height.
  for(let y=F.h-1;y>=minY;y--) {
    let runs=0,lit=0,last=false;
    for(let col=x;col<x+w;col++) {
      const i=(y*F.w+col)*4;
      const bright=Math.min(F.rgba[i],F.rgba[i+1],F.rgba[i+2])>=105;
      if(bright) {lit++;if(!last)runs++;}
      last=bright;
    }
    const textRow=runs>=6 && lit<=w*.55;
    if(textRow && bottom===null) bottom=y+1;
    if(textRow || bottom===null) continue;
    const h=bottom-y-1;
    bottom=null;
    if(h<6 || h>30) continue;
    if(++bands>3) break;
    for(const sampleHeight of [7,10]) {
      const estimate=h/sampleHeight;
      const rounded=Math.round(estimate*20)/20;
      for(const scale of [rounded,rounded-.05,rounded+.05]) {
        for(const verticalPhase of [.5,.1,.9]) {
          for(const phase of [.5,.15,.85]) {
            const result=readScaledExperience(F,{x,y:y+1,w,h,sampleHeight,scale,phase,verticalPhase});
            if(result) return result;
          }
        }
      }
    }
  }
  return null;
}
function experience(F){
  if (expBox?.sampleHeight) {
    const tracked=readScaledExperience(F,expBox);
    if (tracked) return tracked;
  } else if (expBox?.tone==='exp-event') {
    const tracked=readEventExperience(F,expBox);
    if (tracked) return tracked;
  } else if (expBox?.tone==='exp-event-clipped') {
    const tracked=readEventExperience(F,{...expBox,h:7,tone:'exp-event'}) ??
      readClippedExperience(F,expBox);
    if (tracked) {expBox=tracked.box;return tracked;}
  } else if (expBox?.tone) {
    const reading = readScreenText(F, expBox, expBox.tone, expBox.mergeGaps);
    const value = parseExperienceRow(reading.text);
    if (value?.raw) {
      return {value,text:reading.text,box:expBox};
    }
  }
  if (F.w < 1600) {
    const w=Math.ceil(F.w*.22),x=Math.floor((F.w-w)/2);
    for (const offset of [4,3,2,1,5,0,6,7,8,9,10,11,12]) {
      const event=readEventExperience(F,{x,y:F.h-offset-7,w,h:7,tone:'exp-event'});
      if (event) {expBox=event.box;return event;}
    }
  }
  {
    const w = Math.ceil(F.w*.2);
    const x = Math.floor((F.w-w)/2);
    for (const [offset,h] of [[3,10],[2,11],[3,11],[1,11],[4,11],[1,13],[2,13],[0,11],[0,13]]) {
      for (const tone of (F.w >= 1600 ? ['white','dim','exp-overlay','exp'] : ['white','exp-overlay'])) {
        const box = {x,y:F.h-offset-h,w,h,tone};
        const reading = readScreenText(F,box,tone);
        const value = parseExperienceRow(reading.text);
        if (value?.raw) {
          expBox = box;
          return {value,text:reading.text,box};
        }
      }
    }
  }
  const scaled=findScaledExperience(F);
  if (scaled) {expBox=scaled.box;return scaled;}
  if (F.w < 1600) {
    const w=Math.ceil(F.w*.22),x=Math.floor((F.w-w)/2);
    for (const offset of [4,3,2,1,5,0,6,7,8,9,10,11,12]) {
      const clipped=readClippedExperience(F,{x,y:F.h-offset-7,w,h:5,tone:'exp-event-clipped'});
      if (clipped) {expBox=clipped.box;return clipped;}
    }
  }
  {
    const w = Math.ceil(F.w*.18), x = Math.floor((F.w-w)/2);
    // The title bar and thin window border change the bottom offset by a few pixels.
    for (const offset of [2,3,1,4,5,0,6,7,8,9,10]) {
      if (F.w >= 1600) {
        const event = readEventExperience(F,{x,y:F.h-offset-7,w,h:7,tone:'exp-event'});
        if (event) {expBox=event.box;return event;}
      }
      for (const h of (F.w < 1600 ? [7,8,6,9] : [10,11])) {
        for (const tone of (F.w < 1600 ? ['white','dim','exp-window'] : ['exp-window'])) {
          const box = {x,y:F.h-offset-h,w,h,tone};
          const {text} = readScreenText(F,box,tone);
          const value = parseExperienceRow(text);
          if (!value?.raw) continue;
          expBox = box;
          return {value,text,box};
        }
      }
    }
  }
  // Start with a narrow band so unrelated HUD elements do not merge with the digits.
  const width = Math.ceil(F.w * .44);
  const x = Math.floor((F.w - width) / 2);

  const boxes=[];
  if(expBox){
    const text=readScreenText(F,expBox,'white',Boolean(expBox.mergeGaps)),value=parseExperience(text.text);
    if(value?.raw)return {value,text:text.text,box:expBox};
    const dim = readScreenText(F,expBox,'dim',Boolean(expBox.mergeGaps));
    const fallback = parseExperience(dim.text);
    if (fallback?.raw && (fallback.percent !== null || fallback.raw.length === expPending?.raw.length)) {
      return {value:fallback,text:dim.text,box:expBox};
    }
  }
  for (const offset of [2, 4, 6, 0, 8, 12, 16, 24]) {
    for (const height of [10, 16, 22, 30]) {
      const box = {x,y:Math.max(0,F.h-offset-height),w:width,h:height};
      const text = readScreenText(F,box), value = parseExperience(text.text);
      if (value?.raw && value.percent !== null) {
        expBox = box;
        return {value,text:text.text,box};
      }
    }
  }
  // 전체 공유 화면에서 얇은 황록색 가로줄을 찾는다. 창 위치/화면 중앙에 고정하지 않는다.
  for(let y=F.h-2;y>0;y--){
    let longest=0,run=0,end=0;
    for(let x=0;x<F.w;x++){
      const p=(y*F.w+x)*4,r=F.rgba[p],g=F.rgba[p+1],b=F.rgba[p+2];
      if(r>130&&g>130&&b<100){run++;if(run>longest){longest=run;end=x;}}else run=0;
    }
    if(longest<Math.min(140,F.w*.1))continue;

    const left = end - longest + 1;
    if (longest>=550) {
      const w=Math.min(240,longest),x=left+Math.floor((longest-w)/2);
      for (const gap of [0,1,2,3]) {
        const event=readEventExperience(F,{x,y:y-7-gap,w,h:7,tone:'exp-event'});
        if (event) {expBox=event.box;return event;}
      }
    }

    for (const height of [7, 8, 9, 11, 13, 16]) {
      const x = Math.max(0, left);
      boxes.push({x,y:Math.max(0,y-height+1),w:F.w-x,h:height});
    }
    for(const height of [10,12,16,20])boxes.push({x:0,y:Math.max(0,y-height),w:F.w,h:height});
    if(boxes.length>24)break;
  }
  // 공유 화면에서 바 색이 흐리거나 잘린 경우에도 하단 숫자 줄을 검사한다.
  for (let offset = 0; offset <= 24; offset += 3) {
    for (const height of [9, 15]) {
      boxes.push({x:0,y:Math.max(0,F.h-offset-height),w:F.w,h:height});
    }
  }
  let bestText='경험치 숫자 자동 탐색 중';
  for(const box of boxes){
    const text=readScreenText(F,box),value=parseExperience(text.text);
    if(text.text.replace(/[^0-9]/g,'').length>bestText.replace(/[^0-9]/g,'').length)bestText=text.text;
    if(!value?.raw)continue;
    // 캐릭터 레벨은 같은 화면 하단의 Lv 표기로 확인할 때만 사용한다.
    const level=readScreenText(F,{x:0,y:box.y-45,w:Math.min(180,F.w*.2),h:25}).text.match(/Lv\.?(\d{2,3})/);
    if(level)value.level=Number(level[1]);
    expBox=box;return {value,text:text.text,box};
  }
  return {value:null,text:bestText,reason:'경험치 숫자 전체를 읽지 못했습니다'};
}
export function analyzeExperience(F,now) {
  const exp=experience(F);
  if (!exp) return null;
  if(exp.value){
    const current=exp.value,previous=expPending;
    const previousRaw=previous?.raw?BigInt(previous.raw):null,nextRaw=BigInt(current.raw);
    const leveled = previous?.level != null && current.level === previous.level + 1;
    let stable = previousRaw !== null &&
      (nextRaw>=previousRaw && nextRaw-previousRaw<=previousRaw/100n+1000000000n || leveled);
    if (previousRaw !== null && nextRaw < previousRaw && !leveled) {
      // A momentary low OCR result must not turn a return to the true value into a gain.
      const hits = expLower?.raw === current.raw && now-expLower.t < 2000 ? expLower.hits+1 : 1;
      expLower = {raw:current.raw,t:now,hits};
      if (hits >= 3) {
        expPending = {...current,t:now};
        expLower = null;
        stable = true;
      }
    } else {
      expLower = null;
      if (previousRaw !== null && !leveled && nextRaw > previousRaw) {
        const maxGain = previousRaw / 10000n + 1000000000n;
        const percentRegressed = previous.percent != null && current.percent != null && current.percent < previous.percent;
        const suspicious = nextRaw - previousRaw > maxGain;
        // A damaged percent glyph must not suppress a plausible integer increase.
        if (!suspicious && percentRegressed) {current.percent=null;exp.recheck=true;}
        if (suspicious) {
          // Repeated OCR can repeat the same wrong digit. When the percent is
          // available, a large integer gain should move it by a similar amount.
          const percentAgrees=previousRaw===0n || previous.percent==null ||
            previous.percent<.01 || current.percent==null ||
            Math.abs(current.percent-previous.percent-
              previous.percent*(Number(nextRaw-previousRaw)/Number(previousRaw)))<=.002;
          const agrees = expJump?.raw === current.raw && now-expJump.t <= 6500;
          expJump = percentAgrees ? {raw:current.raw,t:now} : null;
          stable = Boolean(agrees && percentAgrees &&
            (current.percent == null || previous.percent == null || current.percent >= previous.percent));
        } else expJump = null;
      }
      if (stable || previousRaw === null || (now-previous.t>6500 && nextRaw===previousRaw)) expPending = {...current,t:now};
    }
    if (previousRaw === null) {
      exp.reason='첫 경험치 기준값 확인됨';
      lastExpSuccess=now;
    } else if (stable) {
      exp.reason='경험치 숫자 확인됨';
      exp.previous=previous;
      lastExpSuccess=now;
    } else {
      exp.recheck=true;
      exp.reason='경험치 숫자 연속 확인 중';
      exp.value=null;
    }
  }else if(now-lastExpSuccess>3000){expBox=null; expJump=null; expLower=null;}
  return exp;
}

function locateFragmentCount(F,icon) {
  const left=Math.max(0,Math.floor(icon.x-icon.size*.6));
  const right=Math.min(F.w,Math.ceil(icon.x+icon.size*1.6));
  const top=Math.max(0,Math.floor(icon.y+icon.size+1));
  const bottom=Math.min(F.h,Math.ceil(icon.y+icon.size*2.5));
  const bands=[];let start=null,minX=right,maxX=left;
  for(let y=top;y<=bottom;y++) {
    let lit=0;
    if(y<bottom)for(let x=left;x<right;x++) {
      const p=(y*F.w+x)*4,r=F.rgba[p],g=F.rgba[p+1],b=F.rgba[p+2];
      if(r>=100 && g>=105 && b>=150 && b>=g*.93 && b>=r*.95) {
        lit++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      }
    }
    if(lit && start===null)start=y;
    if(!lit && start!==null) {
      const h=y-start,w=maxX-minX+1;
      // A clipped icon glow is not a quantity. Keep the complete text row.
      if(start>top && y<bottom && h>=5 && h<=Math.max(16,icon.size*.7) && w>=2 && w<=icon.size*2)
        bands.push({x:minX,y:start,w,h});
      start=null;minX=right;maxX=left;
    }
  }
  const candidates=[];
  for(const band of bands) {
    const votes=new Map();
    const accept=(reading)=>{
      if(!/^\d{1,6}$/.test(reading.text) || reading.confidence<.83)return;
      // Never accept the surviving half of a two-digit quantity as one digit.
      if(reading.text.length===1 && band.w>band.h*1.35)return;
      const vote=votes.get(reading.text) ?? {hits:0,reading};
      vote.hits++;
      if(reading.confidence>vote.reading.confidence)vote.reading=reading;
      votes.set(reading.text,vote);
    };
    const tones=['fragment','fragment-dim','fragment-soft','fragment-blue'];
    for(const tone of tones)accept(readScreenText(F,band,tone));
    if(![...votes.values()].some(v=>v.hits>=2 && v.reading.confidence>=.90)) {
      // Font size and label position can change independently of the icon.
      for(const targetHeight of [7,6]) {
        const scale=band.h/targetHeight,h=targetHeight;
        const estimate=Math.max(1,Math.round(band.w/scale));
        for(const w of new Set([estimate,Math.max(1,estimate-1),estimate+1])) {
        for(const phaseY of [.5,.2,.8,.95])for(const phaseX of [.5,.2,.8,.95]) {
          const rgba=new Uint8ClampedArray(w*h*4);
          for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
            const sx=band.x+Math.min(band.w-1,Math.floor((x+phaseX)*band.w/w));
            const sy=band.y+Math.min(band.h-1,Math.floor((y+phaseY)*band.h/h));
            const p=(sy*F.w+sx)*4;
            rgba.set(F.rgba.subarray(p,p+4),(y*w+x)*4);
          }
          for(const tone of tones)accept(readScreenText({w,h,rgba},{x:0,y:0,w,h},tone));
        }
        }
      }
    }
    const ranked=[...votes.values()].filter(v=>v.hits>=2)
      .sort((a,b)=>b.hits-a.hits || b.reading.confidence-a.reading.confidence);
    if(ranked[0])candidates.push({...ranked[0],box:band});
  }
  candidates.sort((a,b)=>b.hits-a.hits || b.reading.confidence-a.reading.confidence);
  return {located:bands.length>0,box:bands[0],...candidates[0]};
}

function readScaledFragmentCount(F,icon) {
  const scale=icon.size/24,w=40,h=12,votes=new Map();
  for(const phaseY of [.5,.2,.8,.95])for(const phaseX of [.5,.2,.8,.95]) {
    const rgba=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const sx=Math.floor(icon.x+(-8+x+phaseX)*scale);
      const sy=Math.floor(icon.y+(29+y+phaseY)*scale);
      if(sx<0 || sy<0 || sx>=F.w || sy>=F.h)continue;
      const p=(sy*F.w+sx)*4;
      rgba.set(F.rgba.subarray(p,p+4),(y*w+x)*4);
    }
    const phaseVotes=new Map();
    for(const tone of ['fragment','fragment-dim','fragment-soft','fragment-outline']) {
      const reading=readScreenText({w,h,rgba},{x:0,y:0,w,h},tone);
      if(!/^\d{1,6}$/.test(reading.text) || reading.confidence<.83)continue;
      const old=phaseVotes.get(reading.text);
      if(!old || reading.confidence>old.confidence)phaseVotes.set(reading.text,reading);
    }
    for(const reading of phaseVotes.values()) {
      const vote=votes.get(reading.text) ?? {hits:0,reading};
      vote.hits++;
      if(reading.confidence>vote.reading.confidence)vote.reading=reading;
      votes.set(reading.text,vote);
    }
  }
  const ranked=[...votes.values()].filter(v=>v.hits>=2)
    .sort((a,b)=>b.hits-a.hits || b.reading.confidence-a.reading.confidence);
  return ranked[0]?.reading;
}

export function analyzeScreen(F,results,now,earlyExperience){
  if(now-lastRun<500 && earlyExperience===undefined)return null;
  lastRun=now;
  const exp=earlyExperience===undefined ? analyzeExperience(F,now) : earlyExperience;
  const icon=results.find(r=>r.id==='fragments_icon'&&r.found);
  let fragments={value:null,text:'조각 UI 자동 탐색 중'};
  if(icon){
    fragments={value:null,text:'조각 아이콘 확인 · 숫자 판독 중'};
    const scale=icon.size/24;
    // 조각 아이콘 바로 아래 수량. UI 위치는 아이콘 탐색 결과로 결정.
    const located=locateFragmentCount(F,icon);
    const box=located.box;
    let reading=located.reading;
    if(located.box && located.box.y>=icon.y+29*scale &&
        located.box.y+located.box.h<=icon.y+41*scale) {
      const scaled=readScaledFragmentCount(F,icon);
      if(scaled && (scaled.text.length>1 || located.box.w<=located.box.h*1.35) &&
          (!reading || scaled.confidence>=reading.confidence))reading=scaled;
    }

    if (reading) {
      const count=Number(reading.text);
      const previous=fragmentPending;
      // Successful fragment scans run ten seconds apart.
      const recent=previous && now-previous.t<=25000 &&
        Math.max(Math.abs(previous.x-icon.x),Math.abs(previous.y-icon.y))<=icon.size/2;
      const equal=recent && previous.value===count;
      const firstIncrease=fragmentConfirmed===null && recent && count===previous.value+1 &&
        previous.confidence>=.90 && reading.confidence>=.90;
      fragmentPending={value:count,t:now,x:icon.x,y:icon.y,confidence:reading.confidence,hits:equal?previous.hits+1:1};
      const trusted=fragmentPending.hits>=2 || (fragmentConfirmed===null && reading.confidence>=.97) || firstIncrease;
      if (trusted) fragmentConfirmed=count;
      fragments={value:trusted?count:null,previous:firstIncrease?previous.value:null,text:reading.text,box};
    }
  }
  return exp ? {exp,fragments} : {fragments};
}
