import test from 'node:test';
import assert from 'node:assert/strict';

const parser=await import('../src/coordinate-search.js').catch(()=>({}));
const parse=query=>{
 assert.equal(typeof parser.parseCoordinateSearch,'function','coordinate input must be resolved before remote geocoding');
 return parser.parseCoordinateSearch(query);
};

test('DMS search preserves the supplied latitude and longitude without axis reversal',()=>{
 const value=parse(`44°58'20.5"N 7°57'49.3"E`);
 assert.equal(value.kind,'coordinate');
 assert.ok(Math.abs(value.result.lat-44.97236111111111)<1e-12);
 assert.ok(Math.abs(value.result.lon-7.963694444444445)<1e-12);
});

test('hemispheres determine DMS axes and signs regardless of axis order or typography',()=>{
 const value=parse('  7°57′49.3″w, 44°58′20.5″s  ');
 assert.equal(value.kind,'coordinate');
 assert.ok(Math.abs(value.result.lat+44.97236111111111)<1e-12);
 assert.ok(Math.abs(value.result.lon+7.963694444444445)<1e-12);
});

test('decimal input is latitude then longitude and permits exact axis endpoints',()=>{
 for(const [query,lat,lon] of [['44.9723611111, 7.9636944444',44.9723611111,7.9636944444],['-44.5, -7.25',-44.5,-7.25],['+90, -180',90,-180],['0, 0',0,0]]){
  const value=parse(query);assert.equal(value.kind,'coordinate',query);assert.equal(value.result.lat,lat);assert.equal(value.result.lon,lon);
 }
 assert.equal(parse(`90°0'0"N 180°0'0"E`).kind,'coordinate');
});

test('invalid or incomplete coordinate-looking input cannot fall back to address search',()=>{
 for(const query of [
  `44°60'0"N 7°0'0"E`,`44°0'60"N 7°0'0"E`,`90°0'0.1"N 7°0'0"E`,
  `44°0'0"N 180°0'0.1"E`,`44°0'0"N 7°0'0"S`,`44°0'0"E 7°0'0"W`,
  `-44°0'0"N 7°0'0"E`,`44°0'0"N, 7.5`,`44°58'`,`44°0'0"N 7°0'0"E trailing`,
  '91, 7','44, 181','44.97,','44.97','44, 7, 3','44, 7 E','lat: 44, lon: 7'
 ]){const value=parse(query);assert.equal(value.kind,'invalid',query);assert.match(value.message,/coordinate/i);}
});

test('ordinary place names and numbered street addresses retain the address path',()=>{
 for(const query of ['', 'Torino', 'Via Roma 44, Torino', '12 Via Roma', "12 Via dell'Amore", '7 Rue de l’Église', "Sant'Albano Stura", 'Nizza Monferrato'])assert.equal(parse(query).kind,'address',query);
});
