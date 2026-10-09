import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initMap} from '../src/map.js';

// Only the external WebGL map is replaced; controls, DOM events and editor run
// as production code. Sources preserve data so accidental edits are detectable.
class MapSurface {
 constructor({container}) {
  this.host=document.getElementById(container);this.canvas=document.createElement('canvas');this.host.append(this.canvas);
  this.handlers=new Map();this.sources=new Map();this.layers=new Map();this.controls=[];this.markers=new Set();
  this.dragRotate={disable(){}};this.touchZoomRotate={enable(){},disableRotation(){}};this.touchPitch={disable(){}};
  this.dragPan={enabled:true,enable(){this.enabled=true;},disable(){this.enabled=false;}};this.doubleClickZoom={enable(){},disable(){}};
 }
 on(name,fn){this.handlers.set(name,[...(this.handlers.get(name)??[]),fn]);}
 off(name,fn){this.handlers.set(name,(this.handlers.get(name)??[]).filter(item=>item!==fn));}
 trigger(name,event={}){for(const fn of [...(this.handlers.get(name)??[])])fn(event);}
 addControl(control){this.controls.push(control);}
 removeControl(control){this.controls=this.controls.filter(item=>item!==control);}
 getContainer(){return this.host;}
 getCanvasContainer(){return this.host;}
 getCanvas(){return this.canvas;}
 loaded(){return true;}
 addSource(id,spec){this.sources.set(id,{data:spec.data,setData(data){this.data=data;}});}
 getSource(id){return this.sources.get(id);}
 addLayer(spec){this.layers.set(spec.id,spec);}
 getLayer(id){return this.layers.get(id);}
 getLayoutProperty(id,key){return this.layers.get(id)?.layout?.[key];}
 setLayoutProperty(id,key,value){const layer=this.layers.get(id);layer.layout={...layer.layout,[key]:value};this.trigger('styledata');}
 moveLayer(){}
 project([lng,lat]){return {x:lng*10,y:lat*10};}
 fitBounds(){}
 getZoom(){return 18;}
 getBearing(){return 0;}
}
class Marker {
 constructor({element,draggable}={}){this.element=element;this.draggable=draggable;this.events={};}
 setLngLat(coordinate){this.coordinate=coordinate;return this;}
 getElement(){return this.element;}
 getLngLat(){return {lng:this.coordinate[0],lat:this.coordinate[1]};}
 addTo(map){this.map=map;map.markers.add(this);map.host.append(this.element);return this;}
 remove(){this.map?.markers.delete(this);this.map=null;this.element.remove();}
 on(name,fn){this.events[name]=fn;return this;}
}
function setup({load=true,...callbacks}={}){
 const old={document:globalThis.document,maplibregl:globalThis.maplibregl,MapboxDraw:globalThis.MapboxDraw};
 const {document,window}=parseHTML('<html><body><div id="home"><section class="map-wrap"><div id="map"></div></section></div><div id="mobile-detail-map"></div></body></html>');
 globalThis.document=document;globalThis.MapboxDraw=undefined;
 globalThis.maplibregl={Map:MapSurface,Marker,NavigationControl:class{},ScaleControl:class{},LngLatBounds:class{extend(){return this;}}};
 const api=initMap({container:'map',...callbacks});if(load)api.map.trigger('load');
 return {api,map:api.map,document,window,restore(){Object.assign(globalThis,old);}};
}
const ring=[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
const visibility=(map,id)=>map.getLayoutProperty(id,'visibility')??'visible';
function toggle(ctx,key,checked){const input=ctx.document.querySelector(`[data-map-visibility="${key}"]`);assert.ok(input,`missing ${key} visibility checkbox`);input.checked=checked;input.dispatchEvent(new ctx.window.Event('change',{bubbles:true}));}

test('eye controls independently hide map overlays without editing any source or invoking save callbacks',()=>{
 let edits=0;const ctx=setup({onGeometryChange:()=>edits++,onExclusionChange:()=>edits++,onRowCurvePointsChange:()=>edits++,onDraftChange:()=>edits++});
 try{
  ctx.api.setGeometry(ring);ctx.api.setExclusions([{id:'cut',geometry:ring}]);ctx.api.setOtherFields([{id:'other',label:'Altro',geometry:ring,rows:[]}]);
  const before=JSON.stringify([...ctx.map.sources]);edits=0;
  const eye=ctx.document.querySelector('[data-map-visibility-trigger]');assert.ok(eye,'eye button should be available on the map');eye.click();
  assert.equal(eye.getAttribute('aria-expanded'),'true');
  toggle(ctx,'field',false);
  assert.equal(visibility(ctx.map,'project-geometry-fill'),'none');assert.equal(visibility(ctx.map,'excluded-zones-line'),'none');assert.equal(visibility(ctx.map,'row-portions-outline'),'none');
  assert.equal(visibility(ctx.map,'vineyard-rows-line'),'visible');assert.equal(ctx.document.querySelector('.map-field-label-overlay').style.display,'none');
  toggle(ctx,'schema',false);assert.equal(visibility(ctx.map,'vineyard-rows-line'),'none');assert.equal(visibility(ctx.map,'other-project-rows-line'),'none');
  toggle(ctx,'quotes',false);assert.equal(ctx.document.querySelector('.side-measurement-label').style.display,'none');
  toggle(ctx,'field',true);assert.equal(visibility(ctx.map,'excluded-zones-line'),'visible');assert.equal(ctx.document.querySelector('.map-field-label-overlay').style.display,'');
  assert.equal(visibility(ctx.map,'vineyard-rows-line'),'none');assert.equal(ctx.document.querySelector('.side-measurement-label').style.display,'none');
  assert.equal(JSON.stringify([...ctx.map.sources]),before);assert.equal(edits,0);
 }finally{ctx.restore();}
});

test('hidden field and quotes stay hidden through redraw, movement and mobile detail reparenting',()=>{
 const ctx=setup();try{
  assert.equal(typeof ctx.api.setOverlayVisibility,'function','map should expose visual preferences');
  ctx.api.setGeometry(ring);ctx.api.setOverlayVisibility({field:false,quotes:false});
  ctx.document.getElementById('mobile-detail-map').append(ctx.map.host.closest('.map-wrap'));
  ctx.api.setGeometry(ring.map(([lng,lat])=>[lng+.01,lat]));ctx.api.setActiveFieldLabel('Rinominato');ctx.map.trigger('idle');ctx.map.trigger('resize');
  assert.equal(visibility(ctx.map,'project-geometry-line'),'none');
  assert.equal(ctx.document.querySelector('.map-field-label-overlay').style.display,'none');
  assert.ok([...ctx.document.querySelectorAll('.side-measurement-label')].every(label=>label.style.display==='none'));
  assert.ok(ctx.document.getElementById('mobile-detail-map').querySelector('[data-map-visibility-trigger]'));
  ctx.api.setOverlayVisibility({field:true,quotes:true});
  assert.equal(visibility(ctx.map,'project-geometry-line'),'visible');assert.ok([...ctx.document.querySelectorAll('.side-measurement-label')].every(label=>label.style.display===''));
 }finally{ctx.restore();}
});

test('preferences chosen before map load apply when layers become ready and active drawing remains usable',()=>{
 const ctx=setup({load:false});try{
  assert.equal(typeof ctx.api.setOverlayVisibility,'function','map should accept visibility before load');
  ctx.api.setOverlayVisibility({field:false,schema:false});ctx.map.trigger('load');
  assert.equal(visibility(ctx.map,'other-project-fields-fill'),'none');assert.equal(visibility(ctx.map,'other-project-rows-line'),'none');
  ctx.api.beginDraw();ctx.map.trigger('click',{lngLat:{lng:8,lat:44},point:{x:80,y:440}});
  const before=ctx.api.capturePendingEdit();ctx.api.setOverlayVisibility({quotes:false});const after=ctx.api.capturePendingEdit();
  assert.deepEqual(after,before);assert.equal(after.drawing,true);assert.equal(after.vertices.length,1);
  assert.equal(visibility(ctx.map,'manual-draw-points'),'visible');assert.equal(ctx.map.dragPan.enabled,false);
  const control=ctx.document.querySelector('.map-visibility-control');let propagated=0;ctx.map.host.closest('.map-wrap').addEventListener('pointerdown',()=>propagated++);
  control.dispatchEvent(new ctx.window.Event('pointerdown',{bubbles:true}));assert.equal(propagated,0);
  const escape=new ctx.window.Event('keydown',{bubbles:true});escape.key='Escape';control.dispatchEvent(escape);
  assert.equal(ctx.api.capturePendingEdit().drawing,true,'Escape in the visibility panel must not cancel the drawing');
 }finally{ctx.restore();}
});

test('native continuous terrain keeps native field and row layers draped with eye preferences intact',()=>{
 const ctx=setup();try{ctx.api.setGeometry(ring);ctx.api.setOverlayVisibility({field:true,schema:false});ctx.api.setTerrainSceneActive(true,null,{nativeTerrain:true});assert.equal(visibility(ctx.map,'project-geometry-line'),'visible');assert.equal(visibility(ctx.map,'vineyard-rows-line'),'none');ctx.api.setOverlayVisibility({schema:true});assert.equal(visibility(ctx.map,'vineyard-rows-line'),'visible');ctx.api.setTerrainSceneActive(false);assert.equal(visibility(ctx.map,'project-geometry-line'),'visible');}finally{ctx.restore();}
});

test('native terrain suspends inactive editor point layers and restores their exact 2D visibility',()=>{
 const ctx=setup();try{
  const ids=['gl-draw-polygon-and-line-vertex-inactive.cold','gl-draw-polygon-and-line-vertex-inactive.hot','gl-draw-polygon-midpoint.cold','gl-draw-polygon-midpoint.hot'];
  for(const [index,id]of ids.entries())ctx.map.addLayer({id,type:'circle',source:'manual-draw',...(index===0?{layout:{visibility:'none'}}:{})});
  const before=ids.map(id=>ctx.map.getLayoutProperty(id,'visibility'));
  ctx.api.setTerrainSceneActive(true,null,{nativeTerrain:true});assert.equal(visibility(ctx.map,'manual-draw-points'),'none');for(const id of ids)assert.equal(visibility(ctx.map,id),'none');assert.equal(visibility(ctx.map,'project-geometry-line'),'visible');
  ctx.api.setTerrainSceneActive(false);assert.equal(visibility(ctx.map,'manual-draw-points'),'visible');for(const [index,id]of ids.entries())assert.equal(ctx.map.getLayoutProperty(id,'visibility')??undefined,before[index]);
  ctx.api.beginDraw();ctx.map.trigger('click',{lngLat:{lng:8,lat:44},point:{x:80,y:440}});assert.equal(ctx.api.capturePendingEdit().vertices.length,1,'2D drawing remains usable after restoration');
 }finally{ctx.restore();}
});
test('editor point layers added again during native terrain stay suspended until 2D restoration',()=>{const ctx=setup();try{const id='gl-draw-polygon-midpoint.hot';ctx.map.addLayer({id,type:'circle',source:'manual-draw'});ctx.api.setTerrainSceneActive(true,null,{nativeTerrain:true});ctx.map.layers.delete(id);ctx.map.addLayer({id,type:'circle',source:'manual-draw'});ctx.map.trigger('styledata');assert.equal(visibility(ctx.map,id),'none');ctx.api.setTerrainSceneActive(false);assert.equal(ctx.map.getLayoutProperty(id,'visibility')??undefined,undefined);}finally{ctx.restore();}});

test('native quote presentation preserves eye choices and restores original 2D markers and scale',()=>{const ctx=setup();try{ctx.api.setGeometry(ring);const markers=[...ctx.map.markers].filter(marker=>marker.element.classList.contains('side-measurement-label')),controls=[...ctx.map.controls];assert.equal(markers.length,4);ctx.api.setOverlayVisibility({quotes:false});ctx.api.setTerrainSceneActive(true,null,{nativeTerrain:true});assert.ok(markers.every(marker=>!ctx.map.markers.has(marker)));assert.equal(ctx.document.querySelectorAll('.terrain-quote-overlay .side-measurement-label').length,4);assert.ok([...ctx.document.querySelectorAll('.terrain-quote-overlay .side-measurement-label')].every(label=>label.style.display==='none'));ctx.api.setOverlayVisibility({quotes:true});ctx.map.trigger('render');assert.ok([...ctx.document.querySelectorAll('.terrain-quote-overlay .side-measurement-label')].every(label=>label.style.display===''));ctx.api.setTerrainSceneActive(false);assert.ok(markers.every(marker=>ctx.map.markers.has(marker)));assert.equal(ctx.document.querySelectorAll('.terrain-quote-overlay').length,0);assert.equal(ctx.document.querySelectorAll('.side-measurement-label').length,4);assert.equal(ctx.map.controls.length,controls.length);assert.ok(controls.every(control=>ctx.map.controls.includes(control)));}finally{ctx.restore();}});
