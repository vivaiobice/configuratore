import test from 'node:test';
import assert from 'node:assert/strict';
import { initMap } from '../src/map.js';

class FakeSource { constructor(spec) { this.data=spec.data; } setData(data){ this.data=data; } }
class FakeBounds { extend(){ return this; } }
class FakeMarker {
  constructor({element,draggable}={}){ this.element=element; this.draggable=draggable; this.handlers={}; globalThis.__editMarkers.push(this); }
  on(name,fn){this.handlers[name]=fn;return this;}
  getLngLat(){return {lng:this.lngLat[0],lat:this.lngLat[1]};}
  setLngLat(value){ this.lngLat=value; return this; }
  addTo(){ return this; }
  remove(){ this.removed=true; }
}
function fakeElement(){
  const handlers=new Map();
  return {className:'',textContent:'',title:'',type:'',setAttribute(){},addEventListener(type,fn){handlers.set(type,fn);},click(){handlers.get('click')?.({preventDefault(){},stopPropagation(){}});}};
}
class FakeMap {
  constructor(){ globalThis.__editMap=this; this.handlers=new Map(); this.sources=new Map(); this.layers=new Map(); this.bearing=0; this.dragRotate={disable(){}}; this.touchZoomRotate={enable(){},disableRotation(){}}; this.touchPitch={disable(){}}; this.dragPan={enable(){},disable(){}}; this.doubleClickZoom={enable(){},disable(){}}; this.canvas={style:{},classList:{toggle(){}},focus(){}}; this.container={addEventListener(){}}; }
  addControl(){}
  on(name,fn){ const list=this.handlers.get(name)??[]; list.push(fn); this.handlers.set(name,list); }
  once(name,fn){ const wrapped=(e)=>{ this.off(name,wrapped); fn(e); }; this.on(name,wrapped); }
  off(name,fn){ this.handlers.set(name,(this.handlers.get(name)??[]).filter(x=>x!==fn)); }
  trigger(name,event={}){ for(const fn of [...(this.handlers.get(name)??[])]) fn(event); }
  addSource(id,spec){ this.sources.set(id,new FakeSource(spec)); }
  getSource(id){ return this.sources.get(id); }
  addLayer(layer){ this.layers.set(layer.id,layer); }
  getLayer(id){ return this.layers.get(id); }
  getCanvas(){ return this.canvas; }
  getCanvasContainer(){ return this.container; }
  getContainer(){ return this.container; }
  loaded(){ return true; }
  project([lon,lat]){ return {x:lon*10,y:lat*10}; }
  fitBounds(){}
  getBearing(){ return this.bearing; }
  easeTo({bearing}){ if(Number.isFinite(bearing)) this.bearing=bearing; }
}

class FakeDraw {
  static constants={classes:{}};
  constructor(){ this.features=[]; this.mode=null; this.options=null; globalThis.__fakeDraw=this; }
  deleteAll(){ this.features=[]; }
  add(feature){ const stored={...feature,id:'field-shape'}; this.features=[stored]; return [stored.id]; }
  changeMode(mode,options){ this.mode=mode; this.options=options; }
  getAll(){ return {type:'FeatureCollection',features:this.features}; }
  getSelectedPoints(){ return {features:[]}; }
}

function setup(callbacks={}, withDraw=false){
  const oldMapLibre=globalThis.maplibregl, oldDraw=globalThis.MapboxDraw, oldDocument=globalThis.document;
  globalThis.__editMarkers=[];
  globalThis.document={createElement:fakeElement};
  globalThis.maplibregl={Map:FakeMap,NavigationControl:class{},ScaleControl:class{},LngLatBounds:FakeBounds,Marker:FakeMarker};
  globalThis.MapboxDraw=withDraw ? FakeDraw : undefined;
  const api=initMap({container:'map',...callbacks});
  const map=globalThis.__editMap; map.trigger('load');
  return {api,map,draw:globalThis.__fakeDraw,restore(){globalThis.maplibregl=oldMapLibre;globalThis.MapboxDraw=oldDraw;globalThis.document=oldDocument;delete globalThis.__editMap;delete globalThis.__editMarkers;delete globalThis.__fakeDraw;}};
}

test('clearGeometry actually empties the committed perimeter source', () => {
  const ctx=setup();
  try {
    ctx.api.setGeometry([[10,10],[20,10],[20,20],[10,10]]);
    assert.equal(ctx.map.getSource('project-geometry').data.features.length,1);
    ctx.api.clearGeometry();
    assert.equal(ctx.map.getSource('project-geometry').data.features.length,0);
  } finally { ctx.restore(); }
});

test('vertex removal mode deletes the clicked perimeter vertex without Mapbox Draw selection', () => {
  let emitted=null;
  const ctx=setup({onGeometryChange:(g)=>{emitted=g;}});
  try {
    ctx.api.setGeometry([[10,10],[20,10],[20,20],[10,20],[10,10]]);
    assert.equal(ctx.api.beginVertexRemoval(), true);
    const marker = globalThis.__editMarkers.find((item) => item.element?.className === 'vertex-removal-marker' && item.lngLat?.[0] === 20 && item.lngLat?.[1] === 10);
    assert.ok(marker, 'expected direct HTML removal marker on the selected vertex');
    marker.element.click();
    assert.deepEqual(emitted, [[10,10],[20,20],[10,20],[10,10]]);
  } finally { ctx.restore(); }
});

