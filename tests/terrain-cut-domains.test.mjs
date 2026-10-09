import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import * as domains from '../src/terrain-contour-domain.js';
import {exactDomain,pointKey,Q,ZERO,add,mul,div,cross} from '../src/terrain-exact.js';
import * as measuredBands from '../src/terrain-surface-bands.js?v=1.3.4';
import {axisScopeHash} from '../src/terrain-axis-geometry.js';
import {terrainInputHash} from '../src/terrain-model.js';
import * as queriedDomains from '../src/terrain-contour-domain.js?v=1.3.4';
import {exactDomain as queriedExactDomain} from '../src/terrain-exact.js?v=1.3.4';
import {axisScopeHash as queriedAxisScopeHash} from '../src/terrain-axis-geometry.js?v=1.3.4';
import {traceSupportedPassageStrip,createTerrainPassageGroup} from '../src/terrain-passage.js';

function fixture(){
  const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
  const raw=[[4,-3],[8,15],[9,15],[5,-3],[4,-3]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
  project.exclusions=[{id:'owner',passageGroupId:'cut',type:'linear',surfaceGroupVersion:1,surfaceGroupOwner:true,geometry:structuredClone(raw),
    surfaceGeometry:{type:'MultiPolygon',coordinates:[[raw]]},surfaceGeometryConvention:'domain-intersection',surfaceConstructionPolicy:'native-supported-axis-clip-1',
    sourceAxis:[[4.5,-3],[8.5,15]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632)),widthM:1.5,widthBasis:'model-surface',modelHash:model.contentHash,
    scopePortionId:'original',scopeGeometry:{type:'Polygon',coordinates:[project.geometry]}}];
  return {project,model};
}

// Catches native child domains reconstructed by projecting the WGS Boolean child.
test('canonical cut children bind exact native operands and paired boundary ancestry',()=>{
  assert.equal(typeof domains.deriveCanonicalCutScopes,'function');
  const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
  const result=domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget});
  assert.equal(result.children.length,2);
  for(const child of result.children){
    const domain=child.domain,kernel=exactDomain(domain,budget);
    assert.ok(kernel.boundaries.some(b=>b.coordinates.some(p=>p.some(q=>(q.d&(q.d-1n))!==0n))));
    assert.notEqual(axisScopeHash(domain),terrainInputHash(domain.geometry));
    assert.equal(child.recipe.kind,'canonical-cut-child-1');
    assert.ok(child.correspondence.every(ring=>ring.native.edges.length===ring.geographic.edges.length));
    const literal=domains.createContourDomain({model,geometry:domain.geometry,budget});
    assert.notDeepEqual(kernel.boundaries.map(b=>b.coordinates.map(pointKey)),exactDomain(literal,budget).boundaries.map(b=>b.coordinates.map(pointKey)));
  }
});

test('canonical component reconstruction rejects missing selectors owners and changed operands',()=>{
  assert.equal(typeof domains.createCanonicalCutChildDomain,'function');
  const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
  const scopes=domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget});
  const recipe=scopes.children[0].recipe;
  const rebuilt=domains.createCanonicalCutChildDomain({project,model,recipe,budget});
  assert.equal(axisScopeHash(rebuilt),axisScopeHash(scopes.children[0].domain));
  assert.throws(()=>domains.createCanonicalCutChildDomain({project,model,recipe:{...recipe,componentKey:'missing'},budget}));
  const changed=structuredClone(project);changed.exclusions[0].surfaceGeometry.coordinates[0][0][1][0]+=.000001;
  assert.throws(()=>domains.createCanonicalCutChildDomain({project:changed,model,recipe,budget}));
  assert.throws(()=>domains.createCanonicalCutChildDomain({project,model,recipe:{...recipe,kind:'future'},budget}));
});

