import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {measureSurfaceFootprint} from '../src/terrain-surface-bands.js?v=1.3.3';
const api=existsSync(new URL('../src/terrain-contour-family.js',import.meta.url))?await import('../src/terrain-contour-family.js'):{};
const make=(height,geometryXY)=>{const f=contourFixture({height,geometryXY});return {f,domain:createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry]}})};};
const family=options=>{assert.equal(typeof api.buildContourFamily,'function');return api.buildContourFamily(options);};
test('uniform plane stays straight with 3 m ground pitch and searches beyond the central phase',()=>{
 const {domain}=make((x,y)=>y/5,[[0,0],[12,0],[12,9.8/Math.sqrt(1.04)],[0,9.8/Math.sqrt(1.04)],[0,0]]);
 const r=family({domain,portion:{id:'p'},reference:{orientationDeg:42},spacingM:3,referenceAreaM2:200});
 assert.equal(r.ok,true,JSON.stringify(r));
 const levels=r.axes.map(a=>a.levelM);
 for(let i=1;i<levels.length;i++)assert.ok(Math.abs((levels[i]-levels[i-1])*5-3/Math.sqrt(1.04))<.001);
 for(const axis of r.axes)for(const c of axis.components)assert.ok(c.coordinatesXY.every(p=>Math.abs(p[1]-c.coordinatesXY[0][1])<1e-8));
 assert.ok(r.validation.maxElevationDeviationM<=.001);
 assert.ok(r.coverage.servedAreaM2>117.5);
 assert.equal(r.coverage.referenceAreaM2,200);
 assert.ok(r.diagnostics.candidates.length>1);
 assert.deepEqual(r.axes.map(a=>a.ordinal),r.axes.map((_,i)=>i));
 assert.doesNotThrow(()=>JSON.stringify(r));
 assert.equal('areaMeasurement' in r,false);
});
test('flat field preserves compatible manual phase and geographic endpoints',()=>{
 const {domain}=make(()=>0,[[0,0],[12,0],[12,12],[0,12],[0,0]]);
 const rows=[2,5,8,11].map(y=>{const coordinatesXY=[[500000.5,5000000+y],[500011.5,5000000+y]],coordinates=coordinatesXY.map(p=>fromUTM(p));return {coordinatesXY,coordinates,start:coordinates[0],end:coordinates[1],lengthM:11};});
 const r=family({domain,portion:{id:'flat'},reference:{rows},spacingM:3});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.rows.map(r=>[r.start,r.end]),rows.map(r=>[r.start,r.end]));
});
function measuredCandidate(id,width,height=1,gradient=[0,0],surfaceLengthM=1){
 const vertices=[[0,0],[20,0],[0,20],[20,20]].map(([x,y])=>[x,y,gradient[0]*x+gradient[1]*y]);
 const faces=[[0,1,2],[1,3,2]].map((ids,id)=>({id,vertexIds:ids,vertices:ids.map(i=>vertices[i]),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':'))}));
 const domain={faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,coordinatesXY:[[0,0],[20,0],[20,20],[0,20],[0,0]]}]};
 const geometryXY={type:'MultiPolygon',coordinates:[[[[0,0],[width,0],[width,height],[0,height],[0,0]]]]};
 const areaMeasurement=measureSurfaceFootprint({domain,geometryXY,areaMode:'constant-plane'});
 return {id,valid:true,areaMeasurement,coverage:{servedAreaM2:areaMeasurement.areaM2,areaBoundsM2:areaMeasurement.areaBoundsM2,referenceAreaM2:100},metrics:{surfaceLengthM}};
}

test('candidate ranking maximizes absolute measured served area with a fixed denominator',()=>{
 const a=measuredCandidate('a',9,10,[0,0],10),b=measuredCandidate('b',8.5,10,[0,0],100);
 b.coverage.referenceAreaM2=90;
 assert.equal(api.rankContourCandidates([b,a])[0].id,'a');
});

test('overlapping initial enclosures require a proved actual area order before secondary length',()=>{
 const a=measuredCandidate('smaller',1+2**-52,1-2**-52,[0,0],100),b=measuredCandidate('larger',1,1,[0,0],1);
 assert.ok(a.coverage.areaBoundsM2[1]>=b.coverage.areaBoundsM2[0]);
 assert.equal(api.rankContourCandidates([a,b])[0].id,'larger');
 const root=measuredCandidate('root',1,1,[1,0],100),rounded=measuredCandidate('rounded',Math.SQRT2,1,[0,0],1);
 assert.ok(root.coverage.areaBoundsM2[1]>=rounded.coverage.areaBoundsM2[0]);
 assert.equal(api.rankContourCandidates([root,rounded])[0].id,'rounded');
});

