import {KARING_GLYPHS} from '../data/karing-glyphs.js';
import {normalize} from './hunting/digits.js';

export const karingNames={goongi:'궁기',dool:'도올',hondon:'혼돈'};
// Number plate origins in perilsGauge/UI/num, relative to the 188px background.
const numberPlates={goongi:[133,125],dool:[11,121],hondon:[72,6]};
// Stable pixels around the center emblem, sampled from the supplied fight recording.
const emblem=[
  [0,0,255,62,85],[-4,-4,255,54,64],[0,4,255,119,150],[8,-4,20,0,0],
  [-24,-24,55,8,15],[-12,-24,79,76,77],[0,-24,73,14,21],[24,-24,8,0,6],
  [-16,-20,110,12,15],[-4,-20,78,70,74],[8,-20,81,74,74],[20,-20,29,20,22],
  [-8,-16,87,83,80],[4,-16,119,67,79],[16,-16,77,72,75],
  [-24,-12,124,37,40],[-8,-12,74,46,56],[4,-12,93,81,88],[16,-12,92,80,87],
  [-16,-8,85,56,52],[-4,-8,64,44,34],[8,-8,98,81,89],[20,-8,134,66,79],
  [-16,-4,86,54,55],[20,-4,103,91,102],[-20,0,95,50,49],[12,0,120,83,87],
  [24,0,149,50,64],[-12,4,103,59,61],[12,4,98,88,97],[24,4,112,94,111],
  [0,8,167,88,102],[12,8,130,36,42],[24,8,125,42,53],[0,12,108,86,100],
  [12,12,116,58,65],[24,12,106,79,98],[-4,16,100,46,45],[8,16,122,88,107],
  [20,16,42,21,28],[-12,20,126,67,65],[4,20,181,56,63],[16,20,109,87,105],
  [-24,24,85,48,54],[-4,24,64,6,9],[8,24,116,92,102],[20,24,54,42,49]
];
const scales=[1,.75,1.25,.9,1.1,.6,.7,.8,.85,.95,1.05,1.15,1.2,1.3,1.4,1.5,1.6,1.8,2,2.25,2.5,3];

export function locateKaringPanel(frame,area,previous) {
  const {w,h,rgba}=frame;
  const left=Math.max(0,Math.floor(area.x*w)),top=Math.max(0,Math.floor(area.y*h));
  const right=Math.min(w,Math.ceil((area.x+area.width)*w)),bottom=Math.min(h,Math.ceil((area.y+area.height)*h));
  let best=null;
  const sampleCount=emblem.length*3;
  const probe=(x,y,scale)=>{
    const radius=Math.ceil(24*scale);
    if (x-radius<left || x+radius>=right || y-radius<top || y+radius>=bottom) return;
    const p=(y*w+x)*4;
    if (rgba[p]<158 || rgba[p]-rgba[p+1]<54 || rgba[p]-rgba[p+2]<38) return;
    let error=0;
    const scalePenalty=Math.abs(scale-Math.round(scale*20)/20);
    const limit=((best?.score ?? 27)-scalePenalty)*sampleCount;
    for (const [dx,dy,r,g,b] of emblem) {
      const i=((y+Math.round(dy*scale))*w+x+Math.round(dx*scale))*4;
      error+=Math.abs(rgba[i]-r)+Math.abs(rgba[i+1]-g)+Math.abs(rgba[i+2]-b);
      if (error>=limit) return;
    }
    error/=sampleCount;
    best={x,y,scale,error,score:error+scalePenalty};
  };
  if (previous) {
    for (let y=previous.y-2;y<=previous.y+2;y++) for (let x=previous.x-2;x<=previous.x+2;x++) {
      probe(x,y,previous.scale);
    }
  }
  if (!best || best.error>17) {
    for (let y=top;y<bottom;y+=2) for (let x=left;x<right;x+=2) {
      const i=(y*w+x)*4;
      if (rgba[i]<158 || rgba[i]-rgba[i+1]<54 || rgba[i]-rgba[i+2]<38) continue;
      for (const scale of scales) probe(x,y,scale);
    }
    if (best) {
      const {x,y,scale}=best;
      const roundedScale=Math.round(scale*20)/20;
      for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
        for (const delta of [0,-.02,.02,-.04,.04]) probe(x+dx,y+dy,roundedScale+delta);
      }
    }
  }
  if (!best) return null;
  const {x,y,scale}=best;
  return {...best,region:{x:(x-98*scale)/w,y:(y-98*scale)/h,width:188*scale/w,height:188*scale/h}};
}

