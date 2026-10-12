import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDirectionalFixture} from './helpers/terrain-directional-fixture.mjs';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.9';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js?v=1.3.9';
import {readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.9';
import {chargeTerrainOperationCopy} from '../src/terrain-worker-client.js?v=1.3.9';
import {serializeTerrainSnapshot} from '../src/terrain-serialization.js?v=1.3.9';
test('authentic 50m directional L completes both portions, transport and an independent fresh JSON replay within unchanged caps',t=>{
 const {model,project}=nativeDirectionalFixture({size:50}),original=JSON.stringify(project),budget=createTerrainBudget({kind:'adapt'});
 const proposal=buildContourTerrainProposal({project,model,budget});
 t.diagnostic(JSON.stringify({stage:'producer',ok:proposal.ok,status:proposal.status,usage:budget.usage(),message:proposal.message,diagnostics:proposal.ok?undefined:proposal.diagnostics}));
 assert.equal(proposal.ok,true,proposal.message);assert.equal(JSON.stringify(project),original);
 assert.deepEqual(proposal.affectedPortionIds,['lower','upper']);assert.equal(proposal.result.rows.length,35);
 assert.ok(proposal.terrain.applied.portionResults.every(p=>p.validation.automaticSpacing&&p.validation.coverageComplete));
 const producer=budget.usage();chargeTerrainOperationCopy(proposal,budget);
 const copy=JSON.parse(JSON.stringify(structuredClone(proposal))),usage=budget.usage(),fresh=createTerrainBudget({kind:'adapt'});
 // Adaptation has independent consumer replay; only native cut continues a
 // carried ledger. This test additionally charges the real proposal clone.
 const field={...project,...copy.projectPatch,rowPortions:copy.rowPortions,terrain:copy.terrain};
 assert.deepEqual(readTerrainEnvelope(field,{budget:fresh}),proposal.result);
 const wire=serializeTerrainSnapshot(field);fresh.check();
 assert.ok(Buffer.byteLength(wire)<=1048576);assert.ok(fresh.usage().nodeCount<=500000);assert.ok(fresh.usage().elapsedMs<30000);
 t.diagnostic(JSON.stringify({producer,transport:usage,freshUsage:fresh.usage(),wireBytes:Buffer.byteLength(wire),rows:proposal.result.rows.length}));
});
