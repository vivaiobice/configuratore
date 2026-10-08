import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {buildTerrainProposal} from '../src/terrain-design.js';
import {readTerrainEnvelope,hashTerrainEnvelope,terrainGeometryInputHash} from '../src/terrain-replay.js';
import {terrainInputHash} from '../src/terrain-model.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {fromUTM} from '../src/coordinate-system.js';

function reseal(project){
 const applied=project.terrain.applied;
 applied.inputs.rowPortions=structuredClone(project.rowPortions);
 applied.inputHash=terrainGeometryInputHash(project,project.terrain.model);
 applied.resultHash=terrainInputHash(applied.result);applied.snapshotHash=hashTerrainEnvelope(applied);
 return project;
}

test('a measured sloping manual project stores ground-spaced axes and replays the same physical quantities',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const before=JSON.stringify(fixture.project),proposal=buildContourTerrainProposal({...fixture,mode:'measure',manualGroundSpacing:true});
 assert.equal(proposal.ok,true,proposal.message);const portion=proposal.terrain.applied.portionResults[0];
 assert.equal(portion.design.groundSpacing?.algorithmVersion,'native-manual-ground-spacing-1');
 assert.equal(portion.validation.groundSpacing,true);
 const xs=portion.design.axes.map(axis=>axis.components[0].coordinatesXY[0][0]).sort((a,b)=>a-b);
 for(let i=1;i<xs.length;i++)assert.ok(Math.abs((xs[i]-xs[i-1])*Math.sqrt(2)-3)<1e-4);
 assert.equal(proposal.result.headPosts,proposal.result.rows.length*2);
 const applied={...fixture.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 assert.deepEqual(readTerrainEnvelope(applied),proposal.result);assert.equal(JSON.stringify(fixture.project),before);
});

test('rehashed ground-spacing rows cannot replace the native measured layout',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const proposal=buildContourTerrainProposal({...fixture,mode:'measure',manualGroundSpacing:true});assert.equal(proposal.ok,true,proposal.message);
 assert.ok(proposal.terrain.applied.portionResults[0].design.groundSpacing);
 const applied=structuredClone({...fixture.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain});
 const portion=applied.terrain.applied.portionResults[0];portion.design.axes[0].components[0].coordinatesXY[0][0]+=.1;
 applied.rowPortions[0].terrainDesign=structuredClone(portion.design);
 // A matching display mirror does not supply proof for different native axes.
 assert.equal(readTerrainEnvelope(reseal(applied)).terrainStatus,'invalid');
});

test('a rehashed flat quantity label cannot bypass nonflat physical row validation',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const proposal=buildContourTerrainProposal({...fixture,mode:'measure',manualGroundSpacing:true});assert.equal(proposal.ok,true,proposal.message);
 const project=structuredClone({...fixture.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain}),applied=project.terrain.applied;
 applied.portionResults[0].quantityBasis='certified-flat-legacy';applied.portionResults[0].rows[0].lengthM+=2;
 applied.result.rows=structuredClone(applied.portionResults[0].rows);
 assert.equal(readTerrainEnvelope(reseal(project)).terrainStatus,'invalid');
});

test('rehashed ground layout requires its complete portion and aggregate row sets',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const proposal=buildContourTerrainProposal({...fixture,mode:'measure',manualGroundSpacing:true});assert.equal(proposal.ok,true,proposal.message);
 for(const mutation of ['missing-portion','extra-row']){
  const project=structuredClone({...fixture.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain}),applied=project.terrain.applied;
  if(mutation==='missing-portion')applied.portionResults=[];
  else applied.result.rows.push({...structuredClone(applied.result.rows[0]),fragmentId:'invented-fragment'});
  assert.equal(readTerrainEnvelope(reseal(project)).terrainStatus,'invalid',mutation);
 }
});

test('manual spacing rejects a strongly varying saddle while leaving the previous project intact',()=>{
 const fixture=contourFixture({height:(x,y)=>x*y/5,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const before=JSON.stringify(fixture.project),proposal=buildContourTerrainProposal({...fixture,mode:'measure',manualGroundSpacing:true});
 assert.equal(proposal.ok,false);assert.equal(proposal.status,'ground-spacing-unsupported');
 assert.equal(proposal.result,undefined);assert.equal(JSON.stringify(fixture.project),before);
});

test('historical measure callers retain their original manual layout without an implicit spacing conversion',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const proposal=buildContourTerrainProposal({...fixture,mode:'measure'});assert.equal(proposal.ok,true,proposal.message);
 assert.equal(proposal.terrain.applied.portionResults[0].design.groundSpacing,undefined);
 assert.equal(proposal.result.quantityBasis,'model-surface');
});


test('the production terrain facade forwards the explicit manual ground-spacing request',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const proposal=buildTerrainProposal({...fixture,algorithmVersion:'terrain-contour-family-1',mode:'measure',followTerrain:false,manualGroundSpacing:true});
 assert.equal(proposal.ok,true,proposal.message);
 assert.equal(proposal.terrain.applied.portionResults[0].design.groundSpacing?.algorithmVersion,'native-manual-ground-spacing-1');
 const xs=proposal.terrain.applied.portionResults[0].design.axes.map(axis=>axis.components[0].coordinatesXY[0][0]).sort((a,b)=>a-b);
 for(let i=1;i<xs.length;i++)assert.ok(Math.abs((xs[i]-xs[i-1])*Math.sqrt(2)-3)<1e-4);
});


