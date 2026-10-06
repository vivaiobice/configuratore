import test from 'node:test';
import assert from 'node:assert/strict';
import {createExactNativeClipper} from '../src/terrain-native-clipping.js';
import {createTerrainBudget} from '../src/terrain-budget.js';

const face={id:0,vertexIds:[0,1,2],vertices:[[0,0,0],[10,0,10],[0,10,0]],edgeIds:['0:1','1:2','0:2']};
const clip=region=>createExactNativeClipper(region,createTerrainBudget({kind:'measure'}))(face);
test('hole-cancelled native corner contributes neither XY nor elevation extrema',()=>{
 const outer=[[-1,-1],[11,-1],[11,11],[-1,11],[-1,-1]];
 const hole=[[7,-.5],[10.5,-.5],[10.5,3.5],[7,3.5],[7,-.5]];
 const result=clip([[outer,hole]]);
 assert.equal(result.areaM2,45.5);
 assert.deepEqual(result.bounds,[0,0,7,10]);
 assert.equal(result.minM,0);assert.equal(result.maxM,7);
 assert.ok(result.surfaceAreaM2>=45.5*Math.SQRT2-1e-13);
});
test('isolated point and doubled line contacts do not enlarge a positive multipart footprint',()=>{
 const square=[[1,1],[2,1],[2,2],[1,2],[1,1]];
 const pointContact=[[10,0],[11,-1],[12,-1],[12,1],[11,1],[10,0]];
 const lineContact=[[4,-1],[7,-1],[7,0],[4,0],[4,-1]];
 const result=clip([[square],[pointContact],[lineContact]]);
 assert.equal(result.areaM2,1);assert.deepEqual(result.bounds,[1,1,2,2]);
 assert.equal(result.minM,1);assert.equal(result.maxM,2);
 assert.equal(clip([[pointContact],[lineContact]]),null);
});
test('concave clipped paths cancel bridges and retain real intersections and interior holes',()=>{
 // A U whose bottom connector lies outside the native triangle. Its exact
 // clip is two rectangles; the bridge along y=0 is integration-only.
 const u=[[1,-2],[6,-2],[6,2],[5,2],[5,-1],[2,-1],[2,2],[1,2],[1,-2]];
 const hole=[[1.25,.5],[1.75,.5],[1.75,1.5],[1.25,1.5],[1.25,.5]];
 const extra=[[8,-1],[12,-1],[12,3],[8,3],[8,-1]];
 const result=clip([[u,hole],[extra]]);
 assert.equal(result.areaM2,5.5);assert.deepEqual(result.bounds,[1,0,10,2]);
 assert.equal(result.minM,1);assert.equal(result.maxM,10);
 // Removing the entire right native corner leaves a new true intersection.
 const removal=[[9,-.5],[11,-.5],[11,2.5],[9,2.5],[9,-.5]];
 const cut=clip([[u,hole],[extra,removal]]);
 assert.equal(cut.areaM2,5);assert.deepEqual(cut.bounds,[1,0,9,2]);
 assert.equal(cut.maxM,9);
});
