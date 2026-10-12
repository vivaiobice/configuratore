import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {readTerrainEnvelope} from '../src/terrain-replay.js';

function paddedHill() {
 const n=25;
 const model=createTerrainModel({acquiredAt:'2026-10-12T00:00:00.000Z',grid:{width:n,height:n,origin:[500000,5000000],step:[5,-5],values:Array.from({length:n*n},(_,i)=>{
  const x=(i%n)*5,y=-Math.floor(i/n)*5;
  return Math.fround(120+.05*x+.31*y+.00001*x*y+2*Math.max(0,30-x)+2*Math.max(0,x-80));
 })}});
 const geometry=[[40,-70],[70,-70],[70,-30],[40,-30],[40,-70]].map(([x,y])=>fromUTM([500000.37+x+.007*y,5000000.63+y],32632));
 return {model,project:{geometry,exclusions:[],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowPortions:[{id:'only',mode:'local',orientationDeg:0,geometry:[geometry]}]}};
}

test('unrelated steep padding cannot prevent a complete locally verified native family',()=>{
 const {model,project}=paddedHill(),before=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt'});
 const result=buildContourTerrainProposal({project,model,portionId:'only',budget});
 assert.equal(result.ok,true,JSON.stringify({status:result.status,diagnostics:result.diagnostics,usage:budget.usage()}));
 const portion=result.terrain.applied.portionResults[0];
 assert.ok(portion.rows.length>=10);
 assert.ok(portion.validation.minimumSpacingLowerM>=2.8);
 assert.ok(portion.validation.maximumSpacingUpperM<=3.2);
 assert.ok(portion.validation.maxElevationDeviationM<=.001);
 assert.equal(JSON.stringify(project),before);
 const saved={...project,rowPortions:result.rowPortions,terrain:result.terrain};
 assert.deepEqual(readTerrainEnvelope(saved,{budget:createTerrainBudget({kind:'adapt'})}),result.result);
});
