import test from 'node:test';
import assert from 'node:assert/strict';
import { gestureRotationDelta, wheelRotationDelta } from '../src/map-gestures.js';

test('gestureRotationDelta returns incremental trackpad twist rather than cumulative rotation', () => {
  assert.equal(gestureRotationDelta(28, 10), 18);
  assert.equal(gestureRotationDelta(-12, -5), -7);
});

test('wheelRotationDelta rotates with Shift or Alt using either trackpad axis', () => {
  assert.equal(wheelRotationDelta({ shiftKey:true, deltaX:30, deltaY:4 }), 5.4);
  assert.equal(wheelRotationDelta({ shiftKey:false, altKey:false, deltaX:30, deltaY:4 }), 0);
  assert.equal(wheelRotationDelta({ shiftKey:true, deltaX:2, deltaY:30 }), 5.4);
  assert.equal(wheelRotationDelta({ altKey:true, deltaX:-20, deltaY:3 }), -3.6);
});
