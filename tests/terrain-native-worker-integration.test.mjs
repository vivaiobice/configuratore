import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainController} from '../src/terrain-controller.js';
import {runTerrainProposal} from '../src/terrain-worker-client.js';

const algorithmVersion='terrain-contour-family-1';
const clone=value=>structuredClone(value);
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const model=createTerrainModel({acquiredAt:'2026-10-06T00:00:00.000Z',grid:{width:2,height:2,origin:[500000,5000005],step:[5,-5],values:[1,1,0,0]}});
const geometry=ring([[20,20],[25,20],[25,25],[20,25],[20,20]]);
const project={localProjectId:'project',activeFieldId:'field',geometry,exclusions:[],rowPortions:[{id:'source',geometry:[geometry]}],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowCurvePoints:[],maintainRowEquidistance:true};
const cutOptions=extra=>({algorithmVersion,kind:'cut',operationId:'native-operation',cutRequest:{action:'suggest'},project:clone(project),model:clone(model),portionId:'source',...extra});

// The genuine worker handler runs its actual numerical failure path. The
// controlled self boundary only captures postMessage; no producer is replaced.
let workerHandler;
async function dispatch(options){
 const previous=globalThis.self,messages=[];
 globalThis.self={postMessage:value=>messages.push(clone(value))};
 try{
  if(!workerHandler){await import('../src/terrain-worker.js?native-worker-integration-test');workerHandler=self.onmessage;}
  await workerHandler({data:options});
  return messages;
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
}

function transport(options,control={}){
 const instances=[],timers=[],cleared=[];
 class Worker {
  constructor(){this.terminations=0;instances.push(this);}
  postMessage(value){this.sent=clone(value);}
  terminate(){this.terminations++;}
 }
 const pending=runTerrainProposal(options,{WorkerImpl:Worker,clock:()=>0,setTimeoutImpl:(callback,delay)=>{const timer={callback,delay};timers.push(timer);return timer;},clearTimeoutImpl:timer=>cleared.push(timer),...control});
 return {pending,instances,timers,cleared,deliver:value=>instances[0]?.onmessage({data:value})};
}
const usage={nodeCount:42,elapsedMs:200,remainingMs:59800};
const failedProposal={ok:false,status:'uncovered',kind:'cut',message:'Anonymous uncovered field.'};
const typedFailure=(extra={})=>({type:'result',operationId:'native-operation',proposal:clone(failedProposal),usage:clone(usage),...extra});

test('native cut worker checks an expired shared budget before producer dispatch',async()=>{
 const before=JSON.stringify(project),messages=await dispatch(cutOptions({deadlineMs:0})),reply=messages.at(-1);
 assert.equal(reply.type,'result');
 assert.equal(reply.proposal.ok,false);
 assert.equal(reply.proposal.status,'budget-exceeded','cut must not bypass its genuine zero deadline as unsupported');
 assert.equal(reply.proposal.result,undefined);
 assert.equal(reply.proposal.projectPatch,undefined);
 assert.equal(reply.operationId,'native-operation');
 assert.equal(reply.usage.remainingMs,0);
 assert.equal(JSON.stringify(project),before);
});

test('native cut worker reaches the actual acquired-support rejection and returns accounting',async()=>{
 const messages=await dispatch(cutOptions()),reply=messages.at(-1);
 assert.equal(reply.proposal.ok,false);
 assert.equal(reply.proposal.status,'uncovered','the actual outside-S project must reach the real cut producer');
 assert.equal(reply.proposal.result,undefined);
 assert.equal(reply.proposal.projectPatch,undefined);
 assert.equal(reply.operationId,'native-operation');
 assert.equal(Number.isSafeInteger(reply.usage.nodeCount),true);
 assert.ok(reply.usage.nodeCount>0);
 assert.ok(reply.usage.elapsedMs>=0);
 assert.ok(reply.usage.remainingMs<=60000);
 assert.equal(messages.some(message=>message.type==='progress'&&message.phase==='cut-search-baseline'),true);
});

test('native endpoint envelope resolves exclusionId at the real project boundary before evaluating terrain',async()=>{
 const messages=await dispatch(cutOptions({cutRequest:{action:'endpoint',exclusionId:'missing-exclusion',endpointIndex:0,coordinate:geometry[0]}})),reply=messages.at(-1);
 assert.equal(reply.type,'result');assert.equal(reply.proposal.ok,false);assert.equal(reply.proposal.status,'invalid-input');
 assert.equal(reply.proposal.message,'Il passaggio selezionato è cambiato.','the allocated exclusionId API must reach actual member lookup instead of being rejected as the old request shape');
 assert.equal(reply.operationId,'native-operation');assert.equal(Number.isSafeInteger(reply.usage.nodeCount),true);
 assert.equal(reply.proposal.result,undefined);assert.equal(reply.proposal.projectPatch,undefined);
});

test('native cut worker carries spent nodes instead of restarting a fresh allowance',async()=>{
 const messages=await dispatch(cutOptions({initialNodeCount:500000})),reply=messages.at(-1);
 assert.equal(reply.proposal.ok,false);
 assert.equal(reply.proposal.status,'budget-exceeded');
 assert.equal(reply.proposal.result,undefined);
 assert.equal(reply.proposal.projectPatch,undefined);
 assert.ok(reply.usage.nodeCount>=500000,'worker accounting must include the submitted cumulative seed');
});

test('native cut transport rejects missing accounting rather than accepting a direct legacy reply',async()=>{
 for(const reply of [clone(failedProposal),{type:'result',operationId:'native-operation',proposal:clone(failedProposal)}]){
  const received=[],f=transport(cutOptions(),{onBudgetUsage:value=>received.push(value)});
  f.deliver(reply);const result=await f.pending;
  assert.equal(result.ok,false);
  assert.equal(result.status,'invalid-transport','an explicit cut cannot obtain a fresh parent allowance from an unaccounted reply');
  assert.deepEqual(received,[]);
  assert.equal(f.instances[0].terminations,1);
 }
});

test('native cut transport rejects malformed usage and mismatched operation identity',async()=>{
 const invalid=[
  {operationId:'other-operation'},
  {usage:null},
  {usage:{...usage,nodeCount:-1}},
  {usage:{...usage,nodeCount:1.5}},
  {usage:{...usage,nodeCount:'42'}},
  {usage:{...usage,elapsedMs:-1}},
  {usage:{...usage,elapsedMs:NaN}},
  {usage:{...usage,remainingMs:Infinity}},
  {usage:{...usage,remainingMs:60001}},
  {usage:{...usage,elapsedMs:200,remainingMs:59900}},
 ];
 for(const patch of invalid){
  const received=[],f=transport(cutOptions(),{onBudgetUsage:value=>received.push(value)});
  f.deliver(typedFailure(patch));const result=await f.pending;
  assert.equal(result.status,'invalid-transport',JSON.stringify(patch));
  assert.deepEqual(received,[]);
  assert.equal(f.instances[0].terminations,1);
 }
});

test('native cut transport rejects an invalid cumulative node seed before worker creation',async()=>{
 for(const initialNodeCount of [-1,1.5,'42',500001,NaN]){
  const f=transport(cutOptions({initialNodeCount}));
  if(f.instances.length)f.deliver(typedFailure());
  const result=await f.pending;
  assert.equal(result.status,'invalid-input');
  assert.equal(f.instances.length,0,'invalid accounting must not start numeric work');
  assert.equal(f.timers.length,0);
 }
});

test('native cut transport rejects worker accounting that drops previously charged nodes',async()=>{
 const received=[],f=transport(cutOptions({initialNodeCount:50}),{onBudgetUsage:value=>received.push(value)});
 f.deliver(typedFailure());
 assert.equal((await f.pending).status,'invalid-transport');
 assert.deepEqual(received,[]);
 assert.equal(f.instances[0].terminations,1);
});

test('native cut transport bounds parent continuation by total client time only once',async()=>{
 let now=1000;const received=[],f=transport(cutOptions(),{clock:()=>now,onBudgetUsage:value=>received.push(value)});
 now=1220;f.deliver(typedFailure());
 assert.deepEqual(await f.pending,failedProposal);
 assert.deepEqual(received,[{nodeCount:42,elapsedMs:220,remainingMs:59780}]);
 assert.equal(f.instances[0].terminations,1);
 assert.equal(Object.hasOwn(f.instances[0].sent,'usage'),false,'transport accounting is never saved or sent as a native proof');
});

test('native cut transport preserves the smaller worker remainder and contains observer failure',async()=>{
 let now=0,calls=0;const f=transport(cutOptions({deadlineMs:1000}),{clock:()=>now,onBudgetUsage:value=>{calls++;assert.deepEqual(value,{nodeCount:42,elapsedMs:800,remainingMs:200});throw new Error('observer diagnostic');}});
 now=300;
 assert.doesNotThrow(()=>f.deliver(typedFailure({usage:{nodeCount:42,elapsedMs:800,remainingMs:200}})));
 assert.deepEqual(await f.pending,failedProposal);
 assert.equal(calls,1);
 assert.equal(f.instances[0].terminations,1);
});

// Only transport timing is doubled below. Real controller identity, acquisition,
// signal ownership, result handling and the real client termination stay active.
// No successful native proposal, rows, quantity or history is fabricated.
function controllerFixture(extra={}){
 const {document}=parseHTML('<section id="terrain-card"></section>');
 const instances=[],timers=[];let loads=0,saves=0;
 class Worker {
  constructor(){this.terminations=0;instances.push(this);}
  postMessage(value){this.sent=clone(value);}
  terminate(){this.terminations++;}
 }
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({owner:'owner',projectId:'project',fieldId:'field'}),getPortionId:()=> 'source',loadTerrain:async()=>{loads++;return model;},summarize:async()=>({valid:true}),covers:async()=>true,runProposal:(options,control)=>runTerrainProposal(options,{...control,WorkerImpl:Worker,setTimeoutImpl:(callback,delay)=>{const timer={callback,delay};timers.push(timer);return timer;},clearTimeoutImpl:()=>{}}),applyProposal:()=>{saves++;return true;},...extra});
 const failLatest=()=>instances.at(-1)?.onmessage({data:{type:'result',proposal:{ok:false,kind:'measure',status:'review-required'}}});
 return {controller,instances,timers,loads:()=>loads,saves:()=>saves,failLatest};
}

