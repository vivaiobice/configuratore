import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {
  Q, ZERO, ONE, number, add, sub, mul, div, neg, cmp, sign, sq, min, max, key, vsub, dot,
  cross, mid, xy, numberBounds, exactDomain, height, splitSegment,
  segmentDistanceSquared, radical, radicalCompare, lengthBounds, radd, rscale,
  radicalBounds
} from './terrain-exact.js?v=1.3.6';
import {axisPieces,coalescePlanePieces,traceNormalBundles} from './terrain-surface-flow.js?v=1.3.6';
import {certifyUniformPlaneSupport} from './terrain-surface-bands.js?v=1.3.6';
/** Check every affine face-contained subsegment, including internal native
 * edge/vertex crossings. Extrema of affine elevation error occur at endpoints. */
export function certifyContourElevation(domain, axes, {
  originalDomain=domain,
  budget=createTerrainBudget({
    kind:'measure'
  })
}
={}){
  budget.phase('contour-elevation');
  const k=exactDomain(domain, budget),
  critical=[];
  let maximum=ZERO;
  for (const axis of axes){
    budget.check();
    if(!Number.isFinite(axis.levelM)){
      critical.push({
        reason:'elevation',
        axisId:axis.axisId,
        detail:'invalid-level'
      });
      continue;
    }
    const {
      pieces,
      uncovered
    }
    =axisPieces(k, axis, budget,{originalDomain});
    if(!pieces.length)critical.push({
      reason:'uncovered',
      axisId:axis.axisId
    });
    for (const p of uncovered)critical.push({
      reason:'uncovered',
      axisId:axis.axisId,
      componentIndex:p.componentIndex,
      segmentIndex:p.segmentIndex,
      interval:[key(p.lo), key(p.hi)],
      xy:xy(p.a)
    });
    for(const p of pieces)for(const endpoint of [p.a, p.b]){
      const f=p.faces[0],
      error=sub(height(f, endpoint), Q(axis.levelM)),
      m=sign(error)<0?neg(error):error;
      maximum=max(maximum, m);
      if(cmp(m, Q(.001))>0)critical.push({
        reason:'elevation',
        axisId:axis.axisId,
        faceId:f.id,
        componentIndex:p.componentIndex,
        segmentIndex:p.segmentIndex,
        xy:xy(endpoint),
        deviationM:numberBounds(m),
        limitM:.001
      });
    }
  }
  return {
    valid:axes.length>0&&!critical.length,
    maxDeviationM:numberBounds(maximum)[1],
    critical
  };
}
function lifted(piece){
  const face=piece.faces[0];
  return {
    ...piece,
    face,
    a3:[...piece.a, height(face, piece.a)],
    b3:[...piece.b, height(face, piece.b)]
  };
}
function boxLower2(a, b){
  let sum=ZERO;
  for (let i=0; i<3; i++){
    const amin=min(a.a3[i], a.b3[i]),
    amax=max(a.a3[i], a.b3[i]),
    bmin=min(b.a3[i], b.b3[i]),
    bmax=max(b.a3[i], b.b3[i]),
    gap=max(ZERO, max(sub(amin, bmax), sub(bmin, amax)));
    sum=add(sum, sq(gap));
  }
  return sum;
}
function surfacePath(kernel, a, b, budget){
  let expression=[];
  for (const piece of splitSegment(kernel, a, b, budget, {
    region:false
  })){
    if(!piece.faces.length)return null;
    const f=piece.faces[0],
    vector=[...vsub(piece.b, piece.a), sub(height(f, piece.b), height(f, piece.a))];
    expression=radd(expression, radical([[ONE, dot(vector, vector)]]));
  }
  return expression;
}
// A globally consistent extruded terrain admits an exact isometry (u(x), y),
// where u integrates sqrt(1+z'(x)^2). This refines a short XYZ chord across folds.
function extrusion(kernel, budget){
  for (const coordinate of [0, 1]){
    const other=1-coordinate;
    if(kernel.faces.some(f=>sign(f.g[other])))continue;
    const rawIntervals=kernel.faces.map(f=>({
      lo:f.vertices.reduce((s, p)=>min(s, p[coordinate]), f.vertices[0][coordinate]),
      hi:f.vertices.reduce((s, p)=>max(s, p[coordinate]), f.vertices[0][coordinate]),
      slope:f.g[coordinate],
      intercept:sub(f.vertices[0][2], mul(f.g[coordinate], f.vertices[0][coordinate]))
    }));
    const intervals=[...new Map(rawIntervals.map(s=>[[s.lo, s.hi, s.slope, s.intercept].map(key).join(','), s])).values()];
    let consistent=true;
    for (let i=0; i<intervals.length&&consistent; i++)for (let j=0; j<i; j++){
      budget.check();
      const a=intervals[i],
      b=intervals[j];
      if(cmp(max(a.lo, b.lo), min(a.hi, b.hi))<0&&(cmp(a.slope, b.slope)||cmp(a.intercept, b.intercept))){
        consistent=false;
        break;
      }
    }
    if(consistent)return {
      coordinate,
      intervals
    };
  }
  return null;
}
function unfoldedLower(profile, a, b){
  const i=profile.coordinate;
  if(cmp(a.a[i], a.b[i])||cmp(b.a[i], b.b[i]))return null;
  const lo=min(a.a[i], b.a[i]),
  hi=max(a.a[i], b.a[i]),
  roots=[lo, hi];
  for (const span of profile.intervals)for(const t of [span.lo, span.hi])if(cmp(t, lo)>0&&cmp(t, hi)<0)roots.push(t);
  const sorted=[...new Map(roots.map(t=>[key(t), t])).values()].sort(cmp);
  let result=[];
  for (let j=1; j<sorted.length; j++){
    const m=mid(sorted[j-1], sorted[j]),
    span=profile.intervals.find(s=>cmp(s.lo, m)<=0&&cmp(s.hi, m)>=0);
    if(!span)return null;
    result=radd(result, radical([[sub(sorted[j], sorted[j-1]), add(ONE, sq(span.slope))]]));
  }
  return result;
}
/** Independent all-row minimum approach. A sorted X interval index cannot omit
 * any pair shorter than L. Exact segment-set XYZ squared distance is a lower
 * bound, never an invalidity witness. An actual lifted surface path proves a
 * too-close violation; an inconclusive chord is refined or unresolved. */
