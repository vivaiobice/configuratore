import {certifyNativeDirectionalFamily,hasVariedNativeDirectionalGeometry,DIRECTIONAL_SPACING_METHOD,DIRECTIONAL_SERVICE_METHOD} from './terrain-directional-certificate.js?v=1.3.4';
import {measureNativeDirectionalService,measuredSurfaceAreasComparable} from './terrain-surface-bands.js?v=1.3.4';
import {TERRAIN_MAX_NODES} from './terrain-contour-contracts.js?v=1.3.4';
import {
  createTerrainBudget
}
from './terrain-budget.js?v=1.3.4';
import {
  traceContourLevel
}
from './terrain-contours.js?v=1.3.4';
import {
  certifyContourSpacing
}
from './terrain-contour-validation.js?v=1.3.4';
import {
  traceSurfaceBand,
  measureSurfaceUnion,
  compareMeasuredSurfaceAreas
}
from './terrain-surface-bands.js?v=1.3.4';
import {
  toUTM,
  fromUTM
}
from './coordinate-system.js?v=1.3.4';
import {
  exactDomain,
  Q,
  ONE,
  add,
  mul,
  sqrtBounds,
  numberBounds,
  sign,
  sub,
  dot,
  cross,
  pointKey,
  number,
  height,
  splitSegment,
  xy,
  pointOnSegment,
  cmp,
  div,
  ZERO,
  orient
}
from './terrain-exact.js?v=1.3.4';
import {SOURCE_DOMAIN_AXIS_CONVENTION,SOURCE_PARAMETER_OPERATION,axisBinding,resolveSourceAxis,physicalFragments,exactPieceLengthBounds,trimSourceFragment,axisSourceHash,intersectSourceIntervals} from './terrain-axis-geometry.js?v=1.3.4';
import {certifyUniformPlaneSupport} from './terrain-surface-bands.js?v=1.3.4';
import {FINITE_POLYLINE_AXIS_CONVENTION,POLYLINE_SOURCE_PARAMETER_OPERATION,traceFinitePolylineContourLevel,resolveFinitePolylineSourceAxis,intersectPolylineSourceIntervals,polylinePhysicalFragments,trimPolylineSourceFragment,finitePolylineSourceHash,validFinitePolylineSourceAxisSchema} from './terrain-polyline-source.js?v=1.3.4';
const failed=(status,diagnostics)=>({
  ok:false,
  status,
  diagnostics
});
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const pathLength=points=>points.slice(1).reduce((s,p,i)=>s+distance(p,points[i]),0);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const failure=(status,message)=>Object.assign(new Error(message),{
  status
});
function liftPaths(kernel,points,budget) {
  const paths=[];
  let current=[];
  const finish=()=>{
    if(current.length>1)paths.push(current);
    current=[];
  };
  for(let i=1;i<points.length;i++){
    for(const piece of splitSegment(kernel,points[i-1].slice(0,2).map(Q),points[i].slice(0,2).map(Q),budget)){
      if(!piece.faces.length){
        if(piece.inside)throw failure('uncovered','Uncovered native row segment');
        finish();
        continue;
      }
      const face=piece.faces[0],
      a=[...xy(piece.a),number(height(face,piece.a))],
      b=[...xy(piece.b),number(height(face,piece.b))];
      budget.check(2);
      if(current.length&&!same(current.at(-1),a))finish();
      if(!current.length)current.push(a);
      current.push(b);
    }
  }
  finish();
  return paths;
}
function groundLengthBounds(kernel,points,budget) {
  let lo=ZERO,
  hi=ZERO;
  for(let i=1;i<points.length;i++){
    const a=points[i-1].slice(0,2).map(Q),
    b=points[i].slice(0,2).map(Q);
    budget.check(2);
    for(const piece of splitSegment(kernel,a,b,budget)){
      if(!piece.faces.length){
        if(piece.inside)throw failure('uncovered','Uncovered ground-trim interval');
        continue;
      }
      const v=piece.b.map((x,j)=>sub(x,piece.a[j])),
      dz=dot(piece.faces[0].g,v);
      budget.check(1);
      const bounds=sqrtBounds(add(dot(v,v),mul(dz,dz)));
      lo=add(lo,bounds[0]);
      hi=add(hi,bounds[1]);
    }
  }
  return [numberBounds(lo)[0],numberBounds(hi)[1]];
}
function trimPath(points,amount,kernel,budget) {
  const total=pathLength(points);
  if(total<=2*amount+.05){
    const sourceLengthBoundsM=groundLengthBounds(kernel,points,budget);
    return {
      points:[],
      provenance:{
        basis:'original-perimeter-ground-arclength',
        requestedWidthM:amount,
        sourceLengthBoundsM,
        consumedByHeadlands:cmp(Q(sourceLengthBoundsM[1]),mul(Q(2),Q(amount)))<=0,
        retainedIntervalEmpty:true
      }
    };
  }
  if(!amount)return {
    points
  };
  const result=[];
  let walked=0,
  startSegment=-1,
  endSegment=-1;
  for(let i=1;i<points.length;i++){
    const span=distance(points[i-1],points[i]),
    lo=Math.max(amount,walked),
    hi=Math.min(total-amount,walked+span);
    if(hi>lo){
      if(!result.length){
        result.push(mix(points[i-1],points[i],(lo-walked)/span));
        startSegment=i;
        budget.check(1);
      }
      result.push(mix(points[i-1],points[i],(hi-walked)/span));
      endSegment=i;
      budget.check(1);
    }
    walked+=span;
  }
  const removed=[points.slice(0,startSegment).concat([result[0]]),[result.at(-1),...points.slice(endSegment)]];
  const removedEnds=removed.map((path,end)=>{
    const coordinatesXY=path.map(p=>p.slice(0,2));
    budget.check(coordinatesXY.length);
    return {
      end:end?'end':'start',
      coordinatesXY,
      surfaceLengthBoundsM:groundLengthBounds(kernel,path,budget)
    };
  });
  return {
    points:result,
    provenance:{
      basis:'original-perimeter-ground-arclength',
      requestedWidthM:amount,
      removedEnds
    }
  };
}
function pathIdentity(points,budget) {
  const simple=[];
  for(const p of points){
    const point=p.slice(0,2).map(Q);
    budget.check(1);
    while(simple.length>1&&!sign(orient(simple.at(-2),simple.at(-1),point))&&
    dot(simple.at(-1).map((x,i)=>sub(x,simple.at(-2)[i])),point.map((x,i)=>sub(x,simple.at(-1)[i]))).n>=0n)simple.pop();
    simple.push(point);
  }
  const forward=simple.map(pointKey).join(';'),
  backward=[...simple].reverse().map(pointKey).join(';');
  return forward<backward?forward:backward;
}
function measureSourceAxes({domain,physicalDomain=domain,axes,headlandWidthM=0,budget}) {
  const original=exactDomain(domain,budget),physical=exactDomain(physicalDomain,budget),epsg=Number(domain.crs.split(':')[1]),rows=[],trimRecords=[];
  for(const axis of axes){
    if(axis.axisOperation&&headlandWidthM)throw failure('axis-geometry-unresolved','A retained recipe cannot be trimmed a second time');
    const resolved=resolveSourceAxis(original,axis,budget,{original:true});
    if(resolved.uncovered.length)throw failure('uncovered','Uncovered original source geometry');
    const retained=[];
    for(const pieces of physicalFragments(resolved.pieces)){
      if(!headlandWidthM){retained.push(axis.axisOperation??null);continue;}
      const trim=trimSourceFragment(axis,pieces,headlandWidthM,budget);
      trimRecords.push({axisId:axis.axisId,componentIndex:0,basis:'original-perimeter-ground-arclength',requestedWidthM:headlandWidthM,consumedByHeadlands:!!trim.consumed,retainedIntervalEmpty:!!trim.consumed,...trim});
      if(!trim.consumed)retained.push({kind:SOURCE_PARAMETER_OPERATION,intervals:[trim.interval]});
    }
    // Without a trim the exact source intersection is resolved once, rather
    // than duplicated for each original fragment (e.g. a perimeter hole).
    const operations=headlandWidthM?retained:retained.length?[axis.axisOperation??null]:[];
    let fragment=0;
    for(const operation of operations){
      const effective={...axis,...(operation?{axisOperation:operation}:{})};
      const clipped=resolveSourceAxis(physical,effective,budget);
      if(clipped.uncovered.length)throw failure('uncovered','Uncovered physical source geometry');
      const physicalPieces=intersectSourceIntervals(axis,clipped.pieces,resolved.pieces,budget);
      for(const pieces of physicalFragments(physicalPieces)){
        const surfaceLengthBoundsM=exactPieceLengthBounds(pieces,budget),horizontalLengthBoundsM=exactPieceLengthBounds(pieces,budget,{horizontal:true});
        if(!(surfaceLengthBoundsM[0]>0))throw failure('axis-geometry-unresolved','Positive source fragment ground length is unresolved');
        const surfaceLengthM=(surfaceLengthBoundsM[0]+surfaceLengthBoundsM[1])/2;
        const coordinatesXY=[xy(pieces[0].a),...pieces.map(p=>xy(p.b))];
        const coordinates=coordinatesXY.map(p=>fromUTM(p,epsg));
        budget.check(coordinatesXY.length+coordinates.length);
        rows.push({
          axisId:axis.axisId,
          fragmentId:`${axis.axisId}:fragment:${fragment++}`,
          portionId:axis.portionId,
          ordinal:axis.ordinal,
          coordinatesXY,coordinates,
          start:coordinates[0],end:coordinates.at(-1),
          horizontalLengthM:(horizontalLengthBoundsM[0]+horizontalLengthBoundsM[1])/2,
          horizontalLengthBoundsM,surfaceLengthM,surfaceLengthBoundsM,
          lengthM:surfaceLengthM,
          quantityBasis:'model-surface',
          coordinateRole:'render-export-preview',
          axisOperation:{
            kind:operation?.kind??SOURCE_DOMAIN_AXIS_CONVENTION,
            ...(operation?{intervals:operation.intervals}:{}),
            sourceHash:axisSourceHash(axis),
            ...axis.axisGeometryBinding
          },
          ...(headlandWidthM?{headlandTrim:trimRecords.filter(r=>r.axisId===axis.axisId)}:{})
        });
      }
    }
  }
  return {rows,trimRecords,rowAxisCount:new Set(rows.map(r=>r.axisId)).size,rowFragmentCount:rows.length};
}
function measurePolylineAxes({domain,physicalDomain=domain,axes,headlandWidthM=0,budget}) {
  const original=exactDomain(domain,budget),physical=exactDomain(physicalDomain,budget),epsg=Number(domain.crs.split(':')[1]),rows=[],trimRecords=[];
  for(const axis of axes){
    if(axis.axisOperation&&headlandWidthM)throw failure('axis-geometry-unresolved','A retained recipe cannot be trimmed a second time');
    const resolved=resolveFinitePolylineSourceAxis(original,axis,budget,{original:true,originalDomain:domain});
    if(resolved.uncovered.length)throw failure('uncovered','Uncovered original finite source geometry');
    const operations=[];
    if(headlandWidthM){
      for(const pieces of polylinePhysicalFragments(resolved.pieces,budget)){
        const trim=trimPolylineSourceFragment(axis,pieces,headlandWidthM,budget);
        budget.check(1);
        trimRecords.push({axisId:axis.axisId,componentIndex:pieces[0].componentIndex,basis:'original-perimeter-ground-arclength',requestedWidthM:headlandWidthM,consumedByHeadlands:!!trim.consumed,retainedIntervalEmpty:!!trim.consumed,...trim});
        if(!trim.consumed)operations.push(trim.operation);
      }
    }else if(resolved.pieces.length)operations.push(axis.axisOperation??null);
    let fragment=0;
    const sourceHash=finitePolylineSourceHash(axis,budget);
    for(const operation of operations){
      budget.check(1);
      const effective={...axis,...(operation?{axisOperation:operation}:{})};
      const clipped=resolveFinitePolylineSourceAxis(physical,effective,budget,{originalDomain:domain});
      if(clipped.uncovered.length)throw failure('uncovered','Uncovered physical finite source geometry');
      const pieces=intersectPolylineSourceIntervals(axis,clipped.pieces,resolved.pieces,budget);
      for(const actual of polylinePhysicalFragments(pieces,budget)){
        const surfaceLengthBoundsM=exactPieceLengthBounds(actual,budget),horizontalLengthBoundsM=exactPieceLengthBounds(actual,budget,{horizontal:true});
        if(!(surfaceLengthBoundsM[0]>0))throw failure('axis-geometry-unresolved','Positive finite fragment ground length is unresolved');
        budget.check(2*(actual.length+1)+1);
        const coordinatesXY=[xy(actual[0].a),...actual.map(piece=>xy(piece.b))],coordinates=coordinatesXY.map(point=>fromUTM(point,epsg));
        const surfaceLengthM=(surfaceLengthBoundsM[0]+surfaceLengthBoundsM[1])/2;
        rows.push({axisId:axis.axisId,fragmentId:`${axis.axisId}:fragment:${fragment++}`,portionId:axis.portionId,ordinal:axis.ordinal,coordinatesXY,coordinates,start:coordinates[0],end:coordinates.at(-1),horizontalLengthM:(horizontalLengthBoundsM[0]+horizontalLengthBoundsM[1])/2,horizontalLengthBoundsM,surfaceLengthM,surfaceLengthBoundsM,lengthM:surfaceLengthM,quantityBasis:'model-surface',coordinateRole:'render-export-preview',axisOperation:{kind:operation?.kind??FINITE_POLYLINE_AXIS_CONVENTION,...(operation?{intervals:operation.intervals}:{}),sourceHash,...axis.axisGeometryBinding},...(headlandWidthM?{headlandTrim:trimRecords.filter(record=>record.axisId===axis.axisId)}:{})});
      }
    }
  }
  return {rows,trimRecords,rowAxisCount:new Set(rows.map(row=>row.axisId)).size,rowFragmentCount:rows.length};
}
/** Lift and ground-trim original-perimeter axes before physical clipping.
 * Native face knots are integration points, never physical row fragments. */
