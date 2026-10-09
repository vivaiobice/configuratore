import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {attachTerrainRestore,buildTerrainRestoreProposal,assertTerrainRestoreHistory} from '../src/terrain-history.js';
import {readTerrainEnvelope} from '../src/terrain-replay.js';
import {createTerrainController,checkpointTerrainProposal,terrainContextKey} from '../src/terrain-controller.js';
import {mergeProjectState} from '../src/state.js';
import {saveDraft,loadDraft} from '../src/storage.js';

const clone=value=>structuredClone(value);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const model=createTerrainModel({acquiredAt:'2026-10-06T00:00:00Z',grid:{width:5,height:5,origin:[499995,5000015],step:[5,-5],values:Array.from({length:25},(_,i)=>(15-Math.floor(i/5)*5)/2)}});
const original={localProjectId:'project',activeFieldId:'field',geometry:ring([[0,0],[12,0],[12,12],[0,12],[0,0]]),exclusions:[],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowCurvePoints:[],maintainRowEquidistance:true};
const measured=buildContourTerrainProposal({project:original,model,mode:'measure'});
assert.equal(measured.ok,true,measured.message);
const materialize=(project,proposal)=>{const next={...clone(project),...clone(proposal.projectPatch??{}),terrain:clone(proposal.terrain)};if(Object.hasOwn(proposal,'rowPortions'))next.rowPortions=clone(proposal.rowPortions);for(const key of proposal.removeProjectKeys??[])delete next[key];return next;};
function fixture(extra={}){
 const {document}=parseHTML('<section id="terrain-card"></section>');let project=clone(original),owner='owner',portionId=measured.rowPortions[0].id,saves=0;
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({owner,projectId:project.localProjectId,fieldId:project.activeFieldId}),getPortionId:()=>portionId,getResult:()=>project.terrain?readTerrainEnvelope(project):null,loadTerrain:async()=>model,summarize:async()=>({valid:true}),covers:async()=>true,runProposal:async()=>clone(measured),applyProposal:()=>{saves++;return true;},...extra});
 return {controller,document,setProject:patch=>project={...project,...patch},getProject:()=>project,setOwner:value=>owner=value,setPortion:value=>portionId=value,saves:()=>saves};
}
function checkpointContext(project){const identity={owner:'owner',projectId:'project',fieldId:'field'};return {identity,context:{...identity,terrainContextKey:terrainContextKey(identity,project),terrainHistoryFingerprint:assertTerrainRestoreHistory({project})}};}

test('core explicit routing uses reviewed measure with immutable inputs and complete history preview',async()=>{
 const job=deferred();let seen;const f=fixture({runProposal:(options,control)=>{seen={options,control};return job.promise;}});await f.controller.refresh();
 const project=clone(original),patch={label:'edited'};const pending=f.controller.propose({project,projectPatch:patch,mode:'manual'});project.rowSpacingM=99;patch.label='mutated';await turn();
 assert.equal(seen.options.algorithmVersion,'terrain-contour-family-1');assert.equal(seen.options.kind,'measure');assert.equal(seen.options.mode,'measure');assert.equal(seen.options.deadlineMs,30000);assert.equal(seen.options.project.rowSpacingM,3);
 seen.control.onProgress({phase:'spacing',elapsedMs:2});assert.equal(f.controller.getState().progress.phase,'spacing');
 job.resolve({...clone(measured),projectPatch:{locationLabel:'producer'}});const result=await pending;assert.equal(result.ok,true);assert.equal(result.terrain.history.entries.length,1);assert.equal(result.projectPatch.label,'edited');assert.equal(result.projectPatch.locationLabel,'producer');assert.deepEqual(f.controller.getState().projectPatch,result.projectPatch);assert.equal(f.saves(),0);f.controller.destroy();
});