function certifyApproach(kernel, groups, L, budget){
  const critical=[],
  unresolved=[],
  proofs=[],
  segments=groups.flatMap(g=>g.pieces.map(p=>lifted(p))).sort((a, b)=>cmp(min(a.a3[0], a.b3[0]), min(b.a3[0], b.b3[0])));
  let profile;
  for (let i=0; i<segments.length; i++){
    budget.check();
    const a=segments[i],
    limit=add(max(a.a3[0], a.b3[0]), L);
    for (let j=i+1; j<segments.length; j++){
      budget.check();
      const b=segments[j];
      if(cmp(min(b.a3[0], b.b3[0]), limit)>0)break;
      if(a.rowId===b.rowId||a.portionId!==b.portionId)continue;
      if(cmp(boxLower2(a, b), sq(L))>=0)continue;
      const nearest=segmentDistanceSquared(a.a3, a.b3, b.a3, b.b3),
      meta={
        axisId:a.axisId,
        targetAxisId:b.axisId,
        sourceSegmentIndex:a.segmentIndex,
        targetSegmentIndex:b.segmentIndex,
        sourceFaceId:a.face.id,
        targetFaceId:b.face.id,
        xy:xy(nearest.p.slice(0, 2)),
        targetXY:xy(nearest.q.slice(0, 2))
      };
      if(cmp(nearest.distance2, sq(L))>=0){
        proofs.push({
          ...meta,
          kind:'xyz-segment-lower',
          lowerM:lengthBounds(radical([[ONE, nearest.distance2]]))[0]
        });
        continue;
      }
      const witness=surfacePath(kernel, nearest.p.slice(0, 2), nearest.q.slice(0, 2), budget);
      if(witness&&radicalCompare(witness, L, budget)===-1){
        critical.push({
          ...meta,
          reason:'too-close',
          proof:'continuous-surface-path',
          distanceM:lengthBounds(witness)
        });
        continue;
      }
      if(profile===undefined)profile=extrusion(kernel, budget);
      const refined=profile?unfoldedLower(profile, a, b):null;
      const refinedComparison=refined?radicalCompare(refined, L, budget):null;
      if(refinedComparison!==null&&refinedComparison>=0){
        proofs.push({
          ...meta,
          kind:'extrusion-isometry-lower',
          lowerM:Math.max(number(L), lengthBounds(refined)[0])
        });
        continue;
      }
      unresolved.push({
        ...meta,
        reason:'numeric-unresolved',
        detail:'minimum-approach-lower-inconclusive',
        chordLowerM:lengthBounds(radical([[ONE, nearest.distance2]]))[0]
      });
    }
  }
  return {
    critical,
    unresolved,
    proofs
  };
}
// A failing endpoint limit is not by itself a witness for an open stratum.
// Move rationally into that same itinerary until a strict violation is proved.
function violationWitness(expressions, comparisons, lo, hi, point, L, U, budget){
  const index=comparisons.findIndex(c=>c.lower<0||c.upper>0),
  reason=comparisons[index].lower<0?'too-close':'too-far',
  threshold=reason==='too-close'?L:U;
  for (let power=1; power<=512; power++){
    budget.check();
    const delta={
      n:1n,
      d:1n<<BigInt(power)
    },
    weight=point?ZERO:index===0?delta:sub(ONE, delta),
    expression=radd(rscale(expressions[0], sub(ONE, weight)), rscale(expressions[1], weight)),
    comparison=radicalCompare(expression, threshold, budget);
    if(comparison===(reason==='too-close'?-1:1)){
      const exactBounds=radicalBounds(expression, 512),
      outside=reason==='too-close'?cmp(exactBounds[1], threshold)<0:cmp(exactBounds[0], threshold)>0;
      if(outside)return {
        reason,
        distanceM:lengthBounds(expression),
        distanceExactBounds:exactBounds.map(key),
        witnessSeedParameter:key(add(lo, mul(sub(hi, lo), weight))),
        proof:'exact-affine-interior-witness'
      };
    }
    if(point)break;
  }
  return null;
}
/** Ordinals assert chosen-family membership. They are never synthesized by
 * a certificate: known gaps fail even when a real boundary interrupts flow.
 * Multiple physical components at one asserted level/ordinal form one row. */
