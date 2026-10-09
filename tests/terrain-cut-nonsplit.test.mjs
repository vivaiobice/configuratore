import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM} from '../src/coordinate-system.js';
import {buildTerrainPassage} from '../src/terrain-passage.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {deriveCanonicalCutScopes,createCanonicalCutChildDomain,createCanonicalCutPhysicalDomain,canonicalCutDomainScope} from '../src/terrain-contour-domain.js';
import {measureDomainSurfaceArea,compareMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.5';
import {resolveRowPortions} from '../src/row-portions.js';
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));

test('one paired remainder with an actual hole reloads by canonical selector without claiming split eligibility',()=>{
 const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]}),budget=createTerrainBudget({kind:'cut'});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited'}];
 const passage=buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,3],[5,7]]),widthM:1.5,groupId:'internal',budget});
 const candidate={...project,exclusions:passage.exclusions},scopes=deriveCanonicalCutScopes({project:candidate,model,groupId:'internal',budget});
 assert.equal(scopes.children.length,1);
 assert.equal(scopes.isSplit,false);
 assert.equal(canonicalCutDomainScope(scopes.children[0].domain).boundaries.filter(ring=>ring.hole).length,1);
 const reloaded=JSON.parse(JSON.stringify(candidate)),restored=createCanonicalCutChildDomain({project:reloaded,model,recipe:scopes.children[0].recipe,budget});
 assert.equal(compareMeasuredSurfaceAreas(measureDomainSurfaceArea({domain:scopes.children[0].domain,budget}),measureDomainSurfaceArea({domain:restored,budget}),{budget}),0);
});

test('replacement pre-road scope comes from old owner and excludes G rather than using inherited child preview',()=>{
 const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]}),budget=createTerrainBudget({kind:'cut'});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited'}];
 const first=buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,-3],[5,13]]),widthM:2,groupId:'road',budget});
 const current={...project,exclusions:first.exclusions},scopes=deriveCanonicalCutScopes({project:current,model,groupId:'road',budget});
 current.rowPortions=scopes.children.map((child,index)=>({id:index?'child-2':'source',geometry:child.domain.geometry.coordinates,terrainScopeRecipe:child.recipe}));
 const preRoad=createCanonicalCutPhysicalDomain({project:current,model,scopePortionId:'child-2',groupId:'road',budget});
 assert.deepEqual(canonicalCutDomainScope(preRoad).sourceScopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 assert.ok(Math.abs(measureDomainSurfaceArea({domain:preRoad,budget}).areaM2-100)<1e-5);
 const replacement=buildTerrainPassage({project:current,model,portionId:'child-2',sourceAxis:geographic([[6,-3],[6,13]]),widthM:2,groupId:'road',budget});
 assert.equal(replacement.cut.scopePortionId,'source');
 assert.equal(replacement.cut.widthM,2);
 assert.deepEqual(replacement.cut.scopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 assert.equal(replacement.exclusions.filter(item=>item.surfaceGroupOwner).length,1);
 const saved=JSON.stringify(current),explicitWidth=buildTerrainPassage({project:current,model,portionId:'child-2',sourceAxis:geographic([[6,-3],[6,13]]),widthM:1.5,groupId:'road',budget});
 assert.equal(explicitWidth.cut.widthM,1.5);
 assert.equal(current.exclusions.find(item=>item.surfaceGroupOwner).widthM,2);
 assert.equal(JSON.stringify(current),saved);
});

test('actual field fallback accepts its uniquely resolved ID and never a caller scope override',()=>{
 const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]}),budget=createTerrainBudget({kind:'cut'});
 const [portion]=resolveRowPortions({polygon:project.geometry});
 const domain=createCanonicalCutPhysicalDomain({project,model,scopePortionId:portion.id,budget});
 assert.deepEqual(canonicalCutDomainScope(domain).sourceScopeGeometry,{type:'Polygon',coordinates:[project.geometry]});
 assert.throws(()=>createCanonicalCutPhysicalDomain({project,model,scopePortionId:'invented',scopeGeometry:{type:'Polygon',coordinates:[project.geometry]},budget}),{status:'cut-scope-unresolved'});
});
