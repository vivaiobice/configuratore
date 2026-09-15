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
