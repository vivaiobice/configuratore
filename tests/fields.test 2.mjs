import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultField, ensureProjectFields, updateActiveFieldProject, addProjectField, switchProjectField, removeActiveProjectField } from '../src/fields.js';

test('default field uses 0.90 plant, 2.50 row and 4.50 m post spacing', () => {
  const field = createDefaultField('field-1', 1);
  assert.equal(field.plantSpacingM, 0.9);
  assert.equal(field.rowSpacingM, 2.5);
  assert.equal(field.postSpacingM, 4.5);
  assert.deepEqual(field.exclusions, []);
});

test('field model mirrors active field into legacy project properties', () => {
  const project = ensureProjectFields({ rowSpacingM:2.7, plantSpacingM:0.8, orientationDeg:30, postSpacingM:null });
  assert.equal(project.fields.length, 1);
  assert.equal(project.activeFieldId, project.fields[0].id);
  assert.equal(project.fields[0].rowSpacingM, 2.7);
  assert.equal(project.fields[0].postSpacingM, 4.5);
  const updated = updateActiveFieldProject(project, { orientationDeg:75, headlandWidthM:8 });
  assert.equal(updated.orientationDeg, 75);
  assert.equal(updated.fields[0].orientationDeg, 75);
  assert.equal(updated.fields[0].headlandWidthM, 8);
});

test('adding and switching fields preserves independent planning parameters', () => {
  let project = ensureProjectFields({});
  project = updateActiveFieldProject(project, { orientationDeg:15, headlandWidthM:6 });
  project = addProjectField(project);
  assert.equal(project.fields.length, 2);
  assert.equal(project.orientationDeg, 0);
  project = updateActiveFieldProject(project, { orientationDeg:95, headlandWidthM:10 });
  const firstId = project.fields[0].id;
  project = switchProjectField(project, firstId);
  assert.equal(project.orientationDeg, 15);
  assert.equal(project.headlandWidthM, 6);
});

test('removing active field keeps at least one field and activates a survivor', () => {
  let project = addProjectField(ensureProjectFields({}));
  const removedId = project.activeFieldId;
  project = removeActiveProjectField(project);
  assert.equal(project.fields.length, 1);
  assert.notEqual(project.activeFieldId, removedId);
});

test('adding a second field preserves the first field geometry and exclusions', () => {
  const geometry = [[8,44],[8.01,44],[8.01,44.01],[8,44]];
  const exclusion = { id:'x1', label:'Strada', geometry:[[8.002,44.002],[8.003,44.002],[8.003,44.003],[8.002,44.002]] };
  let project = ensureProjectFields({});
  project = updateActiveFieldProject(project, { geometry, exclusions:[exclusion] });
  const firstId = project.activeFieldId;
  project = addProjectField(project);
  assert.equal(project.fields.length, 2);
  const first = project.fields.find((field) => field.id === firstId);
  assert.deepEqual(first.geometry, geometry);
  assert.deepEqual(first.exclusions, [exclusion]);
  project = switchProjectField(project, firstId);
  assert.deepEqual(project.geometry, geometry);
  assert.deepEqual(project.exclusions, [exclusion]);
});
