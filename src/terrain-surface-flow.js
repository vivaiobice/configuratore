import {
  Q, ZERO, ONE, TWO, number, numberBounds, min, max, add, sub, mul, div, neg, cmp, sign, sq, key, pointKey, vadd,
  vsub, scale, dot, cross, orient, mid, unique, xy, inTriangle, inRegion, height,
  splitSegment, radical, radd, rscale,exactDomain,pointOnSegment
} from './terrain-exact.js?v=1.3.3';
import {resolveSourceAxis,SOURCE_DOMAIN_AXIS_CONVENTION} from './terrain-axis-geometry.js?v=1.3.3';
import {resolveFinitePolylineSourceAxis,intersectPolylineSourceIntervals,FINITE_POLYLINE_AXIS_CONVENTION} from './terrain-polyline-source.js?v=1.3.3';
// Affine scalar [constant, coefficient] and affine XY [constantXY, slopeXY].
const scalarAt=(p, t)=>add(p[0], mul(p[1], t));
const vectorAt=(p, t)=>vadd(p[0], scale(p[1], t));
const scalarSub=(a, b)=>[sub(a[0], b[0]), sub(a[1], b[1])];
const affineRoot=p=>sign(p[1])?div(neg(p[0]), p[1]):null;
const serialInterval=s=>({
  interval:[number(s.lo), number(s.hi)],
  exactInterval:[key(s.lo), key(s.hi)],
  stratum:s.point?'point':'open'
});
/** Literal binary64 coordinates remain authoritative. Explicit source-domain
 * axes instead resolve exact physical pieces from their actual saved source.
 * Caller face IDs never establish native coverage, eligibility or elevation. */
export function axisPieces(kernel, axis, budget,{originalDomain=kernel.domain}={}){
  if(Object.hasOwn(axis,'axisGeometryConvention')){
    try{
      if(axis.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION)return resolveSourceAxis(kernel,axis,budget);
      const current=resolveFinitePolylineSourceAxis(kernel,axis,budget,{originalDomain});
      if(originalDomain===kernel.domain)return current;
      const original=resolveFinitePolylineSourceAxis(exactDomain(originalDomain,budget),axis,budget,{original:true,originalDomain});
      const pieces=intersectPolylineSourceIntervals(axis,current.pieces,original.pieces,budget);
      budget?.check(current.uncovered.length+original.uncovered.length+current.outside.length+original.outside.length);
      return {...current,pieces,uncovered:[...current.uncovered,...original.uncovered],outside:[...current.outside,...original.outside]};
    }
    catch(error){
      if(error.status==='budget-exceeded')throw error;
      return {pieces:[],uncovered:[{inside:true,reason:error.message,componentIndex:0,segmentIndex:0,lo:ZERO,hi:ONE,a:[ZERO,ZERO]}],completeCarrier:false};
    }
  }
  const pieces=[],
  uncovered=[];
  for (let componentIndex=0; componentIndex<(axis.components??[]).length; componentIndex++){
    const component=axis.components[componentIndex];
    for (let segmentIndex=1; segmentIndex<component.coordinatesXY.length; segmentIndex++){
      const a=component.coordinatesXY[segmentIndex-1].map(Q),
      b=component.coordinatesXY[segmentIndex].map(Q);
      if(pointKey(a)===pointKey(b))continue;
      for (const piece of splitSegment(kernel, a, b, budget)){
        const record={
          ...piece,
          axisId:axis.axisId,
          componentIndex,
          segmentIndex:segmentIndex-1,
          levelM:axis.levelM,
          ordinal:axis.ordinal
        };
        if(piece.faces.length){
          budget?.check(2);
          pieces.push(record);
        }else uncovered.push(record);
      }
    }
  }
  return {
    pieces,
    uncovered
  };
}
/** Merge only exactly collinear, forward, continuous submitted pieces. The
 * existing coordinates are retained; no ideal curve or tolerance substitutes
 * for an actual endpoint. Real gaps and component identities remain distinct. */
