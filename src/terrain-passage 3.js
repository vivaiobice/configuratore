import {createTerrainBudget} from './terrain-budget.js?v=1.3.5';
import {createContourDomain,createCanonicalCutPhysicalDomain,canonicalCutDomainScope} from './terrain-contour-domain.js?v=1.3.5';
import {fromUTM,toUTM} from './coordinate-system.js?v=1.3.5';
import {traceSurfaceBand,certifyUniformPlaneSupport,compareMeasuredSurfaceAreas} from './terrain-surface-bands.js?v=1.3.5';
import {exactDomain,Q,ZERO,add,mul,cmp,sign,cross,vsub,dot} from './terrain-exact.js?v=1.3.5';

import {resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.5';

import {TERRAIN_FIELD_MAX_BYTES} from './terrain-serialization.js?v=1.3.5';

export const NATIVE_SUPPORTED_AXIS_POLICY='native-supported-axis-clip-1';
const fail=(status,message)=>Object.assign(new Error(message),{status});
function coordinateNodes(value){
 if(Array.isArray(value))return value.length>=2&&value.length<=3&&value.every(Number.isFinite)?1:value.reduce((sum,item)=>sum+coordinateNodes(item),0);
 return value&&typeof value==='object'?Object.values(value).reduce((sum,item)=>sum+coordinateNodes(item),0):0;
}

/** Road construction alone does not establish cut eligibility or quantities. */
export function buildTerrainPassage({project,model,portionId,sourceAxis,widthM,groupId,createId,budget=createTerrainBudget({kind:'cut'})}={}){
 budget.check();
 if(typeof groupId!=='string'||!groupId)throw fail('invalid-input','Passage group identity is required');
 if(!(project.exclusions??[]).some(item=>item?.passageGroupId===groupId)&&[...(project.exclusions??[]),...(project.rowPortions??[])].some(item=>item?.id===groupId))throw fail('invalid-input','New passage group identity collides with the project');
 const physicalDomain=createCanonicalCutPhysicalDomain({project,model,scopePortionId:portionId,groupId,budget}),binding=canonicalCutDomainScope(physicalDomain);
 const scopePortionId=binding.recipe.scopePortionId;
 const strip=traceSupportedPassageStrip({model,physicalDomain,sourceAxis,widthM,budget});
 if(!strip.valid)throw Object.assign(fail('review-required','Supported passage remains unresolved'),{diagnostics:strip.validation});
 const others=(project.exclusions??[]).filter(item=>item?.passageGroupId!==groupId);
 const occupied=new Set([...others.map(item=>item?.id),...(project.rowPortions??[]).map(portion=>portion.id),...others.map(item=>item?.passageGroupId)].filter(Boolean));
 let ordinal=0;
 const allocate=()=>{
  budget.check();let id;
  if(createId)id=createId();
  else {do{id=`road-${groupId}-${++ordinal}`;budget.check();}while(occupied.has(id));}
  if(typeof id!=='string'||!id||occupied.has(id))throw fail('invalid-input','Passage member identity collides with the project');
  occupied.add(id);return id;
 };
 const parts=createTerrainPassageGroup({strip,scopePortionId,passageGroupId:groupId,createId:allocate,budget});
 const descriptor={groupId,scopePortionId,sourceAxis:strip.sourceAxis,widthM,widthBasis:'model-surface',modelHash:model.contentHash,
  surfaceConstructionPolicy:NATIVE_SUPPORTED_AXIS_POLICY,geometry:strip.geometry,scopeGeometry:strip.scopeGeometry,roadAreaM2:strip.areaM2,
  validation:{valid:true,supportedWholeAxis:true,serializedHalfWidthsM:strip.validation.serializedHalfWidthsM,serializedWidthM:strip.validation.serializedWidthM}};
 budget.check(coordinateNodes(others)+coordinateNodes(descriptor));
 const previous=structuredClone(others),cut=structuredClone(descriptor),first=(project.exclusions??[]).findIndex(item=>item?.passageGroupId===groupId);
 const exclusions=first<0?[...previous,...parts]:[...previous.slice(0,first),...parts,...previous.slice(first)];
 budget.check();return {cut,exclusions};
}

/** Whole submitted finite source; no relevance pruning or implicit extension.
 * Ground travel dominates XY travel, so strict support clearance of h+eta
 * covers both nominal sides and their existing bounded serialization guards. */
export function traceSupportedPassageStrip({model,physicalDomain,sourceAxis,widthM,budget=createTerrainBudget({kind:'cut'})}={}){
 budget.check();
 if(!Array.isArray(sourceAxis)||sourceAxis.length!==2||sourceAxis.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))||!Number.isFinite(widthM)||widthM<=0)throw fail('invalid-input','Finite original source and positive full width required');
 if(physicalDomain?.modelHash!==model?.contentHash||physicalDomain?.crs!==model?.crs)throw fail('invalid-input','Physical model binding mismatch');
 const epsg=Number(model.crs.split(':')[1]),axisXY=sourceAxis.map(p=>{budget.check(1);return toUTM(p,epsg);});
 if(axisXY[0].every((v,i)=>v===axisXY[1][i]))throw fail('invalid-input','Source axis has zero length');
 const radius=widthM/2+2e-5,margin=radius+.1;
 const low=axisXY[0].map((v,i)=>Math.min(v,axisXY[1][i])-margin),high=axisXY[0].map((v,i)=>Math.max(v,axisXY[1][i])+margin);
 const ring=[[low[0],low[1]],[high[0],low[1]],[high[0],high[1]],[low[0],high[1]],[low[0],low[1]]].map(p=>{budget.check(2);return fromUTM(p,epsg);});
 const support=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring]},budget}),exact=exactDomain(support,budget);
 if(exact.boundaries.length!==1||exact.boundaries[0].hole)throw fail('uncovered','Support rectangle is not a single acquired region');
 const boundary=exact.boundaries[0].coordinates,orientation=sign(boundary.slice(1).reduce((sum,p,i)=>add(sum,cross(boundary[i],p)),ZERO));
 if(!orientation)throw fail('uncovered','Support rectangle collapsed');
 const required=Q(radius),requiredSquared=mul(required,required);
 for(const source of axisXY.map(p=>p.map(Q)))for(let i=1;i<boundary.length;i++){
  budget.check();const edge=vsub(boundary[i],boundary[i-1]),inward=cross(edge,vsub(source,boundary[i-1]));
  if(sign(inward)!==orientation||cmp(mul(inward,inward),mul(requiredSquared,dot(edge,edge)))<=0)throw fail('uncovered','Whole source lacks strict native support clearance');
 }
 const result=traceSurfaceBand({domain:support,physicalDomain,axisXY,geographicSourceAxis:sourceAxis,widthM,policy:'geodesic',areaMode:certifyUniformPlaneSupport(support,budget)?'constant-plane':'coplanar-patches',budget});
 // No public proof is reconstructed from a scalar; the actual area evidence
 // remains bound to the exact result object returned by SurfaceBands.
 budget.check(sourceAxis.length);
 return result;
}

