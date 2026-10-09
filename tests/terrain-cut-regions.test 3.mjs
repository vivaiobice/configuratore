import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegularTerrainRegionOperations} from '../src/terrain-surface-bands.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
const polygon=ring=>({type:'Polygon',coordinates:[ring]});

// Catches rounding a non-dyadic Boolean boundary or dropping its operand ancestry.
test('canonical region intersection retains one-third vertices and exact operand provenance',()=>{
  const op=createRegularTerrainRegionOperations({budget:createTerrainBudget({kind:'cut'})});
  const a=op.read(polygon([[0,0],[1,1],[0,1],[0,0]]),'scope');
  const b=op.read(polygon([[0,0],[1,0],[0,.5],[0,0]]),'strip');
  const intersection=op.operation(a,b);
  const exact=op.exactBoundaries(intersection);
  assert.ok(exact.flatMap(r=>r.coordinates).some(p=>p[0].n===1n&&p[0].d===3n&&p[1].n===1n&&p[1].d===3n));
  assert.equal(typeof op.provenance,'function');
  const proof=op.provenance(intersection);
  const crossing=proof.flatMap(r=>r.vertices).find(vertex=>vertex.incidentEdges.some(e=>e.operandId==='scope'&&e.edgeIndex===0)&&vertex.incidentEdges.some(e=>e.operandId==='strip'&&e.edgeIndex===1));
  assert.ok(crossing);
  assert.ok(crossing.incidentEdges.every(edge=>edge.parameter?.n!==undefined));
  assert.throws(()=>op.serializeExact(intersection),{status:'numeric-unresolved'});
});

test('regular difference preserves a positive half-millimetre connection',()=>{
  const op=createRegularTerrainRegionOperations({budget:createTerrainBudget({kind:'cut'})});
  const p=op.read(polygon([[0,0],[20,0],[20,100],[0,100],[0,0]]),'scope');
  const g=op.read(polygon([[9,-1],[11,-1],[11,99.9995],[9,99.9995],[9,-1]]),'strip');
  const children=op.operation(p,g,'difference');
  assert.equal(children.filter(r=>r.ringIndex===0).length,1);
  assert.equal(op.contains(children,[10,99.99975]),true);
  const provenance=op.provenance(children);
  assert.equal(provenance.filter(r=>!r.ringIndex).length,1);
  assert.ok(provenance.flatMap(r=>r.edges).every(edge=>edge.sources.length>0));
});

test('strict regular region rejects nested hole cycles and zero length source edges',()=>{
 const op=createRegularTerrainRegionOperations({budget:createTerrainBudget({kind:'cut'})});
 const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
 assert.throws(()=>op.read({type:'Polygon',coordinates:[ring(0,0,10,10),ring(2,2,8,8),ring(3,3,4,4)]}),{status:'numeric-unresolved'});
 assert.throws(()=>op.read(polygon([[0,0],[1,0],[1,0],[1,1],[0,1],[0,0]])),{status:'numeric-unresolved'});
});