export function coalescePlanePieces(pieces,budget){
 const result=[];
 for(const piece of pieces){
  budget?.check();
  const previous=result.at(-1);
  const contiguous=previous&&previous.axisId===piece.axisId&&previous.componentIndex===piece.componentIndex&&pointKey(previous.b)===pointKey(piece.a);
  const aligned=contiguous&&!sign(cross(vsub(previous.b,previous.a),vsub(piece.b,piece.a)))&&sign(dot(vsub(previous.b,previous.a),vsub(piece.b,piece.a)))>0;
  if(aligned){
   previous.b=piece.b;
   if(Object.hasOwn(piece,'endCap'))previous.endCap=piece.endCap;
   previous.faces=[...new Map([...previous.faces,...piece.faces].map(face=>[face.id,face])).values()];
  }else result.push({...piece});
 }
 return result;
}
/** Exact arrangement of all event sign/membership/order roots. Each emitted
 * open cell has constant event ordering; every interior root is a point stratum.
 * A midpoint selects only after this complete rational arrangement is built. */
export function partitionAffineEvents(state, events, budget, extra=[]){
  if(state.point)return [state];
  const roots=[state.lo, state.hi];
  const addRoot=p=>{
    budget?.check();
    const r=affineRoot(p);
    if(r&&cmp(r, state.lo)>0&&cmp(r, state.hi)<0)roots.push(r);
  };
  for (const e of events){
    addRoot(e.lambda);
    if(e.member){
      addRoot(e.member);
      addRoot([sub(e.member[0], ONE), e.member[1]]);
    }
    for (const p of e.extra??[])addRoot(p);
  }
  for (let i=0; i<events.length; i++)for (let j=0; j<i; j++)addRoot(scalarSub(events[i].lambda, events[j].lambda));
  for (const p of extra)addRoot(p);
  const sorted=unique(roots),
  out=[];
  for (let i=1; i<sorted.length; i++){
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
  return out;
}
/** Independent completeness assertion: adjacent open cells tile (0,1), and
 * exactly one point stratum covers every cell endpoint, including 0 and 1. */
export function verifySeedCover(records){
  const cells=records.filter(s=>!s.point).sort((a, b)=>cmp(a.lo, b.lo)),
  points=records.filter(s=>s.point).sort((a, b)=>cmp(a.lo, b.lo));
  if(!cells.length||cmp(cells[0].lo, ZERO)||cmp(cells.at(-1).hi, ONE))return {
    complete:false,
    reason:'missing-open-cover'
  };
  for (let i=0; i<cells.length; i++)if(cmp(cells[i].lo, cells[i].hi)>=0||(i&&cmp(cells[i-1].hi, cells[i].lo)))return {
    complete:false,
    reason:'open-gap-or-overlap'
  };
  const endpoints=[cells[0].lo, ...cells.map(s=>s.hi)];
  if(points.length!==endpoints.length||points.some((p, i)=>cmp(p.lo, p.hi)||cmp(p.lo, endpoints[i])))return {
    complete:false,
    reason:'missing-or-duplicate-event-point'
  };
  return {
    complete:true,
    openCells:cells.length,
    eventPoints:points.length
  };
}
/** Classify an infinitesimal forward ray by an exact rational interior point
 * before every next boundary event. Tangent contact is therefore not an exit. */
export function regionAfter(kernel, p, v){
  let step=ONE;
  for (const boundary of kernel.boundaries)for (let i=1; i<boundary.coordinates.length; i++){
    const a=boundary.coordinates[i-1],
    b=boundary.coordinates[i],
    e=vsub(b, a),
    den=cross(v, e);
    if(sign(den)){
      const lambda=div(cross(vsub(a, p), e), den),
      u=div(cross(vsub(a, p), v), den);
      if(sign(lambda)>0&&cmp(u, ZERO)>=0&&cmp(u, ONE)<=0&&cmp(lambda, step)<0)step=lambda;
    }
  }
  return inRegion(vadd(p, scale(v, div(step, TWO))), kernel);
}
function pointsInto(face, p, v, strict=false){
  const orientation=sign(orient(face.vertices[0], face.vertices[1], face.vertices[2]));
  for (let i=0; i<3; i++){
    const a=face.vertices[i],
    b=face.vertices[(i+1)%3],
    side=sign(orient(a, b, p))*orientation;
    if(side<0)return false;
    if(!side){
      const derivative=sign(cross(vsub(b, a), v))*orientation;
      if(derivative<0||(strict&&derivative===0))return false;
    }
  }
  return true;
}
function outgoing(kernel, p, policy, budget){
  const possible=[], incident=[];
  for (const face of kernel.queryPoint(p, budget)){
    if(!inTriangle(p, face))continue;
    const v=policy(face), candidate={face,v};
    incident.push(candidate);
    if(v&&sign(dot(v, v))&&pointsInto(face, p, v))possible.push(candidate);
  }
  if(!possible.length)return null;
  const first=possible[0];
  if(possible.some(x=>pointKey(x.v)!==pointKey(first.v)||pointKey(x.face.g)!==pointKey(first.face.g)))return null;
  // Tangent travel requires a coplanar field on every incident face touched
  // by the forward ray. Test the selected ray against each incident face,
  // including faces whose own gradients failed the inward candidate filter.
  // Faces strictly behind that ray at a mesh vertex are not its continuation.
  if(!pointsInto(first.face,p,first.v,true)&&incident.some(x=>
    pointsInto(x.face,p,first.v)&&
    (!x.v||pointKey(x.v)!==pointKey(first.v)||pointKey(x.face.g)!==pointKey(first.face.g))))return null;
  return first;
}
function eventForSegment(p, v, a, b, metadata){
  const edge=vsub(b, a),
  den=cross(v, edge);
  if(!sign(den))return null;
  const delta=vsub(a, p[0]),
  lambda=[div(cross(delta, edge), den), div(neg(cross(p[1], edge)), den)],
  member=[div(cross(delta, v), den), div(neg(cross(p[1], v)), den)];
  return {
    ...metadata,
    lambda,
    member
  };
}
const usable=(e, t)=>{
  const l=scalarAt(e.lambda, t);
  if(sign(l)<0)return false;
  if(!e.member)return true;
  const u=scalarAt(e.member, t);
  return cmp(u, ZERO)>=0&&cmp(u, ONE)<=0;
};
function eventPoint(state, event){
  return [vadd(state.p[0], scale(state.v, event.lambda[0])), vadd(state.p[1], scale(state.v, event.lambda[1]))];
}
function distanceAt(state, t){
  return radd(state.distance[0], rscale(state.distance[1], t));
}
/** Continuous contour-gradient (or proven globally flat manual-normal) flow.
 * Inputs and returned internal proofs use exact rationals, not display XY.
 * `terminal` visits disjoint open cells and every event point independently.
 * Task 3B can reuse partitionAffineEvents/regionAfter/axisPieces, and supply a
 * separately certified transported direction policy; this API does not claim
 * arbitrary-axis geodesic continuation. */
export function traceNormalBundles({
  kernel,
  source,
  target,
  sourcePieces,
  targetPieces,
  flat,
  uniformPlane=false,
  budget,
  terminal
}){
  const targetSegments=targetPieces.map((p, i)=>({
    ...p,
    targetPieceIndex:i,
    nativeBounds:[numberBounds(min(p.a[0],p.b[0]))[0],numberBounds(min(p.a[1],p.b[1]))[0],numberBounds(max(p.a[0],p.b[0]))[1],numberBounds(max(p.a[1],p.b[1]))[1]]
  })),
  targetFirst=targetSegments[0];
  if(!targetFirst)return {
    unresolved:[{
      reason:'missing-axis',
      axisId:source.axisId,
      targetAxisId:target.axisId
    }],
    coverage:{
      complete:false,
      seeds:[]
    }
  };
  const failures=[],
  seedCoverage=[];
  for (let seedIndex=0; seedIndex<sourcePieces.length; seedIndex++){
    budget?.check();
    const seed=sourcePieces[seedIndex],
    tangent=vsub(seed.b, seed.a),
    normal=[neg(tangent[1]), tangent[0]],
    toward=sign(dot(vsub(targetFirst.a, seed.a), normal)),
    sigma=flat?toward:Math.sign(target.levelM-source.levelM),
    policy=face=>flat?scale(normal, Q(sigma)):scale(face.g, Q(sigma));
    const covered=[];
    let activeState;
    const reject=(record, state=activeState)=>{
      if(state)covered.push({
        lo:state.lo,
        hi:state.hi,
        point:state.point
      });
      failures.push(record);
    };
    const emit=record=>{
      covered.push({
        lo:record.lo,
        hi:record.hi,
        point:record.point
      });
      terminal(record);
    };
    const provenance={
      axisId:seed.axisId??source.axisId,
      targetAxisId:target.axisId,
      targetAxisIds:target.axisIds??[target.axisId],
      sourceOrdinal:source.ordinal,
      targetOrdinal:target.ordinal,
      seedIndex,
      componentIndex:seed.componentIndex,
      segmentIndex:seed.segmentIndex,
      seedFaceIds:seed.faces.map(f=>f.id),
      seedXY:[xy(seed.a), xy(seed.b)]
    };
    if(!sigma){
      reject({
        ...provenance,
        reason:'ambiguous-flow',
        ...serialInterval({
          lo:ZERO,
          hi:ONE
        })
      });
      seedCoverage.push({
        ...provenance,
        complete:false,
        reason:'undefined-direction'
      });
      continue;
    }
    const carrierTarget=uniformPlane&&source.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION&&target.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION&&!source.axisOperation&&!target.axisOperation;
    // Complete finite sources have already been regenerated by axisPieces.
    // Their actual submitted segments, rather than an ideal height carrier,
    // determine contact/first exit. Known omitted ordinals remain a separate
    // organizeFamily failure; operations and merged component axes retain the
    // existing nominal-level route.
    const actualFiniteTarget=source.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION&&target.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION&&!source.axisOperation&&!target.axisOperation&&Number.isInteger(source.ordinal)&&Number.isInteger(target.ordinal)&&Math.abs(source.ordinal-target.ordinal)===1&&(source.axisIds?.length??1)===1&&(target.axisIds?.length??1)===1;
    const lineTarget=flat||carrierTarget;
    const targetLine=lineTarget?{
      p:targetFirst.a,
      n:[neg(vsub(targetFirst.b, targetFirst.a)[1]), vsub(targetFirst.b, targetFirst.a)[0]]
    }
    :null;
    const targetPosition=(face, p)=>lineTarget?dot(vsub(p, targetLine.p), targetLine.n):sub(height(face, p), Q(target.levelM));
    const sourceSide=lineTarget?sign(targetPosition(seed.faces[0], seed.a)):Math.sign(source.levelM-target.levelM);
    if(carrierTarget){
      const atEnd=sign(targetPosition(seed.faces[0],seed.b));
      const den=dot(targetLine.n,policy(seed.faces[0]));
      if(!sourceSide||atEnd!==sourceSide||!sign(den)||sourceSide*sign(den)>=0){
        reject({...provenance,reason:'ambiguous-flow',detail:'crossing-or-misordered-carriers'});
        seedCoverage.push({...provenance,complete:false,reason:'carrier-order'});
        continue;
      }
    }
    const initial={
      p:[seed.a, tangent],
      lo:ZERO,
      hi:ONE,
      point:false,
      distance:[[], []],
      itinerary:[],
      entry:null
    };
    const queue=[initial, {
      ...initial,
      lo:ZERO,
      hi:ZERO,
      point:true
    }, {
      ...initial,
      lo:ONE,
      hi:ONE,
      point:true
    }];
    let count=0;
    while(queue.length){
      budget?.check();
      const state=queue.pop();
      activeState=state;
      const t=state.point?state.lo:mid(state.lo, state.hi),
      p=vectorAt(state.p, t),
      meta={
        ...provenance,
        ...serialInterval(state),
        xy:xy(p),
        itinerary:state.itinerary
      };
      if(++count>20000){
        reject({
          ...meta,
          reason:'numeric-unresolved',
          detail:'event-partition-cap'
        });
        for (const remaining of queue)reject({
          ...provenance,
          ...serialInterval(remaining),
          reason:'numeric-unresolved',
          detail:'event-partition-cap'
        }, remaining);
        break;
      }
      if(inRegion(p, kernel)<0){
        reject({
          ...meta,
          reason:'uncovered'
        });
        continue;
      }
      const next=uniformPlane?{face:kernel.faces[0],v:policy(kernel.faces[0])}:outgoing(kernel, p, policy, budget);
      if(!next){
        reject({
          ...meta,
          reason:'ambiguous-flow',
          detail:'no-unique-inward-continuation'
        });
        continue;
      }
      state.face=next.face;
      state.v=next.v;
      if(state.itinerary.length>kernel.faces.length*2+2){
        reject({
          ...meta,
          reason:'ambiguous-flow',
          detail:'itinerary-cap'
        });
        continue;
      }
      const f=state.face,
      v=state.v,
      events=[],
      parallel=[],
      extra=[];
      const collect=(a, b, metadata)=>{
        const event=eventForSegment(state.p, v, a, b, metadata);
        if(event){
          events.push(event);
          return event;
        }
        const collinear=[cross(vsub(a, state.p[0]), v), neg(cross(state.p[1], v))];
        extra.push(collinear);
        if(metadata.kind!=='edge')parallel.push({
          a,
          b,
          collinear,
          ...metadata
        });
        return null;
      };
      for (let i=0; !uniformPlane&&i<3; i++){
        collect(f.vertices[i].slice(0, 2), f.vertices[(i+1)%3].slice(0, 2), {
          kind:'edge',
          edgeId:f.edgeIds[i]
        });
      }
      for (const boundary of kernel.boundaries)for (let i=1; i<boundary.coordinates.length; i++){
        const e=collect(boundary.coordinates[i-1], boundary.coordinates[i], {
          kind:'boundary',
          boundaryId:boundary.id,
          hole:boundary.hole,
          boundarySegmentIndex:i-1
        });
        if(e&&!actualFiniteTarget){
          const ep=eventPoint(state, e);
          e.extra=[[targetPosition(f, ep[0]), lineTarget?dot(ep[1], targetLine.n):dot(f.g, ep[1])]];
        }
      }
      for (const piece of targetSegments){
        // A ray cannot hit this target before leaving the current native face
        // when their outward enclosures are disjoint. Boundary ties remain.
        const a=piece.nativeBounds,b=f.nativeBounds;
        if(!uniformPlane&&b&&(a[0]>b[2]||a[2]<b[0]||a[1]>b[3]||a[3]<b[1]))continue;
        collect(piece.a, piece.b, {
          kind:'target',
          targetPieceIndex:piece.targetPieceIndex,
          targetAxisId:piece.axisId
        });
      }
      if(!actualFiniteTarget&&!state.levelCrossing){
        const n=lineTarget?targetLine.n:f.g,
        den=dot(n, v);
        if(sign(den))events.push({
          kind:'level',
          lambda:[div(neg(targetPosition(f, state.p[0])), den), div(neg(dot(n, state.p[1])), den)]
        });
      }
      const partition=partitionAffineEvents(state, events, budget, extra);
      if(partition.length>1)budget?.check(partition.length);
      // retained seed-event records
      if(partition.length!==1||partition[0].point!==state.point){
        queue.push(...partition.map(s=>({
          ...s,
          face:undefined,
          v:undefined
        })));
        continue;
      }
      const candidates=events.filter(e=>usable(e, t)).filter(e=>{
        const l=scalarAt(e.lambda, t);
        if(sign(l)>0)return true;
        if(e.kind==='edge')return false;
        if(e.kind==='target'||e.kind==='level')return true;
        return regionAfter(kernel, p, v)<0;
      });
      candidates.sort((a, b)=>cmp(scalarAt(a.lambda, t), scalarAt(b.lambda, t))||({
        target:0,
        level:1,
        boundary:2,
        edge:3
      }
      [a.kind]-{
        target:0,
        level:1,
        boundary:2,
        edge:3
      }
      [b.kind]));
      let event=null;
      for (const e of candidates){
        if(e.kind==='boundary'){
          const hit=vectorAt(eventPoint(state, e), t);
          const continuation=outgoing(kernel, hit, policy, budget);
          const nativeTie=candidates.some(other=>other.kind==='edge'&&cmp(scalarAt(other.lambda, t), scalarAt(e.lambda, t))===0);
          if(nativeTie&&!continuation){
            event={
              ...e,
              ambiguous:true
            };
            break;
          }
          if(regionAfter(kernel, hit, continuation?.v??v)>=0)continue;
          const incoming=sign(scalarAt(e.lambda, t))>0?v:state.incomingV??v;
          const incomingRegion=regionAfter(kernel, hit, scale(incoming, neg(ONE)));
          if(incomingRegion!==1&&!(carrierTarget&&incomingRegion===0)){
            event={
              ...e,
              noInteriorEntry:true
            };
            break;
          }
        }
        event=e;
        break;
      }
      if(!event){
        reject({
          ...meta,
          reason:'uncovered',
          detail:'no-next-native-event'
        });
        continue;
      }
      if(event.noInteriorEntry){
        reject({
          ...meta,
          reason:'ambiguous-flow',
          detail:'boundary-without-interior-entry',
          boundaryId:event.boundaryId
        });
        continue;
      }
      if(event.ambiguous){
        reject({
          ...meta,
          reason:'ambiguous-flow',
          detail:'boundary-native-event-tie',
          boundaryId:event.boundaryId
        });
        continue;
      }
      const overlapping=parallel.find(e=>{
        if(sign(scalarAt(e.collinear, t)))return false;
        const coordinate=sign(v[0])?0:1,
        a=div(sub(e.a[coordinate], p[coordinate]), v[coordinate]),
        b=div(sub(e.b[coordinate], p[coordinate]), v[coordinate]),
        lo=cmp(a, b)<0?a:b,
        hi=cmp(a, b)>0?a:b;
        return sign(hi)>0&&cmp(lo, scalarAt(event.lambda, t))<=0;
      });
      if(overlapping){
        const normal=[neg(v[1]),v[0]];
        const actualFinitePhysicalCap=actualFiniteTarget&&uniformPlane&&state.point&&(cmp(state.lo,ZERO)===0&&seed.startCap?.kind==='physical-boundary'||cmp(state.lo,ONE)===0&&seed.endCap?.kind==='physical-boundary');
        const regularCarrierBoundary=(carrierTarget||actualFinitePhysicalCap&&pointOnSegment(p,overlapping.a,overlapping.b))&&overlapping.kind==='boundary'&&regionAfter(kernel,p,normal)*regionAfter(kernel,p,scale(normal,neg(ONE)))===-1;
        if(!regularCarrierBoundary){
        reject({
          ...meta,
          reason:'ambiguous-flow',
          detail:overlapping.kind==='boundary'?'overlapping-boundary-travel':'coincident-target',
          boundaryId:overlapping.boundaryId
        });
        continue;
        }
      }
      const hit=eventPoint(state, event),
      speed2=add(dot(v, v), sq(dot(f.g, v))),
      distance=[radd(state.distance[0], radical([[event.lambda[0], speed2]])), radd(state.distance[1], radical([[event.lambda[1], speed2]]))],
      itinerary=state.itinerary.at(-1)===f.id?state.itinerary:[...state.itinerary, f.id];
      budget?.check(4);
      // retained affine hit endpoints and displayed hit coordinates
      const result={
        ...meta,
        itinerary,
        event:{
          kind:event.kind,
          edgeId:event.edgeId,
          boundaryId:event.boundaryId,
          boundarySegmentIndex:event.boundarySegmentIndex
        },
        targetPieceIndex:event.targetPieceIndex,
        targetAxisId:event.targetAxisId??target.axisId,
        hitXY:[xy(vectorAt(hit, state.lo)), xy(vectorAt(hit, state.hi))],
        distanceExpressions:[distanceAt({
          distance
        }, state.lo), distanceAt({
          distance
        }, state.hi)],
        lo:state.lo,
        hi:state.hi,
        point:state.point
      };
      if(event.kind==='target'){
        emit({
          ...result,
          kind:'contact'
        });
        continue;
      }
      if(event.kind==='level'){
        queue.push({
          ...state,
          p:hit,
          distance,
          itinerary,
          incomingV:v,
          levelCrossing:{
            p:hit,
            distance,
            itinerary
          }
        });
        continue;
      }
      if(event.kind==='boundary'){
        const side=sign(targetPosition(f, vectorAt(hit, t)));
        if(actualFiniteTarget||side===sourceSide)emit({
          ...result,
          kind:'exception',
          boundaryId:event.boundaryId,
          hole:event.hole,
          firstExit:true
        });
        else emit({
          ...result,
          ...(state.levelCrossing?{
            hitXY:[xy(vectorAt(state.levelCrossing.p, state.lo)), xy(vectorAt(state.levelCrossing.p, state.hi))],
            distanceExpressions:[distanceAt(state.levelCrossing, state.lo), distanceAt(state.levelCrossing, state.hi)],
            event:{
              kind:'level'
            },
            itinerary:state.levelCrossing.itinerary
          }
          :{}),
          kind:'missing-axis'
        });
        continue;
      }
      queue.push({
        ...state,
        p:hit,
        distance,
        itinerary,
        incomingV:v,
        entry:event.edgeId
      });
    }
    const cover=verifySeedCover(covered);
    seedCoverage.push({
      ...provenance,
      ...cover
    });
    if(!cover.complete)failures.push({
      ...provenance,
      reason:'numeric-unresolved',
      detail:cover.reason,
      interval:[0, 1],
      stratum:'closed'
    });
  }
  return {
    unresolved:failures,
    coverage:{
      complete:seedCoverage.every(s=>s.complete),
      seeds:seedCoverage
    }
  };
}

export {traceSurfaceBand} from './terrain-surface-bands.js?v=1.3.3';
