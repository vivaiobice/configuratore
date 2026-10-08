import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createScopedTerrainCutEvaluator} from '../src/terrain-contour-design.js?v=1.3.1';
import {attachTerrainRestore} from '../src/terrain-history.js?v=1.3.1';
import {createTerrainController} from '../src/terrain-controller.js';
import {runTerrainProposal} from '../src/terrain-worker-client.js';
import {ensureProjectFields} from '../src/fields.js';
import {calculateProject} from '../src/project-calculator.js';
import {loadDraft} from '../src/storage.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createNativeAppHarness} from './helpers/terrain-native-app-harness.mjs';

// These cases catch the false completion after a real saved native Restore:
// actual app reconciliation retires the selected child and must remain owned.
// CREATE, attachment, worker transport, parent acceptance, SAVE and reload are
// genuine; no native history or successful numerical proposal is fabricated.
const clone=value=>structuredClone(value);
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const materialize=(project,proposal)=>({...project,...proposal.projectPatch,terrain:proposal.terrain,rowPortions:proposal.rowPortions});
let genuinePrior;
function priorNativeGroup(){
 if(genuinePrior)return genuinePrior;
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 project.localProjectId='worker-native-project';project.activeFieldId='worker-native-field';
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
 const budget=createTerrainBudget({kind:'cut'}),evaluator=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget});
 assert.equal(evaluator.noCutFamily.ok,true,evaluator.noCutFamily.ok?'':`SETUP actual no-cut family: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 const candidate=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 assert.equal(candidate.ok,true,candidate.ok?'':`SETUP real create producer: ${JSON.stringify(candidate)}`);
 assert.equal(candidate.isSplit,true,'SETUP actual saved group is split');
 const attached=attachTerrainRestore({project,proposal:candidate,operationId:'prior-create',budget});
 console.info('native-worker-setup',JSON.stringify({usage:budget.usage(),after:attached.cutOperation.afterPortionIds}));
 genuinePrior={project:materialize(project,attached),model,rows:attached.result.rows};return genuinePrior;
}

// This boundary invokes the actual worker's real handler and performs the two
// actual transport clones. It does not replace any numerical/history producer.
let actualWorkerHandler;
async function loadWorkerHandler(){
 if(actualWorkerHandler)return;
 const previous=globalThis.self;globalThis.self={postMessage(){}};
 try{await import('../src/terrain-worker.js?native-worker-success-test');actualWorkerHandler=self.onmessage;}
 finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
}
function actualWorkerTransport(observed){
 return class Worker {
  constructor(){this.terminations=0;observed.instances.push(this);}
  postMessage(options){
   this.sent=clone(options);
   setImmediate(()=>{
    if(this.terminations)return;
    const previous=globalThis.self;
    globalThis.self={postMessage:message=>{const copy=clone(message);observed.messages.push(copy);this.onmessage?.({data:copy});}};
    try{actualWorkerHandler({data:this.sent});}
    catch(error){this.onerror?.(error);}
    finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
   });
  }
  terminate(){this.terminations++;}
 };
}

test('explicit-source control: genuine native Restore completes after actual app selection reconciliation',async()=>{
 const prior=priorNativeGroup();await loadWorkerHandler();
 const initialState={project:ensureProjectFields({...clone(prior.project),fields:[{...clone(prior.project),id:prior.project.activeFieldId}]})};
 const entries=initialState.project.terrain.history.entries.filter(entry=>entry.kind==='cut'&&entry.before?.cut?.protocolVersion===1&&entry.before.cut.groupId==='road');
 assert.equal(entries.length,1,'SETUP one genuine native create history owner');
 const entry=entries[0],sourceId=entry.before.cut.sourceId,child=initialState.project.rowPortions.find(portion=>portion.id!==sourceId&&entry.affectedIds.includes(portion.id));
 assert.ok(child,'SETUP real create produced a distinct selected child');
 let writes=0,rendered=0,controller;
 const memory=new Map(),storage={setItem:(key,value)=>{writes++;memory.set(key,value);},getItem:key=>memory.get(key)};
 const observed={instances:[],messages:[]},WorkerImpl=actualWorkerTransport(observed),{document}=parseHTML('<section id="terrain-card"></section>');
 const app=createNativeAppHarness({state:initialState,storage,ownerId:'worker-native-owner',portionId:child.id,reconcilePortionSelection:true,
  onCalculateAndRender:api=>{
   assert.equal(writes,1,'actual Restore app render follows its synchronous saved checkpoint');
   assert.equal(api.portionId,sourceId,'actual app reconciliation selects the restored original source after its child retires');
   rendered++;void controller.refresh();
  }
 });
 controller=createTerrainController({document,getProject:()=>app.state.project,getContext:app.getContext,getPortionId:()=>app.portionId,getResult:()=>app.latestMetrics??app.state.project.terrain?.applied?.result,
  loadTerrain:async()=>prior.model,summarize:async()=>({valid:true}),covers:async()=>true,
  runProposal:(options,control)=>runTerrainProposal(options,{...control,WorkerImpl}),getCheckpointSnapshot:app.getCheckpointSnapshot,onProposalChange:app.onProposalChange,applyProposal:app.applyProposal
 });
 app.bindController(controller);
 try{
  await controller.refresh();assert.equal(controller.getState().portionId,child.id);assert.equal(controller.getState().restoreAvailability.available,true);
  const proposal=await controller.restore(),reply=observed.messages.findLast(message=>message.type==='result');
  assert.equal(reply?.proposal?.ok,true,reply?.proposal?.ok===true?'':`INTEGRATION actual native Restore producer: ${JSON.stringify(reply?.proposal)}`);
  assert.equal(proposal?.ok,true,proposal?.ok===true?'':`INTEGRATION actual Restore parent: ${JSON.stringify(controller.getState().lastProposalOutcome)}`);
  assert.equal(proposal.kind,'restore');assert.equal(proposal.rowPortions.some(portion=>portion.id===sourceId),true);assert.equal(proposal.rowPortions.some(portion=>portion.id===child.id),false);
  assert.equal(writes,0,'Restore proposal is readonly until explicit Apply');
  const applied=await controller.apply();
  // Establish the real saved/reconciled behavior before checking the reported
  // completion. A false return after this commit is the concrete regression.
  assert.equal(writes,1);assert.equal(rendered,1);assert.equal(app.portionId,sourceId);
  assert.equal(app.state.project.rowPortions.some(portion=>portion.id===child.id),false);
  assert.equal(app.state.project.exclusions.some(member=>member.passageGroupId==='road'),false);
  assert.equal(app.state.project.terrain.history.entries.some(saved=>saved.operationId===entry.operationId),false);
  assert.equal(loadDraft(storage).project.rowPortions.some(portion=>portion.id===sourceId),true);
  assert.equal(applied,true,'a genuine native Restore that saved and retired its selected child must complete successfully');
  assert.equal(controller.getState().statusKind,'applied');assert.equal(controller.getState().proposal,null);assert.equal(observed.instances.length,1);
 }finally{app.dispose();controller.destroy();}
});

const genuineImplicitPriors=new Map();
function priorNativeGroupWithBaselinePresence(presence){
 if(genuineImplicitPriors.has(presence))return genuineImplicitPriors.get(presence);
 assert.ok(['missing','empty'].includes(presence));
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 project.localProjectId=`worker-native-${presence}-project`;project.activeFieldId=`worker-native-${presence}-field`;
 if(presence==='missing')delete project.rowPortions;
 assert.equal(Object.hasOwn(project,'rowPortions'),presence==='empty','SETUP original raw baseline presence precedes all geometry/history construction');
 const baseline=calculateProject({...project,polygon:project.geometry});
 assert.equal(baseline.portions.length,1,'SETUP actual calculator supplies one implicit default source');
 const sourceId=baseline.portions[0].id,original=JSON.stringify(project);
 const budget=createTerrainBudget({kind:'cut'}),evaluator=createScopedTerrainCutEvaluator({project,model,portionId:sourceId,budget});
 assert.equal(evaluator.noCutFamily.ok,true,evaluator.noCutFamily.ok?'':`SETUP ${presence} actual no-cut family: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 const candidate=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 assert.equal(candidate.ok,true,candidate.ok?'':`SETUP ${presence} real create producer: ${JSON.stringify(candidate)}`);
 const attached=attachTerrainRestore({project,proposal:candidate,operationId:`prior-create-${presence}`,budget});
 const entry=attached.terrain.history.entries.find(saved=>saved.operationId===`prior-create-${presence}`);
 assert.equal(entry.before.source.rowPortionsPresence,presence,'SETUP actual native history captures the genuine original raw presence');
 assert.equal(entry.before.cut.sourceId,sourceId,'SETUP native authority retains the actual calculator source identity');
 assert.equal(JSON.stringify(project),original,'SETUP original raw declaration is never mutated after capture');
 console.info('native-implicit-worker-setup',JSON.stringify({presence,sourceId,usage:budget.usage(),after:attached.cutOperation.afterPortionIds}));
 const prior={project:materialize(project,attached),model,sourceId};genuineImplicitPriors.set(presence,prior);return prior;
}