// Both parent import forms must observe the one owner-derived private registry.
test('bare and queried factories share exact scope authority in both import directions',()=>{
  const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
  for(const [factory,exact,hash,getter] of [
    [domains,queriedExactDomain,queriedAxisScopeHash,queriedDomains.canonicalCutDomainScope],
    [queriedDomains,exactDomain,axisScopeHash,domains.canonicalCutDomainScope]
  ]){
    const child=factory.deriveCanonicalCutScopes({project,model,groupId:'cut',budget}).children[0];
    const proof=getter(child.domain);
    assert.ok(proof);
    assert.equal(hash(child.domain),proof.scopeHash);
    assert.deepEqual(exact(child.domain,budget).boundaries.map(b=>b.coordinates.map(pointKey)),proof.boundaries.map(b=>b.coordinates.map(pointKey)));
    assert.throws(()=>getter({...child.domain}),{status:'cut-scope-unresolved'});
    assert.throws(()=>exact({...child.domain},budget),{status:'cut-scope-unresolved'});
    assert.throws(()=>{proof.operands.modelHash='changed';},TypeError);
    assert.throws(()=>{proof.boundaries[0].coordinates[0][0].n=0n;},TypeError);
    assert.equal(Object.hasOwn(factory,'registerCanonicalCutDomain'),false);
  }
});

// Independent rational shoelace bounds catch integrating rounded display rings.
test('canonical child area integrates exact native boundaries with retained area evidence',()=>{
 const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
 const child=domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget}).children[0];
 assert.equal(typeof measuredBands.measureDomainSurfaceArea,'function');
 const measured=measuredBands.measureDomainSurfaceArea({domain:child.domain,budget});
 const exact=domains.canonicalCutDomainScope(child.domain).boundaries;
 const horizontal=div(exact.reduce((sum,ring)=>ring.coordinates.slice(1).reduce((sum,p,i)=>add(sum,cross(ring.coordinates[i],p)),sum),ZERO),Q(2));
 const squaredExpected=mul(mul(horizontal,horizontal),Q(17/16));
 const squared=x=>mul(Q(x),Q(x)),compare=(a,b)=>a.n*b.d-b.n*a.d;
 assert.ok(compare(squared(measured.areaBoundsM2[0]),squaredExpected)<=0);
 assert.ok(compare(squared(measured.areaBoundsM2[1]),squaredExpected)>=0);
 const summary=measuredBands.measureSurfaceFootprint({domain:child.domain,geometryXY:{type:'MultiPolygon',coordinates:[child.domain.boundaries.map(r=>r.coordinatesXY)]},budget});
 assert.notEqual(measuredBands.compareMeasuredSurfaceAreas(measured,summary,{budget}),0);
 assert.equal(measuredBands.compareMeasuredSurfaceAreas(measured,measured,{budget}),0);
 assert.doesNotThrow(()=>JSON.stringify(measured));
});

// P, children and G∩P must conserve actual exact native surface before headlands.
test('transient pre-road physical domain proves fixed-area partition and cannot be a saved child recipe',()=>{
 const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
 const scopes=domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget});
 assert.ok(scopes.physicalDomain);
 assert.equal(scopes.physicalDomain.canonicalScopeRecipe.kind,'canonical-cut-physical-1');
 const physical=measuredBands.measureDomainSurfaceArea({domain:scopes.physicalDomain,budget});
 const children=scopes.children.map(child=>measuredBands.measureDomainSurfaceArea({domain:child.domain,budget}));
 const road=measuredBands.measureSurfaceFootprint({domain:scopes.physicalDomain,geometryXY:scopes.nativeRawGeometryXY,budget});
 const partition=measuredBands.sumMeasuredSurfaceAreas([...children,road],{budget});
 assert.equal(measuredBands.compareMeasuredSurfaceAreas(partition,physical,{budget}),0);
 assert.throws(()=>domains.canonicalCutDomainScope({...scopes.physicalDomain}),{status:'cut-scope-unresolved'});
 assert.throws(()=>domains.createCanonicalCutChildDomain({project,model,recipe:scopes.physicalDomain.canonicalScopeRecipe,budget}),{status:'cut-scope-unresolved'});
});

