import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js?v=1.3.10';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.10';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.10';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.10';
import {traceFinitePolylineContourLevel,resolveFinitePolylineSourceAxis,POLYLINE_SOURCE_PARAMETER_OPERATION} from '../src/terrain-polyline-source.js?v=1.3.10';
import {exactDomain,Q,rational} from '../src/terrain-exact.js?v=1.3.10';

let api;
const moduleURL=new URL('../src/terrain-native-approach.js',import.meta.url);
try{api=await import(moduleURL.href);}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND'||new URL(error.url).pathname!==moduleURL.pathname)throw error;api={};}
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const polygon=(outer,holes=[])=>({type:'Polygon',coordinates:[outer,...holes].map(geographic)});
const rect=(loX,loY,hiX,hiY)=>[[loX,loY],[hiX,loY],[hiX,hiY],[loX,hiY],[loX,loY]];
function fixture({height=(x,y)=>.75*y,geometry=polygon(rect(8,1,22,7))}={}){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,i)=>height(-40+(i%3)*40,40-Math.floor(i/3)*40))}});
 const budget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry,budget});
 return {model,domain,budget};
}
function source({domain,budget},levelM,{ordinal=0,portionId='p'}={}){
 const result=traceFinitePolylineContourLevel(domain,levelM,{portionId,ordinal,budget});
 assert.deepEqual(result.diagnostics,[],'fixture has actual native contour support');
 assert.equal(result.axes.length,1);
 return result.axes[0];
}
function certify(f,axes,minimumM=2.3,options={}){
 assert.equal(typeof api.certifyNativeRetainedApproach,'function','exact retained native minimum approach API');
 return api.certifyNativeRetainedApproach(f.domain,axes,{minimumM,budget:f.budget,...options});
}

test('a real native 2.5 metre plane row pair proves the 2.3 metre lower bound',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,3,{ordinal:1})],result=certify(f,axes);
 assert.equal(result.valid,true,JSON.stringify(result));
 assert.deepEqual(result.critical,[]);assert.deepEqual(result.unresolved,[]);
 assert.ok(result.lowerM>=2.3&&result.lowerM<=2.50000001);
});

test('a real native shared triangle connector proves an actual continuous too-close path',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,2.25,{ordinal:1})],result=certify(f,axes);
 assert.equal(result.valid,false);assert.equal(result.unresolved.length,0);
 assert.ok(result.critical.length>0);
 for(const failure of result.critical){
  assert.equal(failure.reason,'too-close');assert.equal(failure.proof,'continuous-surface-path');
  assert.equal(failure.sourceFaceId,failure.targetFaceId);assert.ok(failure.distanceM[1]<2.3);
  assert.ok(axes.some(axis=>axis.axisId===failure.axisId));assert.ok(axes.some(axis=>axis.axisId===failure.targetAxisId));
  assert.equal(failure.xy.length,2);assert.equal(failure.targetXY.length,2);
 }
});

test('nonadjacent family entries cannot hide an approaching row pair',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,4.5,{ordinal:1}),source(f,2.25,{ordinal:2})],result=certify(f,axes);
 assert.equal(result.valid,false);
 assert.ok(result.critical.some(item=>new Set([item.axisId,item.targetAxisId]).has(axes[0].axisId)&&new Set([item.axisId,item.targetAxisId]).has(axes[2].axisId)));
});

test('pieces belonging to one native axis are excluded from inter-row approach',()=>{
 const f=fixture({height:(x,y)=>(x<0?.05:.4)*x+.2*y,geometry:polygon(rect(-15,-10,15,10))}),axis=source(f,1.5),result=certify(f,[axis]);
 assert.equal(result.valid,true);assert.deepEqual(result.critical,[]);assert.deepEqual(result.unresolved,[]);
});

test('mixed portion sources fail closed instead of trusting submitted identity to waive proximity',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,2.25,{ordinal:1,portionId:'other'})],result=certify(f,axes);
 assert.equal(result.valid,false);assert.ok(result.unresolved.some(item=>item.detail==='mixed-portion-family'));
});

test('a short XYZ chord across different native faces stays unresolved',()=>{
 const f=fixture({height:x=>x<0?.05*x:4*x,geometry:polygon(rect(-10,1,10,15))}),axes=[source(f,-.05),source(f,.4,{ordinal:1})],result=certify(f,axes);
 assert.equal(result.valid,false);assert.deepEqual(result.critical,[]);
 assert.ok(result.unresolved.some(item=>item.detail==='minimum-approach-lower-inconclusive'&&item.sourceFaceId!==item.targetFaceId&&item.chordLowerM<2.3));
});

test('caller retained source intervals remove a close headland-only approach',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,2.25,{ordinal:1})];
 assert.equal(certify(f,axes).valid,false);
 const retained=axes.map((axis,index)=>{
  const resolved=resolveFinitePolylineSourceAxis(exactDomain(f.domain,f.budget),axis,f.budget);
  assert.equal(resolved.pieces.length,1);
  const piece=resolved.pieces[0],lo=Number(piece.lo.n)/Number(piece.lo.d),hi=Number(piece.hi.n)/Number(piece.hi.d),span=hi-lo;
  return {...axis,axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[{componentIndex:piece.componentIndex,segmentIndex:piece.segmentIndex,lo:lo+span*(index?.8:.05),hi:lo+span*(index?.95:.2)}]}};
 });
 assert.equal(certify(f,retained).valid,true);
});