test('proved square-related equality permits secondary length without serializing exact evidence',()=>{
 const a=measuredCandidate('short',3,1,[1,0],1),b=measuredCandidate('long',1,1,[1,4],2);
 assert.equal(api.rankContourCandidates([a,b])[0].id,'long');
 assert.doesNotThrow(()=>JSON.stringify([a.areaMeasurement,b.areaMeasurement]));
 const copied={...b,areaMeasurement:structuredClone(b.areaMeasurement)};
 assert.throws(()=>api.rankContourCandidates([a,copied]),{status:'area-order-unresolved'});
 b.areaMeasurement.actualGeometry.geometryXY.coordinates[0][0][0][0]+=1;
 assert.throws(()=>api.rankContourCandidates([a,b]),{status:'area-order-unresolved'});
});

test('insufficient refinement or the shared comparison budget returns explicit unresolved order',()=>{
 const a=measuredCandidate('root',1,1,[1,0],100),b=measuredCandidate('rounded',Math.SQRT2,1,[0,0],1);
 assert.throws(()=>api.rankContourCandidates([a,b],{maxRefinementBits:32}),{status:'area-order-unresolved'});
 const budget={check(){throw Object.assign(new Error('budget stop'),{status:'budget-exceeded'});}};
 assert.throws(()=>api.rankContourCandidates([a,b],{budget}),{status:'area-order-unresolved'});
});
test('shared budget exit returns no applicable partial family',()=>{
 const {domain}=make((x,y)=>y/5);
 const r=family({domain,portion:{id:'p'},reference:{},spacingM:3,budget:createTerrainBudget({kind:'adapt',deadlineMs:0})});
 assert.equal(r.ok,false);assert.equal(r.status,'budget-exceeded');assert.equal(r.rows,undefined);assert.equal(r.coverage,undefined);
});

test('variable profile changes height increments and certifies each actual level',()=>{
 const {domain}=make((x,y)=>y<=5?y/4:1.25+(y-5)/2,[[0,0],[8,0],[8,12],[0,12],[0,0]]);
 const r=family({domain,portion:{id:'profile'},reference:{},spacingM:3});
 assert.equal(r.ok,true,JSON.stringify({status:r.status,candidates:r.diagnostics.candidates.map(c=>({id:c.id,valid:c.valid,critical:c.validation?.critical?.slice(0,1),unresolved:c.validation?.unresolved?.slice(0,1)}))}));
 assert.ok(r.axes.length>=4);
 assert.ok(r.validation.maxElevationDeviationM<=.001);
 assert.ok(r.validation.lowerM>=2.8&&r.validation.upperM<=3.2);
 const deltas=r.axes.slice(1).map((a,i)=>a.levelM-r.axes[i].levelM);
 assert.ok(Math.max(...deltas)-Math.min(...deltas)>.2);
});


test('an overlap chain without measured evidence cannot select an applicable winner',()=>{
 const candidate=(id,bounds,surfaceLengthM)=>({id,valid:true,coverage:{areaBoundsM2:bounds},metrics:{surfaceLengthM}});
 const items=[candidate('high',[3,5],1),candidate('middle',[1,4],2),candidate('low',[0,2],3)];
 for(const order of [items,[...items].reverse(),[items[1],items[2],items[0]]])assert.throws(()=>api.rankContourCandidates(order),{status:'area-order-unresolved'});
});
test('measured overlap chains preserve the proved area order in every input order',()=>{
 const high=measuredCandidate('high',1+2**-52,1,[0,0],1);
 const middle=measuredCandidate('middle',1+2**-52,1-2**-53,[0,0],2);
 const low=measuredCandidate('low',1,1,[0,0],3);
 assert.ok(middle.coverage.areaBoundsM2[0]<=low.coverage.areaBoundsM2[1]);
 assert.ok(middle.coverage.areaBoundsM2[1]>=high.coverage.areaBoundsM2[0]);
 for(const order of [[low,middle,high],[high,middle,low],[middle,low,high]])assert.deepEqual(api.rankContourCandidates(order).map(c=>c.id),['high','middle','low']);
});

