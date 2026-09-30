import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('desktop drawing exposes an explicit perimeter close action independent from WebGL hit testing', () => {
  assert.match(html, /id="close-perimeter-button"/);
  assert.match(app, /close-perimeter-button/);
  assert.match(app, /finishDraw\(\)/);
  assert.match(map, /finishDraw:\s*finishManualPolygon/);
});

test('first manual vertex gets an HTML close target once the polygon can be closed', () => {
  assert.match(map, /manualCloseMarker/);
  assert.match(map, /manual-close-vertex/);
  assert.match(map, /finishManualPolygon\(\)/);
  assert.match(css, /\.manual-close-vertex/);
});

test('manual rotation arrows follow their visual direction', () => {
  assert.match(app, /rotate-left'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(-15\)\)/);
  assert.match(app, /rotate-right'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(15\)\)/);
});

test('summary disclaimer is visually subordinate', () => {
  assert.match(css, /\.summary-disclaimer\{[^}]*font-size:7px/);
});
