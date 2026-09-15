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
