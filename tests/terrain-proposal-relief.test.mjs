import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';

test('new field relief comes from the physical field before exclusions rather than padded support',()=>{
 const input=contourFixture({height:(x,y)=>x+y/4,geometryXY:[[0,0],[8,0],[8,4],[0,4],[0,0]],exclusionsXY:[[[4,-1],[9,-1],[9,5],[4,5],[4,-1]]]});
 const proposal=buildContourTerrainProposal({...input,mode:'measure'});
 assert.equal(proposal.ok,true,proposal.message);
 const relief=proposal.result.terrainRelief;
 assert.equal(relief?.basis,'native-field-domain-before-exclusions');
 assert.ok(Math.abs(relief.minM)<1e-7);
 assert.ok(Math.abs(relief.maxM-9)<1e-7);
 assert.ok(Math.abs(relief.rangeM-9)<1e-7);
 assert.ok(Math.abs(relief.maxSlopePercent-Math.sqrt(17/16)*100)<1e-7);
 assert.deepEqual(proposal.terrain.applied.result.terrainRelief,relief);
});
