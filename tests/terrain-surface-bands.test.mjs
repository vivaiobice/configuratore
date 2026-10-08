import test from 'node:test';
import assert from 'node:assert/strict';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {toUTM,fromUTM} from '../src/coordinate-system.js';
import * as api from '../src/terrain-surface-flow.js';
import {compareMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.1';
const make=(height=()=>0)=>{const f=contourFixture({height});return createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry]}});};
const band=opts=>{assert.equal(typeof api.traceSurfaceBand,'function');return api.traceSurfaceBand(opts);};
// Restored original stage-B cases: changing the metric or inventing a corner join fails these.
test('oblique plane passage uses metric normal and full surface width',()=>{
 const r=band({domain:make((x,y)=>x*.2+y*.3),axisXY:[[500005,5000005],[500015,5000015]],widthM:1.5});
 assert.equal(r.valid,true,JSON.stringify(r));assert.ok(Math.abs(r.areaM2-22.5)<1e-5);assert.equal(r.validation.widthM,1.5);assert.equal(r.validation.widthConvention,'full');assert.ok(r.validation.serializedWidthM[0]<=1.5&&r.validation.serializedWidthM[1]>=1.5);
 assert.equal(compareMeasuredSurfaceAreas(r,r),0);
});
test('corner band remains localized unresolved',()=>{
 const r=band({domain:make(),axisXY:[[500005,5000005],[500010,5000010],[500005,5000015]],widthM:1.5});
 assert.equal(r.valid,false);assert.ok(r.validation.unresolved.some(x=>x.reason==='ambiguous-corner'));
});
function directDomain({slope=.75,crease=true,region=[[-4,-5],[4,-5],[4,5],[-4,5],[-4,-5]]}={}) {
 const ox=500000,oy=5000000,vertices=[-5,0,5].flatMap(y=>[-5,0,5].map(x=>[ox+x,oy+y,crease&&x>0?slope*x:0]));
 const faces=[[0,1,3],[1,4,3],[1,2,4],[2,5,4],[3,4,6],[4,7,6],[4,5,7],[5,8,7]].map((ids,id)=>({id,vertexIds:ids,vertices:ids.map(i=>vertices[i]),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':'))}));
 return {crs:'EPSG:32632',faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,hole:false,coordinatesXY:region.map(([x,y])=>[ox+x,oy+y])}]};
}
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const ceiling=(r,w)=>{
 assert.equal(r.validation.coverage.complete,true);
 for(const h of r.validation.serializedHalfWidthsM)assert.ok(h[0]>=w/2-1e-5&&h[1]<=w/2+1e-5,JSON.stringify(h));
 assert.ok(r.validation.serializedWidthM[0]>=w-1e-5&&r.validation.serializedWidthM[1]<=w+1e-5);
 assert.equal(JSON.stringify(r).includes('exactInterval'),false);
};
// Independent ray/polygon intersection on the submitted, round-tripped coordinates.
// The expected metric unit normal is (-1.15,1.10)/(1.5*sqrt(1.13)).
function rayDistance(r,p,n) {
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],hits=[];
 for(const polygon of r.geometry.coordinates)for(const ring of polygon)for(let i=1;i<ring.length;i++){
  const a=toUTM(ring[i-1]),b=toUTM(ring[i]),e=[b[0]-a[0],b[1]-a[1]],d=[a[0]-p[0],a[1]-p[1]],den=cross(n,e);
  if(!den)continue;const t=cross(d,e)/den,u=cross(d,n)/den;if(t>=0&&u>=0&&u<=1)hits.push(t);
 }
 return Math.min(...hits);
}
test('serialized oblique polygon retains both half widths over the entire certified partition',()=>{
 const r=band({domain:make((x,y)=>x*.2+y*.3),axisXY:[[500005,5000005],[500015,5000015]],widthM:1.5});
 assert.equal(r.valid,true,JSON.stringify(r));ceiling(r,1.5);
 const n=[-1.15/(1.5*Math.sqrt(1.13)),1.10/(1.5*Math.sqrt(1.13))];
 // These analytic witness checks supplement, never replace, the full partition certificate.
 for(const t of [0,.123,.5,.987,1])for(const s of [-1,1])close(rayDistance(r,[500005+10*t,5000005+10*t],n.map(v=>v*s)),.75,1e-5);
 assert.ok(r.validation.spans.every(s=>s.interval&&s.itinerary&&s.serializedDistanceM));
});
test('regular noncoplanar arbitrary-axis strip follows the analytic unfolded normal',()=>{
 const axisXY=[[499999.75,4999999],[499999.25,5000001]],widthM=2;
 const r=band({domain:directDomain(),axisXY,widthM});
 assert.equal(r.valid,true,JSON.stringify(r));ceiling(r,widthM);
 // Unfolded chart is (x,y) left and (5*x/4,y) right. Axis length sqrt(17)/2.
 close(r.areaM2,Math.sqrt(17),2e-6);
 assert.equal(r.validation.directionPolicy,'metric-normal-geodesic');
 assert.ok(r.validation.spans.some(s=>new Set(s.itinerary).size>1));
 const vertices=r.geometry.coordinates.flat(2).map(p=>toUTM(p));
 // At first endpoint, east-going unit normal (4,1)/sqrt(17) reaches right face.
 const boundary=vertices.filter(p=>p[0]>500000.01).map(p=>[(p[0]-500000)*1.25,p[1]-5000000]);
 assert.ok(boundary.length>=2);
 for(const p of boundary)close((4*p[0]+p[1]+2)/Math.sqrt(17),1,3e-6);
});
test('irrational sqrt5 edge transport retains a regular uniquely unfolded strip',()=>{
 const r=band({domain:directDomain({slope:2}),axisXY:[[499999.75,4999999],[499999.25,5000001]],widthM:2});
 assert.equal(r.valid,true,JSON.stringify(r));ceiling(r,2);close(r.areaM2,Math.sqrt(17),2e-6);
});
test('original source axis outside the real region is clipped before any launch',()=>{
 const axisXY=[[499980,4999999],[500020,5000001]],r=band({domain:directDomain({crease:false}),axisXY,widthM:1});
 assert.deepEqual(r.sourceAxis,axisXY);assert.ok(r.validation.clippedSeedCount>0);
 assert.equal(r.validation.unresolved.some(s=>s.reason==='uncovered-source'),false);
 assert.equal(r.valid,true,JSON.stringify(r));ceiling(r,1);
 assert.ok(r.validation.exceptions.length>0);
});
test('contour service chooses the gradient field and diagnoses a zero-gradient continuation',()=>{
 const domain=directDomain();
 const r=band({domain,policy:'contour-normal',axisXY:{axisId:'service',levelM:.1875,components:[{coordinatesXY:[[500000.25,4999999],[500000.25,5000001]]}]},widthM:2});
 assert.equal(r.validation.directionPolicy,'contour-gradient');assert.equal(r.valid,false);
 assert.ok(r.validation.unresolved.some(s=>s.reason==='ambiguous-flow'&&s.xy));
});
test('shared node budget also charges cached facets and serialized geometry',()=>{
 const domain=directDomain({crease:false});let nodes=0;const budget={check(n=0){nodes+=n;if(nodes>15)throw Object.assign(new Error('stop'),{status:'budget-exceeded'});},phase(){}};
 assert.throws(()=>band({domain,axisXY:[[499999,4999999],[500000,5000001]],widthM:1,budget}),{status:'budget-exceeded'});
 assert.ok(nodes>15);
});