export function karingNumberRegions(region,frame) {
  const scale=Math.min(region.width*frame.w,region.height*frame.h)/188;
  const width=188*scale/frame.w,height=188*scale/frame.h;
  const left=region.x+(region.width-width)/2,top=region.y+(region.height-height)/2;
  return Object.entries(numberPlates).map(([key,[x,y]])=>({key,region:{
    x:left+(x+7)*scale/frame.w,y:top+(y+8)*scale/frame.h,
    width:46*scale/frame.w,height:21*scale/frame.h
  }}));
}

export function readKaringPanel(frame,panel) {
  const scale=Math.min(panel.width*frame.w,panel.height*frame.h)/188;
  return Object.fromEntries(karingNumberRegions(panel,frame).map(({key,region})=>{
    // The black number plate is wider than the nominal text box. Try it
    // first so a shifted three-digit value cannot be read as two digits.
    const unitX=scale/frame.w,unitY=scale/frame.h;
    const plate={x:region.x-7*unitX,y:region.y-8*unitY,width:55*unitX,height:33*unitY};
    const values=new Set();
    for (const [top,height] of [[0,33],[2,19],[4,23],[8,23],[12,21]]) {
      const value=readKaringGauge(frame,{...plate,y:plate.y+top*unitY,height:height*unitY});
      if (value!==null) values.add(value);
    }
    if (values.has(0)!==values.has(1000)) return [key,values.has(0) ? 0 : 1000];
    return [key,values.size===1 ? values.values().next().value : null];
  }));
}
const attacks={goongi:['goongi','hondon'],dool:['dool','goongi'],hondon:['hondon','dool']};
const font=KARING_GLYPHS.flatMap(([digit,w,h,alpha],index)=>[1,1.25,1.5].flatMap(scale=>{
  const width=Math.ceil(w*scale),height=Math.ceil(h*scale);
  const pixels=Uint8Array.from({length:width*height},(_,i)=>{
    const x=Math.floor((i%width)/scale),y=Math.floor(Math.floor(i/width)/scale);
    return parseInt(alpha[y*w+x],16);
  });
  return [6,9,12].map(level=>({
    digit,red:index>=10,...normalize(Uint8Array.from(pixels,value=>value>=level),width,height)
  }));
}));
// The video capture preserves a thinner, open form of the in-game 4.
const capturedFour='00000110/00000100/00011100/00110100/00100100/01000100/10000100/11011111/00000110/00000100/00000100';
font.push({digit:4,red:false,...normalize(Uint8Array.from(capturedFour.replaceAll('/',''),Number),8,11)});

