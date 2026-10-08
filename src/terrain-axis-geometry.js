import {Q,ZERO,add,sub,mul,cmp,sign,min,max,dot,vsub,vadd,scale,pointKey,inRegion,splitSegment,number,numberBounds,sqrtBounds,nextUp,nextDown} from './terrain-exact.js?v=1.3.1';
import {terrainInputHash} from './terrain-model.js?v=1.3.1';
import {certifyUniformPlaneSupport} from './terrain-surface-bands.js?v=1.3.1';
import {canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.1';

export const SOURCE_DOMAIN_AXIS_CONVENTION='source-domain-intersection-1';
export const SOURCE_PARAMETER_OPERATION='source-parameter-intervals-1';
export const axisScopeHash=domain=>canonicalCutDomainScope(domain)?.scopeHash??terrainInputHash(domain.geometry);
export const axisSourceHash=axis=>terrainInputHash({axisId:axis.axisId,portionId:axis.portionId,levelM:axis.levelM,ordinal:axis.ordinal,axisGeometryConvention:axis.axisGeometryConvention,components:axis.components,axisGeometryBinding:axis.axisGeometryBinding});
export function axisBinding(domain,originalDomain=domain){
 return {modelHash:domain.modelHash,crs:domain.crs,scopeHash:axisScopeHash(domain),originalScopeHash:axisScopeHash(originalDomain)};
}
export function validSourceAxisSchema(axis){
 const binding=axis.axisGeometryBinding;
 if(typeof axis.axisId!=='string'||!axis.axisId||typeof axis.portionId!=='string'||!axis.portionId||!Number.isFinite(axis.levelM)||!Number.isInteger(axis.ordinal)||axis.ordinal<0)return false;
 if(axis.axisGeometryConvention!==SOURCE_DOMAIN_AXIS_CONVENTION||!binding||typeof binding.modelHash!=='string'||typeof binding.crs!=='string'||typeof binding.scopeHash!=='string'||typeof binding.originalScopeHash!=='string')return false;
 const points=axis.components?.[0]?.coordinatesXY;
 if(axis.components?.length!==1||!Array.isArray(points)||points.length!==2||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return false;
 const operation=axis.axisOperation;
 if(operation){
  if(operation.kind!==SOURCE_PARAMETER_OPERATION||!Array.isArray(operation.intervals)||!operation.intervals.length)return false;
  let last=-Infinity;
  for(const pair of operation.intervals){
   if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isFinite)||pair[0]<0||pair[1]>1||pair[0]>=pair[1]||pair[0]<last)return false;
   last=pair[1];
  }
 }
 return true;
}
/** Sufficient exact finite-cap proof: a nonconstant source coordinate spans the
 * entire true-domain bbox. Every intersection of its carrier with P is thereby
 * on the finite submitted segment; no source extension is performed. */
export function sourceSpansDomain(kernel,axis,budget){
 const [a,b]=axis.components[0].coordinatesXY.map(p=>p.map(Q));
 for(let i=0;i<2;i++){
  if(!sign(sub(b[i],a[i])))continue;
  const points=kernel.boundaries.flatMap(boundary=>boundary.coordinates);
  if(!points.length)return false;
  let lo=points[0][i],hi=lo;
  for(const point of points){budget?.check();lo=min(lo,point[i]);hi=max(hi,point[i]);}
  if(cmp(min(a[i],b[i]),lo)<0&&cmp(max(a[i],b[i]),hi)>0)return true;
 }
 return false;
}
export function resolveSourceAxis(kernel,axis,budget,{original=false}={}){
 if(!validSourceAxisSchema(axis))throw Object.assign(new Error('Unknown or malformed axis geometry convention/operation'),{status:'axis-geometry-unresolved'});
 const binding=axis.axisGeometryBinding;
 if(binding.modelHash!==kernel.domain.modelHash||binding.crs!==kernel.domain.crs||(original?binding.originalScopeHash:binding.scopeHash)!==axisScopeHash(kernel.domain))throw Object.assign(new Error('Axis geometry model/CRS/scope binding mismatch'),{status:'axis-geometry-unresolved'});
 if(!certifyUniformPlaneSupport(kernel.domain,budget)||!sourceSpansDomain(kernel,axis,budget))throw Object.assign(new Error('Unproved complete source carrier/native plane support'),{status:'axis-geometry-unresolved'});
 const [a,b]=axis.components[0].coordinatesXY.map(p=>p.map(Q));
 const v=vsub(b,a);
 const pieces=[],uncovered=[],outside=[],outsideRoots=new Map(),physicalEndpoints=new Set();
 for(const interval of axis.axisOperation?.intervals??[[0,1]]){
  const [lo,hi]=interval.map(Q);
  const start=vadd(a,scale(v,lo)),end=vadd(a,scale(v,hi));
  budget?.check(2);
  for(const part of splitSegment(kernel,start,end,budget)){
   const record={
    ...part,
    lo:add(lo,mul(sub(hi,lo),part.lo)),
    hi:add(lo,mul(sub(hi,lo),part.hi)),
    axisId:axis.axisId,
    componentIndex:0,
    segmentIndex:0,
    levelM:axis.levelM,
    ordinal:axis.ordinal
   };
   // splitSegment retains every exact root as an interval endpoint, including
   // a tangent vertex whose two adjacent open intervals are both exterior.
   // Endpoint incidence is global across all retained recipe intervals.
   const endpointKeys=[pointKey(part.a),pointKey(part.b)];
   budget?.check(2);
   if(part.inside)for(const key of endpointKeys)physicalEndpoints.add(key);
   else for(let i=0;i<2;i++)outsideRoots.set(endpointKeys[i],i?part.b:part.a);
   if(part.faces.length){budget?.check(2);pieces.push(record);}
   else if(part.inside)uncovered.push(record);
   else outside.push(record);
  }
 }
 // Positive physical interval endpoints already enter A/B point partitions.
 // A retained true-P singleton has no such seed and therefore no certificate;
 // reject the whole marked axis rather than silently claiming completeness.
 // Excluded source parameters never enter these maps and cannot cause failure.
 for(const [key,point] of outsideRoots){
  budget?.check();
  if(!physicalEndpoints.has(key)&&inRegion(point,kernel)>=0)throw Object.assign(new Error('Isolated retained source/true-P contact has no point-stratum certificate'),{status:'axis-geometry-unresolved'});
 }
 return {pieces,uncovered,outside,completeCarrier:!axis.axisOperation,sourceHash:axisSourceHash(axis)};
}
export function physicalFragments(pieces){
 const fragments=[];
 for(const piece of pieces){
  const last=fragments.at(-1);
  if(last&&pointKey(last.at(-1).b)===pointKey(piece.a))last.push(piece);
  else fragments.push([piece]);
 }
 return fragments;
}
/** Exact original-scope intersection is kept in source parameters. This also
 * preserves the required original→physical order for a caller supplying a
 * physical scope larger than the original perimeter. No f64 cap is re-entered. */
