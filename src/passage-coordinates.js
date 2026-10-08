import polygonClipping from './vendor/polygon-clipping.js?v=1.3.2';
import {corridorPolygonFromLine,normalizeIntersectionRings,polygonMetrics} from './geometry.js?v=45';
import {validateCoordinate} from './coordinate-editor.js?v=1.3.2';
import {terrainSurfaceGroupMarkerPresent} from './terrain-exclusion-groups.js?v=1.3.2';
export function nativePassageFamilyPresent(exclusions,id){
 const selected=(exclusions??[]).filter(item=>item?.id===id);
 return selected.some(item=>terrainSurfaceGroupMarkerPresent(item)||(item.passageGroupId&&(exclusions??[]).some(member=>member?.passageGroupId===item.passageGroupId&&terrainSurfaceGroupMarkerPresent(member))));
}
export function reshapeExclusion(exclusions,id,geometry){
 if(nativePassageFamilyPresent(exclusions,id)){
  const selected=exclusions.filter(item=>item?.id===id);
  if(selected.length===1&&JSON.stringify(selected[0].geometry)===JSON.stringify(geometry))return exclusions;
  throw new RangeError('Modifica il passaggio sul terreno tramite i suoi estremi A e B.');
 }
 const target=exclusions.find(item=>item.id===id),group=target?.sourceAxis&&target.passageGroupId;
 return exclusions.map(item=>{if(item.id!==id&&!(group&&item.passageGroupId===group))return item;const {sourceAxis,...rest}=item;return {...rest,geometry:item.id===id?geometry:item.geometry,type:'area',widthM:null,label:item.type==='linear'&&/^Passaggio lineare/.test(item.label??'')?'Area esclusa rimodellata':item.label};});
}
export function regeneratePassage({exclusions,id,endpointIndex,coordinate,field,createId=()=>`ex-${Date.now()}-${Math.random().toString(36).slice(2,9)}`}){
 if(nativePassageFamilyPresent(exclusions,id))throw new RangeError('Il passaggio sul terreno richiede il ricalcolo completo del progetto.');
 const target=exclusions.find(item=>item.id===id);
 if(!target?.passageGroupId||!Array.isArray(target.sourceAxis)||target.sourceAxis.length!==2)throw new RangeError('Questo passaggio non ha estremi originali salvati.');
 if(![0,1].includes(endpointIndex))throw new RangeError('Estremo non disponibile.');validateCoordinate(coordinate);target.sourceAxis.forEach(validateCoordinate);
 const sourceAxis=target.sourceAxis.map(p=>[...p]);sourceAxis[endpointIndex]=[...coordinate];const corridor=corridorPolygonFromLine(...sourceAxis,1.5);if(!corridor)throw new RangeError('Gli estremi del passaggio devono essere distinti.');
 const rings=normalizeIntersectionRings(polygonClipping.intersection([field],[corridor]));if(!rings.length)throw new RangeError('Il passaggio non interseca il campo.');
 const previous=exclusions.filter(item=>item.passageGroupId===target.passageGroupId),matches=[];
 rings.forEach((ring,ri)=>previous.forEach((item,pi)=>{const score=normalizeIntersectionRings(polygonClipping.intersection([ring],[item.geometry])).reduce((sum,r)=>sum+polygonMetrics(r).areaM2,0);if(score>0)matches.push({ri,pi,score});}));
 matches.sort((a,b)=>b.score-a.score||a.pi-b.pi||a.ri-b.ri);const owners=new Map(),used=new Set();for(const match of matches)if(!owners.has(match.ri)&&!used.has(match.pi)){owners.set(match.ri,previous[match.pi]);used.add(match.pi);}
 const automaticLabel=/^Passaggio lineare 1[,.]50 m(?:\s*·\s*parte\s+\d+)?$/i;
 const baseLabel='Passaggio lineare 1,50 m';
 const parts=rings.map((geometry,index)=>{
  const owner=owners.get(index),savedLabel=owner?.label;
  const label=typeof savedLabel==='string'&&savedLabel.trim()&&!automaticLabel.test(savedLabel)
   ?savedLabel:rings.length>1?`${baseLabel} · parte ${index+1}`:baseLabel;
  return {...target,...owner,id:owner?.id??createId(),geometry,sourceAxis:sourceAxis.map(p=>[...p]),passageGroupId:target.passageGroupId,type:'linear',widthM:1.5,label,part:index+1,parts:rings.length};
 });
 const first=exclusions.findIndex(item=>item.passageGroupId===target.passageGroupId);return exclusions.flatMap((item,index)=>index===first?parts:item.passageGroupId===target.passageGroupId?[]:[item]);
}
