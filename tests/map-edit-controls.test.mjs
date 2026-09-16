import test from 'node:test';
import assert from 'node:assert/strict';
import { initMap } from '../src/map.js';

class FakeSource { constructor(spec) { this.data=spec.data; } setData(data){ this.data=data; } }
class FakeBounds { extend(){ return this; } }
class FakeMarker {
  constructor({element}={}){ this.element=element; globalThis.__editMarkers.push(this); }
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

function setup(callbacks={}){
  const oldMapLibre=globalThis.maplibregl, oldDraw=globalThis.MapboxDraw, oldDocument=globalThis.document;
  globalThis.__editMarkers=[];
  globalThis.document={createElement:fakeElement};
  globalThis.maplibregl={Map:FakeMap,NavigationControl:class{},ScaleControl:class{},LngLatBounds:FakeBounds,Marker:FakeMarker};
  globalThis.MapboxDraw=undefined;
  const api=initMap({container:'map',...callbacks});
  const map=globalThis.__editMap; map.trigger('load');
  return {api,map,restore(){globalThis.maplibregl=oldMapLibre;globalThis.MapboxDraw=oldDraw;globalThis.document=oldDocument;delete globalThis.__editMap;delete globalThis.__editMarkers;}};
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
