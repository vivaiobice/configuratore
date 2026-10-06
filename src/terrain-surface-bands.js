import {
  createTerrainBudget
}
from './terrain-budget.js?v=1.3.1-prova.1';
import {
  fromUTM,
  toUTM
}
from './coordinate-system.js?v=1.3.1-prova.1';
import {
  Q,
  rationalSquareRoot,
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  neg,
  dot,
  cross,
  sign,
  cmp,
  vsub,
  scale,
  vadd,
  xy,
  pointKey,
  exactDomain,
  sqrtBounds,
  numberBounds
}
from './terrain-exact.js?v=1.3.1-prova.1';
import {
  axisPieces
}
from './terrain-surface-flow.js?v=1.3.1-prova.1';
import {
  certifyContourElevation
}
from './terrain-contour-validation.js?v=1.3.1-prova.1';
import {
  createAlgebraicField
}
from './terrain-algebraic.js?v=1.3.1-prova.1';
import {
  createBandKernel,
  traceBandBundles
}
from './terrain-geodesic-flow.js?v=1.3.1-prova.1';
/** Compare an outward binary64 enclosure to exact binary-input thresholds.
 * Adding the ceiling in floating point first could admit an extra ULP. */
export function widthBoundsWithin(bounds,centerM) {
  if(!bounds||bounds.length!==2||!bounds.every(Number.isFinite)||bounds[0]>bounds[1])return false;
  const center=Q(centerM),
  ceiling=Q(1e-5);
  return cmp(Q(bounds[0]),sub(center,ceiling))>=0&&cmp(Q(bounds[1]),add(center,ceiling))<=0;
}
const numericFailure=(detail,provenance={
})=>Object.assign(new Error(detail),{
  provenance,
  status:'numeric-unresolved',
  detail
});
const publicSpan=span=>Object.fromEntries(Object.entries(span).filter(([key])=>!key.startsWith('_')));
function polygonArea(k,polygon) {
  return k.F.div(polygon.reduce((sum,p,i)=>k.A(sum,k.cross(p,polygon[(i+1)%polygon.length])),k.Z),k.F.q(2));
}
function clipConvex(k,subject,clip) {
  let out=subject;
  const orientation=k.G(polygonArea(k,clip));
  for(let i=0;i<clip.length&&out.length;i++){
    const a=clip[i],
    b=clip[(i+1)%clip.length],
    input=out;
    out=[];
    for(let j=0;j<input.length;j++){
      k.budget?.check();
      const p=input[j],
      q=input[(j+1)%input.length],
      dp=k.orient(a,b,p),
      dq=k.orient(a,b,q),
      sp=k.G(dp)*orientation,
      sq=k.G(dq)*orientation;
      if(sp>=0)out.push(p);
      if(sp*sq<0){
        const t=k.F.div(dp,k.S(dp,dq));
        out.push(k.V(p,k.K(k.W(q,p),t)));
        k.budget?.check(1);
      }
    }
  }
  return out;
}
function bounds(k,polygon) {
  const intervals=polygon.map(p=>p.map(k.F.bounds));
  return [Math.min(...intervals.map(p=>p[0][0])),Math.min(...intervals.map(p=>p[1][0])),Math.max(...intervals.map(p=>p[0][1])),Math.max(...intervals.map(p=>p[1][1]))];
}
const overlap=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
/** Since positive-area overlaps are rejected, the face union is an exact edge
 * arrangement: split every collinear seam at every endpoint, cancel opposite
 * fragments, and require a one-in/one-out boundary graph. No floating clipping
 * library can silently change this topology. */
