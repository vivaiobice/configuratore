import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeTerrainHistoryBefore} from '../src/terrain-history-codec.js?v=1.3.11';
import {terrainInputHash} from '../src/terrain-model.js?v=1.3.11';
import {packTerrainRowMirror} from '../src/terrain-row-mirror.js?v=1.3.11';
import {loadSharedProject,SHARED_UNAVAILABLE_MESSAGE} from '../src/shared-project.js?v=1.3.11';
import {createBackend} from '../src/backend.js?v=1.3.11';

// Count entry to the real metric boundary without replacing its implementation.
const adminUrl=new URL('../admin/admin-model.js',import.meta.url);
const adminSource=readFileSync(adminUrl,'utf8');
assert.ok(adminSource.includes('import {fieldSummaryMetrics}'));
const instrumentedAdmin=adminSource.replace('import {fieldSummaryMetrics}','import {fieldSummaryMetrics as originalFieldSummaryMetrics}')
 .replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(new URL(path,adminUrl).href)}`);
const admin=await import('data:text/javascript;base64,'+Buffer.from('let metricCalls=0;export const resetMetricCalls=()=>{metricCalls=0;};export const readMetricCalls=()=>metricCalls;function fieldSummaryMetrics(...args){metricCalls++;return originalFieldSummaryMetrics(...args);}\n'+instrumentedAdmin).toString('base64'));
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const reportId='11111111-1111-4111-8111-111111111111',token='ab'.repeat(32);
const sharedUrl=`https://example.test/shared-project.html?report=${reportId}&token=${token}`;
const publicUrl='https://example.test/shared-project.html?code=VO-1234567';
const geometry=[[9,45],[9.0001,45],[9.0001,45.0001],[9,45.0001],[9,45]];
const before={source:{rowPortionsPresence:'empty',portions:[],referencePortions:[]},portions:[{id:'p',rows:[],quantityBasis:'legacy-planar',note:'x'.repeat(900000)}],quantityContextFingerprint:'q'};
const entry={schemaVersion:1,operationId:'saved',kind:'adapt',affectedIds:['p'],before,afterFingerprint:'a',contextFingerprint:'c'};
entry.baselineHash=terrainInputHash(entry);
const encodedHistory={schemaVersion:2,entries:[{...entry,before:encodeTerrainHistoryBefore(before)}]};
assert.equal(encodedHistory.entries[0].before.codec,'json-deflate-1');
const largeField=id=>({id,label:id,geometry,rowSpacingM:3,plantSpacingM:1,padding:'z'.repeat(800000),terrain:{history:encodedHistory}});
const fields=Array.from({length:3},(_,i)=>largeField('f'+i));
assert.ok(bytes({fields})<4*1024*1024);
assert.ok(bytes({fields})+3*(bytes(before)-bytes(encodedHistory.entries[0].before))>4*1024*1024);
const payload=selected=>({reportId,projectCode:'VO-1234567',projectId:'project',projectName:'Read boundary fixture',fields:selected});
function observeAllocation(){
 const originalAtob=globalThis.atob,originalClone=globalThis.structuredClone;let decodes=0,copies=0;
 globalThis.atob=(...args)=>{decodes++;return originalAtob(...args);};
 globalThis.structuredClone=(...args)=>{copies++;return originalClone(...args);};
 return {counts:()=>({decodes,copies}),restore(){globalThis.atob=originalAtob;globalThis.structuredClone=originalClone;}};
}
function backendFor(value){
 const calls=[];
 return {calls,backend:createBackend({async rpc(name,args){calls.push({name,args});return {data:value,error:null};}})};
}

