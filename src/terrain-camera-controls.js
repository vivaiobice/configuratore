import {createMapGesturePolicy} from './map-gestures.js?v=1.3.3';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// The custom mesh subtracts reference.height, so its field pivot lives at
// relative altitude zero. Public camera center/pitch/bearing target that datum;
// passing the absolute terrain height to a free camera would offset it twice.
export function createTerrainCameraControls({map,reference,gesturePolicy=null,onReturn2D=()=>{},initialPitch=55}){
 const coordinate=reference?.coordinate;
 if(!Array.isArray(coordinate)||coordinate.length!==2||!coordinate.every(Number.isFinite))throw new RangeError('Centro del terreno non valido.');
 const savedMaxPitch=map.getMaxPitch?.(),expandPitch=typeof map.setMaxPitch==='function'&&Number.isFinite(savedMaxPitch);
 const center=[...coordinate],initialZoom=map.getZoom(),minZoom=map.getMinZoom?.()??0,maxZoom=map.getMaxZoom?.()??22,maxPitch=expandPitch?85:Math.min(75,savedMaxPitch??75),homePitch=clamp(initialPitch,0,maxPitch);
 const ownPolicy=gesturePolicy?null:createMapGesturePolicy({map}),policy=gesturePolicy??ownPolicy;
 const release=policy.enter3D({orbitCenter:center});
 const host=map.getContainer?.(),document=host?.ownerDocument;
 const canvasHost=map.getCanvasContainer?.()??host;
 let disposed=false,panel=null,buttons=new Map();
 function apply(camera){if(disposed)return;map.stop?.();map.jumpTo(camera);}
 function rotateBy(delta){if(Number.isFinite(delta))apply({center:[...center],bearing:map.getBearing()+delta});}
 function zoomBy(delta){if(Number.isFinite(delta))apply({zoom:clamp(map.getZoom()+delta,minZoom,maxZoom)});}
 function pitchBy(delta){if(Number.isFinite(delta))apply({center:[...center],pitch:clamp(map.getPitch()+delta,0,maxPitch)});}
 function recenter(){apply({center:[...center],zoom:initialZoom,pitch:homePitch});}
 function return2D(){if(disposed)return;try{onReturn2D();}finally{destroy();}}
 function update(){
  if(disposed||!panel)return;
  const bearing=((map.getBearing()%360)+360)%360,pitch=map.getPitch(),zoom=map.getZoom();
  const north=buttons.get('north');north.setAttribute('aria-label',`Nord · direzione ${Math.round(bearing)}°`);north.title=`Nord · direzione ${Math.round(bearing)}°`;
  north.querySelector('span').style.transform=`rotate(${-bearing}deg)`;
  buttons.get('pitch-up').disabled=pitch>=maxPitch-.01;buttons.get('pitch-down').disabled=pitch<=.01;
  buttons.get('zoom-in').disabled=zoom>=maxZoom-.01;buttons.get('zoom-out').disabled=zoom<=minZoom+.01;
 }
 function stopMapGesture(event){event.stopPropagation();}
 function prepareOrbit(event){
  if(!disposed&&(event.button===2||(event.button===0&&event.ctrlKey)))apply({center:[...center]});
 }
 function destroy({restoreCamera=true}={}){
  if(disposed)return;disposed=true;
  map.off?.('move',update);
  canvasHost?.removeEventListener?.('mousedown',prepareOrbit,true);
  panel?.remove();panel=null;buttons.clear();
  try{release({restoreCamera});}finally{if(restoreCamera&&expandPitch)map.setMaxPitch(savedMaxPitch);ownPolicy?.destroy({restoreCamera:false});}
 }
 try{
  if(expandPitch)map.setMaxPitch(85);
  canvasHost?.addEventListener?.('mousedown',prepareOrbit,{capture:true});
  if(document?.createElement&&host?.append){
   panel=document.createElement('div');panel.className='terrain-camera-controls';panel.setAttribute('role','group');panel.setAttribute('aria-label','Navigazione del terreno 3D');
   const actions=[
    ['rotate-left','↶','Ruota attorno al campo a sinistra',()=>rotateBy(-15)],
    ['north','↑','Nord',()=>apply({center:[...center],bearing:0})],
    ['rotate-right','↷','Ruota attorno al campo a destra',()=>rotateBy(15)],
    ['zoom-out','−','Riduci lo zoom',()=>zoomBy(-.5)],
    ['recenter','◎','Ricentra il campo',recenter],
    ['zoom-in','+','Aumenta lo zoom',()=>zoomBy(.5)],
    ['pitch-down','⌄','Vista dall’alto · riduci inclinazione',()=>pitchBy(-10)],
    ['return-2d','2D','Torna alla mappa 2D',return2D],
    ['pitch-up','⌃','Abbassa il punto di vista · aumenta inclinazione',()=>pitchBy(10)]
   ];
   for(const [name,text,label,action] of actions){
    const button=document.createElement('button');button.type='button';button.dataset.terrainCamera=name;button.setAttribute('aria-label',label);button.title=label;
    const icon=document.createElement('span');icon.textContent=text;icon.setAttribute('aria-hidden','true');button.append(icon);
    button.addEventListener('click',event=>{event.stopPropagation();if(!disposed&&!button.disabled)action();});panel.append(button);buttons.set(name,button);
   }
   // Capture wheel/presses before MapLibre's delegated handlers. Controls never
   // initiate a map drag, pinch or keyboard movement, while button keys work.
   for(const event of ['mousedown','pointerdown','touchstart','dblclick','keydown'])panel.addEventListener(event,stopMapGesture);
   panel.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();},{passive:false});
   host.append(panel);map.on?.('move',update);
  }
  recenter();update();
 }catch(error){destroy();throw error;}
 return {rotateBy,zoomBy,pitchBy,recenter,return2D,destroy};
}