export function intersectSourceIntervals(axis,pieces,originalPieces,budget){
 const intervals=physicalFragments(originalPieces).map(fragment=>[fragment[0].lo,fragment.at(-1).hi]);
 const [a,b]=axis.components[0].coordinatesXY.map(p=>p.map(Q)),v=vsub(b,a),result=[];
 for(const piece of pieces)for(const interval of intervals){
  budget?.check();
  const lo=max(piece.lo,interval[0]),hi=min(piece.hi,interval[1]);
  if(cmp(lo,hi)>=0)continue;
  budget?.check(2);
  result.push({...piece,lo,hi,a:vadd(a,scale(v,lo)),b:vadd(a,scale(v,hi))});
 }
 return result;
}
export function exactPieceLengthBounds(pieces,budget,{horizontal=false}={}){
 let lo=ZERO,hi=ZERO;
 for(const piece of pieces){
  budget?.check();
  const v=vsub(piece.b,piece.a),dz=horizontal?ZERO:dot(piece.faces[0].g,v),bounds=sqrtBounds(add(dot(v,v),mul(dz,dz)));
  lo=add(lo,bounds[0]);hi=add(hi,bounds[1]);
 }
 return [numberBounds(lo)[0],numberBounds(hi)[1]];
}
/** Numeric operands only. Exact clipping parameters stay transient. A dyadic
 * cut is chosen inward and its actual removed length proved within 1 micron. */
export function trimSourceFragment(axis,pieces,amount,budget){
 const lo=pieces[0].lo,hi=pieces.at(-1).hi;
 const [a,b]=axis.components[0].coordinatesXY.map(p=>p.map(Q));
 const v=vsub(b,a),dz=dot(pieces[0].faces[0].g,v);
 const speed2=add(dot(v,v),mul(dz,dz));
 const lengthSquared=mul(mul(sub(hi,lo),sub(hi,lo)),speed2);
 const requested=Q(amount),twice=mul(Q(2),requested);
 const maximum=add(requested,Q(1e-6));
 if(cmp(lengthSquared,mul(twice,twice))<=0)return {consumed:true,sourceLengthBoundsM:exactPieceLengthBounds(pieces,budget)};
 const speed=Math.sqrt(number(speed2));
 const choose=(boundary,end)=>{
  let t=number(boundary)+(end?-1:1)*amount/speed;
  for(let attempt=0;attempt<16;attempt++){
   budget?.check();
   const delta=end?sub(boundary,Q(t)):sub(Q(t),boundary),square=mul(mul(delta,delta),speed2);
   if(sign(delta)>0&&cmp(square,mul(requested,requested))>=0&&cmp(square,mul(maximum,maximum))<=0){
    const exactBounds=sqrtBounds(square);
    return {
     parameter:t,
     removedLengthBoundsM:exactBounds.map((q,i)=>numberBounds(q)[i]),
     excessBoundsM:[numberBounds(sub(exactBounds[0],requested))[0],numberBounds(sub(exactBounds[1],requested))[1]]
    };
   }
   if(sign(delta)<=0||cmp(square,mul(requested,requested))<0)t=end?nextDown(t):nextUp(t);
   else break;
  }
  throw Object.assign(new Error('Ground trim has no proved conservative numeric source parameter'),{status:'axis-geometry-unresolved'});
 };
 const start=choose(lo,false),end=choose(hi,true);
 if(start.parameter>=end.parameter)throw Object.assign(new Error('Ground trim numeric interval is empty'),{status:'axis-geometry-unresolved'});
 return {interval:[start.parameter,end.parameter],removedEnds:[{end:'start',...start},{end:'end',...end}]};
}