function scaleFixture(size,twoSlopes){
 const width=size/5+5,origin=[499990,5000000+size+10];
 const modelOptions={acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width,height:width,origin,step:[5,-5],values:Array.from({length:width*width},(_,i)=>{
  const y=size+10-Math.floor(i/width)*5;
  return twoSlopes?(y<=20?y/4:5+(y-20)/2):y/5;
 })}};
 const geometry={type:'Polygon',coordinates:[[[0,0],[size,0],[size,size],[0,size],[0,0]].map(([x,y])=>fromUTM([500000+x,5000000+y]))]};
 return {modelOptions,geometry};
}
for(const [size,twoSlopes,minRows] of [[100,false,34],[40,true,14]])test(`complete ${size} m ${twoSlopes?'two-slope':'plane'} family fits a single live 30 s / 500k budget`,async t=>{
 const {createTerrainModel}=await import('../src/terrain-model.js');
 const {modelOptions,geometry}=scaleFixture(size,twoSlopes),model=createTerrainModel(modelOptions);
 const base=createTerrainBudget({kind:'adapt'});let nodes=0;
 const budget={...base,check(n=0){nodes+=n;base.check(n);}};
 const began=performance.now(),domain=createContourDomain({model,geometry,budget});
 const r=family({domain,portion:{id:'scale'},spacingM:3,budget});
 assert.equal(r.ok,true,JSON.stringify({status:r.status,message:r.diagnostics.message,candidates:r.diagnostics.candidates.map(c=>({id:c.id,valid:c.valid}))}));
 assert.ok(r.rows.length>=minRows);assert.ok(nodes<=500000);assert.ok(performance.now()-began<30000);
 assert.equal(r.validation.coverage.complete,true);assert.ok(r.diagnostics.candidates.length>=2);
 if(twoSlopes){
  const u=y=>y<=20?y*Math.sqrt(17)/4:5*Math.sqrt(17)+(y-20)*Math.sqrt(5)/2;
  const intervals=r.axes.map(a=>{const y=a.components[0].coordinatesXY[0][1]-5000000;return [Math.max(0,u(y)-1.5),Math.min(u(40),u(y)+1.5)];}).sort((a,b)=>a[0]-b[0]);
  let total=0,end=0;for(const [lo,hi] of intervals){total+=Math.max(0,hi-Math.max(end,lo));end=Math.max(end,hi);}
  assert.ok(Math.abs(r.coverage.servedAreaM2-total*40)<.003);
 }
 t.diagnostic(JSON.stringify({rows:r.rows.length,nodes,elapsedMs:performance.now()-began,candidates:r.diagnostics.candidates.map(c=>({id:c.id,valid:c.valid,pruned:c.pruned}))}));
});

for(const reason of ['time','work'])test(`optional next candidate ${reason} spike preserves only the completely certified incumbent`,()=>{
 const {domain}=make((x,y)=>y/5,[[0,0],[12,0],[12,9.8/Math.sqrt(1.04)],[0,9.8/Math.sqrt(1.04)],[0,0]]);
 let now=0,optionalCalls=0;const base=createTerrainBudget({kind:'adapt',clock:()=>now});
 const budget={...base,withReserve(reserve,callback){optionalCalls++;return base.withReserve(reserve,()=>{
  if(reason==='time')now=30000-reserve.remainingMs;
  else base.check(500000-reserve.nodeCount-base.usage().nodeCount+1);
  return callback();
 });}};
 const r=family({domain,portion:{id:'p'},spacingM:3,budget});
 assert.equal(optionalCalls,1);assert.equal(r.ok,true,JSON.stringify(r.diagnostics));
 assert.equal(r.diagnostics.searchComplete,false);assert.equal(r.diagnostics.optionalSearchStop.reason,'completion-reserve-interruption');
 assert.equal(r.diagnostics.optionalSearchStop.budgetReason,reason);
 assert.equal(r.diagnostics.candidates.filter(c=>c.valid===true).length,1);
 assert.equal(r.diagnostics.candidates.filter(c=>c.incomplete).length,1);
 assert.equal(r.diagnostics.selectedCandidateId,'candidate:0');
 assert.ok(r.validation.valid);assert.ok(r.validation.maxElevationDeviationM<=.001);
 assert.ok(r.validation.lowerM>=2.8&&r.validation.upperM<=3.2);budget.check();
 assert.ok(budget.remainingMs()>0);assert.ok(budget.usage().nodeCount<=500000);
});

test('a certified explicit singleton reserves completion before the first scheduled progression',()=>{
 const {domain}=make((x,y)=>y/5,[[0,0],[12,0],[12,9.8/Math.sqrt(1.04)],[0,9.8/Math.sqrt(1.04)],[0,0]]);
 let now=0,optionalCalls=0;const base=createTerrainBudget({kind:'adapt',clock:()=>now});
 const budget={...base,withReserve(reserve,callback){optionalCalls++;return base.withReserve(reserve,()=>{now=30000-reserve.remainingMs;return callback();});}};
 const r=family({domain,portion:{id:'p'},spacingM:3,candidateGeneration:{kind:'scoped-cut-1',singleLevelM:1},budget});
 assert.equal(r.ok,true,JSON.stringify(r.diagnostics));assert.equal(optionalCalls,1);
 assert.equal(r.diagnostics.searchComplete,false);assert.equal(r.diagnostics.selectedCandidateId,'scoped-cut:single-level');
 assert.equal(r.diagnostics.candidates.filter(c=>c.valid===true).length,1);
 assert.equal(r.diagnostics.candidates.find(c=>c.id==='candidate:0')?.incomplete,true);
 assert.deepEqual(r.diagnostics.optionalSearchStop.skippedCandidateIds,['candidate:0','candidate:1']);
 budget.check();assert.ok(budget.remainingMs()>0);
});
