import {createTerrainSampler} from './terrain-model.js?v=1.3.7';
import {toUTM,fromUTM} from './coordinate-system.js?v=1.3.7';

// Context and the composite pyramid are display data. Never return these heights
// to the calculator, or mutate the frozen native grid to match a basemap.
export const CONTEXT_DEM={urlTemplate:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',maxzoom:15,tileSize:256,attribution:'Terreno di contesto: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen/AWS Terrain Tiles</a> · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">USGS, Copernicus e altri fornitori</a>'};
const escapeText=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function displayTerrainAttribution({model,contextSource=CONTEXT_DEM}){return `DTM del campo: ${escapeText(model?.source?.citation)} · ${escapeText(model?.source?.license)} | ${contextSource.attribution??''}`;}
const aborted=()=>new DOMException('Vista terreno chiusa.','AbortError');
const smooth=t=>t*t*(3-2*t);
export function terrainMercator([lng,lat]){return [(lng+180)/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2];}
function coordinateAt(u,v){return [u*360-180,Math.atan(Math.sinh(Math.PI*(1-2*v)))*180/Math.PI];}
export function createDisplayTerrainSampler({model,geometry}){
 const sample=createTerrainSampler(model),epsg=Number(model.crs.split(':')[1]),{origin,step,width,height}=model.grid;
 const bounds=[Math.min(origin[0],origin[0]+step[0]*(width-1)),Math.min(origin[1],origin[1]+step[1]*(height-1)),Math.max(origin[0],origin[0]+step[0]*(width-1)),Math.max(origin[1],origin[1]+step[1]*(height-1))];
 if(!Array.isArray(geometry)||geometry.length<4)throw new Error('Perimetro del terreno non valido.');
 const xy=geometry.map(p=>toUTM(p,epsg)),field=[Math.min(...xy.map(p=>p[0])),Math.min(...xy.map(p=>p[1])),Math.max(...xy.map(p=>p[0])),Math.max(...xy.map(p=>p[1]))];
 const collar=Math.min(field[0]-bounds[0],field[1]-bounds[1],bounds[2]-field[2],bounds[3]-field[3]);
 if(!(collar>1e-3))throw new Error('Copertura DTM senza margine di supporto per il raccordo del contesto.');
 for(const p of geometry)if(!Number.isFinite(sample(p)))throw new Error('Copertura DTM incompleta sul campo.');
 const coordinate=fromUTM([(field[0]+field[2])/2,(field[1]+field[3])/2],epsg);
 const corners=[[bounds[0],bounds[1]],[bounds[0],bounds[3]],[bounds[2],bounds[1]],[bounds[2],bounds[3]]].map(p=>terrainMercator(fromUTM(p,epsg)));
 const mercatorBounds=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
 return {coordinate,collar,mercatorBounds,modelHash:model.contentHash,heightAt(point,contextHeight){
  if(!Number.isFinite(contextHeight))throw new Error('Quota del contesto non disponibile.');
  const [mx,my]=terrainMercator(point);if(mx<mercatorBounds[0]||mx>mercatorBounds[2]||my<mercatorBounds[1]||my>mercatorBounds[3])return contextHeight;
  const [x,y]=toUTM(point,epsg),distance=Math.min(x-bounds[0],y-bounds[1],bounds[2]-x,bounds[3]-y);
  if(distance<=0)return contextHeight;const native=sample(point);if(!Number.isFinite(native))throw new Error('Copertura DTM incompleta nel raccordo.');
  const weight=smooth(Math.min(1,distance/collar));return contextHeight+(native-contextHeight)*weight;
 }};
}
// Untouched canonical context keeps the provider's exact PNG and avoids a full
// pixel transform/encode pass. Local or overscaled tiles still use composition.
export function canPassContextTile({z,x,y},display,maxzoom=15){
 const n=2**z,[left,top,right,bottom]=display.mercatorBounds;return z<=maxzoom&&((x+1)/n<=left||x/n>=right||(y+1)/n<=top||y/n>=bottom);
}
export function composeDisplayTile({z,x,y,size=256},display,contextAt){
 if(!Number.isInteger(z)||z<0||z>22||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=2**z||y>=2**z||!Number.isInteger(size)||size<1||size>256)throw new Error('Tile del terreno non valido.');
 const pixels=new Uint8ClampedArray(size*size*4),n=2**z;
 for(let row=0;row<size;row++)for(let column=0;column<size;column++){
  const u=(x+(column+.5)/size)/n,v=(y+(row+.5)/size)/n,point=coordinateAt(u,v),height=display.heightAt(point,contextAt(u,v));
  if(!Number.isFinite(height)||height< -32768||height>=32768)throw new Error('Quota grafica fuori intervallo.');
  const encoded=Math.min(16777215,Math.round((height+32768)*256)),index=(row*size+column)*4;
  pixels[index]=(encoded>>>16)&255;pixels[index+1]=(encoded>>>8)&255;pixels[index+2]=encoded&255;pixels[index+3]=255;
 }
 return pixels;
}

// Public context tiles are loaded once per canonical tile. Overscaling keeps
// native local display detail without inventing higher-resolution global data.
export function createContextDEMClient({source=CONTEXT_DEM,fetchImpl=(...args)=>fetch(...args),decodePixels,maxTiles=64,concurrency=4}={}){
 const cache=new Map(),pending=new Map(),queue=[];let active=0,destroyed=false,pumpTimer=null;
 if(typeof decodePixels!=='function')throw new Error('Decodifica del terreno non disponibile.');
 function settle(entry,error,value){
  if(entry.settled)return;entry.settled=true;if(pending.get(entry.key)===entry)pending.delete(entry.key);
  for(const consumer of entry.consumers)consumer.finish(error,value);
 }
 function retire(entry){
  const index=queue.indexOf(entry);if(index>=0)queue.splice(index,1);
  settle(entry,aborted());entry.controller.abort();
 }
 async function load(entry){
  const {z,x,y,controller}=entry,url=source.urlTemplate.replace('{z}',z).replace('{x}',x).replace('{y}',y);
  const response=await fetchImpl(url,{signal:controller.signal,mode:'cors',credentials:'omit'});
  if(!response.ok)throw new Error(`Terreno di contesto non disponibile (${response.status}).`);
  const bytes=await response.arrayBuffer(),rgba=await decodePixels(bytes);if(controller.signal.aborted||destroyed)throw aborted();
  if(rgba.length!==256*256*4)throw new Error('Tile del contesto con dimensioni non valide.');
  const heights=new Float32Array(256*256);for(let i=0;i<heights.length;i++){if(rgba[i*4+3]!==255)throw new Error('Copertura del contesto incompleta.');heights[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;}
  const value={z,x,y,heights,bytes};cache.set(entry.key,value);while(cache.size>maxTiles)cache.delete(cache.keys().next().value);return value;
 }
 function pump(){
  while(!destroyed&&active<concurrency&&queue.length){
   const entry=queue.shift();if(entry.settled||!entry.consumers.size)continue;active++;
   let cancel;const cancelled=new Promise((_,reject)=>{cancel=()=>reject(aborted());entry.controller.signal.addEventListener('abort',cancel,{once:true});});
   const timer=setTimeout(()=>entry.controller.abort(),15000);
   Promise.race([load(entry),cancelled]).then(value=>settle(entry,null,value),error=>settle(entry,error)).finally(()=>{clearTimeout(timer);entry.controller.signal.removeEventListener('abort',cancel);active--;if(entry.controller.signal.aborted){if(pumpTimer===null&&!destroyed&&queue.length)pumpTimer=setTimeout(()=>{pumpTimer=null;pump();},0);}else pump();});
  }
 }
 function getTile({z,x,y,signal}){
  if(destroyed||signal?.aborted)return Promise.reject(aborted());
  z=Math.max(0,Math.min(source.maxzoom,z));const n=2**z;x=((x%n)+n)%n;y=Math.max(0,Math.min(n-1,y));const key=`${z}/${x}/${y}`;
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return Promise.resolve(value);}
  let entry=pending.get(key);if(!entry){entry={key,z,x,y,controller:new AbortController(),consumers:new Set(),settled:false};pending.set(key,entry);queue.push(entry);}
  return new Promise((resolve,reject)=>{
   const consumer={finish(error,value){signal?.removeEventListener('abort',cancel);entry.consumers.delete(consumer);error?reject(error):resolve(value);}};
   const cancel=()=>{consumer.finish(aborted());if(!entry.consumers.size)retire(entry);};
   entry.consumers.add(consumer);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();else pump();
  });
 }
 async function samplerFor({z,x,y,size=256,signal}){
  if(destroyed||signal?.aborted)throw aborted();
  const level=Math.min(z,source.maxzoom),n=2**level,world=n*256,scale=2**z;
  const left=(x+.5/size)/scale*world-.5,right=(x+1-.5/size)/scale*world-.5,top=(y+.5/size)/scale*world-.5,bottom=(y+1-.5/size)/scale*world-.5;
  const tiles=new Map(),jobs=[];
  for(let ty=Math.floor(Math.floor(top)/256);ty<=Math.floor((Math.floor(bottom)+1)/256);ty++)for(let tx=Math.floor(Math.floor(left)/256);tx<=Math.floor((Math.floor(right)+1)/256);tx++){
   const cx=((tx%n)+n)%n,cy=Math.max(0,Math.min(n-1,ty)),key=`${cx}/${cy}`;if(tiles.has(key))continue;tiles.set(key,null);jobs.push(getTile({z:level,x:cx,y:cy,signal}).then(value=>tiles.set(key,value)));
  }
  await Promise.all(jobs);if(destroyed||signal?.aborted)throw aborted();
  const pixel=(px,py)=>{px=((px%world)+world)%world;py=Math.max(0,Math.min(world-1,py));return tiles.get(`${Math.floor(px/256)}/${Math.floor(py/256)}`).heights[(py%256)*256+px%256];};
  return (u,v)=>{const px=u*world-.5,py=v*world-.5,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;return pixel(ix,iy)*(1-fx)*(1-fy)+pixel(ix+1,iy)*fx*(1-fy)+pixel(ix,iy+1)*(1-fx)*fy+pixel(ix+1,iy+1)*fx*fy;};
 }
 return {getTile,samplerFor,destroy(){if(destroyed)return;destroyed=true;clearTimeout(pumpTimer);pumpTimer=null;for(const entry of pending.values())retire(entry);cache.clear();queue.length=0;}};
}

export function createTerrainDisplayClient({model,geometry,source=CONTEXT_DEM,workerFactory=()=>typeof Worker==='function'?new Worker(new URL('./terrain-context-worker.js?v=1.3.7',import.meta.url),{type:'module'}):null}={}){
 let worker=null,destroyed=false,sequence=0,readyResolve,readyReject;const requests=new Map();
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
 const initTimer=setTimeout(()=>failure(new Error('Caricamento del terreno di contesto scaduto.')),20000);
 function failure(error){if(destroyed)return;readyReject(error);for(const request of requests.values())request.reject(error);requests.clear();destroy();}
 function message({data}){if(destroyed)return;if(data.type==='ready'){clearTimeout(initTimer);readyResolve(data.value);return;}if(data.type==='error'&&data.id==null){failure(new Error(data.message));return;}const request=requests.get(data.id);if(!request)return;requests.delete(data.id);if(data.type==='error')request.reject(new Error(data.message));else request.resolve(data.bytes);}
 function destroy(){if(destroyed)return;destroyed=true;clearTimeout(initTimer);readyReject(aborted());for(const request of requests.values())request.reject(aborted());requests.clear();worker?.terminate();worker=null;}
 try{worker=workerFactory();if(!worker)throw new Error('Worker del terreno non disponibile.');worker.addEventListener('message',message);worker.addEventListener('error',event=>failure(new Error(event.message??'Worker del terreno non disponibile.')));worker.postMessage({type:'init',model,geometry,source});}catch(error){failure(error);}
 return {ready,tile({z,x,y,size=256,signal}){
  if(destroyed||signal?.aborted)return Promise.reject(aborted());const id=++sequence;
  return new Promise((resolve,reject)=>{
   const cancel=()=>{if(!requests.has(id))return;requests.delete(id);worker?.postMessage({type:'cancel',id});finish(reject,aborted());};
   const timer=setTimeout(()=>{if(!requests.has(id))return;requests.delete(id);worker?.postMessage({type:'cancel',id});finish(reject,new Error('Tile del terreno non disponibile in tempo.'));},20000);
   function finish(fn,value){clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value);}
   requests.set(id,{resolve:value=>finish(resolve,value),reject:error=>finish(reject,error)});signal?.addEventListener('abort',cancel,{once:true});worker.postMessage({type:'tile',id,z,x,y,size});
  });
 },destroy};
}
