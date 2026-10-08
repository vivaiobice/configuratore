import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {buildContourFamily} from '../src/terrain-contour-family.js';
import {createTerrainBudget} from '../src/terrain-budget.js';

test('complete two-gradient carriers clip exact true scope and evaluate every phase',t=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
 const base=createTerrainBudget({kind:'adapt'});let nodes=0;
 const budget={...base,check(n=0){nodes+=n;base.check(n);}};
 const start=performance.now(),domain=createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry]},budget});
 const r=buildContourFamily({domain,portion:{id:'tilted'},reference:{orientationDeg:42},spacingM:3,budget});
 assert.equal(r.ok,true,JSON.stringify({status:r.status,candidates:r.diagnostics.candidates.map(c=>({id:c.id,valid:c.valid,critical:c.validation?.critical?.slice(0,1),unresolved:c.validation?.unresolved?.slice(0,1)}))}));
 assert.equal(r.validation.coverage.complete,true);
 assert.ok(r.axes.every(a=>a.axisGeometryConvention==='source-domain-intersection-1'));
 const tangent=[-2,1],extents=r.axes.map(axis=>{
  const resolved=resolveSourceAxis(exactDomain(domain,budget),axis,budget);
  const positions=resolved.pieces.flatMap(piece=>[piece.a,piece.b]).map(p=>xy(p).reduce((sum,x,i)=>sum+(x-[500000,5000000][i])*tangent[i],0));
  return [Math.min(...positions),Math.max(...positions)];
 });
 assert.ok(Math.max(...extents.map(pair=>pair[0]))>=Math.min(...extents.map(pair=>pair[1])),'opposite-corner phases have no common tangent slab');
 assert.ok(r.rows.every(row=>row.axisOperation&&row.coordinateRole==='render-export-preview'));
 assert.ok(r.validation.maxElevationDeviationM<=.001);
 assert.ok(r.diagnostics.candidates.length>=2);
 assert.ok(nodes<=500000&&performance.now()-start<30000);
 t.diagnostic(JSON.stringify({nodes,elapsedMs:performance.now()-start,candidates:r.diagnostics.candidates.map(c=>({id:c.id,valid:c.valid,pruned:c.pruned})),timings:budget.timings()}));
});

import {axisBinding,resolveSourceAxis,SOURCE_DOMAIN_AXIS_CONVENTION,exactPieceLengthBounds,physicalFragments} from '../src/terrain-axis-geometry.js';
import {exactDomain,Q,orient,sign,xy} from '../src/terrain-exact.js';
import {certifyContourElevation,certifyContourSpacing} from '../src/terrain-contour-validation.js';
import {measureContourAxes} from '../src/terrain-contour-family.js';
import {traceSurfaceBand} from '../src/terrain-surface-bands.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {readTerrainEnvelope,terrainGeometryInputHash,hashTerrainEnvelope} from '../src/terrain-replay.js';
import {terrainInputHash} from '../src/terrain-model.js';
import clipping from '../src/vendor/polygon-clipping.js';
const domainFor=(f,geometry={type:'Polygon',coordinates:[f.project.geometry]})=>createContourDomain({model:f.model,geometry});
const source=(domain,coordinatesXY,levelM=3,ordinal=0,axisId=`a${ordinal}`,original=domain)=>({axisId,portionId:'p',levelM,ordinal,axisGeometryConvention:SOURCE_DOMAIN_AXIS_CONVENTION,axisGeometryBinding:axisBinding(domain,original),components:[{coordinatesXY}]});

