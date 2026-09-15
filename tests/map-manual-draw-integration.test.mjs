import test from 'node:test';
import assert from 'node:assert/strict';
import { initMap } from '../src/map.js';

class FakeSource {
  constructor(spec) { this.data = spec.data; }
  setData(data) { this.data = data; }
}
class FakeBounds {
  constructor() {}
  extend() { return this; }
}
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
