import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const state = fs.readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');

test('plant spacing comes before row spacing and defaults are 0.90 m and 2.50 m', () => {
  const plantIndex = html.indexOf('id="plant-spacing"');
  const rowIndex = html.indexOf('id="row-spacing"');
  assert.ok(plantIndex > 0 && rowIndex > 0 && plantIndex < rowIndex);
  assert.match(html, /id="plant-spacing"[^>]*value="0\.90"/);
  assert.match(html, /id="row-spacing"[^>]*value="2\.50"/);
  assert.match(state, /plantSpacingM:\s*0\.9/);
  assert.match(state, /rowSpacingM:\s*2\.5/);
  assert.match(app, /plantSpacingM\s*\?\?\s*0\.9/);
});

test('grape variety is a select and project note uses the same styled control family', () => {
  assert.match(html, /<select id="grape-variety"/);
  assert.doesNotMatch(html, /<input id="grape-variety"/);
  assert.match(html, /id="project-context-note"[^>]*class="control-input"/);
  assert.match(css, /\.control-input/);
});

test('project summary is a fixed footer of the left panel instead of overlaying the map', () => {
  const panelEnd = html.indexOf('</aside>');
  const mapStart = html.indexOf('<section class="map-wrap"');
  const summaryIndex = html.indexOf('id="map-summary"');
  assert.ok(summaryIndex > 0 && summaryIndex < panelEnd && panelEnd < mapStart);
  assert.match(html, /class="panel-scroll"/);
  assert.match(css, /\.panel\{[^}]*display:flex[^}]*overflow:hidden/);
  assert.match(css, /\.panel-scroll\{[^}]*overflow:auto/);
  assert.match(css, /\.map-summary\{[^}]*position:static/);
  assert.doesNotMatch(css, /\.map-summary\{[^}]*position:absolute/);
});

test('logo treatment no longer forces a black background', () => {
  assert.doesNotMatch(css, /\.brand-logo\{[^}]*background:\s*#050505/);
  assert.match(css, /\.brand-logo\{[^}]*background:\s*#fff/);
});

test('map toolbar has its own current-location button wired to geolocation', () => {
  assert.match(html, /id="map-gps-button"/);
  assert.match(app, /map-gps-button/);
  assert.match(app, /mapApi\?\.locate/);
});

test('side lengths use HTML markers so raster-only maps do not depend on glyph configuration', () => {
  assert.match(map, /sideMeasurementMarkers/);
  assert.match(map, /className\s*=\s*['"]side-measurement-label['"]/);
  assert.match(map, /new globalThis\.maplibregl\.Marker\(\{\s*element/);
  assert.match(css, /\.side-measurement-label/);
});

test('map installs trackpad rotation support in addition to MapLibre drag rotation', () => {
  assert.match(map, /installTrackpadRotation/);
  assert.match(map, /dragRotate\.enable\(\)/);
  assert.match(map, /touchZoomRotate\.enableRotation\(\)/);
});