test('sorted X pruning keeps close retained endpoint pairs under input permutations',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,2.25,{ordinal:1})];
 const retained=axes.map((axis,index)=>{
  const piece=resolveFinitePolylineSourceAxis(exactDomain(f.domain,f.budget),axis,f.budget).pieces[0],lo=Number(piece.lo.n)/Number(piece.lo.d),hi=Number(piece.hi.n)/Number(piece.hi.d);
  return {...axis,axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[{componentIndex:piece.componentIndex,segmentIndex:piece.segmentIndex,lo:lo+(hi-lo)*(.4+index*.1),hi:lo+(hi-lo)*(.45+index*.1)}]}};
 });
 for(const order of [retained,[...retained].reverse()]){
  const result=certify(f,order);assert.equal(result.valid,false);assert.ok(result.critical.length>0);
  for(const failure of result.critical){assert.ok(Math.abs(failure.xy[0]-failure.targetXY[0])>.5);assert.ok(failure.distanceM[1]<2.3);}
 }
});

test('forged finite geometry and copied owner identity preserve native fail-closed errors',()=>{
 const f=fixture(),axis=source(f,1.5),forged=structuredClone(axis);
 forged.components[0].coordinatesXY[0][0]+=1;
 assert.throws(()=>certify(f,[forged]),{status:'axis-geometry-unresolved'});
 assert.throws(()=>certify({...f,domain:Object.freeze({...f.domain})},[axis]),{status:'domain-support-unresolved'});
 const unsupported=structuredClone(axis);delete unsupported.axisGeometryConvention;
 const result=certify(f,[unsupported]);assert.equal(result.valid,false);assert.ok(result.unresolved.length>0);
});

test('duplicate axis identities cannot suppress a retained family comparison',()=>{
 const f=fixture(),axis=source(f,1.5),result=certify(f,[axis,axis]);
 assert.equal(result.valid,false);assert.ok(result.unresolved.some(item=>item.detail==='duplicate-axis-identity'));
});

test('a same-native-face connector crossing a physical hole remains unresolved',()=>{
 const f=fixture({geometry:polygon(rect(7,1,23,7),[rect(8,2.4,22,2.6)])}),axes=[source(f,1.5),source(f,2.25,{ordinal:1})];
 const retained=axes.map(axis=>{
  const piece=resolveFinitePolylineSourceAxis(exactDomain(f.domain,f.budget),axis,f.budget).pieces[0],lo=Number(piece.lo.n)/Number(piece.lo.d),hi=Number(piece.hi.n)/Number(piece.hi.d);
  return {...axis,axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[{componentIndex:piece.componentIndex,segmentIndex:piece.segmentIndex,lo:lo+(hi-lo)*.3,hi:lo+(hi-lo)*.7}]}};
 });
 const result=certify(f,retained);
 assert.equal(result.valid,false);assert.deepEqual(result.critical,[]);
 assert.ok(result.unresolved.some(item=>item.sourceFaceId===item.targetFaceId&&item.detail==='minimum-approach-lower-inconclusive'));
});

test('same-face connector proof respects the actual original scope as well as current scope',()=>{
 const original=fixture({geometry:polygon(rect(7,1,23,7),[rect(8,2.4,22,2.6)])}),domain=createContourDomain({model:original.model,geometry:polygon(rect(7,1,23,7)),budget:original.budget});
 const axes=[1.5,2.25].map((levelM,ordinal)=>traceFinitePolylineContourLevel(domain,levelM,{portionId:'p',ordinal,originalDomain:original.domain,budget:original.budget}).axes[0]);
 const retained=axes.map(axis=>{
  const piece=resolveFinitePolylineSourceAxis(exactDomain(domain,original.budget),axis,original.budget,{originalDomain:original.domain}).pieces[0],lo=Number(piece.lo.n)/Number(piece.lo.d),hi=Number(piece.hi.n)/Number(piece.hi.d);
  return {...axis,axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[{componentIndex:piece.componentIndex,segmentIndex:piece.segmentIndex,lo:lo+(hi-lo)*.3,hi:lo+(hi-lo)*.7}]}};
 });
 const result=certify({...original,domain},retained,2.3,{originalDomain:original.domain});
 assert.equal(result.valid,false);assert.deepEqual(result.critical,[]);assert.ok(result.unresolved.length>0);
});

test('exact rational minimum applies without rounding it through binary64',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,3,{ordinal:1})];
 assert.equal(certify(f,axes,3,{minimumExact:Q(2.3)}).valid,true);
 const result=certify(f,axes,2.3,{minimumExact:rational(3n)});
 assert.equal(result.valid,false);assert.ok(result.critical.length>0);
 const inherited=Object.assign(Object.create({n:1n,d:1n}),{other:1,fields:2});
 for(const minimumExact of [{n:1,d:1},{n:1n,d:0n},{n:0n,d:1n},{n:-1n,d:1n},{n:1n,d:1n,forged:true},inherited]){
  const invalid=certify(f,axes,2.3,{minimumExact});assert.equal(invalid.valid,false);assert.ok(invalid.unresolved.length>0);
 }
});

test('native approach keeps the caller cumulative work and deadline budget',()=>{
 const f=fixture(),axes=[source(f,1.5),source(f,3,{ordinal:1})];
 assert.throws(()=>certify(f,axes,2.3,{budget:createTerrainBudget({kind:'adapt',deadlineMs:0})}),{status:'budget-exceeded'});
 assert.throws(()=>certify(f,axes,2.3,{budget:createTerrainBudget({kind:'adapt',initialNodeCount:499999})}),{status:'budget-exceeded'});
});

test('one proved violation suffices without building an unbounded invalid-pair report',()=>{
 const f=fixture({geometry:polygon(rect(5,-15,25,15))});
 const axes=[-7.5,-6.75,-6,-5.25].map((levelM,ordinal)=>source(f,levelM,{ordinal}));
 const result=certify(f,axes);
 assert.equal(result.valid,false);
 assert.equal(result.critical.length,1);
});
