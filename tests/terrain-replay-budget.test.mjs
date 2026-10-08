import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {buildTerrainPassage} from '../src/terrain-passage.js';
import {deriveCanonicalCutScopes} from '../src/terrain-contour-domain.js';
import {createContourEnvelope,readTerrainEnvelope} from '../src/terrain-replay.js';

const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
let ordinaryFixture,canonicalFixture;
function ordinary(){
 if(ordinaryFixture)return ordinaryFixture;
 // The reviewed controller/axis-replay plane, on a small 32-face acquired grid.
 const model=createTerrainModel({acquiredAt:'2026-10-06T00:00:00Z',grid:{width:5,height:5,origin:[499995,5000015],step:[5,-5],values:Array.from({length:25},(_,i)=>(15-Math.floor(i/5)*5)/2)}});
 const original={geometry:geographic([[0,0],[12,0],[12,12],[0,12],[0,0]]),exclusions:[],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowCurvePoints:[],maintainRowEquidistance:true};
 const proposal=buildContourTerrainProposal({project:original,model,mode:'measure'});
 assert.equal(proposal.ok,true,proposal.message);
 const project={...original,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 ordinaryFixture={original,model,proposal,project};return ordinaryFixture;
}
function canonical(){
 if(canonicalFixture)return canonicalFixture;
 const {original,model}=ordinary(),budget=createTerrainBudget({kind:'cut'});
 const source={...original,rowPortions:[{id:'source',label:'Original scope',geometry:[original.geometry],mode:'inherited',orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}]};
 // Real supported passage and owner-derived children; no submitted proof/rows.
 const road=buildTerrainPassage({project:source,model,portionId:'source',sourceAxis:geographic([[6,-2],[6,14]]),widthM:1.5,groupId:'budget-road',createId:()=> 'road-owner',budget});
 const cutProject={...source,exclusions:road.exclusions},scopes=deriveCanonicalCutScopes({project:cutProject,model,groupId:'budget-road',budget});
 assert.equal(scopes.children.length,2);
 cutProject.rowPortions=scopes.children.map((child,index)=>({id:index?'sibling':'source',label:index?'Sibling':'Original scope',geometry:child.domain.geometry.coordinates,terrainScopeRecipe:child.recipe,mode:'inherited',orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}));
 const proposal=buildContourTerrainProposal({project:cutProject,model,mode:'measure',recomputeAll:true,budget});
 assert.equal(proposal.ok,true,proposal.message);
 const project={...cutProject,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 assert.equal(readTerrainEnvelope(project).terrainStatus,'applied');
 canonicalFixture={project,proposal,model};return canonicalFixture;
}

// Removing the supplied-budget entry check would read a valid result at zero.
test('explicit expired replay budget propagates before model reads',()=>{
 const {project}=ordinary(),budget=createTerrainBudget({kind:'cut',deadlineMs:0,clock:()=>0});
 let modelReads=0;const terrain={...project.terrain};Object.defineProperty(terrain,'model',{get(){modelReads++;return project.terrain.model;}});
 assert.throws(()=>readTerrainEnvelope({...project,terrain},{budget}),{status:'budget-exceeded'});
 assert.equal(modelReads,0);
});

// A missing precharge would allocate four clone payloads despite the full cap.
test('envelope copied coordinates exhaust the caller cap before JSON clones',()=>{
 const {project,model}=ordinary(),applied=project.terrain.applied,budget=createTerrainBudget({kind:'cut',clock:()=>0});
 budget.check(499999);
 const parse=JSON.parse;let copies=0;JSON.parse=(...args)=>{copies++;return parse(...args);};
 try{
  assert.throws(()=>createContourEnvelope({project,model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation,budget}),{status:'budget-exceeded'});
  assert.equal(copies,0,'copied input coordinates must be charged before allocation');
 }finally{JSON.parse=parse;}
});

// A missing return-copy charge would publish real rows at an exhausted cap.
test('replay result coordinates are charged before allocating the returned copy',()=>{
 const {project}=ordinary(),budget=createTerrainBudget({kind:'cut',clock:()=>0});budget.check(499999);
 const parse=JSON.parse;let copies=0;JSON.parse=(...args)=>{copies++;return parse(...args);};
 try{
  assert.throws(()=>readTerrainEnvelope(project,{budget}),{status:'budget-exceeded'});
  assert.equal(copies,0);
 }finally{JSON.parse=parse;}
});

// Ignoring the optional budget would leave its count at zero after real BOO.
test('actual canonical replay charges the same supplied budget through reconstruction',()=>{
 const {project,proposal}=canonical(),real=createTerrainBudget({kind:'cut',clock:()=>0});let charged=0;
 const budget={...real,check(delta=0){charged+=delta;real.check(delta);}};
 const before=JSON.stringify(project),replayed=readTerrainEnvelope(project,{budget});
 assert.equal(replayed.terrainStatus,'applied');
 assert.deepEqual(replayed,proposal.result);
 assert.ok(charged>100,'actual owner/domain reconstruction must use the caller budget');
 assert.equal(JSON.stringify(project),before);
});

// A nested fresh budget or swallowed error would return this actual native DTO.
test('late actual canonical reconstruction propagates cumulative node exhaustion',()=>{
 const {project}=canonical(),real=createTerrainBudget({kind:'cut',clock:()=>0});let charged=0,snapshots=0;
 const budget={...real,check(delta=0){charged+=delta;real.check(delta);}};
 const copy=globalThis.structuredClone;
 globalThis.structuredClone=value=>{
  if(value?.field&&value?.exclusions&&snapshots++===0){
   // Consume the remaining real allowance at the genuine canonical operand
   // snapshot; subsequent native child allocations must use that same cap.
   budget.check(500000-charged);
  }
  return copy(value);
 };
 try{
  assert.throws(()=>readTerrainEnvelope(project,{budget}),{status:'budget-exceeded'});
  assert.ok(snapshots>0,'exhaustion is deliberately late in actual canonical reconstruction');
 }finally{globalThis.structuredClone=copy;}
});

// Recursive precharge/hash traversal would overflow before the real deadline.
test('deep envelope cycles reject before any payload copy',()=>{
 const {project,model}=ordinary(),applied=project.terrain.applied,result={...applied.result};result.extra=result;
 const budget=createTerrainBudget({kind:'cut',clock:()=>0}),parse=JSON.parse;let copies=0;
 JSON.parse=(...args)=>{copies++;return parse(...args);};
 try{
  assert.throws(()=>createContourEnvelope({project,model,result,portionResults:applied.portionResults,validation:applied.validation,budget}));
  assert.equal(copies,0);
 }finally{JSON.parse=parse;}
});

test('deep envelope data reaches the explicit budget rather than the call stack',()=>{
 const {project,model}=ordinary(),applied=project.terrain.applied,result={...applied.result};let cursor=result;
 let observedDepth=0;
 for(let i=0;i<20000;i++){
  const next={};Object.defineProperty(cursor,'extra',{enumerable:true,get(){observedDepth++;return next;}});cursor=next;
 }
 // Entry/projection checks remain within the allowance. The deadline expires
 // only after the actual payload walk has visited fifteen thousand levels.
 const budget=createTerrainBudget({kind:'cut',deadlineMs:1,clock:()=>observedDepth>=15000?1:0});
 const parse=JSON.parse;let copies=0;JSON.parse=(...args)=>{copies++;return parse(...args);};
 try{
  assert.throws(()=>createContourEnvelope({project,model,result,portionResults:applied.portionResults,validation:applied.validation,budget}),{status:'budget-exceeded'});
  assert.ok(observedDepth>=15000,`actual traversal stopped at depth ${observedDepth}`);
  assert.equal(copies,0,'the deadline must precede any payload clone');
 }finally{JSON.parse=parse;}
});

// The optional accounting cannot alter envelope hashes or saved default bytes.
test('explicit envelope accounting preserves actual produced replay and default bytes',()=>{
 const {project,model}=ordinary(),applied=project.terrain.applied,budget=createTerrainBudget({kind:'cut',clock:()=>0});
 const created=createContourEnvelope({project,model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation,budget});
 const ordinaryCreated=createContourEnvelope({project,model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation});
 assert.equal(JSON.stringify(created),JSON.stringify(ordinaryCreated));
 assert.deepEqual(readTerrainEnvelope({...project,terrain:{model,applied:created}},{budget}),applied.result);
 assert.equal(JSON.stringify(created).includes('valuesBase64'),false);
 assert.equal(Object.hasOwn(created,'budget'),false);
 assert.equal(Object.hasOwn(created,'usage'),false);
});

test('explicit budget preserves a real single-row native source-axis envelope',()=>{
 const {original,model}=ordinary(),proposal=buildContourTerrainProposal({project:{...original,rowSpacingM:15},model,mode:'adapt'});
 assert.equal(proposal.ok,true,proposal.message);
 assert.ok(proposal.terrain.applied.portionResults.some(portion=>portion.design.axisGeometryConvention==='source-domain-intersection-1'));
 const project={...original,rowSpacingM:15,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 const budget=createTerrainBudget({kind:'adapt',clock:()=>0});
 assert.deepEqual(readTerrainEnvelope(project,{budget}),proposal.result);
});

test('ordinary archives keep exact gold replay and their existing invalid branch',()=>{
 const gold=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8'));
 for(const item of gold.cases){
  const before=JSON.stringify(item.project);
  assert.deepEqual(readTerrainEnvelope(item.project),item.result);
  const budget=createTerrainBudget({kind:'measure',clock:()=>0});
  assert.deepEqual(readTerrainEnvelope(item.project,{budget}),item.result);
  assert.equal(JSON.stringify(item.project),before);
  const changed={...item.project,rowSpacingM:Number(item.project.rowSpacingM)+1};
  assert.equal(readTerrainEnvelope(changed).terrainStatus,'invalid');
  assert.equal(readTerrainEnvelope(changed,{budget}).terrainStatus,'invalid');
 }
});
