import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {fromUTM} from '../src/coordinate-system.js';
import * as passage from '../src/terrain-passage.js';
import {resolveTerrainExclusionGroups} from '../src/terrain-exclusion-groups.js?v=1.3.7';
import {createCanonicalCutPhysicalDomain,deriveCanonicalCutScopes} from '../src/terrain-contour-domain.js?v=1.3.7';

const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function fixture(options={}){
 const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]],...options});
 project.rowPortions=[{id:'source',label:'Original scope',mode:'inherited',geometry:[structuredClone(project.geometry)],orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}];
 return {project,model};
}

test('terrain passage construction obtains its original selected scope before any target group exists',()=>{
 assert.equal(typeof passage.buildTerrainPassage,'function');
 const {project,model}=fixture(),before=structuredClone(project);
 const output=passage.buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,-3],[5,13]]),widthM:1.5,groupId:'new-road',createId:()=> 'road-owner',budget:createTerrainBudget({kind:'cut'})});
 assert.deepEqual(project,before);
 assert.equal(output.cut.groupId,'new-road');
 assert.equal(output.cut.scopePortionId,'source');
 assert.equal(output.cut.widthM,1.5);
 assert.equal(output.cut.widthBasis,'model-surface');
 assert.equal(output.cut.surfaceConstructionPolicy,'native-supported-axis-clip-1');
 assert.ok(Math.abs(output.cut.roadAreaM2-15)<1e-5);
 const resolved=resolveTerrainExclusionGroups({exclusions:output.exclusions,field:project.geometry});
 assert.equal(resolved.groups.length,1);
 assert.deepEqual(resolved.groups[0].owner.scopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 assert.deepEqual(resolved.groups[0].owner.sourceAxis,geographic([[5,-3],[5,13]]));
});

test('pre-road current restrictions affect physical cost without replacing saved original source scope',()=>{
 assert.equal(typeof passage.buildTerrainPassage,'function');
 const {project,model}=fixture({exclusionsXY:[[[4,2],[6,2],[6,4],[4,4],[4,2]]]}),prior=structuredClone(project.exclusions);
 const output=passage.buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,-3],[5,13]]),widthM:1.5,groupId:'masked-road',createId:()=> 'masked-owner'});
 assert.deepEqual(output.exclusions.slice(0,prior.length),prior);
 const resolved=resolveTerrainExclusionGroups({exclusions:output.exclusions,field:project.geometry});
 assert.deepEqual(resolved.groups[0].owner.scopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 assert.ok(Math.abs(output.cut.roadAreaM2-12)<1e-5);
});

test('an internal finite supported road is retained by passage construction without claiming a split',()=>{
 assert.equal(typeof passage.buildTerrainPassage,'function');
 const {project,model}=fixture();
 const output=passage.buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,3],[5,7]]),widthM:1.5,groupId:'internal-road',createId:()=> 'internal-owner'});
 assert.equal(output.cut.groupId,'internal-road');
 assert.ok(Math.abs(output.cut.roadAreaM2-6)<1e-5);
 assert.equal(Object.hasOwn(output,'createdChildIds'),false);
 assert.equal(Object.hasOwn(output,'affectedPortionIds'),false);
});

test('a non-dyadic current restriction crossing the source perimeter remains an operand instead of a saved P preview',()=>{
 assert.equal(typeof passage.buildTerrainPassage,'function');
 const {project,model}=fixture({exclusionsXY:[[[-1,1],[8,4],[8,5],[-1,1]]]}),prior=structuredClone(project.exclusions);
 const output=passage.buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,-3],[5,13]]),widthM:1.5,groupId:'rational-road',createId:()=> 'rational-owner'});
 const resolved=resolveTerrainExclusionGroups({exclusions:output.exclusions,field:project.geometry});
 assert.deepEqual(output.exclusions.slice(0,prior.length),prior);
 assert.deepEqual(resolved.groups[0].owner.scopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 // The crossing at x=0 is y=4/3 in the independent local XY oracle;
 // reconstructing P from its finite display coordinates would change it.
 // At x=5 the removed vertical interval is 2/3; integrate over width1.5.
 assert.ok(Math.abs(output.cut.roadAreaM2-14)<1e-5);
});

test('missing selected original scope fails before any passage identity is allocated',()=>{
 assert.equal(typeof passage.buildTerrainPassage,'function');
 const {project,model}=fixture();let allocated=0;
 assert.throws(()=>passage.buildTerrainPassage({project,model,portionId:'missing',sourceAxis:geographic([[5,-3],[5,13]]),widthM:1.5,groupId:'bad-road',createId:()=>{allocated++;return 'bad-owner';}}),{status:'cut-scope-unresolved'});
 assert.equal(allocated,0);
});

let previousGroupFixture;
function previousGroup(){
 if(!previousGroupFixture){
  const {project,model}=fixture(),budget=createTerrainBudget({kind:'cut'});
  const first=passage.buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,-3],[5,13]]),widthM:1.5,groupId:'road',createId:()=> 'old-owner',budget});
  const current={...project,exclusions:first.exclusions},scopes=deriveCanonicalCutScopes({project:current,model,groupId:'road',budget});
  current.rowPortions=scopes.children.map((child,index)=>({id:index?'child-2':'source',mode:'inherited',geometry:child.domain.geometry.coordinates,terrainScopeRecipe:child.recipe}));
  previousGroupFixture={project:current,model};
 }
 return {project:structuredClone(previousGroupFixture.project),model:previousGroupFixture.model};
}

for(const [label,alter] of [
 ['foreign recipe',(project,source)=>{source.terrainScopeRecipe.groupId='another-group';}],
 ['unsupported recipe kind',(project,source)=>{source.terrainScopeRecipe.kind='unknown-lineage';}],
 ['partial recipe',(project,source)=>{delete source.terrainScopeRecipe.componentKey;}],
 ['duplicate original owner IDs',(project,source)=>{project.rowPortions.push(structuredClone(source));}]
])test(`replacement owner lineage rejects ${label} before passage ID allocation`,()=>{
 const {project,model}=previousGroup(),source=project.rowPortions.find(portion=>portion.id==='source');
 alter(project,source);const before=JSON.stringify(project);let allocated=0,error;
 try{passage.buildTerrainPassage({project,model,portionId:'child-2',sourceAxis:geographic([[6,-3],[6,13]]),widthM:1.5,groupId:'road',createId:()=>`replacement-owner-${++allocated}`});}catch(value){error=value;}
 assert.equal(allocated,0,'Invalid original-owner lineage must fail before createId');
 assert.equal(error?.status,'cut-scope-unresolved');
 assert.throws(()=>createCanonicalCutPhysicalDomain({project,model,scopePortionId:'source',groupId:'road'}),{status:'cut-scope-unresolved'});
 assert.equal(JSON.stringify(project),before);
});

test('replacement owner lineage accepts the actual same-group recipe on the reused original ID',()=>{
 const {project,model}=previousGroup(),before=JSON.stringify(project),budget=createTerrainBudget({kind:'cut'});
 const physical=createCanonicalCutPhysicalDomain({project,model,scopePortionId:'child-2',groupId:'road',budget});
 assert.equal(physical.modelHash,model.contentHash);
 const output=passage.buildTerrainPassage({project,model,portionId:'child-2',sourceAxis:geographic([[6,-3],[6,13]]),widthM:1.5,groupId:'road',createId:()=> 'lawful-replacement-owner',budget});
 assert.equal(output.cut.scopePortionId,'source');
 assert.deepEqual(output.cut.scopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 assert.equal(JSON.stringify(project),before);
});
