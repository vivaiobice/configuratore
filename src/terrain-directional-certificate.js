// Native shortest-distance certificate. A fixed transverse lifted path proves
// an upper bound; the elevation differential bounds EVERY acquired-surface
// path below. No gradient-normal trajectory or exact-width band is claimed.
import {Q,ZERO,ONE,TWO,add,sub,mul,div,sq,cmp,sign,min,max,neg,key,unique,mid,numberBounds,sqrtBounds,exactDomain,height,inRegion,vsub,dot,orient,segmentIntersection,segmentDistanceSquared,splitSegment,nextUp,nextDown} from './terrain-exact.js?v=1.3.11';
import {axisPieces} from './terrain-surface-flow.js?v=1.3.11';
import {readAcquiredNativeSupport} from './terrain-contour-domain.js?v=1.3.11';
import {FINITE_POLYLINE_AXIS_CONVENTION,POLYLINE_SOURCE_PARAMETER_OPERATION} from './terrain-polyline-source.js?v=1.3.11';
import {certifyNativeRetainedApproach} from './terrain-native-approach.js?v=1.3.11';
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
export function hasNativeDirectionalSupport(domain,budget){return meshMetrics(domain,budget).length>0;}
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

function scopedMetrics(k,budget){
 const mean=[ZERO,ZERO];
 for(const face of k.faces){budget.check();mean[0]=add(mean[0],face.g[0]);mean[1]=add(mean[1],face.g[1]);}
 const frames=[0,1],dominant=max(abs(mean[0]),abs(mean[1]));
 if(sign(dominant)&&mean.every(sign)){const v=mean.map(q=>div(q,dominant));frames.push({v,norm2:dot(v,v)});}
 const choices=[];
 for(const frame of frames){
  const vAxis=typeof frame==='number'?1-frame:null,norm2=typeof frame==='number'?ONE:frame.norm2;
  let lo=null,hi=null;const factors=new Map();
  for(const face of k.faces){
   budget.check();const slope=vAxis===null?dot(face.g,frame.v):face.g[vAxis];
   lo=lo===null?slope:min(lo,slope);hi=hi===null?slope:max(hi,slope);
   factors.set(face.id,div(sqrtBounds(add(norm2,sq(slope)))[1],norm2));
  }
  if(!lo||sign(lo)*sign(hi)<=0)continue;
  const least=min(abs(lo),abs(hi)),greatest=max(abs(lo),abs(hi));
  choices.push({uAxis:frame,vAxis,direction:sign(lo),factors,lengthFactorUpper:div(sqrtBounds(add(norm2,sq(greatest)))[1],norm2),pathFactorUpper:sqrtBounds(add(ONE,div(norm2,sq(least))))[1]});
 }
 return choices.sort((a,b)=>cmp(a.pathFactorUpper,b.pathFactorUpper));
}
function localLines(pieces,frame,budget){
 const lines=[];
 for(const piece of pieces){const line=lineFor(piece.a,piece.b,frame,budget);if(!line)return null;lines.push({...line,piece});}
 return lines;
}
// A conforming acquired mesh has no interior native-edge crossings. Native
// vertices, actual row/edge crossings (resolved piece endpoints), and real
// boundary/native-edge crossings give the complete rational itinerary events.
// This avoids the quadratic arrangement of every pair of mesh edges.
function localNativeFrame(k,boundaries,metric,budget){
 const events=[...boundaries.events],edges=new Map(),faces=[];
 for(const face of k.faces){
  budget.check();const lines=[];
  for(let i=0;i<3;i++){
   const a=face.vertices[i],b=face.vertices[(i+1)%3];events.push(uOf(a,metric.uAxis));
   const line=lineFor(a,b,metric.uAxis,budget);if(line)lines.push(line);
   const id=face.edgeIds[i];if(line&&!edges.has(id))edges.set(id,line);
  }
  faces.push({face,lines,factor:metric.factors.get(face.id)});
 }
 for(const edge of edges.values())for(const boundary of boundaries.lines){
  budget.check();const dm=sub(edge.m,boundary.m);if(!sign(dm))continue;
  const u=div(sub(boundary.c,edge.c),dm);if(covers(edge,u)&&covers(boundary,u))events.push(u);
 }
 budget.check(events.length+faces.length);return {events:unique(events),faces,fibers:new Map()};
}
function nativeFiber(frame,u,budget){
 budget.check(1);const identity=key(u);
 if(frame.fibers.has(identity))return frame.fibers.get(identity);
 const intervals=[];
 for(const entry of frame.faces){
  budget.check();const interval=triangleInterval(entry.lines,u);
  if(interval&&cmp(atU(interval.lo,u),atU(interval.hi,u))<0)intervals.push({...interval,face:entry.face,factor:entry.factor});
 }
 intervals.sort((a,b)=>cmp(atU(a.lo,u),atU(b.lo,u))||cmp(atU(a.hi,u),atU(b.hi,u)));
 // This frame belongs to this live proof and caller budget only. Reusing its
 // exact native itinerary is not persisted or accepted as future authority.
 frame.fibers.set(identity,intervals);return intervals;
}
function liftedFiberUpper(intervals,start,end,u,a,b,budget){
 let cursor=start,total=[ZERO,ZERO];
 for(const interval of intervals){
  budget.check();if(cmp(atU(interval.hi,u),atU(cursor,u))<=0)continue;
  if(cmp(atU(interval.lo,u),atU(cursor,u))>0)return null;
  const high=cmp(atU(interval.hi,u),atU(end,u))<0?interval.hi:end;
  for(const [i,t] of [a,b].entries()){
   const span=sub(atU(high,t),atU(cursor,t));if(sign(span)<0)return null;
   total[i]=add(total[i],mul(span,interval.factor));
  }
  cursor=high;if(cursor===end)return max(...total);
 }
 return null;
}
const sourcePoint=(line,u,frame)=>point(u,atU(line,u),frame);
function convexHull(points){
 const sorted=[...new Map(points.map(p=>[p.map(key).join(','),p])).values()].sort((a,b)=>cmp(a[0],b[0])||cmp(a[1],b[1]));
 if(sorted.length<3)return sorted;
 const half=ps=>{const result=[];for(const p of ps){while(result.length>1&&sign(orient(result.at(-2),result.at(-1),p))<=0)result.pop();result.push(p);}return result;};
 const low=half(sorted),high=half([...sorted].reverse());return [...low.slice(0,-1),...high.slice(0,-1)];
}
function physicalConvexHull(k,points,budget){
 const hull=convexHull(points);if(hull.some(p=>inRegion(p,k)<0))return false;
 if(hull.length<3){const pieces=splitSegment(k,hull[0],hull.at(-1),budget);return pieces.length>0&&pieces.every(piece=>piece.inside&&piece.faces.length);}
 const interior=p=>hull.every((a,i)=>sign(orient(a,hull[(i+1)%hull.length],p))>0);
 for(const boundary of k.boundaries)for(let j=1;j<boundary.coordinates.length;j++){
  budget.check();const c=boundary.coordinates[j-1],d=boundary.coordinates[j],roots=[ZERO,ONE];
  for(let i=0;i<hull.length;i++)roots.push(...segmentIntersection(c,d,hull[i],hull[(i+1)%hull.length]));
  const ts=unique(roots);
  for(let i=1;i<ts.length;i++){
   const t=mid(ts[i-1],ts[i]),p=c.map((q,n)=>add(q,mul(t,sub(d[n],q))));
   if(interior(p))return false;
  }
 }
 const center=hull[0].map((_,i)=>div(hull.reduce((q,p)=>add(q,p[i]),ZERO),Q(hull.length)));
 return inRegion(center,k)>=0;
}
// Distance to a fixed face-contained target segment is convex. Closest target
// points at the source endpoints give an affine connector for every interior
// source point, whose norm is bounded by the maximum endpoint norm. Its whole
// convex sweep is checked against real physical boundaries, including holes.
function sameFaceUpper(k,source,target,a,b,metric,U,budget){
 const p=[sourcePoint(source,a,metric.uAxis),sourcePoint(source,b,metric.uAxis)];
 for(const piece of target){
  budget.check();const face=source.piece.faces.find(f=>piece.faces.some(g=>g.id===f.id));if(!face)continue;
  const lift=q=>[...q,height(face,q)],ends=p.map(q=>segmentDistanceSquared(lift(q),lift(q),lift(piece.a),lift(piece.b)));
  const upper2=max(...ends.map(end=>end.distance2));if(cmp(upper2,sq(U))>0)continue;
  if(!physicalConvexHull(k,[...p,...ends.map(end=>end.q.slice(0,2))],budget))continue;
  return sqrtBounds(upper2)[1];
 }
 return null;
}
// A retained cap can miss a transverse fiber across a native edge. A fixed
// first-edge waypoint and fixed supported remainder give a bounded witness:
// the variable first connector stays in one convex native face, and its maximum
// length occurs at the source endpoints. No radical path field is constructed.
function fixedWaypointUpper(k,source,target,a,b,u,metric,U,budget){
 const face=source.piece.faces[0],p=sourcePoint(source,u,metric.uAxis),ends=[sourcePoint(source,a,metric.uAxis),sourcePoint(source,b,metric.uAxis)],lift=(f,q)=>[...q,height(f,q)];
 for(const piece of target){
  budget.check();const nearest=segmentDistanceSquared(lift(face,p),lift(face,p),lift(piece.faces[0],piece.a),lift(piece.faces[0],piece.b));
  if(cmp(nearest.distance2,sq(U))>0)continue;
  const q=nearest.q.slice(0,2),path=splitSegment(k,p,q,budget);if(!path.length||path.some(span=>!span.inside||!span.faces.length))continue;
  const beginsInFace=path[0].faces.some(f=>f.id===face.id),waypoint=beginsInFace?path[0].b:p;
  let remainder=ZERO;
  for(const span of beginsInFace?path.slice(1):path){const f=span.faces[0],d=vsub(lift(f,span.b),lift(f,span.a));remainder=add(remainder,sqrtBounds(dot(d,d))[1]);}
  if(cmp(remainder,U)>0)continue;
  const first=ends.map(end=>{const d=vsub(lift(face,end),lift(face,waypoint));return sqrtBounds(dot(d,d))[1];});
  const bound=add(remainder,max(...first));if(cmp(bound,U)>0||!physicalConvexHull(k,[...ends,waypoint],budget))continue;
  return bound;
 }
 return null;
}
function localTopologyPair(k,boundaries,native,left,right,fullRight,targetPieces,metric,U,budget){
 const events=unique([...native.events,...left.flatMap(line=>[line.lo,line.hi]),...right.flatMap(line=>[line.lo,line.hi]),...fullRight.flatMap(line=>[line.lo,line.hi])]);
 let reached=0,exceptions=0,strata=0,upper=null;
 for(let i=0;i<events.length;i++)for(const cell of i?[[events[i-1],events[i],mid(events[i-1],events[i])],[events[i],events[i],events[i]]]:[[events[i],events[i],events[i]]]){
  const [a,b,u]=cell;budget.check();const active=left.filter(line=>covers(line,u));if(!active.length)continue;
  const sources=active.filter((line,j)=>!active.slice(0,j).some(other=>!cmp(atU(line,u),atU(other,u))));
  const targets=right.filter(line=>covers(line,u)),fullTargets=fullRight.filter(line=>covers(line,u)),physical=fiber(k,boundaries,u,metric.uAxis,budget),intervals=nativeFiber(native,u,budget);
  for(const source of sources){
   budget.check(1);strata++;const y=atU(source,u),interval=intervalContaining(physical,u,y,metric.direction);
   if(!interval){if(inRegion(sourcePoint(source,u,metric.uAxis),k)!==0)return null;exceptions++;continue;}
   const end=atU(metric.direction>0?interval.hi:interval.lo,u);
   const inPath=line=>cmp(atU(line,u),y)*metric.direction>=0&&cmp(atU(line,u),end)*metric.direction<=0;
   const hits=targets.filter(inPath).filter((line,j,list)=>!list.slice(0,j).some(other=>!cmp(atU(line,u),atU(other,u))));
   if(hits.length>1)return null;
   let bound=hits.length?liftedFiberUpper(intervals,metric.direction>0?source:hits[0],metric.direction>0?hits[0]:source,u,a,b,budget):null;
   if(bound===null||cmp(bound,U)>0)bound=sameFaceUpper(k,source,targetPieces,a,b,metric,U,budget);
   if(bound===null||cmp(bound,U)>0)bound=fixedWaypointUpper(k,source,targetPieces,a,b,u,metric,U,budget);
   if(bound!==null&&cmp(bound,U)<=0){upper=upper===null?bound:max(upper,bound);reached++;continue;}
   // Trimming cannot turn an interior missing retained neighbor into a claimed
   // perimeter exit. Only the full physical carrier's real first exit qualifies.
   if(!hits.length&&!fullTargets.some(inPath)){exceptions++;continue;}
   return null;
  }
 }
 return {reached,exceptions,strata,upper};
}