function organizeFamily(kernel, axes, flat, budget, critical, unresolved,originalDomain=kernel.domain) {
  const groups=[],
  ids=new Set();
  for (const axis of axes) {
    if (ids.has(axis.axisId)) unresolved.push({
      reason:'topology',
      detail:'duplicate-axis-id',
      axisId:axis.axisId
    });
    ids.add(axis.axisId);
    if (axes.length>1 && !Number.isInteger(axis.ordinal)) unresolved.push({
      reason:'topology',
      detail:'ambiguous-ordinal-order',
      axisId:axis.axisId
    });
    const portionId=axis.portionId??'default';
    let group=groups.find(g=>g.portionId===portionId&&g.axis.ordinal===axis.ordinal&&g.axis.levelM===axis.levelM);
    if (!group) {
      group={
        portionId,
        axis:{
          ...axis,
          axisIds:[]
        },
        pieces:[],
        uncovered:[],
        rowId:groups.length
      };
      groups.push(group);
    }
    group.axis.axisIds.push(axis.axisId);
    const parts=axisPieces(kernel, axis, budget,{originalDomain});
    group.pieces.push(...parts.pieces.map(p=>({
      ...p,
      rowId:group.rowId,
      portionId
    })));
    group.uncovered.push(...parts.uncovered);
  }
  if (flat) for (const group of groups) {
    const reference=group.pieces[0];
    if (!reference) continue;
    const tangent=vsub(reference.b, reference.a);
    for (const piece of group.pieces) {
      if (sign(cross(tangent, vsub(piece.b, piece.a))) || sign(cross(tangent, vsub(piece.a, reference.a)))) {
        unresolved.push({
          reason:'ambiguous-flow',
          detail:'flat-row-corner-or-offset-component',
          axisId:piece.axisId,
          componentIndex:piece.componentIndex,
          segmentIndex:piece.segmentIndex,
          xy:xy(piece.a)
        });
      }
    }
  }
  groups.sort((a, b)=>a.portionId.localeCompare(b.portionId)|| (flat?(a.axis.ordinal??0)-(b.axis.ordinal??0):a.axis.levelM-b.axis.levelM));
  for (let i=1; i<groups.length; i++) {
    const a=groups[i-1],
    b=groups[i];
    if (a.portionId!==b.portionId) continue;
    if (flat && a.pieces.length && b.pieces.length && sign(cross(vsub(a.pieces[0].b, a.pieces[0].a), vsub(b.pieces[0].b, b.pieces[0].a)))) {
      unresolved.push({
        reason:'ambiguous-flow',
        detail:'flat-family-nonparallel',
        axisId:a.axis.axisId,
        targetAxisId:b.axis.axisId
      });
    }
    const gap=b.axis.ordinal-a.axis.ordinal;
    const detail={
      axisId:a.axis.axisId,
      targetAxisId:b.axis.axisId,
      sourceOrdinal:a.axis.ordinal,
      targetOrdinal:b.axis.ordinal,
      portionId:a.portionId
    };
    if (Number.isInteger(gap)&&gap>1) critical.push({
      ...detail,
      reason:'missing-axis',
      detail:'known-ordinal-gap'
    });
    else if (gap!==1) unresolved.push({
      ...detail,
      reason:'topology',
      detail:'ambiguous-ordinal-order'
    });
  }
  return groups;
}
/** Bidirectional continuous seed cover plus independent global approach proof. */
export function certifyContourSpacing(domain, axes, {
  spacingM,
  toleranceM=.20,
  originalDomain=domain,
  budget=createTerrainBudget({
    kind:'measure'
  })
}
={}){
  if(!Number.isFinite(spacingM)||!Number.isFinite(toleranceM)||spacingM<=0||toleranceM<0||spacingM<=toleranceM)throw new RangeError('Invalid contour spacing');
  budget.phase('contour-spacing');
  const k=exactDomain(domain, budget),
  L=Q(spacingM-toleranceM),
  U=Q(spacingM+toleranceM),
  spans=[],
  exceptions=[],
  critical=[],
  unresolved=[],
  flat=k.faces.every(f=>!sign(f.q)&&cmp(f.vertices[0][2], k.faces[0].vertices[0][2])===0),
  groups=organizeFamily(k, axes, flat, budget, critical, unresolved,originalDomain);
  for (const g of groups)for(const p of g.uncovered)unresolved.push({
    reason:'uncovered',
    axisId:g.axis.axisId,
    componentIndex:p.componentIndex,
    segmentIndex:p.segmentIndex,
    interval:[key(p.lo), key(p.hi)],
    xy:xy(p.a)
  });
  const elevation=certifyContourElevation(domain, axes, {
    budget,originalDomain
  });
  critical.push(...elevation.critical);
  const planeSupport=certifyUniformPlaneSupport(domain,budget);
  if(planeSupport)for(const group of groups)group.pieces=coalescePlanePieces(group.pieces,budget);
  budget.phase('contour-spacing');
  const approach=certifyApproach(k, groups, L, budget);
  critical.push(...approach.critical);
  unresolved.push(...approach.unresolved);
  let lowerM=null,
  upperM=null,
  errorBoundM=0,
  seedCount=0,
  flowCoverage=[];
  for (let i=1; i<groups.length; i++)for (const reverse of [false, true]){
    budget.check();
    if(groups[i-1].portionId!==groups[i].portionId)continue;
    const source=groups[reverse?i:i-1],
    target=groups[reverse?i-1:i],
    direction=reverse?'reverse':'forward';
    seedCount+=source.pieces.length;
    const fail=traceNormalBundles({
      kernel:k,
      source:source.axis,
      target:target.axis,
      sourcePieces:source.pieces,
      targetPieces:target.pieces,
      flat,
      uniformPlane:!!planeSupport,
      budget,
      terminal:terminal=>{
        const {
          distanceExpressions,
          lo,
          hi,
          point,
          ...record
        }
        =terminal,
        distances=distanceExpressions.map(lengthBounds),
        entry={
          ...record,
          direction,
          distanceM:[Math.min(...distances.map(d=>d[0])), Math.max(...distances.map(d=>d[1]))],
          numericErrorM:Math.max(...distances.map(d=>numberBounds(sub(Q(d[1]),Q(d[0])))[1]))
        };
        errorBoundM=Math.max(errorBoundM, entry.numericErrorM);
        if(terminal.kind==='exception'){
          exceptions.push({
            ...entry,
            reason:'boundary-exit'
          });
          return;
        }
        if(terminal.kind==='missing-axis'){
          critical.push({
            ...entry,
            reason:'missing-axis'
          });
          return;
        }
        const comparisons=distanceExpressions.map(d=>({
          lower:radicalCompare(d, L, budget),
          upper:radicalCompare(d, U, budget)
        }));
        if(comparisons.some(c=>c.lower===null||c.upper===null)){
          unresolved.push({
            ...entry,
            reason:'numeric-unresolved',
            detail:'distance-threshold'
          });
          return;
        }
        if(comparisons.some(c=>c.lower<0||c.upper>0)){
          const witness=violationWitness(distanceExpressions, comparisons, lo, hi, point, L, U, budget);
          if(witness)critical.push({
            ...entry,
            spanDistanceM:entry.distanceM,
            ...witness
          });
          else unresolved.push({
            ...entry,
            reason:'numeric-unresolved',
            detail:'strict-violation-witness'
          });
          return;
        }
        // Exact comparisons prove these intersections with [L,U]. This tightens an
        // outward representation at inclusive equality without unproven clamping.
        entry.distanceM=[Math.max(spacingM-toleranceM, entry.distanceM[0]), Math.min(spacingM+toleranceM, entry.distanceM[1])];
        lowerM=lowerM===null?entry.distanceM[0]:Math.min(lowerM, entry.distanceM[0]);
        upperM=upperM===null?entry.distanceM[1]:Math.max(upperM, entry.distanceM[1]);
        spans.push(entry);
      }
    });
    unresolved.push(...fail.unresolved.map(f=>({
      ...f,
      direction
    })));
    flowCoverage.push(...fail.coverage.seeds.map(s=>({
      ...s,
      direction
    })));
  }
  const covered=flowCoverage.every(s=>s.complete)&&groups.every(g=>!g.uncovered.length)&&axes.length>0,
  complete=covered&&unresolved.length===0&&critical.length===0;
  return {
    valid:complete,
    lowerM,
    upperM,
    errorBoundM,
    spans,
    exceptions,
    critical,
    unresolved,
    coverage:{
      complete:covered,
      seedCount,
      seeds:flowCoverage,
      directions:groups.length>1?['forward', 'reverse']:[],
      proof:'exact-affine-event-partition-with-point-strata'
    },
    approach:{
      valid:!approach.critical.length&&!approach.unresolved.length,
      proofs:approach.proofs
    },
    elevation
  };
}
