import test from 'node:test';
import assert from 'node:assert/strict';
import * as gestureApi from '../src/map-gestures.js';
const {gestureRotationDelta,wheelRotationDelta,installTrackpadRotation}=gestureApi;

test('gestureRotationDelta returns incremental trackpad twist rather than cumulative rotation', () => {
  assert.equal(gestureRotationDelta(28, 10), 18);
  assert.equal(gestureRotationDelta(-12, -5), -7);
});

test('wheelRotationDelta rotates with Shift or Alt using either trackpad axis', () => {
  assert.equal(wheelRotationDelta({ shiftKey:true, deltaX:30, deltaY:4 }), 5.4);
  assert.equal(wheelRotationDelta({ shiftKey:false, altKey:false, deltaX:30, deltaY:4 }), 0);
  assert.equal(wheelRotationDelta({ shiftKey:true, deltaX:2, deltaY:30 }), 5.4);
  assert.equal(wheelRotationDelta({ altKey:true, deltaX:-20, deltaY:3 }), -3.6);
});

test('touch rotation stays disabled while desktop wheel rotation helper remains separate', async () => {
  const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/map-gestures.js', import.meta.url), 'utf8'));
  assert.match(source, /disableRotation/);
  assert.doesNotMatch(source, /gesturechange|gesturestart/);
});

test('pixel trackpad scroll pans while pinch zoom and mouse-wheel zoom remain native', () => {
  assert.equal(typeof gestureApi.trackpadPanDelta,'function');
  const {trackpadPanDelta}=gestureApi;
  assert.deepEqual(trackpadPanDelta({ deltaMode:0, deltaX:24.5, deltaY:-8.25 }), [24.5,-8.25]);
  assert.equal(trackpadPanDelta({ deltaMode:0, deltaX:0, deltaY:-4, ctrlKey:true }), null);
  assert.equal(trackpadPanDelta({ deltaMode:1, deltaX:0, deltaY:3 }), null);
  assert.equal(trackpadPanDelta({ deltaMode:0, deltaX:12, deltaY:0, shiftKey:true }), null);
});

test('installed desktop gesture pans the map without requiring a pressed pointer', () => {
  let wheelHandler=null,prevented=false,stopped=false;
  const pans=[];
  const container={
    addEventListener(type,handler){if(type==='wheel')wheelHandler=handler;},
    removeEventListener(){}
  };
  const map={
    getCanvasContainer:()=>container,
    dragRotate:{disable(){}},touchZoomRotate:{enable(){},disableRotation(){}},touchPitch:{disable(){}},
    panBy(offset,options){pans.push([offset,options]);},getBearing:()=>0,setBearing(){}
  };
  installTrackpadRotation(map);
  wheelHandler({deltaMode:0,deltaX:18,deltaY:-7,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,true);
  assert.equal(stopped,true,'MapLibre native wheel zoom must not also process a trackpad pan');
  assert.deepEqual(pans,[[[18,-7],{duration:0}]]);
});

test('trackpad pinch remains available for native zoom while editor drag-pan is disabled',()=>{
  let wheelHandler=null,prevented=false,stopped=false;
  const pans=[];
  const map={
    getCanvasContainer:()=>({addEventListener(type,handler){if(type==='wheel')wheelHandler=handler;},removeEventListener(){}}),
    dragRotate:{disable(){}},touchZoomRotate:{enable(){},disableRotation(){}},touchPitch:{disable(){}},
    dragPan:{disable(){}},panBy(offset){pans.push(offset);},getBearing:()=>0,setBearing(){}
  };
  installTrackpadRotation(map);
  wheelHandler({deltaMode:0,deltaX:0,deltaY:-22,ctrlKey:true,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,false);assert.equal(stopped,false);assert.deepEqual(pans,[]);
  wheelHandler({deltaMode:0,deltaX:0,deltaY:18,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);assert.deepEqual(pans,[[0,18]]);
});

function policyFixture(){
 const listeners=new Set();const states={dragRotate:false,touchPitch:false,touchZoomRotate:false,scrollZoom:false,dragPan:false};let camera={center:[7,45],zoom:16,pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}},stops=0;
 const map={getCanvasContainer:()=>({addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)}),stop(){stops++;},getCenter:()=>({lng:camera.center[0],lat:camera.center[1]}),getZoom:()=>camera.zoom,getPitch:()=>camera.pitch,getBearing:()=>camera.bearing,getPadding:()=>camera.padding,jumpTo(value){camera={...camera,...value};},panBy(){},setBearing(value){camera.bearing=value;}};
 for(const key of Object.keys(states))map[key]={isEnabled:()=>states[key],enable:()=>states[key]=true,disable:()=>states[key]=false};map.touchZoomRotate.enableRotation=()=>{};map.touchZoomRotate.disableRotation=()=>{};
 return {map,states,listeners,camera:()=>camera,stops:()=>stops};
}
test('3D release restores individual disabled handlers, owned touch rotation, suspended wheel and camera once',()=>{
 assert.equal(typeof gestureApi.createMapGesturePolicy,'function');const f=policyFixture();const wheel=installTrackpadRotation(f.map,{touchRotation:false});wheel.setEnabled(false);f.map.touchZoomRotate.disable();const before={...f.states},camera=structuredClone(f.camera());
 const policy=gestureApi.createMapGesturePolicy({map:f.map,touchRotation:wheel});const release=policy.enter3D();assert.ok(Object.values(f.states).every(Boolean));assert.equal(wheel.isTouchRotationEnabled(),true);assert.equal(f.listeners.size,1);
 f.map.jumpTo({pitch:60,bearing:80});release();release();assert.deepEqual(f.states,before);assert.deepEqual(f.camera(),camera);assert.equal(wheel.isTouchRotationEnabled(),false);assert.equal(wheel.isEnabled(),false);assert.equal(f.listeners.size,0);assert.equal(f.stops(),2);policy.destroy();wheel();
});
test('3D destroy resumes exactly one prior wheel callback and cannot enter after destruction',()=>{
 assert.equal(typeof gestureApi.createMapGesturePolicy,'function');const f=policyFixture();const wheel=installTrackpadRotation(f.map,{touchRotation:true});const original=[...f.listeners][0];const policy=gestureApi.createMapGesturePolicy({map:f.map,touchRotation:wheel});policy.enter3D();assert.equal(f.listeners.has(original),false);policy.destroy();assert.deepEqual([...f.listeners],[original]);assert.equal(wheel.isTouchRotationEnabled(),true);assert.throws(()=>policy.enter3D(),/chius/);wheel();
});
test('release cancels an active public drag handler before restoring its previously enabled policy',()=>{
 const f=policyFixture();let active=false;f.states.dragPan=true;f.map.dragPan.isActive=()=>active;f.map.dragPan.disable=()=>{f.states.dragPan=false;active=false;};
 const wheel=installTrackpadRotation(f.map);const policy=gestureApi.createMapGesturePolicy({map:f.map,touchRotation:wheel});const release=policy.enter3D();active=true;release();assert.equal(f.map.dragPan.isActive(),false);assert.equal(f.map.dragPan.isEnabled(),true);wheel();policy.destroy();
});
