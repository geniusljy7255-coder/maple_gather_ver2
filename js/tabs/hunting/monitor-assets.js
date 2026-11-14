import {MONITOR_REFERENCE,FHD_RUNE_MARKER} from '../../data/monitor-reference.js';
/* 배포용 기준 이미지는 자동 로드한다. 사용자 영역 지정/등록 UI는 없다. */
let assets=[],missing=[];
export async function imageData(url){
  const response=await fetch(url);if(!response.ok)throw new Error('missing');
  const image=await createImageBitmap(await response.blob());
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();
  return ctx.getImageData(0,0,canvas.width,canvas.height);
}
export function crop(img,x,y,w,h){const rgba=new Uint8ClampedArray(w*h*4);for(let row=0;row<h;row++)rgba.set(img.data.subarray(((y+row)*img.width+x)*4,((y+row)*img.width+x+w)*4),row*w*4);return{rgba,w,h};}
export async function loadMonitorAssets(){
  assets=[];missing=[];
  for(const [id,file] of [['rune_normal','rune-normal.png'],['rune_blessed','rune-blessed.png'],['rune_cooldown','rune-cooldown.png']]){
    try{const img=await imageData(new URL('../../../icon/hunting/'+file,import.meta.url));
      if(Math.abs(img.width-img.height)>3||Math.min(img.width,img.height)<24||Math.max(img.width,img.height)>128)throw new Error('size');
      const size=Math.min(img.width,img.height);
      assets.push({id,colorMode:id==='rune_cooldown'?'gray':'color',whole:id==='rune_cooldown'?'cooldown':false,main:crop(img,Math.floor((img.width-size)/2),Math.floor((img.height-size)/2),size,size),thr:.88,sizes:[32,45,44,43,46,30,31,33,34,36,40,48,56,64]});
    }catch{missing.push(file);}
  }
  assets.push({id:'rune_marker',marker:true,fhd:FHD_RUNE_MARKER,main:MONITOR_REFERENCE.rune_marker,thr:.85,whole:true,sizes:[12,17,16,18,14,10,15,19,20,22,24]});
  assets.push({id:'fragments_icon',main:MONITOR_REFERENCE.fragments_icon,thr:.83,whole:true,sizes:[24,34,32,33,35,36,20,23,25,26,28,30,38,40,44,48]});
  return {targets:assets,missing};
}
