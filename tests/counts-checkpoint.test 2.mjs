import test from 'node:test';
import assert from 'node:assert/strict';
import {setLocalOwnerScope} from '../src/local-owner-scope.js';
import {saveDraft,loadDraftRecord} from '../src/storage.js';
import {checkpointBeforeSwitch,createToolSwitch,restoreWorkspaceForOwner,restoreVersionConflict} from '../src/tool-switch.js';

const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};};
const sample=(owner='guest-a')=>({version:1,ownerId:owner,projectId:'project-local',fieldId:'field-1',cloudVersion:3,map:{drawing:true,mode:'perimeter',vertices:[[8,44],[8.01,44]],camera:{center:[8,44],zoom:16,bearing:24}},navigation:{screen:'editor',transaction:true}});

test('checkpoint round trips partial geometry and remains isolated by owner',()=>{
  const storage=memory();setLocalOwnerScope('guest-a');
  const state={project:{localProjectId:'project-local',activeFieldId:'field-1'}};
  saveDraft(storage,state,sample());
  assert.deepEqual(loadDraftRecord(storage).workspace.map.vertices,[[8,44],[8.01,44]]);
  assert.equal(restoreWorkspaceForOwner(loadDraftRecord(storage),'guest-a','project-local').navigation.screen,'editor');
  assert.equal(restoreWorkspaceForOwner(loadDraftRecord(storage),'guest-b','project-local'),null);
  setLocalOwnerScope('guest-b');assert.equal(loadDraftRecord(storage),null);
  setLocalOwnerScope(null);
});

test('switch waits for verified local save and blocks navigation when persistence fails',async()=>{
  let navigated=0;
  const storage={getItem:()=>null,setItem(){throw new Error('Quota piena');}};
  await assert.rejects(checkpointBeforeSwitch({storage,state:{project:{localProjectId:'p'}},ownerId:'u1',capture:()=>({...sample('u1'),projectId:'p'}),navigate:()=>navigated++}),/Quota piena/);
  assert.equal(navigated,0);
});

test('double activation shares one checkpoint and never starts another navigation',async()=>{
  const storage=memory();setLocalOwnerScope('u1');let navigated=0,captures=0;
  const switcher=createToolSwitch({storage,state:{project:{localProjectId:'p'}},ownerId:'u1',capture:()=>{captures++;return {...sample('u1'),projectId:'p'};},navigate:()=>navigated++});
  await Promise.all([switcher('target'),switcher('target')]);assert.equal(captures,1);assert.equal(navigated,1);
  setLocalOwnerScope(null);
});

test('a newer cloud version keeps the restored draft and stops automatic reconciliation',()=>{
  assert.equal(restoreVersionConflict({workspace:sample(),state:{cloud:{projectId:'cloud-1'}}},[{cloud:{projectId:'cloud-1',version:4}}]),true);
  assert.equal(restoreVersionConflict({workspace:sample(),state:{cloud:{projectId:'cloud-1'}}},[{cloud:{projectId:'cloud-1',version:3}}]),false);
});

test('switch before map load preserves the saved pending vertices instead of the empty live editor',async()=>{
 const storage=memory();setLocalOwnerScope('guest-a');let captures=0;
 const state={project:{localProjectId:'project-local',activeFieldId:'field-1'}},pendingWorkspace=sample();
 await checkpointBeforeSwitch({storage,state,ownerId:'guest-a',pendingWorkspace,capture:()=>{captures++;return {...sample(),map:{vertices:[]}};}});
 assert.equal(captures,0);assert.equal(loadDraftRecord(storage).workspace.map.vertices.length,2);setLocalOwnerScope(null);
});