test('outside source operands launch only exact physical seeds and lengths',()=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f);
 const axis=source(domain,[[500036,4999990],[499976,5000020]],4);
 const budget=createTerrainBudget({kind:'measure'}),resolved=resolveSourceAxis(exactDomain(domain,budget),axis,budget);
 assert.ok(resolved.outside.length>0);assert.equal(resolved.uncovered.length,0);
 assert.equal(certifyContourElevation(domain,[axis]).valid,true);
 const bounds=exactPieceLengthBounds(resolved.pieces,budget);
 assert.ok(bounds[0]<=Math.sqrt(180)+1e-7&&bounds[1]>=Math.sqrt(180)-1e-7);
 assert.ok(bounds[1]-bounds[0]<1e-10);
 const measured=measureContourAxes({domain,axes:[axis]});
 assert.equal(measured.rows.length,1);assert.deepEqual(measured.rows[0].surfaceLengthBoundsM,bounds);
 // Deliberately altered display caps have no role in recipe remeasurement.
 measured.rows[0].coordinatesXY[0][0]+=100;
 assert.deepEqual(measureContourAxes({domain,axes:[axis]}).rows[0].surfaceLengthBoundsM,bounds);
 const band=traceSurfaceBand({domain,axisXY:axis,widthM:3,policy:'contour-normal',areaMode:'constant-plane'});
 assert.equal(band.valid,true,JSON.stringify(band.validation.unresolved));
 assert.ok(band.areaM2>0&&band.areaM2<domain.surfaceAreaM2);
});

test('unknown conventions, incomplete caps and missing native support fail closed',()=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f);
 const axis=source(domain,[[500036,4999990],[499976,5000020]],4);
 assert.equal(certifyContourElevation(domain,[{...axis,axisGeometryConvention:'unknown'}]).valid,false);
 const short={...axis,components:[{coordinatesXY:[[500010,5000001],[500002,5000005]]}]};
 assert.equal(certifyContourElevation(domain,[short]).valid,false);
 const literal={...axis};delete literal.axisGeometryConvention;
 assert.equal(certifyContourElevation(domain,[literal]).valid,false);
 const broken={...domain,faces:domain.faces.filter((_,i)=>i!==Math.floor(domain.faces.length/2))};
 assert.throws(()=>resolveSourceAxis(exactDomain(broken),axis,createTerrainBudget({kind:'measure'})),/support/);
});

test('dense membership remains mandatory for complete carriers',()=>{
 const f=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f);
 const y0=2,y1=2+3/Math.sqrt(1.04),axes=[source(domain,[[499980,5000000+y0],[500030,5000000+y0]],y0/5),source(domain,[[499980,5000000+y1],[500030,5000000+y1]],y1/5,1)];
 const valid=certifyContourSpacing(domain,axes,{spacingM:3});
 assert.equal(valid.valid,true,JSON.stringify(valid.unresolved));assert.equal(valid.coverage.complete,true);
 const gap=certifyContourSpacing(domain,[axes[0],{...axes[1],ordinal:2}],{spacingM:3});
 assert.equal(gap.valid,false);assert.ok(gap.critical.some(r=>r.detail==='known-ordinal-gap'));
 const ambiguous=certifyContourSpacing(domain,[axes[0],{...axes[1],ordinal:0}],{spacingM:3});
 assert.equal(ambiguous.valid,false);assert.ok(ambiguous.unresolved.some(r=>r.detail==='ambiguous-ordinal-order'));
 const truncated={...axes[1],components:[{coordinatesXY:[[500002,5000000+y1],[500010,5000000+y1]]}]};
 assert.equal(certifyContourSpacing(domain,[axes[0],truncated],{spacingM:3}).valid,false);
 const gapTarget={...axes[1],axisOperation:{kind:'source-parameter-intervals-1',intervals:[[.45,.55]]}};
 const gapProof=certifyContourSpacing(domain,[axes[0],gapTarget],{spacingM:3});
 assert.equal(gapProof.valid,false);
 assert.ok(gapProof.critical.some(c=>c.reason==='missing-axis'));
 assert.ok([...gapProof.critical,...gapProof.unresolved].some(c=>c.stratum==='point'));
});