test('a positive real gap smaller than the cap guard never becomes a boundary contact',()=>{
 const domain=directDomain({crease:false}),axisXY=[[500000,4999999],[500000,5000005-2**-25]];
 const r=band({domain,axisXY,widthM:1});
 assert.equal(r.valid,false);assert.ok(r.validation.unresolved.some(s=>s.reason==='cap-topology'));
 assert.equal(r.geometry.coordinates.length,0);
});

function diagonalProfile() {
 const grid=[],F=r=>r<=0?r/4:r<=5?r/1024:(r-5)/4+5/1024;
 for(let y=-10;y<=10;y+=5)for(let x=-10;x<=10;x+=5)grid.push([500000+x,5000000+y,(y-x)/8+F(x+y)]);
 const faces=[];for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  const a=row*5+col;for(const ids of [[a,a+1,a+5],[a+1,a+6,a+5]])faces.push({id:faces.length,vertexIds:ids,vertices:ids.map(i=>grid[i]),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':'))});
 }
 return {crs:'EPSG:32632',faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,coordinatesXY:[[499991,4999991],[500009,4999991],[500009,5000009],[499991,5000009],[499991,4999991]]}]};
}
test('diagonal three-plane profile transports arbitrary normals across both irrational creases',()=>{
 const domain=diagonalProfile(),axisXY=[[500003.25,4999999.25],[499999.25,5000003.25]],r=band({domain,axisXY,widthM:4});
 assert.equal(r.valid,true,JSON.stringify({unresolved:r.validation.unresolved,half:r.validation.serializedHalfWidthsM}));ceiling(r,4);
 // r=2.5, tangent (-4,4), dz=1, so the ground axis length is sqrt(33).
 close(r.areaM2,4*Math.sqrt(33),4e-6);
 assert.ok(r.validation.spans.filter(s=>s.itinerary.length>=2).length>0);
});

