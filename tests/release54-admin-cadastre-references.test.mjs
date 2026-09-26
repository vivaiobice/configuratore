import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { normalizeCadastralReferences, formatCadastralReference } from '../src/cadastral-references.js';
import { createDefaultField, ensureProjectFields, switchProjectField } from '../src/fields.js';
import { createCadastralReferenceEditor } from '../src/cadastral-reference-editor.js';
import { expandProjectFields } from '../admin/admin-model.js';
import { buildAdminMapData } from '../admin/admin-map-data.js';
import {toProjectRow,projectPayloadToState} from '../src/backend.js';
import {buildCloudSnapshot,snapshotToFieldRows} from '../src/cloud-project-model.js';

test('manual cadastral references trim values, discard empty rows and collapse duplicates', () => {
  assert.deepEqual(normalizeCadastralReferences([{municipality:' Alba ',sheet:' 26 ',parcel:'278'}, {source:'manual',municipality:'alba',sheet:'26',parcel:'278'}, {municipality:' ',sheet:'',parcel:''}]),[{source:'manual',municipality:'Alba',sheet:'26',parcel:'278'}]);
});
test('legacy cadastral references survive normalization unchanged', () => {
  const legacy={id:'opaque',reference:'MAPP-26',custom:7};
  assert.deepEqual(normalizeCadastralReferences([legacy]),[legacy]);
  assert.notEqual(normalizeCadastralReferences([legacy])[0],legacy);
  assert.equal(formatCadastralReference(legacy),'MAPP-26');
});
test('two project fields retain independent cadastral reference arrays', () => {
  const refs=[{municipality:'Alba',sheet:'26',parcel:'278'}];
  const fields=ensureProjectFields({fields:[createDefaultField('a',1,{cadastralRefs:refs}),createDefaultField('b',2,{cadastralRefs:refs})]});
  assert.notEqual(fields.fields[0].cadastralRefs,fields.fields[1].cadastralRefs);
  assert.deepEqual(switchProjectField(fields,'b').cadastralRefs,fields.fields[1].cadastralRefs);
});
test('reference editor renders one presentation row, switches fields and emits user edits', () => {
  const {document}=parseHTML('<div id="editor"></div>');const container=document.querySelector('#editor');const events=[];
  const editor=createCadastralReferenceEditor({document,container,onChange:refs=>events.push(refs)});
  editor.render([],{municipality:'Alba'});
  assert.equal(container.querySelector('[name="municipality"]').value,'Alba');assert.equal(events.length,0);
  container.querySelector('[data-add-reference]').click();assert.equal(container.querySelectorAll('[data-reference-row]').length,2);
  assert.equal(container.lastElementChild.dataset.addReference,'');
  editor.render([{municipality:'Asti',sheet:'2',parcel:'3'}],{municipality:'Asti'});
  assert.equal(container.querySelector('[name="municipality"]').value,'Asti');assert.equal(events.length,1);
  editor.destroy();
});
test('Admin row exposes references and map data retains valid siblings', () => {
  const ring=[[8,44],[8.002,44],[8.002,44.002],[8,44.002],[8,44]];
  const [good,bad]=expandProjectFields([{id:'p',name:'P',field_plans:[{id:'a',label:'A',geometry:ring,orientationDeg:35,cadastralRefs:[{municipality:'Alba',sheet:'26',parcel:'278'}]},{id:'b',label:'B',geometry:[[0,0]]}]}]);
  assert.equal(good.cadastralRefs[0].sheet,'26');assert.equal(bad.cadastralRefs.length,0);
  const data=buildAdminMapData([good,bad]);assert.equal(data.fields.features.length,1);assert.ok(data.rows.features.length>0);
});
test('V54 Admin assets remain in V55 entry points', () => {
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');const admin=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
  assert.match(index,/AMBIENTE TEST · V55/);assert.match(index,/cadastral-reference-editor/);assert.match(admin,/id="admin-logout"[^>]*>Logout/);
});
test('cadastral references survive cloud snapshot and legacy project payload round trips',()=>{
  const first=[{source:'manual',municipality:'Alba',sheet:'26',parcel:'278'},{source:'manual',municipality:'Alba',sheet:'26',parcel:'279'}];
  const second=[{id:'opaque',reference:'Legacy-55'}];
  const project=ensureProjectFields({fields:[{id:'a',cadastralRefs:first},{id:'b',cadastralRefs:second}],activeFieldId:'a'});
  const state={environment:'TEST',project};const row=toProjectRow(state,{},{});
  const restored=projectPayloadToState({...row,id:'p'});
  assert.deepEqual(restored.project.fields.map(field=>field.cadastralRefs),[first,second]);
  const snapshot=buildCloudSnapshot(state,()=>({}));const rows=snapshotToFieldRows(snapshot,'p','u');
  assert.deepEqual(rows.map(row=>row.design_data.cadastralRefs),[first,second]);
});
