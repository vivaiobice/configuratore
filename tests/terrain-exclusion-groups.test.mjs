import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTerrainExclusionGroups,
  resolveTerrainExclusionPresentation,
  terrainExclusionContains,
  terrainSurfaceGroupMarkerPresent
} from '../src/terrain-exclusion-groups.js';

const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
const field=ring(0,0,10,10);
function fixture(){
  const raw=ring(3,-2,7,12);
  const owner={id:'a',passageGroupId:'road',type:'linear',surfaceGroupVersion:1,surfaceGroupOwner:true,
    geometry:structuredClone(raw),surfaceGeometry:{type:'MultiPolygon',coordinates:[[raw]]},
    surfaceGeometryConvention:'domain-intersection',surfaceConstructionPolicy:'native-supported-axis-clip-1',
    sourceAxis:[[5,-2],[5,12]],widthM:4,widthBasis:'model-surface',modelHash:'model',scopePortionId:'left',
    scopeGeometry:{type:'Polygon',coordinates:[ring(0,0,5,10)]}};
  return {owner,exclusions:[owner]};
}

// Catches promotion of raw construction members to literal physical land.
test('a scoped strip removes only its original physical portion and hides exterior construction',()=>{
  const {exclusions}=fixture();
  const resolved=resolveTerrainExclusionGroups({exclusions,field});
  assert.equal(terrainExclusionContains(resolved,[4,5]),true);
  assert.equal(terrainExclusionContains(resolved,[6,5]),false);
  assert.equal(terrainExclusionContains(resolved,[4,-1]),false);
  const views=resolveTerrainExclusionPresentation({exclusions,field});
  assert.equal(views.length,1);
  assert.equal(views[0].ownerId,'a');
  assert.equal(views[0].coordinateRole,'render-export-preview');
  assert.deepEqual(views[0].geometry.coordinates[0][0].slice(0,-1).sort(),[[3,0],[3,10],[5,0],[5,10]].sort());
  assert.equal(exclusions[0].geometry[0][1],-2);
});

test('a retained resolution cannot keep masking after its actual owner operands change',()=>{
  const {exclusions}=fixture();
  const resolved=resolveTerrainExclusionGroups({exclusions,field});
  exclusions[0].scopeGeometry.coordinates[0][1][0]=6;
  assert.throws(()=>terrainExclusionContains(resolved,[4,5]),{status:'invalid-surface-group'});
});

// Catches union shortcuts accepting a lost strip, overlapping interiors or an owner fallback.
test('group union and owner schema reject stale, missing, duplicate and unknown operands',()=>{
  for(const mutate of [
    xs=>{xs[0].geometry[1][0]=6;},
    xs=>{delete xs[0].surfaceGroupOwner;},
    xs=>{xs.push({...structuredClone(xs[0]),id:'b'});},
    xs=>{xs[0].surfaceConstructionPolicy='future-policy';},
    xs=>{delete xs[0].scopeGeometry;},
    xs=>{xs[0].surfaceGroupVersion=2;}
  ]){
    const {exclusions}=fixture();mutate(exclusions);
    assert.throws(()=>resolveTerrainExclusionGroups({exclusions,field}),{status:'invalid-surface-group'});
  }
});

// Catches treating construction seams as independent holes or filled canonical holes.
test('simple member seams cancel and canonical holes remain physical holes',()=>{
  const outer=ring(1,1,9,9),hole=ring(4,4,6,6);
  const parts=[ring(1,1,9,4),ring(1,6,9,9),ring(1,4,4,6),ring(6,4,9,6)];
  const exclusions=parts.map((geometry,i)=>({id:`p${i}`,passageGroupId:'literal',surfaceGroupVersion:1,geometry,
    ...(i?{}:{surfaceGroupOwner:true,surfaceGeometry:{type:'MultiPolygon',coordinates:[[outer,hole]]},surfaceGeometryConvention:'literal'})}));
  const resolved=resolveTerrainExclusionGroups({exclusions,field});
  assert.equal(terrainExclusionContains(resolved,[3,4]),true);
  assert.equal(terrainExclusionContains(resolved,[5,5]),false);
  const views=resolveTerrainExclusionPresentation({exclusions,field});
  assert.equal(views.length,1);
  assert.equal(views[0].geometry.coordinates[0].length,2);
});

test('absent group markers retain legacy item identity and do not invent metadata',()=>{
  const legacy={id:'legacy',geometry:ring(1,1,2,2)};
  const resolved=resolveTerrainExclusionGroups({exclusions:[legacy],field});
  assert.equal(resolved.legacy[0],legacy);
  assert.deepEqual(Object.keys(legacy),['id','geometry']);
});

test('per-item marker presence shares partial and unknown opt-in classification without converting legacy passages',()=>{
 assert.equal(terrainSurfaceGroupMarkerPresent({surfaceGroupVersion:99}),true);
 for(const key of ['surfaceGroupOwner','surfaceGeometry','surfaceGeometryConvention','surfaceConstructionPolicy'])assert.equal(terrainSurfaceGroupMarkerPresent({[key]:null}),true);
 assert.equal(terrainSurfaceGroupMarkerPresent({passageGroupId:'old',sourceAxis:[[0,0],[1,1]],widthM:1.5}),false);
 assert.equal(terrainSurfaceGroupMarkerPresent([[0,0],[1,1]]),false);
 assert.equal(terrainSurfaceGroupMarkerPresent(null),false);
});
