import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('current release retains V51 locality, administrative maps and independent project panels',()=>{
  const pkg=JSON.parse(read('package.json')),home=read('index.html'),admin=read('admin/index.html');
  assert.equal(pkg.version,'0.55.1');assert.match(home,/AMBIENTE TEST · V55\.1/);assert.match(home,/src\/app\.js\?v=55\.1/);assert.match(admin,/admin\.js\?v=54/);
  assert.match(read('admin/admin.js'),/createAdminLocationManager/);assert.match(read('admin/admin-map.js'),/GeolocateControl/);
  assert.match(read('admin/admin-map.js'),/#ffd42a/);assert.match(read('admin/admin-map-data.js'),/calculateProject/);
  assert.match(read('admin/admin-views.js'),/openProjectIds/);assert.match(read('admin/admin-views.js'),/openFieldRowIds/);
  assert.match(read('src/report.js'),/report-preflight\.js\?v=51/);
  assert.match(read('supabase/schema.sql'),/public\.admin_set_field_location/);
  assert.ok(fs.existsSync(new URL('../README_RELEASE_V51.md',import.meta.url)));
});
