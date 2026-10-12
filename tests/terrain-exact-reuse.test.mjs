import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTerrainModel} from '../src/terrain-model.js?v=1.3.9';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.9';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.9';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.9';
import {Q,exactDomain} from '../src/terrain-exact.js?v=1.3.9';
import {certifyUniformPlaneSupport} from '../src/terrain-surface-bands.js?v=1.3.9';
const sourceUrl=new URL('../src/terrain-polyline-source.js',import.meta.url);
async function internals(source){
 source=source.replaceAll('v=1.3.8','v=1.3.9');
 source=source.replace(/from '(\.\/[^']+)'/g,(_match,path)=>`from '${new URL(path,sourceUrl).href}'`);
 return import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {supportReader,levelGraph,regionKernel,contactWord,pairedClip,compileSource};').toString('base64'));
}
const reference=await internals(await readFile(new URL('./fixtures/terrain-polyline-source-reference-v138.txt',import.meta.url),'utf8'));
const current=await internals(await readFile(sourceUrl,'utf8'));
const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function fixture(height=(_x,y)=>y/4,holes=[]){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00Z',grid:{width:5,height:5,origin:[499980,5000020],step:[10,-10],values:Array.from({length:25},(_,i)=>height(-20+i%5*10,20-Math.floor(i/5)*10))}});
 const budget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring([[-8,-8],[8,-8],[8,8],[-8,8],[-8,-8]]),...holes.map(ring)]},budget});
 return {model,domain,budget};
}
test('region kernels and support bbox selections reuse actual same-budget owner evidence',()=>{
 const {domain,budget}=fixture(),native=current.regionKernel(domain,budget),geographic=current.regionKernel(domain,budget,true),before=budget.usage().nodeCount;
 assert.strictEqual(current.regionKernel(domain,budget),native);
 assert.strictEqual(current.regionKernel(domain,budget,true),geographic);
 assert.equal(budget.usage().nodeCount,before);
 const reader=current.supportReader(domain,budget),a=[500000,5000000].map(Q),b=[500007,5000006].map(Q),query=reader.querySegment(a,b,budget),count=budget.usage().nodeCount;
 assert.strictEqual(reader.querySegment(a,b,budget),query);
 assert.equal(budget.usage().nodeCount,count);
 const fresh=createTerrainBudget({kind:'adapt'});
 assert.notStrictEqual(current.regionKernel(domain,fresh),native);
 assert.ok(fresh.usage().nodeCount>0);
});
test('complete level graph is identical with fewer terminal sorting allocations',()=>{
 for(const height of [(_x,y)=>y/4,x=>Math.abs(x)/4,()=>0,(x,y)=>x*x+y*y])for(const level of [0,1,100]){
  const {domain}=fixture(height),oldBudget=createTerrainBudget({kind:'adapt'}),newBudget=createTerrainBudget({kind:'adapt'});
  const old=reference.levelGraph(reference.supportReader(domain,oldBudget),level,oldBudget),fresh=current.levelGraph(current.supportReader(domain,newBudget),level,newBudget);
  assert.deepEqual(fresh,old);
  if(old.components.length)assert.ok(newBudget.usage().nodeCount<oldBudget.usage().nodeCount);
 }
});
test('nonuniform plane eligibility avoids BandKernel geometry allocations and preserves fresh deadlines',()=>{
 const {domain,budget}=fixture((x,y)=>y/4+(x<0?x/16:x/2));exactDomain(domain,budget);
 const before=budget.usage().nodeCount;
 assert.equal(certifyUniformPlaneSupport(domain,budget),null);
 assert.equal(budget.usage().nodeCount,before);
 assert.throws(()=>certifyUniformPlaneSupport(domain,createTerrainBudget({kind:'adapt',deadlineMs:0})),{status:'budget-exceeded'});
});
test('paired clipping retains complete independent words and pieces with fewer actual allocated nodes',()=>{
 const {domain}=fixture((x,y)=>y/4+(x<0?x/16:x/2),[[[-2,2],[2,2],[2,6],[-2,6],[-2,2]]]);
 const setup=createTerrainBudget({kind:'adapt'}),axis=reference.traceFinitePolylineContourLevel(domain,1,{portionId:'source',budget:setup}).axes[0];assert.ok(axis);
 const oldBudget=createTerrainBudget({kind:'adapt'}),newBudget=createTerrainBudget({kind:'adapt'});
 const old=reference.pairedClip(axis,reference.compileSource(axis,oldBudget),domain,oldBudget),fresh=current.pairedClip(axis,current.compileSource(axis,newBudget),domain,newBudget);
 assert.deepEqual(fresh,old);
 assert.ok(newBudget.usage().nodeCount<oldBudget.usage().nodeCount*.85,`${newBudget.usage().nodeCount} vs ${oldBudget.usage().nodeCount}`);
});
function materializedWord(module,axis,coordinates,kernel,budget){
 const word=module.contactWord(axis,coordinates,kernel,budget);
 if(Array.isArray(word))return word.map(record=>({...record,...(record.exactParameter?{exactParameter:record.exactParameter}:{})}));
 const records=[];
 for(const event of word)records.push(event.kind==='open'?{componentIndex:event.componentIndex,segmentIndex:event.segmentIndex,kind:event.kind,inside:event.inside}:{componentIndex:event.componentIndex,segmentIndex:event.segmentIndex,kind:event.kind,source:event.source,location:event.location,ancestry:event.ancestry,exactParameter:`${event.parameter.n}/${event.parameter.d}`});
 return records;
}
test('streamed words equal complete historical words for holes, components, source knots and retained caps',()=>{
 for(const height of [(x,y)=>y/4+(x<0?x/16:x/2),x=>Math.abs(x)/4,(_x,y)=>y/4]){
  const {domain}=fixture(height,[[[-2,2],[2,2],[2,6],[-2,6],[-2,2]]]),setup=createTerrainBudget({kind:'adapt'}),axis=reference.traceFinitePolylineContourLevel(domain,1,{portionId:'words',budget:setup}).axes[0];assert.ok(axis);
  const retained={...axis,axisOperation:{kind:current.POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:axis.components.flatMap((c,componentIndex)=>c.coordinatesXY.slice(1).map((_p,segmentIndex)=>({componentIndex,segmentIndex,lo:segmentIndex?0:.1,hi:segmentIndex===c.coordinatesXY.length-2?.9:1})))}};
  for(const source of [axis,retained])for(const geographic of [false,true]){
   const oldBudget=createTerrainBudget({kind:'adapt'}),newBudget=createTerrainBudget({kind:'adapt'}),old=reference.compileSource(source,oldBudget),fresh=current.compileSource(source,newBudget);
   assert.deepEqual(materializedWord(current,source,geographic?fresh.geographic:fresh.native,current.regionKernel(domain,newBudget,geographic),newBudget),materializedWord(reference,source,geographic?old.geographic:old.native,reference.regionKernel(domain,oldBudget,geographic),oldBudget));
  }
 }
});
test('split results are immutable same-operation evidence, and fresh budgets rebuild actual pieces',()=>{
 const {domain,budget}=fixture((x,y)=>y/4+(x<0?x/16:x/2)),axis=current.traceFinitePolylineContourLevel(domain,1,{portionId:'reuse',budget}).axes[0],compiled=current.compileSource(axis,budget);
 const first=current.pairedClip(axis,compiled,domain,budget),before=budget.usage().nodeCount;
 const second=current.pairedClip(axis,compiled,domain,budget);
 assert.deepEqual(second,first);
 assert.ok(budget.usage().nodeCount-before<before/3);
 assert.ok(first.pieces.every(piece=>Object.isFrozen(piece.a)&&Object.isFrozen(piece.b)));
 const fresh=createTerrainBudget({kind:'adapt'}),newCompiled=current.compileSource(axis,fresh),rebuilt=current.pairedClip(axis,newCompiled,domain,fresh);
 assert.deepEqual(rebuilt,first);assert.ok(fresh.usage().nodeCount>budget.usage().nodeCount-before);
 const modified=structuredClone(axis);modified.components[0].coordinatesXY[0][0]+=1;
 assert.throws(()=>current.resolveFinitePolylineSourceAxis(exactDomain(domain,budget),modified,budget),{status:'axis-geometry-unresolved'});
});
test('uniform eligibility remains the BandKernel exact predicate even with parallel intercept differences',async()=>{
 const {createBandKernel}=await import('../src/terrain-geodesic-flow.js?v=1.3.9'),{createAlgebraicField}=await import('../src/terrain-algebraic.js?v=1.3.9');
 const vertices=[[0,0,0],[4,0,1],[0,4,1],[10,0,2.5],[14,0,3.5],[10,4,3.5]];
 const make=offset=>({faces:[[0,1,2],[3,4,5]].map((ids,id)=>({id,vertexIds:ids,vertices:ids.map(index=>vertices[index].map((value,i)=>i===2&&id?value+offset:value)),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':'))})),boundaries:[]});
 // Intercept disagreement, including one exact binary ULP, is always negative.
 for(const offset of [1,2**-40]){
  const domain=make(offset),budget=createTerrainBudget({kind:'adapt'}),exact=exactDomain(domain,budget),kernel=createBandKernel(exact,createAlgebraicField(budget),budget);
  assert.equal(kernel.uniformPlane,false);assert.equal(certifyUniformPlaneSupport(domain,budget),null);
 }
 const {domain,budget}=fixture();assert.ok(certifyUniformPlaneSupport(domain,budget));
});
