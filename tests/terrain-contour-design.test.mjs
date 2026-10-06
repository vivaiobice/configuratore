import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {buildTerrainProposal} from '../src/terrain-design.js';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {toUTM} from '../src/coordinate-system.js';
import {resolveRowPortions} from '../src/row-portions.js';
import {calculateProject} from '../src/project-calculator.js';
import {legacyTerrainInputs,readTerrainEnvelope} from '../src/terrain-replay.js';
const api=existsSync(new URL('../src/terrain-contour-design.js',import.meta.url))?await import('../src/terrain-contour-design.js'):{};
test('explicit contour algorithm dispatches to a V2 proposal',()=>{
 assert.equal(typeof api.buildContourTerrainProposal,'function');
 const input=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
 const r=buildTerrainProposal({...input,algorithmVersion:'terrain-contour-family-1'});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.terrain.applied.algorithmVersion,'terrain-contour-family-1');
 assert.equal(r.terrain.applied.schemaVersion,2);
 assert.ok(r.terrain.applied.validation.maxElevationDeviationM<=.001);
});

test('axes and physical fragments differ while ground trim precedes exclusions',()=>{
 assert.equal(typeof api.measureContourAxes,'function');
 const {project,model}=contourFixture({height:(x,y)=>y/2,exclusionsXY:[[[0,19],[40,19],[40,21],[0,21],[0,19]]]});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]}});
 const physicalDomain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry,...project.exclusions]}});
 const axes=[{axisId:'source',portionId:'p',ordinal:0,components:[{coordinatesXY:[[500010,5000000],[500010,5000040]]}]}];
 const r=api.measureContourAxes({domain,physicalDomain,axes,headlandWidthM:2});
 assert.equal(r.rows.length,2);
 for(const row of r.rows){assert.equal(row.axisId,'source');assert.ok(Math.abs(row.surfaceLengthM-(19*Math.sqrt(1.25)-2))<1e-7);}
 assert.ok(Math.abs(toUTM(r.rows[0].start)[1]-5000000-2/Math.sqrt(1.25))<1e-6);
 assert.ok(Math.abs(toUTM(r.rows[1].end)[1]-5000040+2/Math.sqrt(1.25))<1e-6);
});

test('manual measure lifts every native face without imposing a constant elevation',()=>{
 assert.equal(typeof api.measureContourAxes,'function');
 const {project,model}=contourFixture({height:x=>x<=5?x:10-x,geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]}});
 const axes=[{axisId:'ridge',portionId:'p',ordinal:0,components:[{coordinatesXY:[[500000,5000005],[500010,5000005]]}]}];
 const r=api.measureContourAxes({domain,physicalDomain:domain,axes,headlandWidthM:2});
 assert.equal(r.rows.length,1);assert.ok(Math.abs(r.rows[0].surfaceLengthM-(10*Math.sqrt(2)-4))<1e-7);
 assert.ok(r.rows[0].coordinates.length>2);
});

test('first conversion measures the whole field but adapts only the selected portion',()=>{
 const input=contourFixture({height:(x,y)=>y/5,angle:45,geometryXY:[[0,0],[20,0],[20,12],[0,12],[0,0]],exclusionsXY:[[[9,-1],[11,-1],[11,13],[9,13],[9,-1]]]});
 const portions=resolveRowPortions(legacyTerrainInputs(input.project));
 const r=api.buildContourTerrainProposal({...input,portionId:portions[0].id});
 assert.equal(r.ok,true,r.message);
 assert.equal(r.terrain.applied.portionResults.length,2);
 const other=r.terrain.applied.portionResults.find(p=>p.id===portions[1].id);
 assert.equal(other.design.mode,'measure');assert.equal(other.validation.automaticSpacing,false);
 assert.ok(other.rows.some(row=>Math.abs(toUTM(row.end)[0]-toUTM(row.start)[0])>1));
 assert.equal(r.result.headPosts,2*r.result.rows.length);
 assert.deepEqual(readTerrainEnvelope({...input.project,rowPortions:r.rowPortions,terrain:r.terrain}),r.result);
});