function unitePatches(k,patches) {
  const polygons=patches.map(p=>({
    ...p,
    bounds:bounds(k,p.polygon)
  }));
  for(let i=0;i<polygons.length;i++)for(let j=0;j<i;j++){
    k.budget?.check();
    const a=polygons[i],
    b=polygons[j];
    if((a.patchId??a.faceId)!==(b.patchId??b.faceId)||!overlap(a.bounds,b.bounds))continue;
    const clipped=clipConvex(k,a.polygon,b.polygon);
    if(clipped.length>=3&&k.G(polygonArea(k,clipped)))throw numericFailure('overlapping-normal-patches');
  }
  const edges=polygons.flatMap(p=>p.polygon.map((a,i)=>({
    a,
    b:p.polygon[(i+1)%p.polygon.length]
  }))).filter(e=>k.pointKey(e.a)!==k.pointKey(e.b));
  for(const edge of edges)edge.bounds=bounds(k,[edge.a,edge.b]);
  const fragments=new Map();
  for(const e of edges){
    const delta=k.W(e.b,e.a),
    coordinate=k.G(delta[0])?0:1,
    ts=[k.Z,k.O];
    for(const other of edges){
      k.budget?.check();
      if(!overlap(e.bounds,other.bounds))continue;
      for(const p of [other.a,other.b])if(k.onSegment(p,e.a,e.b))ts.push(k.F.div(k.S(p[coordinate],e.a[coordinate]),delta[coordinate]));
    }
    const sorted=k.roots(ts);
    for(let i=1;i<sorted.length;i++){
      const a=k.V(e.a,k.K(delta,sorted[i-1])),
      b=k.V(e.a,k.K(delta,sorted[i])),
      ak=k.pointKey(a),
      bk=k.pointKey(b),
      id=`${ak}>${bk}`,
      reverse=`${bk}>${ak}`;
      k.budget?.check(2);
      if(fragments.has(reverse))fragments.delete(reverse);
      else if(fragments.has(id))throw numericFailure('duplicate-union-edge');
      else fragments.set(id,{
        a,
        b,
        ak,
        bk
      });
    }
  }
  const outgoing=new Map(),
  incoming=new Map();
  for(const e of fragments.values()){
    if(outgoing.has(e.ak)||incoming.has(e.bk))throw numericFailure('nonmanifold-band-boundary');
    outgoing.set(e.ak,e);
    incoming.set(e.bk,e);
  }
  const rings=[];
  while(outgoing.size){
    const first=outgoing.values().next().value,
    ring=[],
    start=first.ak;
    let edge=first;
    do {
      k.budget?.check(1);
      ring.push(edge.a);
      outgoing.delete(edge.ak);
      if(edge.bk===start)break;
      edge=outgoing.get(edge.bk);
      if(!edge)throw numericFailure('open-band-boundary');
    }
    while(ring.length<=fragments.size);
    if(edge.bk!==start)throw numericFailure('union-cycle');
    let simplified=ring,
    changed=true;
    while(changed&&simplified.length>3){
      changed=false;
      const next=simplified.filter((p,i)=>{
        const remove=!k.G(k.orient(simplified[(i+simplified.length-1)%simplified.length],p,simplified[(i+1)%simplified.length]));
        if(remove)changed=true;
        return !remove;
      });
      simplified=next;
    }
    rings.push(simplified);
  }
  const outers=rings.filter(r=>k.G(polygonArea(k,r))>0),
  holes=rings.filter(r=>k.G(polygonArea(k,r))<0),
  polys=outers.map(r=>[r]);
  for(const hole of holes){
    const choices=polys.filter(p=>k.location(hole[0],[{
      polygonIndex:0,
      ringIndex:0,
      coordinates:[...p[0],p[0][0]]
    }])>0);
    if(choices.length!==1)throw numericFailure('ambiguous-band-hole');
    choices[0].push(hole);
  }
  return polys;
}
// A construction vertex can move outward only on a positive-length edge
// already certified as a real clip. The physical geometry is the intersection
// with that same domain, so these guards never supply exterior surface area.
function boundaryGuards(k,polygons,patches,boundaryGuardM) {
  const shifts=new Map(),
  provenance=[];
  for(const rings of polygons)for(const ring of rings)for(let i=0;i<ring.length;i++){
    const a=ring[i],
    b=ring[(i+1)%ring.length];
    for(const boundary of k.boundaries)for(let j=1;j<boundary.coordinates.length;j++){
      const u=boundary.coordinates[j-1],
      v=boundary.coordinates[j];
      if(!k.onSegment(a,u,v)||!k.onSegment(b,u,v)||k.pointKey(a)===k.pointKey(b))continue;
      const edge=k.W(v,u),
      mid=k.K(k.V(a,b),k.F.q(.5));
      let normal=[k.F.neg(edge[1]),edge[0]];
      if(k.after(mid,normal)>=0)normal=k.K(normal,k.F.q(-1));
      const magnitude=normal.map(x=>k.G(x)<0?k.F.neg(x):x).reduce((a,b)=>k.C(a,b)>0?a:b),
      delta=k.K(normal,k.F.div(k.F.q(boundaryGuardM),magnitude));
      for(const p of [a,b]){
        const key=k.pointKey(p),
        old=shifts.get(key)??new Map();
        old.set(`${boundary.id}:${j}`,delta);
        shifts.set(key,old);
      }
      provenance.push({
        boundaryId:boundary.id,
        boundarySegmentIndex:j-1,
        edgeXY:[k.xy(a),k.xy(b)]
      });
    }
  }
  for(const cap of patches.flatMap(p=>p.capEdges??[])){
    const magnitude=cap.outward.map(x=>k.G(x)<0?k.F.neg(x):x).reduce((a,b)=>k.C(a,b)>0?a:b);
    if(!k.G(magnitude))continue;
    const delta=k.K(cap.outward,k.F.div(k.F.q(boundaryGuardM),magnitude));
    for(const rings of polygons)for(const ring of rings)for(const p of ring){
      if(!k.onSegment(p,cap.a,cap.b))continue;
      const key=k.pointKey(p),
      old=shifts.get(key)??new Map();
      old.set(`cap:${k.pointKey(cap.source)}`,delta);
      shifts.set(key,old);
    }
    provenance.push({
      kind:'clipped-source-cap',
      sourceXY:k.xy(cap.source),
      edgeXY:[k.xy(cap.a),k.xy(cap.b)]
    });
  }
  let maxDistance=k.Z;
  const shifted=polygons.map(rings=>rings.map(ring=>ring.map(p=>{
    const moves=shifts.get(k.pointKey(p));
    if(!moves)return p;
    const delta=[...moves.values()].reduce(k.V,[k.Z,k.Z]),
    distance=k.dot(delta,delta);
    if(k.C(distance,maxDistance)>0)maxDistance=distance;
    k.budget?.check(1);
    return k.V(p,delta);
  })));
  return {
    polygons:shifted,
    provenance,
    maxDistanceSquared:maxDistance
  };
}
function lineIntersections(k,a,b,c,d) {
  const u=k.W(b,a),
  v=k.W(d,c),
  w=k.W(c,a),
  den=k.cross(u,v),
  inside=t=>k.G(t)>=0&&k.C(t,k.O)<=0;
  if(k.G(den)){
    const t=k.F.div(k.cross(w,v),den),
    s=k.F.div(k.cross(w,u),den);
    return inside(t)&&inside(s)?[t]:[];
  }
  if(k.G(k.cross(w,u)))return [];
  const i=k.G(u[0])?0:1;
  if(!k.G(u[i]))return [];
  return [k.F.div(k.S(c[i],a[i]),u[i]),k.F.div(k.S(d[i],a[i]),u[i])].filter(inside);
}
function ringsFromEdges(k,edges) {
  const outgoing=new Map(),
  incoming=new Map();
  for(const e of edges){
    const a=k.pointKey(e.a),
    b=k.pointKey(e.b);
    if(a===b)continue;
    if(outgoing.has(a)||incoming.has(b))throw numericFailure('ambiguous-intersection-topology');
    outgoing.set(a,{
      ...e,
      aKey:a,
      bKey:b
    });
    incoming.set(b,a);
  }
  const rings=[];
  while(outgoing.size){
    const first=outgoing.values().next().value,
    ring=[];
    let edge=first;
    do {
      ring.push(edge.a);
      outgoing.delete(edge.aKey);
      if(edge.bKey===first.aKey)break;
      edge=outgoing.get(edge.bKey);
      if(!edge)throw numericFailure('open-intersection-topology');
    }
    while(ring.length<=edges.length);
    if(edge.bKey!==first.aKey)throw numericFailure('intersection-cycle');
    rings.push([...ring,ring[0]]);
    k.budget?.check(ring.length+1);
  }
  const outer=rings.filter(r=>k.G(polygonArea(k,r.slice(0,-1)))>0),
  holes=rings.filter(r=>k.G(polygonArea(k,r.slice(0,-1)))<0),
  result=outer.map((coordinates,polygonIndex)=>({
    polygonIndex,
    ringIndex:0,
    coordinates
  }));
  for(const hole of holes){
    const owners=outer.map((r,i)=>({
      r,
      i
    })).filter(({
      r
    })=>k.location(hole[0],[{
      polygonIndex:0,
      ringIndex:0,
      coordinates:r
    }])>0);
    if(owners.length!==1)throw numericFailure('ambiguous-intersection-hole');
    const polygonIndex=owners[0].i;
    result.push({
      polygonIndex,
      ringIndex:result.filter(r=>r.polygonIndex===polygonIndex).length,
      hole:true,
      coordinates:hole
    });
  }
  return result;
}
/** Exact regular polygon intersection, including holes. Nonmanifold point
 * contacts are unresolved; an epsilon never decides that topology. */
