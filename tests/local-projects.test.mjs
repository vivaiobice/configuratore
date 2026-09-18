import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalProjects,writeLocalProject} from '../src/local-projects.js';
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
