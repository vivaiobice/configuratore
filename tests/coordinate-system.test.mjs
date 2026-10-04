import test from 'node:test';
import assert from 'node:assert/strict';
import { toUTM, fromUTM } from '../src/coordinate-system.js';
test('WGS84 UTM control points and millimetre inverse in all Italian zones', () => {
  for (const [point, epsg, expected] of [
    [[9, 0], 32632, [500000, 0]],
    [[9, 45], 32632, [500000, 4982950.400226552]],
    [[12, 42], 32633, [251535.07928761898, 4654130.891323307]],
    [[21, 45], 32634, [500000, 4982950.400226552]],
  ]) {
    const metric = toUTM(point, epsg);
    metric.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 0.002));
    const inverse = fromUTM(metric, epsg);
    inverse.forEach((n, i) => assert.ok(Math.abs(n - point[i]) < 1e-9));
  }
});
test('unsupported CRS, nonfinite and out of range coordinates reject explicitly', () => {
  for (const args of [[[9, 45], 25832], [[NaN, 45]], [[9, 85]], [[181, 45]]])
    assert.throws(() => toUTM(...args), RangeError);
  assert.throws(() => fromUTM([500000, Infinity]), RangeError);
});
test('independent PROJ controls include national EPSG32632 outside zone 32', async () => {
  const { readFile } = await import('node:fs/promises');
  const fixtures = JSON.parse(
    await readFile(
      new URL('./fixtures/terrain/proj-control-points.json', import.meta.url),
      'utf8',
    ),
  );
  for (const control of fixtures.points) {
    const projected = toUTM(control.lonLat, control.epsg);
    assert.ok(
      Math.hypot(projected[0] - control.utm[0], projected[1] - control.utm[1]) <
        0.00001,
    );
    const inverse = fromUTM(control.utm, control.epsg);
    assert.ok(
      Math.hypot(
        inverse[0] - control.lonLat[0],
        inverse[1] - control.lonLat[1],
      ) < 1e-10,
    );
  }
});
test('projection rejects remote longitudes outside its verified precise series domain', () => {
  assert.throws(() => toUTM([50, 20], 32632), RangeError);
});
test('inverse precision domain agrees with forward bounds including both ±30° boundaries', () => {
  assert.throws(() => fromUTM([4000000, 4000000], 32632), RangeError);
  for (const epsg of [32632, 32633, 32634]) {
    const center = (epsg - 32600) * 6 - 183;
    for (const delta of [-30, -29.999999, 29.999999, 30]) {
      const geographic = [center + delta, 40],
        metric = toUTM(geographic, epsg),
        inverse = fromUTM(metric, epsg);
      assert.ok(Math.abs(inverse[0] - geographic[0]) < 1e-8);
      assert.doesNotThrow(() => toUTM(inverse, epsg));
    }
  }
});
