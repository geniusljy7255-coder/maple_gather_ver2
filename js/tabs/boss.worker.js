import {prepareFrame} from './hunting/matcher.js';
import {createExperienceBuffDetector,scanExperienceBuffs} from './hunting/experience-buff-detector.js';
import {readBossRegion} from './boss-recognition.js';
import {locateKaringPanel,readKaringPanel} from './karing-gauge.js';

let detector=createExperienceBuffDetector([]);
let strikeDetector=createExperienceBuffDetector([]);
let dimensions='';
let karingAnchor=null;
let karingArea=null,lastKaringAnchorAt=0;
self.onmessage=({data})=>{
  if (data.type==='assets') {
    detector=createExperienceBuffDetector(data.assets.filter(asset=>asset.group!=='boss-strike'));
    strikeDetector=createExperienceBuffDetector(data.assets.filter(asset=>asset.group==='boss-strike'));
    dimensions='';
    return;
  }
  try {
    const {w,h,data:rgba,skills,format,time,revision,karingRegion,gaugeOnly=false}=data;
    const frame=prepareFrame(rgba,w,h);
    frame.timerFormat=format;
    const size=w+'x'+h+':'+format;
    if (size!==dimensions) {
      detector=createExperienceBuffDetector(detector.assets);
      strikeDetector=createExperienceBuffDetector(strikeDetector.assets);
      dimensions=size;
      karingAnchor=null;
    }
    const area=karingRegion && [karingRegion.x,karingRegion.y,karingRegion.width,karingRegion.height].join(',');
    if (area!==karingArea) {
      karingAnchor=null;
      karingArea=area;
    }
    const readings=gaugeOnly ? [] : skills.map(skill=>({id:skill.id,...readBossRegion(frame,skill,format)}));
    if (karingRegion) {
      const found=locateKaringPanel(frame,karingRegion,karingAnchor);
      if (found) {
        karingAnchor=found;
        lastKaringAnchorAt=time;
      } else if (time-lastKaringAnchorAt>3000) {
        karingAnchor=null;
      }
    }
    const gaugeValues=karingAnchor ? readKaringPanel(frame,karingAnchor.region) : {};
    postMessage({type:'regions',time,revision,readings,gaugeValues,gaugeOnly});
    if (gaugeOnly) return;
    const strike=scanExperienceBuffs(strikeDetector,frame,time,{maxInterval:1500});
    const buffs=scanExperienceBuffs(detector,frame,time,{maxGroups:2});
    postMessage({type:'buffs',time,format,buffs:{...buffs,...strike}});
  } catch (error) {
    postMessage({type:'error',message:String(error?.message ?? error)});
  }
};