/** Sufficient bounded local shortest-distance proof. Native XYZ lower bounds
 * cover ALL row pairs; rational physical fibers and same-face convex sweeps
 * prove only upper bounds. A failed upper witness is inconclusive, never a
 * shortest-distance too-far violation. Retained native operations are resolved
 * from the same current/original owners as untrimmed finite sources. */
export function certifyNativeLocalDirectionalFamily(domain,axes,{originalDomain=domain,spacingM,toleranceM=.20,budget}={}){
 budget.check();budget.phase?.('native-local-spacing');
 if(!Number.isFinite(spacingM)||!Number.isFinite(toleranceM)||spacingM<=toleranceM||toleranceM<0||!Array.isArray(axes)||axes.length<2)return null;
 if(axes.some(axis=>axis?.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION)||new Set(axes.map(axis=>axis.portionId)).size!==1||new Set(axes.map(axis=>axis.axisId)).size!==axes.length)return null;
 const ordered=[...axes].sort((a,b)=>a.levelM-b.levelM);
 if(ordered.some((axis,i)=>!Number.isFinite(axis.levelM)||!Number.isInteger(axis.ordinal)||i&&(axis.ordinal!==ordered[i-1].ordinal+1||axis.levelM<=ordered[i-1].levelM)))return null;
 const k=exactDomain(domain,budget),groups=[];let deviation=ZERO;
 for(const axis of ordered){
  const resolved=axisPieces(k,axis,budget,{originalDomain});if(resolved.uncovered.length||!resolved.pieces.length)return null;
  for(const piece of resolved.pieces)for(const p of [piece.a,piece.b])deviation=max(deviation,abs(sub(height(piece.faces[0],p),Q(axis.levelM))));
  let full=resolved.pieces;
  if(axis.axisOperation){const carrier={...axis};delete carrier.axisOperation;const source=axisPieces(k,carrier,budget,{originalDomain});if(source.uncovered.length||!source.pieces.length)return null;full=source.pieces;}
  groups.push({axis,pieces:resolved.pieces,full});
 }
 if(cmp(deviation,Q(.001))>0)return null;
 const L=sub(Q(spacingM),Q(toleranceM)),U=add(Q(spacingM),Q(toleranceM));
 const approach=certifyNativeRetainedApproach(domain,ordered,{originalDomain,minimumM:spacingM-toleranceM,minimumExact:L,budget});
 if(!approach.valid)return approach.critical.length?{...approach,valid:false,method:DIRECTIONAL_SPACING_METHOD,spans:[],exceptions:[],elevation:{valid:true,maxDeviationM:numberBounds(deviation)[1],critical:[]},coverage:{complete:false}}:null;
 for(const metric of scopedMetrics(k,budget)){
  const boundaries=boundaryLines(k,metric.uAxis,budget),native=localNativeFrame(k,boundaries,metric,budget),lines=groups.map(group=>localLines(group.pieces,metric.uAxis,budget)),fullLines=groups.map(group=>localLines(group.full,metric.uAxis,budget));
  if(lines.some(line=>!line)||fullLines.some(line=>!line))continue;
  let eligible=true,reached=0,exceptions=0,strata=0,upper=null;
  for(let i=1;i<groups.length&&eligible;i++)for(const reverse of [false,true]){
   const source=reverse?i:i-1,target=reverse?i-1:i;
   const proof=localTopologyPair(k,boundaries,native,lines[source],lines[target],fullLines[target],groups[target].pieces,{...metric,direction:metric.direction*(reverse?-1:1)},U,budget);
   if(!proof){eligible=false;break;}reached+=proof.reached;exceptions+=proof.exceptions;strata+=proof.strata;
   if(proof.upper!==null)upper=upper===null?proof.upper:max(upper,proof.upper);
  }
  if(!eligible||!reached||upper===null)continue;
  const certificate={valid:true,method:DIRECTIONAL_SPACING_METHOD,spacingMetric:'shortest-native-surface-distance',lowerM:Math.max(numberBounds(L)[0],approach.lowerM??numberBounds(L)[0]),upperM:numberBounds(upper)[1],errorBoundM:0,spans:[],exceptions:[],critical:[],unresolved:[],elevation:{valid:true,maxDeviationM:numberBounds(deviation)[1],critical:[]},coverage:{complete:true,seedCount:groups.reduce((n,g)=>n+g.pieces.length,0),directions:['forward','reverse'],proof:'exact-local-fiber-and-face-convex-open-and-point-strata',strata,connectedTargetStrata:reached,realBoundaryExitStrata:exceptions},approach:{valid:true,proof:'all-row-native-xyz-segment-lower'},directional:{coordinateAxis:metric.vAxis,...(metric.vAxis===null?{directionVectorXY:metric.uAxis.v.map(q=>numberBounds(q)[0])}:{}),nativeSupport:'complete-acquired-mesh',pathSupport:'actual-physical-native-faces',serviceMethod:DIRECTIONAL_SERVICE_METHOD}};
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
