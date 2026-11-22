const sevenSegments=['1110111','0010010','1011101','1011011','0111010',
  '1101011','1101111','1010010','1111111','1111011'];

export function findVipBooster({rgba,w,h}) {
  const center=Math.floor(w/2),left=Math.max(0,center-Math.ceil(w*.26)),right=Math.min(w,center+Math.ceil(w*.26));
  const rails=[];
  const edge=(x,y)=>{
    const p=(y*w+x)*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];
    return Math.min(r,g,b)>=115 && Math.max(r,g,b)-Math.min(r,g,b)<=62;
  };
  for (let y=1;y<Math.min(h*.25,300);y++) {
    let start=-1,last=-1,count=0;
    for (let x=left;x<=right+3;x++) {
      if (x<right && edge(x,y)) {
        if (start<0) start=x;
        last=x;
        count++;
      } else if (start>=0 && x-last>2) {
        const width=last-start+1;
        if (width>=65 && width<=Math.min(w*.48,540) && count>=width*.78 &&
            Math.abs((start+last)/2-center)<=Math.max(8,width*.12)) {
          rails.push({x:start,y,width});
        }
        start=last=-1;
        count=0;
      }
    }
  }
  const candidates=[];
  for (const top of rails) for (const bottom of rails) {
    const height=bottom.y-top.y;
    if (height<top.width*.19 || height>top.width*.35 ||
        Math.abs(top.x-bottom.x)>top.width*.08 || Math.abs(top.width-bottom.width)>top.width*.12) continue;
    const width=(top.width+bottom.width)/2;
    const x=(top.x+bottom.x)/2;
    const sideRadius=Math.max(3,Math.round(width*.055));
    const hasSide=position=>[.30,.50,.70].filter(fraction=>{
      const row=Math.round(top.y+height*fraction);
      for (let col=Math.max(0,Math.round(position)-sideRadius);col<=Math.min(w-1,Math.round(position)+sideRadius);col++) {
        if (edge(col,row)) return true;
      }
      return false;
    }).length>=2;
    if (!hasSide(x) || !hasSide(x+width-1)) continue;
    let dark=0;
    for (const fx of [.06,.12,.88,.94]) for (const fy of [.24,.42,.58,.76]) {
      const p=(Math.round(top.y+height*fy)*w+Math.round(x+width*fx))*4;
      if (Math.max(rgba[p],rgba[p+1],rgba[p+2])<110) dark++;
    }
    if (dark<11) continue;
    candidates.push({x,y:top.y,width,height,score:dark-Math.abs(height/width-.265)*14-
      Math.abs(x+width/2-center)/width*5});
  }
  candidates.sort((a,b)=>b.score-a.score);
  for (const box of candidates.slice(0,12)) {
    // The label and trailing unit are outside the numeric window of the plaque.
    const start=Math.round(box.x+box.width*.35),end=Math.round(box.x+box.width*.91);
    const top=Math.round(box.y+box.height*.12),bottom=Math.round(box.y+box.height*.88);
    const width=end-start,height=bottom-top;
    const scale=height<30 ? 34/height : Math.min(1,42/height);
    const rw=Math.round(width*scale),rh=Math.round(height*scale);
    const crop=new Uint8ClampedArray(rw*rh*4);
    for (let y=0;y<rh;y++) for (let x=0;x<rw;x++) {
      const p=((top+Math.floor(y/scale))*w+start+Math.floor(x/scale))*4;
      crop.set(rgba.subarray(p,p+4),(y*rw+x)*4);
    }
    const value=readVipBooster({rgba:crop,w:rw,h:rh});
    if (value!==null) return value;
  }
  return null;
}

// The readout is a four-digit segmented clock with a low decimal point.
export function readVipBooster({rgba,w,h}){
  const stride=w+1, sums=new Uint32Array(stride*(h+1));
  for(let y=0;y<h;y++){
    let row=0;
    for(let x=0;x<w;x++){
      const p=(y*w+x)*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];
      // The glossy upper strokes can be nearly white, while the lower strokes are gold.
      const gold=r>=178 && g>=115 && g>=r*.58 && g-b>=55;
      const highlight=Math.min(r,g,b)>=211 && Math.max(r,g,b)-Math.min(r,g,b)<=47;
      row+=Number(gold || highlight);
      sums[(y+1)*stride+x+1]=row+sums[y*stride+x+1];
    }
  }
  const inkIn=(x,y,width,height)=>sums[(y+height)*stride+x+width]-sums[(y+height)*stride+x]-
    sums[y*stride+x+width]+sums[y*stride+x];
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
