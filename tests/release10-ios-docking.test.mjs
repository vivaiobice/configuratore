import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installTrackpadRotation } from '../src/map-gestures.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('iOS keeps pinch zoom enabled but disables accidental touch rotation', () => {
  const eventTypes = [];
  const calls = [];
  const container = {
    addEventListener(type) { eventTypes.push(type); },
    removeEventListener() {}
  };
  const map = {
    getCanvasContainer: () => container,
    dragRotate: { enable() { calls.push('drag-enable'); } },
    touchZoomRotate: {
      enable() { calls.push('touch-enable'); },
      enableRotation() { calls.push('touch-rotation-enable'); },
      disableRotation() { calls.push('touch-rotation-disable'); }
    },
    getBearing: () => 0,
    setBearing() {}
  };

  installTrackpadRotation(map);

  assert.ok(calls.includes('touch-enable'));
  assert.ok(calls.includes('touch-rotation-disable'));
  assert.ok(!calls.includes('touch-rotation-enable'));
  assert.deepEqual(eventTypes, ['wheel']);
});

test('mobile layout exposes panel contents so map can sit between step 01 and step 02', () => {
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.panel\{[^}]*display:contents/);
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.panel-scroll\{[^}]*display:contents/);
  assert.match(css, /\.step\[data-step="1"\]\{[^}]*order:1/);
  assert.match(css, /\.map-wrap\{[^}]*order:2/);
  assert.match(css, /\.step\[data-step="2"\]\{[^}]*order:3/);
});

test('mobile map has an explicit fullscreen mode and exit toggle', () => {
  assert.match(html, /id="map-fullscreen-button"/);
  assert.match(app, /map-fullscreen-button/);
  assert.match(app, /fullscreen-map/);
  assert.match(css, /\.map-wrap\.fullscreen-map\{/);
  assert.match(css, /body\.map-fullscreen-open/);
});

test('obsolete drag-to-rotate control is removed while arrow and north controls remain', () => {
  assert.doesNotMatch(html, /id="rotation-drag-handle"/);
  assert.doesNotMatch(app, /rotationDragHandle|rotation-drag-handle/);
  assert.match(html, /id="rotate-left"/);
  assert.match(html, /id="north-button"/);
  assert.match(html, /id="rotate-right"/);
});

test('project summary lives inside the scrollable sidebar so sticky docking becomes natural at the bottom', () => {
  assert.match(html, /id="project-advice"[\s\S]*?<\/section>\s*<aside id="map-summary"/);
  assert.match(css, /\.map-summary\{[^}]*position:sticky[^}]*bottom:0/);
  assert.doesNotMatch(css, /\.map-summary\{[^}]*bottom:-20px/);
});

test('header uses a light-background logo asset without embedded black panel', () => {
  assert.match(html, /assets\/logo-vivai-obice-lineare\.png/);
  assert.ok(fs.existsSync(new URL('../assets/logo-vivai-obice-lineare.png', import.meta.url)));
});
