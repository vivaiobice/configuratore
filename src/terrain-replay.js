import {terrainInputHash,validateTerrainModel} from './terrain-model.js?v=1.3.2';
import {TERRAIN_CONTOUR_ALGORITHM_VERSION,TERRAIN_ENVELOPE_SCHEMA_VERSION,TERRAIN_PORTION_GEOMETRY_KEYS,TERRAIN_EXCLUSION_GEOMETRY_KEYS} from './terrain-contour-contracts.js?v=1.3.2';

import {SOURCE_DOMAIN_AXIS_CONVENTION,SOURCE_PARAMETER_OPERATION,validSourceAxisSchema,axisSourceHash} from './terrain-axis-geometry.js?v=1.3.2';
import {terrainSurfaceGroupsPresent,resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.2';
import {deriveCanonicalCutScopes,canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.2';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.2';
import {FINITE_POLYLINE_AXIS_CONVENTION,validFinitePolylineSourceAxisSchema} from './terrain-polyline-source.js?v=1.3.2';
import {createContourDomain} from './terrain-contour-domain.js?v=1.3.2';
import {measureContourAxes} from './terrain-contour-family.js?v=1.3.2';
import {resolveRowPortions} from './row-portions.js?v=1.3.2';
const clone=value=>JSON.parse(JSON.stringify(value));
// Inspect the actual serialized payload without recursively walking the stack
// or first allocating a flattened coordinate list. Aliases are visited once per
// occurrence, as JSON copies them; only an active-path revisit is a cycle.
function* payloadValues(value){
 if(Array.isArray(value)){for(let index=0;index<value.length;index++)yield value[index];}
 else for(const key in value)if(Object.hasOwn(value,key))yield value[key];
}
function inspectPayload(value,budget,chargeCoordinates=false){
 if(!budget)return;
 const path=new WeakSet(),stack=[];
 let current=value;
 for(;;){
  budget.check();
  if(current&&typeof current==='object'){
   if(path.has(current))throw new RangeError('Ciclo nei dati del disegno terreno.');
   if(chargeCoordinates&&Array.isArray(current)&&current.length>=2&&current.length<=3&&current.every(Number.isFinite))budget.check(1);
   path.add(current);stack.push({value:current,values:payloadValues(current)});
  }
  let next;
  while(stack.length){
   budget.check();
   const frame=stack.at(-1);next=frame.values.next();
   if(!next.done)break;
   path.delete(frame.value);stack.pop();
  }
  if(!stack.length)return;
  current=next.value;
 }
}
function checkedHash(value,budget){
 inspectPayload(value,budget);
 budget?.check();const hash=terrainInputHash(value);budget?.check();return hash;
}
// Keep the historical projection byte-for-byte in meaning. In particular, raw
// portions/exclusions include every saved key and are never normalized here.
export function legacyTerrainInputs(p){return {polygon:p.polygon??p.geometry,exclusions:p.exclusions??[],rowSpacingM:Number(p.rowSpacingM),plantSpacingM:Number(p.plantSpacingM),orientationDeg:Number(p.orientationDeg)||0,rowCurvePoints:p.rowCurvePoints??[],rowPortions:p.rowPortions??[],maintainRowEquidistance:p.maintainRowEquidistance!==false,postSpacingM:p.postSpacingM==null?null:Number(p.postSpacingM),headlandWidthM:p.headlandWidthM==null?null:Number(p.headlandWidthM)};}
export function legacyTerrainDesignInputHash(project,model){return terrainInputHash({modelHash:model.contentHash,...legacyTerrainInputs(project)});}
const select=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
function geometryInputs(project,budget){
 budget?.check();
 const input=legacyTerrainInputs(project);
 return {...input,rowPortions:input.rowPortions.map(portion=>{budget?.check();return select(portion,TERRAIN_PORTION_GEOMETRY_KEYS);}),exclusions:input.exclusions.map(exclusion=>{budget?.check();return Array.isArray(exclusion)?{geometry:exclusion}:select(exclusion,TERRAIN_EXCLUSION_GEOMETRY_KEYS);})};
}
export function terrainGeometryInputHash(project,model){return terrainInputHash({modelHash:model.contentHash,...geometryInputs(project)});}
function envelopeHash(applied,budget){
 const contents={inputs:applied.inputs,result:applied.result,portionResults:applied.portionResults,validation:applied.validation};
 // Schema-free archives deliberately do not bind algorithmVersion.
 return checkedHash(Object.hasOwn(applied,'schemaVersion')?{schemaVersion:applied.schemaVersion,algorithmVersion:applied.algorithmVersion,...contents}:contents,budget);
}
export function hashTerrainEnvelope(applied){return envelopeHash(applied);}
/** @returns {import('./terrain-contour-contracts.js?v=1.3.1-prova.1').AppliedEnvelopeV2} */
export function createContourEnvelope({project,model,result,portionResults,validation,budget}){
 budget?.check();
 const inputs=geometryInputs(project,budget);
 // These are the only four deep copies made here. Precharge every coordinate
 // occurrence before the first copy; the encoded model/grid is not copied.
 for(const payload of [inputs,result,portionResults,validation])inspectPayload(payload,budget,true);
 const inputHash=checkedHash({modelHash:model.contentHash,...inputs},budget);
 const copy=value=>{budget?.check();const copied=clone(value);budget?.check();return copied;};
 const applied={schemaVersion:TERRAIN_ENVELOPE_SCHEMA_VERSION,algorithmVersion:TERRAIN_CONTOUR_ALGORITHM_VERSION,inputHash,inputs:copy(inputs),result:copy(result),portionResults:copy(portionResults),validation:copy(validation),resultHash:checkedHash(result,budget)};
 applied.snapshotHash=envelopeHash(applied,budget);
 budget?.check();
 return applied;
}
export function invalidTerrainResult(message){return {terrainStatus:'invalid',terrainMessage:message,quantityBasis:'invalid',surfaceRowLinearM:null,rows:[],portions:[],areaM2:null,netAreaM2:null,headlandAreaM2:null,excludedAreaM2:null,perimeterM:null,vertexCount:null,rowCount:null,rowLinearM:null,horizontalRowLinearM:null,surfaceAreaM2:null,surfaceNetAreaM2:null,simulatedPlants:null,theoreticalPlants:null,commercialPlants25:null,headPosts:null,intermediatePosts:null,totalPosts:null};}
const invalid=invalidTerrainResult;
function canonicalRecipeDomains(project,applied,model,suppliedBudget,actualGroups){
 const scopes=new Map(),groups=new Map(),claimed=new Map(),budget=suppliedBudget??createTerrainBudget({kind:'cut'});
 // Real marked groups exist independently of submitted child records. Derive
 // each once, including a group whose entire submitted child set is omitted.
 for(const group of actualGroups?.groups??[]){
  budget.check();
  // Literal shape-edited groups retain their established replay route. Only
  // native domain-intersection owners prescribe a complete canonical child set.
  if(group.owner.surfaceGeometryConvention!=='domain-intersection')continue;
  groups.set(group.groupId,deriveCanonicalCutScopes({project,model,groupId:group.groupId,budget}));
  claimed.set(group.groupId,new Set());
 }
 for(const portion of project.rowPortions??[]){
  suppliedBudget?.check();
  if(!Object.hasOwn(portion,'terrainScopeRecipe'))continue;
  budget.check();
  const recipe=portion.terrainScopeRecipe;
  if(recipe?.kind!=='canonical-cut-child-1'||typeof recipe.groupId!=='string'||!recipe.groupId||typeof recipe.componentKey!=='string'||!recipe.componentKey||Object.keys(recipe).some(key=>!['kind','groupId','componentKey'].includes(key))||scopes.has(portion.id))throw new RangeError('Unknown or duplicate canonical child recipe');
  if(!groups.has(recipe.groupId)){
   if(actualGroups)throw new RangeError('Canonical child refers to an absent actual group');
   groups.set(recipe.groupId,deriveCanonicalCutScopes({project,model,groupId:recipe.groupId,budget}));
   claimed.set(recipe.groupId,new Set());
  }
  const child=groups.get(recipe.groupId).children.find(child=>child.componentKey===recipe.componentKey),keys=claimed.get(recipe.groupId);
  if(!child||keys.has(recipe.componentKey))throw new RangeError('Missing or duplicate actual canonical child component');
  let rawCount=0,resultCount=0;
  for(const saved of project.rowPortions??[]){budget.check();if(saved.id===portion.id)rawCount++;}
  for(const saved of applied.portionResults??[]){budget.check();if(saved.id===portion.id)resultCount++;}
  if(rawCount!==1||resultCount!==1)throw new RangeError('Canonical child requires one unique supplied raw record and result');
  budget.check();keys.add(recipe.componentKey);scopes.set(portion.id,child.domain);
 }
 for(const [groupId,derived] of groups){
  budget.check();
  const keys=claimed.get(groupId);
  if(keys.size!==derived.children.length||derived.children.some(child=>!keys.has(child.componentKey)))throw new RangeError('Actual canonical group child set is incomplete');
 }
 for(const saved of applied.portionResults??[]){
  suppliedBudget?.check();
  const recipe=saved.design?.axisScopeRecipe;
  if(recipe&&groups.has(recipe.groupId)&&!scopes.has(saved.id))throw new RangeError('Canonical group result has no unique submitted child');
 }
 return scopes;
}
function validAxisRecipeEnvelope(project,applied,model,canonicalDomains,budget){
 const hash=value=>checkedHash(value,budget);
 const portions=applied.portionResults??[];
 let finiteBudget,originalDomain,currentPortions;
 const validateFinite=portion=>{
  const design=portion.design;
  finiteBudget??=budget??createTerrainBudget({kind:'cut'});
  const b=finiteBudget,h=value=>checkedHash(value,b);
  if(design.modelHash!==model.contentHash||design.crs!==model.crs||!Array.isArray(design.axes)||!design.axes.length||design.axes.some(axis=>axis.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION||axis.axisOperation||!validFinitePolylineSourceAxisSchema(axis,b)||axis.portionId!==portion.id)||new Set(design.axes.map(axis=>axis.axisId)).size!==design.axes.length)return false;
  const raw=(project.rowPortions??[]).filter(saved=>saved.id===portion.id);
  if(raw.length!==1||!raw[0].terrainDesign||h(raw[0].terrainDesign)!==h(design))return false;
  originalDomain??=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.polygon??project.geometry]},budget:b});
  if(h(design.originalAxisScopeGeometry)!==h(originalDomain.geometry))return false;
  let domain=canonicalDomains.get(portion.id);
  if(domain){
   if(h(design.axisScopeRecipe)!==h(canonicalCutDomainScope(domain).recipe))return false;
  }else{
   if(Object.hasOwn(design,'axisScopeRecipe'))return false;
   currentPortions??=resolveRowPortions({...legacyTerrainInputs(project),budget:b});
   const actual=currentPortions.filter(saved=>saved.id===portion.id);
   if(actual.length!==1)return false;
   domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:actual[0].geometry},budget:b});
  }
  if(h(design.axisScopeGeometry)!==h(domain.geometry))return false;
  // Rebuild complete acquired-support sources and the original-perimeter ground
  // operations. Submitted previews, intervals and rehashed mirrors confer no
  // authority. The measurement resolver checks every current/original binding.
  const measured=measureContourAxes({domain:originalDomain,physicalDomain:domain,axes:design.axes,headlandWidthM:Math.max(0,Number(project.headlandWidthM)||0),budget:b});
  if(h(measured.rows)!==h(portion.rows??[]))return false;
  for(const row of measured.rows){
   b.check();
   const matches=(applied.result.rows??[]).filter(saved=>saved.fragmentId===row.fragmentId&&saved.axisId===row.axisId&&saved.portionId===row.portionId);
   if(matches.length!==1||h(matches[0])!==h(row))return false;
  }
  return true;
 };
 for(const saved of project.rowPortions??[]){
  budget?.check();
  const design=saved.terrainDesign;
  if(!design)continue;
  if(Object.hasOwn(design,'axisGeometryConvention')||(design.axes??[]).some(axis=>Object.hasOwn(axis,'axisGeometryConvention'))){
   const portion=portions.find(p=>p.id===saved.id);
   if(!portion||hash(design)!==hash(portion.design))return false;
  }
 }
 for(const portion of portions){
  budget?.check();
  const design=portion.design??{};
  const markers=(design.axes??[]).filter(axis=>Object.hasOwn(axis,'axisGeometryConvention'));
  if(design.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION){if(!validateFinite(portion))return false;continue;}
  if(Object.hasOwn(design,'axisGeometryConvention')&&design.axisGeometryConvention!==SOURCE_DOMAIN_AXIS_CONVENTION)return false;
  if(!markers.length){
   if(Object.hasOwn(design,'axisGeometryConvention')||Object.hasOwn(design,'axisScopeRecipe')||(portion.rows??[]).some(row=>row.axisOperation||row.coordinateRole==='render-export-preview'))return false;
   continue;
  }
  if(design.axisGeometryConvention!==SOURCE_DOMAIN_AXIS_CONVENTION||markers.length!==design.axes.length||design.modelHash!==model.contentHash||design.crs!==model.crs||!design.axisScopeGeometry||!design.originalAxisScopeGeometry)return false;
  const canonical=canonicalDomains.get(portion.id);
  if(Object.hasOwn(design,'axisScopeRecipe')&&!canonical||canonical&&!Object.hasOwn(design,'axisScopeRecipe'))return false;
  if(canonical&&(hash(design.axisScopeRecipe)!==hash(canonicalCutDomainScope(canonical).recipe)||hash(design.axisScopeGeometry)!==hash(canonical.geometry)))return false;
  const scopeHash=canonical?canonicalCutDomainScope(canonical).scopeHash:hash(design.axisScopeGeometry),originalScopeHash=hash(design.originalAxisScopeGeometry);
  const saved=(project.rowPortions??[]).find(p=>p.id===portion.id)?.terrainDesign;
  if(!saved||hash(saved)!==hash(design))return false;
  const ids=new Set();
  for(const axis of markers){
   budget?.check();
   if(!validSourceAxisSchema(axis)||axis.axisOperation||ids.has(axis.axisId)||axis.portionId!==portion.id)return false;
   ids.add(axis.axisId);
   const binding=axis.axisGeometryBinding;
   if(binding.modelHash!==model.contentHash||binding.crs!==model.crs||binding.scopeHash!==scopeHash||binding.originalScopeHash!==originalScopeHash)return false;
  }
  for(const row of portion.rows??[]){
   budget?.check();
   const axis=markers.find(axis=>axis.axisId===row.axisId),operation=row.axisOperation;
   if(!axis||row.coordinateRole!=='render-export-preview'||!operation||operation.sourceHash!==axisSourceHash(axis))return false;
   if(![SOURCE_DOMAIN_AXIS_CONVENTION,SOURCE_PARAMETER_OPERATION].includes(operation.kind))return false;
   if(operation.kind===SOURCE_PARAMETER_OPERATION&&!validSourceAxisSchema({...axis,axisOperation:{kind:operation.kind,intervals:operation.intervals}}))return false;
   for(const key of ['modelHash','crs','scopeHash','originalScopeHash'])if(operation[key]!==axis.axisGeometryBinding[key])return false;
   const resultRow=applied.result.rows.find(r=>r.fragmentId===row.fragmentId&&r.axisId===row.axisId&&r.portionId===row.portionId);
   if(!resultRow||hash(resultRow)!==hash(row))return false;
  }
 }
 // An unknown marker cannot hide solely in the aggregate result.
 for(const row of applied.result.rows??[]){
  budget?.check();
  if(Object.hasOwn(row,'axisGeometryConvention')&&![SOURCE_DOMAIN_AXIS_CONVENTION,FINITE_POLYLINE_AXIS_CONVENTION].includes(row.axisGeometryConvention))return false;
  if(row.axisOperation||row.coordinateRole==='render-export-preview'){
   const saved=portions.flatMap(p=>p.rows??[]).find(r=>r.fragmentId===row.fragmentId&&r.axisId===row.axisId&&r.portionId===row.portionId);
   if(!saved||hash(saved)!==hash(row))return false;
  }
 }
 return true;
}
export function readTerrainEnvelope(project,{budget}={}){
 budget?.check();
 const terrain=project?.terrain;if(!terrain)return null;
 const applied=terrain.applied;
 if(applied&&Object.hasOwn(applied,'schemaVersion')&&applied.schemaVersion!==TERRAIN_ENVELOPE_SCHEMA_VERSION)return invalid('Versione del disegno terreno non supportata.');
 try{
  const v2=applied&&Object.hasOwn(applied,'schemaVersion');
  const inputHash=(input,model)=>checkedHash({modelHash:model.contentHash,...(v2?geometryInputs(input,budget):legacyTerrainInputs(input))},budget);
  // Active validators and hashes can traverse nested archived data. Inspect
  // their actual operands with the caller deadline before invoking them.
  if(budget){
   inspectPayload(terrain.model,budget);
   inspectPayload(v2?geometryInputs(project,budget):legacyTerrainInputs(project),budget);
   inspectPayload(applied,budget);
  }
  budget?.check();
  let actualGroups=null;
  if(terrainSurfaceGroupsPresent(project.exclusions)){
   if(!v2)return invalid('I gruppi di passaggi richiedono un disegno terreno verificato aggiornato.');
   actualGroups=resolveTerrainExclusionGroups({exclusions:project.exclusions,field:project.polygon??project.geometry,...(budget?{budget}:{})});
  }
  budget?.check();
  if(!validateTerrainModel(terrain.model).valid||!applied?.validation?.valid||!applied.result||applied.inputHash!==inputHash(project,terrain.model))return invalid('Terreno da ricalcolare: dati o parametri modificati.');
  budget?.check();
  if(applied.snapshotHash!==envelopeHash(applied,budget)||applied.resultHash!==checkedHash(applied.result,budget)||!Array.isArray(applied.result.rows)||applied.result.terrainStatus!=='applied'||v2&&applied.inputHash!==inputHash(applied.inputs,terrain.model))return invalid('Geometria terreno applicata non valida.');
  if(!v2&&(project.rowPortions??[]).some(p=>Object.hasOwn(p,'terrainScopeRecipe')))return invalid('Versione della porzione terreno non supportata.');
  const canonicalDomains=v2?canonicalRecipeDomains(project,applied,terrain.model,budget,actualGroups):new Map();
  if(v2&&!validAxisRecipeEnvelope(project,applied,terrain.model,canonicalDomains,budget))return invalid('Convenzione o provenienza degli assi terreno non valida.');
  inspectPayload(applied.result,budget,true);
  budget?.check();const result=clone(applied.result);budget?.check();return result;
 }catch(error){if(budget&&error?.status==='budget-exceeded')throw error;return invalid('Geometria terreno applicata non valida.');}
}
