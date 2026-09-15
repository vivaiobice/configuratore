import test from 'node:test';
import assert from 'node:assert/strict';
import { initMap } from '../src/map.js';

class FakeSource { constructor(spec) { this.data=spec.data; } setData(data){ this.data=data; } }
class FakeBounds { extend(){ return this; } }
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
  const oldMapLibre=globalThis.maplibregl, oldDraw=globalThis.MapboxDraw;
  globalThis.maplibregl={Map:FakeMap,NavigationControl:class{},ScaleControl:class{},LngLatBounds:FakeBounds};
  globalThis.MapboxDraw=undefined;
  const api=initMap({container:'map',...callbacks});
  const map=globalThis.__editMap; map.trigger('load');
  return {api,map,restore(){globalThis.maplibregl=oldMapLibre;globalThis.MapboxDraw=oldDraw;delete globalThis.__editMap;}};
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
    ctx.map.trigger('click',{point:{x:200,y:100},lngLat:{lng:20,lat:10}});
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
