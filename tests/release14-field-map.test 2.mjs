import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as geometry from '../src/geometry.js';
import { calculateProject } from '../src/project-calculator.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const lonM = 1 / (111320 * Math.cos(44 * Math.PI / 180));
const latM = 1 / 110540;
const square20m = [
  [8,44], [8+20*lonM,44], [8+20*lonM,44+20*latM], [8,44+20*latM], [8,44]
];

test('geometry exposes an interior label point suitable for an always-visible field tag', () => {
  assert.equal(typeof geometry.interiorLabelPoint, 'function');
  const concave = [[8,44],[8+20*lonM,44],[8+20*lonM,44+5*latM],[8+5*lonM,44+5*latM],[8+5*lonM,44+20*latM],[8,44+20*latM],[8,44]];
  const point = geometry.interiorLabelPoint(concave);
  assert.ok(point);
  assert.equal(geometry.pointInPolygon(point, concave), true);
});

test('a 1.50 m linear passage becomes a closed corridor polygon', () => {
  assert.equal(typeof geometry.corridorPolygonFromLine, 'function');
  const corridor = geometry.corridorPolygonFromLine([8+2*lonM,44+10*latM], [8+18*lonM,44+10*latM], 1.5);
  assert.ok(Array.isArray(corridor));
  assert.equal(corridor.length, 5);
  const metrics = geometry.polygonMetrics(corridor);
  assert.ok(metrics.areaM2 > 22 && metrics.areaM2 < 27, `area=${metrics.areaM2}`);
});

test('normalizing polygon-clipping intersections accepts border-touching or partially external exclusions', () => {
  assert.equal(typeof geometry.normalizeIntersectionRings, 'function');
  const clippedResult = [[[
    [8,44+5*latM], [8+5*lonM,44+5*latM], [8+5*lonM,44+15*latM], [8,44+15*latM], [8,44+5*latM]
  ]]];
  const rings = geometry.normalizeIntersectionRings(clippedResult);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], rings[0].at(-1));
});

test('a linear passage splits rows and therefore creates extra head posts', () => {
  assert.equal(typeof geometry.corridorPolygonFromLine, 'function');
  const passage = geometry.corridorPolygonFromLine([8,44+10*latM], [8+20*lonM,44+10*latM], 1.5);
  const full = calculateProject({ polygon:square20m, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5 });
  const cut = calculateProject({ polygon:square20m, exclusions:[passage], rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5 });
  assert.ok(cut.rowCount > full.rowCount, `full=${full.rowCount} cut=${cut.rowCount}`);
  assert.ok(cut.headPosts > full.headPosts, `full=${full.headPosts} cut=${cut.headPosts}`);
});

test('map UI exposes recenter and 1.50 m linear-passage controls', () => {
  assert.match(html, /id="center-field-button"/);
  assert.match(html, /id="exclude-line-button"/);
  assert.match(html, /1,50 m/);
  assert.match(app, /center-field-button/);
  assert.match(app, /beginLinearExclusionDraw/);
});

test('all fields keep their labels and row simulations visible at the same time', () => {
  assert.match(map, /other-project-rows/);
  assert.match(map, /activeFieldLabel/);
  assert.match(map, /interiorLabelPoint/);
  assert.match(app, /rows:metrics\.rows/);
  assert.match(css, /\.field-label-marker/);
});

test('side measurement labels stay scoped to the active committed geometry', () => {
  assert.match(map, /updateSideMeasurements\(committedGeometry\)/);
  assert.doesNotMatch(map, /sideMeasurements\(field\?\.geometry\)/);
});

test('area exclusion closure clips against the field instead of requiring every point to be inside', () => {
  assert.doesNotMatch(map, /deve rimanere interamente dentro il campo/);
  assert.match(map, /polygonIntersection/);
  assert.match(map, /normalizeIntersectionRings/);
});