test('administration rejects project-wide history expansion before any metric or decode allocation',()=>{
 admin.resetMetricCalls();const observer=observeAllocation();
 try{
  assert.throws(()=>admin.expandProjectFields([{id:'too-large',field_plans:fields}]),/4 MiB|bounded snapshot/);
  assert.equal(admin.readMetricCalls(),0);assert.deepEqual(observer.counts(),{decodes:0,copies:0});
 }finally{observer.restore();}
});
test('administration applies the bound independently to three separate projects without dropping fields',()=>{
 admin.resetMetricCalls();
 const projects=fields.map((field,i)=>({id:'project-'+i,field_plans:[field]}));
 const rows=admin.expandProjectFields(projects);
 assert.equal(rows.length,3);assert.equal(admin.readMetricCalls(),3);
 assert.deepEqual(rows.map(row=>[row.projectId,row.fieldId]),[['project-0','f0'],['project-1','f1'],['project-2','f2']]);
 for(let i=0;i<rows.length;i++)assert.deepEqual(rows[i].field.terrain.history,fields[i].terrain.history);
});
test('shared and public loading reject aggregate expansion before authorization and retain valid independent projects',async()=>{
 for(const url of [sharedUrl,publicUrl]){
  let edits=0;const backend={getSharedProjectReport:async()=>payload(fields),getPublicProjectByCode:async()=>payload(fields),canEditProject:async()=>{edits++;return true;}};
  const observer=observeAllocation();
  try{
   assert.deepEqual(await loadSharedProject({url,backend}),{state:'unavailable',message:SHARED_UNAVAILABLE_MESSAGE,payload:null,canEdit:false});
   assert.equal(edits,0);assert.deepEqual(observer.counts(),{decodes:0,copies:0});
  }finally{observer.restore();}
  for(const field of fields){
   const item=payload([field]);const result=await loadSharedProject({url,backend:{getSharedProjectReport:async()=>item,getPublicProjectByCode:async()=>item,canEditProject:async()=>true}});
   assert.equal(result.state,'ready');assert.equal(result.canEdit,true);assert.deepEqual(result.payload,item);
  }
 }
});
test('actual backend public getters enforce the complete field collection bound before allocation',async()=>{
 for(const method of ['getSharedProjectReport','getPublicProjectByCode']){
  const {backend,calls}=backendFor(payload(fields));const observer=observeAllocation();
  try{
   await assert.rejects(()=>method==='getSharedProjectReport'?backend[method](reportId,token):backend[method](' vo-1234567 '),/4 MiB|bounded snapshot/);
   assert.deepEqual(observer.counts(),{decodes:0,copies:0});assert.equal(calls.length,1);
  }finally{observer.restore();}
 }
});
test('actual backend getters hydrate all compact fields without dropping incomplete manual fields',async()=>{
 const row={coordinates:[[9,45],[9.0001,45.0001]],portionId:'p',lengthM:12};
 const logical={id:'compact',label:'Compact row',terrain:{applied:{result:{rows:[row],terrainStatus:'applied'},portionResults:[{id:'p',rows:[row]}]}}};
 const packed=packTerrainRowMirror(logical);assert.ok(packed.terrain.rowMirrorStorage);
 const manual={id:'manual',label:'Manual',geometry},unfinished={id:'unfinished',label:'Incomplete',geometry:null};
 const original=payload([packed,manual,unfinished]),expected=payload([logical,manual,unfinished]);
 for(const method of ['getSharedProjectReport','getPublicProjectByCode']){
  const {backend}=backendFor(original),result=await (method==='getSharedProjectReport'?backend[method](reportId,token):backend[method]('VO-1234567'));
  assert.deepEqual(result,expected);assert.ok(original.fields[0].terrain.rowMirrorStorage);assert.notEqual(result.fields[0].terrain.applied.result.rows,packed.terrain.applied.portionResults[0].rows);
 }
});
test('ordinary manual administration and shared loading preserve fields and saved metrics',async()=>{
 const manual=[{id:'manual',label:'Manual',geometry,metrics:{areaM2:100,netAreaM2:90,simulatedPlants:30,commercialPlants25:50,rowCount:3,rowLinearM:30}},{id:'unfinished',label:'Incomplete',geometry:null}];
 admin.resetMetricCalls();const rows=admin.expandProjectFields([{id:'ordinary',field_plans:manual}]);
 assert.equal(admin.readMetricCalls(),0);assert.deepEqual(rows.map(row=>row.fieldId),['manual','unfinished']);assert.equal(rows[0].areaM2,100);assert.equal(rows[0].commercialPlants,50);assert.equal(rows[0].rowCount,3);
 const original=payload(manual),{backend}=backendFor(original);
 for(const url of [sharedUrl,publicUrl]){const result=await loadSharedProject({url,backend});assert.equal(result.state,'ready');assert.deepEqual(result.payload,original);}
});
