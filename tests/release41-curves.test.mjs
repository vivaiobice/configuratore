import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {APP_CONFIG} from '../src/config.js';
import {mountReleaseVersion} from '../src/release-version.js';
import {releaseQuery} from './helpers/release-query.mjs';
import { normalizeOrientationDeg,formatOrientationDeg } from '../src/orientation.js';

const root=new URL('../',import.meta.url);
const [html,app,mobile]=await Promise.all([
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('src/mobile-ui.js',root),'utf8')
]);

test('orientation supports manual decimal degrees and clamps invalid values',()=>{
  assert.equal(normalizeOrientationDeg('42,7'),42.7);
  assert.equal(normalizeOrientationDeg(-5),0);
  assert.equal(normalizeOrientationDeg(180),179.9);
  assert.equal(formatOrientationDeg(42), '42,0');
  assert.equal(formatOrientationDeg(42.75), '42,8');
});

test('current shell exposes precise orientation and multi-point curves in the shared refinement tree',()=>{
  const {document}=parseHTML(html),badge=document.querySelector('[data-release-version]');assert.ok(badge);
  mountReleaseVersion({document});assert.equal(badge.textContent,`${APP_CONFIG.version} · ${APP_CONFIG.environment}`);
  assert.match(html,releaseQuery('mobile.css'));
  assert.match(html,/manifest\.webmanifest\?v=45/);
  assert.match(html,/id="orientation"[^>]*max="179\.9"[^>]*step="0\.1"/);
  assert.match(html,/id="orientation-output"[^>]*inputmode="decimal"/);
  for(const id of ['curve-add-button','curve-edit-button','curve-reset-button','curve-points-list'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/rowCurvePoints/);
  assert.match(app,/normalizeOrientationDeg/);
  assert.ok(document.querySelector('.advanced [data-refinement="curve"] .row-curve-controls'));
  assert.match(mobile,/id="mobile-refinement-controls"/);
  assert.match(mobile,/move\(advanced,editorHost\)/,'mobile editor moves the complete original refinement tree');
});

test('material request example is generic and contains no correspondence-derived combination',()=>{
  assert.match(html,/placeholder="es\. varietà, clone, portainnesto o altre caratteristiche richieste"/);
  assert.doesNotMatch(html,/Pinot Bianco su 420A/i);
});
