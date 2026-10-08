import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {fromUTM,toUTM} from '../src/coordinate-system.js';
import {traceFinitePolylineContourLevel,resolveFinitePolylineSourceAxis} from '../src/terrain-polyline-source.js?v=1.3.3';
import {exactDomain} from '../src/terrain-exact.js?v=1.3.3';
const ring=pts=>pts.map(([x,y])=>fromUTM([500000.37+x+.07*y,5000000.63+y]));
function fixture(){
 const n=65,model=createTerrainModel({acquiredAt:'2026-10-08T00:00:00.000Z',grid:{width:n,height:n,origin:[499900,5000220],step:[5,-5],values:Array.from({length:n*n},(_,i)=>{const y=220-Math.floor(i/n)*5;return y<30?y/4:7.5+(y-30)/3;})}});
 const budget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring([[0,0],[60,0],[60,60],[0,60],[0,0]])]},budget});
 return {domain,budget,model};
}
test('straight native contour geometry is serialized without redundant exact collinear knots',()=>{
 const {domain,budget}=fixture(),traced=traceFinitePolylineContourLevel(domain,2,{portionId:'p',budget});
 assert.deepEqual(traced.diagnostics,[]);assert.equal(traced.axes.length,1);
 assert.equal(traced.axes[0].components[0].coordinatesXY.length,2);
 const axis=traced.axes[0],resolved=resolveFinitePolylineSourceAxis(exactDomain(domain,budget),axis,budget);
 assert.ok(resolved.pieces.length>20,'all native support transitions are still integrated');
 assert.equal(resolved.uncovered.length,0);
 assert.deepEqual(axis.components[0].coordinates.map(p=>toUTM(p)),axis.components[0].coordinatesXY);
});

test('captured 1.3.2 dense source replays identical native fragments and ground length',async()=>{
 const {readFile}=await import('node:fs/promises'),{exactPieceLengthBounds}=await import('../src/terrain-axis-geometry.js?v=1.3.3');
 const saved=JSON.parse(await readFile(new URL('./fixtures/terrain-dense-v132-source.json',import.meta.url),'utf8'));
 const model=createTerrainModel(saved.modelOptions),budget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry:saved.geometry,budget});
 const before=JSON.stringify(saved.axis),resolved=resolveFinitePolylineSourceAxis(exactDomain(domain,budget),saved.axis,budget);
 assert.ok(saved.axis.components[0].coordinatesXY.length>2);
 assert.equal(resolved.pieces.length,saved.pieceCount);
 assert.deepEqual(exactPieceLengthBounds(resolved.pieces,budget),saved.lengthBoundsM);
 assert.equal(JSON.stringify(saved.axis),before);
});

test('operation evidence cannot be poisoned or reused after submitted input mutation or a fresh budget',()=>{
 const {domain,budget}=fixture(),axis=traceFinitePolylineContourLevel(domain,2,{portionId:'p',budget}).axes[0],kernel=exactDomain(domain,budget);
 const first=resolveFinitePolylineSourceAxis(kernel,axis,budget),count=first.pieces.length,nodes=budget.usage().nodeCount;
 first.pieces=[];
 const repeated=resolveFinitePolylineSourceAxis(kernel,axis,budget);
 assert.equal(repeated.pieces.length,count);assert.ok(budget.usage().nodeCount-nodes<10);
 assert.throws(()=>{repeated.pieces[0].a[0].n=0n;},TypeError);
 const changed=structuredClone(axis);changed.components[0].coordinates[0][0]+=.00001;changed.components[0].coordinatesXY[0]=toUTM(changed.components[0].coordinates[0]);
 assert.throws(()=>resolveFinitePolylineSourceAxis(kernel,changed,budget),{status:'axis-geometry-unresolved'});
 assert.throws(()=>resolveFinitePolylineSourceAxis(kernel,axis,createTerrainBudget({kind:'adapt',initialNodeCount:499999})),{status:'budget-exceeded'});
});


test('child scopes share only the complete original source while retaining distinct scope bindings',()=>{
 const {domain:originalDomain,budget,model}=fixture();
 const child=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring([[0,0],[30,0],[30,25],[0,25],[0,0]])]},budget});
 const original=traceFinitePolylineContourLevel(originalDomain,2,{portionId:'p',budget}).axes[0];
 const scoped=traceFinitePolylineContourLevel(child,2,{originalDomain,portionId:'p',budget}).axes[0];
 assert.strictEqual(original.components,scoped.components);
 assert.ok(Object.isFrozen(scoped.components));
 assert.notEqual(scoped.axisGeometryBinding.scopeHash,original.axisGeometryBinding.scopeHash);
 assert.equal(scoped.axisGeometryBinding.originalScopeHash,original.axisGeometryBinding.originalScopeHash);
 const resolved=resolveFinitePolylineSourceAxis(exactDomain(child,budget),scoped,budget,{originalDomain});
 assert.ok(resolved.pieces.length>0);assert.equal(resolved.uncovered.length,0);
 assert.throws(()=>resolveFinitePolylineSourceAxis(exactDomain(child,budget),original,budget,{originalDomain}),{status:'axis-geometry-unresolved'});
});
