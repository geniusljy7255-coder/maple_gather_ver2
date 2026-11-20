// Ignore the game's optional black extension below the actual HUD. Only a wide,
// sustained dark band is removed; thin capture borders stay within the frame.
export function gameContentHeight({w,h,rgba}) {
  const samples=32;
  let darkRows=0,activeRows=0;
  for(let y=h-5;y>=Math.floor(h*.25);y--) {
    let lit=0;
    for(let i=0;i<samples;i++) {
      const x=Math.min(w-1,Math.floor(w*(i+1)/(samples+1)));
      const p=(y*w+x)*4;
      if(Math.max(rgba[p],rgba[p+1],rgba[p+2])>32)lit++;
    }
    if(lit>=samples*.35) {
      if(++activeRows>=2) return darkRows>=48 ? Math.min(h,y+7) : h;
    } else {
      if(activeRows) return h;
      darkRows++;
    }
  }
  return h;
}
