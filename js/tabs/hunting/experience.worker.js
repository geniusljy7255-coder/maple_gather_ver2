import {analyzeExperience,resetScreenMonitor} from './screen-monitor.js';

let sourceKey='';
self.onmessage=({data})=>{
  const {generation,t,w,h,sourceHeight,buffer}=data;
  const key=JSON.stringify([generation,w,h,sourceHeight]);
  if (key!==sourceKey) {
    resetScreenMonitor();
    sourceKey=key;
  }
  let exp=null;
  try {
    exp=analyzeExperience({w,h,sourceHeight,rgba:new Uint8ClampedArray(buffer)},t);
    if (exp?.box) exp.box={...exp.box,y:exp.box.y+sourceHeight-h,sourceWidth:w,sourceHeight};
  } finally {
    postMessage({type:'experience-ready',generation,t,results:[],monitor:exp ? {exp} : null});
  }
};