test('local ground-layout replay and recalculation consume one cumulative operation allowance',()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const proposal=buildContourTerrainProposal({...fixture,mode:'measure',manualGroundSpacing:true});
 assert.equal(proposal.ok,true,proposal.message);
 const project={...fixture.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain},portionId=proposal.rowPortions[0].id;
 const replayBudget=createTerrainBudget({kind:'measure',clock:()=>0});
 assert.equal(readTerrainEnvelope(project,{budget:replayBudget}).terrainStatus,'applied');
 const calcBudget=createTerrainBudget({kind:'measure',clock:()=>0});
 assert.equal(buildContourTerrainProposal({project,model:fixture.model,portionId,recomputeAll:true,mode:'measure',manualGroundSpacing:true,budget:calcBudget}).ok,true);
 // There is enough remaining allowance for either complete operation alone,
 // but not both. Local reapply must validate the saved layout and calculate
 // the replacement within one caller allowance.
 const initialNodeCount=500000-replayBudget.usage().nodeCount-calcBudget.usage().nodeCount+100;
 const budget=createTerrainBudget({kind:'measure',clock:()=>0,initialNodeCount}),before=JSON.stringify(project);
 const result=buildContourTerrainProposal({project,model:fixture.model,portionId,mode:'measure',manualGroundSpacing:true,budget});
 assert.equal(result.ok,false);assert.equal(result.status,'budget-exceeded');assert.equal(result.budgetReason,'work');
 assert.equal(result.result,undefined);assert.equal(JSON.stringify(project),before);
});


test('a planar child in a heterogeneous field uses an actually scoped native source',()=>{
 const fixture=contourFixture({height:(_x,y)=>y<10?y/4:2.5+(y-10)/2,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]].map(([x,y])=>[x+.07*y,y])});
 const ring=points=>points.map(([x,y])=>fromUTM([500000+x+.07*y,5000000+y],32632));
 fixture.project.exclusions=[ring([[-1,9.5],[22,9.5],[22,11],[-1,11],[-1,9.5]])];
 fixture.project.rowPortions=[{id:'lower',mode:'local',orientationDeg:90,geometry:[ring([[.37,.63],[20.37,.63],[20.37,9.5],[.37,9.5],[.37,.63]])]},
 {id:'upper',mode:'local',orientationDeg:0,geometry:[ring([[.37,11],[20.37,11],[20.37,20.63],[.37,20.63],[.37,11]])]}];
 const proposal=buildContourTerrainProposal({...fixture,portionId:'upper'});
 assert.equal(proposal.ok,true,proposal.message+' '+JSON.stringify(proposal.diagnostics));
 const portion=proposal.terrain.applied.portionResults.find(p=>p.id==='upper');
 assert.equal(portion.validation.automaticSpacing,true);
 assert.equal(portion.design.axisGeometryConvention,'finite-polyline-domain-intersection-1');
 assert.equal(proposal.result.headPosts,proposal.result.rows.length*2);
});


test('the authentic terrain worker produces a ground-spaced manual layout for the UI request',async()=>{
 const fixture=contourFixture({height:x=>x,geometryXY:[[.37,.63],[20.37,.63],[20.37,20.63],[.37,20.63],[.37,.63]]});
 const previous=globalThis.self,messages=[];
 globalThis.self={postMessage:message=>messages.push(structuredClone(message))};
 try{
  await import('../src/terrain-worker.js?ground-ui-worker-regression');
  self.onmessage({data:structuredClone({...fixture,algorithmVersion:'terrain-contour-family-1',mode:'measure',kind:'measure',followTerrain:false,manualGroundSpacing:true})});
  const reply=messages.findLast(message=>message.type==='result'),proposal=reply?.proposal;
  assert.equal(proposal?.ok,true,proposal?.message);
  assert.equal(proposal.terrain.applied.portionResults[0].design.groundSpacing?.algorithmVersion,'native-manual-ground-spacing-1');
  const applied={...fixture.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
  assert.deepEqual(readTerrainEnvelope(applied),proposal.result);
  assert.equal(proposal.result.headPosts,proposal.result.rows.length*2);
 }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});
