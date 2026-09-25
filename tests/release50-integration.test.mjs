import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const app=fs.readFileSync(new URL('src/app.js',root),'utf8');

test('V50 shell cache-busts archive, field, map and lifecycle assets',()=>{
 assert.match(html,/AMBIENTE TEST · V50/);
 assert.match(html,/v50-fixes\.css\?v=50/);
 assert.match(html,/desktop-library\.css\?v=50/);
 assert.match(html,/src\/app\.js\?v=50/);
 for(const module of ['state','mobile-ui','desktop-library-ui','map','backend','cloud','fields']){
  assert.match(app,new RegExp(`\\./${module}\\.js\\?v=50`));
 }
});

test('V50 entry points refresh report, shared and administration modules',()=>{
 assert.match(fs.readFileSync(new URL('report.html',root),'utf8'),/src\/report\.js\?v=50/);
 assert.match(fs.readFileSync(new URL('shared-project.html',root),'utf8'),/shared-project-entry\.js\?v=50/);
 assert.match(fs.readFileSync(new URL('admin/index.html',root),'utf8'),/admin\.js\?v=50/);
});
