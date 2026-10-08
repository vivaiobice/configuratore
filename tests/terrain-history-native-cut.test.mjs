import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainInputHash} from '../src/terrain-model.js';
import {TERRAIN_PORTION_GEOMETRY_KEYS} from '../src/terrain-contour-contracts.js?v=1.3.3';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createScopedTerrainCutEvaluator,buildContourTerrainProposal} from '../src/terrain-contour-design.js?v=1.3.3';
import {attachTerrainRestore,assertTerrainRestoreHistory,terrainRestoreAvailability,buildTerrainRestoreProposal} from '../src/terrain-history.js?v=1.3.3';
import {legacyTerrainInputs,readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.3';
import {calculateProject} from '../src/project-calculator.js?v=1.3.3';
import {checkpointTerrainProposal,terrainContextKey} from '../src/terrain-controller.js';
import {mergeProjectState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js?v=1.3.3';
import {saveDraft,loadDraft} from '../src/storage.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';

const clone=value=>structuredClone(value);
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const groupId='road',sourceId='source';
const materialize=(project,proposal)=>{
 const next={...clone(project),...clone(proposal.projectPatch??{})};
 for(const name of ['terrain','rowPortions'])if(Object.hasOwn(proposal,name)&&proposal[name]!==undefined)next[name]=clone(proposal[name]);
 for(const key of proposal.removeProjectKeys??[])delete next[key];
 return next;
};
const groupMembers=project=>(project.exclusions??[]).filter(item=>item?.passageGroupId===groupId);
const groupChildren=project=>(project.rowPortions??[]).filter(portion=>portion.terrainScopeRecipe?.groupId===groupId);
const owner=project=>groupMembers(project).find(member=>member.surfaceGroupOwner===true);
function setupSuccess(proposal,stage){assert.equal(proposal.ok,true,`SETUP ${stage}: ${JSON.stringify(proposal)}`);}
function logUsage(operation,stage,budget,extra={}){console.info('native-history-ledger',JSON.stringify({operation,stage,...extra,...budget.usage()}));}
function diagnosticStage(stage,callback){
 console.info('native-history-assertion-stage',stage);
 try{return callback();}catch(error){
  console.info('native-history-assertion-error',JSON.stringify({stage,status:error?.status,message:error?.message,stack:String(error?.stack??'').split('\n').slice(0,3)}));
  throw error;
 }
}
function inputFixture({foreign=false}={}){
 if(!foreign){
  // Exact completed producer geometry/grid/spacing/source and row definition,
  // rather than an unobserved cost reduction. Durable project IDs are added.
  const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
  project.localProjectId='native-history-project';project.activeFieldId='native-field';
  project.rowPortions=[{id:sourceId,geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
  return {project,model};
 }
 // Exact completed 5B foreign fixture: two genuine physical components with
 // both literal-divider boundaries reusing the saved perimeter vertices.
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[8.25,0],[9.75,0],[18,0],[18,9],[9.75,9],[8.25,9],[0,9],[0,0]]});
 project.localProjectId='native-history-project';project.activeFieldId='native-field';
 const [a,leftLow,rightLow,b,c,rightHigh,leftHigh,d]=project.geometry;
 project.exclusions=[{id:'literal-divider',geometry:[leftLow,rightLow,rightHigh,leftHigh,leftLow]}];
 project.rowPortions=[
  {id:sourceId,label:'Original source',geometry:[[a,leftLow,leftHigh,d,a]],mode:'inherited',orientationDeg:0},
  {id:'native-foreign',label:'Foreign manual',geometry:[[rightLow,b,c,rightHigh,rightLow]],mode:'local',orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true,custom:{keep:'raw foreign metadata'}}
 ];
 return {project,model};
}
let createdFixture,attachedFixture,foreignFixture,foreignAttachedFixture;
function created({foreign=false}={}){
 const cached=foreign?foreignFixture:createdFixture;if(cached)return cached;
 const {project,model}=inputFixture({foreign}),budget=createTerrainBudget({kind:'cut',onProgress:value=>console.info('native-history-phase',JSON.stringify(value))});
 console.info('native-history-stage',JSON.stringify({stage:'constructor',foreign,usage:budget.usage()}));
 const evaluator=createScopedTerrainCutEvaluator({project,model,portionId:sourceId,budget});
 assert.equal(evaluator.noCutFamily.ok,true,`SETUP actual no-cut family: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 logUsage('create','constructor',budget,{foreign});
 console.info('native-history-stage',JSON.stringify({stage:'candidate',foreign,usage:budget.usage()}));
 const proposal=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId});
 setupSuccess(proposal,'complete create');
 logUsage('create','candidate',budget,{foreign});
 console.info('native-history-stage',JSON.stringify({stage:'replay',foreign,usage:budget.usage()}));
 assert.equal(proposal.isSplit,true,'SETUP create must be an actual split');
 assert.equal(readTerrainEnvelope({...project,...proposal.projectPatch},{budget}).terrainStatus,'applied','SETUP create replay');
 logUsage('create','replay',budget,{foreign});
 console.info('native-history-setup',JSON.stringify({foreign,usage:budget.usage(),before:proposal.cutOperation.beforePortionIds,after:proposal.cutOperation.afterPortionIds}));
 const result={project,model,proposal,budget};if(foreign)foreignFixture=result;else createdFixture=result;return result;
}
function attachedCreate({foreign=false}={}){
 const cached=foreign?foreignAttachedFixture:attachedFixture;if(cached)return cached;
 const fixture=created({foreign}),attached=attachTerrainRestore({...fixture,operationId:foreign?'native-foreign-conversion':'native-create-operation'});
 logUsage('create','attachment',fixture.budget,{foreign});
 const current=materialize(fixture.project,attached);
 const result={...fixture,attached,current};if(foreign)foreignAttachedFixture=result;else attachedFixture=result;return result;
}
function attachReplacement(fixture,operationId){
 const saved=fixture.project.terrain?.applied;
 const record=portion=>({id:portion.id,groupId:portion.terrainScopeRecipe?.groupId});
 console.info('native-history-ownership',JSON.stringify({operationId,beforePortionIds:fixture.proposal.cutOperation.beforePortionIds,raw:fixture.project.rowPortions.map(record),savedRaw:saved.inputs.rowPortions.map(record),applied:saved.result.portions.map(record),quantities:saved.portionResults.map(portion=>portion.id),previousRaw:groupMembers(fixture.project).map(member=>({id:member.id,owner:member.surfaceGroupOwner===true,scopePortionId:member.scopePortionId})),previousSaved:groupMembers(saved.inputs).map(member=>({id:member.id,owner:member.surfaceGroupOwner===true,scopePortionId:member.scopePortionId}))}));
 const proposal=attachTerrainRestore({...fixture,operationId});
 logUsage(operationId,'attachment',fixture.budget);
 return proposal;
}
function regenerate(project,model,{sourceAxis=geographic([[4,-3],[4,12]]),prefix='native-replacement'}={}){
 const budget=createTerrainBudget({kind:'cut'});let ordinal=0;
 const evaluator=createScopedTerrainCutEvaluator({project,model,portionId:sourceId,groupId,budget});
 logUsage(prefix,'constructor',budget);
 const proposal=evaluator.evaluateCandidate({sourceAxis,groupId,createId:()=>`${prefix}-${++ordinal}`});
 setupSuccess(proposal,'complete replacement');
 logUsage(prefix,'candidate',budget);
 assert.equal(proposal.cutOperation.action,'replace','SETUP replacement ownership');
 assert.equal(readTerrainEnvelope({...project,...proposal.projectPatch},{budget}).terrainStatus,'applied','SETUP replacement replay');
 logUsage(prefix,'replay',budget);
 return {project,model,proposal,budget};
}
function restoreProposal({project,portionId=sourceId,model=project?.terrain?.model,operation='restore'}={}){
 // Restore is a separate user transaction, not a reset of its preceding cut.
 const budget=createTerrainBudget({kind:'restore'});
 const proposal=buildTerrainRestoreProposal({project,portionId,model,budget});
 logUsage(operation,'proposal',budget,{ok:proposal.ok,status:proposal.status});
 return {proposal,budget};
}
function completePriorGroup(){
 const {current,model}=attachedCreate(),prior=clone(current),sibling=groupChildren(prior).find(portion=>portion.id!==sourceId);
 assert.ok(sibling,'SETUP original split sibling');
 for(const [index,member] of groupMembers(prior).entries()){member.label=`Previous raw member ${index}`;member.custom={retained:'complete raw group metadata'};}
 for(const [index,portion] of groupChildren(prior).entries()){portion.label=`Previous child ${index}`;portion.custom={retained:`child-${index}`};}
 sibling.mode='local';sibling.orientationDeg=90;sibling.rowCurvePoints=[];sibling.maintainRowEquidistance=true;
 const budget=createTerrainBudget({kind:'measure'}),measured=buildContourTerrainProposal({project:prior,model,portionId:sibling.id,mode:'measure',budget});
 setupSuccess(measured,'genuine distinct local child measurement');
 const complete=materialize(prior,measured);
 assert.equal(readTerrainEnvelope(complete,{budget}).terrainStatus,'applied','SETUP coherent prior group after local override');
 return {project:complete,model};
}
function checkpointContext(project){
 const identity={owner:'native-history-owner',projectId:project.localProjectId,fieldId:project.activeFieldId};
 return {identity,context:{...identity,terrainContextKey:terrainContextKey(identity,project),terrainHistoryFingerprint:assertTerrainRestoreHistory({project})}};
}
function fieldState(project){
 const foreign={id:'foreign-field',label:'Foreign field retained',geometry:project.geometry,rowPortions:[],terrain:null,custom:'unchanged'};
 const normalized=ensureProjectFields({...clone(project),fields:[{...clone(project),id:project.activeFieldId},foreign]});
 assert.deepEqual(legacyTerrainInputs(normalized),legacyTerrainInputs(project),'field normalization preserves actual captured design inputs');
 if(project.terrain)assert.deepEqual(normalized.terrain,project.terrain,'field normalization preserves the actual applied context');
 else assert.equal(normalized.terrain,null);
 return {project:normalized};
}
function checkpoint(state,proposal,saveCheckpoint,{operationId,budget}={}){
 const captured=checkpointContext(state.project);
 if(operationId!==undefined)captured.context.terrainOperationId=operationId;
 if(budget!==undefined)captured.context.terrainApplyBudget=budget;
 return checkpointTerrainProposal({state,proposal,...captured,currentContext:captured.identity,mergeState:mergeProjectState,saveCheckpoint});
}
function assertNonrecursiveBaseline(before){
 const text=JSON.stringify(before);
 for(const forbidden of ['"terrain":','"model":','"grid":','"valuesBase64":','"history":','"applied":'])assert.equal(text.includes(forbidden),false,forbidden);
}

test('native create accepts genuinely created children and captures explicit atomic ownership',()=>{
 const fixture=created(),original=diagnosticStage('original-project-json',()=>JSON.stringify(fixture.project)),producer=diagnosticStage('producer-json',()=>JSON.stringify(fixture.proposal));let attached;
 assert.doesNotThrow(()=>{attached=diagnosticStage('create-attachment',()=>attachedCreate().attached);},'actual created child identities are owned by this cut');
 const entry=attached.terrain.history.entries.find(entry=>entry.before.cut?.groupId===groupId);
 assert.ok(entry);assert.equal(entry.before.cut.protocolVersion,1);assert.equal(entry.before.cut.action,'create');
 assert.deepEqual(entry.before.cut.beforePortionIds,fixture.proposal.cutOperation.beforePortionIds);
 assert.deepEqual(entry.before.cut.afterPortionIds,fixture.proposal.cutOperation.afterPortionIds);
 assert.deepEqual(entry.before.cut.previousGroup,{present:false,members:[],positions:[]});
 assert.deepEqual(entry.affectedIds,fixture.proposal.affectedPortionIds);
 assert.deepEqual(entry.before.source.portionPositions,[0]);
 assertNonrecursiveBaseline(entry.before);
 assert.equal(JSON.stringify(fixture.project),original);assert.equal(JSON.stringify(fixture.proposal),producer);
});

test('native attachment explicit budget expires before reads or owned copies',()=>{
 const fixture=created(),budget=createTerrainBudget({kind:'cut',deadlineMs:0,clock:()=>0}),copy=globalThis.structuredClone;let copies=0;
 globalThis.structuredClone=(...args)=>{copies++;return copy(...args);};
 try{assert.throws(()=>attachTerrainRestore({...fixture,budget,operationId:'expired-native-cut'}),{status:'budget-exceeded'});assert.equal(copies,0);}finally{globalThis.structuredClone=copy;}
});

test('native attachment precharges actual owned coordinates before allocating copies',()=>{
 const fixture=created(),budget=createTerrainBudget({kind:'cut',initialNodeCount:500000,clock:()=>0}),copy=globalThis.structuredClone;let copies=0;
 globalThis.structuredClone=(...args)=>{copies++;return copy(...args);};
 try{assert.throws(()=>attachTerrainRestore({...fixture,budget,operationId:'full-native-cut'}),{status:'budget-exceeded'});assert.equal(copies,0);}finally{globalThis.structuredClone=copy;}
});

test('native cut declarations cannot omit group ownership or lie about fresh identities',()=>{
 const fixture=created(),oldIds=fixture.project.rowPortions.map(portion=>portion.id),newId=fixture.proposal.createdChildIds[0];
 assert.ok(newId,'SETUP genuinely created identity');
 const variants=[
  proposal=>delete proposal.cutOperation,
  proposal=>proposal.cutOperation.schemaVersion=2,
  proposal=>proposal.cutOperation.beforePortionIds=[],
  proposal=>proposal.cutOperation.afterPortionIds=proposal.cutOperation.afterPortionIds.filter(id=>id!==newId),
  proposal=>proposal.cutOperation.groupId='wrong-group',
  proposal=>proposal.createdChildIds=[oldIds[0]],
  proposal=>proposal.createdChildIds=[],
  proposal=>proposal.affectedPortionIds=proposal.affectedPortionIds.filter(id=>id!==newId),
  proposal=>proposal.affectedPortionIds.push('unrelated-claim')
 ];
 for(const mutate of variants){const proposal=clone(fixture.proposal);mutate(proposal);const budget=createTerrainBudget({kind:'cut'});assert.throws(()=>attachTerrainRestore({...fixture,proposal,budget,operationId:'invalid-native-declaration'}),{status:'invalid-history'});}
});

test('native create checkpoints once reloads one grid and restores the genuine manual source',()=>{
 const fixture=attachedCreate(),state=fieldState(fixture.project),foreign=clone(state.project.fields[1]),memory=new Map();let writes=0;
 const manual=calculateProject({...fixture.project,polygon:fixture.project.geometry,terrain:null});
 const baseline=fixture.attached.terrain.history.entries.find(entry=>entry.before.cut?.groupId===groupId);
 const storage={setItem:(key,value)=>{writes++;memory.set(key,value);},getItem:key=>memory.get(key)};
 // Explicit Apply validation is a separate user transaction from generation.
 const applyBudget=createTerrainBudget({kind:'cut'});
 const saved=checkpoint(state,fixture.attached,candidate=>saveDraft(storage,candidate),{operationId:baseline.operationId,budget:applyBudget});
 logUsage('create-explicit-apply','checkpoint',applyBudget);
 assert.equal(writes,1);assert.equal(readTerrainEnvelope(saved.project).terrainStatus,'applied');
 const reloaded=loadDraft(storage);assert.ok(reloaded);reloaded.project=ensureProjectFields(reloaded.project);assert.deepEqual(reloaded.project.fields[1],foreign);
 assert.equal([...memory.values()].join('').match(/valuesBase64/g).length,1);
 for(const id of fixture.proposal.cutOperation.afterPortionIds)assert.equal(terrainRestoreAvailability({project:reloaded.project,portionId:id}).available,true);
 const {proposal:restored,budget:restoreBudget}=restoreProposal({project:reloaded.project,portionId:fixture.proposal.createdChildIds[0],model:reloaded.project.terrain.model,operation:'create-reload-restore'});
 assert.equal(restored.ok,true,restored.message);
 const candidate=materialize(reloaded.project,restored);
 assert.deepEqual(candidate.exclusions,fixture.project.exclusions);assert.deepEqual(candidate.rowPortions,fixture.project.rowPortions);
 assert.deepEqual(candidate.terrain.applied.portionResults,baseline.before.portions,'all genuinely captured manual quantity references');
 for(const [key,value] of Object.entries(manual))assert.deepEqual(candidate.terrain.applied.result[key],value,`original manual ${key}`);
 assert.equal(readTerrainEnvelope(candidate,{budget:restoreBudget}).terrainStatus,'applied');logUsage('create-reload-restore','test-replay',restoreBudget);assert.equal(candidate.terrain.history.entries.length,0);
 assert.equal(terrainRestoreAvailability({project:candidate,portionId:sourceId}).available,false);
 assert.equal(buildTerrainRestoreProposal({project:candidate,portionId:sourceId}).ok,false);
 const beforeRestore=JSON.stringify(reloaded),restoreBefore=JSON.stringify(restored);let restoreAttempts=0;
 assert.throws(()=>checkpoint(reloaded,restored,()=>{restoreAttempts++;return false;}),/salvataggio/);
 assert.equal(JSON.stringify(reloaded),beforeRestore,'failed Restore checkpoint retains the actual undo state');
 assert.equal(JSON.stringify(restored),restoreBefore,'failed Restore checkpoint retains the complete proposal');
 const restoredSaved=checkpoint(reloaded,restored,value=>{restoreAttempts++;return saveDraft(storage,value);});
 assert.equal(restoreAttempts,2);assert.equal(writes,2,'one successful cut save and one successful Restore save');
 assert.deepEqual(restoredSaved.project.fields[1],foreign);
 const restoredReload=loadDraft(storage);assert.ok(restoredReload);restoredReload.project=ensureProjectFields(restoredReload.project);
 assert.deepEqual(restoredReload.project.fields[1],foreign);
 assert.deepEqual(restoredReload.project.exclusions,fixture.project.exclusions);
 assert.deepEqual(restoredReload.project.rowPortions,fixture.project.rowPortions);
 assert.deepEqual(restoredReload.project.terrain.applied.portionResults,baseline.before.portions);
 for(const [key,value] of Object.entries(manual))assert.deepEqual(restoredReload.project.terrain.applied.result[key],value,`persisted original manual ${key}`);
 assert.equal(restoredReload.project.terrain.history.entries.length,0);
 assert.equal(terrainRestoreAvailability({project:restoredReload.project,portionId:sourceId}).available,false);
 assert.equal(buildTerrainRestoreProposal({project:restoredReload.project,portionId:sourceId}).ok,false,'Restore reload cannot create redo');
});

test('native replacement captures every prior child raw group member and position then consumes one undo',()=>{
 const prior=completePriorGroup(),fixture=regenerate(prior.project,prior.model),attached=attachReplacement(fixture,'native-replace-operation'),current=materialize(prior.project,attached);
 const entry=attached.terrain.history.entries.find(entry=>entry.before.cut?.groupId===groupId),oldChildren=groupChildren(prior.project),oldMembers=groupMembers(prior.project);
 assert.equal(entry.before.cut.action,'replace');assert.deepEqual(entry.before.cut.beforePortionIds,oldChildren.map(portion=>portion.id));
 assert.deepEqual(entry.before.cut.previousGroup.members,oldMembers);
 assert.deepEqual(entry.before.cut.previousGroup.positions,oldMembers.map(member=>prior.project.exclusions.indexOf(member)));
 assert.deepEqual(entry.before.source.portions,oldChildren);
 assert.deepEqual(entry.before.source.portionPositions,oldChildren.map(portion=>prior.project.rowPortions.indexOf(portion)));
 assert.deepEqual(entry.before.source.referencePortionPositions,entry.before.source.referencePortions.map(portion=>prior.project.terrain.applied.result.portions.findIndex(record=>record.id===portion.id)));
 assert.deepEqual(entry.before.source.quantityPositions,entry.before.portions.map(portion=>prior.project.terrain.applied.portionResults.findIndex(record=>record.id===portion.id)));
 assertNonrecursiveBaseline(entry.before);
 assert.equal(owner(current).widthM,owner(prior.project).widthM);assert.deepEqual(owner(current).scopeGeometry,owner(prior.project).scopeGeometry);
 const {proposal:restore,budget}=restoreProposal({project:current,model:prior.model,operation:'complete-prior-group-restore'});assert.equal(restore.ok,true,restore.message);
 const restored=materialize(current,restore);
 assert.deepEqual(restored.exclusions,prior.project.exclusions);assert.deepEqual(restored.rowPortions,prior.project.rowPortions);
 assert.deepEqual(restored.terrain.applied.portionResults,prior.project.terrain.applied.portionResults);
 assert.deepEqual(restored.terrain.applied.result,prior.project.terrain.applied.result,'complete previous quantity basis and fixed coverage reference');
 assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('complete-prior-group-restore','test-replay',budget);assert.equal(restored.terrain.history.entries.length,0);
 assert.equal(buildTerrainRestoreProposal({project:restored,portionId:sourceId}).ok,false);
});

test('native repeated replacement restores the immediately prior complete group without resurrecting its undo',()=>{
 const {current,model}=attachedCreate(),first=regenerate(current,model,{prefix:'native-first-replace'});
 const firstAttached=attachReplacement(first,'native-first-replace-operation'),prior=materialize(current,firstAttached);
 const second=regenerate(prior,model,{sourceAxis:geographic([[5,-3],[5,12]]),prefix:'native-second-replace'});
 const secondAttached=attachReplacement(second,'native-second-replace-operation'),next=materialize(prior,secondAttached);
 const baseline=next.terrain.history.entries.find(entry=>entry.before.cut?.groupId===groupId),previousChildren=groupChildren(prior);
 assert.deepEqual(baseline.before.source.portions,previousChildren,'capture raw records in their actual saved order');
 assert.deepEqual(baseline.before.source.portionPositions,previousChildren.map(portion=>prior.rowPortions.indexOf(portion)),'raw positions remain independent of resolved identity order');
 assert.equal(next.terrain.history.entries.filter(entry=>entry.before.cut?.groupId===groupId).length,1);
 const {proposal:restore,budget}=restoreProposal({project:next,model,operation:'repeated-group-restore'});assert.equal(restore.ok,true,restore.message);
 const restored=materialize(next,restore);
 assert.deepEqual(restored.exclusions,prior.exclusions);assert.deepEqual(restored.rowPortions,prior.rowPortions);
 assert.deepEqual(restored.terrain.applied.portionResults,prior.terrain.applied.portionResults);
 assert.deepEqual(restored.terrain.applied.result,prior.terrain.applied.result,'immediately prior complete quantities');
 assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('repeated-group-restore','test-replay',budget);assert.equal(restored.terrain.history.entries.length,0);
 assert.equal(buildTerrainRestoreProposal({project:restored,portionId:sourceId}).ok,false);
});

test('native nonsplit replacement keeps original width and restores the complete previous split group',()=>{
 const {current,model}=attachedCreate(),fixture=regenerate(current,model,{sourceAxis:geographic([[4.5,3],[4.5,6]]),prefix:'native-nonsplit'});
 assert.equal(fixture.proposal.isSplit,false,'SETUP internal supported road must leave one paired component');
 assert.equal(fixture.proposal.cutOperation.afterPortionIds.length,1);assert.equal(fixture.proposal.createdChildIds.length,0);
 const retired=fixture.proposal.cutOperation.beforePortionIds.filter(id=>!fixture.proposal.cutOperation.afterPortionIds.includes(id));assert.ok(retired.length);
 for(const id of retired)assert.ok(fixture.proposal.affectedPortionIds.includes(id));
 const attached=attachReplacement(fixture,'native-nonsplit-operation'),next=materialize(current,attached);
 assert.equal(groupChildren(next)[0].geometry.length,2,'actual remainder retains the road hole');assert.equal(owner(next).widthM,owner(current).widthM);
 const {proposal:restore,budget}=restoreProposal({project:next,model,operation:'nonsplit-group-restore'});assert.equal(restore.ok,true,restore.message);
 const restored=materialize(next,restore);assert.deepEqual(restored.exclusions,current.exclusions);assert.deepEqual(restored.rowPortions,current.rowPortions);
 assert.deepEqual(restored.terrain.applied.portionResults,current.terrain.applied.portionResults,'complete split per-child quantities');
 assert.deepEqual(restored.terrain.applied.result,current.terrain.applied.result,'complete split baseline including fixed reference');assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('nonsplit-group-restore','test-replay',budget);
});

test('native first conversion retains an independent actual foreign manual baseline',()=>{
 const fixture=attachedCreate({foreign:true}),foreignBefore=clone(fixture.project.rowPortions.find(portion=>portion.id==='native-foreign'));
 const {attached,current}=fixture;
 const group=attached.terrain.history.entries.find(entry=>entry.before.cut?.groupId===groupId),foreign=attached.terrain.history.entries.find(entry=>entry.affectedIds.length===1&&entry.affectedIds[0]==='native-foreign');
 assert.ok(group);assert.ok(foreign);assert.equal(Object.hasOwn(foreign.before,'cut'),false);assert.equal(foreign.before.portions[0].quantityBasis,'legacy-planar');
 assert.deepEqual(current.rowPortions.find(portion=>portion.id==='native-foreign'),foreignBefore);
 const foreignResult=clone(current.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign'));
 console.info('native-history-restore-context',JSON.stringify({operation:'foreign-first-conversion-restore',availability:terrainRestoreAvailability({project:current,portionId:sourceId}),beforeQuantityContext:group.before.quantityContextFingerprint,liveContext:group.contextFingerprint,manualTopology:[...group.before.source.referencePortions,...foreign.before.source.referencePortions].map(portion=>({id:portion.id,anchor:portion.anchor??null})),restoredReferenceTopology:[...group.before.source.referencePortions,...current.terrain.applied.result.portions.filter(portion=>!group.affectedIds.includes(portion.id))].map(portion=>({id:portion.id,anchor:portion.anchor??null})),foreignRaw:foreignBefore,foreignResultBasis:foreignResult.quantityBasis}));
 const {proposal:restore,budget}=restoreProposal({project:current,model:fixture.model,operation:'foreign-first-conversion-restore'});assert.equal(restore.ok,true,restore.message);
 const restored=materialize(current,restore);assert.deepEqual(restored.rowPortions.find(portion=>portion.id==='native-foreign'),foreignBefore);
 assert.deepEqual(restored.rowPortions.map(portion=>portion.id),fixture.project.rowPortions.map(portion=>portion.id),'actual restored raw order');
 assert.deepEqual(restored.terrain.applied.result.portions.find(portion=>portion.id==='native-foreign'),current.terrain.applied.result.portions.find(portion=>portion.id==='native-foreign'),'unowned applied reference stays exact');
 assert.deepEqual(restored.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign'),foreignResult);
 assert.deepEqual(restored.terrain.history.entries,[foreign]);assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('foreign-first-conversion-restore','test-replay',budget);
});

test('native local replacement preserves every foreign raw result and independent history entry',()=>{
 const original=attachedCreate({foreign:true}),prior=original.current;
 const foreignRaw=clone(prior.rowPortions.find(portion=>portion.id==='native-foreign'));
 const foreignResult=clone(prior.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign'));
 const foreignEntry=clone(prior.terrain.history.entries.find(entry=>entry.affectedIds.includes('native-foreign')));
 assert.ok(foreignEntry,'actual independent foreign baseline');
 const fixture=regenerate(prior,original.model,{prefix:'native-foreign-replacement'}),attached=attachReplacement(fixture,'native-local-replacement'),current=materialize(prior,attached);
 assert.equal(fixture.proposal.affectedPortionIds.includes('native-foreign'),false);
 assert.deepEqual(current.rowPortions.find(portion=>portion.id==='native-foreign'),foreignRaw);
 assert.deepEqual(current.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign'),foreignResult);
 assert.deepEqual(current.terrain.history.entries.find(entry=>entry.affectedIds.includes('native-foreign')),foreignEntry);
 const {proposal:restore,budget}=restoreProposal({project:current,model:original.model,operation:'foreign-prior-group-restore'});assert.equal(restore.ok,true,restore.message);
 const restored=materialize(current,restore);assert.deepEqual(restored.rowPortions.find(portion=>portion.id==='native-foreign'),foreignRaw);
 assert.deepEqual(restored.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign'),foreignResult);
 assert.deepEqual(restored.exclusions,prior.exclusions);assert.deepEqual(restored.rowPortions,prior.rowPortions);
 assert.deepEqual(restored.terrain.applied.portionResults,prior.terrain.applied.portionResults,'complete prior owned and foreign quantities');
 assert.deepEqual(restored.terrain.applied.result,prior.terrain.applied.result,'complete prior aggregate and fixed reference with foreign portion retained');
 assert.deepEqual(restored.terrain.history.entries,[foreignEntry]);assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('foreign-prior-group-restore','test-replay',budget);
});

test('native rehashed baseline still rejects malformed protocol ownership and stored recursive state',()=>{
 const {current}=attachedCreate();
 const variants=[
  before=>before.cut.protocolVersion=2,
  before=>before.cut.action='replace',
  before=>before.cut.beforePortionIds.push(before.cut.beforePortionIds[0]),
  before=>before.cut.afterPortionIds=[],
  before=>before.cut.previousGroup.positions=[0],
  before=>before.source.portionPositions=[-1],
  before=>before.source.referencePortions=[],
  before=>before.cut.previousGroup.history={schemaVersion:1,entries:[]}
 ];
 for(const mutate of variants){
  const project=clone(current),entry=project.terrain.history.entries[0];mutate(entry.before);
  entry.baselineHash=terrainInputHash(Object.fromEntries(['schemaVersion','operationId','kind','affectedIds','before','afterFingerprint','contextFingerprint'].map(key=>[key,entry[key]])));
  assert.throws(()=>assertTerrainRestoreHistory({project}),{status:'invalid-history'});
  assert.equal(buildTerrainRestoreProposal({project,portionId:sourceId}).ok,false);
 }
});

test('native changed quantities require an actual fresh restore proposal instead of old numbers',()=>{
 const fixture=attachedCreate(),{current,model}=fixture,changed=clone(current);changed.plantSpacingM=2;
 assert.equal(terrainRestoreAvailability({project:changed,portionId:sourceId}).reason,'recompute-required');
 const {proposal:restore,budget}=restoreProposal({project:changed,model,operation:'changed-quantity-restore'});assert.equal(restore.ok,true,restore.message);
 assert.equal(restore.kind,'restore');assert.equal(changed.plantSpacingM,2);
 const restored=materialize(changed,restore);assert.equal(restored.plantSpacingM,2);assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('changed-quantity-restore','test-replay',budget);
 assert.equal(restored.terrain.applied.inputs.plantSpacingM,2);assert.equal(restored.terrain.history.entries.length,0);
 // Independently measure the genuine original raw source at the new spacing;
 // its separate oracle transaction does not reset the Restore budget above.
 const expected={...fixture.project,plantSpacingM:2},oracleBudget=createTerrainBudget({kind:'measure'});
 const oracle=buildContourTerrainProposal({project:expected,model,portionId:sourceId,mode:'measure',recomputeAll:true,budget:oracleBudget});
 setupSuccess(oracle,'fresh original-source measurement at changed quantities');
 assert.equal(readTerrainEnvelope(materialize(expected,oracle),{budget:oracleBudget}).terrainStatus,'applied','SETUP actual fresh quantity oracle replay');
 logUsage('changed-quantity-oracle','test-replay',oracleBudget);
 assert.deepEqual(restored.terrain.applied.portionResults,oracle.terrain.applied.portionResults,'fresh actual rows and per-portion quantities');
 for(const key of ['rowCount','rowLinearM','horizontalRowLinearM','surfaceRowLinearM','simulatedPlants','headPosts','intermediatePosts','totalPosts','theoreticalPlants','commercialPlants25','theoreticalPlantsBasis','theoreticalDensityContributions'])assert.deepEqual(restored.terrain.applied.result[key],oracle.result[key],`fresh actual ${key}`);
 const prior=fixture.attached.terrain.history.entries.find(entry=>entry.before.cut?.groupId===groupId).before.portions[0];
 assert.notEqual(restored.terrain.applied.result.simulatedPlants,prior.simulatedPlants,'new spacing changes genuinely archived plant quantity');
 const state=fieldState(changed),memory=new Map(),storage={setItem:(key,value)=>memory.set(key,value),getItem:key=>memory.get(key)};
 const saved=checkpoint(state,restore,value=>saveDraft(storage,value)),reloaded=loadDraft(storage);assert.ok(reloaded);reloaded.project=ensureProjectFields(reloaded.project);
 assert.deepEqual(reloaded.project.terrain.applied.portionResults,oracle.terrain.applied.portionResults);
 assert.deepEqual(reloaded.project.fields[1],saved.project.fields[1]);assert.equal(reloaded.project.plantSpacingM,2);
 assert.equal(reloaded.project.terrain.history.entries.length,0);assert.equal(buildTerrainRestoreProposal({project:reloaded.project,portionId:sourceId}).ok,false);
});

test('native owned edits or same geometry history replacement reject checkpoint before storage',()=>{
 const {current,model}=attachedCreate(),restore=buildTerrainRestoreProposal({project:current,portionId:sourceId,model});assert.equal(restore.ok,true,restore.message);
 const state=fieldState(current),captured=checkpointContext(state.project);let writes=0;
 const changed=clone(state);changed.project.terrain.history.entries[0].operationId='different-history';
 assert.throws(()=>checkpointTerrainProposal({state:changed,proposal:restore,...captured,currentContext:captured.identity,mergeState:mergeProjectState,saveCheckpoint:()=>{writes++;return changed;}}));assert.equal(writes,0);
 const edited=clone(current);owner(edited).widthM+=.25;
 assert.equal(terrainRestoreAvailability({project:edited,portionId:sourceId}).available,false);
 assert.equal(buildTerrainRestoreProposal({project:edited,portionId:sourceId,model}).ok,false);
});

test('native attachment field quota and checkpoint snapshot quota never save a partial group',()=>{
 const fixture=created(),oversized={...clone(fixture.project),locationLabel:'x'.repeat(1024*1024)},before=JSON.stringify(oversized);
 assert.throws(()=>attachTerrainRestore({...fixture,project:oversized,budget:createTerrainBudget({kind:'cut'}),operationId:'native-field-quota'}),/1 MiB/);assert.equal(JSON.stringify(oversized),before);
 const {attached}=attachedCreate(),state=fieldState(fixture.project),originalTerrain=state.project.terrain;state.project.fields.push(...Array.from({length:5},(_,index)=>({id:`quota-field-${index}`,materialRequestNote:'x'.repeat(900000)})));let writes=0;
 assert.throws(()=>checkpoint(state,attached,()=>{writes++;return state;}),/4 MiB/);assert.equal(writes,0);assert.equal(state.project.terrain,originalTerrain);
});

test('native failed storage retains the attached proposal and genuine baseline for retry',()=>{
 const {project,attached}=attachedCreate(),state=fieldState(project),before=JSON.stringify(state),proposalBefore=JSON.stringify(attached);let writes=0;
 assert.throws(()=>checkpoint(state,attached,()=>{writes++;return false;}),/salvataggio/);
 assert.equal(writes,1);assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify(attached),proposalBefore);
 const saved=checkpoint(state,attached,candidate=>{writes++;return candidate;});assert.equal(writes,2);
 assert.equal(saved.project.terrain.history.entries.length,attached.terrain.history.entries.length);assert.equal(readTerrainEnvelope(saved.project).terrainStatus,'applied');
});


function independentLineageCandidate({foreign=false,rightScope=false,widthM=1.5,prefix}){
 const {project,model}=inputFixture({foreign});
 if(rightScope){
  assert.equal(foreign,true,'SETUP a real right scope needs the divided field');
  const source=project.rowPortions.find(portion=>portion.id===sourceId),other=project.rowPortions.find(portion=>portion.id==='native-foreign');
  [source.geometry,other.geometry]=[other.geometry,source.geometry];
 }
 const budget=createTerrainBudget({kind:'cut'}),evaluator=createScopedTerrainCutEvaluator({project,model,portionId:sourceId,budget});
 assert.equal(evaluator.noCutFamily.ok,true,`SETUP independent ${prefix} no-cut: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 logUsage(prefix,'constructor',budget);let ordinal=0;
 const proposal=evaluator.evaluateCandidate({sourceAxis:geographic([[rightScope?13.5:4.5,-3],[rightScope?13.5:4.5,12]]),widthM,groupId,createId:()=>`${prefix}-${++ordinal}`});
 setupSuccess(proposal,`independent ${prefix} create`);logUsage(prefix,'candidate',budget);
 assert.equal(readTerrainEnvelope({...project,...proposal.projectPatch},{budget}).terrainStatus,'applied',`SETUP independently genuine ${prefix} native replay`);
 logUsage(prefix,'replay',budget);return {project,model,proposal,budget};
}
function claimedReplacement(prior,actualCandidate){
 const beforePortionIds=groupChildren(prior).map(portion=>portion.id),afterPortionIds=actualCandidate.cutOperation.afterPortionIds;
 // Only the operation's claimed identity relationship changes. The native
 // owner, original scope geometry, axes, children, cache and model stay exactly
 // as emitted and actually replayed by the independent real producer.
 return {...actualCandidate,cutOperation:{...actualCandidate.cutOperation,action:'replace',beforePortionIds},createdChildIds:afterPortionIds.filter(id=>!beforePortionIds.includes(id)),affectedPortionIds:[...new Set([...beforePortionIds,...afterPortionIds])]};
}

test('native replacement rejects a genuinely reconstructed different declared width',()=>{
 const prior=attachedCreate(),candidate=independentLineageCandidate({widthM:2,prefix:'native-alternate-width'});
 assert.notEqual(owner({...candidate.project,...candidate.proposal.projectPatch}).widthM,owner(prior.current).widthM,'different genuine widths');
 const proposal=claimedReplacement(prior.current,candidate.proposal);
 for(const key of ['cut','terrain','rowPortions','result','projectPatch'])assert.equal(proposal[key],candidate.proposal[key],'genuine geometry payload remains untouched');
 // This adversarial submission is a separate bounded validation transaction;
 // the actual independent producer and replay above retained one shared budget.
 const budget=createTerrainBudget({kind:'cut'});
 assert.throws(()=>attachTerrainRestore({project:prior.current,proposal,operationId:'different-width-replacement',budget}),{status:'invalid-history'});
});

test('native replacement rejects a genuinely reconstructed different original source scope',()=>{
 const prior=attachedCreate({foreign:true}),candidate=independentLineageCandidate({foreign:true,rightScope:true,prefix:'native-alternate-scope'});
 assert.notDeepEqual(owner({...candidate.project,...candidate.proposal.projectPatch}).scopeGeometry,owner(prior.current).scopeGeometry,'different genuine divided-field physical scopes');
 const proposal=claimedReplacement(prior.current,candidate.proposal);
 for(const key of ['cut','terrain','rowPortions','result','projectPatch'])assert.equal(proposal[key],candidate.proposal[key],'genuine geometry payload remains untouched');
 const budget=createTerrainBudget({kind:'cut'});
 assert.throws(()=>attachTerrainRestore({project:prior.current,proposal,operationId:'different-scope-replacement',budget}),{status:'invalid-history'});
});


test('native changed common quantities preserve original manual raw and foreign records with a genuine fresh oracle',()=>{
 const fixture=attachedCreate({foreign:true}),changed=clone(fixture.current);
 const originalRaw=clone(fixture.project.rowPortions),foreignRaw=clone(changed.rowPortions.find(portion=>portion.id==='native-foreign'));
 const foreignReference=clone(changed.terrain.applied.result.portions.find(portion=>portion.id==='native-foreign'));
 const foreignEntry=clone(changed.terrain.history.entries.find(entry=>entry.affectedIds.includes('native-foreign')));
 changed.plantSpacingM=2;
 const before=JSON.stringify(changed);
 assert.equal(terrainRestoreAvailability({project:changed,portionId:sourceId}).reason,'recompute-required');
 const {proposal:restore,budget}=restoreProposal({project:changed,model:fixture.model,operation:'changed-foreign-quantity-restore'});
 assert.equal(restore.ok,true,restore.message);
 const restored=materialize(changed,restore);
 assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');
 logUsage('changed-foreign-quantity-restore','test-replay',budget);
 // Independently measure actual original manual raw records at the new common
 // quantity context. This genuine oracle has a separate measure transaction.
 const expected={...clone(fixture.project),plantSpacingM:2},oracleBudget=createTerrainBudget({kind:'measure'});
 const oracle=buildContourTerrainProposal({project:expected,model:fixture.model,portionId:sourceId,mode:'measure',recomputeAll:true,budget:oracleBudget});
 setupSuccess(oracle,'fresh actual divided-field original manual quantity oracle');
 assert.equal(readTerrainEnvelope(materialize(expected,oracle),{budget:oracleBudget}).terrainStatus,'applied');
 logUsage('changed-foreign-quantity-oracle','test-replay',oracleBudget);
 assert.deepEqual(restored.terrain.applied.portionResults,oracle.terrain.applied.portionResults,'genuinely fresh per-portion quantities and rows');
 for(const key of ['rowCount','rowLinearM','horizontalRowLinearM','surfaceRowLinearM','simulatedPlants','headPosts','intermediatePosts','totalPosts','theoreticalPlants','commercialPlants25','theoreticalPlantsBasis','theoreticalDensityContributions'])assert.deepEqual(restored.terrain.applied.result[key],oracle.result[key],`genuinely fresh divided-field ${key}`);
 assert.equal(restored.plantSpacingM,2);
 assert.equal(restored.terrain.applied.inputs.plantSpacingM,2);
 assert.deepEqual(restored.rowPortions.find(portion=>portion.id==='native-foreign'),foreignRaw,'changed common quantities must retain every unowned foreign raw key');
 assert.deepEqual(restored.terrain.applied.result.portions.find(portion=>portion.id==='native-foreign'),foreignReference,'unowned foreign reference metadata stays exact while quantities are measured');
 assert.deepEqual(restored.rowPortions.find(portion=>portion.id===sourceId),originalRaw.find(portion=>portion.id===sourceId),'Restore retains genuine original manual source raw parameters');
 assert.deepEqual(restored.rowPortions,originalRaw,'original owned and current foreign raw order and exact records');
 assert.deepEqual(restored.terrain.history.entries,[foreignEntry],'foreign independent baseline remains exact; owned one-level undo is consumed');
 assert.equal(JSON.stringify(changed),before,'real changed-quantity Restore never mutates current state');
});


function changedImplicitPrior(presence){
 assert.ok(['missing','empty'].includes(presence));
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 project.localProjectId=`history-native-${presence}-project`;project.activeFieldId=`history-native-${presence}-field`;
 if(presence==='missing')delete project.rowPortions;
 assert.equal(Object.hasOwn(project,'rowPortions'),presence==='empty','SETUP literal raw presence precedes native calculation');
 if(presence==='empty')assert.deepEqual(project.rowPortions,[]);
 const baseline=calculateProject({...project,polygon:project.geometry});
 assert.equal(baseline.portions.length,1,'SETUP actual manual calculator supplies one implicit source');
 const implicitSourceId=baseline.portions[0].id,before=JSON.stringify(project);
 const budget=createTerrainBudget({kind:'cut'}),evaluator=createScopedTerrainCutEvaluator({project,model,portionId:implicitSourceId,budget});
 assert.equal(evaluator.noCutFamily.ok,true,`SETUP ${presence} actual no-cut family: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 logUsage(`changed-${presence}-create`,'constructor',budget);
 const proposal=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId});
 setupSuccess(proposal,`${presence} actual implicit native create`);
 assert.equal(proposal.isSplit,true,'SETUP actual implicit source produces a split group');
 logUsage(`changed-${presence}-create`,'candidate',budget);
 assert.equal(readTerrainEnvelope(materialize(project,proposal),{budget}).terrainStatus,'applied');
 logUsage(`changed-${presence}-create`,'replay',budget);
 const attached=attachTerrainRestore({project,proposal,operationId:`changed-${presence}-create`,budget});
 logUsage(`changed-${presence}-create`,'attachment',budget);
 const entry=attached.terrain.history.entries.find(saved=>saved.before.cut?.groupId===groupId);
 assert.equal(entry.before.source.rowPortionsPresence,presence);
 assert.equal(entry.before.cut.sourceId,implicitSourceId);
 assert.deepEqual(entry.before.source.portions,[],'SETUP archived literal raw source remains implicit');
 assert.equal(JSON.stringify(project),before,'SETUP real cut and attachment leave original raw declarations untouched');
 return {project,model,current:materialize(project,attached),sourceId:implicitSourceId};
}
for(const presence of ['missing','empty'])test(`native changed common quantities preserve ${presence} implicit raw baseline with a genuine fresh oracle`,()=>{
 const fixture=changedImplicitPrior(presence),changed=clone(fixture.current);
 changed.plantSpacingM=2;const before=JSON.stringify(changed);
 assert.equal(terrainRestoreAvailability({project:changed,portionId:fixture.sourceId}).reason,'recompute-required');
 const {proposal:restore,budget}=restoreProposal({project:changed,portionId:fixture.sourceId,model:fixture.model,operation:`changed-${presence}-restore`});
 assert.equal(restore.ok,true,restore.message);
 const restored=materialize(changed,restore);
 assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');
 logUsage(`changed-${presence}-restore`,'test-replay',budget);
 // Independent true original manual project at plantSpacingM=2. It retains
 // missing versus [] before the builder computes its resolved source identity.
 const expected={...clone(fixture.project),plantSpacingM:2},oracleBudget=createTerrainBudget({kind:'measure'});
 assert.equal(Object.hasOwn(expected,'rowPortions'),presence==='empty');
 const oracle=buildContourTerrainProposal({project:expected,model:fixture.model,portionId:fixture.sourceId,mode:'measure',recomputeAll:true,budget:oracleBudget});
 setupSuccess(oracle,`${presence} actual original implicit quantity oracle`);
 assert.equal(readTerrainEnvelope(materialize(expected,oracle),{budget:oracleBudget}).terrainStatus,'applied');
 logUsage(`changed-${presence}-oracle`,'test-replay',oracleBudget);
 assert.deepEqual(restored.terrain.applied.portionResults,oracle.terrain.applied.portionResults,'actual freshly measured implicit rows and quantities');
 for(const key of ['rowCount','rowLinearM','horizontalRowLinearM','surfaceRowLinearM','simulatedPlants','headPosts','intermediatePosts','totalPosts','theoreticalPlants','commercialPlants25','theoreticalPlantsBasis','theoreticalDensityContributions'])assert.deepEqual(restored.terrain.applied.result[key],oracle.result[key],`fresh implicit ${presence} ${key}`);
 assert.deepEqual(restored.terrain.applied.result.portions,oracle.result.portions,'genuinely derived implicit references remain authoritative');
 assert.equal(restored.plantSpacingM,2);assert.equal(restored.terrain.applied.inputs.plantSpacingM,2);
 console.info('native-history-implicit-changed-presence',JSON.stringify({presence,sourceId:fixture.sourceId,proposalRawCount:restore.rowPortions?.length??null,removeProjectKeys:restore.removeProjectKeys??[],restoredRawPresent:Object.hasOwn(restored,'rowPortions'),restoredRawCount:restored.rowPortions?.length??null}));
 assert.deepEqual(restore.rowPortions,[],'fresh measurement cannot create an explicit raw source absent from the literal baseline');
 assert.deepEqual(restore.removeProjectKeys??[],presence==='missing'?['rowPortions']:[],'Restore carries literal missing source removal through fresh measurement');
 assert.equal(Object.hasOwn(restored,'rowPortions'),presence==='empty','original literal raw presence survives changed common quantity context');
 if(presence==='empty')assert.deepEqual(restored.rowPortions,[]);
 assert.deepEqual(restored.terrain.applied.inputs.rowPortions,[],'actual fresh envelope binds implicit raw inputs');
 assert.equal(restored.terrain.history.entries.length,0);
 assert.equal(terrainRestoreAvailability({project:restored,portionId:fixture.sourceId}).available,false);
 assert.equal(JSON.stringify(changed),before,'actual fresh Restore remains readonly until Apply');
});


test('native foreign local orientation edit restores genuine fresh foreign rows and references while keeping literal raw',()=>{
 const fixture=attachedCreate({foreign:true}),changed=clone(fixture.current);
 const changedForeign=changed.rowPortions.find(portion=>portion.id==='native-foreign');
 changedForeign.orientationDeg=90;
 const before=JSON.stringify(changed),foreignRaw=clone(changedForeign),ownedRaw=clone(fixture.project.rowPortions.find(portion=>portion.id===sourceId));
 const foreignEntry=clone(changed.terrain.history.entries.find(entry=>entry.affectedIds.includes('native-foreign')));
 assert.equal(terrainRestoreAvailability({project:changed,portionId:sourceId}).reason,'recompute-required');
 const {proposal:restore,budget}=restoreProposal({project:changed,model:fixture.model,operation:'foreign-orientation-restore'});
 assert.equal(restore.ok,true,restore.message);
 const restored=materialize(changed,restore);
 assert.equal(readTerrainEnvelope(restored,{budget}).terrainStatus,'applied');logUsage('foreign-orientation-restore','test-replay',budget);
 const expected={...clone(fixture.project),rowPortions:[ownedRaw,foreignRaw]},oracleBudget=createTerrainBudget({kind:'measure'});
 const oracle=buildContourTerrainProposal({project:expected,model:fixture.model,portionId:sourceId,mode:'measure',recomputeAll:true,budget:oracleBudget});
 setupSuccess(oracle,'genuine original manual source and current foreign orientation90 oracle');
 assert.equal(readTerrainEnvelope(materialize(expected,oracle),{budget:oracleBudget}).terrainStatus,'applied');logUsage('foreign-orientation-oracle','test-replay',oracleBudget);
 const quantity=restored.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign'),oracleForeign=oracle.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign');
 console.info('native-history-foreign-orientation',JSON.stringify({savedOrientation:fixture.current.rowPortions.find(portion=>portion.id==='native-foreign').orientationDeg,currentOrientation:foreignRaw.orientationDeg,restoredMeasuredOrientation:quantity.design.orientationDeg,oracleOrientation:oracleForeign.design.orientationDeg}));
 assert.deepEqual(restored.terrain.applied.portionResults,oracle.terrain.applied.portionResults,'every true fresh quantity and foreign row uses current local orientation');
 assert.notDeepEqual(quantity.rows,fixture.current.terrain.applied.portionResults.find(portion=>portion.id==='native-foreign').rows,'orientation90 genuinely changes foreign physical rows');
 for(const key of ['rowCount','rowLinearM','horizontalRowLinearM','surfaceRowLinearM','simulatedPlants','headPosts','intermediatePosts','totalPosts','theoreticalPlants','commercialPlants25','theoreticalPlantsBasis','theoreticalDensityContributions'])assert.deepEqual(restored.terrain.applied.result[key],oracle.result[key],`true fresh orientation90 ${key}`);
 const reference=restored.terrain.applied.result.portions.find(portion=>portion.id==='native-foreign'),oracleReference=oracle.result.portions.find(portion=>portion.id==='native-foreign');
 for(const key of TERRAIN_PORTION_GEOMETRY_KEYS)assert.deepEqual(reference[key],oracleReference[key],`fresh authoritative foreign reference ${key}`);
 assert.deepEqual(reference.custom,foreignRaw.custom,'current foreign reference metadata remains exact');
 assert.deepEqual(restored.rowPortions.find(portion=>portion.id==='native-foreign'),foreignRaw);
 assert.deepEqual(restored.rowPortions.find(portion=>portion.id===sourceId),ownedRaw);
 assert.deepEqual(restored.rowPortions.map(portion=>portion.id),expected.rowPortions.map(portion=>portion.id));
 assert.deepEqual(restored.terrain.history.entries,[foreignEntry]);
 assert.equal(JSON.stringify(changed),before);
});
