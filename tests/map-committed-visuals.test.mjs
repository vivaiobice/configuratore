import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initMap} from '../src/map.js';
import {createTerrainMapView} from '../src/terrain-map.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {toUTM} from '../src/coordinate-system.js';

// Only the external WebGL surface is replaced. Production initMap callbacks,
// visibility controls, editor and gesture/view lifecycles remain actual code.
// Like MapLibre 4.7.1, even an already-last moveLayer schedules styledata for
// the next frame. Bound frame flushing so the pre-fix cycle is an assertion,
// rather than an infinite test or a synchronous stack-overflow simulation.
class Source {
 constructor(spec){this.data=structuredClone(spec.data);this.writes=0;}
 setData(value){this.data=structuredClone(value);this.writes++;return this;}
}
const handler=()=>({enabled:true,isEnabled(){return this.enabled;},enable(){this.enabled=true;},disable(){this.enabled=false;}});
class MapSurface {
 constructor({container}){
  this.host=document.getElementById(container);this.canvas=document.createElement('canvas');this.host.append(this.canvas);
  this.handlers=new Map();this.sources=new Map();this.layers=new Map();this.order=[];this.pendingStyle=false;this.moves=0;this.styleEvents=0;
  this.camera={center:[8,44],zoom:18,pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}};
  for(const name of ['dragRotate','touchPitch','touchZoomRotate','scrollZoom','dragPan','doubleClickZoom'])this[name]=handler();
  this.touchZoomRotate.enableRotation=()=>{};this.touchZoomRotate.disableRotation=()=>{};
 }
 on(name,fn){this.handlers.set(name,[...(this.handlers.get(name)??[]),fn]);return this;}
 off(name,fn){this.handlers.set(name,(this.handlers.get(name)??[]).filter(item=>item!==fn));return this;}
 trigger(name,event={}){for(const fn of [...(this.handlers.get(name)??[])])fn(event);}
 flushStyle(maxFrames=12){
  let frames=0;
  while(this.pendingStyle&&frames<maxFrames){this.pendingStyle=false;this.styleEvents++;frames++;this.trigger('styledata',{dataType:'style'});}
  return {settled:!this.pendingStyle,frames};
 }
 addControl(){}
 getContainer(){return this.host;}
 getCanvasContainer(){return this.host;}
 getCanvas(){return this.canvas;}
 loaded(){return true;}
 addSource(id,spec){this.sources.set(id,new Source(spec));}
 getSource(id){return this.sources.get(id);}
 removeSource(id){this.sources.delete(id);}
 removeLayer(id){this.layers.delete(id);this.order.splice(this.order.indexOf(id),1);this.pendingStyle=true;}
 addLayer(spec,before){this.layers.set(spec.id,spec);const index=before?this.order.indexOf(before):-1;this.order.splice(index<0?this.order.length:index,0,spec.id);this.pendingStyle=true;}
 getLayer(id){return this.layers.get(id);}
 getLayersOrder(){return [...this.order];}
 getLayoutProperty(id,key){return this.layers.get(id)?.layout?.[key];}
 setLayoutProperty(id,key,value){const layer=this.layers.get(id);layer.layout={...layer.layout,[key]:value};this.pendingStyle=true;}
 moveLayer(id,before){
  assert.ok(this.layers.has(id));this.moves++;this.order.splice(this.order.indexOf(id),1);
  const index=before?this.order.indexOf(before):-1;this.order.splice(index<0?this.order.length:index,0,id);this.pendingStyle=true;
 }
 project([lng,lat]){return {x:lng*10,y:lat*10};}
 fitBounds(){}
 stop(){}
 getCenter(){return {lng:this.camera.center[0],lat:this.camera.center[1]};}
 getZoom(){return this.camera.zoom;}
 getPitch(){return this.camera.pitch;}
 getBearing(){return this.camera.bearing;}
 getPadding(){return structuredClone(this.camera.padding);}
 jumpTo(value){this.camera={...this.camera,...structuredClone(value)};}
 getTerrain(){return this.terrain??null;}
 setTerrain(value){this.terrain=value;}
}
class Marker {
 constructor({element,draggable}={}){this.element=element;this.draggable=draggable;this.handlers={};this.removed=false;}
 setLngLat(coordinate){this.coordinate=[...coordinate];return this;}
 getLngLat(){return {lng:this.coordinate[0],lat:this.coordinate[1]};}
 setOffset(value){this.offset=[...value];return this;}
 addTo(map){this.map=map;map.markers??=[];map.markers.push(this);map.host.append(this.element);return this;}
 remove(){this.removed=true;this.element.remove();}
 on(name,fn){this.handlers[name]=fn;return this;}
}
function setup(callbacks={}){
 const old={document:globalThis.document,maplibregl:globalThis.maplibregl,MapboxDraw:globalThis.MapboxDraw};
 const {document,window}=parseHTML('<html><body><section class="map-wrap"><div id="map"></div></section><div id="mobile-detail-map"></div></body></html>');
 globalThis.document=document;globalThis.MapboxDraw=undefined;
 const protocols=new Map();
 globalThis.maplibregl={Map:MapSurface,Marker,NavigationControl:class{},ScaleControl:class{},LngLatBounds:class{extend(){return this;}},addProtocol:(name,fn)=>protocols.set(name,fn),removeProtocol:name=>protocols.delete(name)};
 const api=initMap({container:'map',...callbacks});api.map.trigger('load');
 return {api,map:api.map,document,window,protocols,restore(){api.map.trigger('remove');Object.assign(globalThis,old);}};
}
const ring=()=>[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
const source=ctx=>ctx.map.getSource('project-geometry');
const labels=ctx=>[...ctx.document.querySelectorAll('.side-measurement-label')];
const coordinates=ctx=>source(ctx).data.features[0]?.geometry.coordinates[0];
function establish(ctx,coordinates=ring()){
 ctx.api.setGeometry(coordinates);ctx.map.flushStyle();
 return coordinates;
}
test('3D presentation hides planar overlays but preserves eyes, labels and the 2D workspace camera',()=>{
 const ctx=setup();try{
  establish(ctx);ctx.api.setRows([{start:ring()[0],end:ring()[1]}]);const camera=ctx.api.capturePendingEdit().camera,eyes=ctx.api.getOverlayVisibility();
  assert.equal(typeof ctx.api.setTerrainSceneActive,'function');assert.equal(typeof ctx.api.getTerrainSceneSnapshot,'function');
  const snapshot=ctx.api.getTerrainSceneSnapshot();assert.deepEqual(snapshot.geometry,ring());assert.equal(snapshot.rows.length,1);
  snapshot.geometry[0][0]=0;assert.equal(ctx.api.getTerrainSceneSnapshot().geometry[0][0],8);
  const release=ctx.api.gesturePolicy.enter3D();ctx.api.setTerrainSceneActive(true,point=>ctx.map.project(point));ctx.map.jumpTo({center:[8.1,44.1],zoom:19,bearing:85,pitch:60});ctx.map.trigger('moveend');ctx.map.flushStyle();
  assert.deepEqual(ctx.api.capturePendingEdit().camera,camera);assert.deepEqual(ctx.api.getOverlayVisibility(),eyes);
  assert.equal(ctx.map.getLayoutProperty('project-geometry-line','visibility'),'none');assert.equal(ctx.map.getLayoutProperty('vineyard-rows-line','visibility'),'none');assert.notEqual(ctx.document.querySelector('.map-field-label-overlay').style.display,'none');
  ctx.api.setOverlayVisibility({schema:false});ctx.api.setTerrainSceneActive(false,null);release();ctx.map.flushStyle();
  assert.equal(ctx.map.getLayoutProperty('project-geometry-line','visibility'),'visible');assert.equal(ctx.map.getLayoutProperty('vineyard-rows-line','visibility'),'none');assert.deepEqual(ctx.api.capturePendingEdit().camera,camera);
 }finally{ctx.restore();}
});
test('3D display clips long passage ends and resets unsupported annotation offsets without changing project inputs',()=>{
 const ctx=setup();try{
  establish(ctx);const long=[[7.99,44.0004],[8.01,44.0004],[8.01,44.0006],[7.99,44.0006],[7.99,44.0004]],saved=structuredClone(long);ctx.api.setExclusions([{id:'long',geometry:long}]);
  const scene=ctx.api.getTerrainSceneSnapshot();assert.equal(scene.exclusions.features.length,1);assert.deepEqual(long,saved);
  const clipped=scene.exclusions.features[0].geometry.coordinates.flat(2);assert.ok(clipped.every(([x,y])=>x>=8&&x<=8.001&&y>=44&&y<=44.001));
  let covered=true;ctx.api.setTerrainSceneActive(true,point=>covered?{x:ctx.map.project(point).x+20,y:ctx.map.project(point).y-10}:null);ctx.map.trigger('render');
  const markers=ctx.map.markers.filter(marker=>marker.element.className==='side-measurement-label');assert.ok(markers.every(marker=>marker.offset[0]===20&&marker.offset[1]===-10));
  covered=false;ctx.map.trigger('render');assert.ok(markers.every(marker=>marker.offset[0]===0&&marker.offset[1]===0));ctx.api.setTerrainSceneActive(false);
 }finally{ctx.restore();}
});

test('stationary committed repair settles without a self-generating styledata cycle',()=>{
 const ctx=setup();try{
  ctx.api.setGeometry(ring());const outcome=ctx.map.flushStyle();
  assert.equal(outcome.settled,true,`style repair still requests frames after ${outcome.frames} styledata events; moveLayer calls=${ctx.map.moves}`);
  assert.equal(ctx.map.getLayersOrder().at(-1),'project-geometry-line');
 }finally{ctx.restore();}
});

test('unchanged styledata idle resize and moveend preserve the source and existing quote nodes',()=>{
 const ctx=setup();try{
  const original=establish(ctx),saved=structuredClone(coordinates(ctx)),nodes=labels(ctx),writes=source(ctx).writes,moves=ctx.map.moves;
  for(const name of ['styledata','idle','resize','moveend','styledata','idle'])ctx.map.trigger(name);
  assert.equal(source(ctx).writes,writes,'camera/style events must not republish unchanged geometry');
  assert.deepEqual(labels(ctx),nodes,'camera/style events must retain the same quote DOM nodes');
  assert.equal(ctx.map.moves,moves,'an already-last perimeter layer must not be moved again');
  assert.deepEqual(coordinates(ctx),saved);assert.deepEqual(original,saved);
 }finally{ctx.restore();}
});

test('a newly added layer above the field causes one order correction then settles',()=>{
 const ctx=setup();try{
  establish(ctx);const writes=source(ctx).writes,nodes=labels(ctx),moves=ctx.map.moves;
  ctx.map.addLayer({id:'late-layer',type:'line',source:'vineyard-rows'});const outcome=ctx.map.flushStyle();
  assert.equal(outcome.settled,true,'the layer recovery must stop generating style changes');
  assert.equal(ctx.map.moves-moves,1,'only one correction is needed for the new layer');
  assert.equal(ctx.map.getLayersOrder().at(-1),'project-geometry-line');assert.equal(source(ctx).writes,writes);assert.deepEqual(labels(ctx),nodes);
 }finally{ctx.restore();}
});

test('new coordinate values publish once and their unchanged copy preserves quote nodes',()=>{
 const ctx=setup();try{
  establish(ctx);const writes=source(ctx).writes;
  const changed=ring().map(([lng,lat])=>[lng+.02,lat]);ctx.api.setGeometry(changed);ctx.map.flushStyle();
  assert.equal(source(ctx).writes-writes,1);assert.deepEqual(coordinates(ctx),changed);const nodes=labels(ctx),nextWrites=source(ctx).writes;
  ctx.api.setGeometry(changed.map(point=>[...point]));ctx.map.flushStyle();
  assert.equal(source(ctx).writes,nextWrites);assert.deepEqual(labels(ctx),nodes);
 }finally{ctx.restore();}
});

test('an in-place ring mutation is detected by repair and published exactly once',()=>{
 const ctx=setup();try{
  const original=establish(ctx),writes=source(ctx).writes,nodes=labels(ctx);original[1][0]+=.0002;
  ctx.map.trigger('idle');ctx.map.flushStyle();
  assert.equal(source(ctx).writes-writes,1,'array identity must not hide a changed coordinate');
  assert.deepEqual(coordinates(ctx),original);assert.notDeepEqual(labels(ctx),nodes);const after=source(ctx).writes,newNodes=labels(ctx);
  ctx.map.trigger('moveend');ctx.map.flushStyle();assert.equal(source(ctx).writes,after);assert.deepEqual(labels(ctx),newNodes);
 }finally{ctx.restore();}
});

test('clearing and a replacement source still publish the correct committed geometry',()=>{
 const ctx=setup();try{
  const original=establish(ctx);ctx.api.clearGeometry();assert.deepEqual(source(ctx).data.features,[]);assert.equal(labels(ctx).length,0);
  ctx.api.setGeometry(original);ctx.map.flushStyle();assert.deepEqual(coordinates(ctx),original);
  const replacement=new Source({data:{type:'FeatureCollection',features:[]}});ctx.map.sources.set('project-geometry',replacement);
  ctx.map.trigger('styledata');ctx.map.flushStyle();assert.equal(replacement.writes,1,'a new source has not received the previous publication');assert.deepEqual(coordinates(ctx),original);
 }finally{ctx.restore();}
});

test('quote and field eyes survive mobile reparenting and vertex edits retain callbacks',()=>{
 const changes=[];const ctx=setup({onGeometryChange:value=>changes.push(structuredClone(value))});try{
  establish(ctx);ctx.api.setOverlayVisibility({field:false,quotes:false});ctx.map.flushStyle();
  ctx.document.getElementById('mobile-detail-map').append(ctx.map.host.closest('.map-wrap'));
  assert.equal(ctx.api.beginVertexEditing(),true);
  const handle=ctx.map.markers.find(marker=>marker.draggable&&!marker.removed&&marker.coordinate[0]===8.001&&marker.coordinate[1]===44);
  assert.ok(handle);handle.setLngLat([8.0012,44]);handle.handlers.dragend();ctx.map.flushStyle();
  assert.equal(changes.length,1);assert.deepEqual(changes[0][1],[8.0012,44]);assert.deepEqual(coordinates(ctx),changes[0]);
  assert.equal(ctx.map.getLayoutProperty('project-geometry-line','visibility'),'none');
  assert.equal(ctx.document.querySelector('.map-field-label-overlay').style.display,'none');assert.ok(labels(ctx).every(node=>node.style.display==='none'));
  ctx.api.finishVertexEditing();ctx.api.setOverlayVisibility({field:true,quotes:true});ctx.map.flushStyle();
  assert.equal(ctx.map.getLayoutProperty('project-geometry-line','visibility'),'visible');assert.ok(labels(ctx).every(node=>node.style.display===''));
 }finally{ctx.restore();}
});

test('committed repair keeps exact camera padding and individual handlers through 3D close',async()=>{
 const ctx=setup();let view;try{
  establish(ctx);ctx.map.touchZoomRotate.disable();ctx.map.scrollZoom.disable();const camera=structuredClone(ctx.map.camera),states=Object.fromEntries(['dragRotate','touchPitch','touchZoomRotate','scrollZoom','dragPan'].map(name=>[name,ctx.map[name].isEnabled()]));
  const [x,y]=toUTM([8,44],32632),model=createTerrainModel({source:{id:'camera-fixture',label:'Anonimo',resolutionM:125,url:'about:blank',license:'CC0',citation:'Anonimo'},grid:{width:5,height:5,origin:[x-250,y+250],step:[125,-125],values:Array(25).fill(100)}});
  view=createTerrainMapView({map:ctx.map,model,gesturePolicy:ctx.api.gesturePolicy,sceneClientFactory:()=>({ready:Promise.resolve({modelHash:model.contentHash,reference:{anchor:[0,0,0],coordinate:[8,44],height:100,metersToMercator:1},positions:new Float32Array(9),indices:new Uint32Array([0,1,2]),normals:new Float32Array(9),linePositions:new Float32Array(),lineColors:new Float32Array(),lineRanges:[]}),destroy(){}})});
  await view.open();ctx.map.jumpTo({center:[8.01,44.01],pitch:60,bearing:80,padding:{top:10,bottom:12,left:15,right:20}});ctx.map.trigger('moveend');view.close();ctx.map.flushStyle();
  assert.deepEqual(ctx.map.camera,camera);assert.deepEqual(Object.fromEntries(Object.keys(states).map(name=>[name,ctx.map[name].isEnabled()])),states);assert.equal(ctx.map.getTerrain(),null);assert.equal(ctx.protocols.size,0);
 }finally{view?.destroy();ctx.restore();}
});
