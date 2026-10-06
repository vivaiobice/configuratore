import test from 'node:test';
import assert from 'node:assert/strict';

const helpers = await import('../src/map-adapters.js');

test('manual polygon helper closes a ring only after three distinct vertices', () => {
  assert.equal(typeof helpers.closeManualPolygon, 'function');
  assert.equal(helpers.closeManualPolygon([[1,1],[2,1]]), null);
  assert.deepEqual(
    helpers.closeManualPolygon([[1,1],[2,1],[2,2]]),
    [[1,1],[2,1],[2,2],[1,1]]
  );
});

test('manual polygon helper recognizes a click close to the first vertex in pixels', () => {
  assert.equal(typeof helpers.isManualCloseClick, 'function');
  const project = ([lon, lat]) => ({ x:lon * 10, y:lat * 10 });
  const vertices = [[10,10],[20,10],[20,20]];
  assert.equal(helpers.isManualCloseClick(vertices, {x:106,y:104}, project, 10), true);
  assert.equal(helpers.isManualCloseClick(vertices, {x:130,y:130}, project, 10), false);
});