test('a passage launched on a two-plane source crease uses the unique opposite face normals',()=>{
 const domain=directDomain({slope:2}),axisXY=[[500000,4999999],[500000,5000001]],r=band({domain,axisXY,widthM:1.5});
 assert.equal(r.valid,true,JSON.stringify({unresolved:r.validation.unresolved,half:r.validation.serializedHalfWidthsM}));ceiling(r,1.5);
 close(r.areaM2,3,2e-6);
 const xs=r.geometry.coordinates.flat(2).map(p=>toUTM(p)[0]-500000);
 close(Math.min(...xs),-.75,2e-7);close(Math.max(...xs),.75/Math.sqrt(5),2e-7);
});

test('explicit contour policy binds and checks the complete native level axis',()=>{
 const domain=make((x,y)=>y*.2),axis={axisId:'row',levelM:2,ordinal:0,components:[{coordinatesXY:[[500005,5000010],[500015,5000010]]}]};
 const r=band({domain,axisXY:axis,policy:'contour-normal',widthM:3});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));assert.equal(r.validation.directionPolicy,'contour-gradient');ceiling(r,3);close(r.areaM2,30,3e-6);
 const hostile=structuredClone(axis);hostile.components[0].coordinatesXY[1][1]+=1;
 const bad=band({domain,axisXY:hostile,policy:'contour-normal',widthM:3});
 assert.equal(bad.valid,false);assert.ok(bad.validation.unresolved.some(x=>x.reason==='uncertified-contour-axis'));
 const unknown=band({domain,axisXY:[[500005,5000010],[500015,5000010]],policy:'guess',widthM:3});
 assert.equal(unknown.valid,false);assert.ok(unknown.validation.unresolved.some(x=>x.reason==='unknown-band-policy'));
});

test('a serialized hole-shadow discontinuity is localized and never accepted from probes',()=>{
 const fixture=contourFixture(),outer=fixture.project.geometry;
 const hole=[[500009.5,5000009],[500010.5,5000009.4],[500010.5,5000011.4],[500009.5,5000011],[500009.5,5000009]].map(p=>fromUTM(p));
 const domain=createContourDomain({model:fixture.model,geometry:{type:'Polygon',coordinates:[outer,hole]}}),r=band({domain,axisXY:[[500010,5000005],[500010,5000015]],widthM:3});
 assert.equal(r.valid,false);assert.ok(r.validation.unresolved.some(s=>s.reason==='serialized-width'));
 assert.equal(r.geometry.coordinates.length,0);
});

