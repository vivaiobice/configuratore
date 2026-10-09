import test from 'node:test';
import assert from 'node:assert/strict';
import {runTerrainProposal} from '../src/terrain-worker-client.js';
import {createTerrainBudget} from '../src/terrain-budget.js';

const algorithmVersion='terrain-contour-family-1';
function transport(options={},dependencies={}){
 const timers=[],cleared=[],instances=[];
 class Worker {
  constructor(){this.terminations=0;instances.push(this);}
  postMessage(value){this.sent=structuredClone(value);}
  terminate(){this.terminations++;}
 }
 const pending=runTerrainProposal(options,{
  WorkerImpl:Worker,
  setTimeoutImpl:(callback,delay)=>{const timer={callback,delay};timers.push(timer);return timer;},
  clearTimeoutImpl:timer=>cleared.push(timer),
  ...dependencies
 });
 return {pending,timers,cleared,instances,deliver:data=>instances[0].onmessage({data})};
}

test('typed progress keeps the proposal pending and physical worker alive until typed result',async()=>{
 const observed=[],f=transport({algorithmVersion,kind:'adapt'},{onProgress:event=>observed.push(event)});
 let settled=false;f.pending.then(()=>{settled=true;});
 const progress={type:'progress',phase:'domain',elapsedMs:12,remainingMs:29988,nodeCount:40};
 f.deliver(progress);await Promise.resolve();
 assert.equal(settled,false);assert.equal(f.instances[0].terminations,0);assert.deepEqual(observed,[progress]);
 const proposal={ok:true,kind:'adapt',projectPatch:{terrain:{history:{entries:[]}}}};
 f.deliver({type:'result',proposal});assert.deepEqual(await f.pending,proposal);
 assert.equal(f.instances[0].terminations,1);assert.deepEqual(f.cleared,[f.timers[0]]);
 f.deliver(progress);f.deliver({type:'result',proposal:{ok:false}});
 assert.equal(observed.length,1);assert.equal(f.instances[0].terminations,1);
});

test('progress observer exceptions cannot orphan a worker or change its eventual proposal',async()=>{
 const f=transport({algorithmVersion},{onProgress:()=>{throw new Error('observer failed');}});
 assert.doesNotThrow(()=>f.deliver({type:'progress',phase:'domain',elapsedMs:0}));
 assert.equal(f.instances[0].terminations,0);
 f.deliver({type:'result',proposal:{ok:true}});assert.deepEqual(await f.pending,{ok:true});
 assert.equal(f.instances[0].terminations,1);
});

test('legacy direct result remains compatible even for an explicitly new client request',async()=>{
 for(const options of [{},{algorithmVersion}]){
  const f=transport(options),proposal={ok:false,status:'review-required'};
  f.deliver(proposal);assert.deepEqual(await f.pending,proposal);assert.equal(f.instances[0].terminations,1);
 }
});

test('new operation deadlines use the shared budget cap plus exactly 100 ms transport margin',async()=>{
 const caps={adapt:30000,measure:30000,restore:30000,cut:60000};
 for(const kind of ['adapt','measure','restore','cut'])for(const deadlineMs of [undefined,0,1,5000,120000]){
  const options={algorithmVersion,kind,...(kind==='cut'?{operationId:'cut-cap-test',cutRequest:{action:'suggest'}}:{}),...(deadlineMs===undefined?{}:{deadlineMs})};
  const expected=createTerrainBudget({kind,deadlineMs,clock:()=>0}).remainingMs();
  assert.equal(expected,Math.min(caps[kind],deadlineMs??caps[kind]));
  const f=transport(options,{clock:()=>0});
  if(kind==='cut'&&expected===0){assert.equal((await f.pending).status,'budget-exceeded');assert.equal(f.instances.length,0);assert.equal(f.timers.length,0);continue;}
  assert.equal(f.timers[0].delay,expected+100,JSON.stringify(options));
  assert.deepEqual(f.instances[0].sent,kind==='cut'?{...options,initialNodeCount:0,deadlineMs:expected}:options);
  f.deliver({type:'result',proposal:{ok:false,kind,status:'invalid-input'},...(kind==='cut'?{operationId:options.operationId,usage:{nodeCount:0,elapsedMs:0,remainingMs:expected}}:{})});await f.pending;
 }
});

test('absent and explicit historical algorithm preserve their 10 second transport cap',async()=>{
 for(const algorithmVersion of [undefined,'terrain-face-chart-1'])for(const deadlineMs of [undefined,0,5000,60000]){
  const f=transport({kind:'cut',algorithmVersion,deadlineMs});
  assert.equal(f.timers[0].delay,Math.min(10000,deadlineMs??10000)+100);
  f.deliver({ok:false});await f.pending;
 }
});

test('new mode-only callers receive the shared default operation cap',async()=>{
 for(const options of [{algorithmVersion},{algorithmVersion,mode:'measure'},{algorithmVersion,followTerrain:false}]){
  const f=transport(options);assert.equal(f.timers[0].delay,30100);f.deliver({ok:false});await f.pending;
 }
});

test('invalid new kinds or deadline overrides fail closed without starting a worker',async()=>{
 for(const options of [{kind:'unknown'},{kind:null},...[-1,NaN,Infinity,null,'30000'].map(deadlineMs=>({kind:'adapt',deadlineMs}))]){
  const f=transport({algorithmVersion,...options});
  // Deliver against the old client so RED never leaves a pending promise.
  if(f.instances.length)f.deliver({ok:true});
  const result=await f.pending;assert.equal(result.ok,false);assert.equal(result.status,'invalid-input');
  assert.equal(f.instances.length,0);assert.equal(f.timers.length,0);
 }
});

