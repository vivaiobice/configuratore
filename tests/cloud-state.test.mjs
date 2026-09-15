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
