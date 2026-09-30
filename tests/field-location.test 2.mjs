import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFieldReverseGeocodeUrl, normalizeFieldLocation, resolveFieldLocation} from '../src/field-location.js';

const polygon=[[8,44],[8.02,44],[8.02,44.02],[8,44.02],[8,44]];

test('normalizes Esri locality fields into the canonical field shape',()=>{
  assert.deepEqual(normalizeFieldLocation({
    Match_addr:'Via esempio, Comune',City:'Comune',Subregion:'Provincia',Region:'Regione'
  }),{
    locationLabel:'Via esempio, Comune',municipality:'Comune',province:'Provincia',region:'Regione'
  });
  assert.equal(normalizeFieldLocation({Subregion:'Provincia'}),null);
});

test('reverse geocode URL is Italian and uses the supplied point',()=>{
  const url=new URL(buildFieldReverseGeocodeUrl([8.2,44.7]));
  assert.equal(url.searchParams.get('location'),'8.2,44.7');
  assert.equal(url.searchParams.get('langCode'),'it');
  assert.match(url.hostname,/arcgis\.com$/);
});

test('resolves from the polygon interior and skips invalid geometry',async()=>{
  const seen=[];
  const fetchImpl=async url=>{
    seen.push(new URL(url).searchParams.get('location'));
    return {ok:true,json:async()=>({address:{City:'Comune',Subregion:'Provincia',Region:'Regione'}})};
  };
  const valid=await resolveFieldLocation({geometry:polygon},{fetchImpl});
  const invalid=await resolveFieldLocation({geometry:null},{fetchImpl});
  assert.deepEqual(valid,{locationLabel:'Comune',municipality:'Comune',province:'Provincia',region:'Regione'});
  assert.equal(invalid,null);
  assert.equal(seen.length,1);
});

test('network and malformed responses remain non-blocking',async()=>{
  assert.equal(await resolveFieldLocation({geometry:polygon},{fetchImpl:async()=>{throw new Error('offline');}}),null);
  assert.equal(await resolveFieldLocation({geometry:polygon},{fetchImpl:async()=>({ok:true,json:async()=>({address:{}})})}),null);
  assert.equal(await resolveFieldLocation({geometry:polygon},{fetchImpl:async()=>({ok:false})}),null);
});