for(const presence of ['missing','empty'])for(const selectionTarget of ['created child','original source'])test(`genuine native Restore from ${selectionTarget} preserves ${presence} implicit baseline and completes after actual app selection reconciliation`,async()=>{
 const prior=priorNativeGroupWithBaselinePresence(presence);await loadWorkerHandler();
 const initialState={project:ensureProjectFields({...clone(prior.project),fields:[{...clone(prior.project),id:prior.project.activeFieldId}]})};
 const entries=initialState.project.terrain.history.entries.filter(entry=>entry.kind==='cut'&&entry.before?.cut?.protocolVersion===1&&entry.before.cut.groupId==='road');
 assert.equal(entries.length,1,'SETUP one genuine native owner');
 const entry=entries[0],child=initialState.project.rowPortions.find(portion=>portion.id!==prior.sourceId&&entry.affectedIds.includes(portion.id));
 assert.ok(child,'SETUP actual implicit-baseline creation produced a distinct child');
 const selectedId=selectionTarget==='original source'?prior.sourceId:child.id;
 assert.equal(entry.before.source.rowPortionsPresence,presence);
 let writes=0,rendered=0,controller;
 const memory=new Map(),storage={setItem:(key,value)=>{writes++;memory.set(key,value);},getItem:key=>memory.get(key)};
 const observed={instances:[],messages:[]},WorkerImpl=actualWorkerTransport(observed),{document}=parseHTML('<section id="terrain-card"></section>');
 const app=createNativeAppHarness({state:initialState,storage,ownerId:`worker-native-${presence}-owner`,portionId:selectedId,reconcilePortionSelection:true,
  onCalculateAndRender:api=>{
   assert.equal(writes,1,'actual app reconciliation follows one saved checkpoint');
   assert.equal(api.portionId,null,'actual app disables selection for one implicit default source');
   assert.equal(api.latestMetrics.portions.length,1);assert.equal(api.latestMetrics.portions[0].id,prior.sourceId);
   rendered++;void controller.refresh();
  }
 });
 controller=createTerrainController({document,getProject:()=>app.state.project,getContext:app.getContext,getPortionId:()=>app.portionId,getResult:()=>app.latestMetrics??app.state.project.terrain?.applied?.result,
  loadTerrain:async()=>prior.model,summarize:async()=>({valid:true}),covers:async()=>true,
  runProposal:(options,control)=>runTerrainProposal(options,{...control,WorkerImpl}),getCheckpointSnapshot:app.getCheckpointSnapshot,onProposalChange:app.onProposalChange,applyProposal:app.applyProposal
 });
 app.bindController(controller);
 try{
  await controller.refresh();assert.equal(controller.getState().portionId,selectedId);assert.equal(controller.getState().restoreAvailability.available,true);
  const proposal=await controller.restore(),reply=observed.messages.findLast(message=>message.type==='result');
  assert.equal(reply?.proposal?.ok,true,reply?.proposal?.ok===true?'':`INTEGRATION ${presence} actual Restore producer: ${JSON.stringify(reply?.proposal)}`);
  assert.equal(proposal?.ok,true,proposal?.ok===true?'':`INTEGRATION ${presence} actual Restore parent: ${JSON.stringify(controller.getState().lastProposalOutcome)}`);
  assert.equal(proposal.kind,'restore');assert.equal(proposal.rowPortions.length,0);assert.equal(writes,0);
  const applied=await controller.apply();
  assert.equal(writes,1);assert.equal(rendered,1);assert.equal(app.portionId,null);
  const restored=app.state.project,saved=loadDraft(storage).project;
  const savedActive=saved.fields.find(field=>field.id===saved.activeFieldId);
  console.info('default-restore-before-boot',JSON.stringify({presence,liveTerrain:Boolean(restored.terrain),savedTerrain:Boolean(saved.terrain),savedActiveTerrain:Boolean(savedActive.terrain),liveRawPresence:Object.hasOwn(restored,'rowPortions'),savedRawPresence:Object.hasOwn(saved,'rowPortions'),savedActiveRawPresence:Object.hasOwn(savedActive,'rowPortions')}));
  // Durable serialization intentionally stores the terrain only in its active
  // field. Inspect raw SAVE presence before actual app boot remirrors defaults.
  for(const project of [restored,saved]){
   assert.equal(Object.hasOwn(project,'rowPortions'),presence==='empty','real save/reload preserves original missing versus empty presence');
   if(presence==='empty')assert.deepEqual(project.rowPortions,[]);
   assert.equal(project.exclusions.some(member=>member.passageGroupId==='road'),false);
   const active=project.fields.find(field=>field.id===project.activeFieldId);
   assert.equal(Object.hasOwn(active,'rowPortions'),presence==='empty','active field mirror retains the same original presence');
  }
  const reloaded=ensureProjectFields(saved);
  for(const project of [restored,reloaded]){
   assert.ok(project.terrain,'actual live/boot-remirrored project retains the restored terrain');
   assert.equal(project.terrain.history.entries.some(saved=>saved.operationId===entry.operationId),false);
   assert.equal(project.terrain.applied.result.portions.length,1);assert.equal(project.terrain.applied.result.portions[0].id,prior.sourceId);
  }
  assert.equal(controller.getState().portionId,prior.sourceId,'controller fallback uses the genuine restored result source without a raw selected ID');
  console.info('default-restore-observed',JSON.stringify({presence,selectionTarget,selectedId,applied,writes,rendered,selection:app.portionId,sourceId:prior.sourceId,workerUsage:reply.usage}));
  assert.equal(applied,true,`a genuine ${presence}-baseline native Restore from ${selectionTarget} must complete successfully after its saved selection reconciliation`);
  assert.equal(controller.getState().statusKind,'applied');assert.equal(controller.getState().proposal,null);assert.equal(observed.instances.length,1);
 }finally{app.dispose();controller.destroy();}
});
