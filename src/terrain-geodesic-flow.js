import {
  Q,
  add as ra,
  sub as rsub,
  mul as rm,
  div as rdiv,
  dot as rd,
  sq as rs,
  neg as rn,
  vsub as rv,
  pointKey as rkey,
  orient as rorient,
  sign as rsign
}
from './terrain-exact.js?v=1.3.1';
const facetCache=new WeakMap(),facetBudgets=new WeakMap();
function cachedFacets(exact,budget) {
  if(facetCache.has(exact)){
    const hit=facetCache.get(exact),
    charged=facetBudgets.get(hit);
    budget?.check(charged.has(budget)?0:hit.nodeCount);
    if(budget)charged.add(budget);
    return hit;
  }
  const edges=new Map();
  for(const face of exact.faces)for(let i=0;i<3;i++){
    budget?.check();
    const id=face.edgeIds[i];
    if(!edges.has(id))edges.set(id,{
      id,
      a:face.vertices[i].slice(0,2),
      b:face.vertices[(i+1)%3].slice(0,2),
      faceIds:[]
    });
    edges.get(id).faceIds.push(face.id);
  }
  const planeKeys=new Map(exact.faces.map(f=>[f.id,`${rkey(f.g)};${rkey([rsub(f.vertices[0][2],rd(f.g,f.vertices[0].slice(0,2)))])}`]));
  const uniformPlane=new Set(planeKeys.values()).size===1;
  const nodeCount=edges.size*2;
  budget?.check(nodeCount);
  const result={
    edges:[...edges.values()],
    nodeCount,
    planeKeys,
    uniformPlane
  };
  facetBudgets.set(result,new WeakSet(budget?[budget]:[]));
  facetCache.set(exact,result);
  return result;
}
const frameCache=new WeakMap();
// Mask zero has no field dependence. Do not retain q from any particular
// algebraic field; expose no Map mutator on borrowed static operands.
function rationalScalar(value) {
  const r=Object.freeze({
    ...value
  });
  const entries=r.n===0n?[]:[[0,r]];
  const map=new Map(entries);
  return Object.freeze({
    size:map.size,
    has:key=>map.has(key),
    get:key=>map.get(key),
    keys:()=>map.keys(),
    [Symbol.iterator]:()=>map[Symbol.iterator]()
  });
}
function rationalFrame(exact,budget) {
  const cached=frameCache.get(exact);
  if(cached){
    budget?.check(cached.charged.has(budget)?0:cached.nodeCount);
    if(budget)cached.charged.add(budget);
    return cached;
  }
  const topology=cachedFacets(exact,budget);
  const point=p=>Object.freeze(p.map(rationalScalar));
  const faces=Object.freeze(exact.faces.map(f=>Object.freeze({
    ...f,
    raw:f,
    vertices:Object.freeze(f.vertices.map(p=>point(p.slice(0,2)))),
    g:point(f.g)
  })));
  const boundaries=Object.freeze(exact.boundaries.map(b=>Object.freeze({
    ...b,
    coordinates:Object.freeze(b.coordinates.map(point))
  })));
  const byId=new Map(faces.map(f=>[f.id,f]));
  const edges=new Map(topology.edges.map(e=>[e.id,Object.freeze({
    a:point(e.a),
    b:point(e.b),
    faces:Object.freeze(e.faceIds.map(id=>byId.get(id)))
  } )]));
  const creaseEdges=new Map();
  for(const edge of edges.values())if(edge.faces.length===2){
    const pair=edge.faces.map(f=>rkey(f.raw.g)).sort().join(';');
    if(!creaseEdges.has(pair))creaseEdges.set(pair,[]);
    creaseEdges.get(pair).push(edge);
  }
  for(const entries of creaseEdges.values())Object.freeze(entries);
  // Vertices, gradients, boundary points and edge endpoints are real retained
  // geometry; the facet cache's separately retained endpoints are also charged.
  const nodeCount=topology.nodeCount+faces.length*4+boundaries.reduce((s,b)=>s+b.coordinates.length,0);
  budget?.check(nodeCount);
  const frame={
    faces,
    boundaries,
    byId,
    edges,
    creaseEdges,
    topology,
    nodeCount,
    charged:new WeakSet(budget?[budget]:[])
  };
  frameCache.set(exact,frame);
  return frame;
}
const patchIndexes=new WeakMap();
function connectedPatchIndex(exact,frame,budget) {
  if(patchIndexes.has(exact)){
    budget?.check();
    return patchIndexes.get(exact);
  }
  const {
    faces,
    byId,
    edges,
    topology
  }
  =frame;
  const neighbors=new Map(faces.map(f=>[f.id,[]]));
  for(const [edgeId,edge] of edges){
    budget?.check();
    if(edge.faces.length>2)throw Object.assign(new Error('nonmanifold native support'),{
      status:'numeric-unresolved',
      detail:'nonmanifold-native-patch-edge'
    });
    const halves=edge.faces.map(face=>{
      const index=face.edgeIds.indexOf(edgeId),
      a=face.raw.vertices[index],
      b=face.raw.vertices[(index+1)%3];
      const direction=rsign(rorient(...face.raw.vertices));
      return direction>0?[rkey(a),rkey(b)]:[rkey(b),rkey(a)];
    });
    if(halves.length===2){
      if(halves[0][0]!==halves[1][1]||halves[0][1]!==halves[1][0])throw Object.assign(new Error('nonconforming native support'),{
        status:'numeric-unresolved',
        detail:'nonconforming-native-patch-edge'
      });
      const [a,b]=edge.faces;
      if(topology.planeKeys.get(a.id)===topology.planeKeys.get(b.id)){
        neighbors.get(a.id).push(b.id);
        neighbors.get(b.id).push(a.id);
      }
    }
  }
  const patches=[],
  byFaceId=new Map();
  for(const face of [...faces].sort((a,b)=>a.id-b.id)){
    if(byFaceId.has(face.id))continue;
    const pending=[face.id],
    ids=new Set();
    while(pending.length){
      budget?.check();
      const id=pending.pop();
      if(ids.has(id))continue;
      ids.add(id);
      pending.push(...neighbors.get(id).filter(id=>!ids.has(id)));
    }
    const nativeFaceIds=Object.freeze([...ids].sort((a,b)=>a-b));
    const frontierEdges=[];
    for(const id of nativeFaceIds){
      const native=byId.get(id);
      for(let i=0;i<3;i++){
        const edgeId=native.edgeIds[i],
        edge=edges.get(edgeId);
        if(edge.faces.length===2&&edge.faces.every(f=>ids.has(f.id)))continue;
        frontierEdges.push(Object.freeze({
          edgeId,
          faceId:id,
          a:native.vertices[i],
          b:native.vertices[(i+1)%3]
        }));
      }
    }
    const patch=Object.freeze({
      id:nativeFaceIds[0],
      nativeFaceIds,
      representativeFaceId:nativeFaceIds[0],
      frontierEdges:Object.freeze(frontierEdges)
    });
    patches.push(patch);
    for(const id of nativeFaceIds)byFaceId.set(id,patch);
  }
  const result=Object.freeze({
    patches:Object.freeze(patches),
    byFaceId:Object.freeze({
      get:id=>byFaceId.get(id)
    })
  });
  patchIndexes.set(exact,result);
  return result;
}
/** Algebraic adapter for A's exact affine-event construction. The same roots
 * (time, segment membership, event order and parallel incidence) are retained,
 * including every point stratum. No binary64 value decides an event. */
