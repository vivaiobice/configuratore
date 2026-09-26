import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('project editor exposes one informational Catasto toggle and no parcel selection', () => {
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('#cadastre-button').length, 1);
  assert.equal(Boolean(document.querySelector('#cadastre-menu')), false);
  assert.equal(Boolean(document.querySelector('#select-cadastre-button')), false);
  assert.equal(document.querySelector('#cadastre-attribution')?.textContent.trim(), 'Cartografia catastale — Agenzia delle Entrate · CC BY 4.0');
  assert.equal(document.querySelector('#cadastre-notice')?.textContent.trim(), 'Riferimento cartografico informativo. Non sostituisce visura catastale o rilievo dei confini.');
});

test('Catasto toggle updates accessibility and disclosure without opening a menu', async () => {
  const { document } = parseHTML('<button id="cadastre-button" aria-pressed="false"></button><p id="cadastre-attribution" hidden></p><p id="cadastre-notice" hidden></p>');
  const module = await import('../src/desktop-ux.js');
  assert.equal(typeof module.createCadastreToggle, 'function');
  let active = false;
  const toggle = module.createCadastreToggle({ document, isActive:() => active, setActive:value => { active = value; } });
  toggle.mount();
  document.querySelector('#cadastre-button').click();
  assert.equal(active, true);
  assert.equal(document.querySelector('#cadastre-button').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('#cadastre-button').classList.contains('active'), true);
  assert.equal(document.querySelector('#cadastre-attribution').hidden, false);
  assert.equal(document.querySelector('#cadastre-notice').hidden, false);
  document.querySelector('#cadastre-button').click();
  assert.equal(active, false);
  assert.equal(document.querySelector('#cadastre-button').getAttribute('aria-pressed'), 'false');
  assert.equal(document.querySelector('#cadastre-attribution').hidden, true);
});

test('Catasto visibility is absent from new, restored and legacy-normalized project state', async () => {
  const stateModule = await import('../src/state.js');
  const backendModule = await import('../src/backend.js');
  assert.equal(typeof stateModule.normalizeMapState, 'function');
  assert.equal(Object.hasOwn(stateModule.createInitialState().map, 'cadastralVisible'), false);
  assert.deepEqual(stateModule.normalizeMapState({ base:'street', cadastralVisible:true }), { base:'street' });
  assert.equal(Object.hasOwn(backendModule.projectPayloadToState({}).map, 'cadastralVisible'), false);
});

test('application keeps the Catasto toggle in memory and never persists it', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /let cadastralOverlayActive\s*=\s*false/);
  const wiring = source.match(/const cadastreToggle=createCadastreToggle\([\s\S]*?cadastreToggle\.mount\(\);/)?.[0] ?? '';
  assert.ok(wiring);
  assert.doesNotMatch(wiring, /persist\s*\(/);
  assert.doesNotMatch(wiring, /state\.map\?\.cadastralVisible/);
});
