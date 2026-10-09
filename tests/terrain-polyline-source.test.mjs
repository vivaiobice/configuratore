import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js?v=1.3.4';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.4';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.4';
import {fromUTM,toUTM} from '../src/coordinate-system.js?v=1.3.4';
import {axisBinding,exactPieceLengthBounds} from '../src/terrain-axis-geometry.js?v=1.3.4';
import {Q,ZERO,add,mul,div,cmp,sub,sign,height,pointKey,inRegion,exactDomain,radical,radd,radicalCompare,dot,vsub} from '../src/terrain-exact.js?v=1.3.4';

// A missing implementation is an explicit API assertion RED, not an import
// failure. Unexpected dependency errors still fail the test module itself.
let policy;
const policyModuleUrl=new URL('../src/terrain-polyline-source.js?v=1.3.1-prova.1',import.meta.url);
try{policy=await import(policyModuleUrl.href);}
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND'||typeof error.url!=='string'||new URL(error.url).pathname!==policyModuleUrl.pathname)throw error;policy={};}
function api(){
 for(const name of ['traceFinitePolylineContourLevel','validFinitePolylineSourceAxisSchema','finitePolylineSourceHash','resolveFinitePolylineSourceAxis','intersectPolylineSourceIntervals','polylinePhysicalFragments','trimPolylineSourceFragment'])assert.equal(typeof policy[name],'function',`Missing finite polyline API ${name}`);
 assert.equal(policy.FINITE_POLYLINE_AXIS_CONVENTION,'finite-polyline-domain-intersection-1');
 assert.equal(policy.POLYLINE_SOURCE_PARAMETER_OPERATION,'polyline-source-parameter-intervals-1');
 return policy;
}
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const polygon=points=>({type:'Polygon',coordinates:[geographic(points)]});
const rectangle=(loX,loY,hiX,hiY)=>polygon([[loX,loY],[hiX,loY],[hiX,hiY],[loX,hiY],[loX,loY]]);
const creaseGeometry=polygon([[-10,2.5],[0,0],[10,-20],[10,0],[0,20],[-10,22.5],[-10,2.5]]);
function modelFor(heightFn){
 return createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,i)=>heightFn(-40+(i%3)*40,40-Math.floor(i/3)*40))}});
}
function fixture({heightFn=(x,y)=>(x<0?.05:.4)*x+.2*y,geometry=creaseGeometry}={}){
 const model=modelFor(heightFn),budget=createTerrainBudget({kind:'cut'}),domain=createContourDomain({model,geometry,budget});
 return {model,domain,budget};
}
function source(domain,levelM,budget,{originalDomain=domain,ordinal=0}={}){
 const p=api(),result=p.traceFinitePolylineContourLevel(domain,levelM,{originalDomain,portionId:'source',ordinal,budget});
 assert.equal(result.axes.length,1,JSON.stringify(result.diagnostics));
 assert.deepEqual(result.diagnostics,[]);
 return result.axes[0];
}
function resolve(domain,axis,budget,options){return api().resolveFinitePolylineSourceAxis(exactDomain(domain,budget),axis,budget,options);}
function abs(q){return sign(q)<0?sub(ZERO,q):q;}
function groundExpression(pieces){
 let result=[];
 for(const piece of pieces){const delta=vsub(piece.b,piece.a),dz=dot(piece.faces[0].g,delta);result=radd(result,radical([[Q(1),add(dot(delta,delta),mul(dz,dz))]]));}
 return result;
}

