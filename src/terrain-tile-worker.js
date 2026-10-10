import {buildTerrainTilePixels,frozenSurface} from './terrain-map.js?v=1.3.7';
let surface=null;
// Model validation and grid preparation run once in this production worker.
self.onmessage=async({data:message})=>{
 try{
  if(message.type==='init'){
   if(surface)throw new Error('Modello grafico già inizializzato.');
   surface=await frozenSurface(message.model);self.postMessage({type:'ready',bounds:surface.bounds});return;
  }
  if(message.type!=='tile'||!surface)throw new Error('Worker grafico non inizializzato.');
  const size=message.coordinates.size??256,pixels=buildTerrainTilePixels({...message.coordinates,size},surface.heightAt);
  if(typeof OffscreenCanvas==='function'){
   const canvas=new OffscreenCanvas(size,size),context=canvas.getContext('2d');
   if(context){context.putImageData(new ImageData(pixels,size,size),0,0);const blob=await canvas.convertToBlob({type:'image/png'}),data=await blob.arrayBuffer();canvas.width=0;canvas.height=0;self.postMessage({type:'tile',id:message.id,data},[data]);return;}
  }
  self.postMessage({type:'tile',id:message.id,pixels,size},[pixels.buffer]);
 }catch(error){self.postMessage({type:'error',id:message.id,message:error.message});}
};
