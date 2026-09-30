import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateDraftEnvelope, migrateProjectArchive } from '../src/local-migrations.js';

const fixedId = () => 'generated-id';
const fixedNow = () => '2026-09-21T00:00:00.000Z';

test('V29 draft gains cloud identity and campaign without losing project fields', () => {
  const old = { version:1, savedAt:'2026-09-20T00:00:00Z', state:{
    environment:'TEST', project:{ localProjectId:'old-p', fields:[{ id:'f1', label:'Moscato', geometry:null }] }
  }};
  const next = migrateDraftEnvelope(old, fixedId, fixedNow);
  assert.equal(next.version, 2);
  assert.equal(next.state.cloud.clientProjectId, 'old-p');
  assert.equal(next.state.project.fields[0].label, 'Moscato');
  assert.equal(next.state.project.campaignYear, 2026);
  assert.equal(next.state.project.origin, 'native');
});

test('local project survives owner reset and is marked for identity reconciliation', () => {
  const old = { version:1, savedAt:'2026-09-20T00:00:00Z', state:{
    project:{ fields:[{id:'f1',geometry:null}] }, cloud:{ ownerUserId:'old-owner', version:3 }
  }};
  const next = migrateDraftEnvelope(old, fixedId, fixedNow);
  assert.equal(next.state.project.fields.length, 1);
  assert.equal(next.state.cloud.clientProjectId, 'generated-id');
  assert.equal(next.state.cloud.identityReconciliationRequired, true);
});

test('V29 project archive migrates every snapshot without deleting unknown properties', () => {
  const old = { version:1, projects:[{
    id:'p1', name:'Storico', savedAt:'2025-08-01T00:00:00Z', custom:'keep',
    project:{ localProjectId:'p1', fields:[{id:'f1'}] }
  }]};
  const next = migrateProjectArchive(old, fixedId, fixedNow);
  assert.equal(next.version, 2);
  assert.equal(next.projects[0].custom, 'keep');
  assert.equal(next.projects[0].project.campaignYear, 2025);
  assert.equal(next.projects[0].cloud.clientProjectId, 'p1');
});

test('unsupported or malformed envelopes are rejected without mutation', () => {
  const old = { version:99, state:{} };
  assert.throws(() => migrateDraftEnvelope(old, fixedId, fixedNow), /unsupported/i);
  assert.deepEqual(old, { version:99, state:{} });
  assert.throws(() => migrateProjectArchive({version:1,projects:'bad'},fixedId,fixedNow), /archive/i);
});
