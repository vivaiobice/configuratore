import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {APP_CONFIG} from '../src/config.js';
import {resolveIntegrationConfig,buildCountsUrl} from '../src/counts-routes.js';

test('published Configuratore exposes working Conteggi route in the same package',()=>{
  const config=resolveIntegrationConfig('https://progettaimpianto.vivaiobice.com/',{enabled:APP_CONFIG.countsEnabled});
  const url=buildCountsUrl(config,'resume');
  assert.equal(url,'https://progettaimpianto.vivaiobice.com/conteggi/?integrationVersion=1&view=resume');
  assert.equal(existsSync(new URL('../conteggi/index.html',import.meta.url)),true);
  const page=readFileSync(new URL('../conteggi/index.html',import.meta.url),'utf8');
  assert.match(page,/\.\/boot\.js/);
});
