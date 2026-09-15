import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('project context copy uses title case Nuovo Impianto', () => {
  assert.match(html, /<option value="new_planting">Nuovo Impianto<\/option>/);
  assert.doesNotMatch(html, />NUOVO IMPIANTO</);
});

test('header and watermark use the newly supplied transparent Vivai Obice logo', () => {
  assert.match(html, /brand-logo[^>]+src="\.\/assets\/logo-vivai-obice-lineare\.png"/);
  assert.match(html, /map-watermark[^>]+src="\.\/assets\/logo-vivai-obice-lineare\.png"/);
  assert.match(css, /\.map-watermark\{[^}]*opacity:\.1[2-9]/);
  assert.match(css, /\.map-watermark\{[^}]*filter:[^}]*invert\(1\)/);
});

test('clear field is deterministic and does not depend on a confirm dialog', () => {
  const clearBinding = app.match(/\$\('#clear-field-button'\)[\s\S]*?\n\}/)?.[0] ?? app;
  assert.doesNotMatch(clearBinding, /confirm\?\./);
  assert.match(app, /clear-field-button[\s\S]*?mapApi\?\.clearGeometry\(\)/);
});

test('rotation arrow bindings are inverted to match the visual map direction', () => {
  assert.match(app, /rotate-left'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(15\)\)/);
  assert.match(app, /rotate-right'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(-15\)\)/);
});

test('excluded area copy and sidebar sections are presented as separate cards', () => {
  assert.match(html, /class="exclusion-heading"><strong>Aree escluse<\/strong>\s*<span>/);
  assert.match(css, /\.step,\.advanced\{[^}]*border-radius:/);
  assert.match(css, /\.advanced\{[^}]*padding:0/);
  assert.match(css, /\.exclusion-panel\{[^}]*background:/);
});


test('excluded-zone drawing suspends the editor and restores the committed perimeter', () => {
  const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
  assert.match(map, /function beginExclusionDraw\(\)[\s\S]*?draw\.deleteAll/);
  assert.match(map, /mode === 'exclusion'[\s\S]*?setGeometry\(committedGeometry\)/);
});

test('committed perimeter and side quotes are reasserted after map movement or style refresh', () => {
  const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
  assert.match(map, /function ensureCommittedVisuals\(\)[\s\S]*?updateProjectGeometrySource\(committedGeometry\)[\s\S]*?updateSideMeasurements\(committedGeometry\)/);
  assert.match(map, /map\.on\('moveend',[\s\S]*?ensureCommittedVisuals/);
  assert.match(map, /map\.on\('styledata',\s*ensureCommittedVisuals\)/);
});
