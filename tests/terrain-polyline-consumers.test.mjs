import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js?v=1.3.5';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.5';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.5';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.5';
import {exactDomain,cmp,Q,div,inRegion} from '../src/terrain-exact.js?v=1.3.5';
import {traceFinitePolylineContourLevel,resolveFinitePolylineSourceAxis} from '../src/terrain-polyline-source.js?v=1.3.5';
import {axisPieces} from '../src/terrain-surface-flow.js?v=1.3.5';
import {certifyContourElevation,certifyContourSpacing} from '../src/terrain-contour-validation.js?v=1.3.5';
import {measureContourAxes} from '../src/terrain-contour-family.js?v=1.3.5';
import {traceSurfaceBand,compareMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.5';
import {buildTerrainPassage} from '../src/terrain-passage.js?v=1.3.5';
import {deriveCanonicalCutScopes} from '../src/terrain-canonical-domain.js?v=1.3.5';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';

const diagnostic=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item);
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const polygon=points=>({type:'Polygon',coordinates:[geographic(points)]});
function fixture({progress=false}={}){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,i)=>{const x=-40+(i%3)*40,y=40-Math.floor(i/3)*40;return (x<0?.05:.4)*x+.2*y;})}});
 const budget=createTerrainBudget({kind:'cut',...(progress?{onProgress(value){console.info('polyline-consumer-phase',diagnostic(value));}}:{})}),domain=createContourDomain({model,geometry:polygon([[-10,2.5],[0,0],[10,-20],[10,0],[0,20],[-10,22.5],[-10,2.5]]),budget});
 const traced=traceFinitePolylineContourLevel(domain,2,{originalDomain:domain,portionId:'source',budget});
 assert.deepEqual(traced.diagnostics,[]);assert.equal(traced.axes.length,1);
 return {model,budget,domain,axis:traced.axes[0]};
}

test('finite polyline consumer dispatch resolves actual eight-face pieces and certifies their elevations',()=>{
 const {domain,axis,budget}=fixture(),resolved=axisPieces(exactDomain(domain,budget),axis,budget,{originalDomain:domain});
 assert.equal(resolved.uncovered.length,0,diagnostic(resolved.uncovered));
 assert.ok(resolved.pieces.length>=2);
 assert.ok(resolved.pieces.some(piece=>cmp(piece.faces[0].g[0],div(Q(2),Q(40)))===0));
 assert.ok(resolved.pieces.some(piece=>cmp(piece.faces[0].g[0],div(Q(16),Q(40)))===0));
 const elevation=certifyContourElevation(domain,[axis],{originalDomain:domain,budget});
 assert.equal(elevation.valid,true,diagnostic(elevation));
 assert.ok(elevation.maxDeviationM<=.001);
});

test('actual eight-face complete level passes continuous A and B with private served-area proof',()=>{
 const {domain,axis,budget}=fixture({progress:true});
 const spacing=certifyContourSpacing(domain,[axis],{spacingM:3,originalDomain:domain,budget});
 assert.equal(spacing.valid,true,diagnostic(spacing));
 assert.equal(spacing.coverage.complete,true);
 console.info('polyline-consumer-usage',diagnostic({stage:'A',...budget.usage()}));
 const band=traceSurfaceBand({domain,originalDomain:domain,axisXY:axis,widthM:3,policy:'contour-normal',areaMode:'coplanar-patches',budget});
 console.info('polyline-consumer-usage',diagnostic({stage:'B',...budget.usage()}));
 assert.equal(band.valid,true,diagnostic(band.validation));
 assert.equal(band.validation.coverage.complete,true);
 assert.ok(band.areaM2>0);
 assert.equal(band.validation.boundaryGuards.some(guard=>guard.kind==='clipped-source-cap'),false,'true-P caps must not receive interior construction guards');
 assert.ok(band.validation.boundaryGuards.some(guard=>guard.kind==='physical-source-cap-constrained-boundary-guard'));
 assert.ok(band.validation.finiteCapCasting.length>=2);
 for(const cast of band.validation.finiteCapCasting){assert.equal(cast.nativeOutward,true);assert.equal(cast.geographicOutward,true);assert.ok(cast.candidateCount<=25);assert.ok(cast.displacementUpperM<=1e-5);}
 assert.ok(band.validation.capEndpointErrorBoundM<=1e-5);
 assert.equal(compareMeasuredSurfaceAreas(band,band,{budget}),0);
});

test('finite polyline consumer scope context never trusts a copied original domain',()=>{
 const {domain,axis,budget}=fixture();
 const copied=Object.freeze({...domain});
 const resolved=axisPieces(exactDomain(domain,budget),axis,budget,{originalDomain:copied});
 assert.equal(resolved.pieces.length,0);
 assert.ok(resolved.uncovered.length>0);
 const elevation=certifyContourElevation(domain,[axis],{originalDomain:copied,budget});
 assert.equal(elevation.valid,false);
});

