import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegularTerrainRegionOperations} from '../src/terrain-surface-bands.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {nextUp} from '../src/terrain-exact.js';
const polygon=ring=>({type:'Polygon',coordinates:[ring]});
const operations=()=>createRegularTerrainRegionOperations({budget:createTerrainBudget({kind:'cut'})});

test('rational one-third preview has the same cyclic boundary ancestry and strict emitted topology',()=>{
 const op=operations();
 const a=op.read(polygon([[0,0],[1,1],[0,1],[0,0]]),'scope');
 const b=op.read(polygon([[0,0],[1,0],[0,.5],[0,0]]),'strip');
 const exact=op.operation(a,b);
 assert.equal(typeof op.serializeTopology,'function');
 const preview=op.serializeTopology(exact);
 assert.deepEqual(preview.coordinates[0][0].filter((_,i)=>i!==1),[[0,0],[0,.5],[0,0]]);
 const crossing=preview.coordinates[0][0][1];
 assert.equal(crossing[0],crossing[1]);
 assert.ok(crossing[0]>=1/3&&crossing[0]<=nextUp(1/3));
 assert.ok(op.provenance(exact)[0].edges.every(edge=>edge.sources.length));
 assert.equal(op.read(preview).length,1);
 assert.throws(()=>op.serializeExact(exact),{status:'numeric-unresolved'});
});

test('preview preserves a positive bridge holes and disjoint collinear boundary strata',()=>{
 const op=operations();
 const outer=op.read(polygon([[0,0],[20,0],[20,100],[0,100],[0,0]]),'field');
 const strip=op.read(polygon([[9,-1],[11,-1],[11,99.9995],[9,99.9995],[9,-1]]),'strip');
 const bridge=op.serializeTopology(op.operation(outer,strip,'difference'));
 assert.equal(bridge.coordinates.length,1);
 assert.equal(op.contains(op.read(bridge),[10,99.99975]),true);
 const holes=op.read({type:'Polygon',coordinates:[[[0,0],[5,0],[5,5],[0,5],[0,0]],[[1,1],[1,2],[2,2],[2,1],[1,1]]]},'holes');
 assert.equal(op.serializeTopology(holes).coordinates[0].length,2);
 const left=op.read(polygon([[0,0],[1,0],[2,0],[2,1],[0,1],[0,0]]),'left');
 const right=op.read(polygon([[3,0],[4,0],[4,1],[3,1],[3,0]]),'right');
 assert.equal(op.serializeTopology(op.operation(left,right,'union')).coordinates.length,2);
});

test('rounding that creates nonadjacent contact or collapses an exact edge is unresolved',()=>{
 const op=operations(),u=nextUp(1);
 const field=op.read(polygon([[0,1],[2,1],[2,2],[0,2],[0,1]]),'field');
 const left=op.operation(field,op.read(polygon([[0,0],[1,0],[u,4],[0,4],[0,0]]),'left'));
 const right=op.operation(field,op.read(polygon([[1,0],[2,0],[2,3],[u,3],[1,0]]),'right'));
 const two=op.operation(left,right,'union');
 assert.equal(two.filter(r=>r.ringIndex===0).length,2);
 assert.throws(()=>op.serializeTopology(two),{status:'numeric-unresolved'});
 const a=op.read(polygon([[1,0],[2,1],[1,1],[1,0]]),'scope');
 const b=op.read(polygon([[0,0],[2,0],[0,Number.MIN_VALUE],[0,0]]),'strip');
 const tiny=op.operation(a,b);
 assert.equal(tiny.length,1);
 assert.throws(()=>op.serializeTopology(tiny),{status:'numeric-unresolved'});
});
