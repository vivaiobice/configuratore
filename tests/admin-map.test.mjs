import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsForFeatureCollection } from '../admin/admin-map.js';

test('boundsForFeatureCollection encloses every project polygon', () => {
  const bounds = boundsForFeatureCollection({ type:'FeatureCollection', features:[
    { geometry:{ type:'Polygon', coordinates:[[[8,44],[8.1,44],[8.1,44.1],[8,44]]] } },
    { geometry:{ type:'Polygon', coordinates:[[[7.9,43.9],[8,43.9],[8,44],[7.9,43.9]]] } }
  ]});
  assert.deepEqual(bounds, { west:7.9, south:43.9, east:8.1, north:44.1 });
});

test('boundsForFeatureCollection returns null without valid project geometry', () => {
  assert.equal(boundsForFeatureCollection({ type:'FeatureCollection', features:[] }), null);
});