test('actual eight-triangle crease source keeps native knots and supported finite caps beyond original P',()=>{
 const p=api(),{domain,budget}=fixture(),axis=source(domain,2,budget,{ordinal:4});
 assert.equal(axis.axisId,'source:level:2');assert.equal(axis.ordinal,4);
 assert.equal(axis.axisGeometryConvention,p.FINITE_POLYLINE_AXIS_CONVENTION);
 assert.deepEqual(axis.axisGeometryBinding,axisBinding(domain,domain));
 assert.equal(axis.components.length,1);assert.ok(axis.components[0].coordinatesXY.length>=3);
 for(const component of axis.components){
  assert.deepEqual(component.coordinatesXY,component.coordinates.map(point=>toUTM(point,32632)));
  for(const point of component.coordinatesXY)assert.ok(point[0]>499960&&point[0]<500040&&point[1]>4999960&&point[1]<5000040,'caps and knots lie strictly within acquired S');
 }
 const kernel=exactDomain(domain,budget),points=axis.components[0].coordinatesXY;
 assert.equal(inRegion(points[0].map(Q),kernel),-1);assert.equal(inRegion(points.at(-1).map(Q),kernel),-1);
 const resolved=resolve(domain,axis,budget);
 assert.equal(resolved.uncovered.length,0);assert.ok(resolved.outside.length>0);assert.ok(resolved.pieces.length>=2);
 const physical=p.polylinePhysicalFragments(resolved.pieces,budget);assert.equal(physical.length,1);
 assert.equal(physical[0][0].startCap.kind,'physical-boundary');assert.equal(physical[0].at(-1).endCap.kind,'physical-boundary');
 assert.ok(resolved.pieces.some(piece=>cmp(piece.faces[0].g[0],div(Q(2),Q(40)))===0));
 assert.ok(resolved.pieces.some(piece=>cmp(piece.faces[0].g[0],div(Q(16),Q(40)))===0));
 const submitted=new Set(points.map(point=>pointKey(point.map(Q))));
 assert.ok(resolved.pieces.some(piece=>!submitted.has(pointKey(piece.a))||!submitted.has(pointKey(piece.b))),'exact physical intersections are not rounded source endpoints');
 for(const piece of resolved.pieces)for(const endpoint of [piece.a,piece.b])assert.ok(cmp(abs(sub(height(piece.faces[0],endpoint),Q(2))),Q(.001))<=0);
});

test('schema and source hash bind both saved coordinate arrays and stable finite local interval operands',()=>{
 const p=api(),{domain,budget}=fixture(),axis=source(domain,2,budget),hash=p.finitePolylineSourceHash(axis);
 assert.equal(p.validFinitePolylineSourceAxisSchema(axis),true);
 for(const mutate of [copy=>{copy.components[0].coordinates[0][0]+=.001;},copy=>{copy.components[0].coordinatesXY[0][0]+=1;},copy=>{copy.ordinal+=1;},copy=>{copy.levelM+=1;},copy=>{copy.axisGeometryBinding.originalScopeHash='changed';}]){
  const copy=structuredClone(axis);mutate(copy);assert.notEqual(p.finitePolylineSourceHash(copy),hash);
 }
 const record={componentIndex:0,segmentIndex:0,lo:.2,hi:.8},retained={...axis,axisOperation:{kind:p.POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[record]}};
 assert.equal(p.validFinitePolylineSourceAxisSchema(retained),true);
 for(const intervals of [[{...record,lo:NaN}],[{...record,hi:1.1}],[{...record,lo:.8,hi:.2}],[{...record,componentIndex:99}],[{...record,segmentIndex:99}],[record,{...record,lo:.5,hi:.9}],[record,record]])assert.equal(p.validFinitePolylineSourceAxisSchema({...axis,axisOperation:{kind:p.POLYLINE_SOURCE_PARAMETER_OPERATION,intervals}}),false);
 assert.equal(p.validFinitePolylineSourceAxisSchema({...axis,axisOperation:{kind:'source-parameter-intervals-1',intervals:[[.2,.8]]}}),false);
});

test('resolver rejects stale model CRS scopes geographic/native tampering and copied domain identity',()=>{
 const p=api(),{domain,budget}=fixture(),axis=source(domain,2,budget);
 for(const mutate of [copy=>{copy.axisGeometryBinding.modelHash='changed';},copy=>{copy.axisGeometryBinding.crs='EPSG:32633';},copy=>{copy.axisGeometryBinding.scopeHash='changed';},copy=>{copy.components[0].coordinates[0][0]+=.001;},copy=>{copy.components[0].coordinatesXY[0][0]+=1;}]){
  const copy=structuredClone(axis);mutate(copy);assert.throws(()=>resolve(domain,copy,budget),{status:'axis-geometry-unresolved'});
 }
 const original=structuredClone(axis);original.axisGeometryBinding.originalScopeHash='changed';
 assert.throws(()=>resolve(domain,original,budget,{original:true}),{status:'axis-geometry-unresolved'});
 assert.throws(()=>p.traceFinitePolylineContourLevel(Object.freeze({...domain}),2,{portionId:'source',budget}),{status:'domain-support-unresolved'});
 assert.throws(()=>p.resolveFinitePolylineSourceAxis({...exactDomain(domain,budget)},axis,budget),{status:'axis-geometry-unresolved'});
});

