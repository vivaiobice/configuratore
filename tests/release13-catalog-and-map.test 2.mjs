import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const map = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

import {
  OTHER_MATERIAL_VALUE,
  STANDARD_CLONE,
  listVarieties,
  listClonesForVariety,
  listRootstocksForSelection,
  isOtherMaterialSelection
} from '../src/plant-catalog.js';
import { createDefaultField, renameActiveProjectField } from '../src/fields.js';
import { removeClosedRingVertex } from '../src/map-adapters.js';
import { projectToPdfModel } from '../src/pdf-model.js';

test('real Vivai Obice catalog exposes produced varieties and Other as a separate choice', () => {
  const varieties = listVarieties();
  assert.ok(varieties.includes('Moscato Bianco B.'));
  assert.ok(varieties.includes('Nebbiolo N.'));
  assert.ok(varieties.includes('Michele Palieri N.'));
  assert.ok(!varieties.includes('Pinot Bianco B.'));
  assert.equal(OTHER_MATERIAL_VALUE, 'Altro');
});

test('missing scion clone is presented as Standard and clones depend on variety', () => {
  assert.equal(STANDARD_CLONE, 'Standard');
  assert.deepEqual(listClonesForVariety('Viognier B.'), ['Standard']);
  assert.ok(listClonesForVariety('Nebbiolo N.').includes('I - CVT 71 (Michet)'));
  assert.ok(!listClonesForVariety('Nebbiolo N.').includes('I - CVT 14'));
});

test('rootstock proposals depend on variety and clone while Other remains possible in UI', () => {
  assert.deepEqual(listRootstocksForSelection('Favorita B.', 'I - CVT 14'), ['Kober 5 BB', '775 Paulsen', '1103 Paulsen']);
  assert.deepEqual(listRootstocksForSelection('Sauvignon B.', 'I - Enotria 565'), ['775 Paulsen']);
  assert.ok(listRootstocksForSelection('Moscato Bianco B.', 'Standard').includes('157.11 C.'));
  assert.equal(isOtherMaterialSelection(OTHER_MATERIAL_VALUE), true);
});

test('field state persists free-text material request and can be renamed', () => {
  const field = createDefaultField('field-1', 1);
  assert.equal(field.materialRequestNote, '');
  const project = { fields:[field], activeFieldId:'field-1' };
  const renamed = renameActiveProjectField(project, 'Vigneto Cascina');
  assert.equal(renamed.fields[0].label, 'Vigneto Cascina');
});


test('special material request is carried into the proposal model for verification', () => {
  const model = projectToPdfModel({
    state:{ environment:'TEST', project:{ grapeVariety:'Altro', cloneSelection:'Altro', rootstock:'Altro', materialRequestNote:'Pinot Bianco su 420A' } },
    metrics:{}
  });
  assert.equal(model.plantMaterial.requestNote, 'Pinot Bianco su 420A');
  assert.equal(model.plantMaterial.requiresVerification, true);
});

test('material UI is data-driven and exposes Other request plus field rename control', () => {
  assert.match(html, /id="field-name"/);
  assert.match(html, /id="material-request-note"/);
  assert.match(html, /Richiesta particolare \/ materiale desiderato/);
  assert.match(app, /renderMaterialSelectors/);
  assert.match(app, /renameActiveProjectField/);
  assert.match(app, /materialRequestNote/);
});


test('special material request reaches quote workflow and admin project detail', () => {
  const adminService = fs.readFileSync(new URL('../admin/admin-service.js', import.meta.url), 'utf8');
  const adminApp = fs.readFileSync(new URL('../admin/admin.js', import.meta.url), 'utf8');
  assert.match(app, /materialRequestNote[\s\S]*requestQuote/);
  assert.match(adminService, /field_plans/);
  assert.match(adminService, /active_field_id/);
  assert.match(adminApp, /Richiesta materiale/);
});

test('closed polygon vertex removal preserves closure and minimum polygon shape', () => {
  const ring = [[0,0],[2,0],[2,2],[0,2],[0,0]];
  assert.deepEqual(removeClosedRingVertex(ring, 1), [[0,0],[2,2],[0,2],[0,0]]);
  assert.equal(removeClosedRingVertex([[0,0],[1,0],[0,1],[0,0]], 1), null);
});

test('map keeps all fields visibly distinct and supports direct HTML vertex removal markers', () => {
  assert.match(map, /field-label-marker/);
  assert.match(map, /vertex-removal-marker/);
  assert.match(map, /vertexRemovalMarkers/);
  assert.doesNotMatch(map, /map\.once\('click',[\s\S]*bestDistance > 32/);
  assert.match(css, /\.field-label-marker/);
  assert.match(css, /\.vertex-removal-marker/);
});

test('exclusion drawing explicitly suspends Draw editing and uses the same manual close path', () => {
  assert.match(map, /suspendDrawEditing/);
  assert.match(map, /manualMode = 'exclusion'/);
  assert.match(map, /finishManualPolygon/);
  assert.match(css, /\.manual-close-vertex[^{]*\{[^}]*touch-action:manipulation/s);
});

test('only the subtle repeated watermark remains, without a strong central watermark image', () => {
  assert.match(html, /class="map-watermark-layer"/);
  assert.doesNotMatch(html, /class="map-watermark"/);
});
