import test from 'node:test';
import assert from 'node:assert/strict';
import * as design from '../src/terrain-contour-design.js?v=1.3.4';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {compareMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.4';
import {readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.4';
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));

test('scoped evaluator retains a fresh native baseline and emits a complete atomic candidate with a fixed field reference',()=>{
 assert.equal(typeof design.createScopedTerrainCutEvaluator,'function');
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
 const original=JSON.stringify(project),budget=createTerrainBudget({kind:'cut',onProgress(value){console.info('actual-cut-phase',JSON.stringify(value));}});
 let baselineCount=0,baseline,selectedCount=0,selected;
 const evaluator=design.createScopedTerrainCutEvaluator({project,model,portionId:'source',budget,
  onBaselineAreaMeasurement(value){baselineCount++;baseline=value;console.info('actual-cut-baseline',JSON.stringify({areaM2:value.areaM2,count:baselineCount,remainingMs:budget.remainingMs()}));}});
 assert.equal(evaluator.noCutFamily.ok,true,JSON.stringify(evaluator.noCutFamily.diagnostics));
 assert.equal(evaluator.noCutFamily.axes[0].axisGeometryConvention,'finite-polyline-domain-intersection-1');
 assert.equal(evaluator.noCutFamily.diagnostics.searchScope,'one-explicit-complete-level');
 assert.equal(baselineCount,1);
 assert.equal(compareMeasuredSurfaceAreas(baseline,baseline,{budget}),0);
 const candidate=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road',
  onSelectedAreaMeasurement(value){selectedCount++;selected=value;}});
 assert.equal(candidate.ok,true,JSON.stringify(candidate));
 assert.equal(candidate.kind,'cut');
 assert.equal(candidate.isSplit,true);
 assert.ok(candidate.rowPortions.every(portion=>portion.terrainDesign.axisGeometryConvention==='source-domain-intersection-1'));
 assert.ok(candidate.diagnostics.portions.every(portion=>portion.candidates.length===2));
 assert.equal(selectedCount,1);
 assert.equal(compareMeasuredSurfaceAreas(selected,selected,{budget}),0);
 assert.deepEqual(candidate.cutOperation.beforePortionIds,['source']);
 assert.deepEqual(candidate.cutOperation.afterPortionIds,candidate.rowPortions.map(portion=>portion.id));
 assert.equal(candidate.cutOperation.action,'create');
 assert.deepEqual(candidate.createdChildIds,candidate.rowPortions.filter(portion=>portion.id!=='source').map(portion=>portion.id));
 assert.deepEqual(candidate.affectedPortionIds,candidate.cutOperation.afterPortionIds);
 assert.equal(candidate.result.coverage.referenceAreaM2,evaluator.referenceAreaM2);
 assert.ok(candidate.result.surfaceUsableAreaM2<evaluator.referenceAreaM2);
 const proposed={...project,...candidate.projectPatch};
 assert.equal(readTerrainEnvelope(proposed,{budget}).terrainStatus,'applied');
 assert.equal(JSON.stringify(project),original);
 project.rowSpacingM=4;
 const stale=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road-2'});
 assert.equal(stale.ok,false);
 assert.equal(stale.status,'stale-context');
 assert.equal(Object.hasOwn(stale,'result'),false);
});
