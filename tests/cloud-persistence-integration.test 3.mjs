import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const mapSource = await readFile(new URL('../src/map.js',import.meta.url),'utf8');
const indexHtml = await readFile(new URL('../index.html',import.meta.url),'utf8');
const mobileSource = await readFile(new URL('../src/mobile-ui.js',import.meta.url),'utf8');

test('geometry confirmation schedules immediate persistence but pointer movement does not write cloud data', () => {
  assert.match(appSource, /function patchGeometry[\s\S]*projectSync\?\.flush\(\)/);
  assert.doesNotMatch(mapSource, /pointermove[\s\S]{0,300}applyProjectOperation/);
});

test('mobile and desktop Save both create a revision through the shared coordinator', () => {
  assert.match(appSource, /async function saveMobileProject[\s\S]*projectSync\?\.saveRevision/);
  assert.match(appSource, /async function runFinalAction[\s\S]*action === 'save'[\s\S]*projectSync\?\.saveRevision/);
});

test('cloud coordinator uses IndexedDB queue and preserves local persistence on suspension', () => {
  assert.match(appSource, /createIndexedDbSyncAdapter/);
  assert.match(appSource, /createProjectSync/);
  assert.match(appSource, /visibilitychange[\s\S]*persist\(\)/);
});

test('Fase A adds no Profile or public import button to either shell', () => {
  assert.doesNotMatch(indexHtml, />\s*Profilo\s*</i);
  assert.doesNotMatch(mobileSource, /Importa campo/i);
});
