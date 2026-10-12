import {actualTerrainContentKey} from './terrain-actual-content.js?v=1.3.10';
import {encodedTerrainHistoryBefore,inspectTerrainHistoryBefore} from './terrain-history-codec.js?v=1.3.10';

const CONVENTION='portion-results-order',MAX_EXPANDED_BYTES=4*1024*1024;
const bytes=value=>new TextEncoder().encode(value).byteLength;
const invalid=()=>new TypeError('Invalid terrain row mirror storage.');
const data=(object,key)=>{const descriptor=object&&Object.getOwnPropertyDescriptor(object,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;};
const marker=terrain=>terrain&&Object.hasOwn(terrain,'rowMirrorStorage');
const expandedLimit=()=>new RangeError('Il progetto con terreno supera il limite di 4 MiB.');
const invalidHistory=()=>Object.assign(new Error('Invalid terrain restore history.'),{status:'invalid-history'});
const ownData=(object,key)=>{const descriptor=object&&Object.getOwnPropertyDescriptor(object,key);return !!descriptor&&descriptor.enumerable&&Object.hasOwn(descriptor,'value');};
// Validate operands before JSON/spreads can invoke an accessor. This iterative
// guard has no plaintext depth cap and charges no coordinates before a copy.
function inspectPlainOperands(value,budget){
 const path=new WeakSet(),stack=[];let current=value;
 for(;;){
  budget.check();
  if(current&&typeof current==='object'){
   const array=Array.isArray(current),prototype=Object.getPrototypeOf(current);
   if((array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)||path.has(current))throw invalid();
   const keys=Reflect.ownKeys(current);if(keys.some(key=>typeof key!=='string'))throw invalid();
   path.add(current);stack.push({value:current,keys,index:0});
  }else if(!['undefined','string','boolean','number','object'].includes(typeof current))throw invalid();
  let next;
  while(stack.length){
   budget.check();const frame=stack.at(-1);
   if(frame.index===frame.keys.length){path.delete(frame.value);stack.pop();continue;}
   const descriptor=Object.getOwnPropertyDescriptor(frame.value,frame.keys[frame.index++]);
   if(!descriptor||!Object.hasOwn(descriptor,'value'))throw invalid();next=descriptor.value;break;
  }
  if(!stack.length)return;current=next;
 }
}
// The active editor facade is absent from durable transport; all other occurrences count.
export function terrainSnapshotJson(value,{budget}={}){
 return JSON.stringify(value,(_key,item)=>{
  budget?.check();
  if(item&&typeof item==='object'&&!Array.isArray(item)&&Array.isArray(data(item,'fields'))&&data(item,'fields').length&&data(item,'terrain')){
   const copy={...item};delete copy.terrain;return copy;
  }
  return item;
 });
}
function rowsFor(field,{budget}={}){
 if(actualTerrainContentKey(field,{budget})===null)throw invalid();
 const terrain=field.terrain,storage=terrain.rowMirrorStorage,applied=terrain.applied;
 if(!ownData(terrain,'rowMirrorStorage')||!storage||Reflect.ownKeys(storage).length!==2||!ownData(storage,'schemaVersion')||!ownData(storage,'convention')||storage.schemaVersion!==1||storage.convention!==CONVENTION||!applied?.result||!ownData(terrain,'applied')||!ownData(applied,'result')||Object.hasOwn(applied.result,'rows')||!Array.isArray(applied.portionResults))throw invalid();
 if(actualTerrainContentKey(storage,{budget})===null||actualTerrainContentKey(applied.portionResults,{budget})===null)throw invalid();
 const rows=[];
 for(const portion of applied.portionResults){budget?.check();if(!Array.isArray(portion?.rows))throw invalid();for(let i=0;i<portion.rows.length;i++){budget?.check();if(!Object.hasOwn(portion.rows,i))throw invalid();rows.push(portion.rows[i]);}}
 return rows;
}
function mapDataArray(array,transform,budget){
 let next=null;
 for(let i=0;i<array.length;i++){
  budget?.check();const descriptor=Object.getOwnPropertyDescriptor(array,String(i));if(!descriptor)continue;if(!Object.hasOwn(descriptor,'value'))return array;
  const child=transform(descriptor.value);
  if(child!==descriptor.value&&!next){next=new Array(array.length);for(let j=0;j<i;j++){const prior=Object.getOwnPropertyDescriptor(array,String(j));if(prior)next[j]=prior.value;}}
  if(next)next[i]=child;
 }
 return next??array;
}
// Only actual field terrain is transformed. Restore baselines stay opaque here.
function mapFields(value,transform,path=new WeakSet(),budget){
 budget?.check();if(!value||typeof value!=='object')return value;if(path.has(value))return value;path.add(value);
 if(Array.isArray(value)){const next=mapDataArray(value,child=>mapFields(child,transform,path,budget),budget);path.delete(value);return next;}
 let next=value;
 const set=(key,child)=>{if(child!==data(value,key)){if(next===value)next={...value};next[key]=child;}};
 const fields=data(value,'fields'),terrain=data(value,'terrain');
 if(Array.isArray(fields))set('fields',mapDataArray(fields,field=>transform(field),budget));
 if(terrain)set('terrain',transform(value,{facade:Array.isArray(fields)&&fields.length>0}).terrain);
 if(!terrain||Array.isArray(fields))for(const key of Object.keys(value)){
  if(['fields','terrain','history','before'].includes(key))continue;
  const child=data(value,key);if(child&&typeof child==='object')set(key,mapFields(child,transform,path,budget));
 }
 path.delete(value);return next;
}
function chargeRows(rows,budget){
 if(!budget)return;const seen=new WeakSet(),stack=[rows];
 while(stack.length){budget.check();const value=stack.pop();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
  if(Array.isArray(value)&&value.length>=2&&value.length<=3&&value.every(Number.isFinite))budget.check(1);
  for(const child of Object.values(value))stack.push(child);
 }
}
export function inspectTerrainRowMirrors(value,{budget,wireBytes}={}){
 budget?.check();if(budget)inspectPlainOperands(value,budget);
 const pending=new Map();let expansion=0,hasTerrain=false;
 mapFields(value,(field,{facade=false}={})=>{
  const terrain=data(field,'terrain');if(!terrain)return field;if(!facade)hasTerrain=true;
  if(marker(terrain)){
   const rows=rowsFor(field,{budget});pending.set(field,rows);
   if(!facade){
    const result=terrain.applied.result;
    expansion+=bytes(JSON.stringify(rows))+bytes('"rows":')+(Object.keys(result).length?1:0)-bytes(JSON.stringify(terrain.rowMirrorStorage))-bytes('"rowMirrorStorage":')-1;
   }
  }
  if(!facade){
   const history=data(terrain,'history'),entries=data(history,'entries');
   if(Array.isArray(entries)){
    let compressed=false;
    for(let i=0;i<entries.length;i++){
     budget?.check();const before=data(data(entries,String(i)),'before');
     if(!encodedTerrainHistoryBefore(before))continue;
     compressed=true;
     expansion+=inspectTerrainHistoryBefore(before,budget)-bytes(JSON.stringify(before));
    }
    if(compressed&&data(history,'schemaVersion')!==2)throw invalidHistory();
    if(data(history,'schemaVersion')===2&&(!compressed||Reflect.ownKeys(history).length!==2||!ownData(history,'schemaVersion')||!ownData(history,'entries')))throw invalidHistory();
   }
  }
  if(!Number.isSafeInteger(expansion))throw expandedLimit();return field;
 },new WeakSet(),budget);
 if(pending.size&&budget&&actualTerrainContentKey(value,{budget})===null)throw invalid();
 const size=wireBytes??bytes(terrainSnapshotJson(value,{budget}));budget?.check();
 if(!Number.isSafeInteger(size)||size<0)throw expandedLimit();
 if(hasTerrain&&(!Number.isSafeInteger(size+expansion)||size+expansion>MAX_EXPANDED_BYTES))throw expandedLimit();
 return pending;
}
export function hydrateTerrainRows(value,{budget}={}){
 const pending=inspectTerrainRowMirrors(value,{budget});if(!pending.size)return value;
 return mapFields(value,field=>{
  const rows=pending.get(field);if(!rows)return field;
  chargeRows(rows,budget);const copied=structuredClone(rows);budget?.check();
  const terrain={...field.terrain,applied:{...field.terrain.applied,result:{...field.terrain.applied.result,rows:copied}}};delete terrain.rowMirrorStorage;
  return {...field,terrain};
 },new WeakSet(),budget);
}
export const hydrateTerrainProject=hydrateTerrainRows;
export function packTerrainRowMirror(field,{budget}={}){
 budget?.check();
 const terrain=data(field,'terrain');if(!terrain)return field;
 if(marker(terrain)){inspectTerrainRowMirrors(field,{budget});return field;}
 const applied=data(terrain,'applied'),result=data(applied,'result'),rows=data(result,'rows'),portions=data(applied,'portionResults');
 if(!Array.isArray(rows)||!Array.isArray(portions)||!portions.every(p=>Array.isArray(data(p,'rows'))))return field;
 const key=actualTerrainContentKey(rows,{budget});if(key===null)return field;
 const mirror=portions.flatMap(p=>p.rows);
 // Compare against canonical JSON data without allocating another coordinate copy.
 if(key!==actualTerrainContentKey(mirror,{budget})||!jsonSafeRows(rows,budget))return field;
 const packedResult={...result};delete packedResult.rows;
 return {...field,terrain:{...terrain,rowMirrorStorage:{schemaVersion:1,convention:CONVENTION},applied:{...applied,result:packedResult}}};
}
function jsonSafeRows(value,budget,path=new WeakSet(),depth=0){
 budget?.check();if(depth>512)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0);
 if(!value||typeof value!=='object'||path.has(value)||Object.getPrototypeOf(value)!==(Array.isArray(value)?Array.prototype:Object.prototype))return false;
 const keys=Object.keys(value);
 if(Reflect.ownKeys(value).length!==keys.length+(Array.isArray(value)?1:0)||Array.isArray(value)&&(keys.length!==value.length||keys.some((key,i)=>key!==String(i))))return false;
 if(Array.isArray(value)){const length=Object.getOwnPropertyDescriptor(value,'length');if(!length||!length.writable||length.enumerable||length.configurable)return false;}
 path.add(value);
 const exact=keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&descriptor.enumerable&&descriptor.writable&&descriptor.configurable&&Object.hasOwn(descriptor,'value')&&jsonSafeRows(descriptor.value,budget,path,depth+1);});
 path.delete(value);return exact;
}
export function mapTerrainFields(value,transform,{budget}={}){return mapFields(value,transform,new WeakSet(),budget);}
