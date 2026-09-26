import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeadlandForMechanization } from '../src/project-rules.js';

test('mechanized harvest enforces a minimum 6 m headland', () => {
  assert.equal(normalizeHeadlandForMechanization(null, true), 6);
  assert.equal(normalizeHeadlandForMechanization(4.5, true), 6);
  assert.equal(normalizeHeadlandForMechanization(6, true), 6);
  assert.equal(normalizeHeadlandForMechanization(8, true), 8);
});

test('non mechanized projects keep the user headland value', () => {
  assert.equal(normalizeHeadlandForMechanization(null, false), null);
  assert.equal(normalizeHeadlandForMechanization(4.5, false), 4.5);
});