export function createBandKernel(exact, field, budget) {
  const F=field,
  {
    q,
    zero:Z,
    one:O,
    add:A,
    sub:S,
    mul:M,
    div:D,
    neg:N,
    cmp:C,
    sign:G
  }
  =F;
  const node=p=>{
    budget?.check(1);
    return p;
  };
  const V=(a,b)=>node(a.map((x,i)=>A(x,b[i]))),
  W=(a,b)=>node(a.map((x,i)=>S(x,b[i])));
  const K=(a,s)=>node(a.map(x=>M(x,s))),
  dot=(a,b)=>a.reduce((s,x,i)=>A(s,M(x,b[i])),Z);
  const cross=(a,b)=>S(M(a[0],b[1]),M(a[1],b[0]));
  const orient=(a,b,c)=>cross(W(b,a),W(c,a));
  const scalar=(a,t)=>A(a[0],M(a[1],t)),
  vector=(a,t)=>V(a[0],K(a[1],t));
  const mid=(a,b)=>D(A(a,b),q(2)),
  xy=p=>p.map(F.number),
  pointKey=p=>p.map(F.key).join(',');
  const roots=values=>[...new Map(values.map(v=>[F.key(v),v])).values()].sort(C);
  const frame=rationalFrame(exact,budget);
  const {
    faces,
    boundaries,
    byId,
    edges,
    creaseEdges,
    topology
  }
  =frame;
  let activePatches=null;
  const patchIndex=()=>connectedPatchIndex(exact,frame,budget);
  const patchFor=face=>activePatches?.byFaceId.get(face.id)??null;
  // A new budget must also retain the cached native facet geometry once.
  cachedFacets(exact,budget);
  const queryBounds=extent=>{
    const a=[Q(extent[0]),Q(extent[1])],
    b=[Q(extent[2]),Q(extent[3])];
    budget?.check(2);
    return exact.querySegment(a,b,budget).map(f=>byId.get(f.id));
  };
  const onSegment=(p,a,b)=>!G(orient(a,b,p))&&G(dot(W(p,a),W(p,b)))<=0;
  const triangle=(p,f)=>{
    const ss=f.vertices.map((a,i)=>G(orient(a,f.vertices[(i+1)%3],p)));
    return ss.every(s=>s>=0)||ss.every(s=>s<=0);
  };
  const inward=(face,p,v,strict=false)=>{
    const orientation=G(orient(...face.vertices));
    for(let i=0;i<3;i++){
      const a=face.vertices[i],
      b=face.vertices[(i+1)%3],
      side=G(orient(a,b,p))*orientation;
      if(side<0)return false;
      if(!side){
        const derivative=G(cross(W(b,a),v))*orientation;
        if(derivative<0||strict&&derivative===0)return false;
      }
    }
    return true;
  };
  const location=(p,rings=boundaries)=>{
    const groups=new Map();
    for(const b of rings){
      if(!groups.has(b.polygonIndex))groups.set(b.polygonIndex,[]);
      groups.get(b.polygonIndex)[b.ringIndex]=b.coordinates;
    }
    const ringLocation=ring=>{
      let winding=0;
      for(let i=1;i<ring.length;i++){
        const a=ring[i-1],
        b=ring[i];
        if(onSegment(p,a,b))return 0;
        if(C(a[1],p[1])<=0&&C(b[1],p[1])>0&&G(orient(a,b,p))>0)winding++;
        if(C(a[1],p[1])>0&&C(b[1],p[1])<=0&&G(orient(a,b,p))<0)winding--;
      }
      return winding?1:-1;
    };
    let touch=false;
    for(const rings of groups.values()){
      const outer=ringLocation(rings[0]);
      if(outer<0)continue;
      if(!outer)touch=true;
      let hole=false;
      for(const ring of rings.slice(1)){
        const l=ringLocation(ring);
        if(l>0)hole=true;
        if(!l)touch=true;
      }
      if(!hole)return touch?0:1;
    }
    return touch?0:-1;
  };
  const after=(p,v,rings=boundaries)=>{
    let step=O;
    for(const b of rings)for(let i=1;i<b.coordinates.length;i++){
      budget?.check();
      const a=b.coordinates[i-1],
      e=W(b.coordinates[i],a),
      den=cross(v,e);
      if(!G(den))continue;
      const d=W(a,p),
      t=D(cross(d,e),den),
      u=D(cross(d,v),den);
      if(G(t)>0&&G(u)>=0&&C(u,O)<=0&&C(t,step)<0)step=t;
    }
    return location(V(p,K(v,D(step,q(2)))),rings);
  };
  const metricDot=(face,a,b)=>A(dot(a,b),M(dot(face.g,a),dot(face.g,b)));
  const normalCache=new Map();
  const unitNormal=(face,tangent,side,policy)=>{
    const first=tangent.find(x=>x.n!==0n);
    if(!first)return null;
    const divisor=first.n<0n?rn(first):first;
    // Build a scalar key before allocating a normalized geometry vector. A
    // repeated immutable normal incurs a deadline check, not a new node charge.
    const tangentKey=policy==='contour-gradient'?'':tangent.reduce((key,x)=>{
      const r=rdiv(x,divisor);
      return `${key}${r.n}/${r.d},`;
    },'');
    const cacheKey=`${rkey(face.raw.g)};${policy};${side};${tangentKey}`;
    if(normalCache.has(cacheKey)){
      budget?.check();
      return normalCache.get(cacheKey);
    }
    let n;
    if(policy==='contour-gradient')n=face.raw.g;
    else {
      tangent=tangent.map(x=>rdiv(x,divisor));
      const ga=rd(face.raw.g,tangent),
      w=tangent.map((x,i)=>ra(x,rm(face.raw.g[i],ga)));
      n=[rn(w[1]),w[0]];
      budget?.check(3);
    }
    const norm2=ra(rd(n,n),rs(rd(face.raw.g,n)));
    if(!norm2.n)return null;
    const result=K(n.map(q),D(q(side),F.sqrt(norm2)));
    normalCache.set(cacheKey,result);
    budget?.check(1);
    return result;
  };
  const samePlane=(a,b)=>topology.planeKeys.get(a.id)===topology.planeKeys.get(b.id);
  const incident=p=>{
    const x=F.bounds(p[0]),
    y=F.bounds(p[1]);
    return queryBounds([x[0],y[0],x[1],y[1]]).filter(f=>triangle(p,f));
  };
  const transport=(previous,next,p,v,star)=>{
    if(samePlane(previous,next))return v;
    // At a vertex a straight crease may have several coplanar subdivisions.
    // Find its actual incident edge, not an arbitrary line through the vertex.
    const shared=[];
    for(const edge of creaseEdges.get([rkey(previous.raw.g),rkey(next.raw.g)].sort().join(';'))??[]){
      budget?.check();
      if(!onSegment(p,edge.a,edge.b))continue;
      if(edge.faces.some(f=>samePlane(f,previous))&&edge.faces.some(f=>samePlane(f,next)))shared.push(edge);
    }
    if(!shared.length)return null;
    const results=[];
    for(const edge of shared){
      const e=W(edge.b,edge.a),
      en=metricDot(previous,e,e),
      alpha=D(metricDot(previous,v,e),en);
      const normal=f=>{
        const w=V(e,K(f.g,dot(f.g,e)));
        return [N(w[1]),w[0]];
      };
      const oldN=normal(previous),
      newN=normal(next),
      old2=metricDot(previous,oldN,oldN),
      new2=metricDot(next,newN,newN);
      const ratio=F.rational(D(old2,new2));
      if(!ratio)throw Object.assign(new Error('nonrational transport norm'),{
        status:'numeric-unresolved',
        detail:'unsupported-transport-norm'
      });
      const beta=D(metricDot(previous,v,oldN),old2);
      results.push(V(K(e,alpha),K(newN,M(beta,F.sqrt(ratio)))));
    }
    if(results.some(x=>pointKey(x)!==pointKey(results[0])))return null;
    return results[0];
  };
  const outgoing=(p,tangent,side,policy,previous,v)=>{
    if(topology.uniformPlane&&!activePatches){
      const face=faces[0],
      direction=unitNormal(face,tangent,side,policy);
      return direction?{
        face,
        v:direction
      }
      :null;
    }
    const star=incident(p),
    planes=new Set(star.map(f=>rkey(f.raw.g)));
    if(previous&&planes.size>2)return null;
    const candidates=[];
    for(const face of star){
      const direction=previous?(policy==='contour-gradient'?unitNormal(face,tangent,side,policy):transport(previous,face,p,v,star)):unitNormal(face,tangent,side,policy);
      if(direction&&inward(face,p,direction))candidates.push({
        face,
        v:direction
      });
    }
    if(!candidates.length)return null;
    const first=candidates[0];
    if(candidates.some(c=>!samePlane(c.face,first.face)||pointKey(c.v)!==pointKey(first.v)))return null;
    if(!inward(first.face,p,first.v,true)&&star.some(f=>inward(f,p,first.v)&&!samePlane(f,first.face)))return null;
    return first;
  };
  const event=(p,v,a,b,meta)=>{
    const e=W(b,a),
    den=cross(v,e);
    if(!G(den))return null;
    const delta=W(a,p[0]);
    return {
      ...meta,
      lambda:[D(cross(delta,e),den),D(N(cross(p[1],e)),den)],
      member:[D(cross(delta,v),den),D(N(cross(p[1],v)),den)]
    };
  };
  const hit=(state,e)=>[V(state.p[0],K(state.v,e.lambda[0])),V(state.p[1],K(state.v,e.lambda[1]))];
  const partition=(state,events,extra)=>{
    if(state.point)return [state];
    const values=[state.lo,state.hi];
    const root=a=>{
      budget?.check();
      if(!G(a[1]))return;
      const t=D(N(a[0]),a[1]);
      if(C(t,state.lo)>0&&C(t,state.hi)<0)values.push(t);
    };
    for(const e of events){
      root(e.lambda);
      if(e.member){
        root(e.member);
        root([S(e.member[0],O),e.member[1]]);
      }
    }
    for(let i=0;i<events.length;i++)for(let j=0;j<i;j++)root(W(events[i].lambda,events[j].lambda));
    extra.forEach(root);
    const sorted=roots(values),
    out=[];
    for(let i=1;i<sorted.length;i++){
      out.push({
        ...state,
        lo:sorted[i-1],
        hi:sorted[i],
        point:false
      });
      if(i<sorted.length-1)out.push({
        ...state,
        lo:sorted[i],
        hi:sorted[i],
        point:true
      });
    }
    budget?.check(out.length);
    return out;
  };
  const cover=records=>{
    const cells=records.filter(r=>!r.point).sort((a,b)=>C(a.lo,b.lo)),
    points=records.filter(r=>r.point).sort((a,b)=>C(a.lo,b.lo));
    if(!cells.length||C(cells[0].lo,Z)||C(cells.at(-1).hi,O))return false;
    if(cells.some((c,i)=>C(c.lo,c.hi)>=0||i&&C(cells[i-1].hi,c.lo)))return false;
    const endpoints=[cells[0].lo,...cells.map(c=>c.hi)];
    return points.length===endpoints.length&&points.every((p,i)=>!C(p.lo,endpoints[i])&&!C(p.lo,p.hi));
  };
  return {
    F,
    Z,
    O,
    A,
    S,
    M,
    D,
    N,
    C,
    G,
    V,
    W,
    K,
    dot,
    cross,
    orient,
    scalar,
    vector,
    mid,
    xy,
    pointKey,
    roots,
    faces,
    boundaries,
    byId,
    edges,
    exact,
    queryBounds,
    patchIndex,
    patchFor,
    usePatches:index=>{
      activePatches=index;
    },
    uniformPlane:topology.uniformPlane,
    onSegment,
    triangle,
    inward,
    location,
    after,
    metricDot,
    unitNormal,
    outgoing,
    event,
    hit,
    partition,
    cover,
    budget
  };
}
/** Trace the whole launch interval to a unit-speed width stop or first true
 * boundary exit. On verification, corridor edges replace the width stop. */
