import {createDisplayTerrainSampler,createContextDEMClient,composeDisplayTile,terrainMercator,canPassContextTile,displayTerrainAttribution} from './terrain-context-dem.js?v=1.3.5';
let display=null,context=null,contextMaxzoom=15;const cancelled=new Set(),jobs=new Map(),cache=new Map();
async function decodePixels(bytes){const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{premultiplyAlpha:'none',colorSpaceConversion:'none'});try{if(bitmap.width!==256||bitmap.height!==256)throw new Error('Dimensioni del contesto non valide.');const canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,256,256).data;}finally{bitmap.close();}}
self.addEventListener('message',async({data})=>{
 if(data.type==='cancel'){if(jobs.has(data.id)){cancelled.add(data.id);jobs.get(data.id).abort();}return;}
 if(data.type==='tile')jobs.set(data.id,new AbortController());
 try{
  if(data.type==='init'){
   display=createDisplayTerrainSampler(data);contextMaxzoom=data.source.maxzoom;context=createContextDEMClient({source:data.source,decodePixels});const [u,v]=terrainMercator(display.coordinate),z=15;
   await context.getTile({z,x:Math.floor(u*2**z),y:Math.floor(v*2**z)});self.postMessage({type:'ready',value:{coordinate:display.coordinate,modelHash:display.modelHash,collar:display.collar,attribution:displayTerrainAttribution({model:data.model,contextSource:data.source})}});return;
  }
  if(data.type!=='tile')return;if(!display||!context)throw new Error('Terreno non inizializzato.');
  const key=`${data.z}/${data.x}/${data.y}`,cached=cache.get(key);let bytes=cached;
  if(!bytes&&canPassContextTile(data,display,contextMaxzoom))bytes=(await context.getTile({...data,signal:jobs.get(data.id).signal})).bytes;
  if(!bytes){
   const contextAt=await context.samplerFor({...data,signal:jobs.get(data.id).signal});if(cancelled.delete(data.id))return;
   const pixels=composeDisplayTile(data,display,contextAt),canvas=new OffscreenCanvas(data.size,data.size),ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(pixels,data.size,data.size),0,0);
   bytes=await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer();
  }
  cache.delete(key);cache.set(key,bytes);while(cache.size>96)cache.delete(cache.keys().next().value);
  if(cancelled.delete(data.id))return;const result=bytes.slice(0);self.postMessage({type:'tile',id:data.id,bytes:result},[result]);
 }catch(error){if(cancelled.delete(data.id))return;self.postMessage({type:'error',id:data.id,message:error?.message??'Terreno di contesto non disponibile.'});}finally{jobs.get(data.id)?.abort();jobs.delete(data.id);cancelled.delete(data.id);}
});
