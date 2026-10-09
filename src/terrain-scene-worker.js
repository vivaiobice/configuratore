import {buildTerrainScene,terrainSceneTransferables} from './terrain-scene-mesh.js?v=1.3.4';

// All frozen grid decoding, native-face preparation, and overlay sampling happen
// here. A view owns this worker and terminates it on close or context changes.
self.onmessage=({data:message})=>{
 try{
  if(message?.type!=='build')throw new RangeError('Richiesta della scena 3D non valida.');
  const scene=buildTerrainScene(message.scene);
  self.postMessage({type:'scene',id:message.id,scene},terrainSceneTransferables(scene));
 }catch(error){
  self.postMessage({type:'error',id:message?.id,message:error.message});
 }
};