test('local measurement removes target automatic provenance and preserves the other portion exactly',()=>{
 const input=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[20,0],[20,12],[0,12],[0,0]],exclusionsXY:[[[9,-1],[11,-1],[11,13],[9,13],[9,-1]]]});
 const portions=resolveRowPortions(legacyTerrainInputs(input.project));
 const first=api.buildContourTerrainProposal({...input,portionId:portions[0].id});
 assert.equal(first.ok,true,first.message);
 const project={...input.project,rowPortions:first.rowPortions,terrain:first.terrain};
 assert.ok(first.rowPortions.find(p=>p.id===portions[0].id).terrainDesign.axes.length>0);
 const otherBefore=structuredClone(first.terrain.applied.portionResults.find(p=>p.id===portions[1].id));
 const otherDesign=structuredClone(first.rowPortions.find(p=>p.id===portions[1].id));
 const r=api.buildContourTerrainProposal({project,model:input.model,portionId:portions[0].id,mode:'measure'});
 assert.equal(r.ok,true,r.message);
 assert.deepEqual(r.terrain.applied.portionResults.find(p=>p.id===portions[1].id),otherBefore);
 assert.deepEqual(r.rowPortions.find(p=>p.id===portions[1].id),otherDesign);
 const manual=r.terrain.applied.portionResults.find(p=>p.id===portions[0].id);
 assert.equal(manual.design.guideCoordinates,undefined);assert.equal(manual.design.axes,undefined);
 const changed={...project,rowSpacingM:4};
 const invalid=api.buildContourTerrainProposal({project:changed,model:input.model,portionId:portions[0].id,mode:'measure'});
 assert.equal(invalid.ok,false);assert.equal(invalid.status,'review-required');assert.equal(invalid.result,undefined);
});

test('flat manual business quantities retain exact legacy counts with independent physical lengths',()=>{
 const input=contourFixture({angle:27});
 const manual=calculateProject(legacyTerrainInputs(input.project));
 const r=api.buildContourTerrainProposal({...input,mode:'measure'});
 assert.equal(r.ok,true,r.message);
 for(const key of ['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])assert.equal(r.result[key],manual[key],key);
 assert.equal(r.result.quantityBasis,'certified-flat-legacy');
 assert.deepEqual(r.result.rows.map(r=>[r.start,r.end]),manual.rows.map(r=>[r.start,r.end]));
 assert.ok(r.result.rows.every(r=>Number.isFinite(r.surfaceLengthM)));
});

test('automatic coverage ranks the actual ground-head-trimmed service union',()=>{
 const input=contourFixture({height:(x,y)=>y/5,headlandM:2,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
 const r=api.buildContourTerrainProposal(input);
 assert.equal(r.ok,true,r.message);
 for(const row of r.result.rows){assert.ok(Math.abs(row.surfaceLengthM-8)<1e-7);assert.ok(Math.abs(Math.min(toUTM(row.start)[0],toUTM(row.end)[0])-500002)<1e-6);}
 assert.ok(r.result.coverage.servedAreaM2<99&&r.result.coverage.servedAreaM2>97);
 assert.equal(r.result.coverage.referenceAreaM2,r.result.surfaceAreaM2);
 assert.equal(r.result.headPosts,r.result.rows.length*2);
 const subset=r.terrain.applied.portionResults[0].validation.headlandSubset;
 assert.equal(subset.valid,true);assert.equal(subset.method,'exact-rational-segment-subset');
 assert.ok(subset.rows.every(r=>r.segments.every(s=>s.rowParameterInterval.every(v=>/^[-0-9]+\/[0-9]+$/.test(v)))));
 assert.ok(subset.trimRecords.every(r=>r.requestedWidthM===2));
});

test('positive manual headlands preserve a bent manual family even without a continuum area proof',()=>{
 const input=contourFixture({height:(x,y)=>y/2,headlandM:2,angle:20});
 input.project.rowCurvePoints=[{position:.5,offsetM:2}];
 const r=api.buildContourTerrainProposal({...input,mode:'measure'});
 assert.equal(r.ok,true,r.message);assert.ok(r.result.rowCount>0);
 assert.equal(r.result.headlandAreaM2,null);assert.equal(r.result.surfaceNetAreaM2,null);
 assert.equal(r.result.theoreticalPlantsBasis,'surface-after-explicit-exclusions-before-headlands');
 assert.equal(r.result.headPosts,r.result.rowCount*2);
 assert.ok(r.result.rows.some(row=>row.coordinates.length>3));
});

test('collinear source components split by a road do not duplicate physical fragments after head trimming',()=>{
 const {project,model}=contourFixture({height:(x,y)=>y/2,exclusionsXY:[[[0,19],[40,19],[40,21],[0,21],[0,19]]]});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]}});
 const physicalDomain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry,...project.exclusions]}});
 const axes=[{axisId:'source',portionId:'p',ordinal:0,components:[
  {coordinatesXY:[[500010,5000000],[500010,5000019]]},
  {coordinatesXY:[[500010,5000021],[500010,5000040]]}
 ]}];
 const r=api.measureContourAxes({domain,physicalDomain,axes,headlandWidthM:2});
 assert.equal(r.rows.length,2);
 assert.ok(r.rows.every(row=>row.headlandTrim?.basis==='original-perimeter-ground-arclength'));
 for(const row of r.rows)for(const removed of row.headlandTrim.removedEnds){
  assert.ok(removed.surfaceLengthBoundsM[0]<=2+1e-7&&removed.surfaceLengthBoundsM[1]>=2-1e-7);
 }
});