test('core acquisition cannot route an old project under a changed owner or inputs',async()=>{
 for(const change of [f=>f.setOwner('other'),f=>f.setProject({activeFieldId:'other'}),f=>f.setProject({rowSpacingM:4})]){
  const load=deferred();let runs=0;const f=fixture({loadTerrain:()=>load.promise,runProposal:()=>{runs++;return clone(measured);}});const pending=f.controller.propose({mode:'manual'});change(f);load.resolve(model);await pending;assert.equal(runs,0);assert.equal(f.controller.getState().proposal,null);f.controller.destroy();
 }
});

test('core selection mode and request guards discard stale progress and outcomes',async()=>{
 for(const change of [f=>f.setPortion('other'),f=>f.controller.setMode('terrain'),f=>f.controller.cancel(),f=>f.setProject({rowSpacingM:4}),f=>f.setOwner('other')]){
  const job=deferred();let control;const f=fixture({runProposal:(_,value)=>{control=value;return job.promise;}});await f.controller.refresh();const pending=f.controller.propose({mode:'manual'});await turn();change(f);control.onProgress({phase:'late',elapsedMs:3});job.resolve({ok:false,status:'incompatible',kind:'measure'});await pending;assert.equal(f.controller.getState().proposal,null);assert.equal(f.controller.getState().progress?.phase==='late',false);assert.equal(f.controller.getState().lastProposalOutcome?.status==='incompatible',false);f.controller.destroy();
 }
});

test('core pending preview retains one baseline on failed apply and rejects history replacement',async()=>{
 let failed=true,saved;const f=fixture({applyProposal:(proposal)=>{saved=proposal;if(failed)throw Error('quota');return true;}});await f.controller.refresh();const proposal=await f.controller.propose({mode:'manual'});assert.equal(proposal.terrain.history.entries.length,1);assert.equal(await f.controller.apply(),false);assert.equal(f.controller.getState().proposal,proposal);failed=false;assert.equal(await f.controller.apply(),true);assert.equal(saved.terrain.history.entries.length,1);f.controller.destroy();
 const applied=materialize(original,attachTerrainRestore({project:original,proposal:measured,operationId:'first'}));const g=fixture();g.setProject(applied);await g.controller.refresh();const fresh=buildContourTerrainProposal({project:applied,model,mode:'measure'});
 const h=fixture({getProject:()=>applied,runProposal:async()=>fresh});await h.controller.refresh();await h.controller.propose({mode:'manual'});applied.terrain.history={schemaVersion:1,entries:[]};assert.equal(await h.controller.apply(),false);assert.equal(h.saves(),0);h.controller.destroy();g.controller.destroy();
});

test('core late apply completion cannot clear a newer proposal under the same owner',async()=>{
 const saved=deferred();const f=fixture({applyProposal:()=>saved.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});const applying=f.controller.apply();f.controller.cancel();const next=await f.controller.propose({mode:'manual'});saved.resolve(true);assert.equal(await applying,false);assert.equal(f.controller.getState().proposal,next);assert.equal(f.controller.getState().statusKind,'ready');f.controller.destroy();
});

test('core target guard and unavailable cut mapping distinguish failed timeout from incompatibility',async()=>{
 const f=fixture({runProposal:async()=>({ok:false,status:'budget-exceeded',kind:'measure'})});await f.controller.refresh();const target={portionId:measured.rowPortions[0].id,contextKey:f.controller.getState().contextKey};assert.equal(f.controller.isTargetCurrent(target),true);await f.controller.propose({mode:'manual'});assert.equal(f.controller.getState().statusKind,'budget-exceeded');assert.equal(f.controller.getState().lastProposalOutcome.status,'budget-exceeded');assert.equal(f.controller.getState().canSuggestCut,false);assert.equal(f.controller.getState().canApply,false);f.setPortion('other');assert.equal(f.controller.isTargetCurrent(target),false);f.controller.destroy();
});