test('oblique ground trim uses original perimeter before road/portion clipping',()=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]],exclusionsXY:[[[5,-1],[7,-1],[7,13],[5,13],[5,-1]]]});
 const original=domainFor(f),physical=domainFor(f,{type:'MultiPolygon',coordinates:clipping.difference([f.project.geometry],...f.project.exclusions.map(r=>[r]))});
 const axis=source(physical,[[500036,4999990],[499976,5000020]],4,0,'oblique',original);
 const untrimmed=measureContourAxes({domain:original,physicalDomain:physical,axes:[axis]});
 const trimmed=measureContourAxes({domain:original,physicalDomain:physical,axes:[axis],headlandWidthM:1});
 assert.equal(trimmed.rows.length,2);assert.equal(trimmed.trimRecords.length,1);
 const removed=trimmed.trimRecords[0].removedEnds;
 for(const end of removed){assert.ok(end.removedLengthBoundsM[0]>=1);assert.ok(end.removedLengthBoundsM[1]<=1+1e-6);assert.ok(end.excessBoundsM[0]>=0&&end.excessBoundsM[1]<=1e-6);}
 assert.ok(Math.abs(untrimmed.rows.reduce((s,r)=>s+r.surfaceLengthM,0)-trimmed.rows.reduce((s,r)=>s+r.surfaceLengthM,0)-2)<2e-6);
 for(const row of trimmed.rows){
  assert.equal(row.axisOperation.kind,'source-parameter-intervals-1');
  assert.ok(row.axisOperation.intervals.flat().every(Number.isFinite));
 }
 const retained={...axis,axisOperation:{kind:'source-parameter-intervals-1',intervals:trimmed.rows[0].axisOperation.intervals}};
 const replay=measureContourAxes({domain:original,physicalDomain:physical,axes:[retained]});
 assert.deepEqual(replay.rows.map(r=>r.surfaceLengthBoundsM),trimmed.rows.map(r=>r.surfaceLengthBoundsM));
 assert.throws(()=>measureContourAxes({domain:original,physicalDomain:physical,axes:[{...retained,axisGeometryBinding:{...axis.axisGeometryBinding,scopeHash:'changed'}}]}),/binding/);
});

function rehash(project){
 const applied=project.terrain.applied;
 applied.inputs.rowPortions=structuredClone(project.rowPortions);
 applied.inputHash=terrainGeometryInputHash(project,project.terrain.model);
 applied.resultHash=terrainInputHash(applied.result);applied.snapshotHash=hashTerrainEnvelope(applied);
}
test('V2 replay binds source, operations and shared scopes even after rehash',()=>{
 const input=contourFixture({height:(x,y)=>y/5,headlandM:1,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
 const proposal=buildContourTerrainProposal(input);
 assert.equal(proposal.ok,true,proposal.message);
 const project={...input.project,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 assert.equal(readTerrainEnvelope(project).terrainStatus,'applied');
 for(const mutate of [
  p=>{p.rowPortions[0].terrainDesign.axisGeometryConvention='unknown';},
  p=>{p.rowPortions[0].terrainDesign.axes[0].axisGeometryConvention='unknown';},
  p=>{p.rowPortions[0].terrainDesign.axes[0].components[0].coordinatesXY[0][0]+=1;},
  p=>{p.rowPortions[0].terrainDesign.axes[0].levelM+=1;},
  p=>{p.rowPortions[0].terrainDesign.axes[0].ordinal+=1;},
  p=>{p.rowPortions[0].terrainDesign.axisScopeGeometry.coordinates[0][0][0]+=.001;},
  p=>{p.terrain.applied.portionResults[0].rows[0].axisOperation.kind='unknown';}
 ]){
  const bad=structuredClone(project);mutate(bad);
  // Rebind the altered nested saved design too, so rejection is semantic.
  bad.terrain.applied.portionResults[0].design=structuredClone(bad.rowPortions[0].terrainDesign);
  rehash(bad);
  assert.equal(readTerrainEnvelope(bad).terrainStatus,'invalid');
 }
 assert.doesNotThrow(()=>JSON.stringify(proposal));
});

test('real holes preserve first exits and endpoint point strata',()=>{
 const f=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]],exclusionsXY:[[[4,4],[8,4],[8,7],[4,7],[4,4]]]});
 const domain=domainFor(f,{type:'Polygon',coordinates:[f.project.geometry,...f.project.exclusions]});
 const y0=2,y1=2+3/Math.sqrt(1.04),axes=[source(domain,[[499980,5000000+y0],[500030,5000000+y0]],y0/5),source(domain,[[499980,5000000+y1],[500030,5000000+y1]],y1/5,1)];
 const r=certifyContourSpacing(domain,axes,{spacingM:3});
 assert.equal(r.valid,true,JSON.stringify(r.unresolved));assert.equal(r.coverage.complete,true);
 assert.ok(r.exceptions.some(e=>e.hole&&e.firstExit));
 assert.ok(r.spans.some(s=>s.stratum==='point'));
 const omitted=certifyContourSpacing(domain,[axes[0],{...axes[1],ordinal:2}],{spacingM:3});
 assert.equal(omitted.valid,false);assert.ok(omitted.critical.some(c=>c.detail==='known-ordinal-gap'));
});