/** Only an unchanged live strip certificate can produce certified metadata.
 * Saved compatibility members decompose raw G; their scope masks every effect. */
export function createTerrainPassageGroup({strip,scopePortionId,passageGroupId,createId,budget=createTerrainBudget({kind:'cut'})}={}){
 budget.check();compareMeasuredSurfaceAreas(strip,strip,{budget});
 if(!strip.valid||strip.surfaceConstructionPolicy!==NATIVE_SUPPORTED_AXIS_POLICY||!strip.validation.supportedWholeAxis||typeof scopePortionId!=='string'||!scopePortionId||typeof passageGroupId!=='string'||!passageGroupId||typeof createId!=='function')throw fail('invalid-input','Actual supported strip and original scope/group identity required');
 if(strip.geometry.type!=='MultiPolygon'||!strip.geometry.coordinates.length||strip.geometry.coordinates.some(polygon=>polygon.length!==1))throw fail('passage-parts-unresolved','Raw strip holes require a lossless simple-part decomposition');
 const ids=new Set(),count=strip.geometry.coordinates.length,parts=strip.geometry.coordinates.map((polygon,index)=>{
  const id=createId();if(typeof id!=='string'||!id||ids.has(id))throw fail('invalid-input','Unique passage member identity required');ids.add(id);
  budget.check(polygon[0].length);
  return {id,geometry:structuredClone(polygon[0]),type:'linear',label:count>1?`Passaggio sul terreno · parte ${index+1}`:'Passaggio sul terreno',passageGroupId,surfaceGroupVersion:1,part:index+1,parts:count,
   ...(index===0?{surfaceGroupOwner:true,surfaceGeometry:structuredClone(strip.geometry),surfaceGeometryConvention:'domain-intersection',surfaceConstructionPolicy:NATIVE_SUPPORTED_AXIS_POLICY,
    sourceAxis:structuredClone(strip.sourceAxis),widthM:strip.validation.widthM,widthBasis:'model-surface',modelHash:strip.modelHash,scopePortionId,scopeGeometry:structuredClone(strip.scopeGeometry)}:{})};
 });
 budget.check(parts.reduce((sum,part)=>sum+part.geometry.length,0)+strip.geometry.coordinates.flat(2).length+strip.scopeGeometry.coordinates.flat(strip.scopeGeometry.type==='Polygon'?1:2).length+strip.sourceAxis.length);
 resolveTerrainExclusionGroups({exclusions:parts,field:strip.scopeGeometry,budget});
 budget.check();if(new TextEncoder().encode(JSON.stringify(parts)).byteLength>TERRAIN_FIELD_MAX_BYTES)throw new RangeError('Il gruppo di passaggi supera il limite di 1 MiB.');
 budget.check();return parts;
}
