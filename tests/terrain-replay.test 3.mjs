import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTerrainProposal,readAppliedTerrainResult} from '../src/terrain-design.js';
import {calculateProject} from '../src/project-calculator.js';
import {fixture} from './helpers/terrain-fixture.mjs';
const apply=(project,p)=>({...project,rowPortions:p.rowPortions,terrain:p.terrain});
test('applied geometry replays exactly even under an unknown future algorithm',async()=>{
 const {project,model}=await fixture((x,y)=>x/5+y/7);const p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
 const saved=apply(project,p);saved.terrain.applied.algorithmVersion='unknown-future';
 assert.deepEqual(readAppliedTerrainResult(saved),p.result);
 assert.deepEqual(calculateProject({...saved,polygon:saved.geometry}),p.result);
});
test('changed inputs and corrupted rows yield explicit invalid quantities, never planar estimates',async()=>{
 const {project,model}=await fixture();const p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
 const saved=apply(project,p);saved.rowSpacingM=4;
 assert.equal(readAppliedTerrainResult(saved).terrainStatus,'invalid');assert.equal(readAppliedTerrainResult(saved).rowCount,null);
 saved.rowSpacingM=3;saved.terrain.applied.result.rows[0].lengthM+=1;
 assert.equal(readAppliedTerrainResult(saved).terrainStatus,'invalid');
});
test('first application converts all portions; local reapply preserves other applied rows and quantities exactly',async()=>{
 const {project,model}=await fixture((x,y)=>x/8,{exclusions:[[[19.25,0],[20.75,0],[20.75,40],[19.25,40],[19.25,0]]]});
 const first=buildTerrainProposal({project,model,followTerrain:false});assert.equal(first.ok,true,first.message);assert.equal(first.terrain.applied.portionResults.length,2);
 const saved=apply(project,first),chosen=saved.rowPortions[0].id,other=saved.rowPortions[1].id;
 saved.rowPortions[0]={...saved.rowPortions[0],mode:'local',orientationDeg:15};
 const next=buildTerrainProposal({project:saved,model,portionId:chosen,followTerrain:false});assert.equal(next.ok,true,next.message);
 assert.deepEqual(next.terrain.applied.portionResults.find(p=>p.id===other),first.terrain.applied.portionResults.find(p=>p.id===other));
});
test('a manual curved guide remains a verified terrain family',async()=>{
 const {project,model}=await fixture((x,y)=>x/8);project.rowCurvePoints=[{id:'bend',position:.5,offsetM:2}];
 const proposal=buildTerrainProposal({project,model,followTerrain:false});assert.equal(proposal.ok,true,proposal.message);
 assert.ok(proposal.result.rows.some(r=>r.coordinates.length>3));assert.ok(proposal.terrain.applied.validation.minimumSpacingLowerM>=3);
});
test('portion topology normalization preserves applied terrain guide metadata',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');const {project,model}=await fixture();const p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
 const resolved=resolveRowPortions({...project,polygon:project.geometry,rowPortions:p.rowPortions});assert.deepEqual(resolved[0].terrainDesign,p.rowPortions[0].terrainDesign);
});
test('flat conforming legacy family keeps geographic phase and endpoints on explicit application',async()=>{
 const {project,model}=await fixture();const legacy=calculateProject({...project,polygon:project.geometry});const p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
 assert.equal(p.result.rowCount,legacy.rowCount);
 assert.ok(p.terrain.applied.portionResults[0].validation.pairCount>0);
 assert.deepEqual(p.result.rows.map(r=>[r.start,r.end]),legacy.rows.map(r=>[r.start,r.end]));
});
test('tampered preserved portion geometry cannot be reused by a local proposal',async()=>{
 const {project,model}=await fixture();const p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
 const saved=structuredClone(apply(project,p));saved.terrain.applied.portionResults[0].rows[0].lengthM+=4;
 assert.equal(readAppliedTerrainResult(saved).terrainStatus,'invalid');
 const next=buildTerrainProposal({project:saved,model,portionId:p.rowPortions[0].id,followTerrain:false});assert.equal(next.ok,false);
});
test('flat certified phase survives ground headlands and physical passage clipping',async()=>{
 const {project,model}=await fixture(()=>0,{headland:2,exclusions:[[[0,19.9],[40,19.9],[40,20.1],[0,20.1],[0,19.9]]]});
 const legacy=calculateProject({...project,polygon:project.geometry,headlandWidthM:0});const p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
 assert.equal(p.result.rowCount,legacy.rowCount);
 const a=p.result.rows.map(r=>r.start[0]).sort((a,b)=>a-b),b=legacy.rows.map(r=>r.start[0]).sort((a,b)=>a-b);
 for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-10);
});
test('already certified flat local and curved axes retain phase when adding ground headlands',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');const {toUTM}=await import('../src/coordinate-system.js');
 for(const curve of [[],[{id:'small-bend',position:.413,offsetM:.1}]]){
  const {project,model}=await fixture();project.rowPortions=resolveRowPortions({...project,polygon:project.geometry}).map(p=>({...p,mode:'local',rowCurvePoints:curve}));
  const raw=buildTerrainProposal({project,model,followTerrain:false});assert.equal(raw.ok,true,raw.message);assert.equal(raw.terrain.applied.portionResults[0].design.guide,'certified-legacy-family');
  const trimmed=buildTerrainProposal({project:{...project,headlandWidthM:2},model,followTerrain:false});assert.equal(trimmed.ok,true,trimmed.message);assert.equal(trimmed.result.rowCount,raw.result.rowCount);
  for(let i=0;i<raw.result.rows.length;i++){
   const before=raw.result.rows[i],after=trimmed.result.rows[i];assert.equal(after.axisId,before.axisId);assert.equal(after.sourceDistance,before.sourceDistance);
   assert.ok(Math.abs(before.lengthM-after.lengthM-4)<1e-6);
   const original=before.coordinates.map(p=>toUTM(p)),distance=point=>Math.min(...original.slice(1).map((b,k)=>{const a=original[k],v=b.map((n,j)=>n-a[j]),r=point.map((n,j)=>n-a[j]),t=Math.max(0,Math.min(1,(r[0]*v[0]+r[1]*v[1])/(v[0]**2+v[1]**2)));return Math.hypot(point[0]-a[0]-t*v[0],point[1]-a[1]-t*v[1]);}));
   for(const point of after.coordinates)assert.ok(distance(toUTM(point))<1e-6,'Headlands moved an already certified axis');
  }
 }
});
test('legacy curve terrain observer exposes original pre-exclusion axes without changing default output',async()=>{
 const {generateCurvedRows}=await import('../src/row-curves.js');const {project}=await fixture(()=>0,{exclusions:[[[0,.5],[40,.5],[40,2],[0,2],[0,.5]]]});
 const options={polygon:project.geometry,guidePolygon:project.geometry,rowSpacingM:3,rowCurvePoints:[{id:'bend',position:.413,offsetM:.1}],exclusions:project.exclusions};
 let family;const legacy=generateCurvedRows(options),observed=generateCurvedRows({...options,includeTerrainAxes:true,onTerrainFamily:value=>family=value});assert.ok(observed.length>0);assert.ok(family.candidates.every(c=>Number.isInteger(c.sampleStart)&&c.sampleCount>=c.coordinates.length));
 assert.ok(observed.every(r=>Array.isArray(r.terrainAxisCoordinates)&&r.terrainAxisCoordinates.length>2));
 assert.deepEqual(observed.map(({terrainAxisCoordinates,terrainAxisDistance,terrainAxisFamily,...r})=>r),legacy);
});
test('certified flat families preserve legacy business quantities and expose measured surface lengths separately',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');const {terrainPolylineLength}=await import('../src/terrain-model.js');
 for(const [local,headland,curve] of [[false,0,[]],[true,2,[]],[true,2,[{id:'small-bend',position:.413,offsetM:.1}]]]){
  const {project,model}=await fixture(()=>0,{headland});if(local)project.rowPortions=resolveRowPortions({...project,polygon:project.geometry}).map(p=>({...p,mode:'local',rowCurvePoints:curve}));
  const legacy=calculateProject({...project,polygon:project.geometry}),p=buildTerrainProposal({project,model,followTerrain:false});assert.equal(p.ok,true,p.message);
  assert.equal(p.result.quantityBasis,'certified-flat-legacy');
  for(const key of ['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])assert.equal(p.result[key],legacy[key],key);
  for(const key of ['areaM2','perimeterM','vertexCount'])assert.equal(p.result[key],legacy[key],key);
  assert.ok(Math.abs(p.result.surfaceRowLinearM-p.result.rows.reduce((s,r)=>s+terrainPolylineLength(model,r.coordinates),0))<1e-6);
  assert.ok(p.result.rows.every(r=>r.quantityBasis==='certified-flat-legacy'&&Number.isFinite(r.surfaceLengthM)));
  assert.equal(p.changes[0].after.quantityBasis,'certified-flat-legacy');assert.equal(p.changes[0].before.quantityBasis,'legacy-planar');
 }
});
test('global recalculation keeps selected automatic scope and the other portion guide',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');const {fromUTM}=await import('../src/coordinate-system.js');
 const {project,model}=await fixture(x=>x/8,{exclusions:[[[9.25,0],[10.75,0],[10.75,40],[9.25,40],[9.25,0]]]});
 project.geometry=[[0,0],[40,0],[40,20],[20,20],[20,40],[0,40],[0,0]].map(([x,y])=>fromUTM([500000+x,5000000+y]));
 project.rowPortions=resolveRowPortions({...project,polygon:project.geometry}).map(p=>({...p,mode:'local',orientationDeg:45}));
 const selected=project.rowPortions[0].id,other=project.rowPortions[1].id;
 const first=buildTerrainProposal({project,model,portionId:selected,followTerrain:true});assert.equal(first.ok,true,first.message);
 assert.equal(first.terrain.applied.portionResults.find(p=>p.id===other).design.orientationRad,Math.PI/4);
 const changed={...apply(project,first),rowSpacingM:4};const next=buildTerrainProposal({project:changed,model,portionId:selected,followTerrain:true,recomputeAll:true});assert.equal(next.ok,true,next.message);
 assert.equal(next.terrain.applied.portionResults.find(p=>p.id===other).design.orientationRad,Math.PI/4);
 // The already automatic first portion must also keep its geographic guide
 // when a later global recalculation selects the other portion.
 const again=buildTerrainProposal({project:{...apply(changed,next),rowSpacingM:5},model,portionId:other,followTerrain:true,recomputeAll:true});assert.equal(again.ok,true,again.message);
 assert.deepEqual(again.terrain.applied.portionResults.find(p=>p.id===selected).design.guideCoordinates,next.terrain.applied.portionResults.find(p=>p.id===selected).design.guideCoordinates);
});
test('retained curved headlands start at the true perimeter, before a near-boundary road cut',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');const {toUTM}=await import('../src/coordinate-system.js');
 const {project,model}=await fixture(()=>0,{exclusions:[[[0,.5],[40,.5],[40,1.999],[0,1.999],[0,.5]]]});
 project.rowPortions=resolveRowPortions({...project,polygon:project.geometry}).map(p=>({...p,mode:'local',rowCurvePoints:[{id:'small-bend',position:.413,offsetM:.1}]}));
 const p=buildTerrainProposal({project:{...project,headlandWidthM:2},model,followTerrain:false});assert.equal(p.ok,true,p.message);
 for(const row of p.result.rows){const points=row.coordinates.map(c=>toUTM(c).map((v,i)=>v-[500000,5000000][i]));assert.ok(points[0][1]>=1.9999,'Ground headland was added at the road or started at an interior candidate endpoint');}
 // Without the road, some old curved candidates stop slightly inside the
 // perimeter. Their retained headland cut must still be two ground metres
 // from the original y=0 boundary, not two metres from that truncated tip.
 const clean=await fixture();clean.project.rowPortions=resolveRowPortions({...clean.project,polygon:clean.project.geometry}).map(p=>({...p,mode:'local',rowCurvePoints:[{id:'small-bend',position:.413,offsetM:.1}]}));
 const raw=buildTerrainProposal({...clean,followTerrain:false}),heads=buildTerrainProposal({...clean,project:{...clean.project,headlandWidthM:2},followTerrain:false});assert.equal(raw.ok,true,raw.message);assert.equal(heads.ok,true,heads.message);
 for(let i=0;i<raw.result.rows.length;i++){
  const before=raw.result.rows[i].coordinates.map(c=>toUTM(c).map((v,j)=>v-[500000,5000000][j])),after=heads.result.rows[i].coordinates.map(c=>toUTM(c).map((v,j)=>v-[500000,5000000][j]));
  const extension=before[0][1]*Math.hypot(before[1][0]-before[0][0],before[1][1]-before[0][1])/(before[1][1]-before[0][1]);
  let traveled=extension;for(let k=1;k<before.length;k++){const a=before[k-1],b=before[k];if(after[0][1]<=b[1]+1e-7){traveled+=Math.hypot(after[0][0]-a[0],after[0][1]-a[1]);break;}traveled+=Math.hypot(b[0]-a[0],b[1]-a[1]);}
  assert.ok(Math.abs(traveled-2)<1e-6,`Headland starts ${traveled} m from original boundary`);
 }
});
test('retained curved ground headland area follows curved axes instead of the straight reference direction',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');const input=await fixture();input.project.rowPortions=resolveRowPortions({...input.project,polygon:input.project.geometry}).map(p=>({...p,mode:'local',rowCurvePoints:[{id:'visible-bend',position:.413,offsetM:2}]}));
 const p=buildTerrainProposal({...input,project:{...input.project,headlandWidthM:2},followTerrain:false});assert.equal(p.ok,true,p.message);assert.equal(p.result.quantityBasis,'certified-flat-legacy');
 // These axes also enter the lateral perimeter as they bend. A straight
 // north/south band's 160 m² cannot describe their physical headlands.
 assert.ok(p.result.surfaceHeadlandAreaM2>161,`Curved headland area: ${p.result.surfaceHeadlandAreaM2}`);
 assert.ok(p.result.surfaceHeadlandAreaM2<200);
 assert.ok(Math.abs(p.result.surfaceHeadlandAreaM2-172.78860948544613)<1e-6);
 assert.ok(Math.abs(p.result.headlandAreaM2-p.result.surfaceHeadlandAreaM2)<1e-6,'Flat horizontal headland must remain the integrated physical band, not legacy180');
 assert.ok(Math.abs(p.result.netAreaM2+p.result.headlandAreaM2+p.result.excludedAreaM2-p.result.areaM2)<1e-6);
 assert.ok(Math.abs(p.result.surfaceNetAreaM2+p.result.surfaceHeadlandAreaM2-p.result.surfaceAreaM2)<1e-6);
});
test('retained compatibility rejects a true-perimeter extension that changes physical fragment identity',async()=>{
 const {resolveRowPortions}=await import('../src/row-portions.js');
 const input=await fixture(()=>0,{exclusions:[[[1,2.07],[39,2.07],[39,2.17],[1,2.17],[1,2.07]]]});
 input.project.rowPortions=resolveRowPortions({...input.project,polygon:input.project.geometry}).map(p=>({...p,mode:'local',rowCurvePoints:[{id:'small-bend',position:.413,offsetM:.1}]}));
 const p=buildTerrainProposal({...input,project:{...input.project,headlandWidthM:2},followTerrain:false});
 assert.equal(p.ok,false);assert.equal(p.status,'review-required');assert.match(p.message,/frammenti/);assert.equal(p.result,undefined);
});