test('core checkpoint validates history replay and full quota before any storage write',()=>{
 const attached=attachTerrainRestore({project:original,proposal:measured,operationId:'first'}),state={project:clone(original)},captured=checkpointContext(state.project);let writes=0;
 const saveCheckpoint=()=>{writes++;return state;};
 for(const mutate of [p=>p.terrain.history.entries[0].baselineHash='invalid',p=>p.rowPortions[0].orientationDeg=88,p=>p.projectPatch={locationLabel:'x'.repeat(1024*1024)},p=>p.removeProjectKeys=['geometry'],p=>p.removeProjectKeys=['rowPortions','rowPortions'],p=>p.removeProjectKeys=null]){
  const proposal=clone(attached);mutate(proposal);assert.throws(()=>checkpointTerrainProposal({state,proposal,...captured,currentContext:captured.identity,mergeState:mergeProjectState,saveCheckpoint}));assert.equal(writes,0);assert.equal(state.project.terrain,undefined);
 }
 const changed=clone(state);changed.project.terrain={history:{schemaVersion:1,entries:[]}};
 assert.throws(()=>checkpointTerrainProposal({state:changed,proposal:attached,...captured,currentContext:captured.identity,mergeState:mergeProjectState,saveCheckpoint}));assert.equal(writes,0);
});

test('core actual restore checkpoint consumes one entry and preserves missing portions in mirror storage reload',()=>{
 const attached=attachTerrainRestore({project:original,proposal:measured,operationId:'first'}),applied=materialize(original,attached),portionId=measured.rowPortions[0].id;
 const restore=buildTerrainRestoreProposal({project:applied,portionId,model});assert.equal(restore.ok,true,restore.message);assert.deepEqual(restore.removeProjectKeys,['rowPortions']);
 const foreign={id:'foreign',label:'untouched',geometry:original.geometry,rowPortions:[],terrain:null};const state={project:{...clone(applied),fields:[{...clone(applied),id:'field'},foreign]}};const captured=checkpointContext(state.project);const memory=new Map();let writes=0;const storage={setItem:(key,value)=>{writes++;memory.set(key,value);},getItem:key=>memory.get(key)};
 const next=checkpointTerrainProposal({state,proposal:restore,...captured,currentContext:captured.identity,mergeState:mergeProjectState,saveCheckpoint:candidate=>saveDraft(storage,candidate)});
 assert.equal(writes,1);assert.equal(Object.hasOwn(next.project,'rowPortions'),false);assert.equal(Object.hasOwn(next.project.fields[0],'rowPortions'),false);assert.deepEqual(next.project.fields[1],foreign);assert.equal(next.project.terrain.history.entries.length,0);assert.equal(readTerrainEnvelope(next.project).terrainStatus,'applied');
 const reloaded=loadDraft(storage);assert.equal(Object.hasOwn(reloaded.project,'rowPortions'),false);assert.equal(Object.hasOwn(reloaded.project.fields[0],'rowPortions'),false);assert.equal(reloaded.project.fields[0].terrain.history.entries.length,0);assert.equal(JSON.stringify([...memory.values()]).match(/valuesBase64/g).length,1);
});

test('core restore schedules the reviewed builder without attaching redo history',async()=>{
 const applied=materialize(original,attachTerrainRestore({project:original,proposal:measured,operationId:'first'}));let seen;const f=fixture({getProject:()=>applied,runProposal:async(options)=>{seen=options;return buildTerrainRestoreProposal(options);}});await f.controller.refresh();assert.equal(f.controller.getState().restoreAvailability.reason,'exact');const restored=await f.controller.restore();assert.equal(seen.kind,'restore');assert.equal(seen.deadlineMs,30000);assert.equal(restored.kind,'restore');assert.equal(restored.terrain.history.entries.length,0);assert.equal(f.saves(),0);f.controller.destroy();
});

