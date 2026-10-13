import {createTerrainBudget} from './terrain-budget.js?v=1.3.11';
import {readAcquiredNativeSupport} from './terrain-contour-domain.js?v=1.3.11';
import {FINITE_POLYLINE_AXIS_CONVENTION,resolveFinitePolylineSourceAxis} from './terrain-polyline-source.js?v=1.3.11';
import {axisPieces} from './terrain-surface-flow.js?v=1.3.11';
import {
 Q,ZERO,ONE,rational,add,sub,sq,min,max,cmp,xy,exactDomain,height,
 inRegion,inTriangle,splitSegment,segmentDistanceSquared,radical,lengthBounds
} from './terrain-exact.js?v=1.3.11';

function lifted(piece,axis,budget){
 budget.check(2);
 const face=piece.faces[0],a3=[...piece.a,height(face,piece.a)],b3=[...piece.b,height(face,piece.b)];
 return {piece,axis,face,a3,b3,lo:a3.map((q,i)=>min(q,b3[i])),hi:a3.map((q,i)=>max(q,b3[i]))};
}
function boxLower2(a,b){
 let result=ZERO;
 for(let i=0;i<3;i++)result=add(result,sq(max(ZERO,max(sub(a.lo[i],b.hi[i]),sub(b.lo[i],a.hi[i])))));
 return result;
}
function witnessInside(kernel,face,p,q,budget){
 budget.check();
 if(!inTriangle(p,face)||!inTriangle(q,face)||inRegion(p,kernel)<0||inRegion(q,kernel)<0)return false;
 const pieces=splitSegment(kernel,p,q,budget);
 return pieces.length>0&&pieces.every(piece=>piece.inside&&piece.faces.some(candidate=>candidate.id===face.id));
}
const distanceBounds=distance2=>lengthBounds(radical([[ONE,distance2]]));

/** Independent minimum approach of every pair of retained finite native axes.
 * Raw face pieces and exact XYZ segment distance prove a surface-distance lower
 * bound. A short chord is a violation only when its same-native-face connector
 * is wholly within the actual physical scope. This is neither upper coverage
 * nor authority for service area; no raw geometry or private proof is exposed. */
export function certifyNativeRetainedApproach(domain,axes,{
 originalDomain=domain,minimumM,minimumExact,budget=createTerrainBudget({kind:'measure'})
}={}){
 budget.check();budget.phase?.('native-retained-approach');
 const critical=[],unresolved=[];
 const result=lowerM=>({valid:!critical.length&&!unresolved.length,lowerM,critical,unresolved});
 if(!Number.isFinite(minimumM)||minimumM<=0||!Array.isArray(axes)||!axes.length){
  unresolved.push({reason:'numeric-unresolved',detail:'invalid-native-approach-input'});return result(null);
 }
 if(minimumExact!==undefined&&(!minimumExact||typeof minimumExact!=='object'||Array.isArray(minimumExact)||Object.keys(minimumExact).length!==2||Object.keys(minimumExact).some(key=>key!=='n'&&key!=='d')||typeof minimumExact.n!=='bigint'||typeof minimumExact.d!=='bigint'||minimumExact.n<=0n||minimumExact.d<=0n)){
  unresolved.push({reason:'numeric-unresolved',detail:'invalid-exact-native-approach-minimum'});return result(null);
 }
 // Actual acquired owner identities are checked before kernel construction.
 // Native geometry failures and spent caller budgets retain their typed errors.
 readAcquiredNativeSupport(domain,{budget});readAcquiredNativeSupport(originalDomain,{budget});
 if(axes.some(axis=>axis?.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION)){
  unresolved.push({reason:'numeric-unresolved',detail:'unsupported-native-approach-source'});return result(null);
 }
 if(new Set(axes.map(axis=>axis.portionId)).size!==1){
  unresolved.push({reason:'numeric-unresolved',detail:'mixed-portion-family'});return result(null);
 }
 if(new Set(axes.map(axis=>axis.axisId)).size!==axes.length){
  unresolved.push({reason:'numeric-unresolved',detail:'duplicate-axis-identity'});return result(null);
 }
 const kernel=exactDomain(domain,budget),originalKernel=originalDomain===domain?kernel:exactDomain(originalDomain,budget),segments=[],L=minimumExact===undefined?Q(minimumM):rational(minimumExact.n,minimumExact.d),L2=sq(L);
 for(const axis of axes){
  budget.check();
  // axisPieces intentionally converts source errors into uncovered records.
  // Preflight the authoritative resolver so this API preserves typed failures.
  resolveFinitePolylineSourceAxis(kernel,axis,budget,{originalDomain});
  if(originalDomain!==domain)resolveFinitePolylineSourceAxis(originalKernel,axis,budget,{original:true,originalDomain});
  const resolved=axisPieces(kernel,axis,budget,{originalDomain});
  if(resolved.uncovered.length||!resolved.pieces.length){
   unresolved.push({axisId:axis.axisId,reason:'numeric-unresolved',detail:'uncovered-retained-native-source'});continue;
  }
  for(const piece of resolved.pieces)segments.push(lifted(piece,axis,budget));
 }
 segments.sort((a,b)=>{budget.check();return cmp(a.lo[0],b.lo[0]);});
 let lower2=null;
 const retainLower=distance2=>{lower2=lower2===null?distance2:min(lower2,distance2);};
 for(let i=0;i<segments.length;i++){
  budget.check();const a=segments[i],limit=add(a.hi[0],L);
  for(let j=i+1;j<segments.length;j++){
   budget.check();const b=segments[j];
   // Every remaining X interval is at least this far from a. This exact
   // pruning is valid for the entire segment sets, including endpoint caps.
   if(cmp(b.lo[0],limit)>0){retainLower(sq(sub(b.lo[0],a.hi[0])));break;}
   if(a.axis.axisId===b.axis.axisId)continue;
   const box2=boxLower2(a,b);
   if(cmp(box2,L2)>=0){retainLower(box2);continue;}
   const nearest=segmentDistanceSquared(a.a3,a.b3,b.a3,b.b3);
   budget.check(2);
   retainLower(nearest.distance2);
   if(cmp(nearest.distance2,L2)>=0)continue;
   const p=nearest.p.slice(0,2),q=nearest.q.slice(0,2),common=a.piece.faces.find(face=>b.piece.faces.some(candidate=>candidate.id===face.id));
   const meta={axisId:a.axis.axisId,targetAxisId:b.axis.axisId,
    sourceSegmentIndex:a.piece.segmentIndex,targetSegmentIndex:b.piece.segmentIndex,
    sourceFaceId:common?.id??a.face.id,targetFaceId:common?.id??b.face.id,xy:xy(p),targetXY:xy(q)};
   const originalFace=common&&originalKernel.byId.get(common.id);
   if(common&&originalFace&&witnessInside(kernel,common,p,q,budget)&&(originalKernel===kernel||witnessInside(originalKernel,originalFace,p,q,budget))){
    critical.push({...meta,reason:'too-close',proof:'continuous-surface-path',distanceM:distanceBounds(nearest.distance2)});
    // A complete candidate is already invalid. Further invalid-pair listings
    // cannot make it applicable and must not consume its whole operation cap.
    budget.check();return result(null);
   }else unresolved.push({...meta,reason:'numeric-unresolved',detail:'minimum-approach-lower-inconclusive',chordLowerM:distanceBounds(nearest.distance2)[0]});
  }
 }
 budget.check();
 return result(!critical.length&&!unresolved.length&&lower2!==null?distanceBounds(lower2)[0]:null);
}
