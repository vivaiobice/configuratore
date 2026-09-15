import test from 'node:test';
import assert from 'node:assert/strict';
import { gestureRotationDelta, wheelRotationDelta } from '../src/map-gestures.js';

test('gestureRotationDelta returns incremental trackpad twist rather than cumulative rotation', () => {
  assert.equal(gestureRotationDelta(28, 10), 18);
  assert.equal(gestureRotationDelta(-12, -5), -7);
});

test('wheelRotationDelta rotates for deliberate shift-trackpad horizontal gestures only', () => {
  assert.equal(wheelRotationDelta({ shiftKey:true, deltaX:30, deltaY:4 }), 5.4);
  assert.equal(wheelRotationDelta({ shiftKey:false, deltaX:30, deltaY:4 }), 0);
  assert.equal(wheelRotationDelta({ shiftKey:true, deltaX:2, deltaY:30 }), 0);
});