test('saved actual source support and backtracking are checked independently of its hash',()=>{
 const p=api(),{domain,budget}=fixture(),axis=source(domain,2,budget),unsupported=structuredClone(axis);
 unsupported.components[0].coordinates[0]=fromUTM([499900,5000000],32632);
 unsupported.components[0].coordinatesXY[0]=toUTM(unsupported.components[0].coordinates[0],32632);
 assert.throws(()=>resolve(domain,unsupported,budget),{status:'axis-geometry-unresolved'});
 const backtrack=structuredClone(axis),component=backtrack.components[0];
 component.coordinates.splice(1,0,structuredClone(component.coordinates[0]));component.coordinatesXY.splice(1,0,structuredClone(component.coordinatesXY[0]));
 assert.equal(p.validFinitePolylineSourceAxisSchema(backtrack),false);
 assert.throws(()=>resolve(domain,backtrack,budget),{status:'axis-geometry-unresolved'});
});

test('legacy dense coincident knot keeps its unpaired rejection while exact coalescence certifies the complete source',async t=>{
 const p=api(),{domain,budget}=fixture({heightFn:x=>.4*Math.abs(x),geometry:rectangle(-15,-10,15,10)});
 const {readFile}=await import('node:fs/promises'),saved=JSON.parse(await readFile(new URL('./fixtures/terrain-dense-v132-unpaired-source.json',import.meta.url),'utf8'));
 const compact=p.traceFinitePolylineContourLevel(domain,4,{portionId:'source',budget});
 assert.equal(compact.axes.length,1);assert.deepEqual(compact.diagnostics,[]);
 assert.equal(resolve(domain,compact.axes[0],budget).uncovered.length,0);
 assert.throws(()=>resolve(domain,saved.axis,budget),error=>{
  assert.equal(error.status,'axis-geometry-unresolved');assert.match(error.message,/contact ancestry is unpaired/);
  const d=error.diagnostics;
  assert.equal(d.firstDifference,2);assert.equal(d.nativeCount,24);assert.equal(d.geographicCount,26);
  assert.deepEqual(d.nativePrevious,d.geographicPrevious);assert.equal(d.nativePrevious.inside,false);
  assert.equal(d.native.source,'knot:1');assert.equal(d.native.exactParameter,'1/1');
  assert.equal(d.geographic.source,'boundary');assert.equal(d.geographic.exactParameter,'1187694023/1187694802');
  assert.deepEqual(d.native.ancestry,d.geographic.ancestry);
  t.diagnostic(JSON.stringify(d));return true;
 });
});

test('constructor retains every relevant complete component and physical grouping preserves component identity',()=>{
 const p=api(),{domain,budget}=fixture({heightFn:x=>.4*Math.abs(x),geometry:rectangle(-15,-11,15,11)}),axis=source(domain,4,budget);
 assert.equal(axis.components.length,2);
 const resolved=resolve(domain,axis,budget),fragments=p.polylinePhysicalFragments(resolved.pieces,budget);
 assert.equal(fragments.length,2);assert.deepEqual([...new Set(fragments.map(fragment=>fragment[0].componentIndex))].sort(),[0,1]);
 for(const fragment of fragments)assert.ok(fragment.every(piece=>piece.componentIndex===fragment[0].componentIndex));
 const point=resolved.pieces[0].b;
 assert.equal(p.polylinePhysicalFragments([{...resolved.pieces[0],componentIndex:0,b:point},{...resolved.pieces[0],componentIndex:1,a:point}],budget).length,2,'a shared endpoint cannot merge distinct source components');
});

