import test from 'node:test';
import assert from 'node:assert/strict';
import {writeLocalProject,readLocalProjects} from '../src/local-projects.js';

const storage=()=>{const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};};
const item=(store)=>writeLocalProject(store,{localProjectId:'p1',localProjectName:'Vecchio',fields:[{id:'f1'}]},'Vecchio',{projectId:'server-p1',version:4});

test('cloud rename commits remotely before changing the local archive and keeps the new version',async()=>{
 const {renameArchivedProject}=await import('../src/project-archive-actions.js');
 const store=storage(),saved=item(store),calls=[];
 const renamed=await renameArchivedProject({storage:store,item:saved,name:'Nuovo',backend:{async applyProjectOperation(args){calls.push(args);return {status:'applied',projectId:'server-p1',version:5};}},buildSnapshot:project=>({name:project.localProjectName}),operationId:()=> 'op-1'});
 assert.equal(calls[0].expectedVersion,4);assert.deepEqual(calls[0].snapshot,{name:'Nuovo'});
 assert.equal(renamed.name,'Nuovo');assert.equal(renamed.cloud.version,5);
});

test('failed cloud rename leaves the local project unchanged',async()=>{
 const {renameArchivedProject}=await import('../src/project-archive-actions.js');
 const store=storage(),saved=item(store);
 await assert.rejects(()=>renameArchivedProject({storage:store,item:saved,name:'Nuovo',backend:{async applyProjectOperation(){throw new Error('offline');}},buildSnapshot:()=>({}),operationId:()=> 'op-1'}),/offline/);
 assert.equal(readLocalProjects(store)[0].name,'Vecchio');
});

test('cloud deletion removes the local project only after soft delete succeeds',async()=>{
 const {deleteArchivedProject}=await import('../src/project-archive-actions.js');
 const store=storage(),saved=item(store),calls=[];
 await deleteArchivedProject({storage:store,item:saved,backend:{async softDeleteProject(args){calls.push(args);}},operationId:()=> 'op-2'});
 assert.deepEqual(calls,[{operationId:'op-2',projectId:'server-p1'}]);assert.equal(readLocalProjects(store).length,0);
 const store2=storage(),saved2=item(store2);
 await assert.rejects(()=>deleteArchivedProject({storage:store2,item:saved2,backend:{async softDeleteProject(){throw new Error('offline');}},operationId:()=> 'op-3'}),/offline/);
 assert.equal(readLocalProjects(store2).length,1);
});

test('moving an archived field validates cloud identities and refreshes only after RPC success',async()=>{
 const {moveArchivedField}=await import('../src/project-archive-actions.js');
 const calls=[];
 const sourceItem={id:'local-a',name:'A',cloud:{projectId:'cloud-a'}};
 const targetItem={id:'local-b',name:'B',cloud:{projectId:'cloud-b'}};
 const field={id:'f1',label:'Campo Nord'};
 const result=await moveArchivedField({sourceItem,targetItem,field,
  backend:{async moveProjectField(args){calls.push(['move',args]);return {status:'field_moved',fieldId:'f1'};}},
  refreshProjects:async()=>calls.push(['refresh']),operationId:()=> 'op-move'});
 assert.deepEqual(calls,[['move',{operationId:'op-move',sourceProjectId:'cloud-a',targetProjectId:'cloud-b',clientFieldId:'f1'}],['refresh']]);
 assert.equal(result.status,'field_moved');
 await assert.rejects(()=>moveArchivedField({sourceItem,targetItem:sourceItem,field,backend:{},refreshProjects(){}}),/diverso/);
 await assert.rejects(()=>moveArchivedField({sourceItem:{...sourceItem,cloud:{}},targetItem,field,backend:{},refreshProjects(){}}),/sincronizzati/);
});

test('failed field move never refreshes or mutates the archive',async()=>{
 const {moveArchivedField}=await import('../src/project-archive-actions.js');
 let refreshed=0;
 await assert.rejects(()=>moveArchivedField({
  sourceItem:{id:'a',name:'A',cloud:{projectId:'cloud-a'}},
  targetItem:{id:'b',name:'B',cloud:{projectId:'cloud-b'}},field:{id:'f1'},
  backend:{async moveProjectField(){throw new Error('offline');}},refreshProjects:async()=>{refreshed++;}
 }),/offline/);
 assert.equal(refreshed,0);
});
