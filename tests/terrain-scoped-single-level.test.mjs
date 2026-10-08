import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js?v=1.3.2';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.2';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.2';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.2';
import {buildContourFamily} from '../src/terrain-contour-family.js?v=1.3.2';
import {compareMeasuredSurfaceAreas,traceSurfaceBand} from '../src/terrain-surface-bands.js?v=1.3.2';
import {createScopedTerrainCutEvaluator} from '../src/terrain-contour-design.js?v=1.3.2';
import {readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.2';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
const diagnostic=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?String(item):item);

function fixture(){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,i)=>{const x=-40+(i%3)*40,y=40-Math.floor(i/3)*40;return (x<0?.05:.4)*x+.2*y;})}});
 const ring=[[-10,2.5],[0,0],[10,-20],[10,0],[0,20],[-10,22.5],[-10,2.5]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const budget=createTerrainBudget({kind:'cut'}),domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring]},budget});
 return {domain,budget};
}

test('strict single-level scoped family certifies the actual complete eight-face offered level',()=>{
 const {domain,budget}=fixture();let count=0,measurement;
 const family=buildContourFamily({domain,portion:{id:'source'},reference:{headlandWidthM:0,originalDomain:domain},spacingM:3,candidateGeneration:{kind:'scoped-single-level-1',singleLevelM:2},onSelectedAreaMeasurement(value){count++;measurement=value;},budget});
 assert.equal(family.ok,true,JSON.stringify(family.diagnostics));
 assert.equal(family.axes.length,1);assert.equal(family.axes[0].levelM,2);
 assert.equal(family.axes[0].axisGeometryConvention,'finite-polyline-domain-intersection-1');
 assert.equal(family.validation.valid,true);
 assert.equal(family.diagnostics.globalOptimality,false);
 assert.equal(family.diagnostics.searchScope,'one-explicit-complete-level');
 assert.equal(family.diagnostics.candidates.length,1);
 assert.equal(count,1);assert.equal(compareMeasuredSurfaceAreas(measurement,measurement,{budget}),0);
});

test('strict single-level scoped family rejects missing nonfinite or authority-like option fields',()=>{
 const {domain,budget}=fixture();
 for(const candidateGeneration of [{kind:'scoped-single-level-1'},{kind:'scoped-single-level-1',singleLevelM:NaN},{kind:'scoped-single-level-1',singleLevelM:2,trusted:true},{kind:'scoped-single-level-1',singleLevelM:2,referenceLevelM:1}]){
  const family=buildContourFamily({domain,portion:{id:'source'},spacingM:3,candidateGeneration,budget});
  assert.equal(family.ok,false);assert.match(family.diagnostics.message,/candidate generation/i);
 }
});

test('actual nine-metre straight finite baseline certifies collinear physical caps with private area',()=>{
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]]});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
 const before=JSON.stringify(project),budget=createTerrainBudget({kind:'cut'});
 let count=0,measurement;
 const evaluator=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget,onBaselineAreaMeasurement(value){count++;measurement=value;}});
 console.info('straight-finite-baseline-usage',JSON.stringify(budget.usage()));
 assert.equal(evaluator.noCutFamily.ok,true,JSON.stringify(evaluator.noCutFamily.diagnostics));
 assert.equal(evaluator.noCutFamily.axes.length,1);
 assert.equal(evaluator.noCutFamily.axes[0].axisGeometryConvention,'finite-polyline-domain-intersection-1');
 assert.equal(evaluator.noCutFamily.diagnostics.searchScope,'one-explicit-complete-level');
 assert.equal(evaluator.noCutFamily.diagnostics.globalOptimality,false);
 assert.equal(evaluator.noCutFamily.validation.valid,true);
 assert.equal(evaluator.noCutFamily.validation.coverage.complete,true);
 assert.equal(count,1);
 assert.ok(measurement.areaM2>0&&measurement.areaM2<=evaluator.referenceAreaM2);
 assert.equal(compareMeasuredSurfaceAreas(measurement,measurement,{budget}),0);
 const axis=evaluator.noCutFamily.axes[0],sourceBefore=JSON.stringify(axis);
 const band=traceSurfaceBand({domain:evaluator.physicalDomain,originalDomain:evaluator.originalDomain,axisXY:axis,widthM:3,policy:'contour-normal',areaMode:'constant-plane',budget});
 assert.equal(band.valid,true,JSON.stringify(band.validation));
 const guards=band.validation.boundaryGuards.filter(guard=>guard.kind==='physical-source-cap-outward-collinear-boundary-guard');
 assert.ok(guards.length>0);
 assert.ok(guards.every(guard=>guard.nativeCapSide*guard.nativeShiftSide>0));
 assert.ok(band.validation.capEndpointErrorBoundM<=1e-5);
 assert.ok(band.validation.finiteCapCasting.every(cast=>cast.nativeOutward&&cast.geographicOutward&&cast.displacementUpperM<=1e-5));
 assert.equal(compareMeasuredSurfaceAreas(band,band,{budget}),0);
 assert.equal(JSON.stringify(axis),sourceBefore);
 assert.equal(JSON.stringify(project),before);
});