function intersectRegions(k,left,right,operation='intersection') {
  const edgeList=(rings,reverse=false)=>rings.flatMap(r=>{
    const points=[...r.coordinates],
    desired=(r.ringIndex===0?1:-1)*(reverse?-1:1);
    if(k.G(polygonArea(k,points.slice(0,-1)))!==desired)points.reverse();
    return points.slice(1).map((p,i)=>({
      a:points[i],
      b:p
    }));
  }),
  a=edgeList(left),
  b=edgeList(right,operation==='difference'),
  kept=new Map();
  const collect=(edges,other,otherRings,outside=false)=>{
    for(const edge of edges){
      const parameters=[k.Z,k.O];
      for(const e of other){
        k.budget?.check();
        parameters.push(...lineIntersections(k,edge.a,edge.b,e.a,e.b));
      }
      const ts=k.roots(parameters),
      v=k.W(edge.b,edge.a);
      for(let i=1;i<ts.length;i++){
        const p=k.V(edge.a,k.K(v,ts[i-1])),
        q=k.V(edge.a,k.K(v,ts[i])),
        mid=k.K(k.V(p,q),k.F.q(.5)),
        where=k.location(mid,otherRings);
        if(outside?where>0:where<0)continue;
        if(!where){
          const n=[k.F.neg(v[1]),v[0]],
          wanted=outside&&operation!=='union'?-1:1;
          if(k.after(mid,n,otherRings)!==wanted)continue;
        }
        const id=`${k.pointKey(p)}>${k.pointKey(q)}`;
        kept.set(id,{
          a:p,
          b:q
        });
        k.budget?.check(2);
      }
    }
  };
  collect(a,b,right,operation!=='intersection');
  collect(b,a,left,operation==='union');
  return ringsFromEdges(k,[...kept.values()]);
}
function topologyContacts(k,ideal,actual,boundaries=k.boundaries) {
  const contactSignature=(rings,a,b)=>{
    const roots=[k.Z,k.O],
    v=k.W(b,a);
    for(const ring of rings)for(let i=1;i<ring.coordinates.length;i++)roots.push(...lineIntersections(k,a,b,ring.coordinates[i-1],ring.coordinates[i]));
    const ts=k.roots(roots),
    cells=[];
    for(let i=1;i<ts.length;i++)cells.push(k.location(k.V(a,k.K(v,k.mid(ts[i-1],ts[i]))),rings)>=0);
    let intervals=0;
    for(let i=0;i<cells.length;i++)if(cells[i]&&!cells[i-1])intervals++;
    let isolated=0;
    for(let i=0;i<ts.length;i++)if(!cells[i-1]&&!cells[i]&&k.location(k.V(a,k.K(v,ts[i])),rings)>=0)isolated++;
    // A guard may widen an already intended vertex contact into a short
    // interval. Its connected contact component and endpoint identities must
    // survive; merging separated contacts or reaching an untouched edge fails.
    return `${intervals+isolated}:${k.location(a,rings)>=0}:${k.location(b,rings)>=0}`;
  };
  for(const boundary of boundaries)for(let i=1;i<boundary.coordinates.length;i++){
    const a=boundary.coordinates[i-1],
    b=boundary.coordinates[i];
    const before=contactSignature(ideal,a,b),
    after=contactSignature(actual,a,b);
    if(before!==after)throw numericFailure('serialization-changed-boundary-contact-topology',{
      boundaryId:boundary.id,
      boundarySegmentIndex:i-1,
      xy:k.xy(a),
      contactBefore:before,
      contactAfter:after
    });
  }
}
function assertSimpleRings(k,rings) {
  const edges=rings.flatMap((ring,ringIndex)=>ring.coordinates.slice(1).map((b,i)=>({
    a:ring.coordinates[i],
    b,
    ringIndex,
    index:i,
    count:ring.coordinates.length-1,
    bounds:bounds(k,[ring.coordinates[i],b])
  })));
  for(let i=0;i<edges.length;i++)for(let j=0;j<i;j++){
    k.budget?.check();
    const a=edges[i],
    b=edges[j];
    if(a.ringIndex===b.ringIndex&&(Math.abs(a.index-b.index)===1||Math.abs(a.index-b.index)===a.count-1))continue;
    if(!overlap(a.bounds,b.bounds))continue;
    if(lineIntersections(k,a.a,a.b,b.a,b.b).length)throw numericFailure('serialized-self-intersection',{
      xy:k.xy(a.a)
    });
  }
  for(const ring of rings){
    const expected=ring.ringIndex===0?1:-1;
    if(k.G(polygonArea(k,ring.coordinates.slice(0,-1)))!==expected)throw numericFailure('serialized-ring-orientation',{
      xy:k.xy(ring.coordinates[0])
    });
  }
}
function geographicScope(k,domain,epsg) {
  const geometry=domain.geometry??{
    type:'MultiPolygon',
    coordinates:[...new Set(k.boundaries.map(b=>b.polygonIndex))].map(id=>k.boundaries.filter(b=>b.polygonIndex===id).map(b=>b.coordinates.map(p=>fromUTM(k.xy(p),epsg))))
  };
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return {
    geometry,
    rings:polygons.flatMap((rings,polygonIndex)=>rings.map((ring,ringIndex)=>({
      polygonIndex,
      ringIndex,
      coordinates:ring.map(p=>p.map(k.F.q))
    })))
  };
}
function topologyType(rings) {
  const components=rings.filter(r=>r.ringIndex===0).length,
  holes=rings.filter(r=>r.ringIndex>0).length;
  return `${components}:${holes}`;
}
function certifyScopedTopology(k,ideal,actual,scoped,geometry,domain,epsg) {
  const beforeDifference=intersectRegions(k,k.boundaries,ideal,'difference'),
  afterDifference=intersectRegions(k,k.boundaries,actual,'difference');
  if(topologyType(beforeDifference)!==topologyType(afterDifference))throw numericFailure('guard-changed-interior-topology');
  const scope=geographicScope(k,domain,epsg),
  geoActual=geometry.coordinates.flatMap((rings,polygonIndex)=>rings.map((ring,ringIndex)=>({
    polygonIndex,
    ringIndex,
    coordinates:ring.map(p=>p.map(k.F.q))
  })));
  // The geographic reference retains intended real-boundary incidence by its
  // exact original segment parameter. This is a topology reference, never a
  // claim that an inverse-projected XY segment is a straight WGS segment.
  const geoReference=p=>{
    for(const boundary of k.boundaries){
      const target=scope.rings.find(r=>r.polygonIndex===boundary.polygonIndex&&r.ringIndex===boundary.ringIndex);
      for(let i=1;i<boundary.coordinates.length;i++){
        const a=boundary.coordinates[i-1],
        b=boundary.coordinates[i];
        if(!k.onSegment(p,a,b))continue;
        const delta=k.W(b,a),
        coordinate=k.G(delta[0])?0:1,
        t=k.F.div(k.S(p[coordinate],a[coordinate]),delta[coordinate]);
        return k.V(target.coordinates[i-1],k.K(k.W(target.coordinates[i],target.coordinates[i-1]),t));
      }
    }
    return fromUTM(k.xy(p),epsg).map(k.F.q);
  };
  const geoIdeal=ideal.map(r=>({
    ...r,
    coordinates:r.coordinates.map(geoReference)
  }));
  try {
    assertSimpleRings(k,geoActual);
    topologyContacts(k,geoIdeal,geoActual,scope.rings);
    const before=intersectRegions(k,scope.rings,geoIdeal,'difference'),
    after=intersectRegions(k,scope.rings,geoActual,'difference'),
    geoBand=intersectRegions(k,geoActual,scope.rings);
    if(topologyType(before)!==topologyType(after)||topologyType(after)!==topologyType(afterDifference)||topologyType(geoBand)!==topologyType(scoped))throw numericFailure('geographic-projected-topology-mismatch');
  }catch(error){
    if(error.status!=='numeric-unresolved')throw error;
    throw numericFailure(`projection-readiness:${error.detail}`,error.provenance);
  }
  return {
    scopeGeometry:scope.geometry,
    projectedBand:topologyType(scoped),
    projectedRemainder:topologyType(afterDifference),
    geographicAgrees:true
  };
}
function serializedRings(k,geometry,epsg) {
  return geometry.coordinates.flatMap((rings,polygonIndex)=>rings.map((ring,ringIndex)=>({
    id:`serialized:${polygonIndex}:${ringIndex}`,
    polygonIndex,
    ringIndex,
    hole:ringIndex>0,
    coordinates:ring.map(p=>{
      k.budget?.check(1);
      return toUTM(p,epsg).map(x=>k.F.q(x));
    })
  })));
}
const planeSupport=new WeakMap();
function completePlaneSupport(k) {
  if(!k.uniformPlane)return null;
  if(planeSupport.has(k.exact))return planeSupport.get(k.exact);
  const edges=[];
  for(const edge of k.edges.values()){
    k.budget?.check();
    if(edge.faces.length>2)return null;
    if(edge.faces.length!==1)continue;
    const face=edge.faces[0],
    orientation=k.G(polygonArea(k,face.vertices));
    for(let i=0;i<3;i++){
      const a=face.vertices[i],
      b=face.vertices[(i+1)%3];
      const matches=k.onSegment(a,edge.a,edge.b)&&k.onSegment(b,edge.a,edge.b);
      if(matches)edges.push(orientation>0?{
        a,
        b
      }
      :{
        a:b,
        b:a
      });
    }
  }
  const support=ringsFromEdges(k,edges);
  if(intersectRegions(k,k.boundaries,support,'difference').length)return null;
  const certificate=Object.freeze({
    complete:true,
    method:'exact-native-support-difference',
    modelHash:k.exact.domain.modelHash??null,
    nativeFaceCount:k.faces.length
  });
  planeSupport.set(k.exact,certificate);
  return certificate;
}
/** Shared eligibility proof. A missing native patch or nonuniform plane never
 * authorizes suppression of native events. Calls occur after ESM setup only. */
