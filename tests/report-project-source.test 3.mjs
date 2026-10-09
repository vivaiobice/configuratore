import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportProjectSource} from '../src/report-project-source.js';
const ring=[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
const context=(id='a',offset=0)=>({environment:'TEST',reportOwnerId:'owner-a',project:{localProjectId:id,localProjectName:id,fields:[{id:'f',geometry:ring,rowSpacingM:2.5,plantSpacingM:.9,orientationDeg:offset}]},cloud:{projectId:'server-'+id,version:2,latestRevisionNumber:1}});
function harness(){
 let active=context(),owner='owner-a',revision=1,cloudOffset=18;
 const calls=[],changes=[],main={state:'synced',status(){return {state:this.state,lastError:this.lastError};},suspend(reason){this.state='suspended';this.lastError=reason;},async flush(){return this.status();},resume(){this.state='synced';}};
 const backend={async loadEditableProject(id){calls.push(['load',id]);return {id,client_project_id:id.slice(7),environment:'TEST',name:'fresh',version:4,latest_revision_number:2,field_plans:context(id.slice(7),cloudOffset).project.fields};},async applyProjectOperation(args){calls.push(['apply',args]);return {status:'applied',projectId:'server-'+args.snapshot.clientProjectId,version:args.expectedVersion+1};},async loadLatestProjectRevision(){return null;},async createProjectRevision(args){calls.push(['revision',args]);return {status:'revision_created',projectId:args.projectId,version:args.expectedVersion,revisionNumber:++revision};}};
 const source=createReportProjectSource({getState:()=>active,getOwnerId:()=>owner,getBackend:()=>backend,getSync:()=>main,getArchive:()=>[{id:'b',name:'b',project:context('b',9).project,cloud:context('b').cloud}],checkpoint:async()=>calls.push(['checkpoint']),getMetrics:()=>({}),onSynced:(value,kind)=>changes.push([value,kind])});
 return {source,calls,changes,main,backend,setActive:value=>active=value,setOwner:value=>owner=value,setCloudOffset:value=>cloudOffset=value,getActive:()=>active};
}

test('report synchronization freezes the selected current project and returns the revision snapshot',async()=>{
 const h=harness();h.setActive(context('a',11));const result=await h.source.synchronize(context());
 assert.equal(result.project.fields[0].orientationDeg,11);assert.equal(result.cloud.latestRevisionNumber,2);
 assert.equal(h.calls.find(x=>x[0]==='apply')[1].snapshot.fields[0].orientationDeg,11);
 assert.equal(h.main.state,'synced');assert.equal(h.changes[0][1],'current');
});

test('an archived report never activates or edits an unrelated current draft',async()=>{
 const h=harness();const before=structuredClone(h.getActive());const result=await h.source.synchronize(context('b'));
 assert.equal(result.project.localProjectId,'b');assert.equal(result.project.fields[0].orientationDeg,9);
 assert.deepEqual(h.getActive(),before);assert.equal(h.calls.some(x=>x[0]==='checkpoint'),false);
 assert.equal(h.calls.find(x=>x[0]==='apply')[1].snapshot.clientProjectId,'b');
});

test('refresh uses latest cloud geometry and a following generation keeps that selected source',async()=>{
 const h=harness();h.setActive(context('a',77));const before=structuredClone(h.getActive());
 const refreshed=await h.source.synchronize(context(),{refresh:true});assert.equal(refreshed.project.fields[0].orientationDeg,18);assert.equal(refreshed.reportSource,'cloud');
 h.setCloudOffset(21);const generated=await h.source.synchronize(refreshed);assert.equal(generated.project.fields[0].orientationDeg,21);assert.deepEqual(h.getActive(),before);
});

test('a late response after account change cannot synchronize or publish a report',async()=>{
 const h=harness();const load=h.backend.loadEditableProject;h.backend.loadEditableProject=async id=>{const result=await load(id);h.setOwner('owner-b');return result;};
 await assert.rejects(h.source.synchronize(context(),{refresh:true}),/profilo|account/i);
 assert.equal(h.calls.some(x=>x[0]==='apply'),false);assert.equal(h.changes.length,0);
});

test('latest cloud response for another project is rejected before a mutation',async()=>{
 const h=harness();h.backend.loadEditableProject=async()=>({id:'server-c',client_project_id:'c',environment:'TEST',name:'wrong',field_plans:context('c').project.fields});
 await assert.rejects(h.source.synchronize(context(),{refresh:true}),/progetto/i);assert.equal(h.calls.some(x=>x[0]==='apply'),false);
});

test('failed or conflicting report synchronization leaves the current draft and releases its sync',async()=>{
 const h=harness();h.backend.applyProjectOperation=async()=>({status:'conflict',serverVersion:7});const before=structuredClone(h.getActive());
 await assert.rejects(h.source.synchronize(context()),/conflitto/i);assert.deepEqual(h.getActive(),before);assert.equal(h.changes.length,0);assert.equal(h.main.state,'synced');
});

test('post-report edits include metadata as well as geometry',async()=>{
 const {hasReportProjectChanges}=await import('../src/report-project-source.js');
 assert.equal(hasReportProjectChanges(context(),context()),false);
 for(const patch of [{localProjectName:'Rinominato'},{campaignYear:2028},{origin:'fieldarea'}]){
  assert.equal(hasReportProjectChanges({...context(),project:{...context().project,...patch}},context()),true);
 }
});

test('editor conflict arriving while the report waits is rejected before sending its drawing',async()=>{
 const h=harness();h.main.flush=async()=>{h.main.state='conflict';h.main.lastError='version_conflict';};
 await assert.rejects(h.source.synchronize(context()),/conflitto/i);
 assert.equal(h.calls.some(x=>x[0]==='apply'),false);
});