test('regular hole-edge clipping preserves the hole and excludes its surface area',()=>{
 const fixture=contourFixture(),hole=[[500009.5,5000004],[500010.5,5000004],[500010.5,5000008],[500009.5,5000008],[500009.5,5000004]].map(p=>fromUTM(p));
 const domain=createContourDomain({model:fixture.model,geometry:{type:'Polygon',coordinates:[fixture.project.geometry,hole]}});
 const r=band({domain,axisXY:[[500009,5000005],[500009,5000007]],widthM:3});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));assert.equal(r.scopeGeometry.coordinates.length,2);
 assert.equal(r.validation.serializedHalfWidthsM[0],null);close(r.validation.serializedHalfWidthsM[1][0],1.5,1e-5);
 close(r.areaM2,4,1e-5);assert.ok(r.validation.exceptions.some(e=>e.hole));assert.equal(r.validation.topology.geographicAgrees,true);
 close(r.perFace.reduce((s,p)=>s+p.areaM2,0),r.areaM2,1e-8);
});

test('a projected split with an actual geographic bridge is nonapplicable',()=>{
 const r=band({domain:make(),axisXY:[[500020,4999990],[500020,5000050]],widthM:1.5});
 assert.equal(r.valid,false);assert.ok(r.validation.unresolved.some(e=>e.detail?.startsWith('projection-readiness:')),JSON.stringify(r.validation.unresolved));
 assert.equal(r.geometry.coordinates.length,0);
});

test('a 100 metre uniform-plane service row retains continuous width and analytic ground area',async()=>{
 const {createTerrainModel}=await import('../src/terrain-model.js');
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:25,height:9,origin:[499990,5000030],step:[5,-5],values:Array.from({length:225},(_,i)=>(30-Math.floor(i/25)*5)/5)}});
 const ring=[[499995,4999995],[500105,4999995],[500105,5000025],[499995,5000025],[499995,4999995]].map(p=>fromUTM(p));
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring]}}),axis={axisId:'long',levelM:2,ordinal:0,components:[{coordinatesXY:[[500000,5000010],[500100,5000010]]}]};
 const before=JSON.stringify(model),r=band({domain,axisXY:axis,policy:'contour-normal',widthM:3});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));ceiling(r,3);close(r.areaM2,300,1e-5);assert.equal(JSON.stringify(model),before);
 assert.ok(r.perFace.length>20);
});

test('a wholly clipped strip has complete real-exit proofs without invented full-width numbers',()=>{
 const region=[[-.2,-4],[.2,-4],[.2,4],[-.2,4],[-.2,-4]],domain=directDomain({crease:false,region}),r=band({domain,axisXY:[[500000,4999999],[500000,5000001]],widthM:2});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));assert.equal(r.validation.coverage.complete,true);
 assert.deepEqual(r.validation.serializedHalfWidthsM,[null,null]);assert.equal(r.validation.serializedWidthM,null);
 assert.ok(r.validation.spans.every(s=>s.kind==='boundary'&&s.firstExit));close(r.areaM2,.8,2e-6);
});


test('verified all-flat contour service uses the manual metric normal',()=>{
 const axis={axisId:'flat-row',levelM:0,ordinal:0,components:[{coordinatesXY:[[500005,5000010],[500015,5000010]]}]};
 const r=band({domain:make(),axisXY:axis,policy:'contour-normal',widthM:3});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));ceiling(r,3);close(r.areaM2,30,3e-6);assert.equal(r.validation.directionPolicy,'flat-manual-normal');
});

test('a native-boundary tie classifies the transported outgoing ray before granting an exit',async()=>{
 const {exactDomain}=await import('../src/terrain-exact.js'),{axisPieces}=await import('../src/terrain-surface-flow.js'),{createAlgebraicField}=await import('../src/terrain-algebraic.js'),{createBandKernel,traceBandBundles}=await import('../src/terrain-geodesic-flow.js');
 const domain=directDomain({slope:2,region:[[-4,-1.6],[4,1.6],[4,5],[-4,5],[-4,-1.6]]}),exact=exactDomain(domain),field=createAlgebraicField(),kernel=createBandKernel(exact,field);
 const axis={axisId:'tie',components:[{coordinatesXY:[[499999.4375,5000000.125],[499999.5625,4999999.625]]}]};
 const r=traceBandBundles(kernel,axisPieces(exact,axis).pieces,{side:1,policy:'metric-normal-geodesic',halfWidth:field.q(1)});
 // At (0,0), incoming slope 1/4 exits y>=.4*x. Unfolding changes it
 // to sqrt(5)/4>.4, so the unique outgoing ray stays inside.
 // An adjacent open cell may have this point as its excluded limit. Only
 // its separately classified point stratum decides the actual tied ray.
 assert.equal(r.exceptions.some(s=>s.stratum==='point'&&s.hitXY.some(p=>p[0]===500000&&p[1]===5000000)),false);
 assert.ok(r.spans.some(s=>s.stratum==='point'&&s.xy[0]===500000&&s.xy[1]===5000000&&s.kind==='width'));
});