export function measureContourAxes({
  domain,
  physicalDomain=domain,
  axes,
  headlandWidthM=0,
  budget=createTerrainBudget({
    kind:'measure'
  })
}) {
  if(axes.some(axis=>Object.hasOwn(axis,'axisGeometryConvention'))){
    if(axes.every(axis=>axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION))return measurePolylineAxes({domain,physicalDomain,axes,headlandWidthM,budget});
    if(!axes.every(axis=>axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION))throw failure('axis-geometry-unresolved','Mixed or unknown axis geometry conventions');
    return measureSourceAxes({domain,physicalDomain,axes,headlandWidthM,budget});
  }
  const original=exactDomain(domain,budget),
  physical=exactDomain(physicalDomain,budget);
  const epsg=Number(domain.crs?.split(':')[1]??32632),
  rows=[],
  trimRecords=[];
  for(const axis of axes){
    let fragment=0;
    const seen=new Set();
    for(const [componentIndex,component] of axis.components.entries()){
      let source=component.coordinatesXY;
      if(headlandWidthM>0){
        const points=domain.boundaries.flatMap(b=>b.coordinatesXY),
        xs=points.map(p=>p[0]),
        ys=points.map(p=>p[1]);
        const reach=2*Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))+1;
        const extend=(tip,neighbor)=>{
          const delta=tip.map((v,i)=>v-neighbor[i]),
          size=Math.hypot(...delta);
          budget.check(1);
          return tip.map((v,i)=>v+delta[i]*reach/size);
        };
        source=[extend(source[0],source[1]),...source,extend(source.at(-1),source.at(-2))];
      }
      const paths=liftPaths(original,source,budget);
      for(const path of paths){
        const trimmed=trimPath(path,Math.max(0,headlandWidthM),original,budget);
        if(trimmed.provenance)trimRecords.push({
          axisId:axis.axisId,
          componentIndex,
          ...trimmed.provenance
        });
        for(const points of liftPaths(physical,trimmed.points,budget)){
          const identity=pathIdentity(points,budget);
          if(seen.has(identity))continue;
          seen.add(identity);
          const surfaceLengthM=pathLength(points);
          if(surfaceLengthM<.05)continue;
          const coordinates=points.map(p=>fromUTM(p.slice(0,2),epsg));
          budget.check(coordinates.length+points.length);
          rows.push({
            axisId:axis.axisId,
            fragmentId:`${axis.axisId}:fragment:${fragment++}`,
            portionId:axis.portionId,
            ordinal:axis.ordinal,
            coordinates,
            start:coordinates[0],
            end:coordinates.at(-1),
            coordinatesXY:points.map(p=>p.slice(0,2)),
            horizontalLengthM:points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0),
            surfaceLengthM,
            lengthM:surfaceLengthM,
            quantityBasis:'model-surface',
            ...(trimmed.provenance?{
              headlandTrim:trimmed.provenance
            }
            :{
            })
          });
        }
      }
    }
  }
  return {
    rows,
    trimRecords,
    rowAxisCount:new Set(rows.map(r=>r.axisId)).size,
    rowFragmentCount:rows.length
  };
}
function certifiedSubset(sourceAxes,rows,budget) {
  if(sourceAxes.every(axis=>axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION)){
    const valid=rows.every(row=>{
      budget.check();
      const source=sourceAxes.find(axis=>axis.axisId===row.axisId),operation=row.axisOperation;
      if(!source||operation?.sourceHash!==finitePolylineSourceHash(source,budget)||operation.kind!==POLYLINE_SOURCE_PARAMETER_OPERATION)return false;
      return validFinitePolylineSourceAxisSchema({...source,axisOperation:{kind:operation.kind,intervals:operation.intervals}},budget);
    });
    return {valid,method:'exact-polyline-source-parameter-subset',rows:rows.map(row=>({fragmentId:row.fragmentId,axisId:row.axisId,axisOperation:row.axisOperation}))};
  }
  if(sourceAxes.every(axis=>axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION)){
    const valid=rows.every(row=>{
      budget.check();
      const source=sourceAxes.find(axis=>axis.axisId===row.axisId),operation=row.axisOperation;
      return source&&operation?.sourceHash===axisSourceHash(source)&&operation.kind===SOURCE_PARAMETER_OPERATION&&operation.intervals.every(([lo,hi])=>lo>=0&&lo<hi&&hi<=1);
    });
    return {valid,method:'exact-source-parameter-subset',rows:rows.map(row=>({fragmentId:row.fragmentId,axisId:row.axisId,axisOperation:row.axisOperation}))};
  }
  const provenance=[];
  const fraction=q=>`${q.n}/${q.d}`;
  for(const row of rows){
    const rowProof={
      fragmentId:row.fragmentId,
      axisId:row.axisId,
      segments:[]
    };
    provenance.push(rowProof);
    const source=sourceAxes.find(a=>a.axisId===row.axisId);
    if(!source)return {
      valid:false
    };
    const segments=source.components.flatMap((c,componentIndex)=>c.coordinatesXY.slice(1).map((p,segmentIndex)=>{
      budget.check(2);
      return {
        componentIndex,
        segmentIndex,
        a:c.coordinatesXY[segmentIndex].map(Q),
        b:p.map(Q)
      };
    }));
    const points=row.coordinatesXY;
    for(let i=1;i<points.length;i++){
      budget.check(3);
      const a=points[i-1].map(Q),
      b=points[i].map(Q),
      v=a.map((x,j)=>sub(b[j],x));
      const coordinate=sign(v[0])?0:1;
      if(!sign(v[coordinate]))continue;
      const intervals=[];
      for(const {
        a:u,
        b:w,
        componentIndex,
        segmentIndex
      }
      of segments){
        if(sign(orient(a,b,u))||sign(orient(a,b,w)))continue;
        const ends=[u,w].map(p=>div(sub(p[coordinate],a[coordinate]),v[coordinate])).sort(cmp);
        intervals.push(ends);
        const lo=cmp(ends[0],ZERO)<0?ZERO:ends[0],
        hi=cmp(ends[1],ONE)>0?ONE:ends[1];
        if(cmp(lo,hi)<0)rowProof.segments.push({
          rowSegmentIndex:i-1,
          sourceComponentIndex:componentIndex,
          sourceSegmentIndex:segmentIndex,
          rowParameterInterval:[lo,hi].map(fraction)
        });
      }
      intervals.sort((a,b)=>cmp(a[0],b[0]));
      let end=ZERO;
      for(const [lo,hi] of intervals){
        if(cmp(lo,end)>0)break;
        if(cmp(hi,end)>0)end=hi;
      }
      if(cmp(end,ONE)<0)return {
        valid:false
      };
    }
  }
  return {
    valid:true,
    method:'exact-rational-segment-subset',
    rows:provenance
  };
}
const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-points[i][j])),0);
const modulo=(x,period)=>((x%period)+period)%period;
/** Secondary objectives are considered only after exact equality of measured
 * served areas. Missing evidence or bounded refinement failure is nonapplicable. */
