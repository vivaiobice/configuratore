export function gestureRotationDelta(currentRotation, previousRotation = 0) {
  const current = Number(currentRotation);
  const previous = Number(previousRotation);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  return current - previous;
}

export function wheelRotationDelta(event) {
  if (!event?.shiftKey && !event?.altKey) return 0;
  const dx = Number(event.deltaX) || 0;
  const dy = Number(event.deltaY) || 0;
  const axis = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  if (Math.abs(axis) < 2) return 0;
  return Math.round(axis * 0.18 * 1000) / 1000;
}

export function trackpadPanDelta(event) {
  if (!event || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  if (Number(event.deltaMode) !== 0) return null;
  const dx=Number(event.deltaX)||0,dy=Number(event.deltaY)||0;
  if (Math.abs(dx)<.01&&Math.abs(dy)<.01) return null;
  return [dx,dy];
}

export function installTrackpadRotation(map, { touchRotation = false, terrain = false, orbitCenter = null } = {}) {
  const container = map?.getCanvasContainer?.() ?? map?.getContainer?.();
  if (!container?.addEventListener) return () => {};

  // Keep native MapLibre pinch zoom on touch devices, but prevent accidental
  // bearing changes while pinching on iOS. Desktop rotation remains available
  // through Shift/Alt + trackpad wheel and MapLibre's native drag rotation.
  map.dragRotate?.disable?.();
  map.touchZoomRotate?.enable?.();
  if (touchRotation) map.touchZoomRotate?.enableRotation?.();
  else map.touchZoomRotate?.disableRotation?.();
  map.touchPitch?.disable?.();

  let terrainWheelKind=null,lastTerrainWheelTime=null;
  const resetWheelBurst=()=>{terrainWheelKind=null;lastTerrainWheelTime=null;};
  const onWheel = (event) => {
    if(terrain&&(event.ctrlKey||event.metaKey)){resetWheelBurst();return;}
    if(terrain&&(event.shiftKey||event.altKey))resetWheelBurst();
    // In terrain mode Shift tilts the view; Alt rotates around the field.
    // The planar editor retains its established Shift/Alt bearing behavior.
    if (terrain && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const delta=wheelRotationDelta(event);
      if (!delta) return;
      event.preventDefault?.();event.stopImmediatePropagation?.();
      map.jumpTo?.({pitch:Math.max(0,Math.min(85,map.getMaxPitch?.()??75,map.getPitch()+delta)),...(orbitCenter?{center:[...orbitCenter]}:{})});
      return;
    }
    const delta = wheelRotationDelta(event);
    if (delta) {
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      if(terrain&&orbitCenter)map.jumpTo?.({center:[...orbitCenter],bearing:map.getBearing()+delta});
      else map.setBearing?.(map.getBearing() + delta);
      return;
    }
    const pan=trackpadPanDelta(event);
    if(terrain){
      const timestamp=Number.isFinite(event.timeStamp)?event.timeStamp:(globalThis.performance?.now?.()??Date.now());
      // Decide only at a burst's start. Faster trackpad inertia must not turn
      // an established pan into zoom, and a mouse wobble must not start a pan.
      if(lastTerrainWheelTime===null||timestamp-lastTerrainWheelTime>180||timestamp<lastTerrainWheelTime){
        const verticalWheel=pan&&Math.abs(pan[1])>=40&&Math.abs(pan[0])<=Math.max(2,Math.abs(pan[1])*.05);
        terrainWheelKind=pan&&!verticalWheel?'pan':'native';
      }
      lastTerrainWheelTime=timestamp;
      if(terrainWheelKind==='native')return;
    }
    if (!pan) return;
    event.preventDefault?.();
    // MapLibre also listens to wheel events for zoom. Stop that listener only
    // for pixel-precise trackpad pans; ctrl+wheel pinch and mouse wheel remain
    // native because trackpadPanDelta deliberately rejects them.
    event.stopImmediatePropagation?.();
    map.panBy?.(pan,{duration:0});
  };

  let enabled=false,rotation=Boolean(touchRotation),disposed=false;
  function setEnabled(value){
    value=Boolean(value)&&!disposed;if(value===enabled)return;enabled=value;
    resetWheelBurst();
    if(value)container.addEventListener('wheel',onWheel,{passive:false,capture:true});
    else container.removeEventListener('wheel',onWheel,true);
  }
  const cleanup=()=>{setEnabled(false);disposed=true;};
  cleanup.setEnabled=setEnabled;cleanup.isEnabled=()=>enabled;
  cleanup.isTouchRotationEnabled=()=>rotation;
  cleanup.setTouchRotation=value=>{rotation=Boolean(value);if(rotation)map.touchZoomRotate?.enableRotation?.();else map.touchZoomRotate?.disableRotation?.();};
  setEnabled(true);return cleanup;
}


function copyCamera(camera){
 return {...camera,center:[...camera.center],padding:camera.padding==null?camera.padding:{...camera.padding}};
}
function cameraSnapshot(map){
 const center=map.getCenter();return copyCamera({center:[center.lng,center.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),padding:map.getPadding?.()});
}
// Touch rotation has no public getter in MapLibre 4.7.1. Its policy belongs to
// the wheel wrapper, never to an inferred/private MapLibre field.
export function createMapGesturePolicy({map,touchRotation}){
 let releaseCurrent=null,checkpointCamera=null,destroyed=false;
 return {
  // Save the owned 2D plane even when the live camera is navigating in 3D.
  cameraForCheckpoint(){return checkpointCamera?copyCamera(checkpointCamera):cameraSnapshot(map);},
  enter3D({orbitCenter=null}={}){
   if(destroyed)throw new Error('Policy della mappa chiusa.');
   if(releaseCurrent)return releaseCurrent;
   map.stop?.();const camera=cameraSnapshot(map);
   const handlers=['dragRotate','touchPitch','touchZoomRotate','scrollZoom','dragPan','doubleClickZoom','keyboard'].filter(name=>map[name]?.isEnabled);
   const states=handlers.map(name=>[name,map[name].isEnabled()]);
   const rotation=touchRotation?.isTouchRotationEnabled?.()??false,wheel=touchRotation?.isEnabled?.()??false;
   touchRotation?.setEnabled?.(false);
   // Retain the established pixel pan / modifier rotation / native pinch paths.
   const temporaryWheel=installTrackpadRotation(map,{touchRotation:true,terrain:true,orbitCenter});
   for(const name of handlers)map[name].enable();touchRotation?.setTouchRotation?.(true);
   let released=false;checkpointCamera=camera;
   releaseCurrent=({restoreCamera=true}={})=>{
    if(released)return;released=true;if(restoreCamera)map.stop?.();temporaryWheel();
    for(const name of handlers)map[name].disable();
    touchRotation?.setTouchRotation?.(rotation);
    for(const [name,enabled] of states)map[name][enabled?'enable':'disable']();
    touchRotation?.setEnabled?.(wheel);if(restoreCamera)map.jumpTo(copyCamera(camera));releaseCurrent=null;checkpointCamera=null;
   };
   return releaseCurrent;
  },
  destroy(options){releaseCurrent?.(options);destroyed=true;}
 };
}
