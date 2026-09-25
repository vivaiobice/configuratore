import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldLocationCoordinator} from '../src/field-location.js';
import {createDefaultField,ensureProjectFields,updateActiveFieldProject,updateProjectField} from '../src/fields.js';

const oldGeometry=[[8,44],[8.01,44],[8,44.01],[8,44]];
const newGeometry=[[9,45],[9.01,45],[9,45.01],[9,45]];

test('a late result for an old geometry cannot overwrite the active field',async()=>{
  const pending=[];const applied=[];
  let active={id:'f1',geometry:oldGeometry};
  const coordinator=createFieldLocationCoordinator({
    resolve:field=>new Promise(done=>pending.push({field,done})),
    getActiveField:()=>active,
    apply:patch=>applied.push(patch)
  });
  const first=coordinator.refresh(active);
  active={id:'f1',geometry:newGeometry};
  const second=coordinator.refresh(active);
  pending[0].done({locationLabel:'Vecchio',municipality:'Vecchio',province:'A',region:'R'});
  pending[1].done({locationLabel:'Nuovo',municipality:'Nuovo',province:'B',region:'R'});
  await Promise.all([first,second]);
  assert.deepEqual(applied,[{locationLabel:'Nuovo',municipality:'Nuovo',province:'B',region:'R'}]);
});

test('location is applied to its field even if the user switches field before resolution',async()=>{
  let finish;const fields=[{id:'f1',geometry:oldGeometry},{id:'f2',geometry:newGeometry}];const applied=[];
  const coordinator=createFieldLocationCoordinator({resolve:()=>new Promise(done=>{finish=done;}),getField:id=>fields.find(field=>field.id===id),apply:(patch,field)=>applied.push([field.id,patch])});
  const request=coordinator.refresh(fields[0]);
  finish({municipality:'Comune'});await request;
  assert.deepEqual(applied,[['f1',{locationLabel:'',municipality:'Comune',province:'',region:''}]]);
});

test('updateProjectField changes a non-active field without changing the active mirror',()=>{
  const project=ensureProjectFields({fields:[createDefaultField('f1',1,{municipality:'A'}),createDefaultField('f2',2,{municipality:'B'})],activeFieldId:'f2'});
  const next=updateProjectField(project,'f1',{municipality:'A corretta'});
  assert.equal(next.activeFieldId,'f2');assert.equal(next.municipality,'B');assert.equal(next.fields[0].municipality,'A corretta');
});

test('field normalization preserves independent canonical locations',()=>{
  let project=ensureProjectFields({fields:[
    createDefaultField('f1',1,{municipality:'Comune A',province:'CN',region:'Piemonte',locationLabel:'Comune A, CN'}),
    createDefaultField('f2',2,{municipality:'Comune B',province:'AT',region:'Piemonte',locationLabel:'Comune B, AT'})
  ],activeFieldId:'f1'});
  project=updateActiveFieldProject(project,{municipality:'Comune A corretto'});
  assert.equal(project.fields[0].municipality,'Comune A corretto');
  assert.equal(project.fields[1].municipality,'Comune B');
});
