import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js?v=1.3.10';
import {hashTerrainEnvelope,terrainGeometryInputHash,readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.10';
import {terrainInputHash} from '../src/terrain-model.js?v=1.3.10';
import {terrainCoreWidgetState,createTerrainCoreMount} from '../src/terrain-core-presentation.js?v=1.3.10';

// Count real reader entries; expose private hash routines only to construct a
// semantic forgery with valid outer hashes. No validator/result is replaced.
const historyUrl=new URL('../src/terrain-history.js',import.meta.url);
const historySource=readFileSync(historyUrl,'utf8')
 .replace('readTerrainEnvelope,readTerrainSavedAndLive,','readTerrainEnvelope,readTerrainSavedAndLive as actualReadTerrainSavedAndLive,')
 .replace(/from (['"])(\.\/[^'"]+)\1/g,(_m,_q,path)=>`from ${JSON.stringify(new URL(path,historyUrl).href)}`);
const historyData='data:text/javascript;base64,'+Buffer.from(historySource+`
let pairReads=0;
function readTerrainSavedAndLive(...args){pairReads++;return actualReadTerrainSavedAndLive(...args);}
export const testHooks={reads:()=>pairReads,reset:()=>{pairReads=0;},targetFingerprint,baselineHash};
`).toString('base64');
const history=await import(historyData);
const controllerUrl=new URL('../src/terrain-controller.js',import.meta.url);
const controllerSource=readFileSync(controllerUrl,'utf8').replace(/from (['"])(\.\/[^'"]+)\1/g,(_m,_q,path)=>`from ${JSON.stringify(path.startsWith('./terrain-history.js')?historyData:new URL(path,controllerUrl).href)}`);
const {createTerrainController}=await import('data:text/javascript;base64,'+Buffer.from(controllerSource).toString('base64'));
let saved;
function genuine(){
 if(!saved){
  const input=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
  const proposal=buildContourTerrainProposal(input);assert.equal(proposal.ok,true,proposal.message);
  const attached=history.attachTerrainRestore({project:input.project,proposal,operationId:'original'});
  saved={...input.project,rowPortions:attached.rowPortions,terrain:attached.terrain};
  assert.equal(readTerrainEnvelope(saved).terrainStatus,'applied');
 }
 return structuredClone(saved);
}
const portion=project=>project.rowPortions[0].id;
function controllerFor(project){
 const {document}=parseHTML('<section id="terrain-card"></section><div id="terrain-curve-controls"></div>');
 let controller,workerCalls=0,saves=0,readsAtWorker=0;
 const mount=createTerrainCoreMount({document,getController:()=>controller,getProject:()=>project,getMetrics:()=>project.terrain?.applied?.result});
 controller=createTerrainController({document,getProject:()=>project,getContext:()=>({fieldId:'f',ownerId:'owner'}),getPortionId:()=>portion(project),getResult:()=>project.terrain?.applied?.result,onStateChange:s=>mount.render(s),
  loadTerrain:async()=>project.terrain.model,covers:async()=>true,summarize:async()=>({valid:true}),
  runProposal:async()=>{workerCalls++;readsAtWorker=history.testHooks.reads();return {ok:false,status:'cancelled'};},applyProposal:()=>{saves++;return true;}});
 return {controller,document,mount,get workerCalls(){return workerCalls;},get saves(){return saves;},get readsAtWorker(){return readsAtWorker;},destroy(){mount.destroy();controller.destroy();}};
}

test('controller display checks genuine history without replay while public availability stays fresh and exact',()=>{
 const project=genuine(),ui=controllerFor(project);history.testHooks.reset();
 try{
  assert.equal(ui.controller.getState().restoreAvailability.reason,'pending-verification');
  assert.equal(history.testHooks.reads(),0);
  const authoritative=history.terrainRestoreAvailability({project,portionId:portion(project)});
  assert.equal(authoritative.reason,'exact');assert.equal(history.testHooks.reads(),1);
  ui.controller.getState();assert.equal(history.testHooks.reads(),1);
 }finally{ui.destroy();}
});
test('generic advisory preserves changed-context action and fails closed on malformed history or target',()=>{
 assert.equal(typeof history.terrainRestorePresentationAvailability,'function');
 const valid=genuine(),id=portion(valid),read=project=>history.terrainRestorePresentationAvailability({project,portionId:id});
 const changed=structuredClone(valid);changed.rowSpacingM++;assert.deepEqual(read(changed),{available:true,reason:'recompute-required',operationId:'original'});
 const missing=structuredClone(valid);delete missing.terrain.history;assert.equal(read(missing).reason,'no-baseline');
 for(const mutate of [p=>p.terrain.history=null,p=>p.terrain.history.entries[0].baselineHash='forged',p=>p.terrain.history.entries[0].before.portions[0].rows[0].lengthM++,p=>p.terrain.applied.result.rows[0].lengthM++,p=>delete p.terrain.applied,p=>delete p.terrain.model,p=>delete p.terrain.applied.inputs,p=>p.terrain.applied.inputs={},p=>p.terrain.applied.result.portions={},p=>p.terrain.applied.result.rows={},p=>p.terrain.applied.portionResults={},p=>p.terrain.applied.validation.valid=false,p=>p.terrain.applied.schemaVersion=99,p=>p.terrain.applied.schemaVersion=undefined,p=>p.terrain.applied.algorithmVersion='future',p=>p.exclusions={}]){
  const bad=structuredClone(valid);mutate(bad);assert.equal(read(bad).available,false);
 }
});
test('same-object mutations invalidate cached advisory availability',()=>{
 const project=genuine(),ui=controllerFor(project);history.testHooks.reset();
 try{
  assert.equal(ui.controller.getState().restoreAvailability.reason,'pending-verification');
  project.rowSpacingM++;assert.equal(ui.controller.getState().restoreAvailability.reason,'recompute-required');
  project.terrain.history.entries[0].baselineHash='forged';assert.equal(ui.controller.getState().restoreAvailability.available,false);
  assert.equal(history.testHooks.reads(),0);
 }finally{ui.destroy();}
});
test('pending verification maps to the existing restore action while unknown reasons remain unavailable',()=>{
 for(const [reason,kind] of [['pending-verification','proposal'],['recompute-required','proposal'],['exact','exact'],['future','unavailable']])assert.equal(terrainCoreWidgetState({restoreAvailability:{available:true,reason}}).restoreAvailability.kind,kind);
});
test('rehashing an altered numerical axis cannot authorize restore through the advisory button',async()=>{
 const project=genuine(),applied=project.terrain.applied;
 project.rowPortions[0].terrainDesign.axes[0].components[0].coordinatesXY[0][0]+=.1;
 applied.portionResults[0].design=structuredClone(project.rowPortions[0].terrainDesign);
 applied.inputs.rowPortions=structuredClone(project.rowPortions);
 applied.inputHash=terrainGeometryInputHash(project,project.terrain.model);
 applied.resultHash=terrainInputHash(applied.result);applied.snapshotHash=hashTerrainEnvelope(applied);
 const entry=project.terrain.history.entries[0];entry.afterFingerprint=history.testHooks.targetFingerprint(project,entry.affectedIds);entry.baselineHash=history.testHooks.baselineHash(entry);
 assert.doesNotThrow(()=>history.assertTerrainRestoreHistory({project}));assert.equal(readTerrainEnvelope(project).terrainStatus,'invalid');
 const ui=controllerFor(project);history.testHooks.reset();
 try{
  const state=ui.controller.getState();assert.equal(state.restoreAvailability.reason,'pending-verification');ui.mount.render(state);
  const button=ui.document.querySelector('[data-terrain-action="restore"]');assert.ok(button);assert.equal(button.disabled,false);
  button.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(history.testHooks.reads(),1,'actual click performs fresh authoritative saved/live verification');assert.equal(ui.workerCalls,0);assert.equal(ui.saves,0);
  assert.equal(ui.controller.getState().statusKind,'restore-conflict');
 }finally{ui.destroy();}
});
test('valid advisory restore still verifies freshly before invoking the worker',async()=>{
 const project=genuine(),ui=controllerFor(project);history.testHooks.reset();
 try{
  await ui.controller.restore();assert.equal(ui.workerCalls,1);assert.equal(ui.readsAtWorker,1);assert.equal(ui.saves,0);
 }finally{ui.destroy();}
});

test('advisory propagates explicit budget exhaustion and does not copy coordinates for context comparison',()=>{
 const project=genuine(),before=JSON.stringify(project),stop=Object.assign(new Error('exhausted'),{status:'budget-exceeded'});
 assert.throws(()=>history.terrainRestorePresentationAvailability({project,portionId:portion(project),budget:{check(){throw stop;}}}),error=>error===stop);
 const original=globalThis.structuredClone;let copies=0;
 try{
  globalThis.structuredClone=(...args)=>{copies++;return original(...args);};
  assert.equal(history.terrainRestorePresentationAvailability({project,portionId:portion(project),budget:{check(){}}}).reason,'pending-verification');
 }finally{globalThis.structuredClone=original;}
 assert.equal(copies,0);assert.equal(JSON.stringify(project),before);
});
