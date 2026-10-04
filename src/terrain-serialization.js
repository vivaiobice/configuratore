export const TERRAIN_FIELD_MAX_BYTES=1024*1024;
export const TERRAIN_SNAPSHOT_MAX_BYTES=4*1024*1024;
const bytes=value=>new TextEncoder().encode(value).byteLength;

// Cloud metadata is derived from the field, outside its durable design budget.
// The complete transport envelope still counts toward the snapshot budget.
function fieldBytes(field){
 const {metrics,clientFieldId,cloudReady,...design}=field;
 return bytes(JSON.stringify(design));
}

// The active field is mirrored by the editor. Keep its frozen grid only in fields.
function compactJson(value){
 return JSON.stringify(value,(_key,item)=>{
  if(item&&typeof item==='object'&&!Array.isArray(item)&&Array.isArray(item.fields)&&item.fields.length&&item.terrain){
   const copy={...item};delete copy.terrain;return copy;
  }
  return item;
 });
}
export function serializeTerrainSnapshot(value){
 let hasTerrain=false;
 const visit=item=>{
  if(!item||typeof item!=='object')return;
  if(Array.isArray(item.fields))for(const field of item.fields){
   if(field?.terrain){hasTerrain=true;if(fieldBytes(field)>TERRAIN_FIELD_MAX_BYTES)throw new RangeError('Il campo con terreno supera il limite di 1 MiB.');}
  }
  if(item.terrain&&!Array.isArray(item.fields)){hasTerrain=true;if(fieldBytes(item)>TERRAIN_FIELD_MAX_BYTES)throw new RangeError('Il campo con terreno supera il limite di 1 MiB.');return;}
  for(const [key,child] of Object.entries(item))if(key!=='fields'&&key!=='terrain'){
   if(Array.isArray(child))child.forEach(visit);else visit(child);
  }
 };
 visit(value);
 const serialized=compactJson(value);
 if(hasTerrain&&bytes(serialized)>TERRAIN_SNAPSHOT_MAX_BYTES)throw new RangeError('Il progetto con terreno supera il limite di 4 MiB.');
 return serialized;
}
export function assertTerrainSerializationBudget(value){serializeTerrainSnapshot(value);return value;}
