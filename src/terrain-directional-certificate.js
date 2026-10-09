// Native shortest-distance certificate. A fixed transverse lifted path proves
// an upper bound; the elevation differential bounds EVERY acquired-surface
// path below. No gradient-normal trajectory or exact-width band is claimed.
import {Q,ZERO,ONE,TWO,add,sub,mul,div,sq,cmp,sign,min,max,neg,key,unique,mid,numberBounds,sqrtBounds,exactDomain,height,inRegion,vsub,dot,nextUp,nextDown} from './terrain-exact.js?v=1.3.6';
import {axisPieces} from './terrain-surface-flow.js?v=1.3.6';
import {readAcquiredNativeSupport} from './terrain-contour-domain.js?v=1.3.6';
import {FINITE_POLYLINE_AXIS_CONVENTION,POLYLINE_SOURCE_PARAMETER_OPERATION} from './terrain-polyline-source.js?v=1.3.6';
export const DIRECTIONAL_SPACING_METHOD='native-directional-shortest-spacing-1';
export const DIRECTIONAL_SERVICE_METHOD='native-directional-conservative-ribbon-1';
const certificateEvidence=new WeakMap(),metricEvidence=new WeakMap();
const abs=q=>sign(q)<0?neg(q):q;
const fail=detail=>Object.assign(new Error(detail),{status:'numeric-unresolved',detail});
const atU=(line,u)=>add(line.c,mul(line.m,u));
const uOf=(p,frame)=>typeof frame==='number'?p[frame]:sub(mul(frame.v[1],p[0]),mul(frame.v[0],p[1]));
const wOf=(p,frame)=>typeof frame==='number'?p[1-frame]:add(mul(frame.v[0],p[0]),mul(frame.v[1],p[1]));
function lineFor(a,b,uAxis,budget){
 const au=uOf(a,uAxis),bu=uOf(b,uAxis),av=wOf(a,uAxis),bv=wOf(b,uAxis),du=sub(bu,au);if(!sign(du))return null;
 const m=div(sub(bv,av),du);
 budget.check(1);return {lo:min(au,bu),hi:max(au,bu),m,c:sub(av,mul(m,au))};
}
const shifted=(line,d)=>({...line,c:add(line.c,d)});
const covers=(line,u)=>cmp(line.lo,u)<=0&&cmp(line.hi,u)>=0;
const point=(u,v,frame)=>typeof frame==='number'?(frame===0?[u,v]:[v,u]):[div(add(mul(frame.v[1],u),mul(frame.v[0],v)),frame.norm2),div(sub(mul(frame.v[1],v),mul(frame.v[0],u)),frame.norm2)];
function meshMetrics(domain,budget){
 const acquired=readAcquiredNativeSupport(domain,{budget});let bySupport=metricEvidence.get(budget);
 if(!bySupport){bySupport=new WeakMap();metricEvidence.set(budget,bySupport);}
 if(bySupport.has(acquired))return bySupport.get(acquired);
 const mesh=acquired.mesh,directions=[{lo:null,hi:null},{lo:null,hi:null}],gradients=[];let maxQ=ZERO,mean=[ZERO,ZERO];
 for(const ids of mesh.triangles){
  budget.check(1);const [a,b,c]=ids.map(id=>mesh.vertices[id]),z=[a[2],b[2],c[2]].map(Q);
  const ux=sub(Q(b[0]),Q(a[0])),uy=sub(Q(b[1]),Q(a[1])),vx=sub(Q(c[0]),Q(a[0])),vy=sub(Q(c[1]),Q(a[1])),uz=sub(z[1],z[0]),vz=sub(z[2],z[0]),det=sub(mul(ux,vy),mul(uy,vx));
  const g=[div(sub(mul(uz,vy),mul(uy,vz)),det),div(sub(mul(ux,vz),mul(uz,vx)),det)];
  gradients.push(g);mean[0]=add(mean[0],g[0]);mean[1]=add(mean[1],g[1]);
  maxQ=max(maxQ,add(sq(g[0]),sq(g[1])));
  for(let i=0;i<2;i++){directions[i].lo=directions[i].lo===null?g[i]:min(directions[i].lo,g[i]);directions[i].hi=directions[i].hi===null?g[i]:max(directions[i].hi,g[i]);}
 }
 const choices=[];
 for(let vAxis=0;vAxis<2;vAxis++){
  const d=directions[vAxis];if(sign(d.lo)*sign(d.hi)<=0)continue;
  const least=min(abs(d.lo),abs(d.hi)),greatest=max(abs(d.lo),abs(d.hi));
  choices.push({vAxis,uAxis:1-vAxis,direction:sign(d.lo),speedUpper:sqrtBounds(div(maxQ,add(ONE,maxQ)))[1],pathFactorUpper:sqrtBounds(add(ONE,div(ONE,sq(least))))[1],lengthFactorUpper:sqrtBounds(add(ONE,sq(greatest)))[1]});
 }
 choices.sort((a,b)=>cmp(a.pathFactorUpper,b.pathFactorUpper));
 // A rational common direction also supports diagonally oriented hills. It
 // changes only the witness coordinate frame, never a native elevation.
 const dominant=max(abs(mean[0]),abs(mean[1]));
 if(sign(dominant)&&mean.every(q=>sign(q))){
  const v=mean.map(q=>div(q,dominant)),norm2=add(sq(v[0]),sq(v[1]));let lo=null,hi=null;
  for(const g of gradients){budget.check();const slope=add(mul(g[0],v[0]),mul(g[1],v[1]));lo=lo===null?slope:min(lo,slope);hi=hi===null?slope:max(hi,slope);}
  if(sign(lo)*sign(hi)>0){const least=min(abs(lo),abs(hi)),greatest=max(abs(lo),abs(hi));choices.push({vAxis:null,uAxis:{v,norm2},direction:sign(lo),speedUpper:sqrtBounds(div(maxQ,add(ONE,maxQ)))[1],pathFactorUpper:sqrtBounds(add(ONE,div(norm2,sq(least))))[1],lengthFactorUpper:div(sqrtBounds(add(norm2,sq(greatest)))[1],norm2)});}
 }
 bySupport.set(acquired,choices);return choices;
}
function boundaryLines(k,uAxis,budget){
 const lines=[],vertical=[];
 for(const boundary of k.boundaries)for(let i=1;i<boundary.coordinates.length;i++){
  const a=boundary.coordinates[i-1],b=boundary.coordinates[i],line=lineFor(a,b,uAxis,budget);
  if(line)lines.push(line);else vertical.push({u:uOf(a,uAxis),lo:min(wOf(a,uAxis),wOf(b,uAxis)),hi:max(wOf(a,uAxis),wOf(b,uAxis))});
 }
 const lo=lines.reduce((a,line)=>min(a,line.lo),lines[0]?.lo??ZERO),hi=lines.reduce((a,line)=>max(a,line.hi),lines[0]?.hi??ZERO);
 const events=unique([...arrangement(lines,lo,hi,budget),...vertical.map(edge=>edge.u)]);
 return {lines,vertical,events};
}
function fiber(k,boundaries,u,uAxis,budget){
 const hits=[];
 for(const line of boundaries.lines)if(covers(line,u))hits.push({v:atU(line,u),line});
 for(const edge of boundaries.vertical)if(!cmp(edge.u,u))for(const v of [edge.lo,edge.hi])hits.push({v,line:{m:ZERO,c:v}});
 hits.sort((a,b)=>cmp(a.v,b.v));const distinct=hits.filter((hit,i)=>!i||cmp(hit.v,hits[i-1].v));
 const intervals=[];
 for(let i=1;i<distinct.length;i++){
  budget.check();const lo=distinct[i-1],hi=distinct[i];
  if(inRegion(point(u,mid(lo.v,hi.v),uAxis),k)>=0){
   const previous=intervals.at(-1);
   if(previous&&cmp(atU(previous.hi,u),lo.v)===0)previous.hi=hi.line;
   else intervals.push({lo:lo.line,hi:hi.line});
  }
 }
 return intervals;
}
function piecesAsLines(pieces,uAxis,budget){
 const result=[];
 for(const piece of pieces){
  const line=lineFor(piece.a,piece.b,uAxis,budget);if(!line)return null;
  const previous=result.at(-1);
  if(previous&&previous.piece.axisId===piece.axisId&&previous.piece.componentIndex===piece.componentIndex&&!cmp(previous.m,line.m)&&!cmp(previous.c,line.c)&&(!cmp(previous.hi,line.lo)||!cmp(line.hi,previous.lo))){previous.lo=min(previous.lo,line.lo);previous.hi=max(previous.hi,line.hi);}
  else result.push({...line,piece});
 }
 return result;
}
function yValues(lines,u){return unique(lines.filter(line=>covers(line,u)).map(line=>atU(line,u)));}
function intervalContaining(intervals,u,y,direction){
 const containing=intervals.filter(interval=>cmp(atU(interval.lo,u),y)<=0&&cmp(atU(interval.hi,u),y)>=0);
 return containing.find(interval=>direction>0?cmp(atU(interval.hi,u),y)>0:cmp(atU(interval.lo,u),y)<0)??containing[0];
}
function topologyPair(k,boundaries,left,right,metric,budget){
 const events=unique([...left,...right].flatMap(line=>[line.lo,line.hi]).concat(boundaries.events));
 let reached=0,exceptions=0,strata=0;
 for(let i=0;i<events.length;i++)for(const u of i?[mid(events[i-1],events[i]),events[i]]:[events[i]]){
  budget.check();const sources=yValues(left,u);if(!sources.length)continue;
  const targets=yValues(right,u),intervals=fiber(k,boundaries,u,metric.uAxis,budget);
  for(const y of sources){
   budget.check(1);strata++;
   const interval=intervalContaining(intervals,u,y,metric.direction);
   // A contact can be a zero-length exit at a real closed perimeter vertex.
   if(!interval){if(inRegion(point(u,y,metric.uAxis),k)!==0)return null;exceptions++;continue;}
   const end=atU(metric.direction>0?interval.hi:interval.lo,u);
   const hits=targets.filter(t=>cmp(t,y)*metric.direction>=0&&cmp(t,end)*metric.direction<=0);
   if(hits.length>1)return null;
   if(hits.length)reached++;else exceptions++;
  }
 }
 return {reached,exceptions,strata};
}
// Geometry-derived dispatch cannot be disabled by deleting stored proof labels.
// Preserve the existing analytic plane and one-dimensional native branches.
export function hasVariedNativeDirectionalGeometry(domain,budget){
 const k=exactDomain(domain,budget);
 return !!k.faces.length&&!k.faces.every(f=>cmp(f.g[0],k.faces[0].g[0])===0&&cmp(f.g[1],k.faces[0].g[1])===0)&&![0,1].some(i=>k.faces.every(f=>!sign(f.g[i])));
}
/** Returns null when this sufficient certificate does not apply. */
export function certifyNativeDirectionalFamily(domain,axes,{originalDomain=domain,spacingM,toleranceM=.20,budget}={}){
 budget.check();budget.phase?.('directional-spacing');
 if(axes.length<2||axes.some(axis=>axis.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION||axis.axisOperation)||new Set(axes.map(axis=>axis.portionId)).size!==1)return null;
 const ordered=[...axes].sort((a,b)=>a.levelM-b.levelM);
 if(ordered.some((axis,i)=>!Number.isInteger(axis.ordinal)||i&&axis.ordinal!==ordered[i-1].ordinal+1))return null;
 if(!hasVariedNativeDirectionalGeometry(domain,budget))return null;
 const k=exactDomain(domain,budget),choices=meshMetrics(originalDomain,budget);if(!choices.length)return null;
 let deviation=ZERO;const groups=[];
 for(const axis of ordered){
  const resolved=axisPieces(k,axis,budget,{originalDomain});if(resolved.uncovered.length||!resolved.pieces.length)return null;
  for(const piece of resolved.pieces)for(const p of [piece.a,piece.b])deviation=max(deviation,abs(sub(height(piece.faces[0],p),Q(axis.levelM))));
  groups.push({axis,pieces:resolved.pieces});
 }
 if(cmp(deviation,Q(.001))>0)return null;
 for(const metric of choices){
  let lower=null,upper=null,eligible=true;
  for(let i=1;i<groups.length;i++){
   const gap=sub(Q(groups[i].axis.levelM),Q(groups[i-1].axis.levelM)),twice=mul(TWO,deviation),lo=div(sub(gap,twice),metric.speedUpper),hi=mul(add(gap,twice),metric.pathFactorUpper);
   if(cmp(lo,sub(Q(spacingM),Q(toleranceM)))<0||cmp(hi,add(Q(spacingM),Q(toleranceM)))>0){eligible=false;break;}
   lower=lower===null?lo:min(lower,lo);upper=upper===null?hi:max(upper,hi);
  }
  if(!eligible)continue;
  const boundaries=boundaryLines(k,metric.uAxis,budget),lineGroups=groups.map(group=>piecesAsLines(group.pieces,metric.uAxis,budget));if(lineGroups.some(lines=>!lines))continue;
  let reached=0,exceptions=0,strata=0;
  for(let i=1;i<groups.length&&eligible;i++)for(const reverse of [false,true]){
   const proof=topologyPair(k,boundaries,lineGroups[reverse?i:i-1],lineGroups[reverse?i-1:i],{...metric,direction:metric.direction*(reverse?-1:1)},budget);
   if(!proof){eligible=false;break;}reached+=proof.reached;exceptions+=proof.exceptions;strata+=proof.strata;
  }
  if(!eligible||!reached)continue;
  const certificate={valid:true,method:DIRECTIONAL_SPACING_METHOD,spacingMetric:'shortest-native-surface-distance',lowerM:numberBounds(lower)[0],upperM:numberBounds(upper)[1],errorBoundM:0,spans:[],exceptions:[],critical:[],unresolved:[],elevation:{valid:true,maxDeviationM:numberBounds(deviation)[1],critical:[]},coverage:{complete:true,seedCount:groups.reduce((sum,g)=>sum+g.pieces.length,0),directions:['forward','reverse'],proof:'exact-directional-fiber-open-and-point-strata',strata,connectedTargetStrata:reached,realBoundaryExitStrata:exceptions},approach:{valid:true,proof:'complete-acquired-native-elevation-lipschitz-lower'},directional:{coordinateAxis:metric.vAxis,...(metric.vAxis===null?{directionVectorXY:metric.uAxis.v.map(q=>numberBounds(q)[0])}:{}),nativeSupport:'complete-acquired-mesh',serviceMethod:DIRECTIONAL_SERVICE_METHOD}};
  certificateEvidence.set(certificate,{domain,originalDomain,k,metric,boundaries,budget});return certificate;
 }
 return null;
}

