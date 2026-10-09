import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {terrainGeometryInputHash,createContourEnvelope,readTerrainEnvelope,hashTerrainEnvelope} from '../src/terrain-replay.js';
import {calculateProject} from '../src/project-calculator.js';

const historical=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8'));
const fresh=()=>{
  const old=structuredClone(historical.cases[0]);
  return {...old.project,terrain:{model:old.project.terrain.model,applied:createContourEnvelope({project:old.project,model:old.project.terrain.model,result:old.result,portionResults:old.envelope.portionResults,validation:old.envelope.validation})}};
};

// Catches selected-field omissions that let a changed schema borrow saved metrics.
test('new group and child recipe fields bind V2 geometric input without absent defaults',()=>{
  const project=fresh(),model=project.terrain.model,before=structuredClone(project);
  const hash=terrainGeometryInputHash(project,model);
  for(const key of ['surfaceGroupVersion','surfaceGroupOwner','surfaceGeometry','surfaceGeometryConvention','surfaceConstructionPolicy']){
    const changed=structuredClone(project);changed.exclusions=[{geometry:project.geometry,[key]:'changed'}];
    const plain=structuredClone(changed);delete plain.exclusions[0][key];
    assert.notEqual(terrainGeometryInputHash(changed,model),terrainGeometryInputHash(plain,model),key);
  }
  const recipe=structuredClone(project);recipe.rowPortions=[{id:'child',terrainScopeRecipe:{kind:'canonical-cut-child-1',groupId:'g',componentKey:'x'}}];
  const plain=structuredClone(recipe);delete plain.rowPortions[0].terrainScopeRecipe;
  assert.notEqual(terrainGeometryInputHash(recipe,model),terrainGeometryInputHash(plain,model));
  assert.equal(terrainGeometryInputHash(project,model),hash);
  assert.deepEqual(project,before);
});

test('rehashing a malformed marked group cannot reach saved applied quantities',()=>{
  for(const marker of [{surfaceGroupVersion:1,passageGroupId:'missing'},{surfaceGroupOwner:true}]){
    const project=fresh();project.exclusions=[{id:'bad',geometry:project.geometry,...marker}];
    const applied=project.terrain.applied;
    const rebound=createContourEnvelope({project,model:project.terrain.model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation});
    rebound.snapshotHash=hashTerrainEnvelope(rebound);project.terrain.applied=rebound;
    assert.equal(readTerrainEnvelope(project).terrainStatus,'invalid');
    assert.equal(calculateProject({...project,polygon:project.geometry}).rowCount,null);
  }
});

test('malformed group presence without terrain cannot fall through manual ring filtering',()=>{
  const result=calculateProject({polygon:[[0,0],[.001,0],[.001,.001],[0,.001],[0,0]],rowSpacingM:3,plantSpacingM:1,exclusions:[{surfaceGroupVersion:1,passageGroupId:'no-owner',geometry:null}]});
  assert.equal(result.terrainStatus,'invalid');
  assert.equal(result.rowCount,null);
});

// Hashing an unknown child recipe cannot turn an obsolete archive into authority.
test('rehashing an unknown or orphan canonical scope recipe cannot borrow saved metrics',()=>{
 for(const recipe of [{kind:'canonical-cut-physical-1',groupId:'g'},{kind:'future',groupId:'g',componentKey:'c'},{kind:'canonical-cut-child-1',groupId:'missing',componentKey:'c'}]){
  const project=fresh(),applied=project.terrain.applied;
  project.rowPortions=[{id:'orphan',terrainScopeRecipe:recipe}];
  project.terrain.applied=createContourEnvelope({project,model:project.terrain.model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation});
  assert.equal(readTerrainEnvelope(project).terrainStatus,'invalid');
 }
});

// This real literal group is wholly outside the unchanged verified field.
// Exact group/field intersection is empty, so the genuine cached quantities
// remain applicable. It has no native owner construction or child recipes.
test('valid V2 literal group without native child recipes preserves applied replay',async()=>{
 const {fromUTM}=await import('../src/coordinate-system.js?v=1.3.4');
 const {resolveTerrainExclusionGroups,terrainExclusionContains}=await import('../src/terrain-exclusion-groups.js?v=1.3.4');
 const {createTerrainBudget}=await import('../src/terrain-budget.js?v=1.3.4');
 const project=fresh(),applied=project.terrain.applied,beforeResult=structuredClone(applied.result);
 const geometry=[[50,50],[55,50],[55,55],[50,55],[50,50]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 project.exclusions=[...project.exclusions,{id:'literal-outside-field',passageGroupId:'literal-edited',surfaceGroupVersion:1,surfaceGroupOwner:true,geometry,surfaceGeometry:{type:'MultiPolygon',coordinates:[[geometry]]},surfaceGeometryConvention:'literal'}];
 const budget=createTerrainBudget({kind:'cut'}),resolved=resolveTerrainExclusionGroups({exclusions:project.exclusions,field:project.geometry,budget});
 assert.equal(resolved.groups.length,1);
 assert.equal(resolved.groups[0].owner.surfaceGeometryConvention,'literal');
 assert.equal(terrainExclusionContains(resolved,fromUTM([500020,5000020],32632)),false);
 assert.equal(project.rowPortions.some(portion=>portion.terrainScopeRecipe),false);
 project.terrain.applied=createContourEnvelope({project,model:project.terrain.model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation,budget});
 assert.deepEqual(readTerrainEnvelope(project,{budget}),beforeResult);
 assert.equal(calculateProject({...project,polygon:project.geometry}).rowCount,beforeResult.rowCount);
});
