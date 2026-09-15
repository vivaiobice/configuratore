import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundUpTo25,
  polygonMetrics,
  generateRows,
  estimatePlantsFromRows,
  sideMeasurements,
  suggestRowOrientation
} from '../src/geometry.js';

const square10m = [
  [8.0, 44.0],
  [8.0 + 10 / (111320 * Math.cos(44 * Math.PI / 180)), 44.0],
  [8.0 + 10 / (111320 * Math.cos(44 * Math.PI / 180)), 44.0 + 10 / 110540],
  [8.0, 44.0 + 10 / 110540],
  [8.0, 44.0]
];

test('roundUpTo25 always rounds positive quantities upward to commercial packs', () => {
  assert.equal(roundUpTo25(1), 25);
  assert.equal(roundUpTo25(25), 25);
  assert.equal(roundUpTo25(26), 50);
  assert.equal(roundUpTo25(0), 0);
});

test('polygonMetrics returns area, perimeter and unique vertex count', () => {
  const metrics = polygonMetrics(square10m);
  assert.ok(Math.abs(metrics.areaM2 - 100) < 2.5, `area=${metrics.areaM2}`);
  assert.ok(Math.abs(metrics.perimeterM - 40) < 1.2, `perimeter=${metrics.perimeterM}`);
  assert.equal(metrics.vertexCount, 4);
});

test('generateRows clips parallel rows inside a polygon', () => {
  const rows = generateRows(square10m, 2.5, 0);
  assert.ok(rows.length >= 3 && rows.length <= 5, `rows=${rows.length}`);
  assert.ok(rows.every((row) => row.lengthM > 8.5 && row.lengthM < 10.8));
});

test('estimatePlantsFromRows counts plants from each physical row length', () => {
  const plants = estimatePlantsFromRows([
    { lengthM: 10 },
    { lengthM: 4.4 }
  ], 1);
  assert.equal(plants, 16);
});

test('pointInPolygon identifies clicks inside and outside a parcel', async () => {
  const { pointInPolygon } = await import('../src/geometry.js');
  const polygon = [[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
  assert.equal(pointInPolygon([8.005,44.005], polygon), true);
  assert.equal(pointInPolygon([8.02,44.005], polygon), false);
});


test('sideMeasurements returns one measured midpoint for each polygon side', () => {
  const sides = sideMeasurements(square10m);
  assert.equal(sides.length, 4);
  assert.ok(sides.every((side) => side.lengthM > 8.5 && side.lengthM < 10.8));
  assert.ok(sides.every((side) => Array.isArray(side.midpoint) && side.midpoint.length === 2));
});

test('suggestRowOrientation favors long continuous rows on an elongated rectangle', () => {
  const lonM = 1 / (111320 * Math.cos(44 * Math.PI / 180));
  const latM = 1 / 110540;
  const rectangle30x10 = [
    [8,44], [8 + 30 * lonM,44], [8 + 30 * lonM,44 + 10 * latM],
    [8,44 + 10 * latM], [8,44]
  ];
  const angle = suggestRowOrientation(rectangle30x10, 2.5, { stepDeg:5 });
  assert.ok(angle >= 85 && angle <= 95, `angle=${angle}`);
});

test('sideMeasurementsToFeatureCollection formats side labels for the map', async () => {
  const { sideMeasurementsToFeatureCollection } = await import('../src/geometry.js');
  const featureCollection = sideMeasurementsToFeatureCollection(sideMeasurements(square10m));
  assert.equal(featureCollection.features.length, 4);
  assert.match(featureCollection.features[0].properties.label, /^\d+(?:[,.]\d+)? m$/);
  assert.equal(featureCollection.features[0].geometry.type, 'Point');
});