test('controller external abort physically terminates the owned pending worker and settles without preview',async()=>{
 const f=controllerFixture(),external=new AbortController();
 try{
  await f.controller.refresh();const pending=f.controller.propose({mode:'manual'},{signal:external.signal});await turn();
  assert.equal(f.instances.length,1,'setup reached the real worker transport');
  external.abort();await turn();
  const terminations=f.instances[0].terminations;
  // Settle the old implementation as well, so a genuine RED never hangs.
  if(terminations===0)f.failLatest();
  await pending;
  assert.equal(terminations,1,'dialog abort must reach Worker.terminate before dialog completion');
  assert.equal(f.controller.getState().busy,false);
  assert.equal(f.controller.getState().proposal,null);
  assert.equal(f.saves(),0);
 }finally{f.controller.destroy();}
});

test('controller rejects an already aborted external request before acquisition or worker creation',async()=>{
 const f=controllerFixture(),external=new AbortController();external.abort();
 try{
  const pending=f.controller.propose({mode:'manual'},{signal:external.signal});await turn();
  const loads=f.loads(),workers=f.instances.length;
  if(workers)f.failLatest();
  await pending;
  assert.equal(loads,0,'pre-aborted editor work must not start acquisition');
  assert.equal(workers,0);
  assert.equal(f.controller.getState().proposal,null);
  assert.equal(f.saves(),0);
 }finally{f.controller.destroy();}
});

