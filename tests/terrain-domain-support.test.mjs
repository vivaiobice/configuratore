import test from 'node:test';
import assert from 'node:assert/strict';
import * as bare from '../src/terrain-contour-domain.js';
import * as queried from '../src/terrain-contour-domain.js?v=1.3.7';
import {createTerrainModel,getTerrainMesh} from '../src/terrain-model.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {fromUTM,toUTM} from '../src/coordinate-system.js';

const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function fixture(){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499980,5000020],step:[20,-20],values:Array.from({length:9},(_,i)=>{const x=-20+(i%3)*20,y=20-Math.floor(i/3)*20;return x/4+y/8;})}});
 const ring=geographic([[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]),geometry={type:'Polygon',coordinates:[ring]};
 const project={geometry:ring,exclusions:[],rowPortions:[{id:'source',geometry:[ring],mode:'inherited'}]};
 return {model,geometry,project};
}
function support(api,domain,budget){
 assert.equal(typeof api.readAcquiredNativeSupport,'function');
 return api.readAcquiredNativeSupport(domain,{budget});
}
function cutFixture(){
 const value=fixture(),raw=geographic([[-.5,-4],[.5,-4],[.5,4],[-.5,4],[-.5,-4]]);
 value.project.exclusions=[{id:'owner',passageGroupId:'road',type:'linear',surfaceGroupVersion:1,surfaceGroupOwner:true,geometry:structuredClone(raw),
  surfaceGeometry:{type:'MultiPolygon',coordinates:[[raw]]},surfaceGeometryConvention:'domain-intersection',surfaceConstructionPolicy:'native-supported-axis-clip-1',
  sourceAxis:geographic([[0,-4],[0,4]]),widthM:1,widthBasis:'model-surface',modelHash:value.model.contentHash,
  scopePortionId:'source',scopeGeometry:value.geometry}];
 return value;
}

test('bare and queried ordinary factories and support getters share actual identity in both directions',()=>{
 assert.equal(bare.createContourDomain,queried.createContourDomain);
 assert.equal(typeof bare.readAcquiredNativeSupport,'function');
 assert.equal(bare.readAcquiredNativeSupport,queried.readAcquiredNativeSupport);
 const {model,geometry}=fixture(),budget=createTerrainBudget({kind:'measure'});
 for(const [factory,reader] of [[bare,queried],[queried,bare]]){
  const domain=factory.createContourDomain({model,geometry,budget});
  assert.equal(domain,reader.createContourDomain({model,geometry,budget}));
  assert.equal(support(factory,domain,budget),support(reader,domain,budget));
 }
});

test('factory support retains the actual full native mesh including deeply frozen unused coordinates',()=>{
 const {model,geometry}=fixture(),input=structuredClone(model),budget=createTerrainBudget({kind:'measure'});
 const domain=bare.createContourDomain({model:input,geometry,budget}),actual=support(queried,domain,budget),expected=getTerrainMesh(model);
 assert.equal(actual.modelHash,model.contentHash);assert.equal(actual.crs,model.crs);
 assert.deepEqual(actual.mesh,expected);
 const used=new Set(domain.faces.flatMap(face=>face.vertexIds)),unused=actual.mesh.vertices.findIndex((_,id)=>!used.has(id));
 assert.ok(unused>=0,'the physical clip omits an acquired raster corner');
 for(const item of [actual,actual.mesh,actual.mesh.vertices,actual.mesh.triangles,actual.mesh.origin,actual.mesh.step,...actual.mesh.vertices,...actual.mesh.triangles])assert.equal(Object.isFrozen(item),true);
 for(const face of domain.faces)face.vertices.forEach((point,i)=>assert.equal(point,actual.mesh.vertices[face.vertexIds[i]]));
 assert.throws(()=>{actual.mesh.vertices[unused][2]=999;},TypeError);
 assert.throws(()=>{actual.mesh.triangles[0][0]=8;},TypeError);
 assert.throws(()=>{actual.mesh.origin[0]=0;},TypeError);
 assert.throws(()=>{actual.mesh.step[0]=1;},TypeError);
 assert.equal(Object.isFrozen(input),false);assert.equal(Object.isFrozen(input.grid.origin),false);assert.equal(Object.isFrozen(input.grid.step),false);
 input.grid.origin[0]+=1;
 assert.deepEqual(actual.mesh.origin,[499980,5000020]);assert.equal(support(bare,domain,budget),actual);
 assert.throws(()=>bare.createContourDomain({model:input,geometry,budget}));
});

test('acquired support exposes genuine native triangles beyond P without promoting a physical clip',()=>{
 const {model,geometry}=fixture(),budget=createTerrainBudget({kind:'measure'}),domain=queried.createContourDomain({model,geometry,budget}),actual=support(bare,domain,budget);
 assert.equal(actual.mesh.vertices.length,9);assert.equal(actual.mesh.triangles.length,8);
 assert.deepEqual(actual.mesh.triangles[0],[0,1,3]);assert.deepEqual(actual.mesh.triangles[1],[1,4,3]);
 assert.equal(domain.faceById.has(0),false);
 assert.deepEqual(actual.mesh.vertices[0],[499980,5000020,-2.5]);
 assert.ok(actual.mesh.vertices[0][0]<Math.min(...domain.boundaries[0].coordinatesXY.map(point=>point[0])));
 assert.deepEqual(actual.mesh.origin,[499980,5000020]);assert.deepEqual(actual.mesh.step,[20,-20]);
});

