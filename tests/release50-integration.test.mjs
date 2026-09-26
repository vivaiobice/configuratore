import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const app=fs.readFileSync(new URL('src/app.js',root),'utf8');

test('current shell cache-busts archive, field, map and lifecycle assets',()=>{
 assert.match(html,/AMBIENTE TEST · V52/);
 assert.match(html,/v50-fixes\.css\?v=51/);
 assert.match(html,/v52-cadastre\.css\?v=52/);
 assert.match(html,/desktop-library\.css\?v=51/);
 assert.match(html,/src\/app\.js\?v=52/);
 for(const module of ['state','mobile-ui','map','backend']){
  assert.match(app,new RegExp(`\\./${module}\\.js\\?v=52`));
 }
 for(const module of ['desktop-library-ui','cloud','fields']){
  assert.match(app,new RegExp(`\\./${module}\\.js\\?v=51`));
 }
});

test('current entry points refresh report, shared and administration modules',()=>{
 assert.match(fs.readFileSync(new URL('report.html',root),'utf8'),/src\/report\.js\?v=51/);
 assert.match(fs.readFileSync(new URL('shared-project.html',root),'utf8'),/shared-project-entry\.js\?v=51/);
 assert.match(fs.readFileSync(new URL('admin/index.html',root),'utf8'),/admin\.js\?v=51/);
});
