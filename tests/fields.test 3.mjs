import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultField, ensureProjectFields, updateActiveFieldProject, addProjectField, switchProjectField, removeActiveProjectField, renameActiveProjectField } from '../src/fields.js';
import * as fieldApi from '../src/fields.js';
const autoNameActiveProjectField = project => {
  assert.equal(typeof fieldApi.autoNameActiveProjectField, 'function', 'automatic naming API must exist');
  return fieldApi.autoNameActiveProjectField(project);
};

test('default field uses 0.90 plant, 2.50 row and 4.50 m post spacing', () => {
  const field = createDefaultField('field-1', 1);
  assert.equal(field.plantSpacingM, 0.9);
  assert.equal(field.rowSpacingM, 2.5);
  assert.equal(field.postSpacingM, 4.5);
  assert.deepEqual(field.exclusions, []);
  assert.equal(field.maintainRowEquidistance, true);
  assert.equal(field.plantHeightCm,40);
  assert.equal(field.plantingStatus,'planned');
});

test('field lifecycle accepts planted and normalizes legacy or invalid values to planned',()=>{
  assert.equal(createDefaultField('f1',1,{plantingStatus:'planted'}).plantingStatus,'planted');
  assert.equal(createDefaultField('f2',2,{plantingStatus:'invalid'}).plantingStatus,'planned');
  assert.equal(ensureProjectFields({fields:[{id:'f3'}]}).fields[0].plantingStatus,'planned');
  let project=updateActiveFieldProject(ensureProjectFields({}),{plantingStatus:'planted'});
  const first=project.activeFieldId;
  project=addProjectField(project);
  assert.equal(project.plantingStatus,'planned');
  project=switchProjectField(project,first);
  assert.equal(project.plantingStatus,'planted');
});

test('barbatella height persists per field and survives switching',()=>{
  let project=updateActiveFieldProject(ensureProjectFields({}),{plantHeightCm:60});
  const initial=project.activeFieldId;
  project=addProjectField(project);
  assert.equal(project.plantHeightCm,40);
  project=switchProjectField(project,initial);
  assert.equal(project.plantHeightCm,60);
});

test('equidistance preference belongs to each field and survives switching',()=>{
  let project=updateActiveFieldProject(ensureProjectFields({}),{maintainRowEquidistance:false});
  const firstId=project.activeFieldId;
  project=addProjectField(project);
  assert.equal(project.maintainRowEquidistance,true);
  project=switchProjectField(project,firstId);
  assert.equal(project.maintainRowEquidistance,false);
  assert.equal(project.fields[0].maintainRowEquidistance,false);
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

test('curve control points belong to one field and survive active-field mirroring',()=>{
  const points=[{id:'a',position:.3,offsetM:8},{id:'b',position:.7,offsetM:-8}];
  let project=updateActiveFieldProject(ensureProjectFields({}),{rowCurvePoints:points});
  const firstId=project.activeFieldId;
  project=addProjectField(project);
  assert.deepEqual(project.rowCurvePoints,[]);
  project=switchProjectField(project,firstId);
  assert.deepEqual(project.rowCurvePoints,points);
  assert.deepEqual(project.fields[0].rowCurvePoints,points);
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

test('default field name follows variety and rootstock selections', () => {
  let project = ensureProjectFields({ fields:[createDefaultField('f1', 1)], activeFieldId:'f1' });
  project = updateActiveFieldProject(project, { grapeVariety:'Moscato Bianco B.' });
  project = autoNameActiveProjectField(project);
  assert.equal(project.label, 'Moscato Bianco B.');
  project = updateActiveFieldProject(project, { rootstock:'Kober 5 BB' });
  project = autoNameActiveProjectField(project);
  assert.equal(project.label, 'Moscato Bianco B. · Kober 5 BB');
});

test('automatic field name never overwrites a name entered by the user', () => {
  let project = ensureProjectFields({ fields:[createDefaultField('f1', 1)], activeFieldId:'f1' });
  project = renameActiveProjectField(project, 'Collina sud');
  project = updateActiveFieldProject(project, { grapeVariety:'Barbera N.', rootstock:'1103 Paulsen' });
  project = autoNameActiveProjectField(project);
  assert.equal(project.label, 'Collina sud');
  assert.equal(project.labelCustomized, true);
});

test('legacy custom names are protected while Campo N remains automatic', () => {
  const custom = ensureProjectFields({ label:'Vigna vecchia' });
  const automatic = ensureProjectFields({ label:'Campo 3' });
  assert.equal(custom.labelCustomized, true);
  assert.equal(automatic.labelCustomized, false);
});
