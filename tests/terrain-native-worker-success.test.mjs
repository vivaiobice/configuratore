import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createScopedTerrainCutEvaluator} from '../src/terrain-contour-design.js?v=1.3.6';
import {attachTerrainRestore} from '../src/terrain-history.js?v=1.3.6';
import {createTerrainController} from '../src/terrain-controller.js';
import {runTerrainProposal} from '../src/terrain-worker-client.js';
import {ensureProjectFields} from '../src/fields.js';
import {terrainGeometryInputHash} from '../src/terrain-replay.js';
import {loadDraft} from '../src/storage.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createNativeAppHarness} from './helpers/terrain-native-app-harness.mjs';

const clone=value=>structuredClone(value);
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const materialize=(project,proposal)=>({...project,...proposal.projectPatch,terrain:proposal.terrain,rowPortions:proposal.rowPortions});
const hash=value=>createHash('sha256').update(value).digest('hex');
async function writeObservedSuccess(path,observation){
 const pending=[new URL(import.meta.url)],sources=new Map(),base=fileURLToPath(new URL('../',import.meta.url));
 const relativeModule=/['"]((?:\.{1,2}\/)[^'"]+\.(?:mjs|js)(?:\?[^'"]*)?)['"]/g;
 while(pending.length){
  const url=pending.pop();url.search='';const name=fileURLToPath(url);
  if(sources.has(name))continue;
  const bytes=await readFile(url);sources.set(name,hash(bytes));
  for(const match of bytes.toString().matchAll(relativeModule))pending.push(new URL(match[1],url));
 }
 const sourceHashes=Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>[name.slice(base.length),value]));
 await writeFile(path,JSON.stringify({kind:'observed-native-worker-success-fixture',observation,sourceHashes,operationLedgerHash:hash(JSON.stringify(observation.operation))},null,2)+'\n');
}
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

