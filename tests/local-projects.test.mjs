import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalProjects,writeLocalProject,renameLocalProject,removeLocalProject} from '../src/local-projects.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('saved projects are independent snapshots and saving the same id updates instead of duplicating',()=>{
 const store=storage(),project={localProjectId:'p1',fields:[{id:'f1',label:'Vigneto'}]};
 writeLocalProject(store,project,'Impianto A');project.fields[0].label='Modificato';
 assert.equal(readLocalProjects(store)[0].project.fields[0].label,'Vigneto');
 writeLocalProject(store,project,'Impianto A');assert.equal(readLocalProjects(store).length,1);
 writeLocalProject(store,{...project,localProjectId:'p2'},'Impianto B');assert.equal(readLocalProjects(store).length,2);
});
test('corrupt archives are not silently overwritten and failed storage does not report success',()=>{
 assert.throws(()=>writeLocalProject({getItem:()=>'{',setItem:()=>assert.fail('must preserve corrupt data')},{localProjectId:'x',fields:[]},'A'));
 assert.throws(()=>writeLocalProject({getItem:()=>null,setItem(){throw Error('quota');}},{localProjectId:'x',fields:[]},'A'),/quota/);
});
test('V29 archive is accepted in memory and next successful write upgrades to version 2',()=>{
 const store=storage();
 store.setItem('vivai-obice:configuratore:projects:v1',JSON.stringify({version:1,projects:[{id:'old',name:'Old',savedAt:'2025-01-01T00:00:00Z',project:{localProjectId:'old',fields:[]}}]}));
 assert.equal(readLocalProjects(store)[0].cloud.clientProjectId,'old');
 writeLocalProject(store,{localProjectId:'new',fields:[]},'New');
 const raw=JSON.parse(store.getItem('vivai-obice:configuratore:projects:v1'));
 assert.equal(raw.version,2);
 assert.equal(raw.projects.length,2);
});
test('local save preserves the cloud identity needed to update the same server project',()=>{
 const store=storage();
 writeLocalProject(store,{localProjectId:'p1',fields:[]},'A',{projectId:'server-p1',clientProjectId:'p1',version:4});
 const [saved]=readLocalProjects(store);
 assert.equal(saved.cloud.projectId,'server-p1');
 assert.equal(saved.cloud.clientProjectId,'p1');
 assert.equal(saved.cloud.version,4);
});
test('cloud merge replaces the same stable id and retains unsynchronized local projects',async()=>{
 const module=await import('../src/local-projects.js');
 assert.equal(typeof module.mergeLocalProjects,'function');
 const store=storage();
 writeLocalProject(store,{localProjectId:'shared',fields:[{id:'old'}]},'Old',{clientProjectId:'shared',version:1});
 writeLocalProject(store,{localProjectId:'local-only',fields:[{id:'draft'}]},'Bozza');
 const merged=module.mergeLocalProjects(store,[{
  id:'shared',name:'Cloud',savedAt:'2026-09-22T06:00:00.000Z',
  project:{localProjectId:'shared',fields:[{id:'new'}]},
  cloud:{projectId:'server-shared',clientProjectId:'shared',version:5}
 }]);
 assert.equal(merged.length,2);
 assert.equal(merged.find((item)=>item.id==='shared').project.fields[0].id,'new');
 assert.equal(merged.find((item)=>item.id==='shared').cloud.projectId,'server-shared');
 assert.ok(merged.some((item)=>item.id==='local-only'));
});

test('project archive renames the selected project without changing its identity or snapshot',()=>{
 const store=storage();
 writeLocalProject(store,{localProjectId:'p1',localProjectName:'Vecchio',fields:[{id:'f1'}]},'Vecchio',{projectId:'server-p1',version:4});
 const renamed=renameLocalProject(store,'p1','  Nuovo impianto  ');
 assert.equal(renamed.name,'Nuovo impianto');
 assert.equal(renamed.id,'p1');
 assert.equal(renamed.project.localProjectName,'Nuovo impianto');
 assert.equal(renamed.cloud.projectId,'server-p1');
 assert.equal(readLocalProjects(store).length,1);
});

test('project archive removes only the selected project',()=>{
 const store=storage();
 writeLocalProject(store,{localProjectId:'p1',fields:[]},'Uno');
 writeLocalProject(store,{localProjectId:'p2',fields:[]},'Due');
 const removed=removeLocalProject(store,'p1');
 assert.equal(removed.id,'p1');
 assert.deepEqual(readLocalProjects(store).map(item=>item.id),['p2']);
 assert.equal(removeLocalProject(store,'missing'),null);
});
