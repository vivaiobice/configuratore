import test from 'node:test';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {nativeDirectionalFixture} from './helpers/terrain-directional-fixture.mjs';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {chargeTerrainOperationCopy} from '../src/terrain-worker-client.js';
import {readTerrainEnvelope,hashTerrainEnvelope} from '../src/terrain-replay.js';
import {terrainInputHash} from '../src/terrain-model.js';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {certifyNativeDirectionalFamily} from '../src/terrain-directional-certificate.js?v=1.3.4';
import {measureNativeDirectionalService,measureDomainSurfaceArea,measuredSurfaceAreasComparable,compareMeasuredSurfaceAreas,sumMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.4';

test('real Float32 native varied L and road completes filled family, transport and independent replay within one allowance',async t=>{
 const {model,project}=nativeDirectionalFixture(),modelBefore=JSON.stringify(model),projectBefore=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt'});
 const result=buildContourTerrainProposal({project,model,portionId:'lower',budget});
 assert.equal(result.ok,true,JSON.stringify({status:result.status,message:result.message,usage:budget.usage(),diagnostics:result.diagnostics?.portions?.map(p=>({message:p.message,candidates:p.candidates?.map(c=>({valid:c.valid,critical:c.validation?.critical?.slice(0,1),unresolved:c.validation?.unresolved?.slice(0,1)}))}))}));
 const portion=result.terrain.applied.portionResults.find(p=>p.id==='lower'),foreign=result.terrain.applied.portionResults.find(p=>p.id==='upper');
 assert.ok(portion.rows.length>=10);assert.equal(portion.validation.method,'native-directional-shortest-spacing-1');
 assert.ok(portion.validation.minimumSpacingLowerM>=2.8);assert.ok(portion.validation.maximumSpacingUpperM<=3.2);assert.ok(portion.validation.maxElevationDeviationM<=.001);
 assert.equal(portion.coverage.serviceMethod,'native-directional-conservative-ribbon-1');assert.ok(portion.coverage.servedAreaM2>portion.usableSurfaceAreaM2*.75);
 assert.equal(foreign.validation.automaticSpacing,false);assert.equal(foreign.design.orientationDeg,90);assert.equal(result.result.headPosts,result.result.rows.length*2);
 assert.equal(JSON.stringify(model),modelBefore);assert.equal(JSON.stringify(project),projectBefore);
 t.diagnostic(JSON.stringify({beforeCopy:budget.usage(),search:result.diagnostics.portions.map(p=>({policy:p.selectionPolicy,stop:p.optionalSearchStop,candidates:p.candidates.map(c=>({id:c.id,valid:c.valid}))}))}));
 const payload={project,proposal:result};chargeTerrainOperationCopy(payload,budget);t.diagnostic(JSON.stringify({afterCopy:budget.usage()}));
 const fresh=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./helpers/terrain-directional-replay-worker.mjs',import.meta.url),{workerData:{...payload,initialNodeCount:budget.usage().nodeCount,expiresAt:performance.timeOrigin+performance.now()+budget.remainingMs()}});
  worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(new Error(`Replay worker exited ${code}`));});
 });
 assert.equal(fresh.ok,true,JSON.stringify(fresh));assert.ok(fresh.usage.nodeCount<=500000);assert.ok(budget.usage().elapsedMs<30000);
 t.diagnostic(JSON.stringify({producerAndTransport:budget.usage(),freshOwner:fresh.usage,rows:portion.rows.length,coverage:portion.coverage.percent}));
});

