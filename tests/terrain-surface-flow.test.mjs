import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,ZERO,ONE,key,exactDomain,lengthBounds,nextUp} from '../src/terrain-exact.js';
import {axisPieces,traceNormalBundles,partitionAffineEvents} from '../src/terrain-surface-flow.js';
const square=()=>{
 const v=[[0,0,0],[5,0,1],[0,5,0],[5,5,3]],faces=[[0,1,2],[1,3,2]].map((ids,id)=>({id,vertexIds:ids,vertices:ids.map(i=>v[i]),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort().join(':'))}));
 return {faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,hole:false,coordinatesXY:[[0,0],[5,0],[5,5],[0,5],[0,0]]}]};
};
test('analytic two-face itinerary retains both open cells and the shared event point',()=>{
 const k=exactDomain(square()),source={axisId:'a',levelM:.5,components:[{coordinatesXY:[[2.5,.25],[2.5,2.25]]}]},target={axisId:'b',levelM:.75,components:[{coordinatesXY:[[3.75,0],[3.75,1.25],[1.25,5]]}]},terminal=[];
 const failures=traceNormalBundles({kernel:k,source,target,sourcePieces:axisPieces(k,source).pieces,targetPieces:axisPieces(k,target).pieces,flat:false,terminal:s=>terminal.push(s)});
 assert.deepEqual(failures.unresolved,[]);assert.equal(failures.coverage.complete,true);
 const cells=terminal.filter(s=>!s.point),points=terminal.filter(s=>s.point);
 assert.ok(cells.length>=2);assert.ok(points.some(s=>key(s.lo)==='1/2'));
 assert.deepEqual([...new Map(cells.map(s=>[s.itinerary.join(','),s.itinerary])).values()].sort((a,b)=>a.length-b.length),[[0],[0,1]]);
 for(const s of cells)for(let i=0;i<2;i++){const y=.25+2*Number([s.lo,s.hi][i].n)/Number([s.lo,s.hi][i].d),expected=y<=1.25?1.25*Math.sqrt(1.04):(2.5-y)*Math.sqrt(1.04)+(.2*y-.25)*Math.sqrt(1.52/.52),[lo,hi]=lengthBounds(s.distanceExpressions[i]);assert.ok(lo<=expected+1e-15&&hi>=expected-1e-15);}
});
test('one-ULP event cells are never collapsed',()=>{
 const r=partitionAffineEvents({lo:ZERO,hi:ONE,point:false},[{lambda:[Q(-.5),ONE]},{lambda:[Q(-nextUp(.5)),ONE]}]);
 assert.ok(r.some(s=>!s.point&&key(s.lo)===key(Q(.5))&&key(s.hi)===key(Q(nextUp(.5)))));
 assert.equal(r.filter(s=>s.point).length,2);
});
test('parallel hole-boundary trajectory is localized unresolved',()=>{
 const d=square();d.faces=d.faces.map(f=>({...f,vertices:f.vertices.map(p=>[p[0],p[1],p[0]/5])}));d.boundaries.push({id:'hole',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:[[2,1],[3,1],[3,2],[2,2],[2,1]]});
 const k=exactDomain(d),source={axisId:'a',levelM:.2,components:[{coordinatesXY:[[1,.5],[1,1.5]]}]},target={axisId:'b',levelM:.8,components:[{coordinatesXY:[[4,.5],[4,1.5]]}]},failures=traceNormalBundles({kernel:k,source,target,sourcePieces:axisPieces(k,source).pieces,targetPieces:axisPieces(k,target).pieces,flat:false,terminal:()=>{}});
 assert.ok(failures.unresolved.some(f=>f.detail==='overlapping-boundary-travel'&&f.stratum==='point'));
});

test('seed-cover verification rejects a missing event point or a one-ULP open cell',async()=>{
 const api=await import('../src/terrain-surface-flow.js');assert.equal(typeof api.verifySeedCover,'function');
 const h=Q(.5),j=Q(nextUp(.5)),point=t=>({lo:t,hi:t,point:true}),cell=(lo,hi)=>({lo,hi,point:false}),cover=[point(ZERO),cell(ZERO,h),point(h),cell(h,j),point(j),cell(j,ONE),point(ONE)];
 assert.equal(api.verifySeedCover(cover).complete,true);assert.equal(api.verifySeedCover(cover.filter(s=>!(s.point&&key(s.lo)===key(h)))).complete,false);assert.equal(api.verifySeedCover(cover.filter(s=>s.point||key(s.lo)!==key(h))).complete,false);
});

