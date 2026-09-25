import test from 'node:test';
import assert from 'node:assert/strict';
import { adviseProject } from '../src/project-advisor.js';

test('mechanized harvest asks for headland information instead of inventing a universal dimension', () => {
  const advice = adviseProject({ mechanizedHarvest:true, headlandWidthM:null, rowSpacingM:2.5, plantSpacingM:1 });
  assert.ok(advice.some((item) => item.code === 'mechanization_headland_missing'));
  assert.equal(advice.some((item) => /8 m|10 m|12 m/.test(item.message)), false);
});

test('advisor flags missing planting geometry only when needed', () => {
  const incomplete = adviseProject({ mechanizedHarvest:false, rowSpacingM:null, plantSpacingM:1 });
  assert.ok(incomplete.some((item) => item.code === 'spacing_incomplete'));
  const complete = adviseProject({ mechanizedHarvest:false, rowSpacingM:2.5, plantSpacingM:1 });
  assert.equal(complete.some((item) => item.code === 'spacing_incomplete'), false);
});
