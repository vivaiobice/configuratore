import test from 'node:test';
import assert from 'node:assert/strict';
import { initMap } from '../src/map.js';

test('undoing a mobile drawing point updates closure readiness without committing',()=>{
 const previous=globalThis.maplibregl;
 try {
  globalThis.maplibregl={Map:FakeMap,NavigationControl:class{},ScaleControl:class{},LngLatBounds:FakeBounds};
  let drawing, geometry;
  const api=initMap({container:'map',onDrawingState:s=>drawing=s,onGeometryChange:g=>geometry=g});
  const map=globalThis.__fakeMap;map.trigger('load');api.beginDraw();
  for(const [lng,lat] of [[8,44],[9,44],[9,45]])map.trigger('click',{lngLat:{lng,lat}});
  assert.equal(drawing.canClose,true);
  assert.equal(typeof api.undoDrawPoint,'function');
  api.undoDrawPoint();assert.equal(drawing.vertexCount,2);assert.equal(drawing.canClose,false);assert.equal(geometry,undefined);
  api.undoDrawPoint();api.undoDrawPoint();api.undoDrawPoint();assert.equal(drawing.vertexCount,0);
 }finally{globalThis.maplibregl=previous;}
});

class FakeSource {
  constructor(spec) { this.data = spec.data; }
  setData(data) { this.data = data; }
}
class FakeBounds {
  constructor() {}
  extend() { return this; }
}

test('mobile passage waits for explicit confirmation before cutting the field',async()=>{
 const previous=globalThis.maplibregl;
 try {
  globalThis.maplibregl={Map:FakeMap,NavigationControl:class{},ScaleControl:class{},LngLatBounds:FakeBounds};
  let additions=0,drawing;
  const api=initMap({container:'map',requiresLinearConfirmation:()=>true,onDrawingState:s=>drawing=s,onExclusionAdd:()=>additions++});
  const map=globalThis.__fakeMap;map.trigger('load');
  api.setGeometry([[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]]);
  api.beginLinearExclusionDraw();
  map.trigger('click',{lngLat:{lng:8.002,lat:44.002}});
  map.trigger('click',{lngLat:{lng:8.008,lat:44.008}});
  assert.equal(additions,0);assert.equal(drawing.canClose,true);
  await api.finishDraw();assert.equal(additions,1);assert.equal(drawing.active,false);
 }finally{globalThis.maplibregl=previous;}
});
class FakeMap {
  constructor() {
    globalThis.__fakeMap = this;
    this.handlers = new Map();
    this.sources = new Map();
    this.layers = new Map();
    this.bearing = 0;
    this.dragRotate = { enable() {} };
    this.touchZoomRotate = { enable() {}, enableRotation() {} };
    this.dragPan = { enable() {}, disable() {} };
    this.doubleClickZoom = { enable() {}, disable() {} };
    this.canvas = { style:{}, classList:{ toggle() {} }, focus() {} };
    this.container = { addEventListener() {} };
  }
  addControl() {}
  on(name, fn) { const list=this.handlers.get(name) ?? []; list.push(fn); this.handlers.set(name,list); }
  once(name, fn) { this.on(name, fn); }
  trigger(name, event={}) { for (const fn of this.handlers.get(name) ?? []) fn(event); }
  addSource(id, spec) { this.sources.set(id, new FakeSource(spec)); }
  getSource(id) { return this.sources.get(id); }
  addLayer(layer) { this.layers.set(layer.id, layer); }
  getLayer(id) { return this.layers.get(id); }
  getCanvas() { return this.canvas; }
  getCanvasContainer() { return this.container; }
  getContainer() { return this.container; }
  loaded() { return true; }
  project([lon, lat]) { return { x:lon*10, y:lat*10 }; }
  fitBounds() {}
  getBearing() { return this.bearing; }
  setBearing(value) { this.bearing = value; }
  easeTo({bearing}) { if (Number.isFinite(bearing)) this.bearing = bearing; }
}

test('manual draw closes by clicking the first vertex and emits a real closed polygon', () => {
  const oldMapLibre = globalThis.maplibregl;
  const oldDraw = globalThis.MapboxDraw;
  try {
    globalThis.maplibregl = {
      Map:FakeMap,
      NavigationControl:class {},
      ScaleControl:class {},
      LngLatBounds:FakeBounds
    };
    globalThis.MapboxDraw = undefined;
    let emitted = null;
    const api = initMap({ container:'map', onGeometryChange:(geometry) => { emitted=geometry; } });
    const map = globalThis.__fakeMap;
    map.trigger('load');
    api.beginDraw();
    map.trigger('click', { point:{x:100,y:100}, lngLat:{lng:10,lat:10}, originalEvent:{} });
    map.trigger('click', { point:{x:200,y:100}, lngLat:{lng:20,lat:10}, originalEvent:{} });
    map.trigger('click', { point:{x:200,y:200}, lngLat:{lng:20,lat:20}, originalEvent:{} });
    map.trigger('click', { point:{x:106,y:104}, lngLat:{lng:10.6,lat:10.4}, originalEvent:{ preventDefault(){} } });
    assert.deepEqual(emitted, [[10,10],[20,10],[20,20],[10,10]]);
    const projectData = map.getSource('project-geometry').data;
    assert.equal(projectData.features[0].geometry.type, 'Polygon');
    assert.deepEqual(projectData.features[0].geometry.coordinates[0], emitted);
  } finally {
    globalThis.maplibregl = oldMapLibre;
    globalThis.MapboxDraw = oldDraw;
    delete globalThis.__fakeMap;
  }
});


test('manual draw can always be closed explicitly after three vertices', () => {
  const oldMapLibre = globalThis.maplibregl;
  const oldDraw = globalThis.MapboxDraw;
  try {
    globalThis.maplibregl = {
      Map:FakeMap,
      NavigationControl:class {},
      ScaleControl:class {},
      LngLatBounds:FakeBounds
    };
    globalThis.MapboxDraw = undefined;
    let emitted = null;
    const api = initMap({ container:'map', onGeometryChange:(geometry) => { emitted=geometry; } });
    const map = globalThis.__fakeMap;
    map.trigger('load');
    api.beginDraw();
    map.trigger('click', { point:{x:100,y:100}, lngLat:{lng:10,lat:10}, originalEvent:{} });
    map.trigger('click', { point:{x:200,y:100}, lngLat:{lng:20,lat:10}, originalEvent:{} });
    map.trigger('click', { point:{x:200,y:200}, lngLat:{lng:20,lat:20}, originalEvent:{} });
    assert.equal(api.finishDraw(), true);
    assert.deepEqual(emitted, [[10,10],[20,10],[20,20],[10,10]]);
  } finally {
    globalThis.maplibregl = oldMapLibre;
    globalThis.MapboxDraw = oldDraw;
    delete globalThis.__fakeMap;
  }
});
