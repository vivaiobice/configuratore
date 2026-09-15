import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, summarizeProjects } from '../admin/admin-model.js';

const projects = [
  { id:'1', environment:'TEST', status:'draft', company_name:'Azienda A', municipality:'Alba', province:'Cuneo', grape_variety:'Barbera', rootstock:'Kober 5BB', project_context_type:'tender', commercial_plants_25:2500, gross_area_m2:6000, quote_requested:false },
  { id:'2', environment:'TEST', status:'quote_requested', company_name:'Azienda B', municipality:'Santo Stefano Belbo', province:'Cuneo', grape_variety:'Nebbiolo', rootstock:'1103 P', project_context_type:'contribution', commercial_plants_25:7200, gross_area_m2:18000, quote_requested:true },
  { id:'3', environment:'LIVE', status:'client', company_name:'Azienda C', municipality:'Asti', province:'Asti', grape_variety:'Barbera', rootstock:'1103 P', project_context_type:'', commercial_plants_25:10000, gross_area_m2:24000, quote_requested:true }
];

test('filterProjects applies environment, status, variety, company and plant thresholds', () => {
  assert.deepEqual(filterProjects(projects, { environment:'TEST', minPlants:5000 }).map(p => p.id), ['2']);
  assert.deepEqual(filterProjects(projects, { grapeVariety:'Barbera', company:'azienda c' }).map(p => p.id), ['3']);
  assert.deepEqual(filterProjects(projects, { status:'quote_requested' }).map(p => p.id), ['2']);
  assert.deepEqual(filterProjects(projects, { zone:'santo stefano', rootstock:'1103', contextType:'contribution', minArea:10000 }).map(p => p.id), ['2']);
});

test('summarizeProjects separates projects, quote requests and clients', () => {
  const summary = summarizeProjects(projects);
  assert.equal(summary.totalProjects, 3);
  assert.equal(summary.quoteRequests, 2);
  assert.equal(summary.clients, 1);
  assert.equal(summary.totalPlants, 19700);
});

test('isAdminUser accepts only permanent users with app_metadata admin role', async () => {
  const { isAdminUser } = await import('../admin/admin-model.js');
  assert.equal(isAdminUser({ is_anonymous:false, app_metadata:{ role:'admin' } }), true);
  assert.equal(isAdminUser({ is_anonymous:true, app_metadata:{ role:'admin' } }), false);
  assert.equal(isAdminUser({ is_anonymous:false, app_metadata:{ role:'user' } }), false);
  assert.equal(isAdminUser(null), false);
});

test('isValidProjectStatus only accepts the configured CRM pipeline states', async () => {
  const { isValidProjectStatus } = await import('../admin/admin-model.js');
  for (const status of ['draft','saved','pdf_downloaded','quote_requested','contacted','client']) assert.equal(isValidProjectStatus(status), true);
  assert.equal(isValidProjectStatus('admin'), false);
  assert.equal(isValidProjectStatus(''), false);
});

test('projectsToFeatureCollection exposes only valid project polygons for the admin map', async () => {
  const { projectsToFeatureCollection } = await import('../admin/admin-model.js');
  const fc = projectsToFeatureCollection([
    { id:'p1', public_code:'VO-1', status:'saved', company_name:'Azienda A', geometry:{ type:'Polygon', coordinates:[[[8,44],[8.01,44],[8,44.01],[8,44]]] } },
    { id:'p2', geometry:null }
  ]);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 1);
  assert.equal(fc.features[0].properties.projectId, 'p1');
  assert.equal(fc.features[0].properties.company, 'Azienda A');
});

test('filterProjects can restrict projects by creation date range', () => {
  const dated = [
    { id:'old', created_at:'2026-08-01T10:00:00Z' },
    { id:'mid', created_at:'2026-09-10T10:00:00Z' },
    { id:'new', created_at:'2026-10-01T10:00:00Z' }
  ];
  assert.deepEqual(filterProjects(dated, { createdFrom:'2026-09-01', createdTo:'2026-09-30' }).map((p) => p.id), ['mid']);
});
