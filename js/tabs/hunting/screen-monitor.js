import {readScreenText,parseExperience} from './screen-text.js';
let expJump=null, expLower=null, expBox=null,expPending=null,fragmentPending=null,fragmentConfirmed=null,lastRun=0,lastExpSuccess=0;
export function resetScreenMonitor(){expJump=null;expLower=null;expBox=null;expPending=null;fragmentPending=null;fragmentConfirmed=null;lastRun=0;lastExpSuccess=0;}
function experience(F){
  if (expBox?.tone) {
    const reading = readScreenText(F, expBox, expBox.tone, expBox.mergeGaps);
    const value = parseExperience(reading.text);
    if (value?.raw && (value.percent !== null || value.raw.length === expPending?.raw.length)) {
      return {value,text:reading.text,box:expBox};
    }
  }
  if (F.w >= 1600) {
    const w = Math.ceil(F.w*.2);
    const x = Math.floor((F.w-w)/2);
    for (const [offset,h] of [[3,10],[2,11],[3,11],[1,11],[4,11],[1,13],[2,13],[0,11],[0,13]]) {
      for (const [tone,mergeGaps] of [['white',false],['dim',false],['white',true],['exp',false]]) {
        const box = {x,y:F.h-offset-h,w,h,mergeGaps,tone};
        const reading = readScreenText(F,box,tone,mergeGaps);
        const value = parseExperience(reading.text);
        if (value?.raw && (value.percent !== null || /\d{1,3}(?:[,.]\d{3}){2,}\s*\[/.test(reading.text))) {
          expBox = box;
          return {value,text:reading.text,box};
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
export function analyzeScreen(F,results,now){
  if(now-lastRun<500)return null;lastRun=now;
  const exp=experience(F);
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
        if (!suspicious && percentRegressed) current.percent = null;
        if (suspicious) {
          // A jump needs independent confirmation before becoming the baseline.
          const agrees = expJump?.raw === current.raw && now-expJump.t <= 6500;
          expJump = {raw:current.raw,t:now};
          stable = Boolean(agrees && (current.percent == null || previous.percent == null || current.percent >= previous.percent));
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
      exp.reason='경험치 숫자 연속 확인 중';
      exp.value=null;
    }
  }else if(now-lastExpSuccess>3000){expBox=null; expJump=null; expLower=null;}
  const icon=results.find(r=>r.id==='fragments_icon'&&r.found);
  let fragments={value:null,text:'조각 UI 자동 탐색 중'};
  if(icon){
    const scale=icon.size/24;
    // 조각 아이콘 바로 아래 수량. UI 위치는 아이콘 탐색 결과로 결정.
    const box={x:icon.x-8*scale,y:icon.y+icon.size+5*scale,w:40*scale,h:10*scale};
    let reading;
    // At FHD the count can sit directly above another overlay. Exclude its border.
    if (icon.size >= 30) {
      for (const offset of [1,0,2,-1,3,-2]) {
        const band = {x:icon.x-icon.size*.15,y:icon.y+icon.size*1.29+offset,w:icon.size*1.3,h:8};
        const result = readScreenText(F,band,'fragment');
        if (/^\d{1,6}$/.test(result.text) && result.confidence>=.83) {reading=result;break;}
      }
    }
    for (const [offset, height] of [[0,10],[1,7],[2,7],[3,7],[-1,8],[-3,8],[4,8],[6,8]]) {
      if (reading) break;
      const band = {...box,y:box.y+offset*scale,h:height*scale};
      reading = undefined;
      for (const tone of ['purple','white','dim']) {
        const result = readScreenText(F,band,tone);
        if (/^\d{1,6}$/.test(result.text) && result.confidence>=.83) { reading = result; break; }
      }
      if (reading) break;
    }
    if (reading) {
      const count=Number(reading.text);
      const previous=fragmentPending;
      const recent=previous && now-previous.t<=6500 &&
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
  return {exp,fragments};
}
