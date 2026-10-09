import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {readTerrainEnvelope} from '../src/terrain-replay.js';
import {chargeTerrainOperationCopy} from '../src/terrain-worker-client.js';

// 4,225 actual native elevations (8,192 triangles), no provider or resampling.
export function largeNativeFixture({width=100,size=25,shape="rectangle",slope=1/2,breakM=10}={}){
 const n=65,ring=points=>points.map(([x,y])=>fromUTM([500000.37+x+.07*y,5000000.63+y],32632));
 const model=createTerrainModel({acquiredAt:'2026-10-08T00:00:00.000Z',grid:{width:n,height:n,origin:[499900,5000220],step:[5,-5],values:Array.from({length:n*n},(_,i)=>{
  const y=220-Math.floor(i/n)*5;return y<breakM?y/4:breakM/4+(y-breakM)*slope;
 })}});
 const geometry=ring(shape==="L"?[[0,0],[width,0],[width,size],[width/2,size],[width/2,size*2],[0,size*2],[0,0]]:[[0,0],[width,0],[width,size],[0,size],[0,0]]);
 const project={geometry,exclusions:[],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowPortions:[]};
 return {model,project,ring};
}
function verifyCarriedReplay(t,project,result,budget){
 // A real worker transport destroys transient owner identity and evidence.
 // Charge the actual copy and continue its remaining work/time allowance.
 const before=budget.usage();chargeTerrainOperationCopy(result,budget);
 const transported=structuredClone(result),usage=budget.usage(),continuation=createTerrainBudget({kind:'adapt',initialNodeCount:usage.nodeCount,deadlineMs:budget.remainingMs()});
 const replay=readTerrainEnvelope({...project,...transported.projectPatch,rowPortions:transported.rowPortions,terrain:transported.terrain},{budget:continuation});
 assert.deepEqual(replay,result.result);
 continuation.check();
 t.diagnostic(JSON.stringify({transportAndFreshOwnerReplay:{producerUsage:before,continuedUsage:continuation.usage(),addedNodes:continuation.usage().nodeCount-before.nodeCount}}));
}
test('65 by 65 native terrain varying slope completes a 100m family within the original shared budget',t=>{
 const {project,model}=largeNativeFixture(),before=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt'}),started=performance.now();
 const result=buildContourTerrainProposal({project,model,budget});
 const summary={status:result.status,portions:result.diagnostics?.portions.map(p=>({message:p.message,budgetReason:p.budgetReason,candidates:p.candidates.map(c=>({id:c.id,valid:c.valid,critical:c.validation?.critical?.slice(0,2),unresolved:c.validation?.unresolved?.slice(0,2)}))}))};
 t.diagnostic(JSON.stringify({usage:budget.usage(),elapsedMs:performance.now()-started,status:result.status,diagnostics:result.ok?undefined:summary}));
 assert.equal(result.ok,true,JSON.stringify(summary));
 assert.equal(JSON.stringify(project),before);
 assert.ok(result.result.rows.length>=8);
 assert.equal(result.diagnostics.portions[0].searchComplete,false);
 assert.equal(result.diagnostics.portions[0].selectionPolicy,"best-complete-candidate-with-completion-reserve");
 assert.equal(result.result.headPosts,result.result.rows.length*2);
 assert.ok(result.terrain.applied.validation.maxElevationDeviationM<=.001);
 const automatic=result.terrain.applied.portionResults.find(p=>p.validation.automaticSpacing);
 assert.ok(automatic.validation.minimumSpacingLowerM>=2.8&&automatic.validation.maximumSpacingUpperM<=3.2);
 assert.equal(automatic.validation.coverageComplete,true);
 assert.ok(budget.usage().nodeCount<=500000);
 assert.ok(budget.usage().elapsedMs<30000);
 verifyCarriedReplay(t,project,result,budget);
});

test('100m L field with 1.5m passage adapts its nonplane portion and retains the other layout',t=>{
 const {project,model,ring}=largeNativeFixture({shape:'L'});
 project.exclusions=[ring([[-2,25],[102,25],[102,26.5],[-2,26.5],[-2,25]])];
 project.rowPortions=[
  {id:'lower',mode:'local',orientationDeg:0,geometry:[ring([[0,0],[100,0],[100,25],[0,25],[0,0]])]},
  {id:'upper',mode:'local',orientationDeg:90,geometry:[ring([[0,26.5],[50,26.5],[50,50],[0,50],[0,26.5]])]}
 ];
 const before=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt'}),result=buildContourTerrainProposal({project,model,portionId:'lower',budget});
 const summary={status:result.status,usage:budget.usage(),portions:result.diagnostics?.portions.map(p=>({portionId:p.portionId,message:p.message,selected:p.selectedCandidateId,searchComplete:p.searchComplete,candidates:p.candidates.map(c=>({id:c.id,valid:c.valid,unresolved:c.validation?.unresolved?.slice(0,1)}))}))};
 t.diagnostic(JSON.stringify(summary));assert.equal(result.ok,true,JSON.stringify(summary));
 assert.equal(JSON.stringify(project),before);
 assert.equal(result.terrain.applied.portionResults.length,2);
 const lower=result.terrain.applied.portionResults.find(p=>p.id==='lower'),upper=result.terrain.applied.portionResults.find(p=>p.id==='upper');
 assert.equal(lower.validation.automaticSpacing,true);assert.equal(upper.validation.automaticSpacing,false);
 assert.equal(upper.design.orientationDeg,90);assert.ok(lower.rows.length>=8);assert.ok(upper.rows.length>0);
 assert.ok(lower.validation.minimumSpacingLowerM>=2.8&&lower.validation.maximumSpacingUpperM<=3.2);assert.ok(lower.validation.maxElevationDeviationM<=.001);
 assert.equal(result.result.headPosts,result.result.rows.length*2);
 assert.deepEqual(result.affectedPortionIds,['lower','upper']);
 verifyCarriedReplay(t,project,result,budget);
});

test('large native budget rejection carries its actual cause and leaves the project atomically untouched',()=>{
 const {project,model}=largeNativeFixture({shape:'L',size:60,width:60,slope:1/3,breakM:30});
 project.history={preserved:'previous project state'};
 const before=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt',initialNodeCount:499999}),result=buildContourTerrainProposal({project,model,budget});
 assert.equal(result.ok,false);assert.equal(result.status,'budget-exceeded');assert.equal(result.budgetReason,'work');
 assert.ok(result.diagnostics.budget.remainingMs>0);assert.equal(result.terrain,undefined);assert.equal(result.result,undefined);
 assert.equal(JSON.stringify(project),before);
});