test('complete oblique family retains conservative positive-headland geometry and actual quantities',t=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]],headlandM:.5});
 const base=createTerrainBudget({kind:'adapt'});let nodes=0;
 const budget={...base,check(n=0){nodes+=n;base.check(n);}},start=performance.now(),domain=createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry]},budget});
 const r=buildContourFamily({domain,portion:{id:'p'},reference:{headlandWidthM:.5,originalDomain:domain},spacingM:3,budget});
 assert.equal(r.ok,true,JSON.stringify({status:r.status,message:r.diagnostics.message,candidates:r.diagnostics.candidates.map(c=>({id:c.id,valid:c.valid,unresolved:c.validation?.unresolved?.slice(0,1)}))}));
 assert.equal(r.validation.headlandSubset.valid,true);
 for(const trim of r.validation.headlandSubset.trimRecords)for(const end of trim.removedEnds??[]){assert.ok(end.removedLengthBoundsM[0]>=.5);assert.ok(end.excessBoundsM[1]<=1e-6);}
 assert.ok(r.rows.every(row=>row.axisOperation.kind==='source-parameter-intervals-1'));
 assert.ok(Math.abs(r.metrics.surfaceLengthM-r.rows.reduce((sum,row)=>sum+row.surfaceLengthM,0))<1e-10);
 assert.ok(r.coverage.servedAreaM2<domain.surfaceAreaM2);
 t.diagnostic(JSON.stringify({nodes,elapsedMs:performance.now()-start,timings:budget.timings()}));
});

import {createAlgebraicField} from '../src/terrain-algebraic.js';
import {createBandKernel,traceBandBundles} from '../src/terrain-geodesic-flow.js';
import {axisPieces,coalescePlanePieces} from '../src/terrain-surface-flow.js';
test('B regular boundary tangent point uses an explicit proved-plane opt-in',()=>{
 const f=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f),axis=source(domain,[[499980,5000000.4],[500030,5000000.4]],.08);
 const exact=exactDomain(domain),resolved=resolveSourceAxis(exact,axis,createTerrainBudget({kind:'measure'})),pieces=coalescePlanePieces(resolved.pieces);
 const trace=allow=>{
  const field=createAlgebraicField(),kernel=createBandKernel(exact,field);
  return traceBandBundles(kernel,pieces,{side:-1,policy:'contour-gradient',halfWidth:field.q(1.5),allowPlaneBoundaryTangents:allow});
 };
 const legacy=trace(false),proved=trace(true);
 assert.ok(legacy.unresolved.some(p=>p.stratum==='point'&&p.detail==='boundary-without-interior-entry'));
 assert.deepEqual(proved.unresolved,[]);
 assert.ok(proved.exceptions.some(p=>p.stratum==='point'&&p.firstExit));
 assert.equal(proved.coverage.complete,true);
});

test('a genuine source-cap wedge never gains a new corner contact from construction guards',()=>{
 const f=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,9.8/Math.sqrt(1.04)],[0,9.8/Math.sqrt(1.04)],[0,0]]}),domain=domainFor(f);
 const level=1.843491670085088,axis=source(domain,[[499980,5000000+level*5],[500030,5000000+level*5]],level);
 const r=traceSurfaceBand({domain,axisXY:axis,widthM:3,policy:'contour-normal',areaMode:'constant-plane'});
 assert.equal(r.valid,true,JSON.stringify(r.validation.guardRefinement));
 if(r.valid){
  assert.equal(r.validation.topology.geographicAgrees,true);
  assert.ok(r.validation.capEndpointErrorBoundM<=1e-5);
 }else{
  assert.equal(r.geometry.coordinates.length,0);
  assert.ok(r.validation.unresolved.some(p=>p.detail?.includes('serialization-changed-boundary-contact-topology')));
 }
});

