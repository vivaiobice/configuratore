import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM,toUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createCanonicalCutPhysicalDomain,deriveCanonicalCutScopes,canonicalCutDomainScope} from '../src/terrain-contour-domain.js?v=1.3.5';
import {createRegularTerrainRegionOperations} from '../src/terrain-surface-bands.js?v=1.3.5';
import {buildTerrainPassage} from '../src/terrain-passage.js?v=1.3.5';
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function fixture(){
 const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited'}];
 project.exclusions=[{id:'triangle',geometry:geographic([[-1,1],[8,4],[8,5],[-1,1]])}];
 return {project,model};
}
function required(budget){const op=createRegularTerrainRegionOperations({budget});assert.equal(typeof op.readCanonicalDomain,'function');return op;}
function mapGeometry(geometry,transform){return {type:geometry.type,coordinates:geometry.type==='Polygon'?geometry.coordinates.map(ring=>ring.map(transform)):geometry.coordinates.map(polygon=>polygon.map(ring=>ring.map(transform)))};}

test('canonical reader preserves fractional native and geographic physical boundaries rather than a rounded geometry DTO',()=>{
 const budget=createTerrainBudget({kind:'cut'}),op=required(budget),{project,model}=fixture();
 const domain=createCanonicalCutPhysicalDomain({project,model,scopePortionId:'source',budget}),scope=canonicalCutDomainScope(domain);
 assert.ok(scope.boundaries.flatMap(ring=>ring.coordinates).flat().some(q=>(q.d&(q.d-1n))!==0n));
 for(const coordinateRole of ['native','geographic']){
  const transform=coordinateRole==='native'?point=>toUTM(point,32632):point=>point;
  const field=op.read(mapGeometry({type:'Polygon',coordinates:[project.geometry]},transform));
  const restriction=op.read(mapGeometry({type:'Polygon',coordinates:[project.exclusions[0].geometry]},transform));
  const expected=op.operation(field,restriction,'difference'),actual=op.readCanonicalDomain(domain,{coordinateRole});
  assert.equal(op.sameSet(actual,expected),true);
  assert.equal(op.compareAreas(actual,expected),0);
 }
});

test('canonical child reader preserves complete actual source/road partition in both coordinate roles',()=>{
 const budget=createTerrainBudget({kind:'cut'}),op=required(budget),{project,model}=fixture();
 const passage=buildTerrainPassage({project,model,portionId:'source',sourceAxis:geographic([[5,-3],[5,13]]),widthM:1.5,groupId:'road',budget});
 const candidate={...project,exclusions:passage.exclusions},scopes=deriveCanonicalCutScopes({project:candidate,model,groupId:'road',budget});
 for(const coordinateRole of ['native','geographic']){
  const children=scopes.children.map(child=>op.readCanonicalDomain(child.domain,{coordinateRole}));
  let union=[];
  for(const child of children){assert.equal(!!op.hasInterior(op.operation(union,child)),false);union=op.operation(union,child,'union');}
  const physical=op.readCanonicalDomain(scopes.physicalDomain,{coordinateRole});
  const transform=coordinateRole==='native'?point=>toUTM(point,32632):point=>point;
  const rawRoad=op.read(mapGeometry(passage.cut.geometry,transform));
  assert.equal(op.sameSet(op.operation(union,op.operation(physical,rawRoad),'union'),physical),true);
 }
});

test('canonical reader rejects copied and ordinary identity, unknown roles and exhausted pre-copy budget',()=>{
 const budget=createTerrainBudget({kind:'cut'}),op=required(budget),{project,model}=fixture();
 const domain=createCanonicalCutPhysicalDomain({project,model,scopePortionId:'source',budget});
 assert.throws(()=>op.readCanonicalDomain({...domain},{coordinateRole:'native'}));
 assert.throws(()=>op.readCanonicalDomain({geometry:domain.geometry},{coordinateRole:'native'}));
 assert.throws(()=>op.readCanonicalDomain(domain,{coordinateRole:'preview'}));
 const deltas=[],stopped=Object.assign(new Error('copy blocked'),{status:'budget-exceeded'});
 const blocked=createRegularTerrainRegionOperations({budget:{check(delta=0){deltas.push(delta);if(delta)throw stopped;}}});
 assert.throws(()=>blocked.readCanonicalDomain(domain,{coordinateRole:'native'}),error=>error===stopped);
 assert.equal(deltas.filter(delta=>delta>0).length,1);
 assert.equal(deltas.find(delta=>delta>0),canonicalCutDomainScope(domain).boundaries.reduce((sum,ring)=>sum+ring.coordinates.length,0));
});
