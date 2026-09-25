import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, summarizeProjects, expandProjectFields, buildAdminProjects, buildAdminClients, summarizeAdministration, filterAdminRows } from '../admin/admin-model.js';

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

test('admin map expands every saved field plan and falls back to legacy project geometry', async () => {
  const { projectsToFeatureCollection } = await import('../admin/admin-model.js');
  const fc=projectsToFeatureCollection([
    {id:'modern',name:'Impianto',field_plans:[
      {id:'f1',label:'Nord',geometry:[[8,44],[8.01,44],[8,44.01],[8,44]]},
      {id:'f2',label:'Sud',geometry:[[8.02,44],[8.03,44],[8.02,44.01],[8.02,44]]}
    ]},
    {id:'legacy',geometry:{type:'Polygon',coordinates:[[[9,45],[9.01,45],[9,45.01],[9,45]]]}}
  ]);
  assert.equal(fc.features.length,3);
  assert.deepEqual(fc.features.filter((feature)=>feature.properties.projectId==='modern').map((feature)=>feature.properties.fieldLabel),['Nord','Sud']);
  assert.equal(fc.features.find((feature)=>feature.properties.projectId==='legacy').properties.fieldLabel,'Campo');
});

test('admin filters projects by the selected registered owner',()=>{
 const rows=[{id:'a',owner_user_id:'u1'},{id:'b',owner_user_id:'u2'}];
 assert.deepEqual(filterProjects(rows,{ownerUserId:'u2'}).map((row)=>row.id),['b']);
});

test('filterProjects can restrict projects by creation date range', () => {
  const dated = [
    { id:'old', created_at:'2026-08-01T10:00:00Z' },
    { id:'mid', created_at:'2026-09-10T10:00:00Z' },
    { id:'new', created_at:'2026-10-01T10:00:00Z' }
  ];
  assert.deepEqual(filterProjects(dated, { createdFrom:'2026-09-01', createdTo:'2026-09-30' }).map((p) => p.id), ['mid']);
});

test('archive filters distinguish Guest, user, campaign and origin', () => {
  const rows = [
    { id:'1', owner_kind:'guest', campaign_year:2026, origin:'native', deleted_at:null },
    { id:'2', owner_kind:'user', campaign_year:2025, origin:'fieldarea', deleted_at:null }
  ];
  assert.deepEqual(filterProjects(rows,{ ownerKind:'guest' }).map((x) => x.id), ['1']);
  assert.deepEqual(filterProjects(rows,{ campaignYear:'2025', origin:'fieldarea' }).map((x) => x.id), ['2']);
});

test('deleted projects stay hidden unless explicitly requested', () => {
  const rows = [{ id:'1', deleted_at:null },{ id:'2', deleted_at:'2026-09-21T00:00:00Z' }];
  assert.deepEqual(filterProjects(rows,{}).map((x) => x.id), ['1']);
  assert.equal(filterProjects(rows,{ includeDeleted:true }).length, 2);
});

test('archive KPI summary groups ownership, provenance and area', () => {
  const summary=summarizeProjects([
    {owner_kind:'guest',origin:'native',gross_area_m2:100},
    {owner_kind:'user',origin:'fieldarea',gross_area_m2:250}
  ]);
  assert.equal(summary.guestProjects,1);
  assert.equal(summary.registeredProjects,1);
  assert.equal(summary.fieldAreaProjects,1);
  assert.equal(summary.totalAreaM2,350);
});

test('admin expands every project field and calculates lifecycle-aware KPIs',()=>{
  const rows=[{id:'p1',name:'Progetto Alba',public_code:'VO-1000001',created_at:'2026-09-01T00:00:00Z',campaign_year:2027,contacts:{company_name:'Azienda A'},field_plans:[
    {id:'same',label:'Nord',plantingStatus:'planned',municipality:'Alba',grapeVariety:'Barbera',cloneSelection:'C1',rootstock:'1103 P',metrics:{areaM2:1000,simulatedPlants:490,commercialPlants25:500}},
    {id:'f2',label:'Sud',plantingStatus:'planted',metrics:{areaM2:2000,simulatedPlants:880,commercialPlants25:900}}
  ]},{id:'p2',name:'Progetto Asti',field_plans:[{id:'same',label:'Est',metrics:{areaM2:300,commercialPlants25:125}}]}];
  const fields=expandProjectFields(rows);
  assert.equal(fields.length,3);
  assert.equal(fields[0].rowId,'p1:same');
  assert.equal(fields[2].rowId,'p2:same');
  assert.equal(fields[0].plantingStatus,'planned');
  assert.equal(fields[2].plantingStatus,'planned');
  assert.equal(fields[0].commercialPlants,500);
  const summary=summarizeAdministration(rows,[]);
  assert.equal(summary.totalFields,3);
  assert.equal(summary.plantsToPlant,625);
  assert.equal(summary.archiveAreaM2,3300);
});