test('missing post spacing creates no posts in verified manual quantities',()=>{
 const input=contourFixture({height:(x,y)=>y/2,geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]});
 input.project.postSpacingM=null;
 const r=api.buildContourTerrainProposal({...input,mode:'measure'});
 assert.equal(r.ok,true,r.message);assert.ok(r.result.simulatedPlants>0);
 assert.equal(r.result.headPosts,0);assert.equal(r.result.intermediatePosts,0);assert.equal(r.result.totalPosts,0);
});

test('explicit dispatch shortens its live deadline and refuses unknown solver versions',async()=>{
 const {createTerrainBudget}=await import('../src/terrain-budget.js');
 const input=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
 for(const deadlineMs of [0,1]){
  const result=buildTerrainProposal({...input,algorithmVersion:'terrain-contour-family-1',deadlineMs});
  assert.equal(result.ok,false);assert.equal(result.status,'budget-exceeded');assert.equal(result.result,undefined);
 }
 const budget=createTerrainBudget({kind:'adapt'});
 const shared=buildTerrainProposal({...input,algorithmVersion:'terrain-contour-family-1',deadlineMs:0,budget});
 assert.equal(shared.ok,true,shared.message);
 const unknown=buildTerrainProposal({...input,algorithmVersion:'future-not-installed'});
 assert.equal(unknown.ok,false);assert.equal(unknown.status,'unsupported-algorithm');assert.equal(unknown.result,undefined);
});

test('an explicitly known legacy solver retains the absent-version frozen proposal',()=>{
 const input=contourFixture(),now=Date.now;Date.now=()=>1700000000000;
 try{
  assert.deepEqual(buildTerrainProposal({...input,algorithmVersion:'terrain-face-chart-1'}),buildTerrainProposal(input));
 }finally{Date.now=now;}
});


test('the new default permits 20 s but an oversized override cannot exceed the 30 s cap',()=>{
 const input=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[12,0],[12,12],[0,12],[0,0]]});
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now');
 try{
  let calls=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>calls++?20000:0});
  const normal=buildTerrainProposal({...input,algorithmVersion:'terrain-contour-family-1'});
  assert.equal(normal.ok,true,normal.message);
  calls=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>calls++?30001:0});
  const extended=buildTerrainProposal({...input,algorithmVersion:'terrain-contour-family-1',deadlineMs:60000});
  assert.equal(extended.ok,false);assert.equal(extended.status,'budget-exceeded');assert.equal(extended.result,undefined);
 }finally{
  if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
 }
});

test('local adaptation retains every foreign applied result and design byte-for-byte',()=>{
 const input=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[20,0],[20,12],[0,12],[0,0]],exclusionsXY:[[[9,-1],[11,-1],[11,13],[9,13],[9,-1]]]});
 const portions=resolveRowPortions(legacyTerrainInputs(input.project)),target=portions[0].id,other=portions[1].id;
 const first=api.buildContourTerrainProposal({...input,portionId:target});
 assert.equal(first.ok,true,first.message);
 const project={...input.project,rowPortions:first.rowPortions,terrain:first.terrain};
 const r=api.buildContourTerrainProposal({project,model:input.model,portionId:target,mode:'adapt'});
 assert.equal(r.ok,true,r.message);
 assert.deepEqual(r.terrain.applied.portionResults.find(p=>p.id===other),first.terrain.applied.portionResults.find(p=>p.id===other));
 assert.deepEqual(r.rowPortions.find(p=>p.id===other),first.rowPortions.find(p=>p.id===other));
});

test('conversion from a frozen historical terrain proposal measures every foreign portion',()=>{
 const input=contourFixture({height:(x,y)=>y/5,geometryXY:[[0,0],[20,0],[20,12],[0,12],[0,0]],exclusionsXY:[[[9,-1],[11,-1],[11,13],[9,13],[9,-1]]]});
 const historical=buildTerrainProposal({...input,followTerrain:false});
 assert.equal(historical.ok,true,historical.message);
 const project={...input.project,rowPortions:historical.rowPortions,terrain:historical.terrain};
 const portions=resolveRowPortions(legacyTerrainInputs(project));
 const r=api.buildContourTerrainProposal({project,model:input.model,portionId:portions[0].id});
 assert.equal(r.ok,true,r.message);
 const foreign=r.terrain.applied.portionResults.find(p=>p.id===portions[1].id);
 assert.equal(foreign.design.mode,'measure');assert.equal(foreign.validation.automaticSpacing,false);
 assert.ok(foreign.rows.every(row=>Number.isFinite(row.surfaceLengthM)));
});