test('the numeric width ceiling rejects an outward-rounded threshold beyond the exact sum',async()=>{
 const api=await import('../src/terrain-surface-bands.js');assert.equal(typeof api.widthBoundsWithin,'function');
 // Binary64 1.00001 lies strictly above the exact sum of binary64 1 and
 // binary64 0.00001. Comparing to the rounded addition would falsely pass.
 assert.equal(api.widthBoundsWithin([1,1.00001],1),false);
 assert.equal(api.widthBoundsWithin([.999999,1.000001],1),true);
 assert.equal(api.widthBoundsWithin([1.000001,1],1),false);
});

test('band rational frame is retained once per budget with independent algebraic fields',async()=>{
 const {Q,exactDomain}=await import('../src/terrain-exact.js'),{createAlgebraicField}=await import('../src/terrain-algebraic.js'),{createBandKernel}=await import('../src/terrain-geodesic-flow.js');
 const exact=exactDomain(directDomain()),counter=()=>({nodes:0,check(n=0){this.nodes+=n;}}),first=counter(),second=counter();
 const a=createBandKernel(exact,createAlgebraicField(),first);const cold=first.nodes;
 const b=createBandKernel(exact,createAlgebraicField(),first);
 assert.equal(first.nodes,cold);assert.ok(cold>0);
 assert.equal(a.faces,b.faces);assert.equal(a.boundaries,b.boundaries);
 a.F.sqrt(2);b.F.sqrt(3);
 for(const face of a.faces)for(const p of [...face.vertices,face.g])for(const value of p){
  assert.ok([...value.keys()].every(mask=>mask===0));
  assert.equal(typeof value.set,'undefined');
  assert.deepEqual(a.F.bounds(value),b.F.bounds(value));
 }
 const k=createBandKernel(exact,createAlgebraicField(),second);assert.equal(second.nodes,cold);
 const tangent=[Q(0),Q(1)],direction=k.unitNormal(k.faces[0],tangent,1,'metric-normal-geodesic'),after=second.nodes;
 assert.equal(k.unitNormal(k.faces[0],tangent,1,'metric-normal-geodesic'),direction);assert.equal(second.nodes,after);
});

test('compact plane measures the actual scoped footprint and conservatively falls back off plane',()=>{
 const domain=directDomain({crease:false}),axisXY=[[499999,4999999],[500001,4999999]],opts={domain,axisXY,widthM:1.5};
 const full=band(opts),compact=band({...opts,areaMode:'constant-plane'});
 assert.equal(compact.valid,true,JSON.stringify(compact.validation.unresolved));
 assert.equal(compact.actualGeometry.representation,'constant-plane');
 assert.equal(compact.perFace,undefined);
 assert.deepEqual(compact.geometry,full.geometry);
 close(compact.areaM2,full.areaM2,1e-10);
 assert.ok(compact.actualGeometry.support.complete);
 const bent=band({domain:directDomain(),axisXY:[[499999.75,4999999],[499999.25,5000001]],widthM:2,areaMode:'constant-plane'});
 assert.equal(bent.valid,true,JSON.stringify(bent.validation.unresolved));
 assert.equal(bent.actualGeometry.representation,'per-face');
 assert.ok(bent.perFace.length>1);
});