test('legacy project geometry becomes one planned admin field while incomplete fields stay tabular',()=>{
  const fields=expandProjectFields([
    {id:'legacy',geometry:{type:'Polygon',coordinates:[[[8,44],[8.1,44],[8,44.1],[8,44]]]},gross_area_m2:100,commercial_plants_25:50},
    {id:'modern',field_plans:[{id:'empty',label:'Da completare',geometry:null}]}
  ]);
  assert.equal(fields.length,2);
  assert.equal(fields[0].geometryValid,true);
  assert.equal(fields[0].plantingStatus,'planned');
  assert.equal(fields[1].geometryValid,false);
});

test('admin project totals derive from all fields instead of stale top-level values',()=>{
  const projects=buildAdminProjects([{id:'p1',gross_area_m2:1,commercial_plants_25:1,field_plans:[
    {id:'a',metrics:{areaM2:100,commercialPlants25:50}},
    {id:'b',metrics:{areaM2:200,commercialPlants25:75}}
  ],quote_requests:[{id:'q1',quote_number:'PREV-1'}]}]);
  assert.equal(projects[0].fieldCount,2);
  assert.equal(projects[0].areaM2,300);
  assert.equal(projects[0].commercialPlants,125);
  assert.equal(projects[0].quoteNumber,'PREV-1');
});

test('a modern field without metrics does not duplicate stale project totals',()=>{
  const fields=expandProjectFields([{id:'p1',gross_area_m2:9999,commercial_plants_25:9999,field_plans:[
    {id:'a',metrics:{areaM2:100,commercialPlants25:50}},
    {id:'b',geometry:null}
  ]}]);
  assert.equal(fields[1].areaM2,0);
  assert.equal(fields[1].commercialPlants,0);
});

test('admin clients merge owner profile and project contact aggregates',()=>{
  const projects=[{id:'p1',owner_user_id:'u1',contacts:{email:'CLIENTE@EXAMPLE.IT',company_name:'Azienda'},field_plans:[{id:'f1',plantingStatus:'planned',metrics:{areaM2:1000,commercialPlants25:500}}]},
    {id:'p2',owner_user_id:'u1',contacts:{email:'cliente@example.it'},field_plans:[{id:'f2',plantingStatus:'planted',metrics:{areaM2:800,commercialPlants25:300}}]}];
  const clients=buildAdminClients(projects,[{user_id:'u1',display_name:'Mario Rossi',email:'cliente@example.it'}]);
  assert.equal(clients.length,1);
  assert.equal(clients[0].projectCount,2);
  assert.equal(clients[0].fieldCount,2);
  assert.equal(clients[0].areaM2,1800);
  assert.equal(clients[0].plantsToPlant,500);
});

test('cross-section filters match lifecycle, year and free text',()=>{
  const rows=[
    {rowId:'1',searchText:'vo-1 campo nord alba barbera',plantingStatus:'planned',year:2027,areaM2:1000,commercialPlants:500},
    {rowId:'2',searchText:'vo-2 campo sud asti nebbiolo',plantingStatus:'planted',year:2024,areaM2:2000,commercialPlants:900}
  ];
  assert.deepEqual(filterAdminRows(rows,{query:'nord alba',plantingStatus:'planned',yearFrom:2026,yearTo:2028}).map(row=>row.rowId),['1']);
  assert.deepEqual(filterAdminRows(rows,{query:'nebbiolo',minArea:1500,minPlants:800}).map(row=>row.rowId),['2']);
});

test('modern project filters and locality fallbacks use field plans instead of stale project totals',()=>{
 const project={id:'p1',municipality:'Alba',location_label:'Località progetto',gross_area_m2:0,commercial_plants_25:0,field_plans:[
  {id:'f1',locationLabel:'',grapeVariety:'Nebbiolo',rootstock:'1103 P',metrics:{areaM2:2000,commercialPlants25:900}}
 ]};
 assert.equal(expandProjectFields([project])[0].location,'Alba');
 assert.deepEqual(filterProjects([project],{grapeVariety:'nebb',rootstock:'1103',minArea:1500,minPlants:800}).map(row=>row.id),['p1']);
});