test('core actual worker restore dispatch shares progress budget and returns consumed preview',async()=>{
 const applied=materialize(original,attachTerrainRestore({project:original,proposal:measured,operationId:'worker-original'})),messages=[],previous=globalThis.self;
 globalThis.self={postMessage:value=>messages.push(clone(value))};
 try{await import('../src/terrain-worker.js');self.onmessage({data:{algorithmVersion:'terrain-contour-family-1',kind:'restore',project:applied,model,portionId:measured.rowPortions[0].id}});const result=messages.at(-1);assert.equal(result.type,'result');assert.equal(result.proposal.ok,true,result.proposal.message);assert.equal(result.proposal.kind,'restore');assert.equal(result.proposal.terrain.history.entries.length,0);assert.equal(messages.some(value=>value.type==='progress'&&value.phase==='restore'),true);}finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});

test('core explicit first proposal keeps acquisition alive until the worker starts',async()=>{
 let abortedDuringLoad;const f=fixture({loadTerrain:async({signal})=>{await turn();abortedDuringLoad=signal.aborted;if(signal.aborted)throw new DOMException('cancelled','AbortError');return model;}});const proposal=await f.controller.propose({mode:'manual'});assert.equal(abortedDuringLoad,false);assert.equal(proposal?.ok,true);f.controller.destroy();
});

test('core successful real checkpoint refresh inside app callback does not invalidate apply ownership',async()=>{
 let state={project:clone(original)},f;
 f=fixture({getProject:()=>state.project,applyProposal:(proposal,context)=>{state=checkpointTerrainProposal({state,proposal,context,currentContext:{owner:'owner',projectId:'project',fieldId:'field'},mergeState:mergeProjectState,saveCheckpoint:next=>next});void f.controller.refresh();return true;}});
 await f.controller.refresh();await f.controller.propose({mode:'manual'});assert.equal(await f.controller.apply(),true);assert.equal(state.project.terrain.history.entries.length,1);assert.equal(f.controller.getState().proposal,null);assert.equal(f.controller.getState().statusKind,'applied');f.controller.destroy();
});

test('core no-refresh input switch hides old progress and settles obsolete worker busy state',async()=>{
 const job=deferred();let control;const f=fixture({runProposal:(_,value)=>{control=value;return job.promise;}});await f.controller.refresh();const pending=f.controller.propose({mode:'manual'});await turn();control.onProgress({phase:'spacing',elapsedMs:1});f.setProject({rowSpacingM:4});assert.equal(f.controller.getState().progress,null);job.resolve(clone(measured));await pending;assert.equal(f.controller.getState().busy,false);f.controller.destroy();
});

test('core cancel during acquisition permits a new explicit request immediately',async()=>{
 const first=deferred();let loads=0;const f=fixture({loadTerrain:()=>++loads===1?first.promise:Promise.resolve(model)});const old=f.controller.propose({mode:'manual'});await turn();f.controller.cancel();const next=f.controller.propose({mode:'manual'});await turn();assert.equal(loads,2);first.resolve(model);assert.equal((await next).ok,true);assert.equal(await old,null);f.controller.destroy();
});

test('core stale preview and outcome are hidden after a no-refresh history switch',async()=>{
 const f=fixture();await f.controller.refresh();await f.controller.propose({mode:'manual'});f.setProject({terrain:{history:{schemaVersion:1,entries:[]}}});assert.equal(f.controller.getState().proposal,null);assert.equal(f.controller.getState().projectPatch,null);assert.equal(f.controller.getState().lastProposalOutcome,null);f.controller.destroy();
});