export function rankContourCandidates(candidates,options={
}) {
  const secondary=(a,b)=>(b.metrics.surfaceLengthM-a.metrics.surfaceLengthM)||
  ((a.metrics.nominalDeviationM??0)-(b.metrics.nominalDeviationM??0))||
  ((a.metrics.complexity??0)-(b.metrics.complexity??0))||a.id.localeCompare(b.id);
  const ordered=[];
  for(const candidate of candidates){
    let position=0;
    for(;position<ordered.length;position++){
      const other=ordered[position];
      if(candidate.valid!==other.valid){
        if(candidate.valid)break;
        continue;
      }
      if(!candidate.valid){
        if(candidate.id.localeCompare(other.id)<0)break;
        continue;
      }
      const areaOrder=compareMeasuredSurfaceAreas(candidate.areaMeasurement,other.areaMeasurement,options);
      if(areaOrder>0||areaOrder===0&&secondary(candidate,other)<0)break;
    }
    ordered.splice(position,0,candidate);
  }
  return ordered;
}
function nativeFacts(domain,budget) {
  const k=exactDomain(domain,budget),
  first=k.faces[0];
  const planeKey=f=>`${pointKey(f.g)};${pointKey([sub(f.vertices[0][2],dot(f.g,f.vertices[0].slice(0,2)))])}`;
  const plane=first&&k.faces.every(f=>planeKey(f)===planeKey(first));
  const speeds=k.faces.map(f=>({
    speed:Math.sqrt(number(f.q)/(1+number(f.q))),
    weight:f.areaM2??1,
    id:f.id
  }));
  const positive=speeds.filter(f=>f.speed>0).sort((a,b)=>a.speed-b.speed||a.id-b.id);
  const total=positive.reduce((s,f)=>s+f.weight,0);
  let sum=0,
  typical=0;
  for(const f of positive){
    sum+=f.weight;
    if(sum>=total/2){
      typical=f.speed;
      break;
    }
  }
  const elevations=[];
  for(const f of k.faces){
    budget.check();
    for(const p of f.clipped?.flat(2)??f.vertices.map(p=>p.slice(0,2).map(number)))elevations.push(number(height(f,p.map(Q))));
  }
  return {
    k,
    plane,
    flat:plane&&!sign(first.q),
    typical,
    min:domain.minM??Math.min(...elevations),
    max:domain.maxM??Math.max(...elevations)
  };
}
function manualAxes(reference,portion,facts,budget) {
  const epsg=Number(facts.k.domain.crs?.split(':')[1]??32632);
  return (reference.rows??[]).map((row,ordinal)=>{
    const points=row.coordinatesXY??(row.coordinates??[row.start,row.end]).map(p=>toUTM(p,epsg));
    budget.check(points.length);
    return {
      axisId:row.axisId??`${portion.id}:manual:${ordinal}`,
      portionId:portion.id,
      levelM:number(facts.k.faces[0].vertices[0][2]),
      ordinal,
      components:[{
        coordinatesXY:points
      }],
      manualRow:row
    };
  });
}
function rowsFor(axes,domain,budget) {
  if(axes.every(axis=>axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION))return measureSourceAxes({domain,axes,budget}).rows;
  const epsg=Number(domain.crs?.split(':')[1]??32632);
  return axes.flatMap(axis=>axis.components.map((component,index)=>{
    const coordinates=axis.manualRow?.coordinates??component.coordinatesXY.map(p=>fromUTM(p,epsg));
    budget.check(coordinates.length);
    const surfaceLengthBoundsM=groundLengthBounds(exactDomain(domain,budget),component.coordinatesXY,budget);
    const surfaceLengthM=surfaceLengthBoundsM[0]+(surfaceLengthBoundsM[1]-surfaceLengthBoundsM[0])/2;
    return {
      ...axis.manualRow,
      axisId:axis.axisId,
      ordinal:axis.ordinal,
      portionId:axis.portionId,
      fragmentId:`${axis.axisId}:fragment:${index}`,
      coordinates,
      start:axis.manualRow?.start??coordinates[0],
      end:axis.manualRow?.end??coordinates.at(-1),
      coordinatesXY:component.coordinatesXY,
      horizontalLengthM:length(component.coordinatesXY),
      surfaceLengthM,
      surfaceLengthBoundsM,
      lengthM:axis.manualRow?.lengthM??surfaceLengthM,
      quantityBasis:axis.manualRow?'certified-flat-legacy':'model-surface'
    };
  }));
}
function analyticPlaneCandidates(axes,facts,budget,diagnostics,originalDomain=facts.k.domain) {
  if(facts.plane&&certifyUniformPlaneSupport(facts.k.domain,budget)){
    const face=facts.k.faces[0],g=face.g.map(number),q=number(face.q),base=face.vertices[0].map(number);
    if(!q)return axes;
    const tangent=[-g[1]/Math.sqrt(q),g[0]/Math.sqrt(q)];
    const points=exactDomain(originalDomain,budget).boundaries.flatMap(b=>b.coordinates.map(xy));
    const reach=4*Math.hypot(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])))+1;
    diagnostics.endpointConstruction={kind:SOURCE_DOMAIN_AXIS_CONVENTION,finiteSourceSpan:'exact-original-scope-bbox'};
    return axes.map(axis=>{
      const center=[0,1].map(i=>base[i]+g[i]*(axis.levelM-base[2])/q);
      const coordinatesXY=[-reach,reach].map(t=>center.map((x,i)=>x+t*tangent[i]));
      budget.check(2);
      return {...axis,axisGeometryConvention:SOURCE_DOMAIN_AXIS_CONVENTION,axisGeometryBinding:axisBinding(facts.k.domain,originalDomain),components:[{coordinatesXY}]};
    });
  }
  if(facts.k.boundaries.length!==1||facts.k.boundaries[0].coordinates.length!==5||axes.some(a=>a.components.length!==1))return axes;
  const face=facts.k.faces[0],
  g=face.g.map(number),
  q=number(face.q),
  origin=face.vertices[0].map(number);
  const tangent=[-g[1]/Math.sqrt(q),g[0]/Math.sqrt(q)];
  const along=p=>(p[0]-origin[0])*tangent[0]+(p[1]-origin[1])*tangent[1];
  const intervals=axes.map(a=>a.components[0].coordinatesXY.map(along));
  const lo=Math.max(...intervals.map(v=>Math.min(...v)))+1e-6;
  const hi=Math.min(...intervals.map(v=>Math.max(...v)))-1e-6;
  if(!(hi>lo))return axes;
  // These are newly constructed automatic candidates. A small explicit common
  // interior slab avoids pretending a rounded binary point lies on an exact
  // irrational clipping boundary. Its actual endpoints are fully certified.
  diagnostics.endpointConstruction={
    kind:'common-interior-tangent-slab',
    insetM:1e-6
  };
  return axes.map(axis=>{
    const native=facts.k.byId.get(axis.components[0].faceIds?.[0])??face;
    const gradient=native.g.map(number),
    norm2=number(native.q),
    base=native.vertices[0].map(number),
    offset=along(base);
    return {
      ...axis,
      components:[{
        coordinatesXY:[lo,hi].map(t=>{
          budget.check(1);
          return [0,1].map(i=>base[i]+gradient[i]*(axis.levelM-base[2])/norm2+tangent[i]*(t-offset));
        })
      }]
    };
  });
}
// Candidate construction only. Native-plane integration supplies variable
// height steps on monotone axis-aligned profiles; the ordinary complete
// spacing/elevation/band oracles still decide every candidate's validity.
function extrudedSchedule(facts,budget) {
  const index=[0,1].find(i=>facts.k.faces.every(f=>!sign(f.g[1-i])&&sign(f.g[i])>0));
  if(index===undefined)return null;
  const values=facts.k.boundaries.flatMap(b=>b.coordinates.map(p=>number(p[index])));
  const lo=Math.min(...values),
  hi=Math.max(...values);
  const breaks=[lo,...facts.k.faces.flatMap(f=>f.vertices.map(p=>number(p[index]))).filter(v=>v>lo&&v<hi),hi].sort((a,b)=>a-b);
  const knots=[...new Set(breaks)],
  strips=[];
  let lengthM=0;
  for(let i=1;i<knots.length;i++){
    budget.check();
    const a=knots[i-1],
    b=knots[i],
    mid=(a+b)/2;
    const face=facts.k.faces.find(f=>f.nativeBounds[index]<=mid&&f.nativeBounds[index+2]>=mid);
    if(!face)return null;
    const speed=Math.hypot(1,number(face.g[index]));
    strips.push({
      a,
      b,
      face,
      speed,
      start:lengthM,
      end:lengthM+(b-a)*speed
    });
    lengthM+=(b-a)*speed;
  }
  return {
    lengthM,
    coordinateAtLevel:level=>{
      for(const strip of strips){
        budget.check();
        const point=strip.face.vertices[0].slice(0,2).map(number);
        point[index]=strip.a;
        const startLevel=number(height(strip.face,point.map(Q)));
        point[index]=strip.b;
        const endLevel=number(height(strip.face,point.map(Q)));
        if(level>=startLevel&&level<=endLevel)return strip.start+(level-startLevel)/number(strip.face.g[index])*strip.speed;
      }
      return NaN;
    },
    levelAt:r=>{
      const strip=strips.find(s=>r>=s.start&&r<=s.end);
      if(!strip)return NaN;
      const point=strip.face.vertices[0].slice(0,2).map(number);
      point[index]=strip.a+(r-strip.start)/strip.speed;
      return number(height(strip.face,point.map(Q)));
    }
  };
}
function completeCandidate({
  id,
  axes,
  domain,
  spacingM,
  toleranceM,
  referenceAreaM2,
  budget,
  reference,
  areaMode,
  legacyReplay=false
}) {
  const finiteSource=axes.every(axis=>axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION);
  const originalDomain=reference.originalDomain??domain;
  const directionalCertificate=finiteSource&&!legacyReplay?certifyNativeDirectionalFamily(domain,axes,{originalDomain,spacingM,toleranceM,budget}):null;
  // A failed sufficient proof is inconclusive. The global algebraic normal-band
  // branch is predictably intractable for general two-dimensional Float32 mesh
  // gradients, so leave the prior layout intact instead of consuming the cap.
  if(!legacyReplay&&finiteSource&&axes.length>1&&!directionalCertificate&&hasVariedNativeDirectionalGeometry(domain,budget))return {id,valid:false,validation:{valid:false,unresolved:[{reason:'native-directional-proof-inconclusive'}]}};
  const spacing=directionalCertificate??certifyContourSpacing(domain,axes,{
    ...(finiteSource?{originalDomain}:{}),
    spacingM,
    toleranceM,
    budget
  });
  if(!spacing.valid)return {
    id,
    valid:false,
    validation:spacing
  };
  const headlandWidthM=Math.max(0,reference.headlandWidthM??0);
  const measured=headlandWidthM?measureContourAxes({
    domain:reference.originalDomain??domain,
    physicalDomain:domain,
    axes,
    headlandWidthM,
    budget
  }):{
    rows:finiteSource?measurePolylineAxes({domain:originalDomain,physicalDomain:domain,axes,budget}).rows:axes.every(a=>a.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION)?measureSourceAxes({domain:reference.originalDomain??domain,physicalDomain:domain,axes,budget}).rows:rowsFor(axes,domain,budget),
    trimRecords:[]
  };
  const {
    rows,
    trimRecords
  }
  =measured;
  if(!rows.length)return {
    id,
    valid:false,
    validation:{
      unresolved:[{
        reason:'no-usable-headland-subset'
      }]
    }
  };
  const subset=headlandWidthM?certifiedSubset(axes,rows,budget):{
    valid:true,
    method:'unchanged-certified-source'
  };
  if(!subset.valid||trimRecords.some(p=>p.retainedIntervalEmpty&&!p.consumedByHeadlands))return {
    id,
    valid:false,
    validation:{
      unresolved:[{
        reason:'headland-subset-unproved'
      }]
    }
  };
  const serviceAxes=headlandWidthM?axes.map(axis=>({
    ...axis,
    ...(axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION?{
      axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals:[...new Map(rows.filter(row=>row.axisId===axis.axisId).flatMap(row=>row.axisOperation.intervals).map(record=>[JSON.stringify(record),record])).values()].sort((a,b)=>a.componentIndex-b.componentIndex||a.segmentIndex-b.segmentIndex||a.lo-b.lo)}
    }:axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION?{
      axisOperation:{kind:SOURCE_PARAMETER_OPERATION,intervals:[...new Map(rows.filter(r=>r.axisId===axis.axisId).flatMap(row=>row.axisOperation.intervals).map(pair=>[JSON.stringify(pair),pair])).values()].sort((a,b)=>a[0]-b[0])}
    }:{components:rows.filter(r=>r.axisId===axis.axisId).map(row=>({coordinatesXY:row.coordinatesXY}))})
  })).filter(a=>rows.some(row=>row.axisId===a.axisId)):axes;
  const directional=spacing.method===DIRECTIONAL_SPACING_METHOD;
  let area;
  if(directional)area=measureNativeDirectionalService({certificate:spacing,axes:serviceAxes,widthM:spacingM,budget});
  else {
  const bands=[];
  for(const axis of serviceAxes){
    const band=traceSurfaceBand({
      domain,
      ...(finiteSource?{originalDomain}:{}),
      axisXY:axis,
      widthM:spacingM,
      policy:'contour-normal',
      areaMode,
      budget
    });
    if(!band.valid)return {
      id,
      valid:false,
      validation:band.validation
    };
    bands.push(band);
  }
  const epsg=Number(domain.crs?.split(':')[1]??32632);
  const geometriesXY=bands.map(band=>({
    type:'MultiPolygon',
    coordinates:band.geometry.coordinates.map(p=>p.map(r=>r.map(q=>{
      budget.check(1);
      return toUTM(q,epsg);
    })))
  }));
  area=measureSurfaceUnion({
    domain,
    geometriesXY,
    areaMode,
    budget
  });
  }
  return {
    id,
    valid:true,
    areaMeasurement:area,
    axes,
    rows,
    validation:{
      ...spacing,
      maxElevationDeviationM:spacing.elevation.maxDeviationM,
      headlandSubset:{
        ...subset,
        widthM:headlandWidthM,
        trimRecords,
        sourceAxisIds:axes.map(a=>a.axisId),
        retainedAxisIds:serviceAxes.map(a=>a.axisId)
      },
      method:directional?DIRECTIONAL_SPACING_METHOD:'native-levels/continuous-bidirectional-spacing/actual-service-union'
    },
    coverage:{
      ...(directional?{serviceMethod:DIRECTIONAL_SERVICE_METHOD,serviceQualification:'certified-conservative-distance-to-row-subset'}:{}),
      servedAreaM2:area.areaM2,
      areaBoundsM2:area.areaBoundsM2,
      referenceAreaM2,
      percent:100*area.areaM2/referenceAreaM2
    },
    metrics:{
      surfaceLengthM:rows.reduce((s,r)=>s+r.surfaceLengthM,0),
      nominalDeviationM:Math.max(Math.abs((spacing.lowerM??spacingM)-spacingM),Math.abs((spacing.upperM??spacingM)-spacingM)),
      complexity:axes.reduce((s,a)=>s+a.components.reduce((n,c)=>n+c.coordinatesXY.length,0),0)
    }
  };
}
// Only replay uses this explicit legacy method. Submitted markers never grant
// authority: spacing and actual normal-band area are reconstructed from sources.
export function rebuildLegacyFiniteCandidate({domain,originalDomain,axes,spacingM,headlandWidthM,budget}){
 return completeCandidate({id:'legacy-replay',axes,domain,spacingM,toleranceM:.20,referenceAreaM2:1,budget,reference:{originalDomain,headlandWidthM},legacyReplay:true});
}
function planeAreaUpper(axes,facts,spacingM,budget) {
  if(!facts.plane)return Infinity;
  let upper=Q(0);
  for(const axis of axes){
    if(axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION){
      const physical=resolveSourceAxis(facts.k,axis,budget);
      if(physical.uncovered.length)return Infinity;
      for(const fragment of physicalFragments(physical.pieces)){
        const lengthUpper=Q(exactPieceLengthBounds(fragment,budget)[1]);
        upper=add(upper,mul(add(lengthUpper,Q(2e-5)),add(Q(spacingM),Q(2e-5))));
      }
      continue;
    }
    for(const component of axis.components){
    if(component.coordinatesXY.length!==2)return Infinity;
    budget.check();
    const [a,b]=component.coordinatesXY.map(p=>p.map(Q)),
    v=a.map((x,i)=>sub(b[i],x));
    const dz=dot(facts.k.faces[0].g,v),
    lengthUpper=sqrtBounds(add(dot(v,v),mul(dz,dz)))[1];
    upper=add(upper,mul(add(lengthUpper,Q(2e-5)),add(Q(spacingM),Q(2e-5))));
  }
    }
  return numberBounds(upper)[1];
}
function completionReserveNodes(candidate,budget){
  const count=value=>{
    budget.check();
    if(Array.isArray(value))return (value.length===2||value.length===3)&&value.every(Number.isFinite)?1:value.reduce((sum,item)=>sum+count(item),0);
    return value&&typeof value==='object'?Object.values(value).reduce((sum,item)=>sum+count(item),0):0;
  };
  // Reserve the emitted family/envelope copies plus fixed model/input overhead.
  const copies=2*count({axes:candidate.axes,rows:candidate.rows,validation:candidate.validation});
  return candidate.validation.method===DIRECTIONAL_SPACING_METHOD?Math.min(TERRAIN_MAX_NODES,Math.max(20000,copies)+(budget.usage?.().nodeCount??0)):Math.max(20000,copies);
}
/** Finite deterministic phase/progression search. Exhaustion is not an
 * impossibility proof. Every returned family has a complete fresh certificate;
 * one caller budget covers extraction, all rejected candidates and all bands. */