test('actual native five-metre crease cut certifies the constructive filled families and fixed-reference gain',()=>{
 const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:15,height:37,origin:[499965,5000115],step:[5,-5],values:Array.from({length:555},(_,index)=>{
  const x=-35+(index%15)*5,y=115-Math.floor(index/15)*5;
  return .2*y+.05*x+.35*Math.max(x,0);
 })}});
 const geometry=geographic([[-30,7.5],[0,0],[30,-60],[30,40],[0,100],[-30,107.5],[-30,7.5]]);
 const project={geometry,exclusions:[],rowSpacingM:3,plantSpacingM:1,postSpacingM:6,headlandWidthM:0,orientationDeg:0,rowPortions:[{id:'source',geometry:[geometry],mode:'inherited',orientationDeg:0}]};
 const before=JSON.stringify(project),budget=createTerrainBudget({kind:'cut',onProgress(value){console.info('constructive-native-crease-phase',JSON.stringify(value));}});
 let baseline,baselineCount=0,selected,selectedCount=0;
 let evaluator;
 try{evaluator=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget,onBaselineAreaMeasurement(value){baseline=value;baselineCount++;}});}
 finally{console.info('constructive-native-crease-ledger',JSON.stringify({stage:'baseline',constructorComplete:!!evaluator,ok:evaluator?.noCutFamily.ok,...budget.usage()}));}
 assert.equal(evaluator.noCutFamily.ok,true,diagnostic(evaluator.noCutFamily.diagnostics));
 assert.equal(baselineCount,1);
 assert.equal(evaluator.noCutFamily.axes.length,1);
 assert.ok(baseline.areaM2>0&&baseline.areaM2<=388.83,'independent complete-level area upper bound');
 const candidate=evaluator.evaluateCandidate({sourceAxis:geographic([[0,-5],[0,105]]),widthM:1.5,groupId:'crease-road',onSelectedAreaMeasurement(value){selected=value;selectedCount++;}});
 console.info('constructive-native-crease-ledger',JSON.stringify({stage:'candidate',ok:candidate.ok,status:candidate.status,...budget.usage()}));
 assert.equal(candidate.ok,true,diagnostic(candidate));
 assert.equal(candidate.isSplit,true);
 assert.equal(candidate.rowPortions.length,2);
 assert.equal(selectedCount,1);
 assert.ok(selected.areaM2>5855,'independent conservative coverage lower bound');
 assert.ok(compareMeasuredSurfaceAreas(selected,baseline,{budget})>0);
 assert.equal(candidate.comparison.baselineCertified,true);
 assert.equal(candidate.comparison.improved,true);
 assert.equal(candidate.result.coverage.referenceAreaM2,evaluator.referenceAreaM2);
 assert.ok(candidate.terrain.applied.portionResults.every(portion=>portion.design.axes.length>=2&&portion.design.axisGeometryConvention==='finite-polyline-domain-intersection-1'));
 const saved=JSON.parse(JSON.stringify({...project,...candidate.projectPatch}));
 const replay=readTerrainEnvelope(saved,{budget});
 console.info('constructive-native-crease-ledger',JSON.stringify({stage:'JSON-reload',terrainStatus:replay.terrainStatus,...budget.usage()}));
 assert.equal(replay.terrainStatus,'applied');
 assert.deepEqual(replay.rows,candidate.result.rows);
 assert.equal(JSON.stringify(project),before);
});