test('genuine endpoint worker reaches native parent preview and checkpoints the exact retry once',async()=>{
 const prior=priorNativeGroup();await loadWorkerHandler();
 const {document}=parseHTML('<section id="terrain-card"></section>');
 const foreignSeed={id:'foreign-field',label:'Unchanged foreign',geometry:prior.project.geometry,rowPortions:[],terrain:null,custom:{keep:'raw'}};
 // The real app has already normalized its full active/foreign field state.
 // Capture the actual resulting foreign definition before the operation.
 const initialState={project:ensureProjectFields({...clone(prior.project),fields:[{...clone(prior.project),id:prior.project.activeFieldId},clone(foreignSeed)]})};
 assert.equal(terrainGeometryInputHash(initialState.project,prior.model),terrainGeometryInputHash(prior.project,prior.model),'SETUP production field normalization leaves genuine global geometric inputs unchanged');
 let workspace={note:'workspace retained'},writes=0;
 const foreign=clone(initialState.project.fields.find(field=>field.id==='foreign-field'));
 const memory=new Map(),storage={setItem:(key,value)=>{writes++;memory.set(key,value);},getItem:key=>memory.get(key)};
 const observed={instances:[],messages:[],snapshots:0,budgets:[],readyProposal:null,committedRenders:0},WorkerImpl=actualWorkerTransport(observed),external=new AbortController(),dismiss=new AbortController();
 const original=JSON.stringify(initialState),members=initialState.project.exclusions.filter(member=>member.passageGroupId==='road'),member=members.at(-1),owner=members.find(member=>member.surfaceGroupOwner===true);
 assert.ok(member&&owner,'SETUP actual saved native owner/member');
 let controller;
 const app=createNativeAppHarness({state:initialState,storage,ownerId:'worker-native-owner',captureWorkspace:()=>workspace,
  onPreview:proposal=>{
   if(proposal?.ok===true){observed.readyProposal=proposal;workspace={note:'x'.repeat(4*1024*1024)};}
  },
  onCalculateAndRender:api=>{
   assert.equal(writes,1,'actual app renders only after the successful synchronous checkpoint');
   assert.equal(api.pending?.committed,true,'actual app releases endpoint cancellation before committed render teardown');
   observed.committedRenders++;external.abort();dismiss.abort();void controller.refresh();
  }
 });
 controller=createTerrainController({document,getProject:()=>app.state.project,getContext:app.getContext,getPortionId:()=>app.portionId,getResult:()=>app.state.project.terrain?.applied?.result,
  loadTerrain:async()=>prior.model,summarize:async()=>({valid:true}),covers:async()=>true,
  runProposal:(options,control)=>runTerrainProposal(options,{...control,WorkerImpl}),
  onBudgetUsage:value=>observed.budgets.push(value),
  getCheckpointSnapshot:candidateProject=>{observed.snapshots++;return app.getCheckpointSnapshot(candidateProject);},
  onProposalChange:app.onProposalChange,applyProposal:app.applyProposal
 });
 app.bindController(controller);
 try{
  await controller.refresh();
  const coordinate=geographic([[4.5,11]])[0];
  const request={exclusionId:member.id,endpointIndex:1,coordinate};
  let firstFailure;
  try{await app.applyEndpoint(request,{signal:external.signal,dismissSignal:dismiss.signal});}catch(error){firstFailure=error;}
  const candidate=observed.readyProposal;
  const reply=observed.messages.findLast(message=>message.type==='result');
  assert.equal(reply?.proposal?.ok,true,reply?.proposal?.ok===true?'':`INTEGRATION actual endpoint producer/attachment: ${JSON.stringify({proposal:reply?.proposal,usage:reply?.usage,appFailure:firstFailure?.message})}`);
  assert.equal(candidate?.ok,true,candidate?.ok===true?'':`INTEGRATION native parent acceptance: ${JSON.stringify({outcome:controller.getState().lastProposalOutcome,budgets:observed.budgets,appFailure:firstFailure?.message})}`);
  assert.match(firstFailure?.message??'',/salvataggio del passaggio/,'actual app direct Apply fails quota only after a genuine ready preview');
  assert.equal(candidate.cutOperation.action,'replace');assert.equal(candidate.cut.widthM,owner.widthM);
  assert.equal(candidate.comparison.baselineCertified,false,'explicit endpoint replacement does not evaluate a fresh no-road family');
  assert.equal(candidate.comparison.noCutServedAreaM2,null);assert.equal(candidate.comparison.servedAreaGainM2,null);assert.equal(candidate.comparison.improved,null);
  assert.equal(candidate.comparison.referenceQualification,'not-evaluated-for-explicit-endpoint-replacement');
  assert.ok(Number.isFinite(candidate.comparison.cutServedAreaM2)&&candidate.comparison.cutServedAreaM2>0,'new owned children retain their actual private service measurement');
  assert.deepEqual(candidate.cut.sourceAxis,[owner.sourceAxis[0],coordinate]);
  assert.equal(controller.getState().proposal,candidate);assert.equal(controller.getState().canApply,true);assert.equal(controller.getState().statusKind,'error');
  assert.equal(app.pending?.proposal,candidate,'failed actual app Apply keeps the exact prepared endpoint candidate');
  assert.ok(observed.snapshots>0,'native ready checks the actual full checkpoint envelope');
  assert.equal(JSON.stringify(app.state),original,'ready and failed Apply leave the live project and foreign field untouched');
  assert.equal(writes,0);assert.equal(observed.instances.length,1);assert.equal(observed.instances[0].terminations,1);
  assert.equal(Object.hasOwn(observed.instances[0].sent.project,'fields'),false,'foreign fields never enter the selected operation');
  assert.equal(observed.instances[0].sent.model,observed.instances[0].sent.project.terrain.model,'one structured clone retains the actual frozen model alias');
  assert.ok(reply.usage.nodeCount>=observed.instances[0].sent.initialNodeCount);
  assert.ok(reply.usage.nodeCount<=500000);assert.ok(reply.usage.remainingMs>0);
  const parentBudget=observed.budgets.find(value=>value.phase==='parent-preview');
  assert.ok(parentBudget.nodeCount>=reply.usage.nodeCount,'parent continuation carries actual output transport nodes');
  assert.ok(parentBudget.nodeCount<=500000);assert.ok(parentBudget.remainingMs>0);
  assert.equal(external.signal.aborted,false,'unsaved original editor request remains active for the genuine app retry');assert.equal(dismiss.signal.aborted,false);
  const alreadyAborted=new AbortController();alreadyAborted.abort();
  assert.equal(await controller.apply({signal:alreadyAborted.signal}),false,'an independently already aborted direct apply never checkpoints');assert.equal(writes,0);
  assert.equal(controller.getState().proposal,candidate,'preaborted Apply retains the same actual app pending proposal');
  workspace={note:'workspace retained'};
  assert.equal(await app.applyEndpoint(request,{signal:external.signal,dismissSignal:dismiss.signal}),true,'actual app retry applies the exact prepared proposal without regeneration');
  assert.equal(external.signal.aborted,true);assert.equal(dismiss.signal.aborted,true);assert.equal(observed.committedRenders,1,'own committed editor teardown does not cancel successful Apply');assert.equal(app.pending,null);
  assert.equal(writes,1);assert.equal(observed.instances.length,1);assert.equal(controller.getState().proposal,null);
  assert.equal(app.state.project.terrain.history.entries.filter(entry=>entry.kind==='cut').length,1);
  assert.deepEqual(app.state.project.fields[1],foreign);assert.deepEqual(loadDraft(storage).project.fields[1],foreign);
  assert.equal([...memory.values()].join('').match(/valuesBase64/g).length,1,'the saved active mirror contains one frozen grid');
  for(const forbidden of ['terrainApplyBudget','terrainOperationId','terrainSelectedPortionId','terrainNextPortionId','"usage"'])assert.equal([...memory.values()].join('').includes(forbidden),false,forbidden);
  const applyBudget=observed.budgets.findLast(value=>value.phase==='apply-validation');
  assert.ok(applyBudget.nodeCount>0&&applyBudget.nodeCount<=500000);assert.ok(applyBudget.remainingMs>0);
  console.info('native-worker-integration',JSON.stringify({usage:reply.usage,parentBudget,applyBudget,requestSeed:observed.instances[0].sent.initialNodeCount,writes,snapshots:observed.snapshots}));
  // Emit only after every actual producer/parent/checkpoint assertion passes.
  // This records observed data for readonly integration, not a new certificate.
  if(process.env.TERRAIN_NATIVE_SUCCESS_ARTIFACT){
   const request=observed.instances[0].sent;
   await writeObservedSuccess(process.env.TERRAIN_NATIVE_SUCCESS_ARTIFACT,{rawProject:JSON.parse(original).project,model:request.model,savedRows:prior.rows,readyProposal:candidate,savedState:app.state,operation:{operationId:request.operationId,algorithmVersion:request.algorithmVersion,cutRequest:request.cutRequest,requestSeed:request.initialNodeCount,workerUsage:reply.usage,parentBudget,applyBudget}});
  }
 }finally{app.dispose();controller.destroy();}
});