test('core patch-only aliases and producer winners persist with all snapshot quotas enforced',()=>{
 const attached=attachTerrainRestore({project:original,proposal:measured,operationId:'patch'}),proposal={...clone(attached),terrain:undefined,rowPortions:undefined,projectPatch:{terrain:clone(attached.terrain),rowPortions:clone(attached.rowPortions),locationLabel:'producer'}},state={project:clone(original)},captured=checkpointContext(state.project);
 const next=checkpointTerrainProposal({state,proposal,...captured,currentContext:captured.identity,mergeState:mergeProjectState,saveCheckpoint:next=>next});assert.equal(next.project.locationLabel,'producer');assert.equal(readTerrainEnvelope(next.project).terrainStatus,'applied');
 const large={project:{...clone(original),fields:[{...clone(original),id:'field'},...Array.from({length:5},(_,i)=>({id:`foreign-${i}`,terrain:clone(measured.terrain),materialRequestNote:'x'.repeat(900000)}))]}};const guard=checkpointContext(large.project);let writes=0;
 assert.throws(()=>checkpointTerrainProposal({state:large,proposal:attached,...guard,currentContext:guard.identity,mergeState:mergeProjectState,saveCheckpoint:()=>{writes++;return large;}}),/4 MiB/);assert.equal(writes,0);
});

test('core actual adapt producer remains an explicit preview with one original baseline',async()=>{
 const f=fixture({runProposal:async options=>buildContourTerrainProposal(options)});await f.controller.refresh();const result=await f.controller.propose({mode:'terrain'});assert.equal(result.ok,true,result.message);assert.equal(result.kind,'adapt');assert.equal(result.terrain.history.entries.length,1);assert.equal(f.controller.getState().actualMode,'terrain');assert.equal(f.saves(),0);f.controller.destroy();
});

test('core existing follow button explicitly requests terrain after transient manual mode',async()=>{
 let requested;const f=fixture({runProposal:async options=>{requested=options.kind;return {ok:false,status:'review-required',kind:options.kind};}});await f.controller.refresh();f.controller.setMode('manual');f.document.querySelector('[data-terrain=follow]').click();await turn();assert.equal(requested,'adapt');assert.equal(f.controller.getState().mode,'terrain');f.controller.destroy();
});

test('core post-save reacquisition completion does not overwrite a newer proposal status',async()=>{
 const nextLoad=deferred();let loads=0;const f=fixture({loadTerrain:()=>++loads===1?Promise.resolve(model):nextLoad.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});const applying=f.controller.apply();await turn();const newer=f.controller.propose({mode:'manual'});nextLoad.resolve(model);const proposal=await newer;assert.equal(proposal.ok,true);assert.equal(await applying,false);assert.equal(f.controller.getState().proposal,proposal);assert.equal(f.controller.getState().statusKind,'ready');f.controller.destroy();
});

test('core obsolete apply settles busy after an unrefreshed account switch',async()=>{
 const job=deferred();const f=fixture({applyProposal:()=>job.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});const applying=f.controller.apply();f.setOwner('other');job.resolve(true);assert.equal(await applying,false);assert.equal(f.controller.getState().busy,false);assert.equal(f.controller.getState().proposal,null);f.controller.destroy();
});

test('core obsolete acquisition settles busy after an unrefreshed account switch',async()=>{
 const job=deferred();const f=fixture({loadTerrain:()=>job.promise});const loading=f.controller.refresh();f.setOwner('other');job.resolve(model);await loading;assert.equal(f.controller.getState().busy,false);assert.equal(f.controller.getState().model,null);f.controller.destroy();
});