test('explicit vertex editing shows draggable handles and commits dragged geometry on finish', () => {
  let emitted=null;
  const editingStates=[];
  const ctx=setup({onGeometryChange:(g)=>{emitted=g;},onEditingState:(state)=>editingStates.push(state.active)}, true);
  try {
    const original=[[10,10],[20,10],[20,20],[10,10]];
    const moved=[[10,10],[22,10],[20,20],[10,10]];
    ctx.api.setGeometry(original);
    assert.equal(ctx.api.beginVertexEditing(), true);
    const handle=globalThis.__editMarkers.find(m=>m.draggable && m.lngLat[0]===20 && m.lngLat[1]===10);
    assert.ok(handle);
    handle.setLngLat([22,10]); handle.handlers.dragend();
    assert.equal(ctx.api.finishVertexEditing(), true);
    assert.deepEqual(emitted, moved);
    assert.deepEqual(editingStates, [true,false]);
  } finally { ctx.restore(); }
});

test('exclusion drawing temporarily removes editor geometry and restores it after closing', () => {
  let excluded=null;
  const ctx=setup({onExclusionAdd:(g)=>{excluded=g;}});
  try {
    ctx.api.setGeometry([[0,0],[10,0],[10,10],[0,10],[0,0]]);
    assert.equal(ctx.api.beginExclusionDraw(), true);
    ctx.map.trigger('click',{point:{x:20,y:20},lngLat:{lng:2,lat:2}});
    ctx.map.trigger('click',{point:{x:50,y:20},lngLat:{lng:5,lat:2}});
    ctx.map.trigger('click',{point:{x:50,y:50},lngLat:{lng:5,lat:5}});
    assert.equal(ctx.api.finishDraw(), true);
    assert.deepEqual(excluded, [[2,2],[5,2],[5,5],[2,2]]);
    assert.equal(ctx.map.getSource('project-geometry').data.features.length,1);
  } finally { ctx.restore(); }
});

test('double click closes an exclusion after three vertices as a desktop fallback', () => {
  let excluded=null;
  const ctx=setup({onExclusionAdd:(g)=>{excluded=g;}});
  try {
    ctx.api.setGeometry([[0,0],[10,0],[10,10],[0,10],[0,0]]);
    ctx.api.beginExclusionDraw();
    ctx.map.trigger('click',{point:{x:20,y:20},lngLat:{lng:2,lat:2}});
    ctx.map.trigger('click',{point:{x:50,y:20},lngLat:{lng:5,lat:2}});
    ctx.map.trigger('click',{point:{x:50,y:50},lngLat:{lng:5,lat:5}});
    ctx.map.trigger('dblclick',{originalEvent:{preventDefault(){}}});
    assert.deepEqual(excluded, [[2,2],[5,2],[5,5],[2,2]]);
  } finally { ctx.restore(); }
});

test('other project fields render as passive polygons without replacing active geometry', () => {
  const ctx=setup();
  try {
    ctx.api.setGeometry([[10,10],[20,10],[20,20],[10,10]]);
    ctx.api.setOtherFields([{id:'field-2',label:'Campo 2',geometry:[[30,30],[40,30],[40,40],[30,30]]}]);
    assert.equal(ctx.map.getSource('project-geometry').data.features.length,1);
    assert.equal(ctx.map.getSource('other-project-fields').data.features.length,1);
    assert.equal(ctx.map.getSource('other-project-fields').data.features[0].properties.label,'Campo 2');
  } finally { ctx.restore(); }
});

test('changing fields removes handles and editing restarts on the new geometry',()=>{
 const ctx=setup();
 try {
  ctx.api.setGeometry([[0,0],[10,0],[10,10],[0,0]]);
  ctx.api.beginVertexEditing();
  const old=globalThis.__editMarkers.filter(m=>m.draggable);
  assert.equal(old.length,3);
  ctx.api.clearGeometry();
  ctx.api.setGeometry([[20,20],[30,20],[30,30],[20,20]]);
  assert.ok(old.every(m=>m.removed));
  ctx.api.beginVertexEditing();
  assert.deepEqual(globalThis.__editMarkers.filter(m=>m.draggable&&!m.removed).map(m=>m.lngLat),[[20,20],[30,20],[30,30]]);
 } finally {ctx.restore();}
});

test('exclusion handles modify only the selected exclusion and support adding a vertex',()=>{
 let changed; let perimeterChanges=0;
 const ctx=setup({onExclusionChange:(id,ring)=>changed={id,ring},onGeometryChange:()=>perimeterChanges++});
 try {
  ctx.api.setGeometry([[0,0],[10,0],[10,10],[0,10],[0,0]]);
  ctx.api.setExclusions([{id:'cut',geometry:[[2,2],[4,2],[4,4],[2,2]]}]);
  assert.equal(ctx.api.beginExclusionEditing('cut'),true);
  const handle=globalThis.__editMarkers.find(m=>m.draggable&&!m.removed);
  handle.setLngLat([1,2]);handle.handlers.dragend();
  assert.equal(changed.id,'cut');
  assert.deepEqual(changed.ring[0],[1,2]);
  assert.deepEqual(changed.ring.at(-1),[1,2]);
  const add=globalThis.__editMarkers.find(m=>m.element.className==='vertex-add-handle'&&!m.removed);
  add.element.click();
  assert.equal(changed.ring.length,5);
  assert.equal(perimeterChanges,0);
  ctx.api.finishVertexEditing();
  assert.ok(globalThis.__editMarkers.filter(m=>m.draggable).every(m=>m.removed));
 } finally {ctx.restore();}
});
