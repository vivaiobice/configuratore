import test from 'node:test';
import assert from 'node:assert/strict';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import * as design from '../src/terrain-contour-design.js?v=1.3.5';
import {attachTerrainRestore} from '../src/terrain-history.js?v=1.3.5';
import {readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.5';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';

const clone=value=>structuredClone(value);
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const materialize=(project,proposal)=>({...project,...proposal.projectPatch,terrain:proposal.terrain,rowPortions:proposal.rowPortions});
const qualification='not-evaluated-for-explicit-endpoint-replacement';
let genuinePrior,actualWorkerHandler,actualEndpointOperation;

// This is the same genuinely constructed nine-metre native prior as the actual
// worker success gate. No envelope, geometry certificate, row or quantity is
// fabricated. Each later operation owns a fresh legitimate transaction budget.
function priorNativeGroup(){
 if(genuinePrior)return genuinePrior;
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
 const budget=createTerrainBudget({kind:'cut'}),evaluator=design.createScopedTerrainCutEvaluator({project,model,portionId:'source',budget});
 assert.equal(evaluator.noCutFamily.ok,true,JSON.stringify(evaluator.noCutFamily.diagnostics));
 const proposal=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 assert.equal(proposal.ok,true,JSON.stringify(proposal));assert.equal(proposal.isSplit,true);
 const attached=attachTerrainRestore({project,proposal,operationId:'policy-prior-create',budget});
 console.info('native-endpoint-policy-setup',JSON.stringify(budget.usage()));
 genuinePrior={project:materialize(project,attached),model};return genuinePrior;
}

function ownerRequest(project){
 const members=project.exclusions.filter(member=>member.passageGroupId==='road'),owner=members.find(member=>member.surfaceGroupOwner===true);
 assert.ok(owner&&members.length,'SETUP actual native owner/member');
 const coordinate=geographic([[4.5,11]])[0],sourceAxis=clone(owner.sourceAxis);sourceAxis[1]=coordinate;
 return {owner,member:members.at(-1),coordinate,sourceAxis};
}

async function dispatch(options){
 const previous=globalThis.self,messages=[],sent=clone(options);
 globalThis.self={postMessage:message=>messages.push(clone(message))};
 try{
  if(!actualWorkerHandler){await import('../src/terrain-worker.js?native-endpoint-policy-test');actualWorkerHandler=self.onmessage;}
  actualWorkerHandler({data:sent});
  return {sent,messages,reply:messages.findLast(message=>message.type==='result')};
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
}

function typedEndpoint(options){
 assert.equal(typeof design.buildOwnedTerrainEndpointReplacement,'function','the endpoint-only producer must exist without changing the generic evaluator API');
 return design.buildOwnedTerrainEndpointReplacement(options);
}

async function endpointOperation(){
 if(actualEndpointOperation)return actualEndpointOperation;
 const {project,model}=priorNativeGroup(),{owner,member,coordinate}=ownerRequest(project),before=JSON.stringify(project);
 const observed=await dispatch({project,model,algorithmVersion:'terrain-contour-family-1',kind:'cut',operationId:'policy-endpoint',cutRequest:{action:'endpoint',exclusionId:member.id,endpointIndex:1,coordinate}});
 assert.equal(observed.reply?.proposal?.ok,true,JSON.stringify(observed.reply));
 actualEndpointOperation={project,model,owner,member,coordinate,before,observed};return actualEndpointOperation;
}

test('actual endpoint worker publishes verified owned children and explicitly unevaluated no-road comparison',async()=>{
 const {project,owner,coordinate,before,observed}=await endpointOperation();
 const {reply}=observed,proposal=reply?.proposal;
 assert.equal(proposal?.ok,true,JSON.stringify(reply));
 assert.equal(proposal.cutOperation.action,'replace');assert.equal(proposal.cutOperation.groupId,'road');
 assert.equal(proposal.cut.scopePortionId,owner.scopePortionId);assert.equal(proposal.cut.widthM,owner.widthM);
 assert.deepEqual(proposal.cut.scopeGeometry,owner.scopeGeometry);assert.deepEqual(proposal.cut.sourceAxis,[owner.sourceAxis[0],coordinate]);
 assert.equal(proposal.comparison.baselineCertified,false);
 assert.equal(proposal.comparison.noCutServedAreaM2,null);assert.equal(proposal.comparison.servedAreaGainM2,null);assert.equal(proposal.comparison.improved,null);
 assert.equal(proposal.comparison.referenceQualification,qualification);
 assert.ok(Number.isFinite(proposal.comparison.cutServedAreaM2)&&proposal.comparison.cutServedAreaM2>0);
 assert.ok(proposal.terrain.applied.portionResults.every(portion=>portion.validation.valid&&portion.validation.automaticSpacing));
 assert.ok(proposal.terrain.applied.portionResults.every(portion=>portion.coverage.referenceAreaM2===proposal.result.coverage.referenceAreaM2));
 assert.equal(proposal.result.coverage.referenceAreaM2,project.terrain.applied.result.coverage.referenceAreaM2,'the original pre-road reference is fixed');
 assert.deepEqual(proposal.cutOperation.beforePortionIds,project.rowPortions.map(portion=>portion.id));
 assert.equal(proposal.terrain.history.entries.filter(entry=>entry.operationId==='policy-endpoint'&&entry.kind==='cut').length,1);
 assert.ok(reply.usage.nodeCount>0&&reply.usage.nodeCount<=500000);assert.ok(reply.usage.remainingMs>0);
 assert.deepEqual(readTerrainEnvelope(materialize(project,proposal),{budget:createTerrainBudget({kind:'cut'})}),proposal.result,'fresh real replay still validates complete owned child rows');
 assert.equal(JSON.stringify(project),before);assert.equal(JSON.stringify(observed.sent.project),before);
 console.info('native-endpoint-policy-worker',JSON.stringify(reply.usage));
});

test('generic replacement remains eager and retains its certified comparison with identical actual child quantities',async()=>{
 const actualEndpoint=(await endpointOperation()).observed.reply.proposal;
 const {project,model}=priorNativeGroup(),{owner,sourceAxis}=ownerRequest(project),before=JSON.stringify(project),budget=createTerrainBudget({kind:'cut'});
 let baselineCount=0,baseline;
 const evaluator=design.createScopedTerrainCutEvaluator({project,model,portionId:owner.scopePortionId,groupId:'road',budget,onBaselineAreaMeasurement(value){baselineCount++;baseline=value;}});
 assert.equal(evaluator.noCutFamily.ok,true,JSON.stringify(evaluator.noCutFamily.diagnostics));assert.equal(baselineCount,1);
 assert.ok(baseline.areaM2>0);assert.equal(Object.isFrozen(evaluator.noCutFamily),true);
 const proposal=evaluator.evaluateCandidate({sourceAxis,widthM:owner.widthM,groupId:'road'});
 assert.equal(proposal.ok,true,JSON.stringify(proposal));assert.equal(proposal.comparison.baselineCertified,true);
 assert.equal(proposal.comparison.noCutServedAreaM2,baseline.areaM2);assert.equal(Object.hasOwn(proposal.comparison,'referenceQualification'),false);
 assert.equal(typeof proposal.comparison.improved,'boolean');assert.ok(Number.isFinite(proposal.comparison.servedAreaGainM2));
 assert.ok(actualEndpoint?.ok,'the real worker operation supplies actual comparison data');
 for(const key of ['result','rowPortions','cut','cutOperation','createdChildIds','affectedPortionIds'])assert.deepEqual(proposal[key],actualEndpoint[key],key);
 assert.deepEqual(proposal.terrain.applied,actualEndpoint.terrain.applied,'the optional comparison cannot change source/envelope/validation/quantity bytes');
 assert.equal(JSON.stringify(project),before);console.info('native-endpoint-policy-generic',JSON.stringify(budget.usage()));
});

test('typed endpoint producer independently rejects missing duplicate malformed and nonowned replacements',()=>{
 const {project,model}=priorNativeGroup(),{member,sourceAxis}=ownerRequest(project);
 const cases=[
  {name:'missing member',project,exclusionId:'missing'},
  {name:'duplicate member',project:{...project,exclusions:[...project.exclusions,member]},exclusionId:member.id},
  {name:'no previous applied group',project:{...project,terrain:null},exclusionId:member.id},
  {name:'incompatible model',project,model:{...model,contentHash:'another-model'},exclusionId:member.id},
  {name:'malformed actual owner',project:{...project,exclusions:project.exclusions.map(saved=>saved.surfaceGroupOwner?{...saved,scopePortionId:''}:saved)},exclusionId:member.id},
  {name:'legacy exclusion',project:{...project,exclusions:[{id:'legacy',geometry:project.geometry}]},exclusionId:'legacy'},
  {name:'literal replacement',project:{...project,exclusions:project.exclusions.map(saved=>{if(!saved.surfaceGroupOwner)return saved;const {surfaceConstructionPolicy,scopeGeometry,scopePortionId,sourceAxis,widthBasis,modelHash,widthM,...literal}=saved;return {...literal,surfaceGeometryConvention:'literal'};})},exclusionId:member.id}
 ];
 for(const entry of cases){
  const input={project:entry.project,model:entry.model??model,exclusionId:entry.exclusionId,sourceAxis,budget:createTerrainBudget({kind:'cut'})},before=JSON.stringify(input.project);
  assert.throws(()=>typedEndpoint(input),error=>['invalid-input','invalid-applied','invalid-surface-group'].includes(error?.status),entry.name);
  assert.equal(JSON.stringify(input.project),before,entry.name);
 }
});

test('typed endpoint producer requires exactly one changed real endpoint and accepts no caller ownership or skip fields',()=>{
 const {project,model}=priorNativeGroup(),{owner,member,sourceAxis}=ownerRequest(project),input={project,model,exclusionId:member.id};
 const both=clone(sourceAxis);both[0]=geographic([[4.5,-2]])[0];
 const sparseAxis=new Array(2);sparseAxis[1]=sourceAxis[1];const sparsePoint=new Array(2);sparsePoint[0]=sourceAxis[1][0];
 for(const axis of [owner.sourceAxis,both,sourceAxis.slice(0,1),sparseAxis,[sourceAxis[0],sparsePoint],[sourceAxis[0],[181,0]],[sourceAxis[0],[sourceAxis[1][0],NaN]]]){
  assert.throws(()=>typedEndpoint({...input,sourceAxis:axis,budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-input'});
 }
 for(const extra of [{groupId:'other'},{portionId:'other'},{widthM:99},{skipBaseline:true},{trusted:true},{comparison:{baselineCertified:true}}]){
  assert.throws(()=>typedEndpoint({...input,sourceAxis,...extra,budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-input'});
 }
});

test('typed endpoint producer rejects an expired real budget before reading project or copying axis',()=>{
 let reads=0;const project={get exclusions(){reads++;return [];}},budget=createTerrainBudget({kind:'cut',deadlineMs:0,clock:()=>0});
 assert.throws(()=>typedEndpoint({project,model:null,exclusionId:'member',sourceAxis:[[0,0],[1,1]],budget}),{status:'budget-exceeded'});
 assert.equal(reads,0);
});
