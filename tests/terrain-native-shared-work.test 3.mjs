import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createContourDomain,readAcquiredNativeSupport} from '../src/terrain-contour-domain.js';
import {fromUTM} from '../src/coordinate-system.js';

test('independent native scopes share actual acquired support while fresh budgets account it once',()=>{
 const n=65,model=createTerrainModel({acquiredAt:'2026-10-08T00:00:00.000Z',grid:{width:n,height:n,origin:[499900,5000220],step:[5,-5],values:Array.from({length:n*n},(_,i)=>Math.fround(120+.31*(220-Math.floor(i/n)*5)+.02*Math.sin(i*.37)))}});
 const ring=(x,y)=>[[x,y],[x+20,y],[x+20,y+20],[x,y+20],[x,y]].map(([a,b])=>fromUTM([500000.37+a,5000000.63+b],32632));
 const budget=createTerrainBudget({kind:'adapt'}),left=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring(0,0)]},budget}),right=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring(25,0)]},budget});
 const a=readAcquiredNativeSupport(left,{budget}),b=readAcquiredNativeSupport(right,{budget});
 assert.equal(a,b,'two scopes of the same actual immutable native mesh must borrow one support owner');
 const fresh=createTerrainBudget({kind:'adapt'}),before=fresh.usage().nodeCount;
 assert.equal(readAcquiredNativeSupport(left,{budget:fresh}),a);assert.equal(readAcquiredNativeSupport(right,{budget:fresh}),a);
 assert.equal(fresh.usage().nodeCount-before,n*n);
 assert.throws(()=>readAcquiredNativeSupport({...left},{budget:fresh}));
 assert.ok(budget.usage().nodeCount<20000,`small independent scopes should not construct all native triangle XY arrays: ${budget.usage().nodeCount}`);
});

test('producer-owned actual finite source proof is reused only for identical bound inputs',async()=>{
 const {traceFinitePolylineContourLevel,resolveFinitePolylineSourceAxis}=await import('../src/terrain-polyline-source.js');
 const {exactDomain}=await import('../src/terrain-exact.js?v=1.3.5');
 const n=9,model=createTerrainModel({acquiredAt:'2026-10-08T00:00:00.000Z',grid:{width:n,height:n,origin:[499990,5000030],step:[5,-5],values:Array.from({length:n*n},(_,i)=>Math.fround(120+.31*(30-Math.floor(i/n)*5)+.02*Math.sin(i*.37)))}});
 const geometry={type:'Polygon',coordinates:[[[500000.3,5000000.7],[500020.4,5000000.7],[500020.4,5000020.8],[500000.3,5000020.8],[500000.3,5000000.7]].map(p=>fromUTM(p,32632))]};
 const budget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry,budget}),axis=traceFinitePolylineContourLevel(domain,123.7,{portionId:'one',ordinal:2,budget}).axes[0];
 assert.ok(axis);const before=budget.usage().nodeCount;
 const result=resolveFinitePolylineSourceAxis(exactDomain(domain,budget),axis,budget);
 assert.ok(result.pieces.length);assert.ok(budget.usage().nodeCount-before<50,`source was independently regenerated but existing private geometric proof should be retained: ${budget.usage().nodeCount-before}`);
 const edited=structuredClone(axis);edited.components[0].coordinatesXY[1][1]+=.001;
 assert.throws(()=>resolveFinitePolylineSourceAxis(exactDomain(domain,budget),edited,budget));
 const fresh=createTerrainBudget({kind:'adapt'}),cold=resolveFinitePolylineSourceAxis(exactDomain(domain,fresh),structuredClone(axis),fresh);
 assert.equal(cold.pieces.length,result.pieces.length);assert.ok(fresh.usage().nodeCount>50);
});