export function certifyUniformPlaneSupport(domain,budget) {
  const exact=exactDomain(domain,budget);
  const k=createBandKernel(exact,createAlgebraicField(budget),budget);
  try{
    return completePlaneSupport(k);
  }
  catch(error){
    if(error.status!=='numeric-unresolved')throw error;
    return null;
  }
}
const patchSupportCache=new WeakMap();
function completePatchSupport(k) {
  let cached=patchSupportCache.get(k.exact);
  if(!cached){
    const index=k.patchIndex(),
    patches=[];
    const oriented=edge=>{
      const face=k.byId.get(edge.faceId);
      return k.G(polygonArea(k,face.vertices))>0?{
        a:edge.a,
        b:edge.b
      }
      :{
        a:edge.b,
        b:edge.a
      };
    };
    const allEdges=new Map();
    let nodeCount=0;
    for(const patch of index.patches){
      const edges=patch.frontierEdges.map(oriented);
      let rings=ringsFromEdges(k,edges);
      assertSimpleRings(k,rings);
      const outers=rings.filter(r=>r.ringIndex===0);
      for(let i=0;i<outers.length;i++)for(let j=0;j<i;j++){
        if(k.location(outers[i].coordinates[0],[outers[j]])>=0||k.location(outers[j].coordinates[0],[outers[i]])>=0)throw numericFailure('overlapping-native-patch-components');
      }
      const nativeArea=patch.nativeFaceIds.reduce((sum,id)=>{
        const value=polygonArea(k,k.byId.get(id).vertices);
        return k.A(sum,k.G(value)<0?k.F.neg(value):value);
      },k.Z);
      if(k.C(nativeArea,k.F.q(rationalArea(k,rings))))throw numericFailure('incomplete-native-patch-union');
      for(const edge of edges){
        const id=`${k.pointKey(edge.a)}>${k.pointKey(edge.b)}`,
        reverse=`${k.pointKey(edge.b)}>${k.pointKey(edge.a)}`;
        if(allEdges.has(reverse))allEdges.delete(reverse);
        else if(allEdges.has(id))throw numericFailure('overlapping-native-patch-edge');
        else allEdges.set(id,edge);
      }
      // Area serialization may remove an exactly collinear redundant vertex.
      // Flow still uses every original native frontier segment and point event.
      rings=rings.map(r=>{
        let points=r.coordinates.slice(0,-1),
        changed=true;
        while(changed&&points.length>3){
          changed=false;
          const next=points.filter((p,i)=>{
            const a=points[(i+points.length-1)%points.length],
            b=points[(i+1)%points.length];
            if(!k.G(k.orient(a,p,b))&&k.G(k.dot(k.W(p,a),k.W(b,p)))>0){
              changed=true;
              return false;
            }
            return true;
          });
          points=next;
        }
        return {
          ...r,
          coordinates:[...points,points[0]]
        };
      });
      const rationalRings=Object.freeze(rings.map(r=>Object.freeze({
        ...r,
        coordinates:Object.freeze(r.coordinates.map(p=>{
          k.budget?.check(1);
          nodeCount++;
          return Object.freeze(p.map(v=>Object.freeze({
            ...k.F.rational(v)
          })));
        }))
      })));
      const geometryXY=Object.freeze({
        type:'MultiPolygon',
        coordinates:Object.freeze(ringPolygons(k,rings).map(p=>Object.freeze(p.map(r=>Object.freeze(r.map(Object.freeze))))))
      });
      nodeCount+=rings.reduce((sum,r)=>sum+r.coordinates.length,0);
      patches.push(Object.freeze({
        patchId:patch.id,
        nativeFaceIds:patch.nativeFaceIds,
        rings:rationalRings,
        geometryXY
      }));
    }
    const support=ringsFromEdges(k,[...allEdges.values()]);
    assertSimpleRings(k,support);
    if(intersectRegions(k,k.boundaries,support,'difference').length)throw numericFailure('incomplete-native-patch-support');
    // Positive native triangles plus exact opposite-edge cancellation and a
    // simple oriented boundary prove the patch union, including its holes.
    const certificate=Object.freeze({
      complete:true,
      method:'exact-connected-native-patch-unions-and-support-difference',
      modelHash:k.exact.domain.modelHash??null,
      nativeFaceCount:k.faces.length
    });
    cached={
      index,
      patches:Object.freeze(patches),
      certificate,
      nodeCount,
      charged:new WeakSet(k.budget?[k.budget]:[])
    };
    patchSupportCache.set(k.exact,cached);
  }else{
    k.budget?.check(cached.charged.has(k.budget)?0:cached.nodeCount);
    if(k.budget)cached.charged.add(k.budget);
  }
  return {
    ...cached,
    patches:cached.patches.map(p=>({
      ...p,
      rings:p.rings.map(r=>({
        ...r,
        coordinates:r.coordinates.map(point=>{
          k.budget?.check(1);
          return point.map(k.F.q);
        })
      }))
    }))
  };
}
function optionalPatchSupport(k,areaMode) {
  if(areaMode!=='coplanar-patches')return null;
  try{
    return completePatchSupport(k);
  }
  catch(error){
    if(error.status!=='numeric-unresolved')throw error;
    return null;
  }
}
// Exact measured area expressions are transient and inaccessible to JSON.
// A copied or edited public measurement does not inherit its proof. The terms
// come only from the actual scoped polygon integration below.
const measuredAreaEvidence=new WeakMap();
function bindMeasuredArea(result,terms) {
  measuredAreaEvidence.set(result,{
    terms:Object.freeze(terms.map(([coefficient,radicand])=>Object.freeze([
    Object.freeze({
      ...coefficient
    }),Object.freeze({
      ...radicand
    })
    ]))),
    bounds:Object.freeze([...result.areaBoundsM2]),
    fingerprint:JSON.stringify(result)
  });
  return result;
}
function measuredAreaResult(interval,terms,metadata) {
  return bindMeasuredArea({
    ...publicArea(interval),
    ...metadata
  },terms);
}
function copyMeasuredAreaEvidence(result,source) {
  return bindMeasuredArea(result,measuredAreaEvidence.get(source).terms);
}
const unresolvedAreaOrder=detail=>Object.assign(new Error(`area-order-unresolved: ${detail}`),{
  status:'area-order-unresolved',
  detail
});
/** Return the proved sign of a-b. Bounds are refined as exact rationals;
 * overlapping binary64 enclosures never authorize a secondary-score tie. */