export function readKaringGauge(frame,region) {
  const x=Math.max(0,Math.round(region.x*frame.w)),y=Math.max(0,Math.round(region.y*frame.h));
  const w=Math.min(frame.w,Math.round((region.x+region.width)*frame.w))-x;
  const h=Math.min(frame.h,Math.round((region.y+region.height)*frame.h))-y;
  if (w<3 || h<6 || w>300 || h>100) return null;
  const readings=new Set();
  const redEndpoints=new Set();
  for (const red of [false,true]) {
    for (const level of red ? [155,180,210,235] : [180,210,235]) {
      const bits=new Uint8Array(w*h),columns=new Uint8Array(w);
      for (let row=0;row<h;row++) for (let col=0;col<w;col++) {
        const p=((y+row)*frame.w+x+col)*4;
        const r=frame.rgba[p],g=frame.rgba[p+1],b=frame.rgba[p+2];
        const ink=red ? r>=level && r-g>=90 && r-b>=65 : Math.min(r,g,b)>=level && Math.max(r,g,b)-Math.min(r,g,b)<=40;
        if (ink) bits[row*w+col]=columns[col]=1;
      }
      const runs=[];
      for (let start=0;start<w;) {
        if (!columns[start]) {start++;continue;}
        let end=start+1;
        while (columns[end]) end++;
        runs.push([start,end]);
        start=end;
      }
      if (!runs.length || runs.length>4) continue;
      let text='';
      for (const [start,end] of runs) {
        const width=end-start,pixels=new Uint8Array(width*h);
        let top=h,bottom=-1;
        for (let row=0;row<h;row++) {
          const line=bits.subarray(row*w+start,row*w+end);
          pixels.set(line,row*width);
          if (line.includes(1)) {top=Math.min(top,row);bottom=row;}
        }
        if (bottom-top+1<6) break;
        const glyph=normalize(pixels,width,h);
        const scores=new Map();
        for (const template of font) {
          if (!red && template.red) continue;
          const cost=glyph.bits.reduce((sum,bit,i)=>sum+(bit!==template.bits[i]),0)/120
            +.18*Math.abs(glyph.aspect-template.aspect);
          scores.set(template.digit,Math.min(scores.get(template.digit) ?? Infinity,cost));
        }
        let [[digit,cost],other]=[...scores].sort((a,b)=>a[1]-b[1]);
        let shapeConfirmed=false;
        if (!red && [4,5,7,8].includes(digit)) {
          const rowInk=row=>glyph.bits.subarray(row*10,(row+1)*10).reduce((sum,bit)=>sum+bit,0);
          const pair=digit===4 || digit===7 ? [4,7] : [5,8];
          let shape;
          if (pair[0]===4) {
            const topBar=Math.max(rowInk(0),rowInk(1),rowInk(2));
            const crossbar=Math.max(rowInk(6),rowInk(7),rowInk(8),rowInk(9));
            shape=topBar>=7 && crossbar<=6 ? 7 : crossbar>=7 && topBar<=5 ? 4 : null;
          } else {
            // An 8 closes its upper loop on the right, where a 5 is open.
            const upperRight=[2,3,4].filter(row=>glyph.bits[row*10+8] || glyph.bits[row*10+9]).length;
            shape=upperRight>=2 ? 8 : upperRight===0 ? 5 : null;
          }
          if (shape!==null && scores.get(shape)<=.20) {
            digit=shape;
            cost=scores.get(shape);
            shapeConfirmed=true;
          } else if (other && pair.includes(other[0]) && other[1]-cost<.06) {
            break;
          }
        }
        if (cost>.20 || (!shapeConfirmed && other && other[1]-cost<.025)) break;
        text+=digit;
      }
      if (text.length===runs.length && /^(?:0|[1-9]\d{0,2}|1000)$/.test(text)) {
        readings.add(Number(text));
        if (red && (text==='0' || text==='1000')) redEndpoints.add(Number(text));
      }
    }
  }
  if (redEndpoints.size===1) return redEndpoints.values().next().value;
  return readings.size===1 ? readings.values().next().value : null;
}

export const karingBand=(value,threshold=100)=>value<=threshold ? 'low' : value>=1000-threshold ? 'high' : 'normal';

export function correctKaringConfusion(values,previous={}) {
  const keys=Object.keys(karingNames);
  if (keys.some(key=>!Number.isInteger(values[key]) || values[key]<=0 || values[key]>=1000)) return values;
  const deficit=1500-keys.reduce((sum,key)=>sum+values[key],0);
  const place=({3:1,30:10,300:100})[deficit];
  if (!place) return values;
  const candidates=keys.filter(key=>[4,5].includes(Math.floor(values[key]/place)%10));
  if (candidates.length===1) return {...values,[candidates[0]]:values[candidates[0]]+deficit};
  if (keys.every(key=>Number.isInteger(previous[key])) && keys.reduce((sum,key)=>sum+previous[key],0)===1500) {
    const ranks=candidates.map(key=>({key,total:keys.reduce((sum,item)=>
      sum+Math.abs(values[item]+(item===key ? deficit : 0)-previous[item]),0)})).sort((a,b)=>a.total-b.total);
    if (ranks.length>1 && ranks[0].total<ranks[1].total) {
      const key=ranks[0].key;
      return {...values,[key]:values[key]+deficit};
    }
  }
  return values;
}

const threadColors={goongi:'빨간색',dool:'초록색',hondon:'노란색'};
const attackingGauge=key=>Object.keys(attacks).find(attacker=>attacks[attacker][1]===key);
export const karingThreads=key=>({up:threadColors[key],down:threadColors[attackingGauge(key)]});
export const karingThreadAttack=color=>karingNames[Object.keys(threadColors).find(key=>threadColors[key]===color)];