test('canonical reconstruction charges one shared immutable operand snapshot before copying or cap exhaustion',()=>{
 const {project,model}=fixture(),originalClone=globalThis.structuredClone;
 // Both counted reconstructions take the identical existing native cache path.
 queriedDomains.createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]}});
 const nodes=value=>Array.isArray(value)?(value.length>=2&&value.length<=3&&value.every(Number.isFinite)?1:value.reduce((sum,item)=>sum+nodes(item),0)):value&&typeof value==='object'?Object.values(value).reduce((sum,item)=>sum+nodes(item),0):0;
 let total=0,lastDelta=0,copies=0,snapshotStart=0,snapshotNodes=0;
 const real=createTerrainBudget({kind:'cut'}),budget={...real,check(delta=0){total+=delta;lastDelta=delta;real.check(delta);}};
 globalThis.structuredClone=value=>{
  if(value?.field&&value?.exclusions){
   copies++;snapshotNodes=nodes(value);snapshotStart=total-lastDelta;
   assert.ok(lastDelta>=snapshotNodes,'all retained operand coordinates charged before allocation');
  }
  return originalClone(value);
 };
 try{
  const result=domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget});
  assert.equal(copies,1);
  const scopes=[...result.children.map(child=>child.domain),result.physicalDomain].map(domains.canonicalCutDomainScope);
  assert.ok(scopes.every(scope=>scope.operands===scopes[0].operands));
  assert.ok(Object.isFrozen(scopes[0].operands.field[0]));
  assert.notEqual(scopes[0].operands.field,project.geometry);
  const capped=createTerrainBudget({kind:'cut'});
  capped.check(500000-(snapshotStart+snapshotNodes-1));copies=0;
  assert.throws(()=>domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget:capped}),{status:'budget-exceeded'});
  assert.equal(copies,0,'the actual shared cap rejects before snapshot allocation');
 }finally{globalThis.structuredClone=originalClone;}
});

test('certified canonical P passage saves its original bound scope and reloads exact restricted area',()=>{
 const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
 const restriction=[[-1,1],[4,4],[4,5],[-1,1]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 project.exclusions.unshift(restriction);
 const before=domains.deriveCanonicalCutScopes({project,model,groupId:'cut',budget});
 const physical=before.physicalDomain,proof=domains.canonicalCutDomainScope(physical);
 assert.ok(proof.boundaries.some(ring=>ring.coordinates.some(p=>p.some(q=>(q.d&(q.d-1n))!==0n))));
 const sourceAxis=[[6,-3],[6,15]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const strip=traceSupportedPassageStrip({model,physicalDomain:physical,sourceAxis,widthM:1.5,budget});
 assert.equal(strip.valid,true,JSON.stringify(strip.validation.unresolved));
 assert.deepEqual(strip.scopeGeometry,before.owner.scopeGeometry);
 assert.notDeepEqual(strip.scopeGeometry,physical.geometry);
 assert.deepEqual(proof.sourceScopeGeometry,before.owner.scopeGeometry);
 assert.ok(Object.isFrozen(proof.sourceScopeGeometry.coordinates[0][0]));
 const parts=createTerrainPassageGroup({strip,scopePortionId:'original',passageGroupId:'cut',createId:()=> 'replacement-owner',budget});
 const reloaded=JSON.parse(JSON.stringify({...project,exclusions:[restriction,...parts]}));
 const after=domains.deriveCanonicalCutScopes({project:reloaded,model,groupId:'cut',budget});
 const originalArea=measuredBands.measureDomainSurfaceArea({domain:physical,budget}),restoredArea=measuredBands.measureDomainSurfaceArea({domain:after.physicalDomain,budget});
 assert.equal(measuredBands.compareMeasuredSurfaceAreas(originalArea,restoredArea,{budget}),0);
 assert.deepEqual(exactDomain(physical,budget).boundaries.map(r=>r.coordinates.map(pointKey)),exactDomain(after.physicalDomain,budget).boundaries.map(r=>r.coordinates.map(pointKey)));
 assert.equal(measuredBands.compareMeasuredSurfaceAreas(strip,strip,{budget}),0,'scope metadata finalized before private area fingerprint');
 assert.throws(()=>traceSupportedPassageStrip({model,physicalDomain:before.children[0].domain,sourceAxis,widthM:1.5,budget}),{status:'cut-scope-unresolved'});
});
