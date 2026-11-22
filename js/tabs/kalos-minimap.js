export const kalosLabels={left:'왼비',drone:'드론',orb:'구체',right:'오비'};

function borderPixel(frame,x,y) {
  if (x<0 || x>=frame.w || y<0 || y>=frame.h) return false;
  const i=(y*frame.w+x)*4;
  const r=frame.rgba[i],g=frame.rgba[i+1],b=frame.rgba[i+2];
  return Math.min(r,g,b)>=170 && Math.max(r,g,b)-Math.min(r,g,b)<48;
}

function panelBorder(frame,{x,y,w,h}) {
  if (x<0 || y<0 || x+w>frame.w || y+h>frame.h) return false;
  const samples=[.18,.34,.5,.66,.82];
  return [[x,y,1,0,w],[x,y+h-1,1,0,w],[x,y,0,1,h],[x+w-1,y,0,1,h]]
    .every(([left,top,dx,dy,size])=>samples.filter(f=>{
      const point=Math.floor(size*f);
      return borderPixel(frame,left+point*dx,top+point*dy);
    }).length>=3);
}

function starColor(frame,x,y) {
  const i=(y*frame.w+x)*4;
  const r=frame.rgba[i],g=frame.rgba[i+1],b=frame.rgba[i+2];
  if (r>=155 && r-g>=48 && g>=b+14) return 'red';
  if (b>=145 && g>=115 && b-r>=42 && g-r>=30) return 'blue';
  return null;
}

export function readKalosStars(frame,panel) {
  const {x,y,w,h}=panel;
  const stars=[];
  const radius=Math.max(2,Math.min(9,Math.round(h/21)));
  for (let cy=y+radius;cy<y+h-radius;cy++) for (let cx=x+radius;cx<x+w-radius;cx++) {
    const color=starColor(frame,cx,cy);
    if (!color) continue;
    const arms=[[1,0],[-1,0],[0,1],[0,-1]];
    const colored=arms.filter(([dx,dy])=>starColor(frame,cx+dx,cy+dy)===color).length;
    if (colored<2) continue;
    const outlined=arms.filter(([dx,dy])=>[radius-1,radius,radius+1].some(distance=>
      borderPixel(frame,cx+dx*distance,cy+dy*distance))).length;
    if (outlined<3) continue;
    const corners=[[1,1],[1,-1],[-1,1],[-1,-1]];
    if (corners.filter(([dx,dy])=>starColor(frame,cx+dx*radius,cy+dy*radius)===color).length>1) continue;
    const score=outlined*2+colored;
    const near=stars.findIndex(star=>Math.hypot(star.px-cx,star.py-cy)<=radius*2);
    const hit={color,px:cx,py:cy,x:(cx-x)/w,y:(cy-y)/h,score};
    if (near<0) stars.push(hit);
    else if (score>stars[near].score) stars[near]=hit;
  }
  return stars;
}

export function locateKalosMinimap(frame,previous=null) {
  if (previous && panelBorder(frame,previous)) return previous;
  for (let y=0;y<frame.h-45;y++) {
    for (let x=0;x<frame.w-72;) {
      if (!borderPixel(frame,x,y)) {x++;continue;}
      let end=x+1;
      while (end<frame.w && borderPixel(frame,end,y)) end++;
      const span=end-x;
      if (span>=72 && span<=Math.min(650,frame.w*.40)) {
        for (let bottom=y+Math.round(span*.43);bottom<Math.min(frame.h,y+span*.78);bottom++) {
          if (!borderPixel(frame,x+Math.floor(span/2),bottom)) continue;
          for (let inset=1;inset<=Math.max(6,Math.ceil(span*.035));inset++) {
            const panel={x:Math.max(0,x-inset),y,w:span+inset*2,h:bottom-y+1};
            if (!panelBorder(frame,panel)) continue;
            const stars=readKalosStars(frame,panel);
            if (stars.length>=2 && stars.some(star=>star.x<.20) && stars.some(star=>star.x>.80)) return panel;
          }
        }
      }
      x=end;
    }
  }
  return null;
}

