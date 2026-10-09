import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRowPortions} from '../src/row-portions.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {resolveTerrainUsablePresentation,rankTerrainUsablePortionOverlaps} from '../src/terrain-exclusion-groups.js?v=1.3.6';
const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
function input({top=11,scope=ring(0,0,5,10)}={}){
 const polygon=ring(0,0,10,10),geometry=ring(4,-1,6,top);
 return {polygon,rowSpacingM:3,exclusions:[{id:'g',type:'linear',geometry,passageGroupId:'g',surfaceGroupVersion:1,surfaceGroupOwner:true,
 surfaceGeometry:{type:'MultiPolygon',coordinates:[[geometry]]},surfaceGeometryConvention:'domain-intersection',surfaceConstructionPolicy:'native-supported-axis-clip-1',
 sourceAxis:[[5,-1],[5,top]],widthM:1.5,widthBasis:'model-surface',modelHash:'fixture',scopePortionId:'original',scopeGeometry:{type:'Polygon',coordinates:[scope]}}]};
}

test('new scoped group portions use effective owner union rather than raw construction members',()=>{
 const project=input(),before=JSON.stringify(project),portions=resolveRowPortions(project);
 assert.equal(portions.length,2);
 assert.ok(portions.some(p=>Math.min(...p.geometry[0].map(point=>point[0]))===5));
 assert.equal(JSON.stringify(project),before);
 const recipe={kind:'canonical-cut-child-1',groupId:'g',componentKey:'selector'};
 const saved=portions.map((p,i)=>({...p,id:`saved-${i}`,...(i?{}:{terrainScopeRecipe:recipe})}));
 const again=resolveRowPortions({...project,rowPortions:saved});
 assert.deepEqual(again.map(p=>p.id),saved.map(p=>p.id));
 assert.deepEqual(again.find(p=>p.id==='saved-0').terrainScopeRecipe,recipe);
});

test('strict new group difference preserves a real connected bridge and keeps historical normalization separate',()=>{
 const project=input({top:9.9995,scope:ring(0,0,10,10)});
 assert.equal(resolveRowPortions(project).length,1);
 const metric=input({top:9.9995,scope:ring(0,0,10,10)}),owner=metric.exclusions[0],scale=ring=>ring.map(p=>p.map(v=>v*1e-5));
 metric.polygon=scale(metric.polygon);owner.geometry=scale(owner.geometry);owner.surfaceGeometry.coordinates=[[scale(owner.surfaceGeometry.coordinates[0][0])]];owner.scopeGeometry.coordinates=owner.scopeGeometry.coordinates.map(scale);owner.sourceAxis=scale(owner.sourceAxis);
 assert.equal(resolveRowPortions(metric).length,1);
 const legacy={...metric,exclusions:[owner.geometry]};
 assert.equal(resolveRowPortions(legacy).length,2);
});

test('unknown or malformed group presence fails before legacy topology cache or ring filtering',()=>{
 const project=input();resolveRowPortions(project);
 project.exclusions[0].surfaceGroupVersion=99;
 assert.throws(()=>resolveRowPortions(project),{status:'invalid-surface-group'});
 delete project.exclusions[0].surfaceGroupVersion;
 assert.throws(()=>resolveRowPortions(project),{status:'invalid-surface-group'});
});

test('strict identities rank the exact non-dyadic usable overlap instead of its rounded preview',()=>{
 const polygon=ring(0,0,2,1),raw=[[0,0],[2,0],[2,5],[1,5],[0,0]];
 const owner={id:'literal-owner',geometry:raw,passageGroupId:'literal',surfaceGroupVersion:1,surfaceGroupOwner:true,
  surfaceGeometry:{type:'MultiPolygon',coordinates:[[raw]]},surfaceGeometryConvention:'literal'};
 // Exact usable region is 0≤x≤y/5, 0≤y≤1, area1/10.
 // Both saved shapes contain that same whole region: an exact tie.
 // Display x=Number(1/5) lies strictly to the right of the true boundary.
 const saved=[{id:'z-wide',geometry:[polygon]},{id:'a-source-edge',geometry:[[[0,0],[1,5],[0,5],[0,0]]]}];
 const portions=resolveRowPortions({polygon,exclusions:[owner],rowPortions:saved});
 assert.equal(portions.length,1);
 assert.equal(portions[0].id,'a-source-edge');
 assert.equal(portions[0].geometry[0].some(p=>p[0]===.2&&p[1]===1),true);
 const top=1-2**-53,notch=[[0,0],[2,0],[2,1],[1/128,1],[1/128,top],[0,top],[0,0]];
 // Independent rational oracle: whole area1/10 exceeds notched area
 // 1/10−(1/128)*2^-53=1/10−2^-60, despite the rounded order.
 const exactWhole={n:1n,d:10n},exactNotched={n:2n**60n-10n,d:10n*2n**60n};
 assert.ok(exactWhole.n*exactNotched.d>exactNotched.n*exactWhole.d);
 const nearTie=resolveRowPortions({polygon,exclusions:[owner],rowPortions:[{id:'a-notch',geometry:[notch]},{id:'z-whole',geometry:saved[1].geometry}]});
 assert.equal(nearTie[0].id,'z-whole');
});

test('exact usable ranking requires original unchanged presentation operands and the same budget',()=>{
 const project=input(),budget=createTerrainBudget({kind:'cut'}),options={field:project.polygon,exclusions:project.exclusions,budget};
 const view=resolveTerrainUsablePresentation(options),saved=[{id:'all',geometry:[project.polygon]}];
 const pairs=rankTerrainUsablePortionOverlaps(view,saved,{budget});
 assert.ok(Object.isFrozen(pairs)&&pairs.every(Object.isFrozen));
 assert.equal(pairs.length,2);
 assert.throws(()=>rankTerrainUsablePortionOverlaps(structuredClone(view),saved,{budget}),{status:'invalid-surface-group'});
 assert.throws(()=>rankTerrainUsablePortionOverlaps(view,saved,{budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-surface-group'});
 project.polygon[0][0]=-.01;
 assert.throws(()=>rankTerrainUsablePortionOverlaps(view,saved,{budget}),{status:'invalid-surface-group'});
});