// Exact rational cell arrangement. All line ordering changes are inserted,
// so midpoint decisions select a single ordering for an entire open u cell.
function arrangement(lines,lo,hi,budget){
 const roots=new Map([[key(lo),lo],[key(hi),hi]]);
 for(const line of lines)for(const u of [line.lo,line.hi])if(cmp(u,lo)>0&&cmp(u,hi)<0)roots.set(key(u),u);
 for(let i=0;i<lines.length;i++)for(let j=0;j<i;j++){
  budget.check();const a=lines[i],b=lines[j],dm=sub(a.m,b.m);if(!sign(dm))continue;
  const u=div(sub(b.c,a.c),dm);
  if(cmp(u,lo)>0&&cmp(u,hi)<0&&covers(a,u)&&covers(b,u))roots.set(key(u),u);
 }
 budget.check(roots.size);return [...roots.values()].sort(cmp);
}
function clippedServiceIntervals(k,boundaries,bands,u,metric,budget){
 const physical=fiber(k,boundaries,u,metric.uAxis,budget),result=[];
 for(const band of bands){
  if(!covers(band.center,u))continue;
  const y=atU(band.center,u),interval=intervalContaining(physical,u,y,1)??intervalContaining(physical,u,y,-1);if(!interval)continue;
  const lo=cmp(atU(band.lo,u),atU(interval.lo,u))>0?band.lo:interval.lo,hi=cmp(atU(band.hi,u),atU(interval.hi,u))<0?band.hi:interval.hi;
  if(cmp(atU(lo,u),atU(hi,u))<0)result.push({lo,hi});
 }
 result.sort((a,b)=>cmp(atU(a.lo,u),atU(b.lo,u)));const union=[];
 for(const interval of result){const previous=union.at(-1);if(previous&&cmp(atU(interval.lo,u),atU(previous.hi,u))<=0){if(cmp(atU(interval.hi,u),atU(previous.hi,u))>0)previous.hi=interval.hi;}else union.push({...interval});}
 return union;
}
function triangleInterval(lines,u){
 const active=lines.filter(line=>covers(line,u));if(active.length<2)return null;
 active.sort((a,b)=>cmp(atU(a,u),atU(b,u)));return {lo:active[0],hi:active.at(-1)};
}
/** Exact union area of a deterministic certified distance-to-row subset.
 * The raw terms are not public authority; the caller binds its own measurement
 * only after this function has verified private live certificate identity. */
