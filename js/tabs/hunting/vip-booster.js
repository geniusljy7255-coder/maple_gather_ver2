const sevenSegments=['1110111','0010010','1011101','1011011','0111010',
  '1101011','1101111','1010010','1111111','1111011'];

export function vipBoosterRegion(width,height){
  return {x:Math.floor(width*.475),y:Math.floor(height*.070),
    w:Math.ceil(width*.083),h:Math.ceil(height*.115)};
}

// The readout is a four-digit segmented clock with a low decimal point.
export function readVipBooster({rgba,w,h}){
  const ink=new Uint8Array(w*h);
  for(let i=0;i<ink.length;i++){
    const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2];
    // The glossy upper strokes can be nearly white, while the lower strokes are gold.
    const gold=r>=178 && g>=115 && g>=r*.58 && g-b>=55;
    const highlight=Math.min(r,g,b)>=211 && Math.max(r,g,b)-Math.min(r,g,b)<=47;
    ink[i]=gold || highlight;
  }
  const inkIn=(x,y,width,height)=>{
    let count=0;
    for(let j=y;j<y+height;j++)for(let i=x;i<x+width;i++)count+=ink[j*w+i];
    return count;
  };
  const bands=[];
  let start=-1;
  for(let y=0;y<=h;y++){
    if(y<h && inkIn(0,y,w,1)>=3){if(start<0)start=y;}
    else if(start>=0){
      const previous=bands.at(-1);
      if(previous && start-previous[1]<=2)previous[1]=y;
      else bands.push([start,y]);
      start=-1;
    }
  }
  // Combat text can connect to the clock in the row projection.
  for(const height of [29,27,31,24,34,21,38,18,42,48]){
    for(let y=0;y+height<=h;y+=2){
      if(inkIn(0,y,w,2)>=5 && inkIn(0,y+height-2,w,2)>=5)bands.push([y,y+height]);
    }
  }
  for(const [top,end] of bands){
    const height=end-top;
    if(height<13 || height>Math.min(h*.8,70))continue;
    const runs=[];
    let left=-1;
    for(let x=0;x<=w;x++){
      if(x<w && inkIn(x,top,1,height)){if(left<0)left=x;}
      else if(left>=0){runs.push([left,x]);left=-1;}
    }
    for(let start=0;start+4<runs.length;start++){
      const sequence=runs.slice(start,start+5);
      const [dotLeft,dotRight]=sequence[2];
      const dotWidth=dotRight-dotLeft;
      if(dotWidth>height*.25 || inkIn(dotLeft,top,dotWidth,Math.floor(height*.7)))continue;
      if(!inkIn(dotLeft,top+Math.floor(height*.7),dotWidth,Math.ceil(height*.3)))continue;
      if(sequence.slice(1).some(([x,right],i)=>
        x-sequence[i][1]>height*(i!==1 && right-x<height*.30 ? .68 : .42)))continue;
      const left=sequence[0][0],right=sequence[4][1];
      let dark=0,total=0;
      for(let y=top;y<end;y+=2)for(let x=left;x<right;x+=2){
        const p=(y*w+x)*4;
        if(Math.max(rgba[p],rgba[p+1],rgba[p+2])<105)dark++;
        total++;
      }
      if(dark<total*.38)continue;
      const digits=[0,1,3,4].map(index=>{
        const [x,right]=sequence[index],width=right-x;
        if(width<height*.30)return inkIn(x,top,width,Math.floor(height*.28)) &&
          inkIn(x,top+Math.floor(height*.72),width,Math.floor(height*.28)) ? 1 : -1;
        if(width>height*.92)return -1;
        const sample=(a,b,c,d)=>{
          const x0=x+Math.floor(width*a),x1=x+Math.ceil(width*c);
          const y0=top+Math.floor(height*b),y1=top+Math.ceil(height*d);
          return inkIn(x0,y0,x1-x0,y1-y0)>=(x1-x0)*(y1-y0)*.26 ? 1 : 0;
        };
        return sevenSegments.indexOf([
          sample(.32,0,.68,.17),sample(0,.21,.34,.44),sample(.66,.21,1,.44),
          sample(.32,.39,.68,.61),sample(0,.56,.34,.80),sample(.66,.56,1,.80),
          sample(.32,.83,.68,1)
        ].join(''));
      });
      if(digits.every(digit=>digit>=0))return (digits[0]*10+digits[1])*1000+digits[2]*100+digits[3]*10;
    }
  }
  return null;
}

export function observeVipBooster(state,remaining,now){
  if(remaining===null)return false;
  const deadline=now+remaining;
  const previous=state.sample;
  state.sample={deadline,remaining,now};
  if(previous && now>previous.now && now-previous.now<=6500 &&
      remaining<previous.remaining && Math.abs(previous.deadline-deadline)<=1300){
    state.deadline=deadline;
    return true;
  }
  return false;
}
