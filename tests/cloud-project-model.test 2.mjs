import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_SNAPSHOT_VERSION,
  ensureCloudIdentity,
  buildCloudSnapshot,
  snapshotToProjectRow,
  snapshotToFieldRows
} from '../src/cloud-project-model.js';

const polygon = [[8,44],[8.01,44],[8,44.01],[8,44]];

test('cloud identity is stable and reuses the V29 local project id', () => {
  const first = ensureCloudIdentity({ project:{ localProjectId:'legacy-1', fields:[] } }, () => 'new-id');
  const second = ensureCloudIdentity(first, () => 'different-id');
  assert.equal(first.cloud.clientProjectId, 'legacy-1');
  assert.equal(second.cloud.clientProjectId, 'legacy-1');
  assert.equal(second.project.localProjectId, 'legacy-1');
});

test('cloud identity creates the same missing project id in project and cloud state', () => {
  const state = ensureCloudIdentity({ project:{ fields:[] } }, () => 'generated-id');
  assert.equal(state.cloud.clientProjectId, 'generated-id');
  assert.equal(state.project.localProjectId, 'generated-id');
  assert.equal(state.cloud.version, 0);
});

test('snapshot keeps incomplete fields but marks only valid polygons as cloud ready', () => {
  const snapshot = buildCloudSnapshot({ environment:'TEST', project:{
    localProjectId:'p1', localProjectName:'Impianto 2026', campaignYear:2026,
    fields:[
      { id:'f1', label:'Barbera', geometry:polygon, exclusions:[], orientationDeg:45 },
      { id:'f2', label:'Campo 2', geometry:null, exclusions:[] }
    ]
  }}, (field) => field.id === 'f1' ? { areaM2:1000, netAreaM2:900, simulatedPlants:400, totalPosts:90, headPosts:20 } : {});
  assert.equal(snapshot.schemaVersion, CLOUD_SNAPSHOT_VERSION);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.fields.length, 2);
  assert.equal(snapshot.fields[0].cloudReady, true);
  assert.equal(snapshot.fields[1].cloudReady, false);
  assert.equal(snapshot.fields[0].metrics.areaM2, 1000);
});

test('snapshot rejects invalid campaign years and falls back to the supplied clock', () => {
  const snapshot = buildCloudSnapshot({ environment:'TEST', project:{
    localProjectId:'p1', campaignYear:1900, fields:[]
  }}, () => ({}), { now:() => new Date('2026-09-21T00:00:00Z') });
  assert.equal(snapshot.campaignYear, 2026);
});

test('normalized rows preserve campaign, origin, ownership and field KPIs', () => {
  const snapshot = buildCloudSnapshot({ environment:'TEST', project:{
    localProjectId:'p1', localProjectName:'Impianto 2026', campaignYear:2026, origin:'native',
    fields:[{ id:'f1', label:'Barbera', geometry:polygon, exclusions:[], plantSpacingM:0.9, rowSpacingM:2.5 }]
  }}, () => ({ areaM2:1000, netAreaM2:900, simulatedPlants:400, totalPosts:90, headPosts:20 }));
  const project = snapshotToProjectRow(snapshot, 'user-1', 'session-1', 'guest');
  const fields = snapshotToFieldRows(snapshot, 'project-1', 'user-1');
  assert.equal(project.campaign_year, 2026);
  assert.equal(project.origin, 'native');
  assert.equal(project.owner_user_id, 'user-1');
  assert.equal(project.owner_kind, 'guest');
  assert.equal(fields[0].project_id, 'project-1');
  assert.equal(fields[0].gross_area_m2, 1000);
  assert.equal(fields[0].client_field_id, 'f1');
  assert.equal(fields[0].design_data.rowSpacingM, 2.5);
});

test('field rows keep incomplete fields without emitting invalid geometry', () => {
  const snapshot = buildCloudSnapshot({ project:{ localProjectId:'p1', fields:[{ id:'f1', label:'Campo 1', geometry:null }] } }, () => ({}));
  const [row] = snapshotToFieldRows(snapshot, 'project-1', 'user-1');
  assert.equal(row.geometry, null);
  assert.equal(row.gross_area_m2, 0);
});
