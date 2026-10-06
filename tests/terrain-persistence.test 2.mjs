import test from 'node:test';
import assert from 'node:assert/strict';
import {saveDraft,loadDraft} from '../src/storage.js';
import {buildCloudSnapshot,snapshotToFieldRows} from '../src/cloud-project-model.js';
import {toProjectRow,projectPayloadToState,projectPayloadToArchiveItem} from '../src/backend.js';
import {writeLocalProject,readLocalProjects} from '../src/local-projects.js';
import {ensureProjectFields,switchProjectField,duplicateProjectField} from '../src/fields.js';
import {migrateProjectArchive} from '../src/local-migrations.js';
const ring=[[8,44],[8.001,44],[8,44.001],[8,44]];
const terrain={model:{contentHash:'frozen',grid:{valuesBase64:'once-only-grid'}},applied:{inputHash:'frozen-input',result:{}}};
const field={id:'f',geometry:ring,terrain};
const state={project:{localProjectId:'p',fields:[field],terrain}};
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}
test('draft stores frozen terrain once per field and migrations preserve hashes',()=>{
 const store=storage();saveDraft(store,state);const raw=[...store.data.values()][0];
 assert.equal(raw.split('once-only-grid').length-1,1);
 assert.deepEqual(loadDraft(store).project.fields[0].terrain,terrain);
 const migrated=migrateProjectArchive({version:1,projects:[{project:state.project}]},()=> 'p');
 assert.deepEqual(migrated.projects[0].project.fields[0].terrain,terrain);
});
test('field switching and duplication preserve one independent terrain value per field',()=>{
 let project=ensureProjectFields({...state.project,fields:[field,{id:'other'}]});
 project=switchProjectField(project,'other');assert.equal(project.terrain,null);
 project=switchProjectField(project,'f');assert.deepEqual(project.terrain,terrain);
 const copy=duplicateProjectField(project,'f',()=> 'copy');assert.deepEqual(copy.fields.at(-1).terrain,terrain);
 assert.notEqual(copy.fields.at(-1).terrain,copy.fields[0].terrain);
});
test('cloud snapshot and existing JSON design_data preserve frozen terrain',()=>{
 const snapshot=buildCloudSnapshot(state);assert.deepEqual(snapshot.fields[0].terrain,terrain);
 const [row]=snapshotToFieldRows(snapshot,'cloud-project','owner');assert.deepEqual(row.design_data.terrain,terrain);
 const legacy=toProjectRow(state,{},{});assert.deepEqual(legacy.field_plans[0].terrain,terrain);
 const payload={...legacy,id:'cloud-project',client_project_id:'p'};
 assert.deepEqual(projectPayloadToState(payload).project.fields[0].terrain,terrain);
 assert.deepEqual(projectPayloadToArchiveItem(payload).project.fields[0].terrain,terrain);
});
test('terrain field and snapshot budgets reject before changing saved draft',()=>{
 const store=storage();saveDraft(store,state);const before=[...store.data.values()][0];
 const huge={...field,terrain:{...terrain,padding:'x'.repeat(1024*1024)}};
 assert.throws(()=>saveDraft(store,{project:{...state.project,fields:[huge]}}),/1 MiB/);
 assert.equal([...store.data.values()][0],before);
 assert.throws(()=>buildCloudSnapshot({project:{...state.project,fields:[huge]}}),/1 MiB/);
 assert.throws(()=>toProjectRow({project:{...state.project,fields:[huge]}},{},{}),/1 MiB/);
 const fields=Array.from({length:6},(_,i)=>({...field,id:`f${i}`,terrain:{...terrain,padding:'x'.repeat(800000)}}));
 assert.throws(()=>buildCloudSnapshot({project:{...state.project,fields}}),/4 MiB/);
});

test('local archive stores terrain once per field and preserves prior archive on size rejection',()=>{
 const store=storage();writeLocalProject(store,state.project,'Frozen');const before=[...store.data.values()][0];
 assert.equal(before.split('once-only-grid').length-1,1);assert.deepEqual(readLocalProjects(store)[0].project.fields[0].terrain,terrain);
 assert.throws(()=>writeLocalProject(store,{...state.project,fields:[{...field,terrain:{...terrain,padding:'x'.repeat(1024*1024)}}]},'Too large'),/1 MiB/);
 assert.equal([...store.data.values()][0],before);
});

test('a real applied model replays offline after draft archive cloud and revision restore',async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');
 const {fieldSummaryMetrics}=await import('../src/project-summary.js');
 const {field,result}=appliedTerrainField();const state={project:{localProjectId:'real',fields:[field]}};
 const store=storage();saveDraft(store,state);writeLocalProject(store,state.project,'Real');
 const snapshot=JSON.parse(JSON.stringify(buildCloudSnapshot(state,fieldSummaryMetrics)));
 const payload={id:'cloud',client_project_id:'real',field_plans:snapshot.fields};
 const paths=[loadDraft(store).project.fields[0],readLocalProjects(store)[0].project.fields[0],projectPayloadToState(payload).project.fields[0],projectPayloadToArchiveItem(payload).project.fields[0]];
 for(const replay of paths){assert.deepEqual(replay.terrain,field.terrain);assert.deepEqual(fieldSummaryMetrics(replay),result);}
 let switched=ensureProjectFields({...state.project,fields:[field,{id:'other'}]});switched=switchProjectField(switched,'other');switched=switchProjectField(switched,field.id);
 assert.deepEqual(fieldSummaryMetrics(switched.fields[0]),result);
 const duplicated=duplicateProjectField(switched,field.id,()=> 'new-copy');assert.deepEqual(fieldSummaryMetrics(duplicated.fields.at(-1)),result);
 const old=JSON.parse(JSON.stringify(field));old.terrain.applied.algorithmVersion='old-saved-algorithm';
 assert.deepEqual(fieldSummaryMetrics(old),result);
 const edited={...field,plantSpacingM:2};assert.equal(fieldSummaryMetrics(edited).terrainStatus,'invalid');
});