export function buildContourFamily({
  domain,
  portion,
  reference={
  },
  spacingM,
  toleranceM=.20,
  onSelectedAreaMeasurement,
  candidateGeneration=null,
  budget=createTerrainBudget({
    kind:'adapt'
  }),
  referenceAreaM2=domain?.surfaceAreaM2
}={
}) {
  const diagnostics={
    searchScope:'finite-two-phase-plane-or-two-progression-variable',
    candidates:[],
    frontiers:[],
    globalOptimality:false,
    searchComplete:true,
    selectionPolicy:'best-complete-candidate-in-finite-search'
  };
  try {
    budget.check();
    if(!domain||!portion?.id||!(spacingM>0)||!Number.isFinite(spacingM)||!(toleranceM>=0)||toleranceM>=spacingM)throw new RangeError('Invalid contour family input');
    if(candidateGeneration!==null){
      const single=candidateGeneration?.kind==='scoped-single-level-1';
      const allowed=single?['kind','singleLevelM']:['kind','singleLevelM','referenceLevelM','axisGeometryConvention'];
      if(!candidateGeneration||typeof candidateGeneration!=='object'||Array.isArray(candidateGeneration)||!['scoped-cut-1','scoped-single-level-1'].includes(candidateGeneration.kind)||Object.keys(candidateGeneration).some(key=>!allowed.includes(key))||single&&!Number.isFinite(candidateGeneration.singleLevelM)||['singleLevelM','referenceLevelM'].some(key=>Object.hasOwn(candidateGeneration,key)&&!Number.isFinite(candidateGeneration[key]))||Object.hasOwn(candidateGeneration,'axisGeometryConvention')&&candidateGeneration.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION)throw new RangeError('Invalid scoped candidate generation');
      diagnostics.searchScope=single?'one-explicit-complete-level':'scoped-cut:at-most-two-existing-one-anchored-one-single';
    }
    const facts=nativeFacts(domain,budget);
    if(!(referenceAreaM2>0))referenceAreaM2=domain.surfaceAreaM2??domain.faces.reduce((s,f)=>s+(f.surfaceAreaM2??0),0);
    if(!(referenceAreaM2>0))throw new RangeError('Positive reference surface area required');
    const complete=[];
    const evaluate=(id,axes)=>{
      if(!axes.length){
        diagnostics.candidates.push({
          id,
          valid:false,
          reason:'no-open-levels'
        });
        return;
      }
      const upper=planeAreaUpper(axes,facts,spacingM,budget);
      const incumbent=complete.length?rankContourCandidates(complete,{
        budget
      })[0]:null;
      if(incumbent&&upper<incumbent.coverage.areaBoundsM2[0]){
        diagnostics.candidates.push({
          id,
          valid:null,
          pruned:true,
          reason:'certified-plane-band-area-upper',
          areaUpperM2:upper
        });
        return;
      }
      const candidate=completeCandidate({
        id,
        axes,
        domain,
        spacingM,
        toleranceM,
        referenceAreaM2,
        budget,
        reference,
        areaMode:facts.plane?'constant-plane':'coplanar-patches'
      });
      diagnostics.candidates.push(candidate.valid?{
        id,
        valid:true,
        coverage:candidate.coverage,
        metrics:candidate.metrics
      }
      :{
        id,
        valid:false,
        validation:candidate.validation
      });
      if(candidate.valid){
        if(!incumbent||measuredSurfaceAreasComparable(candidate.areaMeasurement,incumbent.areaMeasurement,{budget}))complete.push(candidate);
        else diagnostics.candidates.at(-1).selectionExclusion='different-certified-service-basis';
      }
    };
    if(candidateGeneration?.kind==='scoped-single-level-1'){
      const level=candidateGeneration.singleLevelM;
      const traced=traceFinitePolylineContourLevel(domain,level,{originalDomain:reference.originalDomain??domain,portionId:portion.id,budget});
      if(traced.diagnostics.length)diagnostics.frontiers.push({candidateId:'scoped-single:explicit-level',levelM:level,diagnostics:traced.diagnostics});
      evaluate('scoped-single:explicit-level',traced.diagnostics.length?[]:traced.axes);
    }else if(facts.flat){
      diagnostics.searchScope='unchanged-compatible-manual-family';
      evaluate('manual',manualAxes(reference,portion,facts,budget));
    }else{
      const profile=facts.plane?null:extrudedSchedule(facts,budget);
      const step=profile?spacingM:spacingM*facts.typical,
      range=profile?profile.lengthM:facts.max-facts.min;
      if(!(step>0))return failed('review-required',{
        ...diagnostics,
        reason:'zero-gradient-or-no-progress'
      });
      const anchor=portion.anchor?toUTM(portion.anchor,Number(domain.crs.split(':')[1])):null;
      const referenceFace=anchor?facts.k.queryPoint(anchor.map(Q),budget)[0]:null;
      const ref=profile?range/2:referenceFace?number(height(referenceFace,anchor.map(Q)))-facts.min:range/2;
      const phases=[modulo(range,step)/2,modulo(ref,step)];
      if(Math.abs(phases[0]-phases[1])<step/8)phases[1]=modulo(phases[0]+step/2,step);
      const schedules=facts.plane?phases.map(phase=>({
        phase,
        scale:1
      })):
      [1,1+toleranceM/(2*spacingM)].map((scale,i)=>({
        phase:modulo((i%2?.25:.75)*step+phases[0],step),
        scale
      }));
      if(candidateGeneration!==null)schedules.forEach((schedule,index)=>{schedule.id=`candidate:${index}`;});
      const cache=new Map();
      const finiteSource=candidateGeneration?.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION;
      const tracedAt=(level,ordinal=0)=>{
        if(!cache.has(level))cache.set(level,finiteSource?traceFinitePolylineContourLevel(domain,level,{originalDomain:reference.originalDomain??domain,portionId:portion.id,ordinal,budget}):traceContourLevel(domain,level,{portionId:portion.id,budget}));
        return cache.get(level);
      };
      if(candidateGeneration!==null){
        // In the new finite route a singleton is an explicit offered level,
        // never an implicit success hiding failed filled progressions.
        if(!finiteSource||candidateGeneration.singleLevelM!==undefined||candidateGeneration.referenceLevelM!==undefined){
          const level=candidateGeneration.singleLevelM??candidateGeneration.referenceLevelM??(facts.min+(facts.max-facts.min)/2);
          const traced=tracedAt(level);
          if(traced.diagnostics.length)diagnostics.frontiers.push({candidateId:'scoped-cut:single-level',levelM:level,diagnostics:traced.diagnostics});
          evaluate('scoped-cut:single-level',traced.diagnostics.length?[]:(!finiteSource&&(facts.plane||profile)?analyticPlaneCandidates(traced.axes,facts,budget,diagnostics,reference.originalDomain??domain):traced.axes));
        }
        if(candidateGeneration.referenceLevelM!==undefined){
          const coordinate=profile?profile.coordinateAtLevel(candidateGeneration.referenceLevelM):candidateGeneration.referenceLevelM-facts.min;
          if(Number.isFinite(coordinate))schedules.unshift({phase:modulo(coordinate,step),scale:1,id:'scoped-cut:reference-anchored'});
          else diagnostics.frontiers.push({candidateId:'scoped-cut:reference-anchored',reason:'reference-level-outside-profile'});
        }
      }
      // An explicit singleton/reference offer may already be certified before
      // the scheduled progressions. Its first optional expansion needs exactly
      // the same enforced reserve as every later candidate.
      let optionalReserve=complete.length?{nodeCount:completionReserveNodes(rankContourCandidates(complete,{budget})[0],budget),remainingMs:1000}:null;
      if(optionalReserve&&!budget.withReserve){
        diagnostics.searchComplete=false;
        diagnostics.selectionPolicy='best-complete-candidate-with-completion-reserve';
        diagnostics.optionalSearchStop={reason:'completion-reserve-unavailable',skippedCandidateIds:schedules.map((schedule,index)=>schedule.id??`candidate:${index}`)};
        schedules.length=0;
      }
      for(let c=0;c<schedules.length;c++){
        const candidateStarted=budget.usage?.();
        const {
          phase,
          scale
        }
        =schedules[c],
        candidateId=schedules[c].id??`candidate:${c}`,
        axes=[];
        const executeCandidate=()=>{
        for(let coordinate=phase,ordinal=0;coordinate<range;coordinate=phase+(++ordinal)*step*scale){
          budget.check();
          if(ordinal&&coordinate===phase+(ordinal-1)*step*scale)throw new RangeError('Unrepresentable level progression');
          const level=profile?profile.levelAt(coordinate):facts.min+coordinate;
          const traced=tracedAt(level,ordinal);
          if(traced.diagnostics.length){
            diagnostics.frontiers.push({
              levelM:level,
              diagnostics:traced.diagnostics
            });
          }
          // An unresolved interior member invalidates this complete progression.
          if(traced.diagnostics.length||!traced.axes.length){
            axes.length=0;
            break;
          }
          for(const axis of traced.axes)axes.push({
            ...axis,
            ordinal
          });
        }
        diagnostics.frontiers.push({
          candidateId,
          lowerM:facts.min,
          upperM:facts.max,
          stepM:step*scale,
          phaseM:phase,
          kind:'scheduled-range-exhausted-not-impossibility'
        });
        evaluate(candidateId,!finiteSource&&(facts.plane||profile)?analyticPlaneCandidates(axes,facts,budget,diagnostics,reference.originalDomain??domain):axes);
        };
        try{
          if(optionalReserve)budget.withReserve(optionalReserve,executeCandidate);
          else executeCandidate();
        }catch(error){
          if(!error.budgetReservation||!complete.length)throw error;
          // The optional attempt spent real cumulative work, but yielded before
          // the live operation's completion reserve. No partial proof applies.
          budget.check();
          if(!diagnostics.candidates.some(candidate=>candidate.id===candidateId))diagnostics.candidates.push({id:candidateId,valid:false,incomplete:true,reason:'completion-reserve'});
          diagnostics.searchComplete=false;
          diagnostics.selectionPolicy='best-complete-candidate-with-completion-reserve';
          diagnostics.optionalSearchStop={reason:'completion-reserve-interruption',budgetReason:error.budgetReason,reserveNodes:optionalReserve.nodeCount,reserveMs:optionalReserve.remainingMs,usage:budget.usage(),skippedCandidateIds:schedules.slice(c).map((schedule,index)=>schedule.id??`candidate:${c+index}`)};
          break;
        }
        if(complete.length&&c+1<schedules.length&&candidateStarted){
          const incumbent=rankContourCandidates(complete,{budget})[0],reserveNodes=completionReserveNodes(incumbent,budget),usage=budget.usage();
          const estimatedNextNodes=Math.ceil((usage.nodeCount-candidateStarted.nodeCount)*1.5),estimatedNextMs=(usage.elapsedMs-candidateStarted.elapsedMs)*1.5;
          const reserveMs=1000;
          if(!budget.withReserve||TERRAIN_MAX_NODES-usage.nodeCount<estimatedNextNodes+reserveNodes||usage.remainingMs<estimatedNextMs+reserveMs){
            // Optional phase optimization never spends a fully proved incumbent's
            // completion reserve. Every candidate considered for selection has
            // already passed spacing, elevation, physical rows and service union.
            budget.check();
            diagnostics.searchComplete=false;
            diagnostics.selectionPolicy='best-complete-candidate-with-completion-reserve';
            diagnostics.optionalSearchStop={reason:'completion-reserve',estimatedNextNodes,estimatedNextMs,reserveNodes,reserveMs,usage,skippedCandidateIds:schedules.slice(c+1).map((schedule,index)=>schedule.id??`candidate:${c+1+index}`)};
            break;
          }
          optionalReserve={nodeCount:reserveNodes,remainingMs:reserveMs};
        }
      }
    }
    if(!complete.length)return failed('review-required',{
      ...diagnostics,
      reason:'finite-search-exhausted-or-unresolved'
    });
    const [best]=rankContourCandidates(complete,{
      budget
    });
    diagnostics.selectedCandidateId=best.id;
    diagnostics.areaTies=complete.filter(c=>c!==best&&compareMeasuredSurfaceAreas(best.areaMeasurement,c.areaMeasurement,{
      budget
    })===0).map(c=>c.id);
    if(onSelectedAreaMeasurement!==undefined){
      if(typeof onSelectedAreaMeasurement!=='function')throw new RangeError('Selected area observer must be a function');
      budget.check();
      onSelectedAreaMeasurement(best.areaMeasurement);
      budget.check();
    }
    return {
      ok:true,
      axes:best.axes.map(({
        manualRow,
        ...axis
      })=>axis),
      rows:best.rows,
      validation:best.validation,
      coverage:best.coverage,
      metrics:best.metrics,
      diagnostics
    };
  }catch(error){
    return failed(error.status??'review-required',{
      ...diagnostics,
      message:error.message,
      ...(error.diagnostics?{cause:error.diagnostics}:{}),
      ...(error.budgetReason?{budgetReason:error.budgetReason,budgetPhase:error.budgetPhase,budgetUsage:error.budgetUsage}:{})
    });
  }
}
