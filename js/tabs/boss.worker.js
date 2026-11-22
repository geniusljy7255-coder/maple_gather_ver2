import {prepareFrame} from './hunting/matcher.js';
import {createExperienceBuffDetector,scanExperienceBuffs} from './hunting/experience-buff-detector.js';
import {readBossRegion} from './boss-recognition.js';
import {locateKaringPanel,readKaringPanel} from './karing-gauge.js';
import {locateKalosMinimap,readKalosCharge,readKalosStars,trackKalosStars,updateKalosInterference} from './kalos-minimap.js';

let detector=createExperienceBuffDetector([]);
let strikeDetector=createExperienceBuffDetector([]);
let dimensions='';
let karingAnchor=null;
let karingArea=null,lastKaringAnchorAt=0;
let kalosPanel=null,kalosTracks=[],kalosSession=null,kalosActive=[];
let kalosOrbMissingAt=null,kalosOrbMissingFrames=0;
self.onmessage=({data})=>{
  if (data.type==='assets') {
    detector=createExperienceBuffDetector(data.assets.filter(asset=>asset.group!=='boss-strike'));
    strikeDetector=createExperienceBuffDetector(data.assets.filter(asset=>asset.group==='boss-strike'));
    dimensions='';
    return;
  }
  try {
    const {w,h,data:rgba,skills,format,time,revision,karingRegion,kalosEnabled=false,kalosChargeRegion,patternSession,gaugeOnly=false}=data;
    const frame=prepareFrame(rgba,w,h);
    frame.timerFormat=format;
    const size=w+'x'+h+':'+format;
    if (size!==dimensions) {
      detector=createExperienceBuffDetector(detector.assets);
      strikeDetector=createExperienceBuffDetector(strikeDetector.assets);
      dimensions=size;
      karingAnchor=null;
      kalosPanel=null;
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
    let kalos;
    if (kalosEnabled) {
      if (kalosSession!==patternSession) {
        kalosPanel=null;
        kalosTracks=[];
        kalosActive=[];
        kalosOrbMissingAt=null;
        kalosOrbMissingFrames=0;
        kalosSession=patternSession;
      }
      const found=locateKalosMinimap(frame,kalosPanel);
      if (found && found!==kalosPanel) kalosTracks=[];
      kalosPanel=found;
      const result=trackKalosStars(kalosTracks,found ? readKalosStars(frame,found) : [],time);
      kalosTracks=result.tracks;
      const orbMayBeVisible=kalosTracks.some(track=>track.color==='red' &&
        (track.kind==='orb' || !track.kind) && time-track.at<=500);
      if (found && kalosActive.includes('orb') && !orbMayBeVisible) {
        kalosOrbMissingAt ??= time;
        kalosOrbMissingFrames++;
      } else {
        kalosOrbMissingAt=null;
        kalosOrbMissingFrames=0;
      }
      const orbGone=kalosOrbMissingAt!==null && time-kalosOrbMissingAt>=1250 && kalosOrbMissingFrames>=4;
      const interference=updateKalosInterference(kalosActive,result.active,result.blue,{orbGone});
      kalosActive=interference.active;
      const charge=kalosChargeRegion ? readKalosCharge(frame,kalosChargeRegion) : null;
      kalos={found:Boolean(found),...interference,charge};
    }
    postMessage({type:'regions',time,revision,readings,gaugeValues,gaugeOnly,kalos});
    if (gaugeOnly) return;
    const strike=scanExperienceBuffs(strikeDetector,frame,time,{maxInterval:1500});
    const buffs=scanExperienceBuffs(detector,frame,time,{maxGroups:2});
    postMessage({type:'buffs',time,format,buffs:{...buffs,...strike}});
  } catch (error) {
    postMessage({type:'error',message:String(error?.message ?? error)});
  }
};
