import {calculateProject} from './project-calculator.js?v=1.3.6';
import {terrainInputHash} from './terrain-model.js?v=1.3.6';
import {createContourEnvelope,legacyTerrainInputs,readTerrainEnvelope,terrainGeometryInputHash} from './terrain-replay.js?v=1.3.6';
import {buildContourTerrainProposal} from './terrain-contour-design.js?v=1.3.6';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {TERRAIN_PORTION_GEOMETRY_KEYS,TERRAIN_EXCLUSION_GEOMETRY_KEYS} from './terrain-contour-contracts.js?v=1.3.6';
import {polygonMetrics,estimatePlantsFromRows,roundUpTo25} from './geometry.js?v=45';
import {assertTerrainSerializationBudget} from './terrain-serialization.js?v=1.3.6';

const clone=value=>structuredClone(value);
const select=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
const conflict=message=>({ok:false,status:'restore-conflict',kind:'restore',message});
const failure=(status,message)=>Object.assign(new Error(message),{status});
function geometryNodes(value){
 if(Array.isArray(value))return value.length>=2&&value.length<=3&&value.every(Number.isFinite)?1:value.reduce((s,item)=>s+geometryNodes(item),0);
 return value&&typeof value==='object'?Object.values(value).reduce((s,item)=>s+geometryNodes(item),0):0;
}
const groupKeys=['surfaceGroupVersion','surfaceGroupOwner','surfaceGeometry','surfaceGeometryConvention','surfaceConstructionPolicy'];
const exclusionProjection=item=>Array.isArray(item)?{geometry:item}:select(item,[...TERRAIN_EXCLUSION_GEOMETRY_KEYS,...groupKeys]);

const nativeCut=entry=>entry?.before?.cut?.protocolVersion===1;
const sameIds=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((id,index)=>id===b[index]);
const ids=value=>Array.isArray(value)&&value.length>0&&value.every(id=>typeof id==='string'&&id)&&new Set(value).size===value.length;
const sameIdSet=(a,b)=>ids(a)&&ids(b)&&a.length===b.length&&a.every(id=>b.includes(id));
const positions=(value,records)=>Array.isArray(value)&&value.length===records.length&&value.every((index,i)=>Number.isSafeInteger(index)&&index>=0&&(!i||index>value[i-1]));
const nativeAggregateKeys=['areaM2','excludedAreaM2','headlandAreaM2','netAreaM2','surfaceAreaM2','surfaceHeadlandAreaM2','surfaceNetAreaM2','surfaceUsableAreaM2','theoreticalPlants','commercialPlants25','headlandAreaBasis','theoreticalPlantsBasis','coverage','quantityBasis','theoreticalDensityContributions','terrainStatus','terrainAreaMethod','perimeterM','vertexCount','rowCount','rowLinearM','rowAxisCount','rowFragmentCount','horizontalRowLinearM','surfaceRowLinearM','simulatedPlants','headPosts','intermediatePosts','totalPosts'];
function* ownedValues(value){
 if(Array.isArray(value)){for(let index=0;index<value.length;index++)yield value[index];}
 else for(const key in value)if(Object.hasOwn(value,key))yield value[key];
}
// structuredClone preserves aliases. Count each actual copied coordinate
// object once, unlike a JSON copy which repeats every serialized occurrence.
function inspectOwned(value,budget,charge=false){
 if(!budget)return;
 const seen=new WeakSet(),stack=[ownedValues({value})];
 while(stack.length){
  budget?.check();const next=stack.at(-1).next();
  if(next.done){stack.pop();continue;}
  const item=next.value;
  if(!item||typeof item!=='object'||seen.has(item))continue;
  seen.add(item);
  if(charge&&Array.isArray(item)&&item.length>=2&&item.length<=3&&item.every(Number.isFinite))budget?.check(1);
  stack.push(ownedValues(item));
 }
}
function copyOwned(value,budget){if(!budget)return clone(value);inspectOwned(value,budget,true);budget.check();const result=clone(value);budget.check();return result;}
function nativeHash(value,budget){inspectOwned(value,budget);budget?.check();const result=terrainInputHash(value);budget?.check();return result;}
function nativeStructureEqual(a,b,budget){
 const seen=new WeakMap(),stack=[[a,b]];
 while(stack.length){
  budget?.check();const [left,right]=stack.pop();if(Object.is(left,right))continue;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  if(Array.isArray(left)&&left.length!==right.length)return false;
  if(!Array.isArray(left)&&[left,right].some(value=>![Object.prototype,null].includes(Object.getPrototypeOf(value))))return false;
  const paired=seen.get(left);if(paired?.has(right))continue;
  if(paired)paired.add(right);else seen.set(left,new WeakSet([right]));
  const leftKeys=Object.keys(left),rightKeys=Object.keys(right);budget?.check();
  if(leftKeys.length!==rightKeys.length)return false;
  for(const key of leftKeys){budget?.check();if(!Object.hasOwn(right,key))return false;stack.push([left[key],right[key]]);}
 }
 return true;
}
function effectiveNativeProject(project,proposal){
 const after={...project,...proposal.projectPatch};
 for(const key of ['terrain','rowPortions'])if(Object.hasOwn(proposal,key)&&proposal[key]!==undefined)after[key]=proposal[key];
 for(const key of proposal.removeProjectKeys??[]){if(key!=='rowPortions')throw failure('invalid-history','Unsupported restore removal key.');delete after[key];}
 if(Array.isArray(after.fields)){
  if(typeof after.activeFieldId!=='string'||!after.activeFieldId||after.fields.filter(field=>field?.id===after.activeFieldId).length!==1)throw failure('invalid-history','A unique active field is required for native terrain.');
  after.fields=after.fields.map(field=>{
   if(field.id!==after.activeFieldId)return field;
   const active={...field,terrain:after.terrain,exclusions:after.exclusions};
   if(Object.hasOwn(after,'rowPortions'))active.rowPortions=after.rowPortions;else delete active.rowPortions;
   return active;
  });
 }
 return after;
}
function nativeNonrecursive(value){
 const path=new WeakSet(),stack=[];let current=value;
 for(;;){
  if(current&&typeof current==='object'){
   if(path.has(current)||Object.hasOwn(current,'before')&&Object.hasOwn(current,'afterFingerprint')&&Object.hasOwn(current,'operationId'))return false;
   if(Object.keys(current).some(key=>['terrain','model','grid','valuesBase64','fields','history','applied'].includes(key)))return false;
   path.add(current);stack.push({value:current,iterator:ownedValues(current)});
  }else if(typeof current==='function'||typeof current==='symbol')return false;
  let next;
  while(stack.length){const frame=stack.at(-1);next=frame.iterator.next();if(!next.done)break;path.delete(frame.value);stack.pop();}
  if(!stack.length)return true;current=next.value;
 }
}
function validNativeOwner(members,groupId,sourceId){
 if(!Array.isArray(members)||!members.length||members.some(member=>!member)||new Set(members.map(member=>member.id)).size!==members.length)return false;
 if(members.some(member=>!member||member.surfaceGroupVersion!==1||member.passageGroupId!==groupId||typeof member.id!=='string'||!member.id||!Array.isArray(member.geometry)))return false;
 const owners=members.filter(member=>member.surfaceGroupOwner===true);if(owners.length!==1)return false;
 const owner=owners[0];
 return owner.scopePortionId===sourceId&&owner.surfaceGeometryConvention==='domain-intersection'&&owner.surfaceConstructionPolicy==='native-supported-axis-clip-1'&&owner.widthBasis==='model-surface'&&Number.isFinite(owner.widthM)&&owner.widthM>0&&typeof owner.modelHash==='string'&&!!owner.modelHash&&!!owner.scopeGeometry&&!!owner.surfaceGeometry&&Array.isArray(owner.sourceAxis)&&owner.sourceAxis.length===2&&owner.sourceAxis.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite))&&members.every(member=>member===owner||!['surfaceGroupOwner','surfaceGeometry','surfaceGeometryConvention','surfaceConstructionPolicy','scopeGeometry','scopePortionId','sourceAxis','widthM','widthBasis','modelHash'].some(key=>Object.hasOwn(member,key)));
}
function validNativeAggregate(summary){
 if(!summary||typeof summary!=='object'||Object.keys(summary).some(key=>!nativeAggregateKeys.includes(key)))return false;
 for(const [key,value] of Object.entries(summary)){
  if(key==='coverage'){
   if(!value||Object.keys(value).some(name=>!['servedAreaM2','referenceAreaM2','percent','basis'].includes(name))||!['servedAreaM2','referenceAreaM2','percent'].every(name=>value[name]===null||Number.isFinite(value[name]))||typeof value.basis!=='string')return false;
  }else if(key==='theoreticalDensityContributions'){
   if(!Array.isArray(value)||value.some(item=>!item||Object.keys(item).some(name=>!['portionId','basis','areaM2'].includes(name))||typeof item.basis!=='string'||item.areaM2!==null&&!Number.isFinite(item.areaM2)||Object.hasOwn(item,'portionId')&&typeof item.portionId!=='string'))return false;
  }else if(value!==null&&typeof value!=='string'&&!Number.isFinite(value))return false;
 }
 return !!summary.coverage&&summary.terrainStatus==='applied';
}
function validNativeEntry(entry){
 const before=entry.before,cut=before.cut,source=before.source;
 if(entry.kind!=='cut'||cut.protocolVersion!==1||!['create','replace'].includes(cut.action)||typeof cut.groupId!=='string'||!cut.groupId||typeof cut.sourceId!=='string'||!cut.sourceId)return false;
 if(Object.keys(cut).some(key=>!['protocolVersion','action','groupId','sourceId','beforePortionIds','afterPortionIds','previousGroup'].includes(key))||Object.keys(before).some(key=>!['source','portions','referenceModelHash','quantityContextFingerprint','cut','nativeAggregate'].includes(key)))return false;
 if(!ids(cut.beforePortionIds)||!ids(cut.afterPortionIds)||!cut.beforePortionIds.includes(cut.sourceId)||!cut.afterPortionIds.includes(cut.sourceId)||!sameIds(entry.affectedIds,[...new Set([...cut.beforePortionIds,...cut.afterPortionIds])]))return false;
 const sameSet=records=>records.length===cut.beforePortionIds.length&&new Set(records.map(record=>record.id)).size===records.length&&records.every(record=>cut.beforePortionIds.includes(record.id));
 if(!sameSet(before.portions)||!sameSet(source.referencePortions)||!positions(source.portionPositions,source.portions)||!positions(source.referencePortionPositions,source.referencePortions)||!positions(source.quantityPositions,before.portions)||new Set(source.portions.map(portion=>portion.id)).size!==source.portions.length||source.portions.some(portion=>!cut.beforePortionIds.includes(portion.id)))return false;
 const previous=cut.previousGroup;
 if(!previous||Object.keys(previous).some(key=>!['present','members','positions'].includes(key))||typeof previous.present!=='boolean'||!Array.isArray(previous.members)||!positions(previous.positions,previous.members))return false;
 if(cut.action==='create'&&(previous.present||previous.members.length||cut.beforePortionIds.length!==1))return false;
 if(cut.action==='replace'&&(!previous.present||!validNativeOwner(previous.members,cut.groupId,cut.sourceId)||!sameSet(source.portions)||!validNativeAggregate(before.nativeAggregate)))return false;
 if(Object.hasOwn(before,'nativeAggregate')&&!validNativeAggregate(before.nativeAggregate))return false;
 return nativeNonrecursive(before);
}