test('support rejects copied forged uncreated domains and changed model or CRS facades',()=>{
 const {model,geometry}=fixture(),domain=bare.createContourDomain({model,geometry});
 support(bare,domain);
 for(const invalid of [null,{},Object.freeze({...domain}),Object.freeze({...domain,modelHash:'changed'}),Object.freeze({...domain,crs:'EPSG:32633'}),Object.freeze({modelHash:model.contentHash,crs:model.crs,mesh:getTerrainMesh(model)})])assert.throws(()=>support(queried,invalid),{status:'domain-support-unresolved'});
});

test('support borrowing charges its full retained snapshot once per fresh operation and never twice after factory acquisition',()=>{
 const {model,geometry}=fixture(),budget=createTerrainBudget({kind:'measure'}),domain=bare.createContourDomain({model,geometry,budget}),before=budget.usage().nodeCount;
 const actual=support(queried,domain,budget);
 assert.equal(budget.usage().nodeCount,before);
 const fresh=createTerrainBudget({kind:'measure'});
 assert.equal(support(bare,domain,fresh),actual);assert.equal(fresh.usage().nodeCount,actual.mesh.vertices.length);
 assert.equal(support(queried,domain,fresh),actual);assert.equal(fresh.usage().nodeCount,actual.mesh.vertices.length);
 const cached=createTerrainBudget({kind:'measure'}),hit=queried.createContourDomain({model,geometry,budget:cached}),charged=cached.usage().nodeCount;
 assert.equal(hit,domain);assert.equal(support(bare,hit,cached),actual);assert.equal(cached.usage().nodeCount,charged);
});

test('fresh support borrow fails before return on retained-node or deadline exhaustion',()=>{
 const {model,geometry}=fixture(),domain=bare.createContourDomain({model,geometry});
 support(bare,domain);
 const capped=createTerrainBudget({kind:'measure',initialNodeCount:499992});
 assert.throws(()=>support(queried,domain,capped),{status:'budget-exceeded'});
 const expired=createTerrainBudget({kind:'measure',deadlineMs:0});
 assert.throws(()=>support(bare,domain,expired),{status:'budget-exceeded'});
});

test('real canonical physical and child domains borrow the actual shared parent mesh across import forms',()=>{
 const {model,project}=cutFixture(),budget=createTerrainBudget({kind:'cut'}),scopes=bare.deriveCanonicalCutScopes({project,model,groupId:'road',budget});
 assert.equal(scopes.children.length,2);
 const actual=support(queried,scopes.physicalDomain,budget),before=budget.usage().nodeCount;
 for(const child of scopes.children)assert.equal(support(bare,child.domain,budget),actual);
 assert.equal(budget.usage().nodeCount,before);
 const fresh=createTerrainBudget({kind:'cut'});
 for(const domain of [scopes.physicalDomain,...scopes.children.map(child=>child.domain)])assert.equal(support(queried,domain,fresh),actual);
 assert.equal(fresh.usage().nodeCount,actual.mesh.vertices.length);
 const preRoad=queried.createCanonicalCutPhysicalDomain({project:{...project,exclusions:[]},model,scopePortionId:'source',budget});
 assert.equal(support(bare,preRoad,budget),actual);
});

test('canonical support delegation rejects copied child identity and never persists its private parent',()=>{
 const {model,project}=cutFixture(),budget=createTerrainBudget({kind:'cut'}),scopes=queried.deriveCanonicalCutScopes({project,model,groupId:'road',budget});
 const child=scopes.children[0].domain;
 support(bare,child,budget);
 for(const invalid of [Object.freeze({...child}),Object.freeze({...child,modelHash:'changed'}),Object.freeze({canonicalScopeRecipe:child.canonicalScopeRecipe,geometry:child.geometry,faces:child.faces,modelHash:model.contentHash,crs:model.crs})])assert.throws(()=>support(queried,invalid),{status:'domain-support-unresolved'});
 assert.equal(Object.hasOwn(child,'acquiredSupportParent'),false);
 assert.equal(JSON.stringify(child).includes('acquiredSupportParent'),false);
 assert.equal(JSON.stringify(child).includes('valuesBase64'),false);
});

test('ordinary domain geometry native metrics and serialized facade remain unchanged by support retention',()=>{
 const {model,geometry}=fixture(),budget=createTerrainBudget({kind:'measure'}),domain=bare.createContourDomain({model,geometry,budget}),serialized=JSON.stringify(domain);
 assert.deepEqual(Object.keys(domain),['modelHash','crs','faces','boundaries','faceById','spatialIndex','elevationIndex','geometry','nodeCount','areaM2','surfaceAreaM2','minM','maxM','maxSlopePercent']);
 assert.deepEqual(domain.geometry,geometry);assert.deepEqual(domain.boundaries[0].coordinatesXY,geometry.coordinates[0].map(point=>toUTM(point,32632)));
 assert.ok(Math.abs(domain.areaM2-16)<1e-6);assert.ok(Math.abs(domain.surfaceAreaM2-16*Math.sqrt(1+1/16+1/64))<1e-6);
 assert.ok(Math.abs(domain.minM+.75)<1e-7);assert.ok(Math.abs(domain.maxM-.75)<1e-7);assert.equal(domain.maxSlopePercent,100*Math.hypot(.25,.125));
 support(queried,domain,budget);
 assert.equal(JSON.stringify(domain),serialized);
 assert.equal(JSON.stringify(domain).includes('valuesBase64'),false);assert.equal(Object.hasOwn(domain,'mesh'),false);
});
