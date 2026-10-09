import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {resolveRowPortions} from '../src/row-portions.js';
import {legacyTerrainInputs} from '../src/terrain-replay.js';

// The display change list includes retained foreign portions; undo authority must not.
test('contour proposal explicitly identifies evaluated portions through conversion local apply and recompute',()=>{
 const input=contourFixture({geometryXY:[[0,0],[8,0],[8,4],[0,4],[0,0]],exclusionsXY:[[[3,-1],[5,-1],[5,5],[3,5],[3,-1]]]});
 input.project.rowSpacingM=1.5;
 const ids=resolveRowPortions(legacyTerrainInputs(input.project)).map(p=>p.id);
 assert.equal(ids.length,2);
 const first=buildContourTerrainProposal({...input,portionId:ids[0],mode:'measure'});
 assert.equal(first.ok,true,first.message);
 assert.deepEqual(first.affectedPortionIds,ids);
 const project={...input.project,rowPortions:first.rowPortions,terrain:first.terrain};
 const local=buildContourTerrainProposal({project,model:input.model,portionId:ids[1],mode:'measure'});
 assert.equal(local.ok,true,local.message);
 assert.deepEqual(local.affectedPortionIds,[ids[1]]);
 assert.deepEqual(local.changes.map(c=>c.portionId),ids);
 assert.deepEqual(local.terrain.applied.portionResults[0],first.terrain.applied.portionResults[0]);
 const all=buildContourTerrainProposal({project,model:input.model,portionId:ids[1],mode:'measure',recomputeAll:true});
 assert.equal(all.ok,true,all.message);
 assert.deepEqual(all.affectedPortionIds,ids);
 assert.equal(Object.hasOwn(first.terrain.applied,'affectedPortionIds'),false);
});