test('unknown explicit algorithm fails closed without starting a worker',async()=>{
 const f=transport({algorithmVersion:'future-engine',kind:'cut'});
 if(f.instances.length)f.deliver({ok:true});
 assert.equal((await f.pending).status,'unsupported-algorithm');assert.equal(f.instances.length,0);
});

test('worker adapter terminates canceled work and ignores queued late progress and results',async()=>{
 const controller=new AbortController(),observed=[],f=transport({algorithmVersion},{signal:controller.signal,onProgress:value=>observed.push(value)});
 controller.abort();await assert.rejects(f.pending,{name:'AbortError'});
 assert.equal(f.instances[0].terminations,1);assert.deepEqual(f.cleared,[f.timers[0]]);
 f.deliver({type:'progress',phase:'late',elapsedMs:4});f.deliver({type:'result',proposal:{ok:true}});
 assert.deepEqual(observed,[]);assert.equal(f.instances[0].terminations,1);
});

test('fake deadline expiration physically terminates work and ignores late events',async()=>{
 const observed=[],f=transport({algorithmVersion,kind:'cut',operationId:'timeout',cutRequest:{action:'suggest'}},{clock:()=>0,onProgress:value=>observed.push(value)});
 assert.equal(f.timers[0].delay,60100);f.timers[0].callback();
 assert.equal((await f.pending).status,'budget-exceeded');assert.equal(f.instances[0].terminations,1);
 f.deliver({type:'progress',phase:'late',elapsedMs:60001});f.deliver({type:'result',proposal:{ok:true}});
 f.timers[0].callback();assert.deepEqual(observed,[]);assert.equal(f.instances[0].terminations,1);
});

test('worker errors and structured-clone failure terminate once and clear transport deadline',async()=>{
 const f=transport({algorithmVersion});f.instances[0].onerror();
 assert.equal((await f.pending).status,'worker-error');assert.equal(f.instances[0].terminations,1);assert.deepEqual(f.cleared,[f.timers[0]]);
 const bad=transport({algorithmVersion,uncloneable:()=>{}});
 assert.equal((await bad.pending).status,'worker-error');assert.equal(bad.instances[0].terminations,1);assert.deepEqual(bad.cleared,[bad.timers[0]]);
});

test('already aborted and unavailable transports do not create workers or deadlines',async()=>{
 const controller=new AbortController();controller.abort();
 const f=transport({algorithmVersion},{signal:controller.signal});await assert.rejects(f.pending,{name:'AbortError'});
 assert.equal(f.instances.length,0);assert.equal(f.timers.length,0);
 const unavailable=transport({algorithmVersion},{WorkerImpl:null});assert.equal((await unavailable.pending).status,'worker-unavailable');assert.equal(unavailable.timers.length,0);
});

test('actual worker dispatch forwards shared-budget progress and typed failures for new adapt and measure',async()=>{
 const [{createTerrainModel},{fromUTM}]=await Promise.all([import('../src/terrain-model.js'),import('../src/coordinate-system.js')]);
 const priorSelf=globalThis.self,messages=[];
 globalThis.self={postMessage:value=>messages.push(structuredClone(value))};
 try{
  await import('../src/terrain-worker.js');
  const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:2,height:2,origin:[500000,5000005],step:[5,-5],values:[0,0,0,0]}});
  const project={geometry:[[20,20],[25,20],[25,25],[20,25],[20,20]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632)),rowSpacingM:3,plantSpacingM:1};
  for(const kind of ['adapt','measure']){
   messages.length=0;self.onmessage({data:{algorithmVersion,kind,project,model}});
   assert.equal(messages[0].type,'progress');assert.equal(messages[0].phase,'domain');assert.ok(messages[0].elapsedMs>=0);
   assert.ok(messages[0].remainingMs<=30000);assert.ok(messages[0].nodeCount>=0);
   const final=messages.at(-1);assert.equal(final.type,'result');assert.equal(final.proposal.kind,kind);assert.equal(final.proposal.status,'uncovered');assert.equal(final.proposal.result,undefined);
  }
  messages.length=0;self.onmessage({data:{algorithmVersion,kind:'adapt',project,model,deadlineMs:0}});
  assert.deepEqual(messages.map(m=>m.type),['result']);assert.equal(messages[0].proposal.status,'budget-exceeded');
  for(const kind of ['cut']){
   messages.length=0;self.onmessage({data:{algorithmVersion,kind,project,model}});
   assert.equal(messages[0].type,'result');assert.equal(messages[0].proposal.ok,false);assert.equal(messages[0].proposal.kind,kind);assert.equal(messages[0].proposal.status,'invalid-input');assert.equal(messages[0].proposal.result,undefined);
  }
  messages.length=0;self.onmessage({data:{algorithmVersion,kind:'restore',project,model}});
  assert.equal(messages.at(-1).type,'result');assert.equal(messages.at(-1).proposal.kind,'restore');assert.equal(messages.at(-1).proposal.status,'restore-conflict');assert.equal(messages.at(-1).proposal.result,undefined);
  for(const options of [{},{algorithmVersion:'terrain-face-chart-1'}]){
   messages.length=0;self.onmessage({data:options});assert.equal(messages.length,1);assert.equal(messages[0].type,undefined);assert.equal(messages[0].ok,false);
  }
  messages.length=0;self.onmessage({data:{algorithmVersion:'future-engine'}});
  assert.equal(messages[0].ok??messages[0].proposal?.ok,false);assert.equal(messages[0].status??messages[0].proposal?.status,'unsupported-algorithm');
 }finally{if(priorSelf===undefined)delete globalThis.self;else globalThis.self=priorSelf;}
});
