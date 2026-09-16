import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('manual rotation arrows match perceived map rotation direction', () => {
  assert.match(app, /rotate-left'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(-15\)\)/);
  assert.match(app, /rotate-right'\)\?\.addEventListener\('click', \(\) => mapApi\?\.rotateBy\(15\)\)/);
});

test('floating summary disclaimer uses a smaller compact font', () => {
  assert.match(css, /\.summary-disclaimer\{[^}]*font-size:7px/);
});
