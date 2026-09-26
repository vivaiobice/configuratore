import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');

test('release 15 cache-busts changed application assets', () => {
  assert.match(html, /styles\.css\?v=18/);
  assert.match(html, /src\/app\.js\?v=53\.2/);
});

test('map toolbar exposes an explicit perimeter vertex editing control', () => {
  assert.match(html, /id="edit-vertices-button"/);
  assert.match(app, /beginVertexEditing/);
  assert.match(app, /finishVertexEditing/);
});

test('map API enters direct vertex selection and can finish editing', () => {
  assert.match(map, /function beginVertexEditing\(\)/);
  assert.match(map, /draggable:true/);
  assert.match(map, /function finishVertexEditing\(\)/);
  assert.match(map, /beginVertexEditing, finishVertexEditing/);
});

test('linear passage exposes an explicit confirmation after two points', () => {
  assert.match(map, /manualMode === 'linear-exclusion'\s*\? manualVertices\.length >= 2/);
  assert.doesNotMatch(app, /closeButton\.hidden = !active \|\| mode === 'linear-exclusion'/);
  assert.match(app, /Conferma passaggio/);
});