export function compareMeasuredSurfaceAreas(a,b,{
  budget,
  maxRefinementBits=1024
}={
}) {
  try {
    budget?.check();
    const left=measuredAreaEvidence.get(a),
    right=measuredAreaEvidence.get(b);
    if(!left||!right)throw unresolvedAreaOrder('missing-measured-area-evidence');
    if(left.fingerprint!==JSON.stringify(a)||right.fingerprint!==JSON.stringify(b))throw unresolvedAreaOrder('changed-measured-area-evidence');
    budget?.check();
    if(left.bounds[0]>right.bounds[1])return 1;
    if(left.bounds[1]<right.bounds[0])return -1;
    const groups=[];
    for(const [coefficient,radicand] of [...left.terms,...right.terms.map(([c,r])=>[neg(c),r])]){
      budget?.check();
      if(!sign(coefficient))continue;
      let matched=false;
      for(const group of groups){
        budget?.check();
        const ratio=rationalSquareRoot(div(radicand,group.radicand),budget);
        if(ratio){
          group.coefficient=add(group.coefficient,mul(coefficient,ratio));
          matched=true;
          break;
        }
      }
      if(!matched)groups.push({
        coefficient,
        radicand
      });
    }
    const terms=groups.filter(group=>sign(group.coefficient));
    if(!terms.length)return 0;
    for(const bits of [32,64,128,256,512,1024]){
      if(bits>maxRefinementBits)break;
      let lower=ZERO,
      upper=ZERO;
      for(const {
        coefficient,
        radicand
      }
      of terms){
        budget?.check();
        const interval=sqrtBounds(radicand,bits),
        negative=sign(coefficient)<0;
        lower=add(lower,mul(coefficient,interval[negative?1:0]));
        upper=add(upper,mul(coefficient,interval[negative?0:1]));
      }
      budget?.check();
      if(sign(lower)>0)return 1;
      if(sign(upper)<0)return -1;
      if(!sign(lower)&&!sign(upper))return 0;
    }
    throw unresolvedAreaOrder('bounded-root-refinement-exhausted');
  }catch(error){
    if(error.status==='budget-exceeded')throw unresolvedAreaOrder('comparison-budget-exceeded');
    throw error;
  }
}
function patchArea(k,regions,proof) {
  const terms=[];
  let total=[ZERO,ZERO];
  for(const patch of proof.patches){
    const pieces=regions.map(region=>intersectRegions(k,region,patch.rings));
    const area=pieces.length===1?rationalArea(k,pieces[0]):unionArea(k,pieces);
    if(!sign(area))continue;
    const face=k.byId.get(patch.nativeFaceIds[0]);
    const term=measuredTerm(area,add(ONE,face.raw.q),k.budget,terms);
    total=total.map((v,i)=>add(v,term[i]));
  }
  return measuredAreaResult(total,terms,{
    actualGeometry:{
      representation:'coplanar-patches',
      geometryConvention:'union-of-domain-and-patch-intersections',
      patches:proof.patches.map(({
        patchId,
        nativeFaceIds,
        geometryXY
      })=>({
        patchId,
        nativeFaceIds,
        geometryXY
      })),
      support:proof.certificate
    }
  });
}
function measuredTerm(area,factor,budget,terms) {
  budget?.check();
  terms?.push([area,factor]);
  const [lo,hi]=sqrtBounds(factor);
  return [mul(area,lo),mul(area,hi)];
}
function publicArea(interval) {
  const areaBoundsM2=[numberBounds(interval[0])[0],numberBounds(interval[1])[1]];
  return {
    areaM2:areaBoundsM2[0]+(areaBoundsM2[1]-areaBoundsM2[0])/2,
    areaBoundsM2
  };
}
function ringPolygons(k,rings) {
  const polygons=[];
  for(const ring of rings){
    if(!polygons[ring.polygonIndex])polygons[ring.polygonIndex]=[];
    polygons[ring.polygonIndex][ring.ringIndex]=ring.coordinates.map(k.xy);
    k.budget?.check(ring.coordinates.length);
  }
  return polygons;
}
function rationalArea(k,rings) {
  const area=rings.reduce((sum,r)=>k.A(sum,polygonArea(k,r.coordinates.slice(0,-1))),k.Z);
  const value=k.F.rational(area);
  if(!value)throw numericFailure('nonrational-actual-footprint-area');
  if(sign(value)<0)throw numericFailure('negative-face-union-area');
  return value;
}
// Area needs the boundary chain, not a one-in/one-out polygon serialization.
// Point-touching service bands can form a valid union with a nonmanifold
// boundary vertex. Split every exact crossing, classify each open edge cell
// against every other operand, and integrate each retained oriented edge once.
function unionArea(k,regions) {
  const edges=regions.flatMap((rings,owner)=>rings.flatMap(r=>{
    let points=r.coordinates.slice(0,-1);
    if(k.G(polygonArea(k,points))!==(r.ringIndex===0?1:-1))points=points.toReversed();
    return points.map((a,i)=>({
      a,
      b:points[(i+1)%points.length],
      owner
    }));
  }));
  for(const edge of edges)edge.bounds=bounds(k,[edge.a,edge.b]);
  const kept=new Map();
  for(const edge of edges){
    const ts=[k.Z,k.O];
    for(const other of edges){
      k.budget?.check();
      if(edge.owner===other.owner||!overlap(edge.bounds,other.bounds))continue;
      ts.push(...lineIntersections(k,edge.a,edge.b,other.a,other.b));
    }
    const sorted=k.roots(ts),
    v=k.W(edge.b,edge.a);
    for(let i=1;i<sorted.length;i++){
      const p=k.V(edge.a,k.K(v,sorted[i-1])),
      q=k.V(edge.a,k.K(v,sorted[i])),
      mid=k.K(k.V(p,q),k.F.q(.5));
      let exterior=true;
      for(let owner=0;owner<regions.length&&exterior;owner++){
        if(owner===edge.owner)continue;
        const where=k.location(mid,regions[owner]);
        if(where>0)exterior=false;
        else if(!where&&k.after(mid,[k.F.neg(v[1]),v[0]],regions[owner])!==1)exterior=false;
      }
      if(exterior)kept.set(`${k.pointKey(p)}>${k.pointKey(q)}`,{
        a:p,
        b:q
      });
    }
  }
  const area=k.F.div([...kept.values()].reduce((sum,e)=>k.A(sum,k.cross(e.a,e.b)),k.Z),k.F.q(2));
  const rational=k.F.rational(area);
  if(!rational||sign(rational)<0)throw numericFailure('invalid-exact-union-area');
  return rational;
}
function actualArea(k,rings,areaMode='per-face') {
  const patches=optionalPatchSupport(k,areaMode);
  if(patches)return patchArea(k,[rings],patches);
  const terms=[];
  const support=areaMode==='constant-plane'?completePlaneSupport(k):null;
  if(support){
    const interval=measuredTerm(rationalArea(k,rings),add(ONE,k.faces[0].raw.q),k.budget,terms);
    return measuredAreaResult(interval,terms,{
      actualGeometry:{
        representation:'constant-plane',
        geometryXY:{
          type:'MultiPolygon',
          coordinates:ringPolygons(k,rings)
        },
        support,
        geometryConvention:'domain-intersection',
        surfaceFactorBounds:sqrtBounds(add(ONE,k.faces[0].raw.q)).map((r,i)=>numberBounds(r)[i])
      }
    });
  }
  const perFace=[];
  let total=[ZERO,ZERO];
  const extent=rings.length?bounds(k,rings.flatMap(r=>r.coordinates)):null;
  for(const face of extent?k.queryBounds(extent):[]){
    k.budget?.check();
    const triangle=[...face.vertices];
    if(k.G(polygonArea(k,triangle))<0)triangle.reverse();
    const pieces=intersectRegions(k,rings,[{
      polygonIndex:0,
      ringIndex:0,
      coordinates:[...triangle,triangle[0]]
    }]);
    const area=rationalArea(k,pieces);
    if(!sign(area))continue;
    const interval=measuredTerm(area,add(ONE,face.raw.q),k.budget,terms);
    total=total.map((value,i)=>add(value,interval[i]));
    perFace.push({
      faceId:face.id,
      polygons:ringPolygons(k,pieces),
      ...publicArea(interval)
    });
  }
  return measuredAreaResult(total,terms,{
    perFace,
    actualGeometry:{
      representation:'per-face',
      geometryConvention:'domain-intersection'
    }
  });
}
/** Integrate a literal XY footprint intersected with the bound domain. Area
 * roots are enclosed independently of trajectory algebra. This does not
 * certify a width or a source axis. */
