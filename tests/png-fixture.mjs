import fs from 'node:fs';
import {inflateSync} from 'node:zlib';
// 테스트용 8-bit RGB/RGBA PNG reader. 브라우저 런타임에는 포함하지 않는다.
export function readPNG(path){
 const b=fs.readFileSync(path);let w,h,channels,parts=[];
 for(let pos=8;pos<b.length;){const n=b.readUInt32BE(pos),type=b.toString('ascii',pos+4,pos+8),d=b.subarray(pos+8,pos+8+n);pos+=n+12;
 if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);channels=d[9]===6?4:3;if(d[8]!==8||![2,6].includes(d[9])||d[12]!==0)throw Error('fixture PNG format');}
 if(type==='IDAT')parts.push(d);}
 const packed=inflateSync(Buffer.concat(parts)),stride=w*channels,pixels=new Uint8Array(stride*h);let src=0;
 const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
 for(let y=0;y<h;y++){const filter=packed[src++];for(let x=0;x<stride;x++){
 const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
 const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];if(predictor===undefined)throw Error('PNG filter');pixels[i]=(packed[src++]+predictor)&255;}}
 const rgba=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){rgba.set(pixels.subarray(i*channels,i*channels+3),i*4);rgba[i*4+3]=channels===4?pixels[i*channels+3]:255;}
 return {w,h,rgba};
}