export function karingWarning(key,value,threshold=100) {
  const band=karingBand(value,threshold);
  if (band==='normal') return null;
  const low=band==='low';
  const boundary=low ? threshold : 1000-threshold;
  const relation=value===boundary ? (low ? '이하' : '이상') : (low ? '미만' : '초과');
  const attacker=low ? key : attackingGauge(key);
  return {band,label:`${boundary} ${relation}`,advice:`${karingNames[attacker]} 공격 또는 ${threadColors[attacker]} 실을 맞으세요.`};
}

export function karingAlertTransitions(values,previous,threshold=100) {
  const alerts=[];
  for (const [key,value] of Object.entries(values)) {
    if (!Number.isInteger(value)) continue;
    const band=karingBand(value,threshold);
    const previousBand=previous.get(key);
    previous.set(key,band);
    if (band==='normal' || band===previousBand || value===1000) continue;
    const threads=karingThreads(key);
    alerts.push({key,band,thread:band==='low' ? threads.up : threads.down});
  }
  return alerts;
}

export function planKaringThreads(values,threshold=100) {
  if (Object.keys(attacks).some(key=>!Number.isInteger(values[key]))) return [];
  const gauges={...values};
  const minimum=threshold+1,maximum=999-threshold;
  const keys=Object.keys(attacks);
  if (keys.every(key=>karingBand(values[key],threshold)==='normal')) {
    const [lowest,middle,highest]=keys.sort((a,b)=>values[a]-values[b]);
    const available=Math.min(500-values[lowest],values[highest]-500);
    if (available<25) return [];
    if (attacks[lowest][1]===highest) return [threadColors[lowest]];
    // Raise the low gauge first, using the middle gauge as a buffer.
    if (values[middle]-minimum>=Math.min(25,available)) return [threadColors[lowest],threadColors[middle]];
    if (maximum-values[middle]>=Math.min(25,available)) return [threadColors[middle],threadColors[lowest]];
    return [];
  }
  const plan=[];
  for (let step=0;step<3;step++) {
    const options=Object.entries(attacks).flatMap(([key,[up,down]])=>{
      const rise=gauges[up],fall=gauges[down];
      if (rise<=0 || rise>=1000 || fall<=0 || fall>=1000) return [];
      const low=Math.max(0,minimum-rise),high=Math.max(0,fall-maximum);
      if (!low && !high) return [];
      // Leave room for the next transfer when the neighboring gauge also needs help.
      const nextLow=gauges[attackingGauge(up)],nextHigh=gauges[attacks[down][1]];
      const lowRoom=low && nextLow>0 ? Math.max(0,minimum-nextLow) : 0;
      const highRoom=high && nextHigh<1000 ? Math.max(0,nextHigh-maximum) : 0;
      const amount=Math.min(Math.max(low+lowRoom,high+highRoom),maximum-rise,fall-minimum);
      if (amount<=0) return [];
      return [{key,up,down,amount,fixes:Number(low>0 && amount>=low)+Number(high>0 && amount>=high),
        relief:Math.min(low,amount)+Math.min(high,amount)}];
    });
    const next=options.sort((a,b)=>b.fixes-a.fixes || b.relief-a.relief)[0];
    if (!next) break;
    gauges[next.up]+=next.amount;
    gauges[next.down]-=next.amount;
    if (plan.at(-1)!==threadColors[next.key]) plan.push(threadColors[next.key]);
  }
  return plan;
}

export function estimateKaringGauge(previous,confirmed,visible=confirmed) {
  const changes=Object.keys(attacks).filter(key=>Number.isInteger(confirmed[key]) &&
    confirmed[key]!==previous[key]);
  if (changes.length!==1) return null;
  const [key]=changes;
  const from=previous[key],to=confirmed[key];
  if (!Number.isInteger(from) || from<=0 || from>=1000 || to<=0 || to>=1000) return null;
  const delta=to-from;
  const target=delta>0 ? attacks[key][1] : attackingGauge(key);
  if (!target || Number.isInteger(visible[target]) || !Number.isInteger(previous[target])) return null;
  const value=previous[target]-delta;
  return value>0 && value<1000 && previous[target]>0 && previous[target]<1000 ? {key:target,value} : null;
}