test('independent area bounds integrate nine metric roots, holes and face order without a field cap',async()=>{
 const areaApi=await import('../src/terrain-surface-bands.js');
 assert.equal(typeof areaApi.measureSurfaceFootprint,'function');
 const slopes=[1,2,4,6,10,14,16,20,24],vertices=[];let z=0;
 for(let x=0;x<=9;x++){vertices.push([500000+x,5000000,z],[500000+x,5000002,z]);z+=slopes[x]??0;}
 const faces=[];for(let x=0;x<9;x++)for(const ids of [[2*x,2*x+2,2*x+1],[2*x+2,2*x+3,2*x+1]])faces.push({id:faces.length,vertexIds:ids,vertices:ids.map(i=>vertices[i]),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':'))});
 const ring=[[500000,5000000],[500009,5000000],[500009,5000002],[500000,5000002],[500000,5000000]];
 const hole=[[500001,5000000.25],[500002,5000000.25],[500002,5000000.75],[500001,5000000.75],[500001,5000000.25]];
 const domain={crs:'EPSG:32632',faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,coordinatesXY:ring},{id:'hole',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:hole}]};
 const geometryXY={type:'MultiPolygon',coordinates:[[ring,hole]]};
 const r=areaApi.measureSurfaceFootprint({domain,geometryXY}),reverse=areaApi.measureSurfaceFootprint({domain:{...domain,faces:[...faces].reverse()},geometryXY});
 const expected=2*(Math.sqrt(2)+Math.sqrt(5)+Math.sqrt(17)+Math.sqrt(37)+Math.sqrt(101)+Math.sqrt(197)+Math.sqrt(257)+Math.sqrt(401)+Math.sqrt(577))-.5*Math.sqrt(5);
 close(r.areaM2,expected,1e-12);
 assert.ok(r.areaBoundsM2[0]<=expected+1e-13&&r.areaBoundsM2[1]>=expected-1e-13);
 assert.deepEqual(r.areaBoundsM2,reverse.areaBoundsM2);
 assert.equal(r.perFace.length,18);
 const compact=areaApi.measureSurfaceFootprint({domain,geometryXY,areaMode:'coplanar-patches'});
 const compactReverse=areaApi.measureSurfaceFootprint({domain:{...domain,faces:[...faces].reverse()},geometryXY,areaMode:'coplanar-patches'});
 assert.equal(compact.actualGeometry.representation,'coplanar-patches');
 assert.equal(compact.actualGeometry.patches.length,9);
 assert.deepEqual(compact.areaBoundsM2,r.areaBoundsM2);
 assert.deepEqual(compactReverse.areaBoundsM2,r.areaBoundsM2);
});

test('surface union removes overlap and clips a hole before ground integration',async()=>{
 const {measureSurfaceUnion}=await import('../src/terrain-surface-bands.js');
 assert.equal(typeof measureSurfaceUnion,'function');
 const domain=directDomain({crease:false});
 domain.boundaries.push({id:'hole',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:[[499999.5,4999999.5],[500000.5,4999999.5],[500000.5,5000000.5],[499999.5,5000000.5],[499999.5,4999999.5]]});
 const rectangle=(x0,x1)=>({type:'MultiPolygon',coordinates:[[[[x0,4999999],[x1,4999999],[x1,5000001],[x0,5000001],[x0,4999999]]]]});
 const r=measureSurfaceUnion({domain,geometriesXY:[rectangle(499998,500000.5),rectangle(499999.5,500002)],areaMode:'constant-plane'});
 close(r.areaM2,7,1e-12);
 assert.equal(r.actualGeometry.geometryConvention,'union-of-domain-intersections');
});

