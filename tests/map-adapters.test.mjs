import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeocodeUrl, normalizeGeocodeResults, GEOLOCATION_OPTIONS } from '../src/map-adapters.js';

test('buildGeocodeUrl creates a bounded Nominatim search request', () => {
  const url = new URL(buildGeocodeUrl('Santo Stefano Belbo'));
  assert.equal(url.hostname, 'nominatim.openstreetmap.org');
  assert.equal(url.searchParams.get('q'), 'Santo Stefano Belbo');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('countrycodes'), 'it');
});

test('normalizeGeocodeResults keeps only finite coordinates', () => {
  const results = normalizeGeocodeResults([
    { lon: '8.226', lat: '44.708', display_name: 'Santo Stefano Belbo' },
    { lon: 'x', lat: '44', display_name: 'bad' }
  ]);
  assert.deepEqual(results, [{ lon: 8.226, lat: 44.708, label: 'Santo Stefano Belbo' }]);
});

test('GPS options request fresh high accuracy position without indefinite wait', () => {
  assert.equal(GEOLOCATION_OPTIONS.enableHighAccuracy, true);
  assert.ok(GEOLOCATION_OPTIONS.timeout <= 15000);
  assert.equal(GEOLOCATION_OPTIONS.maximumAge, 0);
});

test('configureDrawForMapLibre remaps Mapbox Draw DOM class names', async () => {
  const { configureDrawForMapLibre } = await import('../src/map-adapters.js');
  const Draw = { constants: { classes: {} } };
  configureDrawForMapLibre(Draw);
  assert.equal(Draw.constants.classes.CANVAS, 'maplibregl-canvas');
  assert.equal(Draw.constants.classes.CONTROL_BASE, 'maplibregl-ctrl');
  assert.equal(Draw.constants.classes.CONTROL_GROUP, 'maplibregl-ctrl-group');
});

test('normalizeGeocodeResults keeps administrative locality metadata for CRM and reports', () => {
  const [result] = normalizeGeocodeResults([{ lon:'8.226', lat:'44.708', display_name:'Santo Stefano Belbo, Cuneo, Piemonte', address:{ town:'Santo Stefano Belbo', county:'Cuneo', state:'Piemonte' } }]);
  assert.equal(result.municipality, 'Santo Stefano Belbo');
  assert.equal(result.province, 'Cuneo');
  assert.equal(result.region, 'Piemonte');
  assert.match(result.locationLabel, /Santo Stefano Belbo/);
});