function materialize(project,proposal){
 const candidate={...clone(project),...clone(proposal.projectPatch??{}),terrain:clone(proposal.terrain)};
 if(Object.hasOwn(proposal,'rowPortions'))candidate.rowPortions=clone(proposal.rowPortions);
 for(const key of proposal.removeProjectKeys??[]){
  if(key!=='rowPortions')throw failure('invalid-history','Unsupported restore removal key.');
  delete candidate[key];
 }
 return candidate;
}
function topology(project){
 const resolved=project.terrain?.applied?.result?.portions??[];
 const raw=project.rowPortions??[];
 const portions=[...resolved.map(p=>({...p,...raw.find(r=>r.id===p.id)})),...raw.filter(p=>!resolved.some(r=>r.id===p.id))];
 return portions.map(p=>select(p,['id','geometry','anchor'])).sort((a,b)=>a.id.localeCompare(b.id));
}
function contextFingerprint(project,model=project.terrain?.model,budget){
 budget?.check();inspectOwned(legacyTerrainInputs(project),budget);inspectOwned(project.terrain?.applied?.result?.portions,budget);
 const {rowPortions:_,exclusions,...shared}=legacyTerrainInputs(project);
 return nativeHash({modelHash:model?.contentHash,shared,exclusions:exclusions.map(exclusionProjection),topology:topology(project)},budget);
}
function targetFingerprint(project,ids,groupId,budget){
 budget?.check();if(budget)inspectOwned({portions:project.rowPortions,exclusions:project.exclusions,results:project.terrain?.applied?.portionResults,rows:project.terrain?.applied?.result?.rows},budget);
 const affected=new Set(ids);
 return nativeHash({
  portions:(project.rowPortions??[]).filter(p=>affected.has(p.id)).map(p=>select(p,TERRAIN_PORTION_GEOMETRY_KEYS)),
  results:(project.terrain?.applied?.portionResults??[]).filter(p=>affected.has(p.id)),
  rows:(project.terrain?.applied?.result?.rows??[]).filter(row=>affected.has(row.portionId)||project.terrain.applied.portionResults.length===1&&affected.has(project.terrain.applied.portionResults[0].id)),
  exclusions:(project.exclusions??[]).filter(e=>!Array.isArray(e)&&(affected.has(e.scopePortionId)||groupId&&e.passageGroupId===groupId)).map(exclusionProjection)
 },budget);
}
function baselineHash(entry,budget){
 return nativeHash(select(entry,['schemaVersion','operationId','kind','affectedIds','before','afterFingerprint','contextFingerprint']),budget);
}
function nonrecursive(value){
 if(!value||typeof value!=='object')return true;
 for(const [key,child] of Object.entries(value)){
  if(['terrain','model','grid','valuesBase64','fields','history','applied'].includes(key)||!nonrecursive(child))return false;
 }
 return true;
}
function validEntry(entry,budget){
 budget?.check();if(budget)inspectOwned(entry,budget);
 if(entry?.schemaVersion!==1||typeof entry.operationId!=='string'||!entry.operationId)return false;
 if(!['adapt','measure','cut'].includes(entry.kind))return false;
 if(!Array.isArray(entry.affectedIds)||!entry.affectedIds.length||new Set(entry.affectedIds).size!==entry.affectedIds.length)return false;
 if(!entry.affectedIds.every(id=>typeof id==='string'&&id.length>0))return false;
 const before=entry.before;
 if(!before?.source||!['missing','empty','present'].includes(before.source.rowPortionsPresence)||!Array.isArray(before.source.portions)||!Array.isArray(before.source.referencePortions)||typeof before.quantityContextFingerprint!=='string')return false;
 if(!Array.isArray(before.portions)||!before.portions.length)return false;
 if(!before.portions.every(p=>typeof p.id==='string'&&Array.isArray(p.rows)&&typeof p.quantityBasis==='string'))return false;
 const explicitNative=before.cut&&['protocolVersion','action','beforePortionIds','afterPortionIds','previousGroup'].some(key=>Object.hasOwn(before.cut,key));
 if(explicitNative&&!validNativeEntry(entry))return false;
 if(nativeCut(entry))return typeof entry.afterFingerprint==='string'&&typeof entry.contextFingerprint==='string'&&entry.baselineHash===baselineHash(entry,budget);
 return nonrecursive(before)&&typeof entry.afterFingerprint==='string'&&typeof entry.contextFingerprint==='string'&&entry.baselineHash===baselineHash(entry,budget);
}
function historyEntries(project,budget){
 budget?.check();
 const history=project.terrain?.history;
 if(!history)return [];
 if(history.schemaVersion!==1||!Array.isArray(history.entries))throw failure('invalid-history','Invalid terrain restore history.');
 const seen=new Set();
 for(const entry of history.entries){
  if(!validEntry(entry,budget)||entry.affectedIds.some(id=>seen.has(id)))throw failure('invalid-history','Invalid or overlapping terrain restore baseline.');
  entry.affectedIds.forEach(id=>seen.add(id));
 }
 return history.entries;
}
/** Validate every baseline and return a transient checkpoint identity only. */
export function assertTerrainRestoreHistory({project,budget}={}){
 try{
  historyEntries(project,budget);
  const present=Object.hasOwn(project.terrain??{},'history');
  // A present malformed value must not borrow the historical absent branch.
  if(present&&!project.terrain.history)throw failure('invalid-history','Invalid terrain restore history.');
  return nativeHash({present,...(present?{history:project.terrain.history}:{})},budget);
 }catch(error){
  if(budget&&error?.status==='budget-exceeded')throw error;
  if(error?.status==='invalid-history')throw error;
  throw failure('invalid-history','Invalid terrain restore history.');
 }
}
function savedEnvelopeValid(project){
 const applied=project.terrain?.applied;
 return !!applied?.inputs&&readTerrainEnvelope({...clone(applied.inputs),terrain:project.terrain})?.terrainStatus==='applied';
}
function sums(rows,project){
 const post=Number(project.postSpacingM),heads=post>0?rows.length*2:0;
 const intermediate=post>0?rows.reduce((s,row)=>s+Math.max(0,Math.ceil(row.lengthM/post)-1),0):0;
 return {
  rowCount:rows.length,
  rowFragmentCount:rows.length,
  rowAxisCount:new Set(rows.map((r,i)=>r.axisId??`manual-${i}`)).size,
  rowLinearM:rows.reduce((s,r)=>s+r.lengthM,0),
  horizontalRowLinearM:rows.reduce((s,r)=>s+(r.horizontalLengthM??r.lengthM),0),
  surfaceRowLinearM:rows.every(r=>Number.isFinite(r.surfaceLengthM))?rows.reduce((s,r)=>s+r.surfaceLengthM,0):null,
  simulatedPlants:estimatePlantsFromRows(rows,Number(project.plantSpacingM)),
  headPosts:heads,
  intermediatePosts:intermediate,
  totalPosts:heads+intermediate
 };
}
function manualBaselines(project,budget,owned=true){
 budget?.check();
 const input={...project,polygon:project.polygon??project.geometry,terrain:null};
 const manual=calculateProject(input),raw=Number(project.headlandWidthM)>0?calculateProject({...input,headlandWidthM:0}):manual;
 budget?.check();
 return manual.portions.map(portion=>{
  budget?.check();
  const portionRows=rows=>rows.filter(row=>row.portionId===portion.id||manual.portions.length===1);
  const rows=portionRows(manual.rows),quantity=sums(rows,project);
  const usable=polygonMetrics(portion.geometry[0]).areaM2-portion.geometry.slice(1).reduce((s,ring)=>s+polygonMetrics(ring).areaM2,0);
  const removed=Math.max(0,portionRows(raw.rows).reduce((s,r)=>s+r.lengthM,0)-quantity.rowLinearM);
  const heads=Math.min(usable,removed*Number(project.rowSpacingM)),net=Math.max(0,usable-heads);
  const theoretical=Math.ceil(net/(Number(project.rowSpacingM)*Number(project.plantSpacingM)));
  return {
   ...quantity,
   id:portion.id,
   rows:owned?copyOwned(rows,budget):rows,
   quantityBasis:'legacy-planar',
   design:owned?copyOwned(portion.terrainDesign??select(portion,['mode','orientationDeg','rowCurvePoints','maintainRowEquidistance','inheritedDesign']),budget):portion.terrainDesign??select(portion,['mode','orientationDeg','rowCurvePoints','maintainRowEquidistance','inheritedDesign']),
   validation:{valid:true,automaticSpacing:false,method:'saved-manual-calculator'},
   coverage:{servedAreaM2:null,referenceAreaM2:null,percent:null},
   headlandArea:{horizontal:heads,surface:null},
   usableHorizontalAreaM2:usable,
   usableSurfaceAreaM2:null,
   netAreaM2:net,
   theoreticalPlants:theoretical,
   commercialPlants25:roundUpTo25(quantity.simulatedPlants||theoretical),
   manualPortion:owned?copyOwned(portion,budget):portion,
   ...(manual.portions.length===1?{
    manualQuantity:select(manual,['areaM2','netAreaM2','headlandAreaM2','excludedAreaM2','perimeterM','vertexCount','rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])
   }:{})
  };
 });
}
function captureBefore(project,ids,manual,referenceModel){
 const selected=new Set(ids),applied=project.terrain?.applied;
 const portions=applied?applied.portionResults.filter(p=>selected.has(p.id)):manual.filter(p=>selected.has(p.id));
 if(!portions.length||ids.some(id=>!portions.some(p=>p.id===id)))throw failure('invalid-history','Original portion quantity baseline is missing.');
 // Applied rows belong to the cache's saved input, which may differ from a
 // live invalidating edit. Keep its geometric reference coherent with them.
 const original=applied?{...clone(applied.inputs),terrain:project.terrain}:{...project,terrain:{model:referenceModel,applied:{result:{portions:manual.map(p=>p.manualPortion)}}}};
 const raw=(original.rowPortions??[]).filter(p=>selected.has(p.id)).map(saved=>{
  const current=(project.rowPortions??[]).find(p=>p.id===saved.id)??{};
  const presentation=Object.fromEntries(Object.entries(current).filter(([key])=>!TERRAIN_PORTION_GEOMETRY_KEYS.includes(key)));
  return {...clone(presentation),...clone(saved)};
 });
 const referencePortions=clone((original.terrain.applied.result.portions??[]).filter(p=>selected.has(p.id)));
 return {
  source:{rowPortionsPresence:!Object.hasOwn(project,'rowPortions')?'missing':raw.length?'present':'empty',portions:raw,referencePortions},
  portions:clone(portions),
  referenceModelHash:referenceModel.contentHash,
  quantityContextFingerprint:contextFingerprint(original,referenceModel)
 };
}

function nativeOperation(project,proposal,after,budget){
 const operation=proposal.cutOperation;
 if(!operation||Object.keys(operation).some(key=>!['schemaVersion','action','groupId','scopePortionId','beforePortionIds','afterPortionIds'].includes(key))||operation.schemaVersion!==1||!['create','replace'].includes(operation.action)||operation.groupId!==proposal.cut?.groupId||operation.scopePortionId!==proposal.cut?.scopePortionId||typeof operation.groupId!=='string'||!operation.groupId||typeof operation.scopePortionId!=='string'||!operation.scopePortionId||!ids(operation.beforePortionIds)||!ids(operation.afterPortionIds)||!operation.beforePortionIds.includes(operation.scopePortionId)||!operation.afterPortionIds.includes(operation.scopePortionId))throw failure('invalid-history','Invalid native cut operation ownership.');
 const original=project.terrain?.applied?{...project.terrain.applied.inputs,terrain:project.terrain}:project;
 const previous=(original.exclusions??[]).filter(member=>member?.passageGroupId===operation.groupId);
 const proposed=(after.exclusions??[]).filter(member=>member?.passageGroupId===operation.groupId);
 if(!validNativeOwner(proposed,operation.groupId,operation.scopePortionId))throw failure('invalid-history','Complete native cut owner is missing.');
 const owner=proposed.find(member=>member.surfaceGroupOwner===true),cut=proposal.cut;
 for(const key of ['scopePortionId','widthM','widthBasis','modelHash','sourceAxis','scopeGeometry','surfaceConstructionPolicy'])if(!nativeStructureEqual(cut[key],owner[key],budget))throw failure('invalid-history','Native cut descriptor differs from the actual owner.');
 if(!nativeStructureEqual(cut.geometry,owner.surfaceGeometry,budget)||owner.modelHash!==after.terrain?.model?.contentHash)throw failure('invalid-history','Native cut geometry/model binding differs.');
 const oldChildren=(original.rowPortions??[]).filter(portion=>portion.terrainScopeRecipe?.groupId===operation.groupId);
 // The producer resolves component presentation order before declaring its
 // complete owned set. Saved raw/reference/quantity order has separate positions.
 if(operation.action==='create'&&(previous.length||!sameIds(operation.beforePortionIds,[operation.scopePortionId]))||operation.action==='replace'&&(!validNativeOwner(previous,operation.groupId,operation.scopePortionId)||!sameIdSet(operation.beforePortionIds,oldChildren.map(portion=>portion.id))))throw failure('invalid-history','Complete previous native group ownership is missing.');
 if(operation.action==='replace'){
  const previousOwner=previous.find(member=>member.surfaceGroupOwner===true);
  for(const key of ['scopePortionId','widthM','widthBasis','modelHash','scopeGeometry','surfaceGeometryConvention','surfaceConstructionPolicy'])if(!nativeStructureEqual(previousOwner[key],owner[key],budget))throw failure('invalid-history','Native replacement changes the original owner scope, width or model policy.');
 }
 const children=(after.rowPortions??[]).filter(portion=>portion.terrainScopeRecipe?.groupId===operation.groupId);
 if(!sameIds(operation.afterPortionIds,children.map(portion=>portion.id))||new Set((after.rowPortions??[]).map(portion=>portion.id)).size!==(after.rowPortions??[]).length||children.some(portion=>!(after.terrain?.applied?.portionResults??[]).some(result=>result.id===portion.id)))throw failure('invalid-history','Complete candidate native children are missing.');
 const originalIds=new Set([...operation.beforePortionIds,...(project.rowPortions??[]).map(portion=>portion.id),...(original.rowPortions??[]).map(portion=>portion.id),...(original.terrain?.applied?.portionResults??[]).map(portion=>portion.id),...[...(project.exclusions??[]),...(original.exclusions??[])].flatMap(member=>[member?.id,member?.passageGroupId]).filter(Boolean)]);
 const ownedBefore=new Set(operation.beforePortionIds),ownedAfter=new Set(operation.afterPortionIds);
 const fresh=operation.afterPortionIds.filter(id=>!ownedBefore.has(id));
 if(fresh.some(id=>originalIds.has(id))||!Array.isArray(proposal.createdChildIds)||new Set(proposal.createdChildIds).size!==proposal.createdChildIds.length||!sameIds(proposal.createdChildIds,fresh))throw failure('invalid-history','Native created child identities are not genuinely fresh.');
 const existingIds=(original.terrain?.applied?.portionResults??original.rowPortions??[]).map(portion=>portion.id);
 const previousContour=original.terrain?.applied?.schemaVersion===2&&original.terrain.applied.algorithmVersion==='terrain-contour-family-1';
 // The operation may replace its complete owned group, but unrelated live raw
 // records keep their exact presentation, geometry and relative order. First
 // conversion may measure foreign rows; an existing contour result stays exact.
 const unownedBefore=(project.rowPortions??[]).filter(portion=>!ownedBefore.has(portion.id));
 const unownedAfter=(after.rowPortions??[]).filter(portion=>!ownedAfter.has(portion.id));
 const unrelatedExclusions=value=>(value.exclusions??[]).filter(member=>member?.passageGroupId!==operation.groupId);
 if(!nativeStructureEqual(unownedBefore,unownedAfter,budget)||!nativeStructureEqual(unrelatedExclusions(project),unrelatedExclusions(after),budget))throw failure('invalid-history','Native cut changes unrelated raw records.');
 if(previousContour&&!nativeStructureEqual((original.terrain.applied.portionResults??[]).filter(portion=>!ownedBefore.has(portion.id)),(after.terrain?.applied?.portionResults??[]).filter(portion=>!ownedAfter.has(portion.id)),budget))throw failure('invalid-history','Native cut changes unrelated applied results.');
 const foreign=previousContour?[]:existingIds.filter(id=>!operation.beforePortionIds.includes(id));
 if(!sameIds(proposal.affectedPortionIds,[...new Set([...operation.beforePortionIds,...operation.afterPortionIds,...foreign])]))throw failure('invalid-history','Invalid affected native cut identities.');
 return {operation,original,previous,foreign};
}
function captureNativeBefore(project,original,ownedIds,manual,referenceModel,budget,owned=true){
 const selected=new Set(ownedIds),applied=project.terrain?.applied;
 const sourceQuantities=applied?applied.portionResults:manual;
 const quantities=sourceQuantities.filter(portion=>selected.has(portion.id));
 if(quantities.length!==ownedIds.length||ownedIds.some(id=>!quantities.some(portion=>portion.id===id)))throw failure('invalid-history','Original native child quantity baseline is missing.');
 const references=applied?applied.result.portions:manual.map(portion=>portion.manualPortion);
 const raw=(original.rowPortions??[]).filter(portion=>selected.has(portion.id)).map(saved=>{
  const live=(project.rowPortions??[]).find(portion=>portion.id===saved.id)??{};
  return {...Object.fromEntries(Object.entries(live).filter(([key])=>!TERRAIN_PORTION_GEOMETRY_KEYS.includes(key))),...saved};
 });
 const referencePortions=references.filter(portion=>selected.has(portion.id));
 const quantityProject=applied?original:{...original,terrain:{model:referenceModel,applied:{result:{portions:references}}}};
 const before={source:{rowPortionsPresence:!Object.hasOwn(project,'rowPortions')?'missing':raw.length?'present':'empty',portions:raw,referencePortions,portionPositions:(original.rowPortions??[]).flatMap((portion,index)=>selected.has(portion.id)?[index]:[]),referencePortionPositions:references.flatMap((portion,index)=>selected.has(portion.id)?[index]:[]),quantityPositions:sourceQuantities.flatMap((portion,index)=>selected.has(portion.id)?[index]:[])},portions:quantities,referenceModelHash:referenceModel.contentHash,quantityContextFingerprint:contextFingerprint(quantityProject,referenceModel,budget),...(applied?{nativeAggregate:select(applied.result,nativeAggregateKeys)}:{})};
 if(!nativeNonrecursive(before))throw failure('invalid-history','Unsupported recursive native baseline.');
 return owned?copyOwned(before,budget):before;
}
function nativeCutBefore(project,binding){
 const previous=binding.previous.map(saved=>{
  const live=(project.exclusions??[]).find(member=>member?.id===saved.id)??{};
  return {...Object.fromEntries(Object.entries(live).filter(([key])=>!TERRAIN_EXCLUSION_GEOMETRY_KEYS.includes(key))),...saved};
 });
 return {protocolVersion:1,action:binding.operation.action,groupId:binding.operation.groupId,sourceId:binding.operation.scopePortionId,beforePortionIds:binding.operation.beforePortionIds,afterPortionIds:binding.operation.afterPortionIds,previousGroup:{present:binding.operation.action==='replace',members:previous,positions:(binding.original.exclusions??[]).flatMap((member,index)=>member?.passageGroupId===binding.operation.groupId?[index]:[])}};
}
function attachNativeRestore({project,proposal,operationId,budget}){
 budget.check();
 const after=effectiveNativeProject(project,proposal),binding=nativeOperation(project,proposal,after,budget);
 // This one actual read validates both the effective inputs and saved inputs,
 // snapshot, complete raw owner union, canonical recipes and source bindings.
 if(readTerrainEnvelope(after,{budget})?.terrainStatus!=='applied')throw failure('invalid-applied','Native cut needs a complete matching applied envelope.');
 if(project.terrain&&readTerrainEnvelope(binding.original,{budget})?.terrainStatus!=='applied')throw failure('invalid-applied','Original native baseline integrity failed.');
 const existing=historyEntries(project,budget),manual=project.terrain?null:manualBaselines(project,budget);
 const beforeIds=(project.terrain?.applied?.portionResults??manual).map(portion=>portion.id);
 if(binding.operation.beforePortionIds.some(id=>!beforeIds.includes(id))||!project.terrain&&beforeIds.some(id=>!proposal.affectedPortionIds.includes(id)))throw failure('invalid-history','Every actual original portion needs a baseline.');
 const groupIds=[...new Set([...binding.operation.beforePortionIds,...binding.operation.afterPortionIds])];
 const groups=[{sourceIds:binding.operation.beforePortionIds,affectedIds:groupIds,groupId:binding.operation.groupId},...binding.foreign.map(id=>({sourceIds:[id],affectedIds:[id]}))];
 const entries=groups.map(group=>{
  const before=captureNativeBefore(project,binding.original,group.sourceIds,manual,project.terrain?.model??after.terrain.model,budget);
  if(group.groupId){
   before.cut=copyOwned(nativeCutBefore(project,binding),budget);
  }
  const entry={schemaVersion:1,operationId,kind:group.groupId?'cut':'measure',affectedIds:group.affectedIds,before,afterFingerprint:targetFingerprint(after,group.affectedIds,group.groupId,budget),contextFingerprint:contextFingerprint(after,after.terrain.model,budget)};
  entry.baselineHash=nativeHash(select(entry,['schemaVersion','operationId','kind','affectedIds','before','afterFingerprint','contextFingerprint']),budget);
  if(!validEntry(entry,budget))throw failure('invalid-history','Invalid complete native restore baseline.');return entry;
 });
 const replaced=new Set(entries.flatMap(entry=>entry.affectedIds)),remaining=copyOwned(existing.filter(entry=>!entry.affectedIds.some(id=>replaced.has(id))),budget);
 const {terrain:_,rowPortions:__,projectPatch:___,...other}=proposal;
 const {model,history:oldHistory,...terrainContents}=after.terrain;
 const {terrain:____,rowPortions:_____,...patch}=proposal.projectPatch??{};
 const copied=copyOwned({other,rowPortions:after.rowPortions,terrainContents,patch},budget);
 const terrain={model,...copied.terrainContents,history:{schemaVersion:1,entries:[...remaining,...entries]}};
 const candidate={...copied.other,rowPortions:copied.rowPortions,terrain,projectPatch:{...copied.patch,rowPortions:copied.rowPortions,terrain}};
 assertTerrainSerializationBudget(effectiveNativeProject(project,candidate));budget.check();return candidate;
}

/**
 * Validate a worker attachment against the genuine captured project without
 * reattaching it. The returned actual replay result is already owned; callers
 * reuse it rather than reconstructing the same candidate a second time.
 */
export function assertNativeTerrainCutAttachment({project,proposal,operationId,budget=createTerrainBudget({kind:'cut'})}={}){
 budget.check();
 if(!project||!proposal?.ok||proposal.kind!=='cut'||typeof operationId!=='string'||!operationId)throw failure('invalid-history','A genuine native cut attachment and operation identity are required.');
 const after=effectiveNativeProject(project,proposal),binding=nativeOperation(project,proposal,after,budget);
 if(!nativeStructureEqual(proposal.result,after.terrain?.applied?.result,budget)||!nativeStructureEqual(proposal.projectPatch?.rowPortions,after.rowPortions,budget)||!nativeStructureEqual(proposal.projectPatch?.terrain,after.terrain,budget))throw failure('invalid-history','Native candidate mirrors differ from the applied payload.');
 const result=readTerrainEnvelope(after,{budget});
 if(result?.terrainStatus!=='applied')throw failure('invalid-applied','Native attachment needs a complete matching applied envelope.');
 if(project.terrain&&readTerrainEnvelope(binding.original,{budget})?.terrainStatus!=='applied')throw failure('invalid-applied','Captured native baseline integrity failed.');
 const existing=historyEntries(project,budget),manual=project.terrain?null:manualBaselines(project,budget,false);
 const beforeIds=(project.terrain?.applied?.portionResults??manual).map(portion=>portion.id);
 if(binding.operation.beforePortionIds.some(id=>!beforeIds.includes(id))||!project.terrain&&beforeIds.some(id=>!proposal.affectedPortionIds.includes(id)))throw failure('invalid-history','Every captured original portion needs a baseline.');
 const groupIds=[...new Set([...binding.operation.beforePortionIds,...binding.operation.afterPortionIds])];
 const groups=[{sourceIds:binding.operation.beforePortionIds,affectedIds:groupIds,groupId:binding.operation.groupId},...binding.foreign.map(id=>({sourceIds:[id],affectedIds:[id]}))];
 const expected=groups.map(group=>{
  budget.check();
  const before=captureNativeBefore(project,binding.original,group.sourceIds,manual,project.terrain?.model??after.terrain.model,budget,false);
  if(group.groupId)before.cut=nativeCutBefore(project,binding);
  const entry={schemaVersion:1,operationId,kind:group.groupId?'cut':'measure',affectedIds:group.affectedIds,before,afterFingerprint:targetFingerprint(after,group.affectedIds,group.groupId,budget),contextFingerprint:contextFingerprint(after,after.terrain.model,budget)};
  entry.baselineHash=baselineHash(entry,budget);return entry;
 });
 const affected=new Set(expected.flatMap(entry=>entry.affectedIds)),retained=existing.filter(entry=>!entry.affectedIds.some(id=>affected.has(id)));
 historyEntries(after,budget);
 const expectedHistory={schemaVersion:1,entries:[...retained,...expected]};
 // A hash can bind archived bytes, but cannot prove that a worker captured the
 // actual before records. Compare their bounded structure and values as well.
 if(!nativeStructureEqual(after.terrain.history,expectedHistory,budget))throw failure('invalid-history','Native attachment differs from the actual captured baseline or retained history.');
 assertTerrainSerializationBudget(after);budget.check();
 return {historyFingerprint:nativeHash({present:true,history:after.terrain.history},budget),result};
}

/** Attach one genuine baseline per affected portion; callers checkpoint the copy. */
export function attachTerrainRestore({project,proposal,operationId,budget}={}){
 budget?.check();
 if(!proposal?.ok)return clone(proposal);
 if(proposal.kind==='restore')throw failure('invalid-history','Restore consumes history and cannot create redo history.');
 if(typeof operationId!=='string'||!operationId)throw failure('invalid-history','A restore operation identity is required.');
 if(proposal.kind==='cut'&&(proposal.cutOperation||(proposal.projectPatch?.exclusions??project.exclusions??[]).some(member=>member?.surfaceGroupVersion!==undefined&&member.passageGroupId===proposal.cut?.groupId)||(proposal.rowPortions??[]).some(portion=>portion.terrainScopeRecipe?.groupId===proposal.cut?.groupId)))return attachNativeRestore({project,proposal,operationId,budget:budget??createTerrainBudget({kind:'cut'})});
 const after=materialize(project,proposal);
 if(!savedEnvelopeValid(after)||readTerrainEnvelope(after)?.terrainStatus!=='applied')throw failure('invalid-applied','Only a valid complete applied envelope matching its effective context may receive history.');
 if(project.terrain&&!savedEnvelopeValid(project))throw failure('invalid-applied','Original applied baseline integrity failed.');
 const existing=historyEntries(project),manual=project.terrain?null:manualBaselines(project);
 const beforeIds=(project.terrain?.applied?.portionResults??manual).map(p=>p.id);
 // changes is a full-field presentation summary, including retained results.
 // Only the producer's explicit operation scope may replace restore entries.
 const requested=proposal.affectedPortionIds;
 if(after.terrain.applied.schemaVersion===2&&after.terrain.applied.algorithmVersion==='terrain-contour-family-1'&&requested===undefined)throw failure('invalid-history','Explicit contour proposals require affected portion identities.');
 if(requested!==undefined&&(!Array.isArray(requested)||!requested.length||new Set(requested).size!==requested.length||requested.some(id=>typeof id!=='string'||!beforeIds.includes(id))))throw failure('invalid-history','Invalid affected portion identities.');
 if(!project.terrain&&requested&&beforeIds.some(id=>!requested.includes(id)))throw failure('invalid-history','First conversion must record every original portion.');
 const selected=requested??beforeIds;
 let groups=selected.map(id=>({sourceIds:[id],affectedIds:[id]}));
 if(proposal.kind==='cut'){
  if(!proposal.cut?.groupId||!proposal.cut?.scopePortionId)throw failure('invalid-history','Cut source and group identity are required.');
  const children=(after.terrain.applied.portionResults??[]).filter(p=>!beforeIds.includes(p.id)||p.id===proposal.cut.scopePortionId).map(p=>p.id);
  groups=[{sourceIds:[proposal.cut.scopePortionId],affectedIds:[...new Set([proposal.cut.scopePortionId,...children])],groupId:proposal.cut.groupId}];
 }
 const entries=groups.map(group=>{
  const before=captureBefore(project,group.sourceIds,manual,project.terrain?.model??after.terrain.model);
  if(group.groupId)before.cut={groupId:group.groupId,childIds:group.affectedIds.filter(id=>id!==group.sourceIds[0]),sourceId:group.sourceIds[0]};
  const entry={schemaVersion:1,operationId,kind:proposal.kind==='measure'?'measure':proposal.kind==='cut'?'cut':'adapt',affectedIds:group.affectedIds,before,afterFingerprint:targetFingerprint(after,group.affectedIds,group.groupId),contextFingerprint:contextFingerprint(after)};
  entry.baselineHash=baselineHash(entry);
  if(!validEntry(entry))throw failure('invalid-history','The original baseline contains unsupported recursive data.');
  return entry;
 });
 const replaced=new Set(entries.flatMap(entry=>entry.affectedIds));
 const candidate=clone(proposal);candidate.terrain.history={schemaVersion:1,entries:[...clone(existing.filter(entry=>!entry.affectedIds.some(id=>replaced.has(id)))),...entries]};
 assertTerrainSerializationBudget(materialize(project,candidate));
 return candidate;
}

export function terrainRestoreAvailability({project,portionId,budget}={}){
 try{
  const entry=historyEntries(project,budget).find(entry=>entry.affectedIds.includes(portionId));
  if(!entry)return {available:false,reason:'no-baseline'};
  if(nativeCut(entry)){
   const {source,...availability}=nativeAvailabilityProjection(project,entry,budget);return availability;
  }
  if(entry.afterFingerprint!==targetFingerprint(project,entry.affectedIds,entry.before.cut?.groupId)||!savedEnvelopeValid(project))return {available:false,reason:'restore-conflict',operationId:entry.operationId};
  const restoreContext=contextFingerprint(restoreSource(project,entry).candidate);
  const exact=entry.contextFingerprint===contextFingerprint(project)&&entry.before.quantityContextFingerprint===restoreContext&&readTerrainEnvelope(project)?.terrainStatus==='applied';
  return {available:true,reason:exact?'exact':'recompute-required',operationId:entry.operationId};
 }catch(error){if(budget&&error?.status==='budget-exceeded')throw error;return {available:false,reason:'invalid-history'};}
}

function positioned(retained,records,indices){
 const ordered=[...retained];
 for(let index=0;index<records.length;index++)ordered.splice(Math.min(indices[index],ordered.length),0,records[index]);
 return ordered;
}
// This readonly topology uses existing objects until the final owned payload is
// precharged. The model and encoded grid are never duplicated here.
function nativeRestoreSource(project,entry){
 const affected=new Set(entry.affectedIds),source=entry.before.source;
 const portions=positioned((project.rowPortions??[]).filter(portion=>!affected.has(portion.id)),source.portions,source.portionPositions);
 const references=positioned(project.terrain.applied.result.portions.filter(portion=>!affected.has(portion.id)),source.referencePortions,source.referencePortionPositions);
 const previous=entry.before.cut.previousGroup;
 const exclusions=positioned((project.exclusions??[]).filter(member=>Array.isArray(member)||member.passageGroupId!==entry.before.cut.groupId),previous.members,previous.positions);
 const candidate={...project,rowPortions:portions,exclusions,terrain:{...project.terrain,applied:{...project.terrain.applied,result:{...project.terrain.applied.result,portions:references}}}};
 const removeProjectKeys=!portions.length&&source.rowPortionsPresence==='missing'?['rowPortions']:[];
 if(removeProjectKeys.length)delete candidate.rowPortions;
 return {candidate,rowPortions:portions,referencePortions:references,removeProjectKeys,projectPatch:{exclusions}};
}
function nativeAvailabilityProjection(project,entry,budget){
 budget?.check();
 if(entry.afterFingerprint!==targetFingerprint(project,entry.affectedIds,entry.before.cut.groupId,budget))return {available:false,reason:'restore-conflict',operationId:entry.operationId};
 const saved=project.terrain?.applied,model=project.terrain?.model;
 if(!saved?.inputs||!model)return {available:false,reason:'restore-conflict',operationId:entry.operationId};
 const source=nativeRestoreSource(project,entry);
 inspectOwned(legacyTerrainInputs(project),budget);budget?.check();
 const liveHash=terrainGeometryInputHash(project,model);budget?.check();
 const exact=liveHash===saved.inputHash&&entry.contextFingerprint===contextFingerprint(project,model,budget)&&entry.before.referenceModelHash===model.contentHash&&entry.before.quantityContextFingerprint===contextFingerprint(source.candidate,model,budget);
 return {available:true,reason:exact?'exact':'recompute-required',operationId:entry.operationId,source};
}
function nativeAvailability(project,entry,budget){
 budget.check();const availability=nativeAvailabilityProjection(project,entry,budget);
 if(!availability.available)return availability;
 const cached={...project.terrain.applied.inputs,terrain:project.terrain};
 // Rendering uses only the advisory projection above. The actual restore
 // operation reconstructs native ownership here under its one shared budget.
 if(readTerrainEnvelope(cached,{budget})?.terrainStatus!=='applied')return {available:false,reason:'restore-conflict',operationId:entry.operationId};
 return availability;
}

function restoreSource(project,entry){
 const affected=new Set(entry.affectedIds),raw=project.rowPortions??[];
 const source=entry.before.source;
 const portions=[...clone(raw.filter(p=>!affected.has(p.id))),...clone(source.portions)];
 const candidate=clone(project);candidate.rowPortions=portions;
 // Model/global inputs stay live; topology is the actual post-restore topology
 // when comparing it with the baseline's independently bound quantity context.
 candidate.terrain.applied.result.portions=[...clone(project.terrain.applied.result.portions.filter(p=>!affected.has(p.id))),...clone(source.referencePortions)];
 const patch={};
 if(entry.before.cut){patch.exclusions=clone((project.exclusions??[]).filter(e=>Array.isArray(e)||e.passageGroupId!==entry.before.cut.groupId));candidate.exclusions=patch.exclusions;}
 const removeProjectKeys=!portions.length&&source.rowPortionsPresence==='missing'?['rowPortions']:[];
 if(removeProjectKeys.length)delete candidate.rowPortions;
 return {candidate,rowPortions:portions,removeProjectKeys,projectPatch:patch};
}
function aggregate(project,portionResults,result,budget){
 budget?.check();
 const rows=portionResults.flatMap(p=>p.rows),quantity=sums(rows,project),bases=new Set(portionResults.map(p=>p.quantityBasis??'legacy-planar'));
 const knownSum=path=>portionResults.every(p=>Number.isFinite(path(p)))?portionResults.reduce((s,p)=>s+path(p),0):null;
 const headlandAreaM2=knownSum(p=>p.headlandArea?.horizontal),surfaceHeadlandAreaM2=knownSum(p=>p.headlandArea?.surface);
 const usableHorizontal=knownSum(p=>p.usableHorizontalAreaM2),usableSurface=knownSum(p=>p.usableSurfaceAreaM2);
 const served=knownSum(p=>p.coverage?.servedAreaM2),reference=usableSurface;
 const netAreaM2=headlandAreaM2!==null&&usableHorizontal!==null?Math.max(0,usableHorizontal-headlandAreaM2):null;
 const surfaceNetAreaM2=surfaceHeadlandAreaM2!==null&&usableSurface!==null?Math.max(0,usableSurface-surfaceHeadlandAreaM2):null;
 // Match the builder's field-level ceil. An unknown continuum headland uses
 // the untrimmed surface reference for the whole surface portion collection.
 const surfacePortions=portionResults.filter(p=>p.quantityBasis!=='legacy-planar');
 const surfaceHeadsKnown=surfacePortions.every(p=>Number.isFinite(p.headlandArea?.surface)&&Number.isFinite(p.headlandArea?.horizontal));
 const densityContributions=portionResults.map(p=>({
  portionId:p.id,
  basis:p.quantityBasis==='legacy-planar'?'legacy-planar-net':surfaceHeadsKnown?'surface-after-explicit-exclusions-and-headlands':'surface-after-explicit-exclusions-before-headlands',
  areaM2:p.quantityBasis==='legacy-planar'?p.netAreaM2:Number.isFinite(p.usableSurfaceAreaM2)?Math.max(0,p.usableSurfaceAreaM2-(surfaceHeadsKnown?p.headlandArea.surface:0)):null
 }));
 const planar=portionResults.filter(p=>p.quantityBasis==='legacy-planar');
 const planarArea=planar.every(p=>Number.isFinite(p.netAreaM2))?planar.reduce((s,p)=>s+p.netAreaM2,0):null;
 const surfaceUsable=surfacePortions.every(p=>Number.isFinite(p.usableSurfaceAreaM2))?surfacePortions.reduce((s,p)=>s+p.usableSurfaceAreaM2,0):null;
 const surfaceHeads=surfaceHeadsKnown?surfacePortions.reduce((s,p)=>s+p.headlandArea.surface,0):null;
 const surfaceDensityArea=surfaceUsable===null?null:surfaceHeads===null?surfaceUsable:Math.max(0,surfaceUsable-surfaceHeads);
 const densityArea=planarArea===null||surfaceDensityArea===null?null:planarArea+surfaceDensityArea;
 const theoretical=densityArea===null?null:Math.ceil(densityArea/(Number(project.rowSpacingM)*Number(project.plantSpacingM)));
 const assembled={
  // Native callers give this readonly assembly to createContourEnvelope, which
  // precharges and owns the complete result once. Historical callers keep their
  // original independent structured copy.
  ...(budget?result:clone(result)),...quantity,rows,
  quantityBasis:bases.size>1?'mixed-certified-bases':[...bases][0],
  headlandAreaM2,surfaceHeadlandAreaM2,netAreaM2,surfaceNetAreaM2,
  surfaceUsableAreaM2:usableSurface,
  theoreticalPlants:theoretical,
  theoreticalDensityContributions:densityContributions,
  commercialPlants25:roundUpTo25(quantity.simulatedPlants||theoretical),
  headlandAreaBasis:bases.has('legacy-planar')?'mixed-quantity-bases':result.headlandAreaBasis,
  theoreticalPlantsBasis:bases.has('legacy-planar')?'mixed-quantity-bases':result.theoreticalPlantsBasis,
  coverage:{
   servedAreaM2:served,referenceAreaM2:reference,
   percent:served===null||reference===null?null:100*served/reference,
   basis:'surface-after-explicit-exclusions-before-headlands'
  },
  terrainStatus:'applied'
 };
 if(portionResults.every(p=>p.quantityBasis==='legacy-planar')){
  // Once every literal manual reference is restored, use the original manual
  // calculator's actual field aggregation (including its headland clamp), not
  // rounded per-portion estimates. Exact-context guards precede this branch.
  const manual=calculateProject({...project,polygon:project.polygon??project.geometry,terrain:null});
  Object.assign(assembled,select(manual,['areaM2','netAreaM2','headlandAreaM2','excludedAreaM2','perimeterM','vertexCount','rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts']));
  assembled.theoreticalDensityContributions=[{basis:'legacy-planar-net',areaM2:manual.netAreaM2}];
 }else if(portionResults.every(p=>p.quantityBasis==='certified-flat-legacy')){
  const manual=calculateProject({...project,polygon:project.polygon??project.geometry,terrain:null});
  Object.assign(assembled,select(manual,['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts']));
  assembled.theoreticalPlantsBasis='certified-flat-legacy-planar-density';
  assembled.theoreticalDensityContributions=[{basis:'certified-flat-legacy-planar-density',areaM2:manual.netAreaM2}];
 }
 return assembled;
}

function nativeAggregate(project,portionResults,current,summary,budget){
 const result=aggregate(project,portionResults,summary?{...current,...summary}:current,budget);
 if(portionResults.every(portion=>Number.isFinite(portion.usableHorizontalAreaM2)))result.excludedAreaM2=Math.max(0,result.areaM2-portionResults.reduce((sum,portion)=>sum+portion.usableHorizontalAreaM2,0));
 if(summary){
  const served=result.coverage.servedAreaM2,reference=summary.coverage.referenceAreaM2;
  result.coverage={servedAreaM2:served,referenceAreaM2:reference,percent:served===null||reference===null||reference===0?null:100*served/reference,basis:summary.coverage.basis};
  // These saved scalar fields describe the original field aggregation shape.
  // Quantity totals above always use the restored owned and current foreign
  // portion results; no saved field total substitutes for a foreign result.
  for(const key of nativeAggregateKeys)if(!Object.hasOwn(summary,key))delete result[key];
 }
 return result;
}
function buildNativeRestore({project,portionId,model,budget,entries,entry}){
 budget.check();budget.phase('restore');
 const availability=nativeAvailability(project,entry,budget);
 if(!availability.available)return conflict('The restored drawing or baseline was edited.');
 const source=availability.source;
 const commonContextMatches=entry.contextFingerprint===contextFingerprint(project,model,budget);
 if(availability.reason==='recompute-required'||!commonContextMatches){
  const saved=project.terrain.applied;
  // Compare actual saved geometry/design inputs, excluding only the two
  // quantity inputs. Topology alone does not bind a foreign local orientation.
  inspectOwned(legacyTerrainInputs(project),budget);budget.check();
  const nonquantityContextMatches=terrainGeometryInputHash({...project,plantSpacingM:saved.inputs.plantSpacingM,postSpacingM:saved.inputs.postSpacingM},model)===saved.inputHash;
  budget.check();
  const reference={...source.candidate,rowPortions:[...source.rowPortions]};
  for(const baseline of entry.before.portions)if(!reference.rowPortions.some(portion=>portion.id===baseline.id)){
   const manual=baseline.manualPortion??entry.before.source.referencePortions.find(portion=>portion.id===baseline.id);
   if(manual)reference.rowPortions.push(manual);
  }
  const fresh=buildContourTerrainProposal({project:reference,model,portionId:entry.before.cut.sourceId,mode:'measure',recomputeAll:true,budget});
  if(!fresh.ok)return {...fresh,kind:'restore'};
  const affected=new Set(entry.affectedIds),foreign=saved.portionResults.filter(portion=>!affected.has(portion.id));
  const expectedIds=[...entry.before.cut.beforePortionIds,...foreign.map(portion=>portion.id)];
  if(!sameIdSet(expectedIds,fresh.terrain.applied.portionResults.map(portion=>portion.id))||!sameIdSet(expectedIds,fresh.result.portions.map(portion=>portion.id)))throw failure('restore-conflict','Fresh restored portion ownership is incomplete.');
  const freshQuantities=new Map(fresh.terrain.applied.portionResults.map(portion=>[portion.id,portion]));
  const retainedForeign=foreign.map(portion=>commonContextMatches&&nonquantityContextMatches?portion:freshQuantities.get(portion.id));
  const portionResults=positioned(retainedForeign,entry.before.portions.map(portion=>freshQuantities.get(portion.id)),entry.before.source.quantityPositions);
  const result=nativeAggregate(reference,portionResults,fresh.result,select(fresh.result,nativeAggregateKeys),budget);
  const freshReferences=new Map(fresh.result.portions.map(portion=>[portion.id,portion]));
  result.portions=source.referencePortions.map(portion=>{
   const measured=freshReferences.get(portion.id);
   if(affected.has(portion.id))return measured;
   if(nonquantityContextMatches)return portion;
   const metadata=Object.fromEntries(Object.entries(portion).filter(([key])=>!TERRAIN_PORTION_GEOMETRY_KEYS.includes(key)));
   return {...measured,...metadata};
  });
  const validation={...fresh.terrain.applied.validation,automaticPortionIds:portionResults.filter(portion=>portion.validation?.automaticSpacing).map(portion=>portion.id)};
  // The temporary measured references are solver inputs, never new raw editor
  // declarations. Bind the true fresh quantities to the literal restored raw.
  fresh.rowPortions=copyOwned(source.rowPortions,budget);
  if(source.removeProjectKeys.length)fresh.removeProjectKeys=copyOwned(source.removeProjectKeys,budget);
  fresh.terrain.applied=createContourEnvelope({project:source.candidate,model,result,portionResults,validation,budget});
  fresh.result=fresh.terrain.applied.result;
  fresh.changes=portionResults.map(portion=>({portionId:portion.id,after:sums(portion.rows,source.candidate)}));
  const {terrain:patchTerrain,rowPortions:patchPortions,...freshPatch}=fresh.projectPatch??{};
  const copied=copyOwned({remaining:entries.filter(saved=>saved!==entry),patch:{...source.projectPatch,...freshPatch}},budget);
  // The producer's terrain/rows are already owned. Keep its genuine model and
  // envelope instead of copying them again with the history patch.
  fresh.kind='restore';fresh.terrain.history={schemaVersion:1,entries:copied.remaining};fresh.projectPatch=copied.patch;
  if(patchTerrain!==undefined)fresh.projectPatch.terrain=fresh.terrain;
  if(patchPortions!==undefined)fresh.projectPatch.rowPortions=fresh.rowPortions;
  const after=effectiveNativeProject(project,fresh);
  if(readTerrainEnvelope(after,{budget})?.terrainStatus!=='applied')throw failure('restore-conflict','Fresh restored envelope integrity failed.');
  assertTerrainSerializationBudget(after);budget.check();return fresh;
 }
 const affected=new Set(entry.affectedIds),saved=project.terrain.applied;
 const portionResults=positioned(saved.portionResults.filter(portion=>!affected.has(portion.id)),entry.before.portions,entry.before.source.quantityPositions);
 const result=nativeAggregate(source.candidate,portionResults,saved.result,entry.before.nativeAggregate,budget);result.portions=source.referencePortions;
 const validation={valid:true,method:'saved-baseline-and-retained-applied-portions',automaticPortionIds:portionResults.filter(portion=>portion.validation?.automaticSpacing).map(portion=>portion.id)};
 const applied=createContourEnvelope({project:source.candidate,model,result,portionResults,validation,budget});
 const copied=copyOwned({rowPortions:source.rowPortions,patch:source.projectPatch,remaining:entries.filter(savedEntry=>savedEntry!==entry)},budget);
 const terrain={model,applied,history:{schemaVersion:1,entries:copied.remaining}};
 const proposal={ok:true,status:'ready',kind:'restore',message:'Disegno precedente pronto per Applica.',terrain,rowPortions:copied.rowPortions,projectPatch:copied.patch,...(source.removeProjectKeys.length?{removeProjectKeys:source.removeProjectKeys}:{}),result:applied.result,changes:entry.before.portions.map(portion=>({portionId:portion.id,after:sums(portion.rows,source.candidate)})),timings:budget.timings()};
 const after=effectiveNativeProject(project,proposal);
 if(readTerrainEnvelope(after,{budget})?.terrainStatus!=='applied')throw failure('restore-conflict','Restored native envelope integrity failed.');
 assertTerrainSerializationBudget(after);budget.check();return proposal;
}

/** A changed common context always goes through the real proposal builder. */
export function buildTerrainRestoreProposal({project,portionId,model=project?.terrain?.model,budget=createTerrainBudget({kind:'restore'})}={}){
 try{
  budget.check();const entries=historyEntries(project,budget),entry=entries.find(saved=>saved.affectedIds.includes(portionId));
  if(nativeCut(entry))return buildNativeRestore({project,portionId,model,budget,entries,entry});
 }catch(error){
  const nativeHistory=Array.isArray(project?.terrain?.history?.entries)&&project.terrain.history.entries.some(saved=>saved?.before?.cut&&['protocolVersion','action','beforePortionIds','afterPortionIds','previousGroup'].some(key=>Object.hasOwn(saved.before.cut,key)));
  if(error?.status==='budget-exceeded'||nativeHistory)return {ok:false,status:error.status??'restore-conflict',kind:'restore',message:error.message};
  // Historical malformed baselines keep their original availability/conflict
  // response. Native history and explicit exhaustion retain typed failures.
 }
 const availability=terrainRestoreAvailability({project,portionId});
 if(!availability.available)return conflict(availability.reason==='no-baseline'?'No saved original drawing is available.':'The restored drawing or baseline was edited.');
 try{
  budget.check();budget.phase('restore');
  const entries=historyEntries(project),entry=entries.find(e=>e.affectedIds.includes(portionId));
  const source=restoreSource(project,entry),remaining=clone(entries.filter(e=>e!==entry));
  if(availability.reason==='recompute-required'||entry.contextFingerprint!==contextFingerprint(project,model)){
   // The saved reference supplies raw manual parameters; no stale result enters
   // the fresh envelope. Other live input edits stay in the candidate.
   const reference=clone(source.candidate);
   // Implicit raw portions inherited the original global manual guide. Give
   // that guide explicit ownership in a fresh proposal so changed live global
   // orientation/curvature cannot substitute for the saved reference.
   reference.rowPortions=clone(source.rowPortions);
   for(const baseline of entry.before.portions)if(!reference.rowPortions.some(p=>p.id===baseline.id)){
    const manual=baseline.manualPortion??entry.before.source.referencePortions.find(p=>p.id===baseline.id);
    if(manual)reference.rowPortions.push(clone(manual));
   }
   const fresh=buildContourTerrainProposal({project:reference,model,portionId:entry.before.cut?.sourceId??entry.before.portions[0].id,mode:'measure',recomputeAll:true,budget});
   if(!fresh.ok)return {...fresh,kind:'restore'};
   fresh.kind='restore';fresh.terrain.history={schemaVersion:1,entries:remaining};fresh.projectPatch={...source.projectPatch,...fresh.projectPatch};
   assertTerrainSerializationBudget(materialize(project,fresh));return fresh;
  }
  const affected=new Set(entry.affectedIds),saved=project.terrain.applied;
  const portionResults=[...clone(saved.portionResults.filter(p=>!affected.has(p.id))),...clone(entry.before.portions)];
  // Preserve ordering/ownership separately from literal manual row objects.
  const order=saved.result.portions.filter(p=>!affected.has(p.id));
  for(const baseline of entry.before.portions){const original=baseline.manualPortion??source.rowPortions.find(p=>p.id===baseline.id)??saved.result.portions.find(p=>p.id===baseline.id);if(!original)throw failure('restore-conflict','Original portion topology is missing.');order.push(clone(original));}
  const result=aggregate(source.candidate,portionResults,saved.result);result.portions=order;
  if(portionResults.every(p=>Number.isFinite(p.usableHorizontalAreaM2)))result.excludedAreaM2=Math.max(0,result.areaM2-portionResults.reduce((s,p)=>s+p.usableHorizontalAreaM2,0));
  const validation={valid:true,method:'saved-baseline-and-retained-applied-portions',automaticPortionIds:portionResults.filter(p=>p.validation?.automaticSpacing).map(p=>p.id)};
  budget.check(geometryNodes(source.candidate.rowPortions)+geometryNodes(model)+geometryNodes(result)+geometryNodes(portionResults)+geometryNodes(remaining));
  const terrain={model:clone(model),applied:createContourEnvelope({project:source.candidate,model,result,portionResults,validation}),history:{schemaVersion:1,entries:remaining}};
  const proposal={ok:true,status:'ready',kind:'restore',message:'Disegno precedente pronto per Applica.',terrain,rowPortions:source.rowPortions,projectPatch:source.projectPatch,...(source.removeProjectKeys.length?{removeProjectKeys:source.removeProjectKeys}:{}),result,changes:entry.before.portions.map(p=>({portionId:p.id,after:sums(p.rows,source.candidate)})),timings:budget.timings()};
  if(readTerrainEnvelope(materialize(project,proposal)).terrainStatus!=='applied')throw failure('restore-conflict','Restored envelope integrity failed.');
  assertTerrainSerializationBudget(materialize(project,proposal));budget.check();return proposal;
 }catch(error){return {ok:false,status:error.status??'restore-conflict',kind:'restore',message:error.message};}
}