test('opt-in coplanar patches integrate the actual two-plane union with native membership',async()=>{
 const {measureSurfaceUnion}=await import('../src/terrain-surface-bands.js');
 const domain=directDomain(),geometriesXY=[{type:'MultiPolygon',coordinates:[[[[499998,4999999],[500002,4999999],[500002,5000001],[499998,5000001],[499998,4999999]]]]}];
 const base=measureSurfaceUnion({domain,geometriesXY});
 const compact=measureSurfaceUnion({domain,geometriesXY,areaMode:'coplanar-patches'});
 assert.equal(compact.actualGeometry.representation,'coplanar-patches');
 close(compact.areaM2,9,1e-10);close(compact.areaM2,base.areaM2,1e-10);
 assert.equal(compact.actualGeometry.patches.length,2);
 assert.ok(compact.actualGeometry.patches.every(p=>p.nativeFaceIds.length===4));
 const r=band({domain,axisXY:[[499999.75,4999999],[499999.25,5000001]],widthM:2,areaMode:'coplanar-patches'});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));ceiling(r,2);
 assert.equal(r.actualGeometry.representation,'coplanar-patches');close(r.areaM2,Math.sqrt(17),2e-6);
 assert.ok(r.validation.spans.some(s=>s.patchItinerary?.length===2));
 assert.ok(r.validation.seedMapping.every(s=>s.sourceIntervals.length));
});


test('patch connectivity distinguishes edge, point-only and disconnected native support',async()=>{
 const {exactDomain}=await import('../src/terrain-exact.js'),{createAlgebraicField}=await import('../src/terrain-algebraic.js'),{createBandKernel}=await import('../src/terrain-geodesic-flow.js');
 const base=directDomain({crease:false});
 for(const [ids,expected] of [[[0,1],1],[[0,7],2],[[0,6],2]]){
  const domain={...base,faces:base.faces.filter(f=>ids.includes(f.id))};
  const k=createBandKernel(exactDomain(domain),createAlgebraicField());
  assert.equal(k.patchIndex().patches.length,expected,JSON.stringify(ids));
 }
 const moved=directDomain({slope:2**-40});
 const k=createBandKernel(exactDomain(moved),createAlgebraicField());
 assert.equal(k.patchIndex().patches.length,2);
});

test('an actual crease and every source parameter interval survive patch seed coalescence',()=>{
 const domain=directDomain({slope:2**-40});
 const r=band({domain,axisXY:[[499997,4999999],[500003,4999999]],widthM:1,areaMode:'coplanar-patches'});
 const native=band({domain,axisXY:[[499997,4999999],[500003,4999999]],widthM:1});
 assert.equal(r.valid,native.valid);
 assert.equal(r.valid,false);
 assert.ok(r.validation.unresolved.some(p=>p.stratum==='point'&&p.xy[0]===500000));
 assert.ok(r.validation.seedMapping.length>=2);
 assert.equal(r.validation.patchMembership.length,2);
 for(const seed of r.validation.seedMapping){
  assert.equal(seed.sourceIntervals[0].mergedParameterInterval[0],'0/1');
  assert.equal(seed.sourceIntervals.at(-1).mergedParameterInterval[1],'1/1');
 }
});

test('patch-wide overlapping sweeps and absent native support never become applicable bands',()=>{
 const domain=directDomain({crease:false});
 const overlapAxis={axisId:'overlap',components:[{coordinatesXY:[[499997,4999999],[500001,4999999]]},{coordinatesXY:[[499999,4999999],[500003,4999999]]}]};
 const overlap=band({domain,axisXY:overlapAxis,widthM:1,areaMode:'coplanar-patches'});
 assert.equal(overlap.valid,false);assert.ok(overlap.validation.unresolved.some(p=>p.detail==='overlapping-normal-patches'));
 const missing={...domain,faces:domain.faces.filter(f=>f.id!==7)};
 const gap=band({domain:missing,axisXY:[[499997,4999999],[499997,5000001]],widthM:1,areaMode:'coplanar-patches'});
 assert.equal(gap.valid,false);assert.equal(gap.geometry.coordinates.length,0);
 assert.ok(gap.validation.unresolved.some(p=>p.detail==='unproved-coplanar-patch-support'));
});

