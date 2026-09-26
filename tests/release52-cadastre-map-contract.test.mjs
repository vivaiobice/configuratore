import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class FakeMap {
  constructor(zoom = 15) {
    this.zoom = zoom;
    this.sources = new Map();
    this.layers = new Map();
    this.events = new Map();
    this.addLayerCalls = [];
  }
  getZoom() { return this.zoom; }
  getSource(id) { return this.sources.get(id); }
  getLayer(id) { return this.layers.get(id); }
  addSource(id, definition) {
    const source = { ...definition, updateImage: update => { source.lastUpdate = update; } };
    this.sources.set(id, source);
  }
  addLayer(layer, beforeId) {
    this.layers.set(layer.id, { ...layer, layout:{ ...(layer.layout ?? {}) } });
    this.addLayerCalls.push([layer, beforeId]);
  }
  setLayoutProperty(id, name, value) { this.layers.get(id).layout[name] = value; }
  on(name, handler) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(handler); }
  off(name, handler) { this.events.get(name)?.delete(handler); }
  emit(name, payload) { for (const handler of this.events.get(name) ?? []) handler(payload); }
}

function requestForViewport(sequence) {
  return () => ({
    url:`https://example.test/cadastre-${++sequence.value}.png`,
    coordinates:[[8,45],[9,45],[9,44],[8,44]]
  });
}

test('cadastral overlay waits for supported zoom and stays below project geometry', async () => {
  const module = await import('../src/cadastral-overlay.js').catch(() => ({}));
  assert.equal(typeof module.createCadastralOverlay, 'function');
  const map = new FakeMap(14.9);
  const states = [];
  const controller = module.createCadastralOverlay({
    map,
    requestForViewport:requestForViewport({value:0}),
    beforeLayerId:() => 'vineyard-rows-line',
    onState:state => states.push(state)
  });
  controller.setVisible(true);
  assert.equal(map.getSource('cadastre-image'), undefined);
  assert.equal(states.at(-1).reason, 'zoom');
  map.zoom = 15;
  controller.refresh();
  assert.ok(map.getSource('cadastre-image'));
  assert.equal(map.addLayerCalls.at(-1)[1], 'vineyard-rows-line');
  assert.equal(states.at(-1).loading, true);
});

test('cadastral overlay refreshes the current viewport and remains hidden after OFF', async () => {
  const { createCadastralOverlay } = await import('../src/cadastral-overlay.js').catch(() => ({}));
  assert.equal(typeof createCadastralOverlay, 'function');
  const map = new FakeMap(16);
  const states = [];
  const sequence = {value:0};
  const controller = createCadastralOverlay({ map, requestForViewport:requestForViewport(sequence), onState:state => states.push(state) });
  controller.setVisible(true);
  controller.refresh();
  assert.match(map.getSource('cadastre-image').lastUpdate.url, /cadastre-2/);
  controller.setVisible(false);
  assert.equal(map.getLayer('cadastre-image-layer').layout.visibility, 'none');
  map.emit('sourcedata', { sourceId:'cadastre-image', isSourceLoaded:true });
  assert.equal(states.at(-1).reason, 'off');
});

test('cadastral overlay reports only its own source errors without mutating geometry', async () => {
  const { createCadastralOverlay } = await import('../src/cadastral-overlay.js').catch(() => ({}));
  assert.equal(typeof createCadastralOverlay, 'function');
  const map = new FakeMap(16);
  const states = [];
  const controller = createCadastralOverlay({ map, requestForViewport:requestForViewport({value:0}), onState:state => states.push(state) });
  controller.setVisible(true);
  map.emit('error', { sourceId:'street', error:new Error('street') });
  assert.equal(states.at(-1).error, false);
  map.emit('error', { sourceId:'cadastre-image', error:new Error('WMS') });
  assert.equal(states.at(-1).error, true);
  assert.equal(states.at(-1).loading, false);
  controller.destroy();
});

test('cadastral overlay defers source creation until the map style is loaded', async () => {
  const { createCadastralOverlay } = await import('../src/cadastral-overlay.js');
  const map = new FakeMap(16);
  let loaded = false;
  map.loaded = () => loaded;
  const states = [];
  const controller = createCadastralOverlay({ map, requestForViewport:requestForViewport({value:0}), onState:state => states.push(state) });
  controller.setVisible(true);
  assert.equal(map.getSource('cadastre-image'), undefined);
  assert.equal(states.at(-1).reason, 'loading');
  loaded = true;
  map.emit('load', {});
  assert.ok(map.getSource('cadastre-image'));
});

test('cadastral overlay refreshes a new viewport while the previous image is loading', async () => {
  const { createCadastralOverlay } = await import('../src/cadastral-overlay.js');
  const map = new FakeMap(16);
  let loaded = true;
  map.loaded = () => loaded;
  const sequence = {value:0};
  const controller = createCadastralOverlay({ map, requestForViewport:requestForViewport(sequence) });
  controller.setVisible(true);
  assert.match(map.getSource('cadastre-image').url, /cadastre-1/);
  loaded = false;
  controller.refresh();
  assert.match(map.getSource('cadastre-image').lastUpdate.url, /cadastre-2/);
});

test('editor map exposes visual WMS only and no parcel-selection path', () => {
  const source = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /buildCadastralWfsUrl|combineCadastralParcels|parseCadastralGml|selectCadastralParcel/);
  assert.doesNotMatch(source, /beginCadastralSelect/);
  assert.match(source, /createCadastralOverlay/);
  assert.match(source, /beforeLayerId:\(\) => map\.getLayer\(ROWS_LAYER_ID\) \? ROWS_LAYER_ID/);
});
