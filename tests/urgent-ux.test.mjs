import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('header uses the Vivai Obice logo asset instead of the VO placeholder', () => {
  assert.match(html, /class="brand-logo"[^>]+src="\.\/assets\/logo-vivai-obice\.png"/);
  assert.ok(fs.existsSync(new URL('../assets/logo-vivai-obice.png', import.meta.url)));
  assert.doesNotMatch(html, /class="brand-mark">VO</);
});

test('search UI exposes live suggestions and app binds input-driven autocomplete', () => {
  assert.match(html, /id="search-suggestions"/);
  assert.match(app, /search-suggestions/);
  assert.match(app, /mapApi\?\.suggest/);
  assert.match(app, /addEventListener\('input'/);
});

test('map has explicit rotation controls that work independently of mouse gestures', () => {
  assert.match(html, /id="rotate-left"/);
  assert.match(html, /id="north-button"/);
  assert.match(html, /id="rotate-right"/);
  assert.match(map, /function rotateBy\(/);
  assert.match(map, /function resetNorth\(/);
  assert.match(app, /rotate-left/);
  assert.match(app, /rotate-right/);
  assert.match(app, /north-button/);
});

test('polygon drawing uses a pencil cursor and larger click/touch target for reliable closure', () => {
  assert.match(map, /clickBuffer:\s*8/);
  assert.match(map, /touchBuffer:\s*32/);
  assert.match(map, /pencil-cursor/);
  assert.match(map, /circle-radius':\s*7/);
  assert.match(map, /coordinatesFromDrawEvent/);
});

test('satellite source declares its real native max zoom so MapLibre overzooms instead of blanking', () => {
  assert.match(map, /type:\s*'raster'[\s\S]*?World_Imagery[\s\S]*?maxzoom:\s*19/);
});

test('side measurements are forced visible around the edited polygon', () => {
  assert.match(map, /'text-allow-overlap':\s*true/);
  assert.match(map, /'text-ignore-placement':\s*true/);
});

test('desktop map includes an always-visible floating project summary with save action', () => {
  assert.match(html, /id="map-summary"/);
  for (const id of ['summary-area','summary-perimeter','summary-rows','summary-linear','summary-plants','summary-save-project']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(css, /\.map-summary\s*\{/);
  assert.match(app, /summary-save-project/);
});

test('mobile puts step 1 above the map and reduces floating summary to estimated vines only', () => {
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.panel\{[^}]*display:contents/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.step\[data-step="1"\]\{[^}]*order:1/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.map-wrap\{[^}]*order:2/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.map-summary \.summary-secondary\{[^}]*display:none/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?#summary-save-project\{[^}]*display:none/);
});
