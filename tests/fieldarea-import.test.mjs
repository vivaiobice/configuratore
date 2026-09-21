import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeFieldAreaGeoJson } from '../src/fieldarea-import.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/fieldarea-single-polygon.geojson',import.meta.url),'utf8'));
const options={sourceFileName:'campi.geojson',importedAt:'2026-09-21T00:00:00Z'};

test('FieldArea GeoJSON becomes migration-ready fields with provenance', async()=>{
 const result=await normalizeFieldAreaGeoJson(fixture,options);
 assert.equal(result.fields[0].label,'Campo storico 1');
 assert.equal(result.fields[0].origin,'fieldarea');
 assert.equal(result.fields[0].status,'imported_incomplete');
 assert.equal(result.fields[0].cloudReady,true);
 assert.equal(result.revisionReason,'migration');
 assert.equal(result.sourceFileName,'campi.geojson');
 assert.match(result.sourceFingerprint,/^[a-f0-9]{64}$/);
});

test('Polygon geometry and MultiPolygon parts are accepted with deterministic suffixes',async()=>{
 const input={type:'Feature',properties:{name:'Collina'},geometry:{type:'MultiPolygon',coordinates:[
  [[[8,44],[8.01,44],[8,44.01],[8,44]]],
  [[[8.02,44],[8.03,44],[8.02,44.01],[8.02,44]]]
 ]}};
 const result=await normalizeFieldAreaGeoJson(input,options);
 assert.deepEqual(result.fields.map((field)=>field.label),['Collina · 1','Collina · 2']);
});

test('non geographic, unclosed or self-intersecting geometry is rejected with field index',async()=>{
 const invalid={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[
  [[8,44],[8.01,44.01],[8.01,44],[8,44.01],[8,44]]
 ]}}]};
 await assert.rejects(()=>normalizeFieldAreaGeoJson(invalid,options),/feature 1.*geometry/i);
 const unclosed=structuredClone(fixture); unclosed.features[0].geometry.coordinates[0].pop();
 await assert.rejects(()=>normalizeFieldAreaGeoJson(unclosed,options),/feature 1.*geometry/i);
});

test('same source content yields the same fingerprint',async()=>{
 const a=await normalizeFieldAreaGeoJson(fixture,options);
 const b=await normalizeFieldAreaGeoJson(structuredClone(fixture),options);
 assert.equal(a.sourceFingerprint,b.sourceFingerprint);
});
