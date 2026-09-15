import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeocodeUrl, buildSuggestionUrl, normalizeSuggestionResults, coordinatesFromDrawEvent } from '../src/map-adapters.js';

test('autocomplete suggestions use a provider designed for character-by-character suggest, limited to Italy', () => {
  const url = new URL(buildSuggestionUrl('Santo Ste'));
  assert.equal(url.hostname, 'geocode.arcgis.com');
  assert.match(url.pathname, /\/GeocodeServer\/suggest$/);
  assert.equal(url.searchParams.get('text'), 'Santo Ste');
  assert.equal(url.searchParams.get('countryCode'), 'ITA');
  assert.equal(url.searchParams.get('maxSuggestions'), '5');
  assert.equal(url.searchParams.get('returnCollections'), 'false');
});

test('autocomplete normalization keeps suggestion text and magic key', () => {
  assert.deepEqual(normalizeSuggestionResults({ suggestions:[
    { text:'Santo Stefano Belbo, Cuneo, Piemonte', magicKey:'abc', isCollection:false },
    { text:'', magicKey:'bad', isCollection:false }
  ]}), [{ label:'Santo Stefano Belbo, Cuneo, Piemonte', magicKey:'abc' }]);
});

test('draw event geometry is read directly from the event before falling back to Draw state', () => {
  const coords = [[8,44],[8.01,44],[8.01,44.01],[8,44]];
  const event = { features:[{ geometry:{ type:'Polygon', coordinates:[coords] } }] };
  assert.deepEqual(coordinatesFromDrawEvent(event, []), coords);
  assert.deepEqual(coordinatesFromDrawEvent({}, [{ geometry:{ type:'Polygon', coordinates:[coords] } }]), coords);
});

test('suggested Italian country suffix is removed before sending the query to Nominatim', () => {
  const url = new URL(buildGeocodeUrl('Santo Stefano Belbo, Cuneo, Piemonte, ITA'));
  assert.equal(url.searchParams.get('q'), 'Santo Stefano Belbo, Cuneo, Piemonte');
  assert.deepEqual(normalizeSuggestionResults({ suggestions:[
    { text:'Santo Stefano Belbo, Cuneo, Piemonte, ITA', magicKey:'abc' }
  ]}), [{ label:'Santo Stefano Belbo, Cuneo, Piemonte', magicKey:'abc' }]);
});
