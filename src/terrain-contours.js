import {createTerrainBudget} from './terrain-budget.js?v=1.3.1-prova.1';
import {
  Q, ZERO, ONE, cmp, sign, sub, div, at, pointKey, xy, exactDomain, splitSegment,
  inRegion
} from './terrain-exact.js?v=1.3.1-prova.1';
/** Deterministic native level graph. Exact constructions are transient: the
 * returned binary64 coordinates are the authoritative submitted axes in later
 * validation. No face clip polygon is treated as a physical row fragment. */
export function traceContourLevel(domain, levelM, {
  portionId='default',
  budget=createTerrainBudget({
    kind:'measure'
  })
}
={}){
  if(!Number.isFinite(levelM))throw new RangeError('Finite contour level required');
  budget.phase('contours');
  const k=exactDomain(domain, budget),
  h=Q(levelM),
  segments=new Map(),
  diagnostics=[],
  edgeNodes=new Map(),
  levelEdges=new Map();
  const node=(f, i, j)=>{
    const a=f.vertices[i],
    b=f.vertices[j];
    if(cmp(a[2], h)===0)return {
      id:`v:${f.vertexIds[i]}`,
      p:a.slice(0, 2)
    };
    if(cmp(b[2], h)===0)return {
      id:`v:${f.vertexIds[j]}`,
      p:b.slice(0, 2)
    };
    const id=`e:${f.edgeIds[i]}`;
    if(!edgeNodes.has(id)){
      budget.check(1);
      edgeNodes.set(id, {
        id,
        p:at(a.slice(0, 2), b.slice(0, 2), div(sub(h, a[2]), sub(b[2], a[2])))
      });
    }
    return edgeNodes.get(id);
  };
  const insert=(a, b, faceId)=>{
    if(pointKey(a)===pointKey(b))return;
    const key=[pointKey(a), pointKey(b)].sort().join('|');
    if(!segments.has(key)){
      budget.check(2);
      segments.set(key, {
        a,
        b,
        faceIds:[]
      });
    }
    segments.get(key).faceIds.push(faceId);
  };
  for (const f of k.faces){
    budget.check();
    const signs=f.vertices.map(p=>cmp(p[2], h)),
    zeros=signs.filter(s=>!s).length;
    if(signs.every(s=>s>0)||signs.every(s=>s<0))continue;
    if(zeros===3){
      diagnostics.push({
        reason:'plateau',
        faceId:f.id,
        levelM
      });
      continue;
    }
    if(zeros===2){
      const i=signs.findIndex((s, i)=>s===0&&signs[(i+1)%3]===0),
      id=f.edgeIds[i];
      if(!levelEdges.has(id))levelEdges.set(id, {
        a:f.vertices[i].slice(0, 2),
        b:f.vertices[(i+1)%3].slice(0, 2),
        faces:[],
        signs:[]
      });
      const e=levelEdges.get(id);
      e.faces.push(f.id);
      e.signs.push(signs[(i+2)%3]);
      continue;
    }
    const points=[];
    for (let i=0; i<3; i++){
      const j=(i+1)%3;
      if(signs[i]*signs[j]<0||!signs[i]||!signs[j])points.push(node(f, i, j));
    }
    const unique=[...new Map(points.map(p=>[p.id, p.p])).values()];
    if(unique.length===2)insert(unique[0], unique[1], f.id);
  }
  for (const [edgeId, e] of levelEdges){
    if(e.signs.length>1&&e.signs.every(s=>s===e.signs[0])){
      diagnostics.push({
        reason:'ridge-valley',
        edgeId,
        faceIds:e.faces,
        levelM
      });
      continue;
    }
    for(const id of e.faces)insert(e.a, e.b, id);
  }
  const clipped=new Map();
  for (const segment of segments.values()){
    // Splitting by all native edges also retains vertex fan identities. All cuts
    // are rational and only real region rings can remove a positive subsegment.
    for(const piece of splitSegment(k, segment.a, segment.b, budget)){
      if(!piece.inside||!piece.faces.length)continue;
      const ka=pointKey(piece.a),
      kb=pointKey(piece.b),
      id=[ka, kb].sort().join('|');
      if(!clipped.has(id)){
        budget.check(2);
        clipped.set(id, {
          id,
          a:piece.a,
          b:piece.b,
          ka,
          kb,
          faceIds:segment.faceIds
        });
      }
    }
  }
  const graph=new Map();
  for (const s of clipped.values())for(const id of [s.ka, s.kb]){
    if(!graph.has(id))graph.set(id, []);
    graph.get(id).push(s);
  }
  const bad=new Set([...graph].filter(([, edges])=>edges.length>2).map(([id])=>id));
  for (const id of bad)diagnostics.push({
    reason:'branch',
    levelM,
    xy:xy(clipped.get(graph.get(id)[0].id).a)
  });
  const used=new Set(),
  components=[];
  const walk=start=>{
    let current=start;
    const points=[],
    faceIds=[];
    while(true){
      const edge=graph.get(current)?.find(e=>!used.has(e.id));
      if(!edge)break;
      used.add(edge.id);
      if(bad.has(current))return;
      const p=current===edge.ka?edge.a:edge.b,
      next=current===edge.ka?edge.kb:edge.ka;
      if(!points.length)points.push(xy(p));
      points.push(xy(current===edge.ka?edge.b:edge.a));
      faceIds.push(...edge.faceIds);
      current=next;
      if(bad.has(current))return;
      if(current===start){
        diagnostics.push({
          reason:'closed-contour',
          levelM,
          xy:points[0]
        });
        return;
      }
    }
    const coordinatesXY=points.filter((p, i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
    if(coordinatesXY.length>1){
      budget.check(coordinatesXY.length);
      components.push({
        faceIds:[...new Set(faceIds)],
        coordinatesXY
      });
    }
  };
  for (const [id, edges] of graph)if(edges.length===1&&!used.has(edges[0].id))walk(id);
  for(const [id, edges] of graph)if(edges.some(e=>!used.has(e.id)))walk(id);
  // Isolated critical vertices with no incident level curve are explicit.
  const seenVertices=new Set();
  for (const f of k.faces)for (let i=0; i<3; i++)if(cmp(f.vertices[i][2], h)===0&&!seenVertices.has(f.vertexIds[i])){
    seenVertices.add(f.vertexIds[i]);
    const p=f.vertices[i].slice(0, 2);
    if(inRegion(p, k)>=0&&!graph.has(pointKey(p))&&!diagnostics.some(d=>d.reason==='plateau'||d.reason==='ridge-valley'))diagnostics.push({
      reason:'isolated-level-point',
      vertexId:f.vertexIds[i],
      xy:xy(p),
      levelM
    });
  }
  return {
    axes:components.length?[{
      axisId:`${portionId}:level:${levelM}`,
      portionId,
      levelM,
      ordinal:0,
      components
    }]:[],
    diagnostics
  };
}