test('holes retain both exact fragments and original P is intersected before a larger physical P',()=>{
 const p=api(),model=modelFor((_x,y)=>y/5),budget=createTerrainBudget({kind:'cut'}),outer=rectangle(-10,-10,10,10),hole=geographic([[-2,3],[2,3],[2,7],[-2,7],[-2,3]]),domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[outer.coordinates[0],hole]},budget});
 const axis=source(domain,1,budget),resolved=resolve(domain,axis,budget);
 assert.equal(p.polylinePhysicalFragments(resolved.pieces,budget).length,2);assert.equal(resolved.uncovered.length,0);
 const original=createContourDomain({model,geometry:rectangle(-6,-10,6,10),budget}),physical=createContourDomain({model,geometry:outer,budget}),bounded=source(physical,1,budget,{originalDomain:original});
 const before=resolve(original,bounded,budget,{original:true}),after=resolve(physical,bounded,budget,{originalDomain:original}),pieces=p.intersectPolylineSourceIntervals(bounded,after.pieces,before.pieces,budget);
 assert.deepEqual(exactPieceLengthBounds(pieces,budget),exactPieceLengthBounds(before.pieces,budget));
 assert.ok(exactPieceLengthBounds(pieces,budget)[1]<13,'larger physical P cannot enlarge the original source');
 const returnedFragments=p.polylinePhysicalFragments(pieces,budget),originalFragments=p.polylinePhysicalFragments(before.pieces,budget);
 assert.deepEqual(returnedFragments.map(fragment=>[fragment[0].a,fragment.at(-1).b]),originalFragments.map(fragment=>[fragment[0].a,fragment.at(-1).b]),'intersection endpoints are the actual original-P points');
 assert.deepEqual(returnedFragments.map(fragment=>[fragment[0].startCap,fragment.at(-1).endCap]),originalFragments.map(fragment=>[fragment[0].startCap,fragment.at(-1).endCap]),'intersected endpoints retain the actual original cap provenance rather than discarded larger-P boundary ancestry');
 for(const fragment of returnedFragments)for(const cap of [fragment[0].startCap,fragment.at(-1).endCap])assert.equal(cap.scopeHash,bounded.axisGeometryBinding.originalScopeHash);
 const smaller=createContourDomain({model,geometry:rectangle(-4,-10,4,10),budget}),smallerAxis=source(smaller,1,budget,{originalDomain:original}),smallerOriginal=resolve(original,smallerAxis,budget,{original:true}),smallerPhysical=resolve(smaller,smallerAxis,budget,{originalDomain:original});
 const smallerPieces=p.intersectPolylineSourceIntervals(smallerAxis,smallerPhysical.pieces,smallerOriginal.pieces,budget),smallerFragments=p.polylinePhysicalFragments(smallerPieces,budget),physicalFragments=p.polylinePhysicalFragments(smallerPhysical.pieces,budget);
 assert.ok(exactPieceLengthBounds(smallerPieces,budget)[1]<exactPieceLengthBounds(smallerOriginal.pieces,budget)[0],'actual current clipping cuts inside the original source');
 assert.deepEqual(smallerFragments.map(fragment=>[fragment[0].a,fragment.at(-1).b]),physicalFragments.map(fragment=>[fragment[0].a,fragment.at(-1).b]),'unchanged current endpoints remain the actual current-P points');
 assert.deepEqual(smallerFragments.map(fragment=>[fragment[0].startCap,fragment.at(-1).endCap]),physicalFragments.map(fragment=>[fragment[0].startCap,fragment.at(-1).endCap]),'current physical caps survive when their endpoint parameters remain in the intersection');
 for(const fragment of smallerFragments)for(const cap of [fragment[0].startCap,fragment.at(-1).endCap]){assert.equal(cap.kind,'physical-boundary');assert.equal(cap.scopeHash,smallerAxis.axisGeometryBinding.scopeHash);}
});

