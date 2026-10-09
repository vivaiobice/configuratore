import {nativeDirectionalServiceTerms} from './terrain-directional-certificate.js?v=1.3.5';
import {readExactNativeDomainAreaTerms} from './terrain-contour-domain-owner.js?v=1.3.5';
import {
  createTerrainBudget
}
from './terrain-budget.js?v=1.3.5';
import {
  fromUTM,
  toUTM
}
from './coordinate-system.js?v=1.3.5';
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
  numberBounds,
  nextUp,
  nextDown
}
from './terrain-exact.js?v=1.3.5';
import {SOURCE_DOMAIN_AXIS_CONVENTION,SOURCE_PARAMETER_OPERATION,resolveSourceAxis} from './terrain-axis-geometry.js?v=1.3.5';
import {FINITE_POLYLINE_AXIS_CONVENTION,POLYLINE_SOURCE_PARAMETER_OPERATION,validFinitePolylineSourceAxisSchema} from './terrain-polyline-source.js?v=1.3.5';
import {
  axisPieces
}
from './terrain-surface-flow.js?v=1.3.5';
import {
  certifyContourElevation
}
from './terrain-contour-validation.js?v=1.3.5';
import {
  createAlgebraicField
}
from './terrain-algebraic.js?v=1.3.5';
import {canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.5';
import {
  createBandKernel,
  traceBandBundles
}
from './terrain-geodesic-flow.js?v=1.3.5';
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
// Existing plane patch union has exact finite butt caps. Their metric-normal
// edges are derived from the submitted endpoint, never rounded tiny seed axes.
function finitePlaneSourceCaps(k,polygons,axis,patches,seeds) {
  if(axis.components.length!==1)return [];
  const points=axis.components[0].coordinatesXY;
  if(points.length!==2)return [];
  const ends=points.map(p=>p.map(k.F.q)),tangent=k.W(ends[1],ends[0]),caps=[];
  const local=k.uniformPlane?[{rings:polygons.flat(),gradient:k.faces[0].g,seed:null}]:patches.filter(patch=>patch.polygon).map(patch=>{
    const face=k.byId.get(patch.faceId??patch.nativeFaceIds?.[0]),seed=seeds[patch.seedIndex];
    const samePatch=face&&seed?.faces.some(source=>k.patchFor(k.byId.get(source.id))?.id===patch.patchId);
    return {rings:[patch.polygon],gradient:face?.g,seed,samePatch};
  });
  for(let endpoint=0;endpoint<2;endpoint++){
    const source=ends[endpoint];
    for(const part of local){
      if(!part.gradient||part.seed&&(!part.samePatch||!k.onSegment(source,part.seed.a.map(k.F.q),part.seed.b.map(k.F.q))))continue;
      const gradient=part.gradient,along=p=>{const delta=k.W(p,source);return k.A(k.dot(delta,tangent),k.M(k.dot(delta,gradient),k.dot(tangent,gradient)));};
      for(const ring of part.rings)for(let i=0;i<ring.length;i++){
      k.budget.check();const a=ring[i],b=ring[(i+1)%ring.length];
      if(!k.G(along(a))&&!k.G(along(b))&&k.pointKey(a)!==k.pointKey(b)){
        k.budget.check(3);caps.push({a,b,source,outward:k.K(tangent,k.F.q(endpoint?1:-1)),kind:'finite-original-source-cap'});
      }
      }
    }
  }
  return caps;
}
function boundaryGuards(k,polygons,patches,boundaryGuardM,{preserveSourceCapGaps=false,anisotropic=false,preservePhysicalSourceCaps=false}={}) {
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
      gradient=k.faces[0].g,
      alongFlow=k.dot(edge,gradient),
      acrossFlow=k.cross(edge,gradient),
      absolute=x=>k.G(x)<0?k.F.neg(x):x,
      guardM=anisotropic&&k.C(absolute(alongFlow),absolute(acrossFlow))<=0?2**-22:boundaryGuardM,
      delta=k.K(normal,k.F.div(k.F.q(guardM),magnitude));
      for(const p of [a,b]){
        let actualDelta=delta;
        if(preservePhysicalSourceCaps){
          let constraint=null;
          for(const patch of patches)for(const cap of patch.physicalSourceCaps??[]){
            k.budget?.check(1);
            if(!k.onSegment(p,cap.a,cap.b))continue;
            k.budget?.check(3);
            const direction=k.W(cap.b,cap.a),denominator=k.cross(direction,edge),capSide=k.G(k.cross(direction,cap.outward)),shiftSide=k.G(k.cross(direction,delta));
            let constrained;
            if(capSide*shiftSide>0){
              if(!k.G(denominator)&&(k.G(k.cross(direction,k.W(u,cap.a)))||k.G(k.cross(direction,k.W(v,cap.a)))))throw numericFailure('physical-source-cap-guard-parallel-boundary');
              // Initial emitted corners may move strictly into the actual
              // outward cap half-plane. This exact sign rule also avoids an
              // unbounded intersection of nearly parallel lines, with no
              // proximity threshold or change to source/cap operands.
              constrained=delta;
              k.budget?.check(1);
              provenance.push({kind:k.G(denominator)?'physical-source-cap-outward-boundary-guard':'physical-source-cap-outward-collinear-boundary-guard',boundaryId:boundary.id,boundarySegmentIndex:j-1,cornerXY:k.xy(p),nativeCapSide:capSide,nativeShiftSide:shiftSide});
            }else{
              if(!k.G(denominator))throw numericFailure('physical-source-cap-guard-parallel-boundary');
              constrained=k.K(direction,k.F.div(k.cross(delta,edge),denominator));
            }
            if(constraint&&k.pointKey(constraint)!==k.pointKey(constrained))throw numericFailure('ambiguous-physical-source-cap-guard');
            constraint=constrained;
          }
          if(constraint){
            actualDelta=constraint;
            k.budget?.check(2);
            provenance.push({kind:'physical-source-cap-constrained-boundary-guard',boundaryId:boundary.id,boundarySegmentIndex:j-1,cornerXY:k.xy(p)});
          }
        }
        const key=k.pointKey(p),
        old=shifts.get(key)??new Map();
        old.set(`${boundary.id}:${j}`,actualDelta);
        shifts.set(key,old);
      }
      provenance.push({
        boundaryId:boundary.id,
        boundarySegmentIndex:j-1,
        edgeXY:[k.xy(a),k.xy(b)]
      });
    }
  }
  // Complete source-domain carriers already end at exact physical caps.
  // Moving a butt cap outward can reach an untouched boundary vertex across a
  // positive wedge. Keep that gap, while real boundary-edge shifts remain.
  for(const cap of preserveSourceCapGaps?[]:patches.flatMap(p=>p.capEdges??[])){
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
      kind:cap.kind??'clipped-source-cap',
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
/** Exact connected collinear cap strata share one geometric half-plane.
 * Its existing extreme endpoints give that line a representable geographic
 * witness without deleting a native stratum or extending its support. */
function finiteCapConstraintRepresentatives(k,patches){
  const caps=patches.flatMap(patch=>patch.physicalSourceCaps??[]),groups=[];
  for(const cap of caps){
    const identity=JSON.stringify([cap.axisId,cap.componentIndex,cap.segmentIndex,cap.source]);
    let merged={...cap,members:[cap],identity};
    for(let i=0;i<groups.length;){
      const other=groups[i];k.budget?.check();
      if(other.identity!==identity){i++;continue;}
      const direction=k.W(merged.b,merged.a);
      if(k.G(k.cross(direction,k.W(other.a,merged.a)))||k.G(k.cross(direction,k.W(other.b,merged.a)))||
        k.G(k.cross(direction,merged.outward))*k.G(k.cross(direction,other.outward))<=0||
        ![other.a,other.b].some(p=>k.onSegment(p,merged.a,merged.b))&&![merged.a,merged.b].some(p=>k.onSegment(p,other.a,other.b))){i++;continue;}
      const coordinate=k.G(direction[0])?0:1,points=[merged.a,merged.b,other.a,other.b].sort((a,b)=>k.C(a[coordinate],b[coordinate]));
      k.budget?.check(2);
      merged={...merged,a:points[0],b:points[3],members:[...merged.members,...other.members]};
      groups.splice(i,1);i=0;
    }
    groups.push(merged);
  }
  return new Map(groups.flatMap(group=>group.members.map(cap=>[cap,group])));
}
/** Initial emitted-corner casting only. The original source and nominal
 * butt-cap lines remain immutable. Both native and geographic half-planes
 * must independently face outward; all actual corridor checks follow. */
function castFinitePhysicalCapCorner(k,point,originalPoint,coordinate,patches,epsg,maxQ,representatives) {
  const constraints=[];
  for(const patch of patches)for(const originalCap of patch.physicalSourceCaps??[]){
    k.budget?.check();
    if(!k.onSegment(originalPoint,originalCap.a,originalCap.b))continue;
    const cap=representatives.get(originalCap);
    k.budget?.check(17);
    const direction=k.W(cap.b,cap.a),nativeSide=k.G(k.cross(direction,cap.outward));
    if(!nativeSide)throw numericFailure('unresolved-finite-cap-outward-side');
    const geographicA=fromUTM(k.xy(cap.a),epsg).map(Q),geographicB=fromUTM(k.xy(cap.b),epsg).map(Q),geographicOut=fromUTM(k.xy(k.V(cap.a,cap.outward)),epsg).map(Q);
    const geographicDirection=vsub(geographicB,geographicA),geographicSide=sign(cross(geographicDirection,vsub(geographicOut,geographicA)));
    if(!geographicSide)throw Object.assign(numericFailure('unresolved-finite-cap-geographic-side'),{provenance:{nativeCapXY:[k.xy(cap.a),k.xy(cap.b)],geographicCap:[xy(geographicA),xy(geographicB)],outwardXY:k.xy(cap.outward),capCount:patches.reduce((sum,patch)=>sum+(patch.physicalSourceCaps?.length??0),0)}});
    constraints.push({cap,direction,nativeSide,geographicA,geographicDirection,geographicSide});
  }
  if(!constraints.length)return {coordinate};
  // A fixed 5 by 5 binary64 neighborhood is an initial deterministic cast,
  // never an unbounded repair of a failed band or a changed source operand.
  k.budget?.check(10);
  const nearby=value=>[value,nextDown(value),nextUp(value),nextDown(nextDown(value)),nextUp(nextUp(value))];
  const longitude=nearby(coordinate[0]),latitude=nearby(coordinate[1]),factor=add(ONE,maxQ),ceiling=k.F.q(Q(1e-5)),ceilingSquared=k.M(ceiling,ceiling);
  let best=null,attempted=0;
  for(const x of longitude)for(const y of latitude){
    k.budget?.check(5);attempted++;
    const candidate=[x,y],geographic=candidate.map(Q),projected=toUTM(candidate,epsg).map(k.F.q);
    let outward=true;
    for(const constraint of constraints){
      k.budget?.check();
      if(constraint.nativeSide*k.G(k.cross(constraint.direction,k.W(projected,constraint.cap.a)))<0||constraint.geographicSide*sign(cross(constraint.geographicDirection,vsub(geographic,constraint.geographicA)))<0){outward=false;break;}
    }
    if(!outward)continue;
    const delta=k.W(projected,point),groundSquared=k.M(k.dot(delta,delta),k.F.q(factor));
    if(k.C(groundSquared,ceilingSquared)>0)continue;
    if(!best||k.C(groundSquared,best.groundSquared)<0){k.budget?.check(1);best={coordinate:candidate,groundSquared};}
  }
  if(!best)throw numericFailure('finite-cap-conservative-casting-exhausted');
  k.budget?.check(1);
  return {coordinate:best.coordinate,provenance:{method:'initial-finite-cap-outward-half-planes',candidateCount:attempted,nativeOutward:true,geographicOutward:true,displacementUpperM:k.F.bounds(k.F.sqrt(k.F.rationalBounds(best.groundSquared)[1]))[1]}};
}
function lineIntersections(k,a,b,c,d) {
  const ux=k.S(b[0],a[0]),uy=k.S(b[1],a[1]),
  vx=k.S(d[0],c[0]),vy=k.S(d[1],c[1]),
  wx=k.S(c[0],a[0]),wy=k.S(c[1],a[1]),
  cross=(ax,ay,bx,by)=>k.S(k.M(ax,by),k.M(ay,bx)),
  den=cross(ux,uy,vx,vy),inside=t=>k.G(t)>=0&&k.C(t,k.O)<=0;
  if(k.G(den)){
    const t=k.F.div(cross(wx,wy,vx,vy),den),s=k.F.div(cross(wx,wy,ux,uy),den);
    return inside(t)&&inside(s)?[t]:[];
  }
  if(k.G(cross(wx,wy,ux,uy)))return [];
  const i=k.G(ux)?0:1,u=i?uy:ux;
  if(!k.G(u))return [];
  return [k.F.div(k.S(c[i],a[i]),u),k.F.div(k.S(d[i],a[i]),u)].filter(inside);
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
function topologyContacts(k,ideal,actual,boundaries=k.boundaries,diagnosticContacts=false) {
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
    if(before!==after){
      const detail={boundaryId:boundary.id,boundarySegmentIndex:i-1,xy:k.xy(a),contactBefore:before,contactAfter:after};
      if(diagnosticContacts){
        const endpoint=(k.location(a,ideal)>=0)!==(k.location(a,actual)>=0)?a:b;
        const nearest=rings=>{
          let best=null;
          for(const ring of rings)for(let index=0;index<ring.coordinates.length-1;index++){
            k.budget?.check();
            const delta=k.W(ring.coordinates[index],endpoint),distance=k.dot(delta,delta);
            if(!best||k.C(distance,best.distance)<0)best={ring,index,distance};
          }
          return best;
        };
        const idealVertex=nearest(ideal),actualVertex=nearest(actual);
        k.budget?.check(14);
        const neighbors=record=>{
          if(!record)return [];
          const count=record.ring.coordinates.length-1;
          return [-1,0,1].map(offset=>k.xy(record.ring.coordinates[(record.index+offset+count)%count]));
        };
        detail.boundaryEndpointsXY=[k.xy(a),k.xy(b)];
        detail.nearestIdealVertexNeighborsXY=neighbors(idealVertex);
        detail.nearestActualVertexNeighborsXY=neighbors(actualVertex);
        detail.changedEndpointLocations=[k.location(endpoint,ideal),k.location(endpoint,actual)];
        if(idealVertex){
          detail.idealVertexDeltaFromEndpointBounds=k.W(idealVertex.ring.coordinates[idealVertex.index],endpoint).map(value=>k.F.bounds(value));
          detail.idealVertexDistanceSquaredBounds=k.F.bounds(idealVertex.distance);
          if(typeof diagnosticContacts==='object'){
            const {patches,domain,epsg,guardPolygons,axis}=diagnosticContacts;
            const originalPoint=idealVertex.ring.coordinates[idealVertex.index];
            let relevantCap=null;
            for(const patch of patches)for(const cap of patch.physicalSourceCaps??[]){
              k.budget?.check();
              if(!relevantCap&&k.onSegment(originalPoint,cap.a,cap.b))relevantCap=cap;
            }
            if(relevantCap){
              // Read-only, error-only evidence. These offers are the existing
              // initial finite pool; they confer no geometry validity.
              const scope=geographicScope(k,domain,epsg);
              const pairedPoint=point=>{
                for(const native of k.boundaries){
                  const geographic=scope.rings.find(ring=>ring.polygonIndex===native.polygonIndex&&ring.ringIndex===native.ringIndex);
                  for(let edge=1;edge<native.coordinates.length;edge++){
                    k.budget?.check();
                    const start=native.coordinates[edge-1],end=native.coordinates[edge];
                    if(!k.onSegment(point,start,end))continue;
                    const delta=k.W(end,start),coordinate=k.G(delta[0])?0:1,t=k.F.div(k.S(point[coordinate],start[coordinate]),delta[coordinate]);
                    return k.V(geographic.coordinates[edge-1],k.K(k.W(geographic.coordinates[edge],geographic.coordinates[edge-1]),t));
                  }
                }
                k.budget?.check(1);return fromUTM(k.xy(point),epsg).map(k.F.q);
              };
              k.budget?.check(140);
              const exactPoint=point=>point.map(value=>{
                const exact=k.F.rational(value),bounds=k.F.rationalBounds(value);
                return {rational:exact?`${exact.n}/${exact.d}`:null,rationalBounds:bounds.map(bound=>`${bound.n}/${bound.d}`),numberBounds:k.F.bounds(value)};
              });
              const component=axis.components[relevantCap.componentIndex],segment=relevantCap.segmentIndex;
              const nativeSourceDirection=k.W(component.coordinatesXY[segment+1].map(k.F.q),component.coordinatesXY[segment].map(k.F.q));
              const outwardSign=k.G(k.dot(relevantCap.outward,nativeSourceDirection));
              const geographicOutward=k.K(k.W(component.coordinates[segment+1].map(k.F.q),component.coordinates[segment].map(k.F.q)),k.F.q(outwardSign));
              const nearby=value=>[value,nextDown(value),nextUp(value),nextDown(nextDown(value)),nextUp(nextUp(value))];
              const count=idealVertex.ring.coordinates.length-1;
              const offers=[idealVertex.index,(idealVertex.index+1)%count].map(pointIndex=>{
                const guarded=guardPolygons[idealVertex.ring.polygonIndex][idealVertex.ring.ringIndex][pointIndex],coordinate=fromUTM(k.xy(guarded),epsg),pool=[];
                for(const longitude of nearby(coordinate[0]))for(const latitude of nearby(coordinate[1])){
                  k.budget?.check();const geographic=[longitude,latitude],native=toUTM(geographic,epsg);pool.push({geographic,native});
                }
                return {pointIndex,guarded:exactPoint(guarded),offers:pool};
              });
              detail.finiteCapEmissionEvidence={
                cap:{a:exactPoint(relevantCap.a),b:exactPoint(relevantCap.b),outward:exactPoint(relevantCap.outward),componentIndex:relevantCap.componentIndex,segmentIndex:relevantCap.segmentIndex},
                pairedGeographicCap:{a:exactPoint(pairedPoint(relevantCap.a)),b:exactPoint(pairedPoint(relevantCap.b)),outward:exactPoint(geographicOutward)},
                castingGeographicCap:{a:fromUTM(k.xy(relevantCap.a),epsg),b:fromUTM(k.xy(relevantCap.b),epsg),outwardPoint:fromUTM(k.xy(k.V(relevantCap.a,relevantCap.outward)),epsg)},
                boundaryEndpoint:{native:exactPoint(endpoint),pairedGeographic:exactPoint(pairedPoint(endpoint))},cornerOffers:offers
              };
            }
          }
        }
      }
      throw numericFailure('serialization-changed-boundary-contact-topology',detail);
    }
  }
}
function assertSimpleRings(k,rings,diagnosticEdges=false) {
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
    if(lineIntersections(k,a.a,a.b,b.a,b.b).length){
      const detail={xy:k.xy(a.a)};
      if(diagnosticEdges){
        k.budget?.check(6);
        detail.edgeIndices=[[a.ringIndex,a.index],[b.ringIndex,b.index]];
        detail.edgeCoordinatesXY=[[k.xy(a.a),k.xy(a.b)],[k.xy(b.a),k.xy(b.b)]];
      }
      throw numericFailure('serialized-self-intersection',detail);
    }
  }
  for(const ring of rings){
    const expected=ring.ringIndex===0?1:-1;
    if(k.G(polygonArea(k,ring.coordinates.slice(0,-1)))!==expected)throw numericFailure('serialized-ring-orientation',{
      xy:k.xy(ring.coordinates[0])
    });
  }
}
function geographicScope(k,domain,epsg) {
  const canonical=canonicalCutDomainScope(domain);
  if(canonical){
    const rings=canonical.geographicBoundaries.map((ring,index)=>{
      const native=canonical.boundaries[index],boundary=k.boundaries.find(b=>b.id===native.id);
      if(!boundary||ring.coordinates.length!==native.coordinates.length||boundary.coordinates.length!==native.coordinates.length)throw numericFailure('canonical-paired-scope-correspondence');
      return {polygonIndex:ring.polygonIndex,ringIndex:ring.ringIndex,coordinates:ring.coordinates.map(p=>{k.budget.check(1);return p.map(k.F.q);})};
    });
    return {geometry:canonical.recipe.kind==='canonical-cut-physical-1'?canonical.sourceScopeGeometry:domain.geometry,rings};
  }
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
  // paired subedge parameter. Canonical children retain independent native and
  // geographic source-edge parameters with matched endpoint ancestry; only the
  // local parameter along that proven pair is shared. This is a reference, never a
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
// A finite geographic preview is permitted only through a certified boundary
// isotopy. Moving vertices retain their exact cyclic identities. Every possible
// contact is either excluded over the complete homotopy by a strict certificate,
// or checked at all quadratic/linear events and intervening open strata.
function certifyPreviewHomotopy(k,rings,actual) {
  const moved=rings.map((ring,index)=>({ring,points:ring.coordinates.slice(0,-1).map((point,i)=>{
    k.budget.check(2);return {a:point,b:actual[index].coordinates[i]};
  })}));
  const at=(p,t)=>k.V(p.a,k.K(k.W(p.b,p.a),t));
  const polynomial=(a,b,c)=>{
    const u=k.W(b.a,a.a),v=k.W(c.a,a.a),du=k.W(k.W(b.b,b.a),k.W(a.b,a.a)),dv=k.W(k.W(c.b,c.a),k.W(a.b,a.a));
    return [k.cross(u,v),k.A(k.cross(du,v),k.cross(u,dv)),k.cross(du,dv)];
  };
  const fixedSign=p=>{
    const signs=[p[0],k.A(p[0],k.F.div(p[1],k.F.q(2))),k.A(k.A(p[0],p[1]),p[2])].map(k.G);
    return signs.every(sign=>sign===signs[0])?signs[0]:0;
  };
  const roots=p=>{
    k.budget.check();const [c,b,a]=p;
    if(!k.G(a))return k.G(b)?[k.F.div(k.F.neg(c),b)]:[];
    const disc=k.S(k.M(b,b),k.M(k.F.q(4),k.M(a,c))),rational=k.F.rational(disc);
    if(!rational)throw numericFailure('preview-event-not-rational');
    if(sign(rational)<0)return [];
    const d=k.F.sqrt(rational),den=k.M(k.F.q(2),a);
    return [k.F.div(k.S(k.F.neg(b),d),den),k.F.div(k.A(k.F.neg(b),d),den)];
  };
  const inRange=t=>k.C(t,k.Z)>=0&&k.C(t,k.O)<=0;
  const edges=moved.flatMap(({ring,points},ringId)=>points.map((a,index)=>({a,b:points[(index+1)%points.length],ringId,index,count:points.length})));
  // All edge collapse candidates are linear endpoint-coordinate events.
  for(const edge of edges){
    const d0=k.W(edge.b.a,edge.a.a),d1=k.W(edge.b.b,edge.a.b),change=k.W(d1,d0);
    const candidate=[k.Z,k.O];
    for(let coordinate=0;coordinate<2;coordinate++)if(k.G(change[coordinate]))candidate.push(k.F.div(k.F.neg(d0[coordinate]),change[coordinate]));
    for(const t of candidate.filter(inRange)){
      k.budget.check();if(!k.G(k.A(d0[0],k.M(change[0],t)))&&!k.G(k.A(d0[1],k.M(change[1],t))))throw numericFailure('preview-edge-collapse');
    }
  }
  const separated=(left,right)=>{
    for(let coordinate=0;coordinate<2;coordinate++){
      const a=[left.a.a,left.a.b,left.b.a,left.b.b].map(p=>p[coordinate]).sort(k.C),b=[right.a.a,right.a.b,right.b.a,right.b.b].map(p=>p[coordinate]).sort(k.C);
      if(k.C(a.at(-1),b[0])<0||k.C(b.at(-1),a[0])<0)return true;
    }
    return false;
  };
  for(let i=0;i<edges.length;i++)for(let j=0;j<i;j++){
    k.budget.check();const left=edges[i],right=edges[j],adjacent=left.ringId===right.ringId&&(Math.abs(left.index-right.index)===1||Math.abs(left.index-right.index)===left.count-1);
    if(!adjacent&&separated(left,right))continue;
    k.budget.check(12);const polynomials=[polynomial(left.a,left.b,right.a),polynomial(left.a,left.b,right.b),polynomial(right.a,right.b,left.a),polynomial(right.a,right.b,left.b)];
    const signs=polynomials.map(fixedSign);
    if(!adjacent&&(signs[0]&&signs[0]===signs[1]||signs[2]&&signs[2]===signs[3]))continue;
    // A shared vertex has a zero orientation identically; the other endpoint's
    // strict sign proves that adjacent edges meet only at this vertex.
    if(adjacent&&signs.some(Boolean))continue;
    const times=[k.Z,k.O,...polynomials.flatMap(roots).filter(inRange)];
    // Identically collinear intervals can change order only at linear endpoint
    // coordinate coincidences. Include both coordinates and all four pairings.
    for(const a of [left.a,left.b])for(const b of [right.a,right.b])for(let coordinate=0;coordinate<2;coordinate++){
      const d0=k.S(a.a[coordinate],b.a[coordinate]),d1=k.S(a.b[coordinate],b.b[coordinate]),delta=k.S(d1,d0);
      if(k.G(delta)){const t=k.F.div(k.F.neg(d0),delta);if(inRange(t))times.push(t);}
    }
    const events=k.roots(times),checks=[...events];
    for(let n=1;n<events.length;n++)checks.push(k.F.div(k.A(events[n-1],events[n]),k.F.q(2)));
    k.budget.check(checks.length);
    for(const t of checks){
      k.budget.check();const a=at(left.a,t),b=at(left.b,t),c=at(right.a,t),d=at(right.b,t);
      if(adjacent){
        const shared=left.a===right.b?left.a:left.b,one=left.a===shared?b:a,two=right.a===shared?d:c,p=at(shared,t);
        if(k.onSegment(one,p,two)||k.onSegment(two,p,one))throw numericFailure('preview-adjacent-overlap');
      }else{
        const s=[k.G(k.orient(a,b,c)),k.G(k.orient(a,b,d)),k.G(k.orient(c,d,a)),k.G(k.orient(c,d,b))];
        if(!s[0]&&k.onSegment(c,a,b)||!s[1]&&k.onSegment(d,a,b)||!s[2]&&k.onSegment(a,c,d)||!s[3]&&k.onSegment(b,c,d)||s[0]*s[1]<0&&s[2]*s[3]<0)throw numericFailure('preview-nonadjacent-contact');
      }
    }
  }
}
/** Bounded regular Boolean adapter. Returned exact operands are transient;
 * they are not domain/support certificates or serialization authority. */
export function createRegularTerrainRegionOperations({budget=createTerrainBudget({kind:'cut'})}={}) {
  const exact={faces:[],boundaries:[],querySegment:()=>[]};
  const k=createBandKernel(exact,createAlgebraicField(budget),budget);
  const sourceEdges=[];
  const read=(geometry,operandId)=>{
    if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw numericFailure('invalid-region-geometry');
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    const rings=polygons.flatMap((polygon,polygonIndex)=>polygon.map((ring,ringIndex)=>{
      if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw numericFailure('invalid-region-ring');
      if(ring[0].some((v,i)=>v!==ring.at(-1)[i]))throw numericFailure('open-region-ring');
      if(ring.slice(1).some((p,i)=>p.every((v,j)=>v===ring[i][j])))throw numericFailure('zero-region-edge');
      let coordinates=ring.map(p=>{budget.check(1);return p.map(k.F.q);});
      if(operandId!==undefined){
        if(typeof operandId!=='string'||!operandId)throw new RangeError('Explicit operand identity required');
        coordinates.slice(1).forEach((b,edgeIndex)=>{
          budget.check(2);
          sourceEdges.push({operandId,polygonIndex,ringIndex,edgeIndex,a:coordinates[edgeIndex],b});
        });
      }
      if(k.G(polygonArea(k,coordinates.slice(0,-1)))!==(ringIndex? -1:1))coordinates=coordinates.toReversed();
      return {polygonIndex,ringIndex,hole:ringIndex>0,coordinates};
    }));
    assertSimpleRings(k,rings);
    // Every hole must have this specific containing exterior, not merely one
    // of the other components. Nested/overlapping components are unsupported.
    for(const ring of rings.filter(r=>r.ringIndex)){
      const outer=rings.find(r=>r.polygonIndex===ring.polygonIndex&&!r.ringIndex);
      if(k.location(ring.coordinates[0],[outer])!==1)throw numericFailure('invalid-region-hole');
      for(const other of rings.filter(r=>r.polygonIndex===ring.polygonIndex&&r.ringIndex&&r!==ring)){
        budget.check();if(k.location(ring.coordinates[0],[{...other,ringIndex:0}])>=0)throw numericFailure('nested-region-holes');
      }
    }
    for(const ring of rings.filter(r=>!r.ringIndex))for(const other of rings.filter(r=>!r.ringIndex&&r!==ring)){
      if(k.location(ring.coordinates[0],[other])>=0)throw numericFailure('overlapping-region-components');
    }
    return rings;
  };
  // Only an owner-derived immutable domain may supply rational operands.
  // This reads its saved snapshot; the caller separately proves live-project
  // coherence. No renderer DTO or caller boundaries can acquire authority here.
  const readCanonicalDomain=(domain,{coordinateRole}={})=>{
    budget.check();
    if(!['native','geographic'].includes(coordinateRole))throw numericFailure('invalid-canonical-coordinate-role');
    const scope=canonicalCutDomainScope(domain);
    if(!scope)throw numericFailure('canonical-domain-identity-required');
    const boundaries=coordinateRole==='native'?scope.boundaries:scope.geographicBoundaries;
    let count=0;
    for(const boundary of boundaries)count+=boundary.coordinates.length;
    // Charge all actual coordinate copies before allocating arrays or field Maps.
    budget.check(count);
    return boundaries.map(boundary=>({
      polygonIndex:boundary.polygonIndex,
      ringIndex:boundary.ringIndex,
      hole:boundary.ringIndex>0,
      coordinates:boundary.coordinates.map(point=>point.map(k.F.q))
    }));
  };
  const operation=(left,right,kind='intersection')=>{
    if(!['intersection','difference','union'].includes(kind))throw new RangeError('Unknown regular Boolean operation');
    if(!left.length)return kind==='union'?right:[];
    if(!right.length)return kind==='intersection'?[]:left;
    return intersectRegions(k,left,right,kind);
  };
  return {
    read,readCanonicalDomain,operation,
    compareAreas:(left,right)=>k.C(left.reduce((sum,r)=>k.A(sum,polygonArea(k,r.coordinates.slice(0,-1))),k.Z),right.reduce((sum,r)=>k.A(sum,polygonArea(k,r.coordinates.slice(0,-1))),k.Z)),
    contains:(rings,point)=>k.location(point.map(k.F.q),rings)>=0,
    sameSet:(left,right)=>!operation(left,right,'difference').length&&!operation(right,left,'difference').length,
    hasInterior:rings=>rings.length&&k.G(rings.reduce((sum,r)=>k.A(sum,polygonArea(k,r.coordinates.slice(0,-1))),k.Z))>0,
    exactBoundaries:rings=>rings.map(r=>({...r,coordinates:r.coordinates.map(p=>{budget.check(1);return p.map(k.F.rational);})})),
    preview:rings=>({type:'MultiPolygon',coordinates:ringPolygons(k,rings)}),
    provenance:rings=>{
      const sourceAt=(edge,p)=>{
        const delta=k.W(edge.b,edge.a),coordinate=k.G(delta[0])?0:1;
        if(!k.G(delta[coordinate]))throw numericFailure('zero-provenance-source-edge');
        return {operandId:edge.operandId,polygonIndex:edge.polygonIndex,ringIndex:edge.ringIndex,edgeIndex:edge.edgeIndex,parameter:k.F.rational(k.F.div(k.S(p[coordinate],edge.a[coordinate]),delta[coordinate]))};
      };
      return rings.map(ring=>({
        polygonIndex:ring.polygonIndex,ringIndex:ring.ringIndex,
        vertices:ring.coordinates.slice(0,-1).map(point=>{
          const incidentEdges=sourceEdges.filter(edge=>{budget.check();return k.onSegment(point,edge.a,edge.b);}).map(edge=>sourceAt(edge,point));
          if(!incidentEdges.length)throw numericFailure('missing-boundary-vertex-provenance');
          budget.check(incidentEdges.length);
          return {incidentEdges};
        }),
        edges:ring.coordinates.slice(1).map((b,index)=>{
          const a=ring.coordinates[index];
          const sources=sourceEdges.filter(edge=>{budget.check();return k.onSegment(a,edge.a,edge.b)&&k.onSegment(b,edge.a,edge.b);}).map(edge=>({
            ...sourceAt(edge,a),endParameter:sourceAt(edge,b).parameter
          }));
          if(!sources.length)throw numericFailure('missing-boundary-edge-provenance');
          budget.check(sources.length);
          return {sources};
        })
      }));
    },
    serializeTopology:rings=>{
      const coordinates=[];
      for(const ring of rings){
        coordinates[ring.polygonIndex]??=[];
        coordinates[ring.polygonIndex][ring.ringIndex]=ring.coordinates.map(p=>{budget.check(1);return k.xy(p);});
      }
      const geometry={type:'MultiPolygon',coordinates},emitted=read(geometry),actual=rings.map(ring=>emitted.find(r=>r.polygonIndex===ring.polygonIndex&&r.ringIndex===ring.ringIndex));
      if(emitted.length!==rings.length||actual.some(ring=>!ring)||actual.length!==rings.length||actual.some((ring,index)=>ring.polygonIndex!==rings[index].polygonIndex||ring.ringIndex!==rings[index].ringIndex||ring.coordinates.length!==rings[index].coordinates.length||ring.coordinates.some((p,i)=>p.some((v,j)=>k.C(v,k.F.q(coordinates[ring.polygonIndex][ring.ringIndex][i][j]))))||k.G(polygonArea(k,ring.coordinates.slice(0,-1)))!==k.G(polygonArea(k,rings[index].coordinates.slice(0,-1)))))throw numericFailure('preview-cycle-correspondence');
      certifyPreviewHomotopy(k,rings,actual);
      budget.check();return geometry;
    },
    serializeExact:rings=>{
      // Initial conservative presentation route: only exact dyadic vertices.
      // A topology-certified approximation can be added separately; rounded
      // crossings are never silently promoted to physical set authority.
      const coordinates=[];
      for(const ring of rings){
        coordinates[ring.polygonIndex]??=[];
        coordinates[ring.polygonIndex][ring.ringIndex]=ring.coordinates.map(p=>{
          const preview=k.xy(p);budget.check(1);
          if(p.some((v,i)=>k.C(v,k.F.q(preview[i]))))throw numericFailure('presentation-rational-crossing-unrepresentable');
          return preview;
        });
      }
      const geometry={type:'MultiPolygon',coordinates};
      if(!(!rings.length&&!coordinates.length)&&!operation(rings,read(geometry),'difference').length&&!operation(read(geometry),rings,'difference').length)return geometry;
      if(!rings.length)return geometry;
      throw numericFailure('presentation-topology-unproved');
    }
  };
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
    serviceBasis:result.serviceMethod??null,
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
/** Exact sum, not a geometric union claim. The scoped caller must separately
 * prove disjoint physical child regions before using it as served union area.
 * Only current process-local measurements carry the required evidence. */
export function sumMeasuredSurfaceAreas(measurements,{budget}={}) {
  budget?.check();
  if(!Array.isArray(measurements)||!measurements.length)throw unresolvedAreaOrder('empty-measured-area-sum');
  const terms=[];
  let lower=ZERO,upper=ZERO;
  for(const measurement of measurements){
    budget?.check();
    const evidence=measuredAreaEvidence.get(measurement);
    if(!evidence||evidence.fingerprint!==JSON.stringify(measurement))throw unresolvedAreaOrder('missing-or-changed-measured-area-evidence');
    for(const [coefficient,radicand] of evidence.terms){
      budget?.check(1);
      const bounds=sqrtBounds(radicand);
      const negative=sign(coefficient)<0;
      lower=add(lower,mul(coefficient,bounds[negative?1:0]));
      upper=add(upper,mul(coefficient,bounds[negative?0:1]));
      terms.push([coefficient,radicand]);
    }
  }
  const bases=[...new Set(measurements.map(measurement=>measuredAreaEvidence.get(measurement).serviceBasis))],serviceMethod=bases.length===1?bases[0]:'mixed-service-bases';
  const result=measuredAreaResult([lower,upper],terms,{areaOperation:'sum-of-measured-areas',measurementCount:measurements.length,...(serviceMethod?{serviceMethod}:{} )});
  budget?.check();
  return result;
}
/** Different service constructions are not interchangeable gain baselines. */
export function measuredSurfaceAreasComparable(a,b,{budget}={}){
 budget?.check();const left=measuredAreaEvidence.get(a),right=measuredAreaEvidence.get(b);
 if(!left||!right||left.fingerprint!==JSON.stringify(a)||right.fingerprint!==JSON.stringify(b))throw unresolvedAreaOrder('missing-or-changed-measured-area-evidence');
 return a===b||left.serviceBasis===right.serviceBasis&&left.serviceBasis!=='mixed-service-bases';
}
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
    if(!measuredSurfaceAreasComparable(a,b,{budget}))throw unresolvedAreaOrder('incomparable-service-area-bases');
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
/** Integrate the actual bound native region directly. Canonical children use
 * owner-derived exact boundaries; their finite summaries are never operands. */
export function measureDomainSurfaceArea({domain,areaMode='per-face',budget=createTerrainBudget({kind:'measure'})}={}) {
  budget.check();
  canonicalCutDomainScope(domain);
  const nativeTerms=readExactNativeDomainAreaTerms(domain,budget);
  if(nativeTerms){
    let total=[ZERO,ZERO];const terms=[];
    for(const [area,factor] of nativeTerms){const interval=measuredTerm(area,factor,budget,terms);total=total.map((v,i)=>add(v,interval[i]));}
    return measuredAreaResult(total,terms,{actualGeometry:{representation:'native-face-exact-integrals',geometryConvention:'domain-intersection'}});
  }
  if(!Object.isFrozen(domain)||!Object.isFrozen(domain.faces)||!Object.isFrozen(domain.boundaries))throw numericFailure('unbound-domain-area');
  const exact=exactDomain(domain,budget),k=createBandKernel(exact,createAlgebraicField(budget),budget);
  const measured=actualArea(k,k.boundaries,areaMode);
  budget.check();return measured;
}
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
function guardSeeds(exact,axis,budget,{originalDomain=exact.domain}={}) {
  if(axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION){
    const seeds=[],unresolved=[],seen=new Set();
    let maxDistanceSquared=ZERO;
    const original=axisPieces(exact,axis,budget,{originalDomain});
    if(original.uncovered.length)return {seeds,unresolved:[{reason:'cap-topology',detail:'unresolved-finite-source'}],maxDistanceSquared};
    for(const piece of original.pieces)for(let endpoint=0;endpoint<2;endpoint++){
      budget.check();
      const cap=endpoint?piece.endCap:piece.startCap,direction=endpoint?1:-1;
      if(cap?.kind!=='retained-source-cap')continue;
      const capKey=`${cap.componentIndex}:${cap.segmentIndex}:${cap.parameter}:${direction}`;
      if(seen.has(capKey))continue;
      seen.add(capKey);
      budget.check(6);
      const points=axis.components[cap.componentIndex].coordinatesXY,
      a=points[cap.segmentIndex].map(Q),b=points[cap.segmentIndex+1].map(Q),v=vsub(b,a);
      let size=0;
      for(const q of v){budget.check(2);const bounds=numberBounds(q);size=Math.max(size,Math.abs(bounds[0]),Math.abs(bounds[1]));}
      const outside=cap.parameter+direction*2**-22/size;
      if(!(size>0&&Number.isFinite(outside)&&outside>=0&&outside<=1&&outside!==cap.parameter)){
        unresolved.push({reason:'cap-topology',detail:'guard-crosses-source-knot-or-unrepresentable',axisId:axis.axisId});continue;
      }
      budget.check(13);
      const interval={componentIndex:cap.componentIndex,segmentIndex:cap.segmentIndex,lo:Math.min(cap.parameter,outside),hi:Math.max(cap.parameter,outside)},
      guard={...axis,axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[interval]}},
      resolved=axisPieces(exact,guard,budget,{originalDomain});
      if(resolved.uncovered.length||resolved.outside.length||!resolved.pieces.length){
        unresolved.push({reason:'cap-topology',detail:'guard-would-touch-real-boundary-or-support',axisId:axis.axisId});continue;
      }
      const parameter=sub(Q(outside),Q(cap.parameter)),squared=mul(mul(parameter,parameter),dot(v,v));
      if(cmp(squared,maxDistanceSquared)>0)maxDistanceSquared=squared;
      budget.check(resolved.pieces.length);
      seeds.push(...resolved.pieces.map(part=>({...part,guard:true})));
    }
    return {seeds,unresolved,maxDistanceSquared};
  }
  if(axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION){
    const seeds=[],unresolved=[];
    if(!axis.axisOperation)return {seeds,unresolved,maxDistanceSquared:ZERO};
    const [a,b]=axis.components[0].coordinatesXY.map(p=>p.map(Q)),v=vsub(b,a);
    const size=Math.max(...v.map(q=>Math.abs(numberBounds(q)[1])));
    const delta=2**-22/size;
    let maxDistanceSquared=ZERO;
    for(const [lo,hi] of axis.axisOperation.intervals)for(const [endpoint,direction] of [[lo,-1],[hi,1]]){
      const outside=endpoint+direction*delta;
      if(!(outside>=0&&outside<=1&&outside!==endpoint)){
        unresolved.push({reason:'cap-topology',detail:'unrepresentable-parameter-guard',axisId:axis.axisId});continue;
      }
      const interval=[endpoint,outside].sort((x,y)=>x-y);
      const guard={...axis,axisOperation:{kind:SOURCE_PARAMETER_OPERATION,intervals:[interval]}};
      const resolved=resolveSourceAxis(exact,guard,budget);
      if(resolved.uncovered.length||resolved.outside.length){
        unresolved.push({reason:'cap-topology',detail:'guard-would-touch-real-boundary',axisId:axis.axisId});continue;
      }
      const parameter=Q(Math.abs(outside-endpoint));
      const squared=mul(mul(parameter,parameter),dot(v,v));
      if(cmp(squared,maxDistanceSquared)>0)maxDistanceSquared=squared;
      seeds.push(...resolved.pieces.map(piece=>({...piece,guard:true})));
    }
    return {seeds,unresolved,maxDistanceSquared};
  }
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
      if(Object.hasOwn(piece,'endCap'))last.endCap=piece.endCap;
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
  originalDomain=domain,
  axisXY,
  widthM,
  policy:requestedPolicy='geodesic',
  areaMode='per-face',
  budget,
  boundaryGuardM,
  sourceGuardVariant=null,
  physicalDomain=null,
  geographicSourceAxis=null
}) {
  if(!domain||!Number.isFinite(widthM)||widthM<=0)throw new RangeError('Positive finite full surface width required');
  budget.check();
  budget.phase?.('surface-band');
  const axis=originalAxis(axisXY);
  let policy=requestedPolicy==='contour-normal'?'contour-gradient':'metric-normal-geodesic';
  if(!axis?.components?.length||axis.components.some(c=>c.coordinatesXY.length<2||c.coordinatesXY.some(p=>p.length!==2||!p.every(Number.isFinite))))throw new RangeError('Finite source axis required');
  if(physicalDomain||geographicSourceAxis){
    const native=axis.components[0]?.coordinatesXY;
    if(!physicalDomain||requestedPolicy!=='geodesic'||!Array.isArray(axisXY)||axisXY.length!==2||axis.components.length!==1||native?.length!==2||!Array.isArray(geographicSourceAxis)||geographicSourceAxis.length!==2||geographicSourceAxis.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)||geographicSourceAxis.some((p,i)=>toUTM(p,Number(domain.crs.split(':')[1])).some((v,j)=>v!==native[i][j])))throw new RangeError('Supported source geographic binding mismatch');
    const scope=canonicalCutDomainScope(physicalDomain);
    if(scope&&scope.recipe.kind!=='canonical-cut-physical-1')throw Object.assign(new Error('Supported passage requires original physical scope, not a canonical child'),{status:'cut-scope-unresolved'});
  }
  const finitePolyline=axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION;
  if(finitePolyline){
    if(!validFinitePolylineSourceAxisSchema(axis,budget))throw Object.assign(new Error('Malformed finite polyline source'),{status:'axis-geometry-unresolved'});
    let copies=0;
    for(const component of axis.components){budget.check();copies+=component.coordinatesXY.length+component.coordinates.length;}
    budget.check(copies+(axis.axisOperation?.intervals.length??0)*4);
  }
  const sourceAxis=geographicSourceAxis?structuredClone(geographicSourceAxis):Array.isArray(axisXY)?axisXY.map(p=>[...p]):structuredClone(axisXY);
  if(!finitePolyline)budget.check(axis.components.reduce((s,c)=>s+c.coordinatesXY.length,0));
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
      budget,originalDomain
    }).valid){
      validation.unresolved.push({
        reason:'uncertified-contour-axis',
        axisId:axis.axisId,
        interval:[0,1]
      });
      return invalid();
    }
  }
  budget.phase?.('surface-band');
  if(policy==='metric-normal-geodesic'){
    const corner=corners(axis);
    if(corner){
      validation.unresolved.push(corner);
      return invalid();
    }
  }
  if(physicalDomain&&(physicalDomain.modelHash!==domain.modelHash||physicalDomain.crs!==domain.crs))throw new RangeError('Supported strip physical model binding mismatch');
  const exact=exactDomain(domain,budget),
  original=axisPieces(exact,axis,budget,{originalDomain});
  if(physicalDomain&&original.uncovered.length){validation.unresolved.push({reason:'uncovered-source',detail:'supported-whole-axis-required'});return invalid();}
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
  const allowPlaneBoundaryTangents=axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION&&original.completeCarrier&&k.uniformPlane;
  if(allowPlaneBoundaryTangents)validation.completeSourceCarrier=true;
  try {
    // New finite-axis passages retain the exact submitted straight source.
    // Source cap guards come from the existing original cap-edge construction;
    // separately rounded tiny seed extensions are not original source strata.
    const guarded=physicalDomain?{seeds:[],unresolved:[],maxDistanceSquared:ZERO}:guardSeeds(exact,axis,budget,{originalDomain});
    validation.unresolved.push(...guarded.unresolved);
    const originalFlows=[-1,1].map(side=>traceBandBundles(k,original.pieces,{
      allowPlaneBoundaryTangents,
      preservePhysicalSourceCaps:axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION,
      side,
      policy,
      halfWidth:half
    }));
    const guardFlows=[-1,1].map(side=>traceBandBundles(k,guarded.seeds,{
      preservePhysicalSourceCaps:axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION,
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
    if(physicalDomain&&[...originalFlows,...guardFlows].some(flow=>flow.exceptions.length))validation.unresolved.push({reason:'insufficient-support',detail:'premature-support-boundary'});
    if(validation.unresolved.length)return invalid();
    const unguardedPolygons=unitePatches(k,originalFlows.flatMap(f=>f.patches));
    const patches=[...originalFlows,...guardFlows].flatMap(f=>f.patches),
    polygons=unitePatches(k,patches);
    if(physicalDomain)patches.push({capEdges:finitePlaneSourceCaps(k,polygons,axis,patches,original.pieces)});
    const guard=boundaryGuards(k,polygons,patches,boundaryGuardM,{preserveSourceCapGaps:allowPlaneBoundaryTangents&&!!sourceGuardVariant,anisotropic:allowPlaneBoundaryTangents&&!!sourceGuardVariant,preservePhysicalSourceCaps:axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION}),
    epsg=Number((domain.crs??'EPSG:32632').split(':')[1]);
    const finiteCapCasting=[],capRepresentatives=finiteCapConstraintRepresentatives(k,patches),castingMaxQ=axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION?exact.faces.reduce((a,f)=>cmp(a,f.q)>0?a:f.q,ZERO):ZERO;
    const geometry={
      type:'MultiPolygon',
      coordinates:guard.polygons.map((rings,polygonIndex)=>rings.map((ring,ringIndex)=>{
        const out=ring.map((p,pointIndex)=>{
          budget.check(2);
          let coordinate=fromUTM(k.xy(p),epsg);
          if(axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION){
            const cast=castFinitePhysicalCapCorner(k,p,polygons[polygonIndex][ringIndex][pointIndex],coordinate,patches,epsg,castingMaxQ,capRepresentatives);
            coordinate=cast.coordinate;
            if(cast.provenance){budget.check(1);finiteCapCasting.push({polygonIndex,ringIndex,pointIndex,...cast.provenance});}
          }
          if(allowPlaneBoundaryTangents&&sourceGuardVariant?.nudge){
            const originalPoint=polygons[polygonIndex][ringIndex][pointIndex];
            const cap=patches.flatMap(patch=>patch.capEdges??[]).find(cap=>k.onSegment(originalPoint,cap.a,cap.b));
            if(cap){
              const magnitude=cap.outward.map(x=>k.G(x)<0?k.F.neg(x):x).reduce((a,b)=>k.C(a,b)>0?a:b);
              if(k.G(magnitude)){
                const outwardPoint=k.V(p,k.K(cap.outward,k.F.div(k.F.q(1),magnitude)));
                const outwardGeo=fromUTM(k.xy(outwardPoint),epsg);
                for(const index of sourceGuardVariant.nudge){
                  // One binary64 step toward the physical side of this butt cap.
                  // Actual projected/raw-WGS topology and every width stratum
                  // decide whether this candidate is usable.
                  coordinate[index]=outwardGeo[index]>coordinate[index]?nextDown(coordinate[index]):nextUp(coordinate[index]);
                }
              }
            }
          }
          return coordinate;
        });
        return [...out,out[0]];
      }))
    };
    const actual=serializedRings(k,geometry,epsg);
    assertSimpleRings(k,actual,axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION);
    if(physicalDomain&&(intersectRegions(k,actual,k.boundaries,'difference').length||actual.some(r=>r.coordinates.some(p=>k.location(p,k.boundaries)!==1))))throw numericFailure('actual-strip-outside-acquired-support');
    const closed=polygons=>polygons.flatMap((rings,polygonIndex)=>rings.map((ring,ringIndex)=>({
      polygonIndex,
      ringIndex,
      coordinates:[...ring,ring[0]]
    })));
    const ideal=closed(unguardedPolygons),
    construction=closed(polygons);
    topologyContacts(k,ideal,actual,k.boundaries,axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION?{patches,domain,epsg,guardPolygons:guard.polygons,axis}:false);
    validation.boundaryGuards=guard.provenance;
    if(axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION)validation.finiteCapCasting=finiteCapCasting;
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
    // All construction and pre-mask width trajectories stay on S. The physical
    // mask P shares this exact field, retains reentry, and never resets travel.
    const physicalK=physicalDomain?createBandKernel(exactDomain(physicalDomain,budget),field,budget):k,physicalScope=physicalDomain??domain;
    if(physicalDomain)topologyContacts(physicalK,ideal,actual);
    const scoped=intersectRegions(physicalK,actual,physicalK.boundaries);
    const topology=certifyScopedTopology(physicalK,ideal,actual,scoped,geometry,physicalScope,epsg),
    scopeGeometry=topology.scopeGeometry;
    delete topology.scopeGeometry;
    validation.topology=topology;
    const verified=[-1,1].map((side,i)=>traceBandBundles(k,original.pieces,{
      allowPlaneBoundaryTangents,
      preservePhysicalSourceCaps:axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION,
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
    if(physicalDomain&&(validation.exceptions.length||!halves.every(Boolean)||!validation.serializedWidthM))validation.unresolved.push({reason:'insufficient-support',detail:'incomplete-nominal-width'});
    if(validation.unresolved.length||!validation.coverage.complete)return invalid();
    if(physicalDomain)validation.supportedWholeAxis=true;
    const area=actualArea(physicalK,scoped,areaMode);
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
      ...(physicalDomain?{surfaceConstructionPolicy:'native-supported-axis-clip-1'}:{}),
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
      boundaryGuardM,
      sourceGuardVariant:null
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
    const completeSource=options.axisXY?.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION&&!options.axisXY.axisOperation;
    const finiteSource=options.axisXY?.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION&&result.validation.coverage.complete&&result.validation.topology?.geographicAgrees===true&&result.validation.capEndpointErrorBoundM<=1e-5;
    const refinable=result.validation.unresolved.some(p=>p.detail?.startsWith('projection-readiness:')||completeSource&&['serialization-changed-boundary-contact-topology','source-outside-corridor','half-width-enclosure-exceeds-ceiling','real-clip-displacement-exceeds-ceiling','width-enclosure-exceeds-ceiling'].includes(p.detail)||finiteSource&&['half-width-enclosure-exceeds-ceiling','width-enclosure-exceeds-ceiling'].includes(p.detail));
    if(!refinable){
      result.validation.unresolved=failures;
      return result;
    }
  }
  const completeSource=options.axisXY?.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION&&!options.axisXY.axisOperation;
  if(completeSource&&result?.validation.completeSourceCarrier){
    // At most twelve further deterministic candidates; no deadline/node reset.
    for(const exponent of [-19,-18,-17])for(const nudge of [null,[0],[1],[0,1]]){
      const boundaryGuardM=2**exponent,sourceGuardVariant={anisotropic:true,nudge};
      result=traceSurfaceBandAttempt({...options,budget,boundaryGuardM,sourceGuardVariant});
      attempts.push({boundaryGuardM,sourceGuardVariant,valid:result.valid,...(result.valid?{}:{reasons:result.validation.unresolved.map(p=>p.detail??p.reason)})});
      result.validation.guardRefinement=attempts;
      if(result.valid)return copyMeasuredAreaEvidence(result,result);
      failures.push(...result.validation.unresolved);
    }
  }
  if(result)result.validation.unresolved=failures;
  return result;
}

/** Bind only freshly recomputed native directional cells to exact area evidence. */
export function measureNativeDirectionalService({certificate,axes,widthM,budget}){
 const result=nativeDirectionalServiceTerms(certificate,axes,widthM,budget);let total=[ZERO,ZERO];
 for(const [area,factor] of result.terms){const [lo,hi]=sqrtBounds(factor);total=[add(total[0],mul(area,lo)),add(total[1],mul(area,hi))];budget.check();}
 return measuredAreaResult(total,result.terms,{serviceMethod:result.serviceMethod,actualGeometry:{representation:'native-directional-rational-cell-union',geometryConvention:'connected-physical-fiber-intersection',halfDisplacementXYM:result.halfDisplacementXYM,coordinateAxis:result.coordinateAxis,...(result.directionVectorXY?{directionVectorXY:result.directionVectorXY}:{})}});
}
