import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js?v=1.3.2';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.2';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.2';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js?v=1.3.2';
import {readTerrainEnvelope,createContourEnvelope} from '../src/terrain-replay.js?v=1.3.2';

const diagnostic=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?String(item):item);
function fixture(){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,index)=>{const x=-40+(index%3)*40,y=40-Math.floor(index/3)*40;return y/4+x/(x<0?64:32);})}});
 const geometry=[[-5,-5],[5,-5],[5,5],[-5,5],[-5,-5]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const project={geometry,exclusions:[],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:1,orientationDeg:0,rowPortions:[{id:'source',geometry:[geometry],mode:'inherited',orientationDeg:0}]};
 return {model,project};
}
let actualSavedFixture;

test('actual filled finite-polyline proposal reloads and regenerates original ground operations',()=>{
 const {model,project}=fixture(),before=JSON.stringify(project),budget=createTerrainBudget({kind:'cut',onProgress(phase){console.info('finite-replay-phase',diagnostic(phase));}});
 const proposal=buildContourTerrainProposal({project,model,mode:'adapt',portionId:'source',budget});
 console.info('finite-replay-usage',diagnostic({stage:'proposal',...budget.usage()}));
 assert.equal(proposal.ok,true,diagnostic(proposal.diagnostics));
 assert.equal(JSON.stringify(project),before);
 const saved={...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain};
 actualSavedFixture={saved,model};
 assert.ok(proposal.result.rows.length>=2,'actual filled schedule must retain several complete levels');
 assert.equal(saved.rowPortions[0].terrainDesign.axisGeometryConvention,'finite-polyline-domain-intersection-1');
 assert.ok(proposal.result.rows.every(row=>row.axisOperation.kind==='polyline-source-parameter-intervals-1'));
 assert.equal(readTerrainEnvelope(saved,{budget}).terrainStatus,'applied');
 const reloaded=JSON.parse(JSON.stringify(saved));
 const replay=readTerrainEnvelope(reloaded,{budget});
 console.info('finite-replay-usage',diagnostic({stage:'reload',...budget.usage()}));
 assert.equal(replay.terrainStatus,'applied');
 assert.deepEqual(replay.rows,proposal.result.rows);
 assert.equal(replay.simulatedPlants,proposal.result.simulatedPlants);
 assert.equal(replay.surfaceRowLinearM,proposal.result.surfaceRowLinearM);

 // Rehashing a saved local interval is not a proof that the requested original
 // ground headland generated it. This changes all saved result mirrors, so the
 // rejection must come from actual operation regeneration rather than a hash.
 const changed=JSON.parse(JSON.stringify(saved)),applied=changed.terrain.applied;
 const row=applied.portionResults[0].rows[0],record=row.axisOperation.intervals[0];
 record.lo+=(record.hi-record.lo)/16;
 const aggregate=applied.result.rows.find(item=>item.fragmentId===row.fragmentId&&item.axisId===row.axisId);
 aggregate.axisOperation=JSON.parse(JSON.stringify(row.axisOperation));
 const verificationBudget=createTerrainBudget({kind:'cut'});
 changed.terrain.applied=createContourEnvelope({project:changed,model,result:applied.result,portionResults:applied.portionResults,validation:applied.validation,budget:verificationBudget});
 assert.equal(readTerrainEnvelope(changed,{budget:verificationBudget}).terrainStatus,'invalid');
});

test('local finite Adapt charges saved reconstruction before starting a fresh family',()=>{
 if(!actualSavedFixture){
  const {project,model}=fixture(),constructionBudget=createTerrainBudget({kind:'cut'});
  const proposal=buildContourTerrainProposal({project,model,mode:'adapt',portionId:'source',budget:constructionBudget});
  assert.equal(proposal.ok,true,diagnostic(proposal.diagnostics));
  actualSavedFixture={model,saved:{...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain}};
 }
 const {saved,model}=actualSavedFixture,before=JSON.stringify(saved);
 const auditBudget=createTerrainBudget({kind:'cut'});
 assert.equal(readTerrainEnvelope(saved,{budget:auditBudget}).terrainStatus,'applied');
 const reconstructionNodes=auditBudget.usage().nodeCount;
 assert.ok(reconstructionNodes>0);
 // A real carried ledger can accommodate input inspection but less than half
 // the measured complete saved-source reconstruction. It must stop there,
 // before extraction/evaluation of a new family; a later A quota failure does
 // not establish that the previous reconstruction shared this transaction.
 const phases=[],budget=createTerrainBudget({kind:'cut',initialNodeCount:500000-Math.floor(reconstructionNodes/2),onProgress(record){phases.push(record.phase);}});
 const proposal=buildContourTerrainProposal({project:saved,model,mode:'adapt',portionId:'source',budget});
 console.info('local-finite-reconstruction-ledger',diagnostic({reconstructionNodes,phases,status:proposal.status,portionEvaluations:proposal.diagnostics.portions.length,...budget.usage()}));
 assert.equal(proposal.ok,false);
 assert.equal(proposal.status,'budget-exceeded');
 assert.deepEqual(phases,[],'saved reconstruction must exhaust the same carried ledger before any fresh family phase');
 assert.equal(proposal.diagnostics.portions.length,0,'later family rejection cannot mask an uncharged saved reconstruction');
 for(const key of ['result','terrain','rowPortions','projectPatch'])assert.equal(Object.hasOwn(proposal,key),false);
 assert.equal(JSON.stringify(saved),before);
});

test('actual 512-face native finite filled proposal and JSON reload share one cut ledger',()=>{
 const {project}=fixture();
 // Preserve the completed mild-crease field/headland/spacing geometry, but
 // acquire the real 5 m, 17 x 17 native mesh: 512 unchanged native triangles.
 // No resampling of the completed 40 m source model is used.
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:17,height:17,origin:[499960,5000040],step:[5,-5],values:Array.from({length:289},(_,index)=>{
  const x=-40+(index%17)*5,y=40-Math.floor(index/17)*5;
  return y/4+x/(x<0?64:32);
 })}});
 const before=JSON.stringify(project),budget=createTerrainBudget({kind:'cut',onProgress(phase){console.info('native-512-finite-phase',diagnostic(phase));}});
 const proposal=buildContourTerrainProposal({project,model,mode:'adapt',portionId:'source',budget});
 console.info('native-512-finite-ledger',diagnostic({stage:'proposal',ok:proposal.ok,status:proposal.status,...budget.usage()}));
 assert.equal(proposal.ok,true,diagnostic(proposal.diagnostics));
 assert.equal(JSON.stringify(project),before);
 assert.ok(proposal.result.rows.length>=2,'complete native filled schedule retains several certified levels');
 assert.equal(proposal.rowPortions[0].terrainDesign.axisGeometryConvention,'finite-polyline-domain-intersection-1');
 assert.ok(proposal.result.rows.every(row=>row.axisOperation.kind==='polyline-source-parameter-intervals-1'));
 const saved=JSON.parse(JSON.stringify({...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain}));
 const replay=readTerrainEnvelope(saved,{budget});
 console.info('native-512-finite-ledger',diagnostic({stage:'JSON-reload',terrainStatus:replay.terrainStatus,...budget.usage()}));
 assert.equal(replay.terrainStatus,'applied');
 assert.deepEqual(replay.rows,proposal.result.rows);
 assert.equal(replay.surfaceRowLinearM,proposal.result.surfaceRowLinearM);
 assert.equal(replay.simulatedPlants,proposal.result.simulatedPlants);
});