export function measureSurfaceFootprint({
  domain,
  geometryXY,
  areaMode='per-face',
  budget=createTerrainBudget({
    kind:'measure'
  })
}) {
  return measureSurfaceUnion({
    domain,
    geometriesXY:[geometryXY],
    areaMode,
    budget
  });
}
/** Exact union of actual XY footprints, followed by real-domain intersection.
 * The same representation is used for coverage and removed headland regions;
 * no exterior construction guard or overlapping area is counted twice. */
export function measureSurfaceUnion({
  domain,
  geometriesXY,
  areaMode='per-face',
  budget=createTerrainBudget({
    kind:'measure'
  })
}) {
  const exact=exactDomain(domain,budget),
  k=createBandKernel(exact,createAlgebraicField(budget),budget);
  const regions=[];
  for(const geometryXY of geometriesXY){
    const next=geometryXY.coordinates.flatMap((polygon,polygonIndex)=>polygon.map((ring,ringIndex)=>({
      polygonIndex,
      ringIndex,
      coordinates:ring.map(p=>{
        budget.check(1);
        return p.map(k.F.q);
      })
    })));
    regions.push(intersectRegions(k,next,k.boundaries));
  }
  const patches=optionalPatchSupport(k,areaMode);
  if(patches){
    const result=patchArea(k,regions,patches);
    result.actualGeometry.geometriesXY=geometriesXY;
    return copyMeasuredAreaEvidence(result,result);
  }
  if(regions.length<=1)return actualArea(k,regions[0]??[],areaMode);
  const terms=[];
  const support=areaMode==='constant-plane'?completePlaneSupport(k):null;
  if(support)return measuredAreaResult(measuredTerm(unionArea(k,regions),add(ONE,k.faces[0].raw.q),budget,terms),terms,{
    actualGeometry:{
      representation:'constant-plane',
      geometryConvention:'union-of-domain-intersections',
      geometriesXY,
      support
    }
  });
  const perFace=[];
  let total=[ZERO,ZERO];
  const extent=bounds(k,regions.flatMap(r=>r.flatMap(r=>r.coordinates)));
  for(const face of k.queryBounds(extent)){
    const triangle=[...face.vertices];
    if(k.G(polygonArea(k,triangle))<0)triangle.reverse();
    const scope=[{
      polygonIndex:0,
      ringIndex:0,
      coordinates:[...triangle,triangle[0]]
    }];
    const pieces=regions.map(r=>intersectRegions(k,r,scope));
    const area=unionArea(k,pieces);
    if(!sign(area))continue;
    const interval=measuredTerm(area,add(ONE,face.raw.q),budget,terms);
    total=total.map((v,i)=>add(v,interval[i]));
    perFace.push({
      faceId:face.id,
      ...publicArea(interval),
      geometryOperandsXY:pieces.map(p=>ringPolygons(k,p))
    });
  }
  return measuredAreaResult(total,terms,{
    perFace,
    actualGeometry:{
      representation:'per-face',
      geometryConvention:'union-of-domain-intersections'
    }
  });
}
function originalAxis(axisXY) {
  if(Array.isArray(axisXY))return {
    axisId:'passage',
    components:[{
      coordinatesXY:axisXY
    }]
  };
  return axisXY;
}
function corners(axis) {
  for(let c=0;c<(axis.components??[]).length;c++){
    const points=axis.components[c].coordinatesXY;
    for(let i=1;i<points.length-1;i++){
      const a=vsub(points[i].map(Q),points[i-1].map(Q)),
      b=vsub(points[i+1].map(Q),points[i].map(Q));
      if(sign(cross(a,b))||sign(dot(a,b))<=0)return {
        reason:'ambiguous-corner',
        axisId:axis.axisId,
        componentIndex:c,
        segmentIndex:i-1,
        xy:points[i],
        interval:[1,1],
        stratum:'point'
      };
    }
  }
  return null;
}
function guardSeeds(exact,axis,budget) {
  const seeds=[],
  unresolved=[];
  let maxDistanceSquared=ZERO;
  for(let c=0;c<axis.components.length;c++){
    const points=axis.components[c].coordinatesXY;
    for(const end of [0,points.length-1]){
      const p=points[end].map(Q),
      neighbor=points[end===0?1:end-1].map(Q),
      v=vsub(p,neighbor),
      den=v.reduce((best,x)=>cmp(x.n<0n?neg(x):x,best)>0?(x.n<0n?neg(x):x):best,ZERO);
      if(!sign(den))continue;
      const delta=scale(v,div(Q(2**-22),den)),
      outside=vadd(p,delta),
      guard={
        axisId:axis.axisId,
        components:[{
          coordinatesXY:[xy(p),xy(outside)]
        }]
      };
      // Interior source caps receive a small construction guard. Boundary/outside
      // source endpoints are clipped before launch and are never extrapolated.
      const parts=axisPieces(exact,guard,budget);
      const distanceSquared=dot(delta,delta);
      if(cmp(distanceSquared,maxDistanceSquared)>0)maxDistanceSquared=distanceSquared;
      if(!parts.pieces.length)continue;
      if(parts.uncovered.length){
        unresolved.push({
          reason:'cap-topology',
          detail:'guard-would-touch-real-boundary',
          axisId:axis.axisId,
          componentIndex:c,
          xy:xy(p),
          interval:[end,end]
        });
        continue;
      }
      for(const part of parts.pieces)seeds.push({
        ...part,
        guard:true
      });
    }
  }
  return {
    seeds,
    unresolved,
    maxDistanceSquared
  };
}
function mergePlaneSeeds(pieces,k=null) {
  const result=[];
  for(const piece of pieces){
    const patchIds=k?[...new Set(piece.faces.map(f=>k.patchFor(f)?.id))]:[0];
    const patchId=patchIds.length===1?patchIds[0]:null;
    const last=result.at(-1);
    const source={
      componentIndex:piece.componentIndex,
      segmentIndex:piece.segmentIndex,
      sourceInterval:[piece.lo,piece.hi],
      a:piece.a,
      b:piece.b
    };
    if(last&&patchId!==null&&patchId!==undefined&&last.patchId===patchId&&last.componentIndex===piece.componentIndex&&pointKey(last.b)===pointKey(piece.a)&&!sign(cross(vsub(last.b,last.a),vsub(piece.b,piece.a)))&&sign(dot(vsub(last.b,last.a),vsub(piece.b,piece.a)))>0){
      last.b=piece.b;
      last.faces=[...new Map([...last.faces,...piece.faces].map(f=>[f.id,f])).values()];
      last.sources.push(source);
    }else result.push({
      ...piece,
      patchId,
      sources:[source]
    });
  }
  for(const piece of result){
    const delta=vsub(piece.b,piece.a),
    coordinate=sign(delta[0])?0:1;
    piece.sourceIntervals=piece.sources.map(source=>({
      componentIndex:source.componentIndex,
      segmentIndex:source.segmentIndex,
      sourceParameterInterval:source.sourceInterval.map(p=>`${p.n}/${p.d}`),
      mergedParameterInterval:[source.a,source.b].map(p=>{
        const t=div(sub(p[coordinate],piece.a[coordinate]),delta[coordinate]);
        return `${t.n}/${t.d}`;
      })
    }));
    delete piece.sources;
  }
  return result;
}
/** Full model-surface width. `policy:'geodesic'` is the default.
 * `policy:'contour-normal'` requires a ContourAxis (level, ID, components) in
 * axisXY; its submitted elevation is checked with the shared budget. Invalid
 * results contain diagnostics only and no applicable geometry or area. */