test('positive source headland remainder below 0.05 m is retained; only true consumption removes it',()=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f);
 const axis=source(domain,[[500036,4999990],[499976,5000020]],4);
 const before=measureContourAxes({domain,axes:[axis]}).rows[0];
 const h=(before.surfaceLengthM-.025)/2;
 const small=measureContourAxes({domain,axes:[axis],headlandWidthM:h});
 assert.equal(small.rows.length,1);
 assert.ok(small.rows[0].surfaceLengthBoundsM[0]>0);
 assert.ok(small.rows[0].surfaceLengthBoundsM[1]<.05);
 assert.ok(Math.abs(small.rows[0].surfaceLengthM-.025)<2e-6);
 assert.equal(small.trimRecords[0].consumedByHeadlands,false);
 const consumed=measureContourAxes({domain,axes:[axis],headlandWidthM:before.surfaceLengthBoundsM[1]});
 assert.equal(consumed.rows.length,0);
 assert.equal(consumed.trimRecords[0].consumedByHeadlands,true);
 assert.equal(consumed.trimRecords[0].retainedIntervalEmpty,true);
});

test('actual saved two-gradient carrier normal pitch has an independent native-grid oracle',()=>{
 const f=contourFixture({height:(x,y)=>x/4+y/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f),step=3*Math.sqrt(5/21);
 const axes=[source(domain,[[500036,4999990],[499976,5000020]],4),source(domain,[[500036,4999990+2*step],[499976,5000020+2*step]],4+step,1)];
 const a=axes[1].components[0].coordinatesXY[0],b=axes[1].components[0].coordinatesXY[1],v=[b[0]-a[0],b[1]-a[1]],g=[.25,.5];
 const p=[500006,5000005],delta=[p[0]-a[0],p[1]-a[1]];
 const determinant=(u,w)=>u[0]*w[1]-u[1]*w[0];
 const lambda=-determinant(v,delta)/determinant(v,g);
 const oracle=lambda*Math.hypot(g[0],g[1],g[0]**2+g[1]**2);
 assert.ok(Math.abs(oracle-3)<1e-8);
 const r=certifyContourSpacing(domain,axes,{spacingM:3});
 assert.equal(r.valid,true,JSON.stringify(r.unresolved));
 assert.ok(Math.abs(r.lowerM-oracle)<1e-7&&Math.abs(r.upperM-oracle)<1e-7);
 for(const axis of axes){
  const resolved=resolveSourceAxis(exactDomain(domain),axis,createTerrainBudget({kind:'measure'}));
  const [a,b]=axis.components[0].coordinatesXY.map(p=>p.map(Q));
  for(const piece of resolved.pieces)for(const endpoint of [piece.a,piece.b]){
   assert.equal(sign(orient(a,b,endpoint)),0);
   const [x,y]=xy(endpoint);
   assert.ok(Math.abs((x-500000)/4+(y-5000000)/2-axis.levelM)<=.001);
  }
 }
});

test('B plane tangent opt-in cannot suppress a native nonuniform junction',()=>{
 const f=contourFixture({height:(x,y)=>y<=5?y/5:1+(y-5)/2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]}),domain=domainFor(f),exact=exactDomain(domain);
 const literal={axisId:'junction',levelM:.08,components:[{coordinatesXY:[[500000,5000000.4],[500010,5000000.4]]}]};
 const marked=source(domain,[[499980,5000000.4],[500030,5000000.4]],.08);
 assert.equal(certifyContourElevation(domain,[marked]).valid,false);
 const pieces=axisPieces(exact,literal).pieces;
 const field=createAlgebraicField(),kernel=createBandKernel(exact,field);
 assert.equal(kernel.uniformPlane,false);
 const r=traceBandBundles(kernel,pieces,{side:-1,policy:'contour-gradient',halfWidth:field.q(1.5),allowPlaneBoundaryTangents:true});
 assert.ok(r.unresolved.some(p=>p.stratum==='point'&&p.detail==='boundary-without-interior-entry'));
});