test('settled request removes its external abort ownership before a newer worker starts',async()=>{
 const f=controllerFixture(),external=new AbortController();
 try{
  await f.controller.refresh();const first=f.controller.propose({mode:'manual'},{signal:external.signal});await turn();f.failLatest();await first;
  const next=f.controller.propose({mode:'manual'});await turn();assert.equal(f.instances.length,2);
  external.abort();await turn();assert.equal(f.instances[1].terminations,0,'a closed old editor must not cancel a new worker');
  f.failLatest();await next;
  assert.equal(f.controller.getState().proposal,null);assert.equal(f.saves(),0);
 }finally{f.controller.destroy();}
});

test('controller contains transient budget observer failure without orphaning native failed transport',async()=>{
 const observations=[];
 const f=controllerFixture({onBudgetUsage:value=>{observations.push(value);throw new Error('diagnostic observer');}});
 try{
  await f.controller.refresh();const pending=f.controller.propose({kind:'cut',cutRequest:{action:'suggest'}});await turn();
  const worker=f.instances[0],request=worker.sent;
  worker.onmessage({data:typedFailure({operationId:request.operationId,usage:{nodeCount:request.initialNodeCount+42,elapsedMs:100,remainingMs:Math.max(0,request.deadlineMs-100)}})});
  assert.equal((await pending).status,'uncovered');assert.equal(observations.length,1);assert.equal(observations[0].phase,'worker-result');assert.equal(worker.terminations,1);
  assert.equal(f.controller.getState().proposal,null);assert.equal(f.controller.getState().busy,false);assert.equal(f.saves(),0);
 }finally{f.controller.destroy();}
});
