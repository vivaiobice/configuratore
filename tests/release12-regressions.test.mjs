import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('release assets are cache-busted and header uses the V13 supplied logo', () => {
  assert.match(html, /styles\.css\?v=18/);
  assert.match(html, /src\/app\.js\?v=53\.1/);
  assert.match(html, /brand-logo[^>]+logo-vivai-obice-v14\.png\?v=14/);
});

test('Nuovo Impianto is enforced as title case at runtime', () => {
  assert.match(html, /<option value="new_planting">Nuovo Impianto<\/option>/);
  assert.match(app, /new_planting[^\n]+textContent\s*=\s*['"]Nuovo Impianto['"]/);
});

test('mechanized harvest normalizes headland on the checkbox input event', () => {
  assert.match(app, /mechanized'\)\?\.addEventListener\('input'/);
  assert.match(app, /normalizeHeadlandForMechanization\(state\.project\.headlandWidthM, enabled\)/);
});

test('inactive fields remain visible on the map instead of disappearing', () => {
  assert.match(map, /OTHER_FIELDS_SOURCE_ID/);
  assert.match(map, /function setOtherFields\(/);
  assert.match(app, /setOtherFields\(otherFields\)/);
});

test('exclusion drawing always exposes an explicit close control while active', () => {
  assert.match(app, /closeButton\.hidden\s*=\s*!active/);
  assert.match(app, /closeButton\.disabled\s*=\s*!canClose/);
  assert.match(app, /Chiudi esclusione/);
});

test('rotation arrow bindings use left counter-clockwise and right clockwise', () => {
  assert.match(app, /rotate-left'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(-15\)\)/);
  assert.match(app, /rotate-right'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(15\)\)/);
});

test('map watermark is intentionally more visible and includes a repeated anti-screenshot layer', () => {
  assert.match(html, /class="map-watermark-layer"/);
  assert.match(css, /\.map-watermark\{[^}]*opacity:\.2/);
  assert.match(css, /\.map-watermark-layer\{[^}]*background-image:/);
});
