import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {buildTerrainProposal} from '../src/terrain-design.js';
import {fieldSummaryMetrics} from '../src/project-summary.js';
import {serializeTerrainSnapshot,TERRAIN_FIELD_MAX_BYTES,TERRAIN_SNAPSHOT_MAX_BYTES} from '../src/terrain-serialization.js';
import {buildCloudSnapshot,snapshotToFieldRows} from '../src/cloud-project-model.js';
import {saveDraft,loadDraft} from '../src/storage.js';
import {projectPayloadToState} from '../src/backend.js';
import {ensureProjectFields} from '../src/fields.js';
import {prepareReportContext,readReportContext,REPORT_CONTEXT_KEY} from '../src/report-context.js';
import {REPORT_HANDOFF_KEY} from '../src/report-handoff.js';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {appliedTerrainField} from './fixtures/terrain-field.mjs';

const byteLength=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const scalarCloudKeys=['grossAreaM2','areaM2','netAreaM2','simulatedPlants','commercialPlants25','rowCount','rowLinearM','headPosts','intermediatePosts','totalPosts'];
const small=appliedTerrainField();
let ordinary;
function ordinaryField(){
 if(ordinary)return structuredClone(ordinary);
 const w=240,h=320,width=57,height=73;
 const geometry=[[0,0],[w,0],[w,h],[0,h],[0,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({grid:{width,height,origin:[499980,5000000+h+20],step:[5,-5],values:Array.from({length:width*height},(_,i)=>((i%width)*5-20)/5)}});
 const project={id:'budget',label:'Budget geometry',geometry,exclusions:[],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowPortions:[],rowCurvePoints:[],maintainRowEquidistance:true};
 const proposal=buildTerrainProposal({project,model,followTerrain:false});
 assert.equal(proposal.ok,true,proposal.message);assert.equal(proposal.result.rowCount,82);
 ordinary={...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 return structuredClone(ordinary);
}
function exactSizeField(field,targetBytes){
 const sized={...structuredClone(field),materialRequestNote:''};
 sized.materialRequestNote='x'.repeat(targetBytes-byteLength(sized));
 assert.equal(byteLength(sized),targetBytes);
 return sized;
}
function projectState(fields=[structuredClone(small.field)]){
 return {environment:'TEST',project:{localProjectId:'transport',localProjectName:'Frozen transport',activeFieldId:fields[0].id,fields,terrain:fields[0].terrain},cloud:{projectId:'server',latestRevisionNumber:1},reportOwnerId:'owner'};
}
function storage(){
 const values=new Map(),writes=[];
 return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push({key,value});values.set(key,value);},removeItem:key=>values.delete(key)};
}

// These exercise production data, cloud normalization and calculator replay.
// Restoring full metrics duplication or charging transport envelopes to field
// size must reject the real 7.7 ha field / exact-boundary fixture below.
test('ordinary accepted 7.7 ha applied field survives cloud transport with scalar KPIs and exact replay',()=>{
 const field=ordinaryField(),result=fieldSummaryMetrics(field),state=projectState([field]),store=storage();
 assert.ok(byteLength(field)<TERRAIN_FIELD_MAX_BYTES);assert.ok(byteLength(result)>400000);
 saveDraft(store,state);assert.deepEqual(loadDraft(store).project.fields[0].terrain,field.terrain);
 const snapshot=buildCloudSnapshot(state,fieldSummaryMetrics);
 assert.deepEqual(snapshot.fields[0].metrics,Object.fromEntries(scalarCloudKeys.filter(key=>key in result).map(key=>[key,result[key]])));
 assert.ok(Object.values(snapshot.fields[0].metrics).every(value=>value===null||typeof value==='number'));
 const transported=JSON.parse(serializeTerrainSnapshot(snapshot));
 assert.deepEqual(transported.fields[0].terrain,field.terrain);
 const [row]=snapshotToFieldRows(transported,'server','owner');
 assert.deepEqual(row.design_data.terrain,field.terrain);assert.equal(row.simulated_plants,result.simulatedPlants);assert.equal(row.total_posts,result.totalPosts);
 const restored=projectPayloadToState({id:'server',client_project_id:'transport',field_plans:transported.fields}).project.fields[0];
 assert.deepEqual(fieldSummaryMetrics(restored),result);
});

test('1 MiB applies to canonical field data while all cloud transport bytes remain in the 4 MiB budget',()=>{
 const editorField=ensureProjectFields(projectState().project).fields[0];
 const field=exactSizeField(editorField,TERRAIN_FIELD_MAX_BYTES),result=fieldSummaryMetrics(field),state=projectState([field]),store=storage();
 assert.equal(result.terrainStatus,'applied');saveDraft(store,state);
 assert.deepEqual(loadDraft(store).project.fields[0],field);
 const snapshot=buildCloudSnapshot(state,fieldSummaryMetrics);
 assert.ok(byteLength(snapshot.fields[0])>TERRAIN_FIELD_MAX_BYTES,'real scalar envelope pushes actual bytes over the core limit');
 assert.deepEqual(fieldSummaryMetrics(JSON.parse(serializeTerrainSnapshot(snapshot)).fields[0]),result);
 assert.doesNotThrow(()=>serializeTerrainSnapshot({fields:[{...field,metrics:{derived:'x'.repeat(1000)},clientFieldId:'transport-id',cloudReady:true}]}));
 assert.throws(()=>serializeTerrainSnapshot({fields:[{...field,label:field.label+'x'}]}),/1 MiB/);
 assert.throws(()=>buildCloudSnapshot(projectState([{...field,label:field.label+'x'}]),fieldSummaryMetrics),/1 MiB/);
 assert.throws(()=>serializeTerrainSnapshot({fields:[{...small.field,metrics:{derived:'x'.repeat(TERRAIN_SNAPSHOT_MAX_BYTES)}}]}),/4 MiB/);
 const fields=Array.from({length:4},(_,index)=>({...field,id:`field-${index}`}));
 assert.throws(()=>buildCloudSnapshot(projectState(fields),fieldSummaryMetrics),/4 MiB/);
});

test('a locally saved 1048500-byte editor field can cloud serialize and restore without changed geometry',()=>{
 const field=exactSizeField(ensureProjectFields(projectState().project).fields[0],1048500),state=projectState([field]),store=storage();
 saveDraft(store,state);
 const local=loadDraft(store),snapshot=JSON.parse(serializeTerrainSnapshot(buildCloudSnapshot(local,fieldSummaryMetrics)));
 const restored=projectPayloadToState({id:'server',client_project_id:'transport',field_plans:snapshot.fields}).project.fields[0];
 assert.deepEqual(restored.terrain,field.terrain);assert.deepEqual(restored.geometry,field.geometry);assert.deepEqual(restored.rowPortions,field.rowPortions);
 assert.deepEqual(fieldSummaryMetrics(restored),small.result);
 assert.doesNotThrow(()=>saveDraft(store,projectState([restored])));
});

test('ordinary no-terrain metrics and report JSON preserve their complete byte representation',()=>{
 const field={id:'legacy',geometry:small.field.geometry,terrain:null},metrics={areaM2:25,rows:[{coordinates:[[8,44],[8.001,44]]}],notes:{original:true}};
 const state=projectState([field]);
 assert.deepEqual(buildCloudSnapshot(state,()=>metrics).fields[0].metrics,metrics);
 assert.equal(serializeTerrainSnapshot(state),JSON.stringify(state));
});

// Evaluate the real popup handler with only account, browser and async-source
// boundaries substituted. Assertions inspect stored payloads and consumers;
// they do not assert on source patterns or the substitute implementations.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const popupSource=app.slice(app.indexOf('function openReportPopup('),app.indexOf('\nfunction requestFinalAction(',app.indexOf('function openReportPopup(')));
function reportHarness(state=projectState()){
 const store=storage(),contexts=[],status=[],listeners=new Map();let fresh=state,opens=0,persists=0;
 const scope={state,authBridge:{getState:()=>({user:{id:'owner'}})},promptForProfile:()=>false,prepareReportContext,serializeTerrainSnapshot,
  persist:()=>{persists++;},setStatus:message=>status.push(message),REPORT_CONTEXT_KEY,REPORT_HANDOFF_KEY,
  localStorage:store,crypto:{randomUUID:()=> 'report'},open:()=>{opens++;return {};},isMobileMap:()=>false,
  addEventListener:(name,listener)=>listeners.set(name,listener),identityFrozen:false,cloudBackend:null,projectSync:null,
  readLocalProjects:()=>[],calculateFieldProject:fieldSummaryMetrics,checkpointBeforeSwitch:()=>{},captureWorkspace:()=>null,
  restoringWorkspace:false,pendingWorkspace:null,cloudService:null,mergeCloudSnapshot:(state,cloud)=>({...state,cloud}),hasReportProjectChanges:()=>false,
  createReportProjectSource:()=>({synchronize:async context=>{contexts.push(context);return structuredClone(fresh);}})};
 runInNewContext(popupSource,scope);
 return {store,status,contexts,open:()=>scope.openReportPopup(),setFresh:value=>{fresh=value;},get opens(){return opens;},get persists(){return persists;},
  async refresh(operationId='operation'){
   const request={requestId:'report',operationId,status:'refresh_requested',ownerId:'owner',localProjectId:'transport',projectId:'server'};
   store.setItem(REPORT_HANDOFF_KEY,JSON.stringify(request));
   await listeners.get('storage')({key:REPORT_HANDOFF_KEY,newValue:JSON.stringify(request)});
   return JSON.parse(store.getItem(REPORT_HANDOFF_KEY));
  }};
}

function assertReportFields(raw,original){
 const transported=JSON.parse(raw);
 assert.equal(Object.hasOwn(transported.project,'terrain'),false);
 assert.equal(transported.project.fields.length,original.project.fields.length);
 for(let index=0;index<original.project.fields.length;index++){
  const field=original.project.fields[index],replayed=transported.project.fields[index];
  assert.deepEqual(replayed.terrain,field.terrain);assert.deepEqual(fieldSummaryMetrics(replayed),fieldSummaryMetrics(field));
 }
 const model=buildProjectReportModel({state:transported,getMetrics:fieldSummaryMetrics});
 model.fields.forEach((field,index)=>assert.deepEqual(field.rows,fieldSummaryMetrics(original.project.fields[index]).rows));
 assert.ok(byteLength(raw)<byteLength(original));
}

test('real popup initial and fresh report handoffs compact multi-field terrain and replay every field',async()=>{
 const state=projectState([structuredClone(small.field),{...structuredClone(small.field),id:'second'}]),harness=reportHarness(state);
 harness.open();assert.equal(harness.opens,1);assertReportFields(harness.store.getItem(REPORT_CONTEXT_KEY('report')),prepareReportContext(state,{ownerId:'owner'}));
 assert.deepEqual(readReportContext(harness.store,'report').project.fields[0].terrain,small.field.terrain);
 const fresh=projectState([{...structuredClone(small.field),label:'Fresh'}, {...structuredClone(small.field),id:'second'}]);fresh.cloud.latestRevisionNumber=2;
 harness.setFresh(fresh);assert.equal((await harness.refresh()).status,'ready');
 assertReportFields(harness.store.getItem(REPORT_CONTEXT_KEY('report')),fresh);
 assert.equal(readReportContext(harness.store,'report').cloud.latestRevisionNumber,2);
});

test('report snapshot budget failures occur before initial writes or a fresh context replacement',async()=>{
 const tooLarge={...projectState(),notes:'x'.repeat(TERRAIN_SNAPSHOT_MAX_BYTES)},blocked=reportHarness(tooLarge);
 assert.throws(()=>blocked.open(),/4 MiB/);assert.equal(blocked.opens,0);assert.equal(blocked.persists,0);assert.equal(blocked.store.writes.length,0);
 const harness=reportHarness();harness.open();const before=harness.store.getItem(REPORT_CONTEXT_KEY('report'));
 harness.setFresh(tooLarge);const writes=harness.store.writes.filter(write=>write.key===REPORT_CONTEXT_KEY('report')).length;
 assert.equal((await harness.refresh()).status,'error');
 assert.equal(harness.store.getItem(REPORT_CONTEXT_KEY('report')),before);
 assert.equal(harness.store.writes.filter(write=>write.key===REPORT_CONTEXT_KEY('report')).length,writes);
});

test('report context quota failure preserves stored and in-memory frozen context for retry',async()=>{
 const initial=projectState(),harness=reportHarness(initial);harness.open();const before=harness.store.getItem(REPORT_CONTEXT_KEY('report'));
 const write=harness.store.setItem;let reject=true;
 harness.store.setItem=(key,value)=>{if(reject&&key===REPORT_CONTEXT_KEY('report'))throw new Error('QuotaExceededError');write.call(harness.store,key,value);};
 const fresh=projectState([{...structuredClone(small.field),label:'Updated'}]);fresh.cloud.latestRevisionNumber=2;harness.setFresh(fresh);
 assert.equal((await harness.refresh()).status,'error');assert.equal(harness.store.getItem(REPORT_CONTEXT_KEY('report')),before);
 reject=false;assert.equal((await harness.refresh('retry')).status,'ready');
 assert.equal(harness.contexts[1].project.fields[0].label,initial.project.fields[0].label,'failed write must not replace the frozen request source');
 assert.equal(readReportContext(harness.store,'report').project.fields[0].label,'Updated');
});

test('real report popup stores the original raw JSON for a no-terrain context',()=>{
 const state=projectState([{id:'legacy',geometry:small.field.geometry,terrain:null}]),harness=reportHarness(state);harness.open();
 assert.equal(harness.store.getItem(REPORT_CONTEXT_KEY('report')),JSON.stringify(prepareReportContext(state,{ownerId:'owner'})));
});

test('real attached history counts toward inclusive UTF-8 field and snapshot ceilings and report handoffs',async()=>{
 const {attachTerrainRestore}=await import('../src/terrain-history.js');
 const before={...structuredClone(small.field),rowPortions:[]};delete before.terrain;
 const attached=attachTerrainRestore({project:before,proposal:small.proposal,operationId:'quota-history'});
 const original={...before,rowPortions:attached.rowPortions,terrain:attached.terrain};
 const field=exactSizeField(ensureProjectFields(projectState([original]).project).fields[0],TERRAIN_FIELD_MAX_BYTES);
 assert.doesNotThrow(()=>serializeTerrainSnapshot({fields:[field]}));
 assert.throws(()=>serializeTerrainSnapshot({fields:[{...field,materialRequestNote:field.materialRequestNote+'x'}]}),/1 MiB/);
 assert.throws(()=>serializeTerrainSnapshot({fields:[{...field,materialRequestNote:field.materialRequestNote.slice(0,-1)+'é'}]}),/1 MiB/);
 const snapshot={fields:[field],transportNote:''};snapshot.transportNote='x'.repeat(TERRAIN_SNAPSHOT_MAX_BYTES-byteLength(snapshot));
 assert.equal(byteLength(snapshot),TERRAIN_SNAPSHOT_MAX_BYTES);assert.doesNotThrow(()=>serializeTerrainSnapshot(snapshot));
 assert.throws(()=>serializeTerrainSnapshot({...snapshot,transportNote:snapshot.transportNote+'x'}),/4 MiB/);
 const harness=reportHarness(projectState([original]));harness.open();
 const report=readReportContext(harness.store,'report');assert.deepEqual(report.project.fields[0].terrain.history,attached.terrain.history);
 assert.equal(harness.store.getItem(REPORT_CONTEXT_KEY('report')).match(/valuesBase64/g).length,1);
 assert.deepEqual(fieldSummaryMetrics(report.project.fields[0]),small.result);
});

test('serialization rejection leaves a real saved restore entry and live baseline unconsumed',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal,assertTerrainRestoreHistory}=await import('../src/terrain-history.js');
 const {checkpointTerrainProposal,terrainContextKey}=await import('../src/terrain-controller.js');
 const before={...structuredClone(small.field),rowPortions:[]};delete before.terrain;
 const attached=attachTerrainRestore({project:before,proposal:small.proposal,operationId:'saved'});
 const field={...before,rowPortions:attached.rowPortions,terrain:attached.terrain};
 const {mergeProjectState}=await import('../src/state.js');
 const state=projectState([field]);state.project=ensureProjectFields(state.project);const original=structuredClone(state),store=storage();saveDraft(store,state);
 const raw=store.getItem(store.writes[0].key),baseline=structuredClone(field.terrain.history);
 const restore=buildTerrainRestoreProposal({project:field,portionId:attached.rowPortions[0].id,model:field.terrain.model});assert.equal(restore.ok,true,restore.message);
 restore.projectPatch={...restore.projectPatch,materialRequestNote:'x'.repeat(TERRAIN_FIELD_MAX_BYTES)};
 const currentContext={account:'owner',field:field.id},context={terrainContextKey:terrainContextKey(currentContext,state.project),terrainHistoryFingerprint:assertTerrainRestoreHistory({project:state.project})};
 const mergeState=mergeProjectState;
 assert.throws(()=>checkpointTerrainProposal({state,proposal:restore,context,currentContext,mergeState,saveCheckpoint:candidate=>{saveDraft(store,candidate);return candidate;}}),/1 MiB/);
 assert.equal(store.getItem(store.writes[0].key),raw);assert.deepEqual(state,original);assert.deepEqual(field.terrain.history,baseline);
 assert.equal(restore.terrain.history.entries.length,0,'only the rejected candidate consumes history');
 const oversizedBefore={...before,materialRequestNote:'x'.repeat(TERRAIN_FIELD_MAX_BYTES)};
 assert.throws(()=>attachTerrainRestore({project:oversizedBefore,proposal:small.proposal,operationId:'not-saved'}),/1 MiB/);
 assert.deepEqual(small.proposal.terrain.history,undefined);assert.deepEqual(field.terrain.history,baseline);
});
