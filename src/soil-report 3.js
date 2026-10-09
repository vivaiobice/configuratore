import {buildSoilIdentifyUrl,parseSoilResponse,soilSamplePoints,normalizeSoilProfile,soilGeometrySignature} from './soil.js';

const THEMES=[['texture','texture'],['limestone','limestone'],['drainage','drainage'],['reaction','reaction']];

export async function refreshFieldSoilForReport(field,{fetchImpl=globalThis.fetch,signal}={}){
  const points=soilSamplePoints(field?.geometry);
  if(!points.length||typeof fetchImpl!=='function')return null;
  const center=Math.floor(points.length/2),ordered=[points[center],...points.filter((_,i)=>i!==center)].slice(0,4);
  const result={};let found=0;
  await Promise.all(THEMES.map(async([theme,key])=>{
    for(const [lon,lat] of ordered){
      if(signal?.aborted)break;
      const offset=.02,url=buildSoilIdentifyUrl({west:lon-offset,south:lat-offset,east:lon+offset,north:lat+offset,width:256,height:256},{x:128,y:128},theme);
      try{
        const response=await fetchImpl(url.toString(),{signal,headers:{accept:'text/plain'}});
        if(!response.ok)break;
        const data=parseSoilResponse(await response.text());
        const value=data?.[key]||data?.description;
        if(value){result[key]=value;result.soilUnit??=data.soilUnit;result.code??=data.code;found++;break;}
      }catch{break;}
    }
  }));
  if(!found)return null;
  return normalizeSoilProfile({cartographic:{...result,layer:'texture',description:result.texture||result.limestone||result.drainage||result.reaction,samples:ordered.length,retrievedAt:new Date().toISOString(),geometrySignature:soilGeometrySignature(field.geometry)},labAnalysis:field?.soil?.labAnalysis??null});
}
