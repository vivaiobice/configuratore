import {mapTerrainFields,packTerrainRowMirror,hydrateTerrainRows,inspectTerrainRowMirrors,terrainSnapshotJson} from './terrain-row-mirror.js?v=1.3.9';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.9';
import {inspectTerrainJsonText} from './terrain-history-codec.js?v=1.3.9';
export const TERRAIN_FIELD_MAX_BYTES=1024*1024;
export const TERRAIN_SNAPSHOT_MAX_BYTES=4*1024*1024;
const bytes=value=>new TextEncoder().encode(value).byteLength;

// Cloud metadata is derived from the field, outside its durable design budget.
// The complete transport envelope still counts toward the snapshot budget.
function fieldBytes(field){
 const {metrics,clientFieldId,cloudReady,...design}=field;
 return bytes(JSON.stringify(design));
}

export function serializeTerrainSnapshot(value,{rowMirrors=true,budget}={}){
 // Bound the complete logical project before packing or any owned geometry copy.
 inspectTerrainRowMirrors(value,{budget});
 const packed=rowMirrors?mapTerrainFields(value,field=>field?.terrain&&(Object.hasOwn(field.terrain,'rowMirrorStorage')||fieldBytes(field)>TERRAIN_FIELD_MAX_BYTES)?packTerrainRowMirror(field,{budget}):field,{budget}):value;
 let hasTerrain=false;
 const visit=item=>{
  budget?.check();if(!item||typeof item!=='object')return;
  if(Array.isArray(item.fields))for(const field of item.fields){
   if(field?.terrain){hasTerrain=true;if(fieldBytes(field)>TERRAIN_FIELD_MAX_BYTES)throw new RangeError('Il campo con terreno supera il limite di 1 MiB.');}
  }
  if(item.terrain&&!Array.isArray(item.fields)){hasTerrain=true;if(fieldBytes(item)>TERRAIN_FIELD_MAX_BYTES)throw new RangeError('Il campo con terreno supera il limite di 1 MiB.');return;}
  for(const [key,child] of Object.entries(item))if(key!=='fields'&&key!=='terrain'){
   if(Array.isArray(child))child.forEach(visit);else visit(child);
  }
 };
 visit(packed);
 const serialized=terrainSnapshotJson(packed,{budget});
 inspectTerrainRowMirrors(packed,{budget,wireBytes:bytes(serialized)});
 if(hasTerrain&&bytes(serialized)>TERRAIN_SNAPSHOT_MAX_BYTES)throw new RangeError('Il progetto con terreno supera il limite di 4 MiB.');
 return serialized;
}
export function assertTerrainSerializationBudget(value,options){serializeTerrainSnapshot(value,options);return value;}
// Only actual transport readers call this guard. A hydrated runtime field can
// exceed its wire size, so normalization/replay never apply it to logical data.
export function assertTerrainWireFieldBudget(value,{budget}={}){
 budget?.check();
 mapTerrainFields(value,(field,{facade=false}={})=>{
  if(facade)return field;
  const descriptor=field&&Object.getOwnPropertyDescriptor(field,'terrain');
  const terrain=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
  if(terrain&&(Object.hasOwn(terrain,'rowMirrorStorage')||terrain.history?.schemaVersion===2)&&fieldBytes(field)>TERRAIN_FIELD_MAX_BYTES)throw new RangeError('Il campo con terreno supera il limite di 1 MiB.');
  return field;
 },{budget});
 return value;
}
export function deserializeTerrainSnapshot(text,options={}){
 const boundedOperation=options.budget!==undefined&&options.budget!==null;
 const budget=options.budget??createTerrainBudget({kind:'restore'});
 budget?.check();if(typeof text!=='string')throw new TypeError('Terrain snapshot must be JSON text.');
 const wireBytes=bytes(text);budget?.check();
 const inspected=inspectTerrainJsonText(text,budget,{maxDepth:Infinity});
 if(inspected.hasTerrain&&wireBytes>TERRAIN_SNAPSHOT_MAX_BYTES)throw new RangeError('Il progetto con terreno supera il limite di 4 MiB.');
 // Ordinary manual JSON retains its historical size/node limits. A supplied
 // operation budget explicitly requests bounded coordinate acquisition.
 budget?.check(inspected.hasTerrain||boundedOperation?inspected.coordinateCount:0);
 budget?.check();const value=JSON.parse(text);budget?.check();
 assertTerrainWireFieldBudget(value,{budget});
 return hydrateTerrainRows(value,{...options,budget});
}
