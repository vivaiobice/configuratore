import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveIntegrationConfig,buildCountsUrl} from '../src/counts-routes.js';

test('production counts link is disabled until the destination and services are verified',()=>{
  const config=resolveIntegrationConfig('https://progettaimpianto.vivaiobice.com/');
  assert.equal(config.enabled,false);
  assert.equal(config.countsBaseUrl,'https://progettaimpianto.vivaiobice.com/conteggi/');
  assert.throws(()=>buildCountsUrl(config,'resume'),/non disponibile/);
});

test('test routing stays on test origin and only allows known views and identifiers',()=>{
  const config=resolveIntegrationConfig('http://localhost:4173/',{enabled:true});
  assert.equal(buildCountsUrl(config,'new',{projectId:'456ad5aa-2e16-4583-8558-69fbc1655634',fieldId:'field-1'}),
    'http://localhost:4173/conteggi/?integrationVersion=1&view=new&projectId=456ad5aa-2e16-4583-8558-69fbc1655634&fieldId=field-1');
  assert.throws(()=>buildCountsUrl(config,'new',{projectId:'local',fieldId:'field-1'}),/identificativo/i);
  assert.throws(()=>buildCountsUrl(config,'admin',{returnUrl:'https://evil.example/'}),/parametro/i);
  assert.throws(()=>buildCountsUrl(config,'counter',{listId:'bad'}),/identificativo/i);
  assert.throws(()=>buildCountsUrl(config,'unknown'),/vista/i);
});
