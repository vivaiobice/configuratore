// Exact transient content identity for plain data; no caller hashes or proof cache.
function inspectActualTerrainContent(value,{budget}={},collectKey){
 const path=new WeakSet(),parts=collectKey?[]:null,unsupported={};
 function visit(value,depth=0){
  budget?.check();
  if(depth>512)throw unsupported;
  if(value===null){parts?.push('n;');return;}
  switch(typeof value){
   case 'undefined':parts?.push('u;');return;
   case 'string':if(parts)parts.push('s',JSON.stringify(value));return;
   case 'boolean':parts?.push(value?'t;':'f;');return;
   case 'number':if(parts)parts.push('v',Object.is(value,-0)?'-0':String(value),';');return;
   case 'object':break;
   default:throw unsupported;
  }
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw unsupported;
  if(path.has(value))throw unsupported;
  const keys=Reflect.ownKeys(value);if(keys.some(key=>typeof key!=='string'))throw unsupported;
  path.add(value);parts?.push(array?'a{':prototype===null?'z{':'o{');
  for(const key of keys){
   budget?.check();
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   if(!descriptor||!Object.hasOwn(descriptor,'value'))throw unsupported;
   if(parts)parts.push(JSON.stringify(key),descriptor.enumerable?'1':'0',descriptor.configurable?'1':'0',descriptor.writable?'1':'0',':');
   visit(descriptor.value,depth+1);
  }
  parts?.push('}');path.delete(value);
 }
 try{visit(value);return parts?parts.join(''):true;}
 catch(error){if(error?.status==='budget-exceeded')throw error;return parts?null:false;}
}
export function actualTerrainContentKey(value,options){return inspectActualTerrainContent(value,options,true);}
export function isSupportedActualTerrainContent(value,options){return inspectActualTerrainContent(value,options,false);}