function traceSurfaceBandAttempt({
  domain,
  axisXY,
  widthM,
  policy:requestedPolicy='geodesic',
  areaMode='per-face',
  budget,
  boundaryGuardM
}) {
  if(!domain||!Number.isFinite(widthM)||widthM<=0)throw new RangeError('Positive finite full surface width required');
  budget.check();
  budget.phase?.('surface-band');
  const axis=originalAxis(axisXY);
  let policy=requestedPolicy==='contour-normal'?'contour-gradient':'metric-normal-geodesic';
  if(!axis?.components?.length||axis.components.some(c=>c.coordinatesXY.length<2||c.coordinatesXY.some(p=>p.length!==2||!p.every(Number.isFinite))))throw new RangeError('Finite source axis required');
  const sourceAxis=Array.isArray(axisXY)?axisXY.map(p=>[...p]):structuredClone(axisXY);
  budget.check(axis.components.reduce((s,c)=>s+c.coordinatesXY.length,0));
  const validation={
    widthM,
    widthConvention:'full',
    numericWidthCeilingM:1e-5,
    directionPolicy:policy,
    capConvention:'butt-with-verified-numeric-guard',
    geometryConvention:'domain-intersection',
    unresolved:[],
    exceptions:[],
    spans:[],
    coverage:{
      complete:false,
      seeds:[]
    }
  };
  const invalid=()=>({
    valid:false,
    sourceAxis,
    geometry:{
      type:'MultiPolygon',
      coordinates:[]
    },
    areaM2:null,
    validation
  });
  if(!['geodesic','contour-normal'].includes(requestedPolicy)){
    validation.unresolved.push({
      reason:'unknown-band-policy',
      policy:requestedPolicy,
      axisId:axis.axisId
    });
    return invalid();
  }
  if(policy==='contour-gradient'){
    if(!Number.isFinite(axis.levelM)||!axis.axisId||!certifyContourElevation(domain,[axis],{
      budget
    }).valid){
      validation.unresolved.push({
        reason:'uncertified-contour-axis',
        axisId:axis.axisId,
        interval:[0,1]
      });
      return invalid();
    }
  }
  if(policy==='metric-normal-geodesic'){
    const corner=corners(axis);
    if(corner){
      validation.unresolved.push(corner);
      return invalid();
    }
  }
  const exact=exactDomain(domain,budget),
  original=axisPieces(exact,axis,budget);
  validation.clippedSeedCount=original.uncovered.filter(p=>!p.inside).length;
  for(const p of original.uncovered.filter(p=>p.inside))validation.unresolved.push({
    reason:'uncovered-source',
    axisId:axis.axisId,
    xy:xy(p.a),
    interval:[0,1]
  });
  if(!original.pieces.length){
    validation.unresolved.push({
      reason:'empty-clipped-axis',
      axisId:axis.axisId
    });
    return invalid();
  }
  const field=createAlgebraicField(budget),
  k=createBandKernel(exact,field,budget),
  half=field.q(widthM/2);
  if(policy==='contour-gradient'&&k.uniformPlane&&exact.faces.every(f=>!sign(f.q))){
    const corner=corners(axis);
    if(corner){
      validation.unresolved.push(corner);
      return invalid();
    }
    policy='flat-manual-normal';
    validation.directionPolicy=policy;
  }
  const patchProof=optionalPatchSupport(k,areaMode);
  if(areaMode==='coplanar-patches'&&!patchProof){
    validation.unresolved.push({
      reason:'numeric-unresolved',
      detail:'unproved-coplanar-patch-support'
    });
    return invalid();
  }
  if(patchProof){
    k.usePatches(patchProof.index);
    original.pieces=mergePlaneSeeds(original.pieces,k);
    validation.patchSupport=patchProof.certificate;
    validation.patchMembership=patchProof.patches.map(p=>({
      patchId:p.patchId,
      nativeFaceIds:p.nativeFaceIds
    }));
    validation.seedMapping=original.pieces.map((p,seedIndex)=>({
      seedIndex,
      axisId:p.axisId,
      componentIndex:p.componentIndex,
      sourceIntervals:p.sourceIntervals
    }));
  }else if(k.uniformPlane)original.pieces=mergePlaneSeeds(original.pieces);
  validation.constantPlane=k.uniformPlane;
  try {
    const guarded=guardSeeds(exact,axis,budget);
    validation.unresolved.push(...guarded.unresolved);
    const originalFlows=[-1,1].map(side=>traceBandBundles(k,original.pieces,{
      side,
      policy,
      halfWidth:half
    }));
    const guardFlows=[-1,1].map(side=>traceBandBundles(k,guarded.seeds,{
      side,
      policy,
      halfWidth:half
    }));
    for(const flow of originalFlows)validation.unresolved.push(...flow.unresolved);
    for(const flow of guardFlows)validation.unresolved.push(...flow.unresolved);
    validation.coverage={
      complete:originalFlows.every(f=>f.coverage.complete),
      seeds:originalFlows.flatMap(f=>f.coverage.seeds)
    };
    if(validation.unresolved.length)return invalid();
    const unguardedPolygons=unitePatches(k,originalFlows.flatMap(f=>f.patches));
    const patches=[...originalFlows,...guardFlows].flatMap(f=>f.patches),
    polygons=unitePatches(k,patches),
    guard=boundaryGuards(k,polygons,patches,boundaryGuardM),
    epsg=Number((domain.crs??'EPSG:32632').split(':')[1]);
    const geometry={
      type:'MultiPolygon',
      coordinates:guard.polygons.map(rings=>rings.map(ring=>{
        const out=ring.map(p=>{
          budget.check(2);
          return fromUTM(k.xy(p),epsg);
        });
        return [...out,out[0]];
      }))
    };
    const actual=serializedRings(k,geometry,epsg);
    assertSimpleRings(k,actual);
    const closed=polygons=>polygons.flatMap((rings,polygonIndex)=>rings.map((ring,ringIndex)=>({
      polygonIndex,
      ringIndex,
      coordinates:[...ring,ring[0]]
    })));
    const ideal=closed(unguardedPolygons),
    construction=closed(polygons);
    topologyContacts(k,ideal,actual);
    validation.boundaryGuards=guard.provenance;
    const maxQ=exact.faces.reduce((a,f)=>cmp(a,f.q)>0?a:f.q,ZERO),
    factor=add(ONE,maxQ);
    let maxMove=k.Z;
    for(let i=0;i<actual.length;i++)for(let j=0;j<actual[i].coordinates.length-1;j++){
      const d=k.W(actual[i].coordinates[j],construction[i].coordinates[j]),
      s=k.dot(d,d);
      if(k.C(s,maxMove)>0)maxMove=s;
    }
    const moveUpper=k.F.rationalBounds(maxMove)[1];
    validation.serializationDisplacementM=[0,k.F.bounds(k.F.sqrt(mul(moveUpper,factor)))[1]];
    validation.capEndpointErrorBoundM=k.F.bounds(k.F.add(k.F.q(validation.serializationDisplacementM[1]),k.F.sqrt(mul(guarded.maxDistanceSquared,factor))))[1];
    if(validation.capEndpointErrorBoundM>1e-5)throw numericFailure('serialization-displacement-ceiling');
    const scoped=intersectRegions(k,actual,k.boundaries);
    const topology=certifyScopedTopology(k,ideal,actual,scoped,geometry,domain,epsg),
    scopeGeometry=topology.scopeGeometry;
    delete topology.scopeGeometry;
    validation.topology=topology;
    const verified=[-1,1].map((side,i)=>traceBandBundles(k,original.pieces,{
      side,
      policy,
      halfWidth:half,
      corridor:actual,
      collectPatches:false,
      reference:originalFlows[i]
    }));
    validation.coverage={
      complete:verified.every(f=>f.coverage.complete),
      seeds:verified.flatMap(f=>f.coverage.seeds)
    };
    validation.unresolved.push(...verified.flatMap(f=>f.unresolved));
    validation.exceptions=verified.flatMap(f=>f.exceptions).map(publicSpan);
    validation.spans=verified.flatMap(f=>f.spans).map(s=>({
      ...publicSpan(s),
      serializedDistanceM:s.distanceM
    }));
    const halves=verified.map(flow=>{
      const spans=flow.spans.filter(s=>s.kind==='corridor');
      return spans.length?[Math.min(...spans.map(s=>s.distanceM[0])),Math.max(...spans.map(s=>s.distanceM[1]))]:null;
    });
    validation.serializedHalfWidthsM=halves;
    for(let i=0;i<halves.length;i++){
      const h=halves[i];
      if(h&&!widthBoundsWithin(h,widthM/2)){
        const witness=verified[i].spans.find(s=>s.kind==='corridor'&&!widthBoundsWithin(s.distanceM,widthM/2));
        validation.unresolved.push({
          ...publicSpan(witness??{
          }),
          reason:'serialized-width',
          detail:'half-width-enclosure-exceeds-ceiling'
        });
      }
    }
    validation.fullyClippedSides=halves.flatMap((h,i)=>h?[]:[i?1:-1]);
    validation.serializedWidthM=null;
    if(halves.every(Boolean)){
      const fullLo=field.add(field.q(halves[0][0]),field.q(halves[1][0])),
      fullHi=field.add(field.q(halves[0][1]),field.q(halves[1][1]));
      validation.serializedWidthM=[field.bounds(fullLo)[0],field.bounds(fullHi)[1]];
      if(!widthBoundsWithin(validation.serializedWidthM,widthM))validation.unresolved.push({
        reason:'serialized-width',
        detail:'width-enclosure-exceeds-ceiling',
        axisId:axis.axisId
      });
    }
    if(validation.unresolved.length||!validation.coverage.complete)return invalid();
    const area=actualArea(k,scoped,areaMode);
    validation.areaBoundsM2=area.areaBoundsM2;
    if(area.actualGeometry.representation==='constant-plane')area.actualGeometry.geometryXY={
      type:'MultiPolygon',
      coordinates:ringPolygons(k,actual)
    };
    if(area.actualGeometry.representation==='coplanar-patches')area.actualGeometry.geometriesXY=[{
      type:'MultiPolygon',
      coordinates:ringPolygons(k,actual)
    }];
    return copyMeasuredAreaEvidence({
      valid:true,
      sourceAxis,
      scopeGeometry,
      modelHash:domain.modelHash,
      crs:domain.crs,
      geometry,
      ...area,
      validation
    },area);
  }catch(error){
    if(error.status!=='numeric-unresolved')throw error;
    validation.unresolved.push({
      reason:'numeric-unresolved',
      detail:error.detail,
      axisId:axis.axisId,
      interval:[0,1],
      ...error.provenance
    });
    return invalid();
  }
}
/** Only already-proved real-boundary construction contacts are refined.
 * Every dyadic candidate rebuilds and recertifies the complete actual band;
 * the caller's deadline and node accounting never restart. */
export function traceSurfaceBand(options={
}) {
  const budget=options.budget??createTerrainBudget({
    kind:'measure'
  }),
  attempts=[],
  failures=[];
  let result;
  for(let exponent=-22;2**exponent<=1e-5;exponent++){
    const boundaryGuardM=2**exponent;
    result=traceSurfaceBandAttempt({
      ...options,
      budget,
      boundaryGuardM
    });
    attempts.push({
      boundaryGuardM,
      valid:result.valid,
      ...(result.valid?{
      }
      :{
        reasons:result.validation.unresolved.map(p=>p.detail??p.reason)
      })
    });
    result.validation.guardRefinement=attempts;
    if(result.valid)return copyMeasuredAreaEvidence(result,result);
    failures.push(...result.validation.unresolved);
    if(!result.validation.unresolved.some(p=>p.detail?.startsWith('projection-readiness:'))){
      result.validation.unresolved=failures;
      return result;
    }
  }
  if(result)result.validation.unresolved=failures;
  return result;
}
