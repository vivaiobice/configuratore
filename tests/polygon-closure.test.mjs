import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldClosePolygonAtFirstVertex, createReliablePolygonMode } from '../src/map-adapters.js';

test('polygon closes when at least three vertices exist and pointer is near first vertex', () => {
  const state = {
    currentVertexPosition: 3,
    polygon: { coordinates: [[[8.2, 44.7], [8.21,44.7], [8.21,44.71], [8.2,44.71]]] }
  };
  const map = { project: () => ({ x:100, y:100 }) };
  assert.equal(shouldClosePolygonAtFirstVertex(state, { point:{ x:112, y:106 } }, map, 18), true);
});

test('polygon does not close near first vertex before three vertices exist', () => {
  const state = {
    currentVertexPosition: 2,
    polygon: { coordinates: [[[8.2, 44.7], [8.21,44.7], [8.2,44.7]]] }
  };
  const map = { project: () => ({ x:100, y:100 }) };
  assert.equal(shouldClosePolygonAtFirstVertex(state, { point:{ x:101, y:101 } }, map, 18), false);
});

test('reliable polygon mode forces simple_select when click is near first vertex', () => {
  let delegated = 0;
  const base = {
    onClick() { delegated += 1; },
    onTap() { delegated += 1; },
    onSetup() {},
    onStop() {},
    toDisplayFeatures() {}
  };
  const Draw = { modes:{ draw_polygon:base } };
  const mode = createReliablePolygonMode(Draw, 18);
  const calls = [];
  const ctx = {
    map:{ project:() => ({ x:100, y:100 }) },
    changeMode(name, options) { calls.push([name, options]); }
  };
  const state = {
    currentVertexPosition:3,
    polygon:{ id:'poly-1', coordinates:[[[8.2,44.7],[8.21,44.7],[8.21,44.71],[8.2,44.71]]] }
  };
  mode.onClick.call(ctx, state, { point:{ x:108, y:108 }, lngLat:{ lng:8.2, lat:44.7 } });
  assert.deepEqual(calls, [['simple_select', { featureIds:['poly-1'] }]]);
  assert.equal(delegated, 0);
});

test('reliable polygon mode delegates ordinary clicks to the built-in mode', () => {
  let delegated = 0;
  const base = {
    onClick() { delegated += 1; return 'delegated'; },
    onTap() { delegated += 1; return 'delegated'; }
  };
  const Draw = { modes:{ draw_polygon:base } };
  const mode = createReliablePolygonMode(Draw, 18);
  const ctx = {
    map:{ project:() => ({ x:100, y:100 }) },
    changeMode() { throw new Error('should not close'); }
  };
  const state = {
    currentVertexPosition:3,
    polygon:{ id:'poly-1', coordinates:[[[8.2,44.7],[8.21,44.7],[8.21,44.71],[8.2,44.71]]] }
  };
  const result = mode.onClick.call(ctx, state, { point:{ x:150, y:150 }, lngLat:{ lng:8.3, lat:44.8 } });
  assert.equal(result, 'delegated');
  assert.equal(delegated, 1);
});