test('finite polyline consumers intersect the actual original perimeter before a larger physical scope',()=>{
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,i)=>(40-Math.floor(i/3)*40)/5)}});
 const budget=createTerrainBudget({kind:'cut'}),original=createContourDomain({model,geometry:polygon([[-6,-10],[6,-10],[6,10],[-6,10],[-6,-10]]),budget}),physical=createContourDomain({model,geometry:polygon([[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]]),budget});
 const traced=traceFinitePolylineContourLevel(physical,1,{originalDomain:original,portionId:'source',budget});
 assert.equal(traced.axes.length,1,diagnostic(traced.diagnostics));
 const axis=traced.axes[0],resolved=axisPieces(exactDomain(physical,budget),axis,budget,{originalDomain:original});
 assert.equal(resolved.uncovered.length,0,diagnostic(resolved.uncovered));
 assert.ok(resolved.pieces.length>0);
 const originalKernel=exactDomain(original,budget),before=resolveFinitePolylineSourceAxis(originalKernel,axis,budget,{original:true,originalDomain:original});
 for(const piece of resolved.pieces)for(const endpoint of [piece.a,piece.b])assert.ok(inRegion(endpoint,originalKernel)>=0,'larger current P cannot restore removed original perimeter');
 assert.deepEqual(resolved.pieces[0].a,before.pieces[0].a);
 assert.deepEqual(resolved.pieces.at(-1).b,before.pieces.at(-1).b);
 assert.equal(resolved.pieces[0].startCap.scopeHash,axis.axisGeometryBinding.originalScopeHash);
 assert.equal(resolved.pieces.at(-1).endCap.scopeHash,axis.axisGeometryBinding.originalScopeHash);
});


test('finite polyline original ground headlands cross the crease once and keep bounded interior guards',()=>{
 const {domain,axis,budget}=fixture();
 const measured=measureContourAxes({domain,physicalDomain:domain,axes:[axis],headlandWidthM:3,budget});
 assert.equal(measured.trimRecords.length,1);
 assert.equal(measured.trimRecords[0].basis,'original-perimeter-ground-arclength');
 assert.equal(measured.trimRecords[0].consumedByHeadlands,false);
 for(const end of measured.trimRecords[0].removedEnds){
  assert.ok(end.removedLengthBoundsM[0]>=3);
  assert.ok(end.removedLengthBoundsM[1]<=3+1e-6);
 }
 assert.equal(measured.rows.length,1);
 const row=measured.rows[0];
 assert.equal(row.coordinateRole,'render-export-preview');
 assert.equal(row.quantityBasis,'model-surface');
 assert.equal(row.axisOperation.kind,'polyline-source-parameter-intervals-1');
 assert.ok(row.surfaceLengthBoundsM[0]>0);
 const retained={...axis,axisOperation:{kind:row.axisOperation.kind,intervals:row.axisOperation.intervals}};
 const band=traceSurfaceBand({domain,originalDomain:domain,axisXY:retained,widthM:3,policy:'contour-normal',areaMode:'coplanar-patches',budget});
 assert.equal(band.valid,true,diagnostic(band.validation));
 assert.ok(band.validation.capEndpointErrorBoundM<=1e-5);
 assert.equal(compareMeasuredSurfaceAreas(band,band,{budget}),0);
});

// Complete source regeneration and exact actual-target first exits must retain
// the independent family-membership and minimum-approach rejection gates.
test('finite actual target first exits still reject omitted internal ordinals and overclose rows',()=>{
 const {domain,budget}=fixture();
 const a=traceFinitePolylineContourLevel(domain,1,{portionId:'source',ordinal:0,budget}).axes[0];
 const omitted=traceFinitePolylineContourLevel(domain,3,{portionId:'source',ordinal:2,budget}).axes[0];
 assert.ok(a&&omitted);
 const gap=certifyContourSpacing(domain,[a,omitted],{spacingM:3,originalDomain:domain,budget});
 assert.equal(gap.valid,false);
 assert.ok(gap.critical.some(record=>record.reason==='missing-axis'&&record.detail==='known-ordinal-gap'));
 const close=traceFinitePolylineContourLevel(domain,1.01,{portionId:'source',ordinal:1,budget}).axes[0];
 assert.ok(close);
 const approach=certifyContourSpacing(domain,[a,close],{spacingM:3,originalDomain:domain,budget});
 assert.equal(approach.valid,false);
 assert.ok(approach.critical.some(record=>record.reason==='too-close'));
});

test('actual canonical cut child finite closed physical caps certify A and B on regular plane boundary',()=>{
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]]});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
 const budget=createTerrainBudget({kind:'cut'}),originalDomain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]},budget});
 const passage=buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road',budget});
 const scopes=deriveCanonicalCutScopes({project:{...project,exclusions:passage.exclusions},model,groupId:'road',budget});
 assert.equal(scopes.children.length,2);
 const domain=scopes.children.find(child=>child.domain.boundaries.some(boundary=>boundary.coordinatesXY.some(point=>point[0]===500000))).domain;
 const axes=[.033589687084268516,.7611965621932675].map((levelM,ordinal)=>{
  const traced=traceFinitePolylineContourLevel(domain,levelM,{originalDomain,portionId:'source',ordinal,budget});
  assert.deepEqual(traced.diagnostics,[]);assert.equal(traced.axes.length,1);return traced.axes[0];
 });
 const spacing=certifyContourSpacing(domain,axes,{spacingM:3,originalDomain,budget});
 console.info('actual-child-cap-ledger',diagnostic({stage:'A',...budget.usage()}));
 assert.equal(spacing.valid,true,diagnostic(spacing));
 assert.equal(spacing.coverage.complete,true);
 assert.equal(spacing.critical.length,0);assert.equal(spacing.unresolved.length,0);
 for(const axis of axes){
  const band=traceSurfaceBand({domain,originalDomain,axisXY:axis,widthM:3,policy:'contour-normal',areaMode:'constant-plane',budget});
  assert.equal(band.valid,true,diagnostic(band.validation));
  assert.equal(band.validation.coverage.complete,true);
  assert.ok(band.validation.capEndpointErrorBoundM<=1e-5);
  assert.equal(compareMeasuredSurfaceAreas(band,band,{budget}),0);
 }
 console.info('actual-child-cap-ledger',diagnostic({stage:'B',...budget.usage()}));
});