export function nativeDirectionalServiceTerms(certificate,axes,widthM,budget){
 budget.phase?.('directional-service');
 const evidence=certificateEvidence.get(certificate);if(!evidence||evidence.budget!==budget)throw fail('Missing actual directional certificate');
 const {domain,originalDomain,k,metric,boundaries}=evidence,d=div(Q(widthM),mul(TWO,metric.lengthFactorUpper)),bands=[];
 for(const axis of axes){
  const resolved=axisPieces(k,axis,budget,{originalDomain});if(resolved.uncovered.length)throw fail('Uncovered directional service source');
  const lines=piecesAsLines(resolved.pieces,metric.uAxis,budget);if(!lines)throw fail('Directional source is not a graph');
  for(const center of lines){budget.check(2);bands.push({center,lo:shifted(center,neg(d)),hi:shifted(center,d),bounds:[numberBounds(center.lo)[0],numberBounds(center.hi)[1],nextDown(numberBounds(min(atU(center,center.lo),atU(center,center.hi)))[0]-numberBounds(d)[1]),nextUp(numberBounds(max(atU(center,center.lo),atU(center,center.hi)))[1]+numberBounds(d)[1])]});}
 }
 const terms=[];
 for(const face of k.faces){
  budget.check();const points=face.vertices,uAxis=metric.uAxis;
  const lo=points.reduce((q,p)=>min(q,uOf(p,uAxis)),uOf(points[0],uAxis)),hi=points.reduce((q,p)=>max(q,uOf(p,uAxis)),uOf(points[0],uAxis)),bottom=points.reduce((q,p)=>min(q,wOf(p,uAxis)),wOf(points[0],uAxis)),top=points.reduce((q,p)=>max(q,wOf(p,uAxis)),wOf(points[0],uAxis));
  const box=[numberBounds(lo)[0],numberBounds(hi)[1],numberBounds(bottom)[0],numberBounds(top)[1]],near=bands.filter(b=>b.bounds[0]<=box[1]&&b.bounds[1]>=box[0]&&b.bounds[2]<=box[3]&&b.bounds[3]>=box[2]);if(!near.length)continue;
  const triangle=points.map((p,i)=>lineFor(p,points[(i+1)%3],uAxis,budget)).filter(Boolean),boundary=boundaries.lines.filter(line=>cmp(line.lo,hi)<=0&&cmp(line.hi,lo)>=0);
  const roots=arrangement([...triangle,...boundary,...near.flatMap(band=>[band.center,band.lo,band.hi])],lo,hi,budget);let area=ZERO;
  for(let i=1;i<roots.length;i++){
   const a=roots[i-1],b=roots[i],u=mid(a,b),native=triangleInterval(triangle,u);if(!native)continue;
   const intervals=clippedServiceIntervals(k,boundaries,near,u,metric,budget);
   for(const interval of intervals){
    const low=cmp(atU(interval.lo,u),atU(native.lo,u))>0?interval.lo:native.lo,high=cmp(atU(interval.hi,u),atU(native.hi,u))<0?interval.hi:native.hi;
    if(cmp(atU(low,u),atU(high,u))>=0)continue;
    area=add(area,div(mul(sub(b,a),add(sub(atU(high,a),atU(low,a)),sub(atU(high,b),atU(low,b)))),TWO));
   }
  }
  if(sign(area)>0){budget.check(1);terms.push([typeof metric.uAxis==='number'?area:div(area,metric.uAxis.norm2),add(ONE,face.q)]);}
 }
 return {terms,serviceMethod:DIRECTIONAL_SERVICE_METHOD,halfDisplacementXYM:numberBounds(typeof metric.uAxis==='number'?d:div(d,sqrtBounds(metric.uAxis.norm2)[1]))[0],coordinateAxis:metric.vAxis,...(metric.vAxis===null?{directionVectorXY:metric.uAxis.v.map(q=>numberBounds(q)[0])}:{} )};
}
export function directionalRetainedAxes(axes,rows,budget){
 return axes.map(axis=>{
  const intervals=[...new Map(rows.filter(row=>row.axisId===axis.axisId).flatMap(row=>row.axisOperation?.intervals??[]).map(interval=>[JSON.stringify(interval),interval])).values()].sort((a,b)=>a.componentIndex-b.componentIndex||a.segmentIndex-b.segmentIndex||a.lo-b.lo);
  budget.check(intervals.length);return {...axis,axisOperation:{kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals}};
 }).filter(axis=>axis.axisOperation.intervals.length);
}
