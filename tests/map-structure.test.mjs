import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSource = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('map renders per-side measurement labels with HTML markers from the editable polygon', () => {
  assert.match(mapSource, /sideMeasurements/);
  assert.match(mapSource, /sideMeasurementMarkers/);
  assert.match(mapSource, /side-measurement-label/);
  assert.match(mapSource, /new globalThis\.maplibregl\.Marker/);
  assert.doesNotMatch(mapSource, /text-field/);
});

test('new geometry receives automatic orientation until the user manually chooses one', () => {
  assert.match(appSource, /applyGeometryWithSuggestedOrientation/);
  assert.match(appSource, /orientationLocked:\s*true/);
});

test('excluded-zone drawing accepts boundary overlap by clipping to the committed field', () => {
  assert.match(mapSource, /polygonIntersection/);
  assert.match(mapSource, /normalizeIntersectionRings/);
  assert.doesNotMatch(mapSource, /zona da escludere deve rimanere interamente dentro il campo/i);
});

test('main map keeps the geographic reference overlay in sync with satellite visibility',()=>{
  assert.match(mapSource,/satelliteLayers/);
  assert.match(mapSource,/base-satellite-reference/);
  assert.match(mapSource,/setLayoutProperty\(SATELLITE_REFERENCE_ID/);
});