import {fromUTM} from '../src/coordinate-system.js';
import {inRegion,pointKey} from '../src/terrain-exact.js';
function singletonFixture(){
 const f=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[3,0],[3,12],[0,12],[0,0]]});
 const triangle=[[9,4],[8,4.5],[10,4.5],[9,4]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const domain=domainFor(f,{type:'MultiPolygon',coordinates:[[f.project.geometry],[triangle]]});
 const apex=domain.boundaries.find(b=>b.polygonIndex===1).coordinatesXY[0];
 const axis=source(domain,[[499980,apex[1]],[500030,apex[1]]],(apex[1]-5000000)/5);
 return {f,domain,apex,axis};
}
test('isolated actual true-P source contact cannot be omitted from a complete certificate',()=>{
 const {domain,apex,axis}=singletonFixture(),kernel=exactDomain(domain);
 assert.equal(inRegion(apex.map(Q),kernel),0);
 assert.equal(axis.components[0].coordinatesXY[0][1],apex[1]);
 assert.throws(()=>resolveSourceAxis(kernel,axis,createTerrainBudget({kind:'measure'})),/isolated.*source.*contact/i);
 const targetY=apex[1]+3/Math.sqrt(1.04),target=source(domain,[[499980,targetY],[500030,targetY]],(targetY-5000000)/5,1);
 const spacing=certifyContourSpacing(domain,[axis,target],{spacingM:3});
 assert.equal(spacing.valid,false);
 assert.ok(spacing.unresolved.length>0);
 assert.equal(certifyContourElevation(domain,[axis]).valid,false);
 assert.throws(()=>measureContourAxes({domain,axes:[axis]}),/isolated.*source.*contact/i);
 const band=traceSurfaceBand({domain,axisXY:axis,widthM:3,policy:'contour-normal',areaMode:'constant-plane'});
 assert.equal(band.valid,false);
 assert.equal(band.geometry.coordinates.length,0);
});
test('ordinary positive physical source endpoints remain complete',()=>{
 const f=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[3,0],[3,12],[0,12],[0,0]]}),domain=domainFor(f);
 const axis=source(domain,[[499980,5000004],[500030,5000004]],.8);
 const resolved=resolveSourceAxis(exactDomain(domain),axis,createTerrainBudget({kind:'measure'}));
 assert.equal(resolved.completeCarrier,true);
 assert.ok(resolved.pieces.length>0);
 for(const point of [resolved.pieces[0].a,resolved.pieces.at(-1).b])assert.equal(inRegion(point,exactDomain(domain)),0);
 assert.equal(certifyContourElevation(domain,[axis]).valid,true);
 assert.equal(measureContourAxes({domain,axes:[axis]}).rows.length,1);
});
test('retained ground-headland intervals exclude a trimmed-away singleton contact',()=>{
 const {f,domain,apex,axis}=singletonFixture(),original=domainFor(f);
 const bound={...axis,axisGeometryBinding:axisBinding(domain,original)};
 const trimmed=measureContourAxes({domain:original,physicalDomain:domain,axes:[bound],headlandWidthM:.5});
 assert.equal(trimmed.rows.length,1);
 const retained={...bound,axisOperation:{kind:'source-parameter-intervals-1',intervals:trimmed.rows[0].axisOperation.intervals}};
 const resolved=resolveSourceAxis(exactDomain(domain),retained,createTerrainBudget({kind:'measure'}));
 assert.equal(resolved.uncovered.length,0);
 assert.ok(resolved.pieces.length>0);
 assert.ok(resolved.pieces.every(p=>pointKey(p.a)!==pointKey(apex.map(Q))&&pointKey(p.b)!==pointKey(apex.map(Q))));
 assert.equal(certifyContourElevation(domain,[retained]).valid,true);
 assert.deepEqual(measureContourAxes({domain:original,physicalDomain:domain,axes:[retained]}).rows.map(r=>r.surfaceLengthBoundsM),trimmed.rows.map(r=>r.surfaceLengthBoundsM));
 const touching={...retained,axisOperation:{kind:'source-parameter-intervals-1',intervals:[[.58,.7]]}};
 assert.throws(()=>resolveSourceAxis(exactDomain(domain),touching,createTerrainBudget({kind:'measure'})),/isolated.*source.*contact/i);
});
