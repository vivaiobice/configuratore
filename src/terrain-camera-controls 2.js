import {createMapGesturePolicy} from './map-gestures.js?v=1.3.5';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Native terrain owns the camera elevation. Keep geographic camera changes
// on public map APIs and restore the exact planar policy on leaving 3D.
export function createTerrainCameraControls({map,reference,gesturePolicy=null,onReturn2D=()=>{},initialPitch=55}){
 const coordinate=reference?.coordinate;
 if(!Array.isArray(coordinate)||coordinate.length!==2||!coordinate.every(Number.isFinite))throw new RangeError('Centro del terreno non valido.');
 const savedMaxPitch=map.getMaxPitch?.(),expandPitch=typeof map.setMaxPitch==='function'&&Number.isFinite(savedMaxPitch);
 const center=[...coordinate],initialZoom=map.getZoom(),minZoom=map.getMinZoom?.()??0,maxZoom=map.getMaxZoom?.()??22,maxPitch=expandPitch?85:Math.min(75,savedMaxPitch??75),homePitch=clamp(initialPitch,0,maxPitch);
 const ownPolicy=gesturePolicy?null:createMapGesturePolicy({map}),policy=gesturePolicy??ownPolicy;
 const release=policy.enter3D();
 let disposed=false;
 function apply(camera){if(disposed)return;map.stop?.();map.jumpTo(camera);}
 function rotateBy(delta){if(Number.isFinite(delta))apply({bearing:map.getBearing()+delta});}
 function zoomBy(delta){if(Number.isFinite(delta))apply({zoom:clamp(map.getZoom()+delta,minZoom,maxZoom)});}
 function pitchBy(delta){if(Number.isFinite(delta))apply({pitch:clamp(map.getPitch()+delta,0,maxPitch)});}
 function recenter(){apply({center:[...center],zoom:initialZoom,pitch:homePitch});}
 function return2D(){if(disposed)return;try{onReturn2D();}finally{destroy();}}
 function destroy({restoreCamera=true}={}){
  if(disposed)return;disposed=true;
  try{release({restoreCamera});}finally{if(restoreCamera&&expandPitch)map.setMaxPitch(savedMaxPitch);ownPolicy?.destroy({restoreCamera:false});}
 }
 try{
  if(expandPitch)map.setMaxPitch(85);
  recenter();
 }catch(error){destroy();throw error;}
 return {rotateBy,zoomBy,pitchBy,recenter,return2D,destroy};
}