export function traceBandBundles(k,seeds,{
  side,
  policy,
  halfWidth,
  corridor=null,
  collectPatches=true,
  reference=null,
  allowPlaneBoundaryTangents=false,
  preservePhysicalSourceCaps=false
}) {
  const {
    F,
    Z,
    O,
    A,
    S,
    M,
    C,
    G,
    V,
    W,
    K,
    cross,
    scalar,
    vector,
    mid,
    xy
  }
  =k,
  budget=k.budget;
  const patches=[],
  spans=[],
  unresolved=[],
  coverage=[],
  exceptions=[];
  for(let seedIndex=0;seedIndex<seeds.length;seedIndex++){
    budget?.check(2);
    const seed=seeds[seedIndex],
    tangent=rv(seed.b,seed.a),
    p=[seed.a.map(F.q),rv(seed.b,seed.a).map(F.q)],
    covered=[];
    const provenance={
      axisId:seed.axisId,
      seedIndex,
      segmentIndex:seed.segmentIndex,
      componentIndex:seed.componentIndex,
      side,
      seedXY:[xy(p[0]),xy(V(...p))]
    };
    const initial={
      p,
      lo:Z,
      hi:O,
      point:false,
      elapsed:[Z,Z],
      itinerary:[],
      previous:null
    };
    const referenceSpans=reference?.spans.filter(s=>s.seedIndex===seedIndex)??[];
    const cuts=k.roots([Z,O,...referenceSpans.flatMap(s=>[s._state.lo,s._state.hi])]),
    queue=cuts.map(t=>({
      ...initial,
      lo:t,
      hi:t,
      point:true
    }));
    for(let i=1;i<cuts.length;i++)queue.push({
      ...initial,
      lo:cuts[i-1],
      hi:cuts[i],
      point:false
    });
    const meta=s=>({
      ...provenance,
      interval:[F.number(s.lo),F.number(s.hi)],
      parameterBounds:[F.bounds(s.lo),F.bounds(s.hi)],
      stratum:s.point?'point':'open',
      xy:xy(vector(s.p,s.point?s.lo:mid(s.lo,s.hi))),
      ...(k.patchFor(k.faces[0])?{
        patchItinerary:s.patchItinerary??[],
        nativeFrontierFaces:s.itinerary
      }
      :{
        itinerary:s.itinerary
      })
    });
    let count=0;
    const reject=(s,reason,detail)=>{
      covered.push(s);
      unresolved.push({
        ...meta(s),
        reason,
        detail
      });
    };
    while(queue.length){
      budget?.check();
      const state=queue.pop(),
      t=state.point?state.lo:mid(state.lo,state.hi),
      at=vector(state.p,t);
      try {
        if(++count>20000){
          reject(state,'numeric-unresolved','event-partition-cap');
          for(const s of queue)reject(s,'numeric-unresolved','event-partition-cap');
          queue.length=0;
          break;
        }
        const next=k.outgoing(at,tangent,side,policy,state.previous,state.incomingV);
        if(!next){
          reject(state,'ambiguous-flow','no-unique-inward-continuation');
          continue;
        }
        state.face=next.face;
        state.v=next.v;
        const face=state.face,
        v=state.v;
        if(state.itinerary.length>k.faces.length*2+2){
          reject(state,'ambiguous-flow','itinerary-cap');
          continue;
        }
        const orientation=G(cross(state.p[1],v));
        if(!state.point&&(!orientation||state.orientation&&state.orientation!==orientation)){
          reject(state,'folding-band','nonpositive-area-jacobian');
          continue;
        }
        state.orientation=state.orientation??orientation;
        if(corridor&&k.location(at,corridor)<0){
          reject(state,'serialized-width','source-outside-corridor');
          continue;
        }
        const events=[],
        parallel=[],
        extra=[];
        const collect=(a,b,metadata)=>{
          const e=k.event(state.p,v,a,b,metadata);
          if(e)events.push(e);
          else {
            const collinear=[cross(W(a,state.p[0]),v),F.neg(cross(state.p[1],v))];
            extra.push(collinear);
            parallel.push({
              a,
              b,
              collinear,
              ...metadata
            });
          }
        };
        const patch=k.patchFor(face);
        if(patch){
          for(const edge of patch.frontierEdges)collect(edge.a,edge.b,{
            kind:'edge',
            edgeId:edge.edgeId
          });
        }else if(!k.uniformPlane)for(let i=0;i<3;i++)collect(face.vertices[i],face.vertices[(i+1)%3],{
          kind:'edge',
          edgeId:face.edgeIds[i]
        });
        for(const boundary of k.boundaries)for(let i=1;i<boundary.coordinates.length;i++)collect(boundary.coordinates[i-1],boundary.coordinates[i],{
          kind:'boundary',
          boundaryId:boundary.id,
          hole:boundary.hole,
          boundarySegmentIndex:i-1
        });
        if(corridor)for(const b of corridor)for(let i=1;i<b.coordinates.length;i++)collect(b.coordinates[i-1],b.coordinates[i],{
          kind:'corridor'
        });
        // The safety stop is also an exact affine event. It cannot certify a ray.
        events.push({
          kind:corridor?'missing-corridor':'width',
          lambda:[S(corridor?A(halfWidth,F.q(.01)):halfWidth,state.elapsed[0]),F.neg(state.elapsed[1])]
        });
        const stop=events.at(-1);
        const activeEvents=events.filter(e=>{
          const times=[state.lo,state.hi].map(t=>scalar(e.lambda,t));
          if(times.every(l=>G(l)<0))return false;
          if(e!==stop&&[state.lo,state.hi].every(t=>C(scalar(e.lambda,t),scalar(stop.lambda,t))>0))return false;
          if(e.member){
            const us=[state.lo,state.hi].map(t=>scalar(e.member,t));
            if(us.every(u=>G(u)<0)||us.every(u=>C(u,O)>0))return false;
          }
          return true;
        });
        const cells=k.partition(state,activeEvents,extra);
        if(cells.length!==1||cells[0].point!==state.point){
          queue.push(...cells);
          continue;
        }
        const usable=e=>{
          const l=scalar(e.lambda,t);
          if(G(l)<0)return false;
          if(e.member){
            const u=scalar(e.member,t);
            if(G(u)<0||C(u,O)>0)return false;
          }
          return G(l)>0||e.kind!=='edge';
        };
        const candidates=activeEvents.filter(usable).sort((a,b)=>C(scalar(a.lambda,t),scalar(b.lambda,t))||({
          boundary:0,
          corridor:1,
          width:2,
          'missing-corridor':2,
          edge:3
        }
        [a.kind]-{
          boundary:0,
          corridor:1,
          width:2,
          'missing-corridor':2,
          edge:3
        }
        [b.kind]));
        let chosen=null;
        for(const e of candidates){
          if(e.kind==='boundary'||e.kind==='corridor'){
            const hp=vector(k.hit(state,e),t),
            rings=e.kind==='boundary'?k.boundaries:corridor;
            // Boundary intersections beyond the next native edge are never considered.
            if(candidates.some(x=>x.kind==='edge'&&C(scalar(x.lambda,t),scalar(e.lambda,t))<0))continue;
            const nativeTie=candidates.some(x=>x.kind==='edge'&&!C(scalar(x.lambda,t),scalar(e.lambda,t)));
            let forward=v;
            if(nativeTie){
              const continuation=k.outgoing(hp,tangent,side,policy,face,v);
              if(!continuation){
                reject(state,'ambiguous-flow','boundary-native-event-tie');
                chosen=false;
                break;
              }
              forward=continuation.v;
            }
            if(k.after(hp,forward,rings)>=0)continue;
            const backwardRegion=k.after(hp,K(v,F.q(-1)),rings);
            const normal=[F.neg(v[1]),v[0]];
            // Opted-in complete source carriers include exact boundary caps.
            // A regular boundary point may travel tangentially to its first
            // true exit. Only the real domain gate is broadened, never corridor
            // membership/width; all event and endpoint strata stay partitioned.
            const finitePhysicalCapPoint=preservePhysicalSourceCaps&&state.point&&(C(state.lo,Z)===0&&seed.startCap?.kind==='physical-boundary'||C(state.lo,O)===0&&seed.endCap?.kind==='physical-boundary');
            const regularPlaneBoundaryPoint=(allowPlaneBoundaryTangents||finitePhysicalCapPoint)&&k.uniformPlane&&state.point&&e.kind==='boundary'&&backwardRegion===0&&k.after(at,normal)*k.after(at,K(normal,F.q(-1)))===-1;
            if(G(scalar(e.lambda,t))>0&&backwardRegion!==1&&!regularPlaneBoundaryPoint){
              reject(state,'ambiguous-flow','boundary-without-interior-entry');
              chosen=false;
              break;
            }
          }
          chosen=e;
          break;
        }
        if(chosen===false)continue;
        if(!chosen){
          reject(state,'uncovered','no-next-native-event');
          continue;
        }
        if(chosen.kind==='missing-corridor'){
          reject(state,'serialized-width','missing-corridor-exit');
          continue;
        }
        const overlapping=parallel.find(e=>{
          if(e.kind==='edge'||G(scalar(e.collinear,t)))return false;
          const coordinate=G(v[0])?0:1,
          a=F.div(S(e.a[coordinate],at[coordinate]),v[coordinate]),
          b=F.div(S(e.b[coordinate],at[coordinate]),v[coordinate]);
          const lo=C(a,b)<0?a:b,
          hi=C(a,b)>0?a:b;
          return G(hi)>0&&C(lo,scalar(chosen.lambda,t))<0;
        });
        if(overlapping){
          const normal=[F.neg(v[1]),v[0]],
          left=k.after(at,normal),
          right=k.after(at,K(normal,F.q(-1)));
          const regularBoundary=overlapping.kind==='boundary'&&left*right===-1;
          if(!regularBoundary){
            reject(state,'ambiguous-flow',`overlapping-${overlapping.kind}-travel`);
            continue;
          }
        }
        const hit=k.hit(state,chosen),
        elapsed=[A(state.elapsed[0],chosen.lambda[0]),A(state.elapsed[1],chosen.lambda[1])],
        itinerary=state.itinerary.at(-1)===face.id?state.itinerary:[...state.itinerary,face.id];
        const patchItinerary=patch?(state.patchItinerary?.at(-1)===patch.id?state.patchItinerary:[...(state.patchItinerary??[]),patch.id]):undefined;
        budget?.check(6);
        if(collectPatches&&!state.point&&G(scalar(chosen.lambda,t))>0){
          const polygon=[vector(state.p,state.lo),vector(state.p,state.hi),vector(hit,state.hi),vector(hit,state.lo)];
          const cleaned=polygon.filter((p,i)=>k.pointKey(p)!==k.pointKey(polygon[(i+1)%polygon.length]));
          if(cleaned.length>=3){
            const area=cleaned.reduce((s,p,i)=>A(s,cross(p,cleaned[(i+1)%cleaned.length])),Z);
            if(G(area)<0)cleaned.reverse();
            const capEdges=[],physicalSourceCaps=[];
            // These actual flow edges keep the initial true-P butt cap fixed.
            // They constrain only initial boundary-guard construction; every
            // emitted corridor interval is still verified below unchanged.
            if(preservePhysicalSourceCaps){
              budget?.check(4);
              for(const [parameter,cap] of [[Z,seed.startCap],[O,seed.endCap]]){
                budget?.check(1);
                if(cap?.kind!=='physical-boundary'||(C(parameter,Z)===0?C(state.lo,Z)!==0:C(state.hi,O)!==0))continue;
                budget?.check(4);
                const a=vector(state.p,parameter),b=vector(hit,parameter),outward=C(parameter,Z)===0?K(state.p[1],F.q(-1)):state.p[1];
                if(k.pointKey(a)===k.pointKey(b))continue;
                physicalSourceCaps.push({a,b,outward,source:cap,axisId:seed.axisId,componentIndex:seed.componentIndex,segmentIndex:seed.segmentIndex});
              }
            }
            if(!C(state.lo,Z)&&k.location(p[0])===0&&!(preservePhysicalSourceCaps&&seed.startCap?.kind==='physical-boundary'))capEdges.push({
              a:vector(state.p,Z),
              b:vector(hit,Z),
              outward:K(p[1],F.q(-1)),
              source:p[0]
            });
            if(!C(state.hi,O)&&k.location(V(...p))===0&&!(preservePhysicalSourceCaps&&seed.endCap?.kind==='physical-boundary'))capEdges.push({
              a:vector(state.p,O),
              b:vector(hit,O),
              outward:p[1],
              source:V(...p)
            });
            patches.push({
              ...(patch?{
                patchId:patch.id,
                nativeFaceIds:patch.nativeFaceIds
              }
              :{
                faceId:face.id
              }),
              polygon:cleaned,
              seedIndex,
              side,
              capEdges,
              ...(preservePhysicalSourceCaps?{physicalSourceCaps}:{})
            });
            budget?.check(cleaned.length);
          }
        }
        if(chosen.kind==='edge'){
          queue.push({
            ...state,
            p:hit,
            elapsed,
            itinerary,
            patchItinerary,
            previous:face,
            incomingV:v
          });
          continue;
        }
        const record={
          ...meta(state),
          ...(patch?{
            patchItinerary,
            nativeFrontierFaces:itinerary
          }
          :{
            itinerary
          }),
          kind:chosen.kind,
          hitXY:[xy(vector(hit,state.lo)),xy(vector(hit,state.hi))],
          distanceM:[Math.min(...[state.lo,state.hi].map(t=>F.bounds(scalar(elapsed,t))[0])),Math.max(...[state.lo,state.hi].map(t=>F.bounds(scalar(elapsed,t))[1]))],
          boundaryId:chosen.boundaryId,
          hole:chosen.hole,
          firstExit:chosen.kind==='boundary',
          _state:state,
          _hit:hit,
          _elapsed:elapsed
        };
        if(corridor){
          const ref=(state.point?referenceSpans.find(r=>r._state.point&&!C(r._state.lo,state.lo)):null)??referenceSpans.find(r=>!r._state.point&&(state.point?C(r._state.lo,state.lo)<0&&C(r._state.hi,state.lo)>0:C(r._state.lo,state.lo)<=0&&C(r._state.hi,state.hi)>=0));
          if(!ref){
            reject(state,'numeric-unresolved','missing-reference-partition');
            continue;
          }
          if(ref.kind==='boundary'){
            const errors=[state.lo,state.hi].map(t=>F.bounds(S(scalar(elapsed,t),scalar(ref._elapsed,t))));
            const enclosure=[Math.min(...errors.map(e=>e[0])),Math.max(...errors.map(e=>e[1]))];
            if(enclosure[0]<-1e-5||enclosure[1]>1e-5){
              reject(state,'serialized-width','real-clip-displacement-exceeds-ceiling');
              continue;
            }
            record.kind='boundary';
            record.boundaryId=ref.boundaryId;
            record.hole=ref.hole;
            record.firstExit=true;
            record.clippingDisplacementM=enclosure;
            record.referenceBoundaryHitXY=ref.hitXY;
          }
        }
        covered.push(state);
        spans.push(record);
        if(record.kind==='boundary')exceptions.push(record);
      } catch(error){
        if(error.status!=='numeric-unresolved')throw error;
        reject(state,'numeric-unresolved',error.detail);
      }
    }
    let complete=false;
    try{
      complete=k.cover(covered);
    }catch(error){
      if(error.status!=='numeric-unresolved')throw error;
    }
    coverage.push({
      ...provenance,
      complete
    });
    if(!complete)unresolved.push({
      ...provenance,
      reason:'numeric-unresolved',
      detail:'incomplete-seed-cover',
      interval:[0,1]
    });
  }
  return {
    patches,
    spans,
    unresolved,
    exceptions,
    coverage:{
      complete:coverage.every(s=>s.complete),
      seeds:coverage
    }
  };
}
