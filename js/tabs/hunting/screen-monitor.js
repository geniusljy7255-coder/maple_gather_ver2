import {readScreenText,parseExperience} from './screen-text.js';
let expBox=null,expPending=null,fragmentPending=null,lastRun=0,lastExpSuccess=0;
export function resetScreenMonitor(){expBox=null;expPending=null;fragmentPending=null;lastRun=0;lastExpSuccess=0;}
function experience(F){
  // Start with a narrow band so unrelated HUD elements do not merge with the digits.
  const width = Math.ceil(F.w * .44);
  const x = Math.floor((F.w - width) / 2);

  const boxes=[];
  if(expBox){
    const text=readScreenText(F,expBox),value=parseExperience(text.text);
    if(value?.raw)return {value,text:text.text,box:expBox};
  }
  for (const offset of [2, 4, 6, 0, 8, 12, 16, 24]) {
    for (const height of [10, 16, 22]) {
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
    for (const height of [7, 8, 9]) {
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
    expPending={...current,t:now};
    const previousRaw=previous?.raw?BigInt(previous.raw):null,nextRaw=BigInt(current.raw);
    const stable=previousRaw!==null&&now-previous.t<=5000&&
      (nextRaw>=previousRaw&&nextRaw-previousRaw<=previousRaw/100n+1000000000n ||
       previous.level!=null&&current.level===previous.level+1);
    exp.reason=stable?'경험치 숫자 확인됨':'경험치 숫자 연속 확인 중';
    if(!stable)exp.value=null;
    else { exp.previous=previous; lastExpSuccess=now; }
  }else if(now-lastExpSuccess>3000){expPending=null;expBox=null;}
  const icon=results.find(r=>r.id==='fragments_icon'&&r.found);
  let fragments={value:null,text:'조각 UI 자동 탐색 중'};
  if(icon){
    const scale=icon.size/24;
    // 조각 아이콘 바로 아래 수량. UI 위치는 아이콘 탐색 결과로 결정.
    const box={x:icon.x-8*scale,y:icon.y+icon.size+5*scale,w:40*scale,h:10*scale};
    let reading;
    for (const [offset, height] of [[0,10],[1,7],[2,7],[3,7],[-1,8]]) {
      const band = {...box,y:box.y+offset*scale,h:height*scale};
      reading = ['white','purple'].map(tone=>readScreenText(F,band,tone))
        .find(result=>/^\d{1,6}$/.test(result.text)&&result.confidence>=.83);
      if (reading) break;
    }
    if(reading){const count=Number(reading.text);const equal=fragmentPending?.value===count&&now-fragmentPending.t<2000;
      fragmentPending={value:count,t:now,hits:equal?fragmentPending.hits+1:1};
      fragments={value:fragmentPending.hits>=3?count:null,text:reading.text,box};}
    else fragmentPending=null;
  }else fragmentPending=null;
  return {exp,fragments};
}
