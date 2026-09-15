import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const state = fs.readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');
const gestures = fs.readFileSync(new URL('../src/map-gestures.js', import.meta.url), 'utf8');

test('manual perimeter creation no longer enters Mapbox Draw polygon mode', () => {
  assert.doesNotMatch(map, /draw\.changeMode\(['"]draw_polygon['"]\)/);
  assert.match(map, /manualDrawing/);
  assert.match(map, /finishManualPolygon/);
  assert.match(map, /map\.on\(['"]click['"]/);
});

test('summary is the single results/action area and contains save, PDF, quote and disclaimer', () => {
  assert.doesNotMatch(html, /<section class="results"/);
  assert.doesNotMatch(html, /class="project-actions"/);
  assert.match(html, /id="map-summary"/);
  assert.match(html, /id="summary-save-project"/);
  assert.match(html, /id="summary-open-report"/);
  assert.match(html, /id="summary-request-quote"/);
  assert.match(html, /class="summary-disclaimer"/);
  assert.doesNotMatch(html, /id="save-project"/);
  assert.doesNotMatch(html, /id="open-report"/);
  assert.doesNotMatch(html, /id="request-quote"/);
  assert.match(app, /summary-open-report/);
  assert.match(app, /summary-request-quote/);
});

test('rootstock and clone are selects and project framing defaults to new planting', () => {
  assert.match(html, /<select id="rootstock"/);
  assert.match(html, /<select id="clone-selection"/);
  assert.doesNotMatch(html, /<input id="rootstock"/);
  assert.doesNotMatch(html, /<input id="clone-selection"/);
  assert.match(html, /<option value="new_planting">NUOVO IMPIANTO<\/option>/);
  assert.doesNotMatch(html, /Nessuno \/ da definire/);
  assert.match(state, /projectContextType:\s*'new_planting'/);
});

test('rotation uses simple arrow controls plus keyboard-modified trackpad fallback', () => {
  assert.doesNotMatch(html, /id="rotation-drag-handle"/);
  assert.doesNotMatch(app, /rotation-drag-handle|rotationDragHandle/);
  assert.match(html, /id="rotate-left"/);
  assert.match(html, /id="rotate-right"/);
  assert.match(gestures, /event\?\.(?:shiftKey|altKey)/);
  assert.match(gestures, /deltaY/);
});

test('desktop summary is a sticky panel footer, while mobile summary is static and non-overlapping', () => {
  assert.match(css, /\.map-summary\{[^}]*position:sticky[^}]*bottom:0/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*\.map-summary\{[^}]*position:static/);
});

test('side measurements rely only on HTML markers and do not add a glyph-dependent text layer', () => {
  assert.doesNotMatch(map, /SIDE_MEASUREMENTS_LAYER_ID/);
  assert.doesNotMatch(map, /'text-field':\s*\['get',\s*'label'\]/);
  assert.match(map, /side-measurement-label/);
});