test('tangent hole apex does not create a boundary exit for the event-point ray',()=>{
 const d=square();d.faces=d.faces.map(f=>({...f,vertices:f.vertices.map(p=>[p[0],p[1],p[0]/5])}));d.boundaries.push({id:'hole',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:[[2.5,1],[2,2],[3,2],[2.5,1]]});
 const k=exactDomain(d),source={axisId:'a',levelM:.2,components:[{coordinatesXY:[[1,.5],[1,1.5]]}]},target={axisId:'b',levelM:.8,components:[{coordinatesXY:[[4,.5],[4,1.5]]}]},terminal=[];
 traceNormalBundles({kernel:k,source,target,sourcePieces:axisPieces(k,source).pieces,targetPieces:axisPieces(k,target).pieces,flat:false,terminal:r=>terminal.push(r)});
 const tangent=terminal.filter(r=>r.point&&key(r.lo)==='1/2');assert.ok(tangent.length);assert.ok(tangent.every(r=>r.kind==='contact'));
});
test('one-ULP-wide real exclusion crossing retains a nonempty seed exception',()=>{
 const d=square();d.faces=d.faces.map(f=>({...f,vertices:f.vertices.map(p=>[p[0],p[1],p[0]/5])}));d.boundaries.push({id:'thin',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:[[2,1],[3,1],[3,nextUp(1)],[2,nextUp(1)],[2,1]]});
 const k=exactDomain(d),source={axisId:'a',levelM:.2,components:[{coordinatesXY:[[1,.5],[1,1.5]]}]},target={axisId:'b',levelM:.8,components:[{coordinatesXY:[[4,.5],[4,1.5]]}]},terminal=[];
 traceNormalBundles({kernel:k,source,target,sourcePieces:axisPieces(k,source).pieces,targetPieces:axisPieces(k,target).pieces,flat:false,terminal:r=>terminal.push(r)});
 assert.ok(terminal.some(r=>r.kind==='exception'&&!r.point&&key(r.lo)==='1/2'&&key(r.hi)==='2251799813685249/4503599627370496'));
});
test('tiny shared budget interrupts event work instead of returning a partial certificate',()=>{
 let checks=0;const budget={check(){if(++checks>8)throw Object.assign(new Error('stop'),{status:'budget-exceeded'});}};
 assert.throws(()=>partitionAffineEvents({lo:ZERO,hi:ONE,point:false},Array.from({length:20},(_,i)=>({lambda:[Q(i/20),ONE]})),budget),{status:'budget-exceeded'});
});

test('an outward ray from a convex boundary corner cannot invent an interior-to-exterior exit',()=>{
 const d=square();d.faces=d.faces.map(f=>({...f,vertices:f.vertices.map(p=>[p[0],p[1],0])}));
 d.boundaries[0].coordinatesXY=[[1,1],[4,1],[4,4],[1,4],[1,1]];
 const k=exactDomain(d),source={axisId:'a',levelM:0,components:[{coordinatesXY:[[1,1],[2,2]]}]},target={axisId:'b',levelM:0,components:[{coordinatesXY:[[1,3],[2,4]]}]};
 const r=traceNormalBundles({kernel:k,source,target,sourcePieces:axisPieces(k,source).pieces,targetPieces:axisPieces(k,target).pieces,flat:true,terminal:()=>{}});
 assert.ok(r.unresolved.some(e=>e.detail==='boundary-without-interior-entry'&&e.stratum==='point'));
});

function creaseFixture(coplanar=false) {
 const vertices=[0,5,10].flatMap(y=>[-5,0,5].map(x=>[x,y,(y-(coplanar||x<0?0:x))/4]));
 const faces=[[0,1,3],[1,4,3],[1,2,4],[2,5,4],[3,4,6],[4,7,6],[4,5,7],[5,8,7]].map((ids,id)=>({
  id,vertexIds:ids,vertices:ids.map(i=>vertices[i]),
  edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':'))
 }));
 const domain={faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,hole:false,
  coordinatesXY:[[-5,0],[5,0],[5,10],[-5,10],[-5,0]]}]};
 const source={axisId:'crease-source',ordinal:0,levelM:.5,
  components:[{coordinatesXY:[[-4,2],[0,2]]}]};
 const target={axisId:'crease-target',ordinal:1,levelM:1.25,
  components:[{coordinatesXY:[[-4,5],[0,5]]}]};
 return {domain,source,target};
}

test('one-way noncoplanar edge-sticking endpoint is unresolved even when the neighboring gradient is filtered out',()=>{
 const {domain,source,target}=creaseFixture(),kernel=exactDomain(domain),terminal=[];
 const result=traceNormalBundles({kernel,source,target,sourcePieces:axisPieces(kernel,source).pieces,
  targetPieces:axisPieces(kernel,target).pieces,flat:false,terminal:record=>terminal.push(record)});
 const atCrease=record=>record.stratum==='point'&&record.xy[0]===0&&record.xy[1]===2;
 assert.ok(result.unresolved.some(record=>atCrease(record)&&record.detail==='no-unique-inward-continuation'));
 assert.equal(terminal.some(record=>atCrease(record)&&record.kind==='contact'),false);
 assert.equal(result.coverage.complete,true);
});

test('one-way tangent travel through a vertex fan retains the proven coplanar direction field',()=>{
 const {domain,source,target}=creaseFixture(true),kernel=exactDomain(domain),terminal=[];
 target.levelM=2;target.components[0].coordinatesXY=[[-4,8],[0,8]];
 const result=traceNormalBundles({kernel,source,target,sourcePieces:axisPieces(kernel,source).pieces,
  targetPieces:axisPieces(kernel,target).pieces,flat:false,terminal:record=>terminal.push(record)});
 assert.deepEqual(result.unresolved,[]);assert.equal(result.coverage.complete,true);
 assert.ok(terminal.some(record=>record.stratum==='point'&&record.seedXY[1][0]===0&&key(record.lo)==='1/1'&&record.kind==='contact'&&record.hitXY[0][0]===0&&record.hitXY[0][1]===8));
});
