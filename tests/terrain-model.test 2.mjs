import test from 'node:test';
import assert from 'node:assert/strict';
import { fromUTM } from '../src/coordinate-system.js';
import {
  encodeTerrainGrid,
  decodeTerrainGrid,
  createTerrainModel,
  validateTerrainModel,
  sampleTerrain,
  terrainPolylineLength,
  terrainSurfaceArea,
  terrainSummary,
  terrainInputHash,
  getTerrainMesh,
} from '../src/terrain-model.js';
const origin = [500000, 4983000],
  step = [5, -5];
const point = (x, y) => fromUTM([origin[0] + x, origin[1] - y]);
const factory = (values = [0, 0, 0, 0, 0, 0, 0, 0, 0]) =>
  createTerrainModel({ grid: { width: 3, height: 3, origin, step, values } });
test('float32 serialization is lossless little endian and frozen roundtrip has deterministic hashes', () => {
  const values = new Float32Array([0, -0, Math.PI, 123.456]);
  const s = encodeTerrainGrid(values);
  const bytes = Buffer.from(s, 'base64');
  assert.equal(bytes.readFloatLE(8), Math.fround(Math.PI));
  assert.deepEqual(
    decodeTerrainGrid({ width: 2, height: 2, valuesBase64: s }),
    values,
  );
  const a = factory(),
    b = factory();
  assert.equal(a.contentHash, b.contentHash);
  assert.equal(Object.isFrozen(a.grid), true);
  assert.equal(
    terrainInputHash({ a: 1, b: 2 }),
    terrainInputHash({ b: 2, a: 1 }),
  );
  assert.notEqual(terrainInputHash({ a: 1 }), terrainInputHash({ a: 2 }));
  assert.equal(validateTerrainModel(JSON.parse(JSON.stringify(a))).valid, true);
});
test('support is cell centers; waves integrate at every triangle crossing', () => {
  const model = factory([0, 5, 0, 0, 5, 0, 0, 5, 0]);
  assert.ok(Math.abs(sampleTerrain(model, point(2.5, 2.5)) - 2.5) < 1e-6);
  assert.equal(sampleTerrain(model, point(-1, 2)), null);
  const length = terrainPolylineLength(model, [point(0, 5), point(10, 5)]);
  assert.ok(Math.abs(length - 2 * Math.sqrt(50)) < 1e-5);
  assert.throws(
    () => terrainPolylineLength(model, [point(-1, 5), point(10, 5)]),
    /coverage|copertura/i,
  );
  assert.equal(getTerrainMesh(model).triangles.length, 8);
});
test('surface area includes exact clipping and holes and separates horizontal area', () => {
  const model = factory([0, 1.5, 3, 0, 1.5, 3, 0, 1.5, 3]);
  const outer = [
    point(0, 0),
    point(10, 0),
    point(10, 10),
    point(0, 10),
    point(0, 0),
  ];
  const hole = [
    point(2, 2),
    point(4, 2),
    point(4, 4),
    point(2, 4),
    point(2, 2),
  ];
  assert.ok(
    Math.abs(
      terrainSurfaceArea(model, {
        type: 'Polygon',
        coordinates: [outer, hole],
      }) -
        96 * Math.sqrt(1.09),
    ) < 1e-4,
  );
  assert.equal(terrainSummary(model).rangeM, 3);
});
test('missing, nodata, corrupted, unsupported and oversized grid data reject', () => {
  const valid = factory();
  for (const patch of [
    { grid: { ...valid.grid, valuesBase64: '' } },
    { grid: { ...valid.grid, width: 262145 } },
    { contentHash: 'corrupt' },
    { crs: 'EPSG:3857' },
    { validation: { complete: false } },
  ])
    assert.equal(validateTerrainModel({ ...valid, ...patch }).valid, false);
  assert.throws(() => factory([0, NaN, 0, 0, 0, 0, 0, 0, 0]));
  const corrupted = {
    ...valid,
    grid: {
      ...valid.grid,
      valuesBase64: encodeTerrainGrid([1, 0, 0, 0, 0, 0, 0, 0, 0]),
    },
  };
  assert.equal(validateTerrainModel(corrupted).valid, false);
});
test('SHA256 matches known hash and validation detects mutation before cached replay', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(
    terrainInputHash({ a: 1 }),
    createHash('sha256').update('{"a":1}').digest('hex'),
  );
  const model = JSON.parse(JSON.stringify(factory()));
  sampleTerrain(model, point(1, 1));
  model.grid.origin[0] += 1;
  assert.equal(validateTerrainModel(model).valid, false);
  assert.throws(() => sampleTerrain(model, point(1, 1)), /Hash|hash/);
  const clean = factory(),
    decoded = decodeTerrainGrid(clean);
  decoded[0] = 999;
  assert.equal(sampleTerrain(clean, point(0, 0)), 0);
});
test('frozen provider nodata and invalid coverage polygons are not trusted as complete', () => {
  const valid = factory();
  for (const coverage of [
    {
      bounds: valid.coverage.bounds,
      polygon: { type: 'Polygon', coordinates: [] },
    },
    {
      bounds: valid.coverage.bounds,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [point(-5, -5), point(10, 0), point(10, 10), point(-5, -5)],
        ],
      },
    },
  ]) {
    const modified = { ...valid, coverage };
    modified.contentHash = terrainInputHash({
      version: modified.version,
      algorithmVersion: modified.algorithmVersion,
      source: modified.source,
      crs: modified.crs,
      grid: modified.grid,
      coverage,
    });
    assert.equal(validateTerrainModel(modified).valid, false);
  }
  assert.throws(
    () =>
      createTerrainModel({
        source: { ...valid.source, id: 'tinitaly-1.1' },
        grid: {
          width: 3,
          height: 3,
          origin,
          step,
          values: [0, -9999, 0, 0, 0, 0, 0, 0, 0],
        },
      }),
    /nodata|quota/i,
  );
});
test('oblique lines split native diagonals and serialized field ceiling is explicit', () => {
  const model = createTerrainModel({
    grid: { width: 2, height: 2, origin, step, values: [0, 0, 0, 10] },
  });
  const actual = terrainPolylineLength(model, [point(1, 1), point(4, 4)]);
  assert.ok(
    Math.abs(actual - (Math.hypot(1.5, 1.5) + Math.hypot(1.5, 1.5, 6))) < 1e-5,
  );
  assert.throws(
    () =>
      createTerrainModel({
        grid: {
          width: 512,
          height: 512,
          origin,
          step,
          values: new Float32Array(262144),
        },
      }),
    (error) =>
      error.code === 'budget' && /1 MiB|serializzato/.test(error.message),
  );
});
test('public sampling rejects changed mutable imports and shallow-frozen nested grids', () => {
  for (const shallowFrozen of [false, true]) {
    const model = JSON.parse(
      JSON.stringify(factory([0, 5, 10, 0, 5, 10, 0, 5, 10])),
    );
    if (shallowFrozen) Object.freeze(model);
    assert.ok(Math.abs(sampleTerrain(model, point(2, 2)) - 2) < 1e-6);
    model.grid.origin[0] += 1;
    assert.throws(() => sampleTerrain(model, point(2, 2)), /hash/i);
  }
});
test('an explicit validate-once sampler snapshots mutable grid origin and step', async () => {
  const { createTerrainSampler } = await import('../src/terrain-model.js');
  const model = JSON.parse(
    JSON.stringify(factory([0, 5, 10, 0, 5, 10, 0, 5, 10])),
  );
  const sampler = createTerrainSampler(model),
    initial = sampler(point(2, 2));
  model.grid.origin[0] += 1;
  model.grid.step[0] = 10;
  model.grid.step[1] = -10;
  assert.equal(sampler(point(2, 2)), initial);
  assert.equal(validateTerrainModel(model).valid, false);
});
