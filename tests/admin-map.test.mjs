import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsForFeatureCollection } from '../admin/admin-map.js';
import fs from 'node:fs';

test('boundsForFeatureCollection encloses every project polygon', () => {
  const bounds = boundsForFeatureCollection({ type:'FeatureCollection', features:[
    { geometry:{ type:'Polygon', coordinates:[[[8,44],[8.1,44],[8.1,44.1],[8,44]]] } },
    { geometry:{ type:'Polygon', coordinates:[[[7.9,43.9],[8,43.9],[8,44],[7.9,43.9]]] } }
  ]});
  assert.deepEqual(bounds, { west:7.9, south:43.9, east:8.1, north:44.1 });
});

test('boundsForFeatureCollection returns null without valid project geometry', () => {
  assert.equal(boundsForFeatureCollection({ type:'FeatureCollection', features:[] }), null);
});

test('admin map uses the shared satellite imagery and geographic label style',()=>{
 const source=fs.readFileSync(new URL('../admin/admin-map.js',import.meta.url),'utf8');
 assert.match(source,/satelliteStyle/);
 assert.doesNotMatch(source,/tile\.openstreetmap\.org/);
});

test('admin map model labels every field with field and project names',async()=>{
 const {projectsToFeatureCollection}=await import('../admin/admin-model.js');
 const fc=projectsToFeatureCollection([{id:'p1',name:'Progetto A',public_code:'VO-1',field_plans:[
  {id:'f1',label:'Campo Nord',geometry:[[8,44],[8.1,44],[8,44.1],[8,44]]}
 ]}]);
 assert.equal(fc.features[0].properties.projectName,'Progetto A');
 assert.equal(fc.features[0].properties.displayLabel,'Campo Nord · Progetto A');
 const source=fs.readFileSync(new URL('../admin/admin-map.js',import.meta.url),'utf8');
 assert.match(source,/project-label/);
 assert.match(source,/displayLabel/);
});

test('admin shell scrolls and links back to the configurator with clickable KPI summaries',()=>{
 const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
 assert.match(html,/body\{overflow:auto/);
 assert.match(html,/href="\.\.\/"[^>]*>[^<]*Torna al configuratore/);
 assert.match(html,/data-kpi="projects"/);
 assert.match(html,/data-kpi="fields"/);
 assert.match(html,/data-kpi="clients"/);
 assert.match(html,/data-admin-section="clients"/);
});
