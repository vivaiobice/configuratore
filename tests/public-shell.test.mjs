import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('public shell exposes project advice without adding a new workflow step', () => {
  assert.match(html, /id="project-advice"/);
  assert.match(app, /from '\.\/project-advisor\.js'/);
  assert.match(app, /adviseProject\(project\)/);
});

test('marketing consent is separate, optional, and persisted from the contact form', () => {
  assert.match(html, /name="marketing"[^>]*type="checkbox"/);
  assert.doesNotMatch(html, /name="marketing"[^>]*required/);
  assert.match(app, /marketingConsent:\s*data\.get\('marketing'\)\s*===\s*'on'/);
});

test('geographic search stores readable locality metadata on the project', () => {
  assert.match(app, /locationLabel:\s*result\.locationLabel/);
  assert.match(app, /municipality:\s*result\.municipality/);
  assert.match(app, /province:\s*result\.province/);
});

test('manual edits of a cadastral perimeter are marked as mixed source', () => {
  assert.match(app, /sourceType\s*===\s*'cadastral'/);
  assert.match(app, /sourceType:\s*'mixed'/);
});

test('V10 exposes multi-field, exclusion, clear field and remove vertex controls', () => {
  assert.match(html, /id="field-select"/);
  assert.match(html, /id="add-field-button"/);
  assert.match(html, /id="remove-field-button"/);
  assert.match(html, /id="exclude-zone-button"/);
  assert.match(html, /id="clear-field-button"/);
  assert.match(html, /id="remove-vertex-button"/);
  assert.match(html, /id="exclusion-list"/);
});

test('header uses cache-busted V13 logo and only the subtle repeated watermark remains', () => {
  assert.match(html, /logo-vivai-obice-v14\.png\?v=14/);
  assert.match(html, /class="map-watermark-layer"/);
  assert.doesNotMatch(html, /class="map-watermark"/);
});

test('post spacing input defaults to 4.50 m and remains editable', () => {
  assert.match(html, /id="post-spacing"[^>]*value="4\.50"/);
});

test('mobile fullscreen map control remains exposed', () => {
  assert.match(html, /id="map-fullscreen-button"/);
});

test('mobile runtime physically places the map immediately after step 01 instead of relying on display contents', () => {
  assert.match(app, /stepOne\.insertAdjacentElement\('afterend', mapWrap\)/);
  assert.match(app, /matchMedia\?\.\('\(max-width: 800px\)'\)/);
});
