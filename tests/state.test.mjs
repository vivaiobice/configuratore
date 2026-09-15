import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, mergeProjectState } from '../src/state.js';

test('initial state starts in TEST with empty project geometry', () => {
  const state = createInitialState();
  assert.equal(state.environment, 'TEST');
  assert.equal(state.project.geometry, null);
  assert.equal(state.project.rowSpacingM, 2.5);
  assert.equal(state.project.plantSpacingM, 1);
  assert.equal(state.project.orientationDeg, 0);
  assert.deepEqual(state.project.cadastralRefs, []);
});

test('mergeProjectState updates project without mutating previous state', () => {
  const state = createInitialState();
  const next = mergeProjectState(state, { rowSpacingM: 2.8, grapeVariety: 'Barbera' });
  assert.notEqual(next, state);
  assert.notEqual(next.project, state.project);
  assert.equal(state.project.rowSpacingM, 2.5);
  assert.equal(next.project.rowSpacingM, 2.8);
  assert.equal(next.project.grapeVariety, 'Barbera');
});

test('applyGeometryWithSuggestedOrientation proposes an efficient angle until the user locks orientation', async () => {
  const { applyGeometryWithSuggestedOrientation } = await import('../src/state.js');
  const lonM = 1 / (111320 * Math.cos(44 * Math.PI / 180));
  const latM = 1 / 110540;
  const geometry = [[8,44],[8+30*lonM,44],[8+30*lonM,44+10*latM],[8,44+10*latM],[8,44]];
  const automatic = applyGeometryWithSuggestedOrientation(createInitialState().project, geometry);
  assert.ok(automatic.orientationDeg >= 85 && automatic.orientationDeg <= 95);
  const manual = applyGeometryWithSuggestedOrientation({ ...automatic, orientationDeg:35, orientationLocked:true }, geometry);
  assert.equal(manual.orientationDeg, 35);
});
