import {APP_CONFIG} from '../src/config.js';
import {releaseQuery} from './helpers/release-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('current release retains V51 locality, administrative maps and independent project panels',()=>{
  const pkg=JSON.parse(read('package.json')),home=read('index.html'),admin=read('admin/index.html');
  assert.equal(pkg.version,APP_CONFIG.version);assert.match(home,/1\.0\.2/);assert.match(home,releaseQuery('src/app.js'));assert.match(admin,releaseQuery('admin.js'));
  assert.match(read('admin/admin.js'),/createAdminLocationManager/);assert.match(read('admin/admin-map.js'),/GeolocateControl/);
  assert.match(read('admin/admin-map.js'),/#ffd42a/);assert.match(read('admin/admin-map-data.js'),/calculateProject/);
  assert.match(read('admin/admin-views.js'),/openProjectIds/);assert.match(read('admin/admin-views.js'),/openFieldRowIds/);
  assert.match(read('src/report.js'),releaseQuery('report-preflight.js'));
  assert.match(read('supabase/schema.sql'),/public\.admin_set_field_location/);
  assert.ok(fs.existsSync(new URL('../README_RELEASE_V51.md',import.meta.url)));
});