test('compact patch union counts overlapping operands once and retains a real hole',async()=>{
 const {measureSurfaceUnion}=await import('../src/terrain-surface-bands.js');
 const domain=directDomain(),hole=[[499999,4999999.5],[500001,4999999.5],[500001,5000000.5],[499999,5000000.5],[499999,4999999.5]];
 domain.boundaries.push({id:'hole',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:hole});
 const rectangle=(a,b)=>({type:'MultiPolygon',coordinates:[[[[a,4999999],[b,4999999],[b,5000001],[a,5000001],[a,4999999]]]]});
 const geometriesXY=[rectangle(499998,500001),rectangle(499999,500002)];
 const a=measureSurfaceUnion({domain,geometriesXY,areaMode:'coplanar-patches'});
 const b=measureSurfaceUnion({domain:{...domain,faces:[...domain.faces].reverse()},geometriesXY:[...geometriesXY].reverse(),areaMode:'coplanar-patches'});
 close(a.areaM2,6.75,1e-10);assert.deepEqual(a.areaBoundsM2,b.areaBoundsM2);
});

test('construction guards cannot reach a previously untouched subguard hole',()=>{
 const domain=directDomain({crease:false}),gap=2**-25;
 const hole=[[500000.5+gap,4999999.5],[500001,4999999.5],[500001,5000000.5],[500000.5+gap,5000000.5],[500000.5+gap,4999999.5]];
 domain.boundaries.push({id:'hole',polygonIndex:0,ringIndex:1,hole:true,coordinatesXY:hole});
 const r=band({domain,axisXY:[[500000,4999999],[500000,5000001]],widthM:1,areaMode:'coplanar-patches'});
 if(r.valid){
  assert.ok(r.validation.exceptions.every(e=>!e.hole));
  const maxX=Math.max(...r.geometry.coordinates.flat(2).map(p=>toUTM(p)[0]));
  assert.ok(maxX<hole[0][0]);
 }else assert.equal(r.geometry.coordinates.length,0);
});


test('a one-ULP native height change is a patch crease and caches charge every new budget',async()=>{
 const {exactDomain,nextUp}=await import('../src/terrain-exact.js'),{createAlgebraicField}=await import('../src/terrain-algebraic.js'),{createBandKernel}=await import('../src/terrain-geodesic-flow.js');
 const domain=directDomain({crease:false});
 for(const f of domain.faces)f.vertices=f.vertices.map(p=>[p[0],p[1],p[0]===500005&&p[1]===4999995?nextUp(1):1]);
 const k=createBandKernel(exactDomain(domain),createAlgebraicField());
 assert.ok(k.patchIndex().patches.length>1);
 const {measureSurfaceFootprint}=await import('../src/terrain-surface-bands.js');
 const plain=directDomain(),geometryXY={type:'MultiPolygon',coordinates:[[[[499999,4999999],[500001,4999999],[500001,5000001],[499999,5000001],[499999,4999999]]]]};
 const counter=()=>({nodes:0,check(n=0){this.nodes+=n;}}),a=counter();
 const first=measureSurfaceFootprint({domain:plain,geometryXY,areaMode:'coplanar-patches',budget:a}),cold=a.nodes;
 const second=measureSurfaceFootprint({domain:plain,geometryXY,areaMode:'coplanar-patches',budget:a}),warm=a.nodes-cold;
 const b=counter(),third=measureSurfaceFootprint({domain:plain,geometryXY,areaMode:'coplanar-patches',budget:b});
 assert.ok(b.nodes>warm);assert.ok(cold>warm);
 assert.deepEqual(first.areaBoundsM2,second.areaBoundsM2);assert.deepEqual(first.areaBoundsM2,third.areaBoundsM2);
});

test('disconnected equal planes retain the actual launched patch identity',()=>{
 const base=directDomain({crease:false}),faces=base.faces.filter(f=>[0,7].includes(f.id));
 const boundaries=faces.map((face,polygonIndex)=>({id:`island:${polygonIndex}`,polygonIndex,ringIndex:0,coordinatesXY:[...face.vertices.map(p=>p.slice(0,2)),face.vertices[0].slice(0,2)]}));
 const domain={...base,faces,boundaries};
 const r=band({domain,axisXY:[[500002,5000004],[500003,5000004]],widthM:.5,areaMode:'coplanar-patches'});
 assert.equal(r.valid,true,JSON.stringify(r.validation.unresolved));
 assert.equal(r.validation.patchMembership.length,2);
 assert.ok(r.validation.spans.every(span=>span.patchItinerary.every(id=>id===7)));
 close(r.areaM2,.5,2e-6);
});
