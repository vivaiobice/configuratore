import {fixture} from './helpers/terrain-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const design = existsSync(new URL('../src/terrain-design.js',import.meta.url)) ? await import('../src/terrain-design.js') : {};
test('analytic oblique plane uses perpendicular surface spacing, not transverse slope alone',()=>{
 assert.equal(typeof design.planeHorizontalSpacing,'function');
 assert.equal(design.planeHorizontalSpacing(3,0,0),3);
 assert.ok(Math.abs(design.planeHorizontalSpacing(3,0,1)-3/Math.sqrt(2))<1e-12);
 assert.equal(design.planeHorizontalSpacing(3,1,0),3);
 assert.ok(Math.abs(design.planeHorizontalSpacing(3,1,1)-3*Math.sqrt(2/3))<1e-12);
});
test('solver and authoritative replay have explicit entry points',()=>{
 assert.equal(typeof design.buildTerrainProposal,'function');
 assert.equal(typeof design.readAppliedTerrainResult,'function');
});

test('plane proposal measures surface lengths and separate horizontal lengths',async()=>{
 assert.equal(typeof design.buildTerrainProposal,'function');
 const input=await fixture((x,y)=>y/2);
 const proposal=design.buildTerrainProposal({...input,followTerrain:false});
 assert.equal(proposal.ok,true,proposal.message);
 assert.ok(proposal.result.rowCount>0);
 assert.ok(proposal.result.rowLinearM>proposal.result.horizontalRowLinearM*1.1);
 assert.equal(proposal.result.headPosts,proposal.result.rowCount*2);
 assert.ok(proposal.terrain.applied.validation.minimumSpacingLowerM>=3);
});
test('wave surface follows every native face and produces curved oblique rows',async()=>{
 assert.equal(typeof design.buildTerrainProposal,'function');
 const input=await fixture(x=>4*Math.sin(x/10),{angle:45});
 const proposal=design.buildTerrainProposal({...input,followTerrain:false});
 assert.equal(proposal.ok,true,proposal.message);
 assert.ok(proposal.result.rows.some(r=>r.coordinates.length>3));
 assert.ok(proposal.result.rowLinearM>proposal.result.horizontalRowLinearM);
 assert.ok(proposal.terrain.applied.validation.minimumSpacingLowerM>=3);
 assert.ok(proposal.terrain.applied.validation.errorBoundM<=.01);
});
test('tiny real exclusion creates physical fragments and ground headlands trim only outer ends',async()=>{
 assert.equal(typeof design.buildTerrainProposal,'function');
 const a=await fixture((x,y)=>y/2,{headland:2});
 const b=await fixture((x,y)=>y/2,{headland:2,exclusions:[[[0,19.98],[40,20.02],[40,20.12],[0,20.08],[0,19.98]]]});
 const full=design.buildTerrainProposal({...a,followTerrain:false}),cut=design.buildTerrainProposal({...b,followTerrain:false});
 assert.equal(full.ok,true,full.message);assert.equal(cut.ok,true,cut.message);
 assert.equal(cut.result.rowCount,full.result.rowCount*2);
 assert.equal(cut.result.headPosts,cut.result.rowCount*2);
 assert.ok(full.result.rowLinearM-cut.result.rowLinearM<3);
});
test('nondevelopable mild terrain receives measured conservative surface certificate',async()=>{
 assert.equal(typeof design.buildTerrainProposal,'function');
 const input=await fixture((x,y)=>.2*x+.1*y+.0001*x*y);
 const proposal=design.buildTerrainProposal({...input,followTerrain:false});
 assert.equal(proposal.ok,true,proposal.message);
 assert.ok(proposal.terrain.applied.validation.minimumSpacingLowerM>=3);
 assert.ok(proposal.terrain.applied.validation.errorBoundM<=.01);
});
test('budget exhaustion returns recoverable status without result',async()=>{
 assert.equal(typeof design.buildTerrainProposal,'function');
 const input=await fixture();const proposal=design.buildTerrainProposal({...input,deadlineMs:0});
 assert.equal(proposal.ok,false);assert.equal(proposal.status,'budget-exceeded');assert.equal(proposal.result,undefined);
});
test('ground headland areas integrate actual perimeter bands rather than row-count strips',async()=>{
 const input=await fixture((x,y)=>y/2,{headland:2});const p=design.buildTerrainProposal({...input,followTerrain:false});assert.equal(p.ok,true,p.message);
 assert.ok(Math.abs(p.result.surfaceHeadlandAreaM2-160)<.02,`surface headland ${p.result.surfaceHeadlandAreaM2}`);
 assert.ok(Math.abs(p.result.headlandAreaM2-160/Math.sqrt(1.25))<.5);
});
test('automatic guide starts from continuous native contour components',async()=>{
 const input=await fixture((x,y)=>x*.2+y*.1+x*y*.001);const p=design.buildTerrainProposal({...input,followTerrain:true});assert.equal(p.ok,true,p.message);
 const {sampleTerrain}=await import('../src/terrain-model.js');
 const guide=p.terrain.applied.portionResults[0].design.guideCoordinates;assert.ok(Array.isArray(guide)&&guide.length>2);
 const heights=guide.map(c=>sampleTerrain(input.model,c));
 assert.ok(Math.max(...heights)-Math.min(...heights)<1e-5);
});
test('saddle contour branching is an explicit recoverable review state',async()=>{
 const input=await fixture((x,y)=>(x-20)*(y-20)/100);const p=design.buildTerrainProposal({...input,followTerrain:true});assert.equal(p.ok,false);assert.equal(p.status,'review-required');
});
test('missing elevation support and changed grid content never return planar terrain quantities',async()=>{
 const {project,model}=await fixture();const corrupted=structuredClone(model);corrupted.grid.valuesBase64='AAAA';
 const bad=design.buildTerrainProposal({project,model:corrupted});assert.equal(bad.ok,false);assert.equal(bad.status,'invalid-model');assert.equal(bad.result,undefined);
 const {fromUTM}=await import('../src/coordinate-system.js');project.geometry[0]=fromUTM([499900,5000000]);project.geometry[project.geometry.length-1]=project.geometry[0];
 const outside=design.buildTerrainProposal({project,model,followTerrain:false});assert.equal(outside.ok,false);assert.equal(outside.status,'uncovered');assert.equal(outside.result,undefined);
});
test('real Piemonte and Tuscany native DEMs produce useful automatic certified families',async()=>{
 const {readFile}=await import('node:fs/promises');const {fromUTM}=await import('../src/coordinate-system.js');const {loadTerrainForField,clearTerrainProviderCache}=await import('../src/terrain-provider.js');
 const requests=JSON.parse(await readFile(new URL('./fixtures/terrain/requests.json',import.meta.url),'utf8'));
 for(const f of requests.slice(0,2)){
  clearTerrainProviderCache();const geometry=f.fieldRing.map(p=>fromUTM(p));const model=await loadTerrainForField({polygon:geometry,fetchImpl:async()=>new Response(await readFile(new URL(`./fixtures/terrain/${f.file}`,import.meta.url)))});
  const p=design.buildTerrainProposal({project:{geometry,rowSpacingM:3,plantSpacingM:1,postSpacingM:5},model});assert.equal(p.ok,true,`${f.file}: ${p.message}`);assert.ok(p.result.rowCount>1);
  assert.ok(p.terrain.applied.portionResults[0].validation.pairCount>0);assert.ok(p.terrain.applied.validation.minimumSpacingLowerM>=3);assert.ok(p.terrain.applied.validation.errorBoundM<=.01);
 }
});
test('refined guide knots preserve the actual 1.50 m exclusion polygon and headland bands',async()=>{
 const {toUTM}=await import('../src/coordinate-system.js');
 const fixtureOptions={exclusions:[[[16.75,7],[18.25,7],[18.25,33],[16.75,33],[16.75,7]]],headland:0};
 const input=await fixture(x=>x/8,fixtureOptions);input.project.rowCurvePoints=[{id:'bend',position:.413,offsetM:2}];
 const p=design.buildTerrainProposal({...input,followTerrain:false});assert.equal(p.ok,true,p.message);
 for(const row of p.result.rows){const points=row.coordinates.map(c=>toUTM(c).map((v,i)=>v-[500000,5000000][i]));for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];let lo=0,hi=1;
  for(let axis=0;axis<2;axis++){const min=[16.75,7][axis]+1e-7,max=[18.25,33][axis]-1e-7,d=b[axis]-a[axis];if(Math.abs(d)<1e-14){if(a[axis]<=min||a[axis]>=max){lo=1;hi=0;}}else{const t0=(min-a[axis])/d,t1=(max-a[axis])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));}}
  assert.ok(hi<=lo,`Physical row ${row.fragmentId} enters the road: ${JSON.stringify([a,b])}`);
 }}
 // The road ends seven metres from the original boundary, outside the 2 m
 // headlands. Cutting it cannot alter either ground headland band's area.
 const uncut=await fixture(x=>x/8,{headland:2});uncut.project.rowCurvePoints=input.project.rowCurvePoints;
 const before=design.buildTerrainProposal({...uncut,followTerrain:false});assert.equal(before.ok,true,before.message);
 const withHeads=design.buildTerrainProposal({...input,project:{...input.project,headlandWidthM:2},followTerrain:false});assert.equal(withHeads.ok,true,withHeads.message);
 assert.ok(Math.abs(withHeads.result.surfaceHeadlandAreaM2-before.result.surfaceHeadlandAreaM2)<1e-6);
});
test('flatness belongs to the working portion, not sloping support or another portion',async()=>{
 const nearby=await fixture(x=>x<0?-x/5:0);const a=design.buildTerrainProposal({...nearby,followTerrain:true});assert.equal(a.ok,true,a.message);assert.equal(a.terrain.applied.portionResults[0].design.guide,'certified-legacy-family');
 const {resolveRowPortions}=await import('../src/row-portions.js');const {toUTM}=await import('../src/coordinate-system.js');
 const split=await fixture(x=>Math.max(0,x-20)/5,{exclusions:[[[19.25,0],[20.75,0],[20.75,40],[19.25,40],[19.25,0]]]});
 const portions=resolveRowPortions({...split.project,polygon:split.project.geometry}),flat=portions.find(p=>toUTM(p.anchor)[0]<500020);
 const p=design.buildTerrainProposal({...split,portionId:flat.id,followTerrain:true});assert.equal(p.ok,true,p.message);assert.equal(p.terrain.applied.portionResults.find(r=>r.id===flat.id).design.guide,'certified-legacy-family');
});
test('actual transverse and oblique plane rows have analytic 3D spacing, lengths and threshold counts',async()=>{
 const {toUTM}=await import('../src/coordinate-system.js');
 for(const [a,b] of [[0,.5],[.5,.25]]){
  const input=await fixture((x,y)=>b*x+a*y),p=design.buildTerrainProposal({...input,followTerrain:false});assert.equal(p.ok,true,p.message);
  const xyz=coordinate=>{const [x,y]=toUTM(coordinate).map((v,i)=>v-[500000,5000000][i]);return [x,y,b*x+a*y];},minus=(a,b)=>a.map((v,i)=>v-b[i]);
  for(let i=0;i<p.result.rows.length;i++){
   const row=p.result.rows[i],u=xyz(row.start),v=xyz(row.end),t=minus(v,u);assert.ok(Math.abs(row.lengthM-Math.hypot(...t))<1e-6);
   if(i){const d=minus(u,xyz(p.result.rows[i-1].start)),cross=[d[1]*t[2]-d[2]*t[1],d[2]*t[0]-d[0]*t[2],d[0]*t[1]-d[1]*t[0]];assert.ok(Math.abs(Math.hypot(...cross)/Math.hypot(...t)-3)<1e-6);}
  }
  assert.equal(p.result.intermediatePosts,p.result.rows.reduce((s,r)=>s+Math.max(0,Math.ceil(r.lengthM/5)-1),0));
  assert.equal(p.result.simulatedPlants,p.result.rows.reduce((s,r)=>s+Math.floor(r.lengthM)+1,0));
 }
});