// Recompute every public digest after removing the method markers. Stored
// summaries and ordinary hashes are not native spacing/service authority.
test('varied native replay cannot downgrade all certificate markers to bypass proof',()=>{
 const {model,project}=nativeDirectionalFixture({size:12}),proposal=buildContourTerrainProposal({project,model,portionId:'lower'});
 assert.equal(proposal.ok,true,JSON.stringify(proposal.diagnostics));
 const live=proposal.terrain.applied.portionResults.find(p=>p.id==='lower'),areaBudget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry:live.design.axisScopeGeometry,budget:areaBudget}),originalDomain=createContourDomain({model,geometry:live.design.originalAxisScopeGeometry,budget:areaBudget});
 const certificate=certifyNativeDirectionalFamily(domain,live.design.axes,{originalDomain,spacingM:3,budget:areaBudget}),service=measureNativeDirectionalService({certificate,axes:live.design.axes,widthM:3,budget:areaBudget}),full=measureDomainSurfaceArea({domain,budget:areaBudget});
 assert.equal(measuredSurfaceAreasComparable(service,full,{budget:areaBudget}),false);assert.throws(()=>compareMeasuredSurfaceAreas(service,full,{budget:areaBudget}),/incomparable-service-area-bases/);
 const mixed=sumMeasuredSurfaceAreas([service,full],{budget:areaBudget});assert.equal(mixed.serviceMethod,'mixed-service-bases');assert.equal(measuredSurfaceAreasComparable(mixed,service,{budget:areaBudget}),false);
 const saved={...project,rowPortions:structuredClone(proposal.rowPortions),terrain:structuredClone(proposal.terrain)};
 const edit=value=>{if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(['spacingCertificateMethod','serviceMethod','serviceQualification'].includes(key))delete value[key];else if(key==='method'&&value[key]==='native-directional-shortest-spacing-1')value[key]='forged-unverified';else edit(value[key]);}};
 edit(saved);const applied=saved.terrain.applied;
 const portion=applied.portionResults.find(p=>p.id==='lower');portion.validation.minimumSpacingLowerM=3;portion.validation.maximumSpacingUpperM=3;portion.coverage.servedAreaM2=1;
 applied.resultHash=terrainInputHash(applied.result);applied.snapshotHash=hashTerrainEnvelope(applied);
 assert.equal(readTerrainEnvelope(saved).terrainStatus,'invalid');
 // Claiming the genuine legacy policy must rebuild that policy, too; its name
 // alone must not turn the same forged spacing/coverage into an accepted save.
 const claimLegacy=value=>{if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(key==='method'&&value[key]==='forged-unverified')value[key]='native-levels/continuous-bidirectional-spacing/actual-service-union';else claimLegacy(value[key]);}};
 claimLegacy(saved);applied.resultHash=terrainInputHash(applied.result);applied.snapshotHash=hashTerrainEnvelope(applied);
 let replay;try{replay=readTerrainEnvelope(saved,{budget:createTerrainBudget({kind:'adapt',deadlineMs:5000})});}catch(error){assert.equal(error.status,'budget-exceeded');}
 assert.notEqual(replay?.terrainStatus,'applied');
});
test('a diagonal noisy native hill with a real interior hole uses an exact rational transverse frame',()=>{
 const {model,project}=nativeDirectionalFixture({size:12,slopeX:.22,slopeY:.22,hole:true});
 const proposal=buildContourTerrainProposal({project,model,portionId:'lower'});
 assert.equal(proposal.ok,true,JSON.stringify({status:proposal.status,diagnostics:proposal.diagnostics}));
 const portion=proposal.terrain.applied.portionResults.find(p=>p.id==='lower');
 assert.equal(portion.validation.method,'native-directional-shortest-spacing-1');
 assert.ok(portion.rows.length>=5);assert.ok(portion.validation.minimumSpacingLowerM>=2.8);assert.ok(portion.validation.maximumSpacingUpperM<=3.2);
 assert.deepEqual(readTerrainEnvelope({...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain}),proposal.result);
});
test('a broad native gradient range stays inconclusive without spending the global root-field cap',()=>{
 const {model,project}=nativeDirectionalFixture({size:12,noise:.6}),before=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt'});
 const proposal=buildContourTerrainProposal({project,model,portionId:'lower',budget});
 assert.equal(proposal.ok,false);assert.notEqual(proposal.status,'budget-exceeded');assert.ok(budget.usage().nodeCount<200000);
 assert.match(JSON.stringify(proposal.diagnostics),/native-directional-proof-inconclusive/);assert.equal(JSON.stringify(project),before);
});
