import {terrainInputHash,validateTerrainModel} from './terrain-model.js?v=1.3.1-prova.1';
import {TERRAIN_CONTOUR_ALGORITHM_VERSION,TERRAIN_ENVELOPE_SCHEMA_VERSION,TERRAIN_PORTION_GEOMETRY_KEYS,TERRAIN_EXCLUSION_GEOMETRY_KEYS} from './terrain-contour-contracts.js?v=1.3.1-prova.1';

const clone=value=>JSON.parse(JSON.stringify(value));
// Keep the historical projection byte-for-byte in meaning. In particular, raw
// portions/exclusions include every saved key and are never normalized here.
export function legacyTerrainInputs(p){return {polygon:p.polygon??p.geometry,exclusions:p.exclusions??[],rowSpacingM:Number(p.rowSpacingM),plantSpacingM:Number(p.plantSpacingM),orientationDeg:Number(p.orientationDeg)||0,rowCurvePoints:p.rowCurvePoints??[],rowPortions:p.rowPortions??[],maintainRowEquidistance:p.maintainRowEquidistance!==false,postSpacingM:p.postSpacingM==null?null:Number(p.postSpacingM),headlandWidthM:p.headlandWidthM==null?null:Number(p.headlandWidthM)};}
export function legacyTerrainDesignInputHash(project,model){return terrainInputHash({modelHash:model.contentHash,...legacyTerrainInputs(project)});}
const select=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
function geometryInputs(project){
 const input=legacyTerrainInputs(project);
 return {...input,rowPortions:input.rowPortions.map(portion=>select(portion,TERRAIN_PORTION_GEOMETRY_KEYS)),exclusions:input.exclusions.map(exclusion=>Array.isArray(exclusion)?{geometry:exclusion}:select(exclusion,TERRAIN_EXCLUSION_GEOMETRY_KEYS))};
}
export function terrainGeometryInputHash(project,model){return terrainInputHash({modelHash:model.contentHash,...geometryInputs(project)});}
export function hashTerrainEnvelope(applied){
 const contents={inputs:applied.inputs,result:applied.result,portionResults:applied.portionResults,validation:applied.validation};
 // Schema-free archives deliberately do not bind algorithmVersion.
 return terrainInputHash(Object.hasOwn(applied,'schemaVersion')?{schemaVersion:applied.schemaVersion,algorithmVersion:applied.algorithmVersion,...contents}:contents);
}
/** @returns {import('./terrain-contour-contracts.js?v=1.3.1-prova.1').AppliedEnvelopeV2} */
export function createContourEnvelope({project,model,result,portionResults,validation}){
 const applied={schemaVersion:TERRAIN_ENVELOPE_SCHEMA_VERSION,algorithmVersion:TERRAIN_CONTOUR_ALGORITHM_VERSION,inputHash:terrainGeometryInputHash(project,model),inputs:clone(geometryInputs(project)),result:clone(result),portionResults:clone(portionResults),validation:clone(validation),resultHash:terrainInputHash(result)};
 applied.snapshotHash=hashTerrainEnvelope(applied);
 return applied;
}
function invalid(message){return {terrainStatus:'invalid',terrainMessage:message,quantityBasis:'invalid',surfaceRowLinearM:null,rows:[],portions:[],areaM2:null,netAreaM2:null,headlandAreaM2:null,excludedAreaM2:null,perimeterM:null,vertexCount:null,rowCount:null,rowLinearM:null,horizontalRowLinearM:null,surfaceAreaM2:null,surfaceNetAreaM2:null,simulatedPlants:null,theoreticalPlants:null,commercialPlants25:null,headPosts:null,intermediatePosts:null,totalPosts:null};}
export function readTerrainEnvelope(project){
 const terrain=project?.terrain;if(!terrain)return null;
 const applied=terrain.applied;
 if(applied&&Object.hasOwn(applied,'schemaVersion')&&applied.schemaVersion!==TERRAIN_ENVELOPE_SCHEMA_VERSION)return invalid('Versione del disegno terreno non supportata.');
 try{
  const v2=applied&&Object.hasOwn(applied,'schemaVersion'),inputHash=v2?terrainGeometryInputHash:legacyTerrainDesignInputHash;
  if(!validateTerrainModel(terrain.model).valid||!applied?.validation?.valid||!applied.result||applied.inputHash!==inputHash(project,terrain.model))return invalid('Terreno da ricalcolare: dati o parametri modificati.');
  if(applied.snapshotHash!==hashTerrainEnvelope(applied)||applied.resultHash!==terrainInputHash(applied.result)||!Array.isArray(applied.result.rows)||applied.result.terrainStatus!=='applied'||v2&&applied.inputHash!==terrainGeometryInputHash(applied.inputs,terrain.model))return invalid('Geometria terreno applicata non valida.');
  return clone(applied.result);
 }catch{return invalid('Geometria terreno applicata non valida.');}
}
