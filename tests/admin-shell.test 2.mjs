import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../admin/admin.js', import.meta.url), 'utf8');

test('admin exposes geographic, area, rootstock and project-context filters', () => {
  for (const id of ['filter-zone','filter-area','filter-rootstock','filter-context']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /zone:\s*\$\('#filter-zone'\)\.value/);
  assert.match(app, /minArea:\s*\$\('#filter-area'\)\.value/);
  assert.match(app, /rootstock:\s*\$\('#filter-rootstock'\)\.value/);
  assert.match(app, /contextType:\s*\$\('#filter-context'\)\.value/);
});
