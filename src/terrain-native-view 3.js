import {createTerrainDisplayClient} from './terrain-context-dem.js?v=1.3.5';
import {createTerrainCameraControls} from './terrain-camera-controls.js?v=1.3.5';
let sequence=0;
const aborted=()=>new DOMException('Vista terreno chiusa.','AbortError');
function snapshot(map){const center=map.getCenter(),padding=map.getPadding?.();return {center:[center.lng,center.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),...(padding?{padding:{...padding}}:{})};}

// One terrain pyramid owns both context and field presentation. Native style
// overlays drape into the same renderer; no custom mesh or depth reset is used.
export function createTerrainNativeView({map,model,geometry,maplibre=globalThis.maplibregl,gesturePolicy=null,onStatus=()=>{},onError=()=>{},onSceneActive=()=>{},onReturn2D=null,displayClientFactory=createTerrainDisplayClient,cameraControlsFactory=createTerrainCameraControls}={}){
 let disposed=false,current=null;
 function release(state,{removed=false}={}){
  if(!state||state.closed)return;state.closed=true;state.abort.abort();state.cancelOpen?.();
  map.off?.('error',state.error);map.off?.('styledata',state.style);state.client?.destroy();state.client=null;
  state.controls?.destroy({restoreCamera:false});state.controls=null;
  if(!removed){
   if(state.terrainOwned){state.terrainOwned=false;map.setTerrain(state.styleLost&&!map.getSource?.(state.previousTerrain?.source)?null:state.previousTerrain??null);}
   if(state.sourceAdded&&map.getSource?.(state.sourceId))map.removeSource(state.sourceId);
  }
  state.sourceAdded=false;
  if(state.protocolAdded){maplibre.removeProtocol(state.protocol);state.protocolAdded=false;}
  if(!removed){
   if(Number.isFinite(state.maxPitch))map.setMaxPitch?.(state.maxPitch);
   if(state.camera)map.jumpTo(state.camera);
   if(state.active){state.active=false;onSceneActive(false,null,{nativeTerrain:true});}
  }
 }
 function close(){const state=current;current=null;release(state);}
 const remove=()=>{if(disposed)return;disposed=true;const state=current;current=null;release(state,{removed:true});map.off?.('remove',remove);};
 function fail(state,error){if(state.closed||current!==state||disposed)return;close();onError(error);}
 async function start(state){
  try{
   if(!map?.setTerrain||!map?.addSource||!maplibre?.addProtocol||!maplibre?.removeProtocol)throw new Error('Terreno 3D nativo non supportato.');
   state.client=displayClientFactory({model,geometry});onStatus('Caricamento del terreno e del contesto satellitare…');
   const info=await Promise.race([state.client.ready,state.cancelled]);if(state.closed||disposed||current!==state)return;
   state.camera=snapshot(map);state.maxPitch=map.getMaxPitch?.();state.previousTerrain=map.getTerrain?.()??null;
   map.stop?.();
   maplibre.addProtocol(state.protocol,async(request,abortController)=>{
    if(state.closed||current!==state)throw aborted();const match=request.url.match(/:\/\/(\d+)\/(\d+)\/(\d+)(?:\?.*)?$/);if(!match)throw new Error('Indirizzo del terreno non valido.');
    const data=await state.client.tile({z:Number(match[1]),x:Number(match[2]),y:Number(match[3]),size:256,signal:abortController?.signal});
    if(state.closed||current!==state)throw aborted();return {data};
   });state.protocolAdded=true;
   state.error=event=>{if(event?.sourceId===state.sourceId||event?.sourceId==='satellite')queueMicrotask(()=>fail(state,event.error??new Error('Terreno di contesto non disponibile.')));};map.on?.('error',state.error);
   map.addSource(state.sourceId,{type:'raster-dem',tiles:[`${state.protocol}://{z}/{x}/{y}`],tileSize:256,encoding:'terrarium',minzoom:0,maxzoom:17,attribution:info.attribution});state.sourceAdded=true;
   // Prepare native overlays before the first terrain frame. Inactive editing
   // circles otherwise split terrain RTT passes, even with empty sources.
   state.active=true;onSceneActive(true,null,{nativeTerrain:true});
   state.terrainOwned=true;map.setTerrain({source:state.sourceId,exaggeration:1});
   // Source removal/style replacement invalidates this owned presentation.
   state.style=()=>{if(!state.closed&&state.sourceAdded&&!map.getSource?.(state.sourceId)){state.styleLost=true;queueMicrotask(()=>fail(state,new Error('Sorgente del terreno rimossa.')));}};map.on?.('styledata',state.style);
   await Promise.race([waitForSource(map,state),state.cancelled]);if(state.closed||disposed||current!==state)return;
   state.controls=cameraControlsFactory({map,reference:{coordinate:info.coordinate},gesturePolicy,onReturn2D:()=>{close();onReturn2D?.();}});
   map.triggerRepaint?.();
   onStatus('Terreno continuo · scala verticale ×1 · DTM del campo ricampionato solo per la vista; contesto a risoluzione variabile.');
  }catch(error){if(state.closed||disposed||current!==state)return;current=null;release(state);throw error;}
 }
 function open(){
  if(disposed)return Promise.reject(new Error('Vista terreno chiusa.'));if(current)return current.opening;
  const id=++sequence,state={sourceId:`obice-terrain-dem-${id}`,protocol:`obice-terrain-${id}`,closed:false,active:false,abort:new AbortController()};
  state.cancelled=new Promise(resolve=>{state.cancelOpen=()=>resolve(null);});current=state;state.opening=start(state);return state.opening;
 }
 map.on?.('remove',remove);
 return {open,close,destroy(){if(disposed)return;close();disposed=true;map.off?.('remove',remove);}};
}
function waitForSource(map,state){
 if(map.isSourceLoaded?.(state.sourceId))return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);map.off?.('sourcedata',check);state.abort.signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
  const check=event=>{if((!event?.sourceId||event.sourceId===state.sourceId)&&map.isSourceLoaded?.(state.sourceId))finish();};
  const cancel=()=>finish();const timer=setTimeout(()=>finish(new Error('Caricamento del terreno nativo scaduto.')),20000);
  map.on?.('sourcedata',check);state.abort.signal.addEventListener('abort',cancel,{once:true});if(state.abort.signal.aborted)finish();else check();
 });
}