export function trackKalosStars(previous,stars,now) {
  const blues=stars.filter(star=>star.color==='blue');
  const available=previous.filter(track=>now-track.at<=1800);
  const tracked=[];
  for (const star of stars) {
    const distance=track=>Math.hypot(star.x-track.x,star.y-track.y);
    const nearby=available.filter(track=>track.color===star.color && distance(track)<.25)
      .sort((a,b)=>distance(a)-distance(b));
    const last=nearby[0];
    if (last) available.splice(available.indexOf(last),1);
    const track={...star,at:now,age:(last?.age ?? 0)+1,kind:last?.kind,
      startY:last?.startY ?? star.y,startX:last?.startX ?? star.x};
    if (!track.kind && last) {
      const dx=Math.abs(star.x-track.startX),dy=Math.abs(star.y-track.startY);
      const edge=star.x<.14 ? 'left' : star.x>.86 ? 'right' : null;
      const sideY=blues.find(blue=>edge==='left' ? blue.x>.80 : blue.x<.20)?.y;
      if (edge && distance(last)<.018 && star.y>.28 && star.y<.62 &&
          (sideY===undefined || Math.abs(star.y-sideY)<.08)) track.kind=edge;
      else if (dy>=.065 || (star.y>.35 && dx>=.035)) track.kind='orb';
      else if (star.y<.33 && (dx>=.035 || star.color==='blue') && track.age>=3) track.kind='drone';
    }
    tracked.push(track);
  }
  const kinds=color=>[...new Set(tracked.filter(track=>track.color===color).map(track=>track.kind).filter(Boolean))];
  return {tracks:[...tracked,...available],active:kinds('red'),blue:kinds('blue')};
}

export function updateKalosInterference(latched,red,blue,{orbGone=false}={}) {
  const active=new Set(latched);
  for (const kind of blue) if (kind!=='orb' && !red.includes(kind)) active.delete(kind);
  if (orbGone && !red.includes('orb')) active.delete('orb');
  const alerts=red.filter(kind=>!active.has(kind));
  for (const kind of alerts) active.add(kind);
  return {active:[...active],alerts};
}

// Positions and colors sampled from the gold ring in BossKalos.img, UI/backgrnd.
const chargeRing=[
  [-28,0,214,167,109],[-24,0,222,178,117],[25,0,223,180,118],[28,0,215,170,111],
  [-20,-18,240,210,142],[20,-18,221,184,121],[-19,18,199,147,94],[20,18,197,145,92],
  [0,25,251,217,147]
];

function findKalosChargeOrb(frame,region) {
  const {w,h,rgba}=frame;
  const left=Math.max(0,Math.floor(region.x*w)),top=Math.max(0,Math.floor(region.y*h));
  const right=Math.min(w,Math.ceil((region.x+region.width)*w)),bottom=Math.min(h,Math.ceil((region.y+region.height)*h));
  const size=Math.min(right-left,bottom-top);
  const scales=[1,.75,1.25,1.5,.85,1.1,1.75,2,2.5,3].filter(scale=>size>=30*scale);
  let best;
  for (let y=top+Math.floor((bottom-top)/4);y<bottom-(bottom-top)/4;y++) {
    for (let x=left+Math.floor((right-left)/4);x<right-(right-left)/4;x++) {
      for (const scale of scales) {
        let error=0,matched=0;
        for (const [dx,dy,r,g,b] of chargeRing) {
          const px=x+Math.round(dx*scale),py=y+Math.round(dy*scale);
          if (px<0 || px>=w || py<0 || py>=h) break;
          const i=(py*w+px)*4;
          const difference=Math.abs(rgba[i]-r)+Math.abs(rgba[i+1]-g)+Math.abs(rgba[i+2]-b);
          if (difference<86) {matched++;error+=difference;}
        }
        if (matched<7) continue;
        const score=(9-matched)*86+error;
        if (!best || score<best.score) best={x,y,scale,score};
      }
    }
  }
  if (!best) return region;
  const {x,y,scale}=best;
  return {x:(x-20*scale)/w,y:(y-20*scale)/h,width:40*scale/w,height:40*scale/h};
}

export function readKalosCharge(frame,region) {
  region=findKalosChargeOrb(frame,region);
  const rows=15,columns=9;
  let valid=0,filled=0;
  for (let row=0;row<rows;row++) {
    let blue=0;
    for (let col=0;col<columns;col++) {
      const x=Math.min(frame.w-1,Math.floor((region.x+region.width*(.25+col*.50/(columns-1)))*frame.w));
      const y=Math.min(frame.h-1,Math.floor((region.y+region.height*(.12+row*.76/(rows-1)))*frame.h));
      const i=(y*frame.w+x)*4;
      const r=frame.rgba[i],g=frame.rgba[i+1],b=frame.rgba[i+2];
      if (b>=90 && g>=70 && b-r>=28 && g-r>=20) {blue++;valid++;}
      else if (Math.max(r,g,b)-Math.min(r,g,b)<=48 && r>=20 && r<=180) valid++;
    }
    if (blue>=5) filled++;
  }
  if (valid<rows*columns*.65) return null;
  return {percent:Math.round(filled*100/rows),full:filled>=rows-1};
}
