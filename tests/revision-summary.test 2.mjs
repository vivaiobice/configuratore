import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRevisionChanges } from '../src/revision-summary.js';

const ring = [[8,44],[8.01,44],[8,44.01],[8,44]];

test('revision summary identifies material and layout changes per field', () => {
  const before = { name:'Progetto', campaignYear:2026, fields:[{
    clientFieldId:'f1', label:'Campo 1', geometry:ring,
    rowSpacingM:2.5, grapeVariety:'Barbera', exclusions:[]
  }]};
  const after = structuredClone(before);
  after.fields[0].rowSpacingM = 2.7;
  after.fields[0].grapeVariety = 'Nebbiolo';
  assert.deepEqual(summarizeRevisionChanges(before, after), {
    categories:['layout','material'], fieldIds:['f1'], label:'Sesto d’impianto e materiale vegetale'
  });
});

test('first revision is classified without inventing changed categories', () => {
  assert.deepEqual(summarizeRevisionChanges(null, { fields:[{clientFieldId:'f1'}] }), {
    categories:['initial'], fieldIds:['f1'], label:'Prima versione salvata'
  });
});

test('revision summary classifies geometry, exclusions, identity and notes independently', () => {
  const before = { name:'Progetto', campaignYear:2026, fields:[{
    clientFieldId:'f1', label:'Campo 1', geometry:ring, exclusions:[], projectContextNote:''
  }]};
  const after = structuredClone(before);
  after.name='Progetto rinominato';
  after.fields[0].geometry=[[8,44],[8.02,44],[8,44.01],[8,44]];
  after.fields[0].exclusions=[{id:'x1',geometry:ring,type:'area'}];
  after.fields[0].projectContextNote='Nota';
  const summary=summarizeRevisionChanges(before,after);
  assert.deepEqual(summary.categories,['geometry','exclusions','identity','notes']);
  assert.deepEqual(summary.fieldIds,['f1']);
});

test('revision summary is stable for cloned snapshots and tracks removed fields', () => {
  const before={name:'P',campaignYear:2026,fields:[
    {clientFieldId:'f1',label:'Uno',geometry:ring,exclusions:[]},
    {clientFieldId:'f2',label:'Due',geometry:ring,exclusions:[]}
  ]};
  assert.deepEqual(summarizeRevisionChanges(before,structuredClone(before)),{
    categories:[],fieldIds:[],label:'Nessuna modifica rilevata'
  });
  const removed=structuredClone(before);removed.fields.pop();
  assert.deepEqual(summarizeRevisionChanges(before,removed),{
    categories:['geometry'],fieldIds:['f2'],label:'Perimetro e campi'
  });
});

test('curvature changes are recorded as a layout revision',()=>{
  const before={name:'P',campaignYear:2026,fields:[{clientFieldId:'f1',geometry:ring,rowCurvePoints:[]}]};
  const after=structuredClone(before);
  after.fields[0].rowCurvePoints=[{id:'bend',position:.5,offsetM:12}];
  assert.deepEqual(summarizeRevisionChanges(before,after),{
    categories:['layout'],fieldIds:['f1'],label:'Sesto d’impianto'
  });
});
