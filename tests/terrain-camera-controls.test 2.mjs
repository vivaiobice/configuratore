import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createMapGesturePolicy,installTrackpadRotation} from '../src/map-gestures.js';
const cameraModule=await import('../src/terrain-camera-controls.js').catch(()=>({}));
const makeControls=options=>{assert.equal(typeof cameraModule.createTerrainCameraControls,'function','terrain scene needs a camera controller');return cameraModule.createTerrainCameraControls(options);};
function fixture(){
 const {document,window}=parseHTML('<div id="map"><div id="canvas"></div></div>');
 const events=new Map();let camera={center:[7,45],zoom:16,pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}};
 const map={getContainer:()=>document.querySelector('#map'),getCanvasContainer:()=>document.querySelector('#canvas'),getCenter:()=>({lng:camera.center[0],lat:camera.center[1]}),getZoom:()=>camera.zoom,getPitch:()=>camera.pitch,getBearing:()=>camera.bearing,getPadding:()=>camera.padding,getMinZoom:()=>2,getMaxZoom:()=>22,getMaxPitch:()=>80,stop(){},jumpTo(value){camera={...camera,...value};for(const fn of events.get('move')??[])fn();},panBy(delta){this.jumpTo({center:[camera.center[0]+delta[0]*1e-5,camera.center[1]+delta[1]*1e-5]});},setBearing(bearing){this.jumpTo({bearing});},on(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},off(name,fn){events.get(name)?.delete(fn);}};
 for(const name of ['dragRotate','dragPan','touchPitch','touchZoomRotate','scrollZoom','doubleClickZoom','keyboard']){let enabled=name==='dragPan',rotation=false;map[name]={isEnabled:()=>enabled,enable(){enabled=true;},disable(){enabled=false;},enableRotation(){rotation=true;},disableRotation(){rotation=false;},rotation:()=>rotation};}
 const wheel=installTrackpadRotation(map),policy=createMapGesturePolicy({map,touchRotation:wheel});
 const emit=(name,values)=>{const event=new window.Event(name,{bubbles:true,cancelable:true});Object.assign(event,values);map.getCanvasContainer().dispatchEvent(event);return event;};
 return {document,window,map,wheel,policy,emit,camera:()=>structuredClone(camera),events};
}
const reference={coordinate:[8,44],height:731,anchor:[.5222,.3636,0],metersToMercator:1e-8};
for(const {name,dx,dy,pitch,bearing}of [
 {name:'horizontal Shift wheel changes only bearing',dx:30,dy:0,pitch:55,bearing:24.4},
 {name:'vertical Shift wheel changes only pitch',dx:0,dy:-30,pitch:49.6,bearing:19},
 {name:'diagonal Shift wheel independently changes pitch and bearing',dx:-20,dy:30,pitch:60.4,bearing:15.4}
])test(name,()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 const event=f.emit('wheel',{deltaMode:0,deltaX:dx,deltaY:dy,shiftKey:true});
 assert.equal(event.defaultPrevented,true);assert.equal(f.camera().pitch,pitch);assert.equal(f.camera().bearing,bearing);
 controls.destroy();f.policy.destroy();f.wheel();
});
test('Shift navigation does not snap the view back to the field after trackpad pan',()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 f.emit('wheel',{deltaMode:0,deltaX:80,deltaY:40,timeStamp:1000});const panned=f.camera().center;
 assert.notDeepEqual(panned,[8,44]);
 for(const [deltaX,deltaY]of [[30,0],[0,30],[-20,-10]]){
  f.emit('wheel',{deltaMode:0,deltaX,deltaY,shiftKey:true});assert.deepEqual(f.camera().center,panned);
 }
 controls.destroy();f.policy.destroy();f.wheel();
});
test('Ctrl and Meta pinch remain native through Shift and Alt modifiers',()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy}),before=f.camera();
 for(const key of ['ctrlKey','metaKey']){
  const event=f.emit('wheel',{deltaMode:0,deltaX:30,deltaY:-40,shiftKey:true,altKey:true,[key]:true});
  assert.equal(event.defaultPrevented,false);assert.deepEqual(f.camera(),before);
 }
 controls.destroy();f.policy.destroy();f.wheel();
});
test('terrain navigation retains the current center and restores the exact planar camera and handler policy',()=>{
 const f=fixture(),before=f.camera(),handlers=Object.fromEntries(['dragRotate','dragPan','touchPitch','touchZoomRotate','scrollZoom','doubleClickZoom','keyboard'].map(n=>[n,f.map[n].isEnabled()]));
 const controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 assert.deepEqual(f.camera().center,[8,44]);assert.equal(f.camera().pitch,55);assert.equal(f.map.touchPitch.isEnabled(),true);assert.equal(f.map.touchZoomRotate.rotation(),true);
 f.map.panBy([200,100]);const panned=f.camera().center;controls.rotateBy(15);assert.deepEqual(f.camera().center,panned);assert.equal(f.camera().bearing,34);
 controls.zoomBy(.5);controls.pitchBy(10);assert.equal(f.camera().zoom,16.5);assert.equal(f.camera().pitch,65);assert.deepEqual(f.camera().center,panned);
 controls.destroy();controls.destroy();assert.deepEqual(f.camera(),before);assert.equal(f.document.querySelector('.terrain-camera-controls'),null);
 for(const [name,enabled]of Object.entries(handlers))assert.equal(f.map[name].isEnabled(),enabled,name);
 controls.rotateBy(90);assert.deepEqual(f.camera(),before);f.policy.destroy();f.wheel();
});
test('terrain navigation has no manual panel while public methods clamp pitch and zoom and explicitly recenter',()=>{
 const f=fixture();let returned=0;
 const controls=makeControls({map:f.map,reference,gesturePolicy:f.policy,onReturn2D:()=>{returned++;controls.destroy();}});
 assert.equal(f.document.querySelectorAll('.terrain-camera-controls').length,0);
 assert.equal(f.document.querySelectorAll('[data-terrain-camera]').length,0);
 controls.rotateBy(-15);assert.equal(f.camera().bearing,4);controls.rotateBy(15);assert.equal(f.camera().bearing,19);
 controls.zoomBy(.5);assert.equal(f.camera().zoom,16.5);controls.zoomBy(-.5);assert.equal(f.camera().zoom,16);
 controls.pitchBy(200);assert.equal(f.camera().pitch,75);controls.pitchBy(-200);assert.equal(f.camera().pitch,0);
 controls.zoomBy(200);assert.equal(f.camera().zoom,22);controls.zoomBy(-200);assert.equal(f.camera().zoom,2);
 f.map.jumpTo({center:[8.1,44.1],pitch:70,zoom:18,bearing:120});controls.rotateBy(-120);assert.equal(f.camera().bearing,0);
 controls.recenter();assert.deepEqual(f.camera().center,[8,44]);assert.equal(f.camera().pitch,55);assert.equal(f.camera().zoom,16);
 controls.return2D();controls.return2D();assert.equal(returned,1);assert.equal(f.events.get('move')?.size??0,0);f.policy.destroy();f.wheel();
});
test('terrain wheel distinguishes mouse zoom, trackpad pan, bearing and tilt; native pinch remains free',()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 let event=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:120,timeStamp:1000});assert.equal(event.defaultPrevented,false,'detented mouse wheel remains native zoom');
 event=f.emit('wheel',{deltaMode:0,deltaX:18,deltaY:-7,timeStamp:1240});assert.equal(event.defaultPrevented,true);assert.notDeepEqual(f.camera().center,[8,44]);
 event=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:-22,ctrlKey:true});assert.equal(event.defaultPrevented,false,'pinch remains native');
 const panned=f.camera().center;
 event=f.emit('wheel',{deltaMode:0,deltaX:30,deltaY:2,altKey:true});assert.equal(event.defaultPrevented,true);assert.deepEqual(f.camera().center,panned);assert.equal(f.camera().bearing,24.4);
 event=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:30,shiftKey:true});assert.equal(event.defaultPrevented,true);assert.equal(f.camera().pitch,60.4);
 controls.destroy();const old=f.camera().pitch;f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:30,shiftKey:true});assert.equal(f.camera().pitch,old,'2D modifier wheel rotates without changing pitch');f.policy.destroy();f.wheel();
});
test('map disposal tears down controls without camera operations; standalone scene also restores handlers',()=>{
 const f=fixture(),before=f.camera();const controls=makeControls({map:f.map,reference});assert.equal(f.map.dragRotate.isEnabled(),true);
 f.map.stop=()=>{throw Error('removed map');};f.map.jumpTo=()=>{throw Error('removed map');};assert.doesNotThrow(()=>controls.destroy({restoreCamera:false}));assert.equal(f.document.querySelector('.terrain-camera-controls'),null);
 const g=fixture(),standalone=makeControls({map:g.map,reference});standalone.destroy();assert.deepEqual(g.camera(),before);assert.equal(g.map.dragRotate.isEnabled(),false);g.policy.destroy();g.wheel();f.policy.destroy({restoreCamera:false});f.wheel();
});
test('right mouse and Ctrl drag retain the panned center without swallowing native drag rotation',()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 f.map.panBy([500,200]);const before=f.camera(),event=f.emit('mousedown',{button:2,clientX:300,clientY:200});
 assert.deepEqual(f.camera(),before);assert.equal(event.defaultPrevented,false,'native MapLibre receives the drag');
 const ctrl=f.emit('mousedown',{button:0,ctrlKey:true});assert.deepEqual(f.camera(),before);assert.equal(ctrl.defaultPrevented,false);
 f.map.panBy([100,100]);const panned=f.camera().center;f.emit('mousedown',{button:0});assert.deepEqual(f.camera().center,panned,'left mouse retains fluent pan');
 controls.destroy();f.policy.destroy();f.wheel();
});
test('standalone 2D return restores the saved camera even without a scene callback',()=>{
 const f=fixture(),before=f.camera(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 controls.rotateBy(90);controls.return2D();
 assert.deepEqual(f.camera(),before);assert.equal(f.document.querySelector('.terrain-camera-controls'),null);f.policy.destroy();f.wheel();
});
test('3D expands the public pitch limit to 85 and restores the exact 2D limit on close',()=>{
 const f=fixture(),before=f.camera();let limit=60;
 f.map.getMaxPitch=()=>limit;f.map.setMaxPitch=value=>{limit=value;if(f.camera().pitch>limit)f.map.jumpTo({pitch:limit});};
 const controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 assert.equal(limit,85);controls.pitchBy(100);assert.equal(f.camera().pitch,85);
 f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:-30,shiftKey:true});assert.equal(f.camera().pitch,79.6);
 controls.destroy();assert.equal(limit,60);assert.deepEqual(f.camera(),before);f.policy.destroy();f.wheel();
 const g=fixture();let removedLimit=72;g.map.getMaxPitch=()=>removedLimit;g.map.setMaxPitch=value=>{removedLimit=value;};
 const removed=makeControls({map:g.map,reference,gesturePolicy:g.policy});assert.equal(removedLimit,85);
 g.map.stop=()=>{throw Error('removed map');};g.map.jumpTo=()=>{throw Error('removed map');};g.map.setMaxPitch=()=>{throw Error('removed map');};
 assert.doesNotThrow(()=>removed.destroy({restoreCamera:false}));g.policy.destroy({restoreCamera:false});g.wheel();
});
test('terrain trackpad wheel burst remains pan through fast deltas and classifies later mouse burst independently',()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 for(const [timeStamp,deltaY]of [[1000,30],[1020,60],[1040,30]]){
  const event=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY,timeStamp});assert.equal(event.defaultPrevented,true,`trackpad event ${timeStamp} remains pan`);
 }
 assert.equal(f.camera().center[0],8);assert.ok(Math.abs(f.camera().center[1]-44.0012)<1e-12);
 const mouse=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:100,timeStamp:1260});assert.equal(mouse.defaultPrevented,false,'new detented mouse burst remains native zoom');
 const diagonal=f.emit('wheel',{deltaMode:0,deltaX:1,deltaY:20,timeStamp:1280});assert.equal(diagonal.defaultPrevented,false,'a tiny horizontal wobble does not change an existing mouse burst');
 const noisyMouse=f.emit('wheel',{deltaMode:0,deltaX:1,deltaY:100,timeStamp:1500});assert.equal(noisyMouse.defaultPrevented,false,'small horizontal noise also preserves first mouse classification');
 controls.destroy();f.policy.destroy();f.wheel();
});
test('terrain wheel modifiers retire burst classification and Ctrl pinch stays native with every modifier',()=>{
 const f=fixture(),controls=makeControls({map:f.map,reference,gesturePolicy:f.policy});
 f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:30,timeStamp:1000});
 const pinch=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:-60,ctrlKey:true,shiftKey:true,altKey:true,timeStamp:1020});
 assert.equal(pinch.defaultPrevented,false);assert.equal(f.camera().pitch,55);assert.equal(f.camera().bearing,19);
 const mouse=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:100,timeStamp:1040});assert.equal(mouse.defaultPrevented,false,'pinch retired previous pan burst');
 f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:30,shiftKey:true,timeStamp:1060});assert.equal(f.camera().pitch,60.4);
 const pan=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:30,timeStamp:1080});assert.equal(pan.defaultPrevented,true,'Shift retired previous native burst');
 f.emit('wheel',{deltaMode:0,deltaX:30,deltaY:0,altKey:true,timeStamp:1100});assert.equal(f.camera().bearing,24.4);
 const laterMouse=f.emit('wheel',{deltaMode:0,deltaX:0,deltaY:100,timeStamp:1120});assert.equal(laterMouse.defaultPrevented,false,'Alt retired previous pan burst');
 controls.destroy();f.policy.destroy();f.wheel();
});
