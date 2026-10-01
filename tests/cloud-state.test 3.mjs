import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCloudSnapshot } from '../src/cloud-state.js';

test('mergeCloudSnapshot persists secure resume data without dropping existing cloud fields', () => {
  const state = { project:{ rowSpacingM:2.5 }, cloud:{ projectId:'old', contactId:'c1', extra:'keep' } };
  const next = mergeCloudSnapshot(state, { projectId:'p1', publicCode:'VO-1', resumeToken:'secret', resumeUrl:'https://example.test/?project=VO-1&token=secret' });
  assert.equal(next.cloud.projectId, 'p1');
  assert.equal(next.cloud.contactId, 'c1');
  assert.equal(next.cloud.resumeToken, 'secret');
  assert.equal(next.cloud.extra, 'keep');
});

test('mergeCloudSnapshot persists archive identity and synchronization acknowledgments', () => {
  const next = mergeCloudSnapshot({ cloud:{ extra:'keep' } }, {
    clientProjectId:'client-1', version:4, latestRevisionNumber:2,
    syncState:'synced', lastSyncedAt:'2026-09-21T10:00:00.000Z'
  });
  assert.equal(next.cloud.clientProjectId, 'client-1');
  assert.equal(next.cloud.version, 4);
  assert.equal(next.cloud.latestRevisionNumber, 2);
  assert.equal(next.cloud.syncState, 'synced');
  assert.equal(next.cloud.extra, 'keep');
});