test('ground trimming sums multiple actual segment and face regimes before saving conservative local parameters',()=>{
 const p=api(),{domain,budget}=fixture(),axis=source(domain,2,budget),resolved=resolve(domain,axis,budget),fragments=p.polylinePhysicalFragments(resolved.pieces,budget);
 assert.equal(fragments.length,1);
 const trim=p.trimPolylineSourceFragment(axis,fragments[0],12,budget);
 assert.equal(trim.consumed,false);assert.equal(trim.operation.kind,p.POLYLINE_SOURCE_PARAMETER_OPERATION);assert.ok(trim.operation.intervals.length>0);
 for(const end of trim.removedEnds){assert.ok(end.removedLengthBoundsM[0]>=12);assert.ok(end.removedLengthBoundsM[1]<=12+1e-6);assert.ok(end.excessBoundsM[0]>=0&&end.excessBoundsM[1]<=1e-6);}
 const retained={...axis,axisOperation:trim.operation};
 assert.equal(p.validFinitePolylineSourceAxisSchema(retained),true);
 const clipped=resolve(domain,retained,budget),length=exactPieceLengthBounds(clipped.pieces,budget),originalLength=exactPieceLengthBounds(fragments[0],budget);
 const retainedFragment=p.polylinePhysicalFragments(clipped.pieces,budget)[0];assert.equal(retainedFragment[0].startCap.kind,'retained-source-cap');assert.equal(retainedFragment.at(-1).endCap.kind,'retained-source-cap');
 assert.ok(length[0]>0);assert.ok(length[1]<originalLength[0]-23);
 for(const piece of clipped.pieces)for(const endpoint of [piece.a,piece.b])assert.ok(cmp(endpoint[0],Q(500000))>0,'the initial trim crosses the actual crease rather than using one face speed');
 assert.throws(()=>p.trimPolylineSourceFragment(retained,clipped.pieces,1,budget),{status:'axis-geometry-unresolved'});
});

test('headland consumption never turns a proved positive actual remainder into an empty consumed recipe',()=>{
 const p=api(),{domain,budget}=fixture(),axis=source(domain,2,budget),pieces=p.polylinePhysicalFragments(resolve(domain,axis,budget).pieces,budget)[0];
 assert.equal(p.trimPolylineSourceFragment(axis,pieces,20,budget).consumed,true);
 const bounds=exactPieceLengthBounds(pieces,budget),amount=(bounds[0]+bounds[1])/4-1e-8;
 assert.equal(radicalCompare(groundExpression(pieces),Q(2*amount),budget),1);
 let trim;
 try{trim=p.trimPolylineSourceFragment(axis,pieces,amount,budget);}
 catch(error){assert.equal(error.status,'axis-geometry-unresolved');return;}
 assert.equal(trim.consumed,false);
 const retained=resolve(domain,{...axis,axisOperation:trim.operation},budget);
 assert.ok(exactPieceLengthBounds(retained.pieces,budget)[0]>0);
});

test('isolated actual true-P contacts fail without silently dropping their point stratum',()=>{
 const p=api();
 const model=modelFor((_x,y)=>y/5),budget=createTerrainBudget({kind:'cut'}),outer=createContourDomain({model,geometry:rectangle(-10,-10,10,10),budget}),touch=createContourDomain({model,geometry:polygon([[-5,5],[5,5],[0,0],[-5,5]]),budget}),axis=source(outer,0,budget);
 const bound={...axis,axisGeometryBinding:axisBinding(touch,touch)};
 assert.throws(()=>resolve(touch,bound,budget),{status:'axis-geometry-unresolved'});
 assert.throws(()=>p.traceFinitePolylineContourLevel(touch,0,{portionId:'source',budget}),{status:'axis-geometry-unresolved'});
});

test('new source work uses the same cumulative node and deadline budget',()=>{
 const p=api(),{domain}=fixture();
 assert.throws(()=>p.traceFinitePolylineContourLevel(domain,2,{portionId:'source',budget:createTerrainBudget({kind:'cut',initialNodeCount:499999})}),{status:'budget-exceeded'});
 assert.throws(()=>p.traceFinitePolylineContourLevel(domain,2,{portionId:'source',budget:createTerrainBudget({kind:'cut',deadlineMs:0})}),{status:'budget-exceeded'});
});

test('plateau topology produces a genuine diagnostic and no finite source axis',()=>{
 const p=api(),{domain,budget}=fixture({heightFn:()=>0,geometry:rectangle(-10,-10,10,10)}),result=p.traceFinitePolylineContourLevel(domain,0,{portionId:'source',budget});
 assert.deepEqual(result.axes,[]);assert.ok(result.diagnostics.some(item=>item.reason==='plateau'));
});