test('Fix1 history replacement clears stale card and 3D preview while keeping valid model available',async()=>{
 const applied=materialize(original,attachTerrainRestore({project:original,proposal:measured,operationId:'live'})),rows=[],changes=[];
 const f=fixture({getMapApi:()=>({map:{},setRows:value=>rows.push(clone(value)),stopTools(){}}),createMapView:async()=>({open:async()=>{},close(){},destroy(){}}),onProposalChange:value=>changes.push(value),runProposal:async options=>buildContourTerrainProposal(options)});
 f.setProject(applied);await f.controller.refresh();const retainedModel=f.controller.getState().model;const preview=await f.controller.propose({project:{...applied,rowSpacingM:4},projectPatch:{rowSpacingM:4},mode:'manual',recomputeAll:true});assert.equal(preview.ok,true,preview.message);assert.notDeepEqual(preview.result.rows,applied.terrain.applied.result.rows);
 await f.controller.toggle3D();assert.deepEqual(rows.at(-1),preview.result.rows);
 f.setProject({terrain:{...applied.terrain,history:{schemaVersion:1,entries:[]}}});
 assert.equal(f.controller.getState().proposal,null);assert.equal(f.controller.getState().canAdapt,true);
 await f.controller.refresh();assert.equal(changes.at(-1),null);assert.equal(f.controller.getState().model,retainedModel);assert.equal(f.controller.getState().projectPatch,null);assert.equal(f.controller.getState().canAdapt,true);assert.equal(f.document.querySelector('.terrain-badge').textContent,'Applicato');assert.equal(Boolean(f.document.querySelector('.terrain-review')),false);assert.equal(Boolean(f.document.querySelector('[data-terrain=apply]')),false);assert.deepEqual(rows.at(-1),applied.terrain.applied.result.rows);
 f.controller.close3D();await f.controller.toggle3D();assert.deepEqual(rows.at(-1),applied.terrain.applied.result.rows);f.controller.destroy();
});

test('Fix1 target refresh clears only obsolete preview and retains a newer deferred request',async()=>{
 const job=deferred();let requests=0;const f=fixture({runProposal:()=>++requests===1?Promise.resolve(clone(measured)):job.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});f.setPortion('other');await f.controller.refresh();assert.equal(f.controller.getState().projectPatch,null);assert.equal(Boolean(f.document.querySelector('.terrain-review')),false);assert.equal(f.controller.getState().model,model);
 f.setPortion(measured.rowPortions[0].id);const next=f.controller.propose({mode:'manual'});await turn();await f.controller.refresh();job.resolve(clone(measured));const preview=await next;assert.equal(preview.ok,true);assert.equal(f.controller.getState().proposal,preview);f.controller.destroy();
});

test('Fix1 deferred Apply rejects unrelated input or history changes with unchanged selection',async()=>{
 for(const change of [f=>f.setProject({rowSpacingM:4}),f=>f.setProject({terrain:{history:{schemaVersion:1,entries:[]}}})]){
  const job=deferred();const f=fixture({applyProposal:()=>job.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});const pending=f.controller.apply();change(f);job.resolve(true);assert.equal(await pending,false);assert.notEqual(f.controller.getState().statusKind,'applied');assert.equal(f.controller.getState().busy,false);assert.equal(f.controller.getState().proposal,null);f.controller.destroy();
 }
});

test('Fix1 post-save acquisition rejects unrelated live geometry or history changes',async()=>{
 for(const change of [f=>f.setProject({rowSpacingM:4}),f=>f.setProject({terrain:{history:{schemaVersion:1,entries:[]}}})]){
  const acquisition=deferred();let loads=0;const f=fixture({loadTerrain:()=>++loads===1?Promise.resolve(model):acquisition.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});const pending=f.controller.apply();await turn();change(f);acquisition.resolve(model);assert.equal(await pending,false);assert.notEqual(f.controller.getState().statusKind,'applied');f.controller.destroy();
 }
});

test('superseding a readonly candidate clears its map preview even when the new proposal fails',async()=>{
 const changes=[];let runs=0;
 const f=fixture({onProposalChange:value=>changes.push(value),runProposal:async()=>++runs===1?clone(measured):{ok:false,status:'review-required',kind:'measure'}});
 try{
  await f.controller.refresh();const previous=await f.controller.propose({mode:'manual'});
  assert.equal(previous.ok,true);assert.equal(changes.at(-1),previous,'SETUP prior actual measured/history preview is visible');
  const failed=await f.controller.propose({mode:'manual'});
  assert.equal(failed.ok,false);assert.equal(f.controller.getState().proposal,null);
  assert.equal(changes.at(-1)===null,true,'a failed superseding request must not leave the earlier readonly map drawing');
  assert.equal(f.saves(),0);assert.equal(f.controller.getState().busy,false);
 }finally{f.controller.destroy();}
});
