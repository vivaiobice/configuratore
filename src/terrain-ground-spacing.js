import {getTerrainMesh} from './terrain-model.js?v=1.3.7';

const unsupported=(reason,message)=>Object.assign(new Error(message),{status:'ground-spacing-unsupported',reason});
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const roundoff=(...values)=>128*Number.EPSILON*Math.max(1,...values.map(Math.abs));
function pointsOf(value,out=[]){
 if(Array.isArray(value)){
  if(value.length>=2&&value.every(Number.isFinite))out.push(value);
  else for(const child of value)pointsOf(child,out);
 }else if(value?.coordinates)pointsOf(value.coordinates,out);
 return out;
}

/**
 * Ground spacing for parallel straight manual families on a native plane or
 * translation-invariant terrain z(t,q)=a*t+f(q). Coordinates are in model CRS.
 * Every original native face crossing the scoped bounding box participates;
 * no resampling, plane fit, terrain smoothing or theoretical density is used.
 *
 * Spacing is the intrinsic perpendicular separation of the infinite row
 * carriers. On each native profile interval its density is
 * sqrt(1 + (dz/dq)^2 / (1 + (dz/dt)^2)). Endpoints, polygon holes, exclusions
 * and headlands MUST subsequently be clipped by the existing physical-domain
 * measurement pipeline. Shortest carriers may meet outside a finite fragment.
 *
 * Weakly varying non-extruded terrain may instead use the complete acquired
 * mesh metric envelope, with an explicit ±0.20 m spacing certificate.
 * manualStraight:true explicitly authorizes native carrier normalization of
 * declared straight geographic input, bounded to 0.20 m transverse adjustment.
 * Without that flag the strict reference-straightness bound remains 0.1 mm.
 * Unsupported curved / nonparallel axes or terrain outside that bound throw
 * status=ground-spacing-unsupported. Flat and absent terrain retain axes.
 */
export function groundSpaceManualAxes(input={}){
 try{return exactGroundSpaceManualAxes(input);}catch(error){
  if(error?.reason!=='non-extruded-terrain')throw error;
  return envelopeGroundSpaceManualAxes(input,error);
 }
}
function exactGroundSpaceManualAxes({model,axes=[],geometryXY,rowSpacingM,portionId,budget,manualStraight=false}={}){
 if(!model)return {axes:structuredClone(axes),validation:{valid:true,groundSpacing:false,method:'legacy-planar-bypass'}};
 if(!(Number.isFinite(rowSpacingM)&&rowSpacingM>0))throw new RangeError('Interfila al suolo non valido.');
 const boundary=pointsOf(geometryXY);
 if(boundary.length<3||!axes.length)throw unsupported('missing-reference','Riferimento manuale o porzione mancante.');
 const origin=boundary[0],localBoundary=boundary.map(p=>sub(p,origin));
 const xs=boundary.map(p=>p[0]),ys=boundary.map(p=>p[1]);
 const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
 const mesh=getTerrainMesh(model),faces=[];
 const far=[mesh.origin[0]+(mesh.width-1)*mesh.step[0],mesh.origin[1]+(mesh.height-1)*mesh.step[1]];
 if(bounds[0]<Math.min(mesh.origin[0],far[0])-1e-8||bounds[2]>Math.max(mesh.origin[0],far[0])+1e-8||bounds[1]<Math.min(mesh.origin[1],far[1])-1e-8||bounds[3]>Math.max(mesh.origin[1],far[1])+1e-8)throw unsupported('terrain-coverage','Porzione fuori copertura del terreno nativo.');
 budget?.phase?.('manual-ground-spacing');
 for(let id=0;id<mesh.triangles.length;id++){
  if(id%256===0)budget?.check?.();
  const vertices=mesh.triangles[id].map(i=>mesh.vertices[i]);
  const scoped=!(Math.max(...vertices.map(v=>v[0]))<=bounds[0]||Math.min(...vertices.map(v=>v[0]))>=bounds[2]||Math.max(...vertices.map(v=>v[1]))<=bounds[1]||Math.min(...vertices.map(v=>v[1]))>=bounds[3]);
  const [p,a,b]=vertices,ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],det=ax*by-ay*bx;
  const g=[((a[2]-p[2])*by-(b[2]-p[2])*ay)/det,(ax*(b[2]-p[2])-bx*(a[2]-p[2]))/det];
  faces.push({vertices,g,scoped});
 }
 if(!faces.length)throw unsupported('terrain-coverage','Porzione fuori copertura del terreno nativo.');
 if(faces.filter(f=>f.scoped).every(f=>f.g[0]===0&&f.g[1]===0))return {axes:structuredClone(axes),validation:{valid:true,groundSpacing:true,method:'native-flat-legacy-spacing',originalNativeTriangles:true,spacingM:rowSpacingM,maxSpacingErrorM:0}};
 const first=axes[0]?.components?.[0]?.coordinatesXY;
 if(!first||first.length<2)throw unsupported('missing-reference','Asse manuale mancante.');
 const delta=sub(first.at(-1),first[0]),length=Math.hypot(...delta);
 if(!(length>0))throw unsupported('missing-reference','Asse manuale nullo.');
 const tangent=delta.map(v=>v/length),normal=[tangent[1],-tangent[0]];
 const qb=localBoundary.map(p=>dot(p,normal)),tb=localBoundary.map(p=>dot(p,tangent));
 const qmin=Math.min(...qb),qmax=Math.max(...qb),tmin=Math.min(...tb),tmax=Math.max(...tb);
 const reference=[];let inputStraightnessErrorM=0;
 for(const axis of axes){
  let axisQ=null;
  for(const component of axis.components??[]){
   for(const p of component.coordinatesXY??[]){
    const q=dot(sub(p,origin),normal);axisQ??=q;
    inputStraightnessErrorM=Math.max(inputStraightnessErrorM,Math.abs(q-axisQ));
   }
  }
  if(axisQ!==null)reference.push({q:axisQ,axis});
 }
 const manualReferenceTransformation=referenceTransformation({axes,origin,tangent,normal,manualStraight});
 const activeFaces=faces.filter(face=>{const qs=face.vertices.map(v=>dot(sub(v,origin),normal));return Math.max(...qs)>qmin&&Math.min(...qs)<qmax;});
 const crossFlat=activeFaces.every(face=>Math.abs(dot(face.g,normal))<=roundoff(...face.g));
 const events=[];let along=null;const nativeGradients=new Set();
 for(const face of activeFaces){
  const a=dot(face.g,tangent),b=dot(face.g,normal);
  along??=a;
  if(!crossFlat&&Math.abs(a-along)>roundoff(a,along))throw unsupported('non-extruded-terrain','Il terreno varia lungo i filari: impossibile mantenere questa famiglia manuale con interfila al suolo uniforme.');
  const q=face.vertices.map(v=>dot(sub(v,origin),normal));
  const lo=Math.max(qmin,Math.min(...q)),hi=Math.min(qmax,Math.max(...q));
  if(hi-lo<=roundoff(lo,hi))continue;
  const key=face.g.join(',');nativeGradients.add(key);
  events.push({q:lo,key,b,delta:1},{q:hi,key,b,delta:-1});
 }
 events.sort((a,b)=>a.q-b.q);
 const active=new Map(),profile=[];let accumulated=0;
 for(let i=0;i<events.length;){
  const q=events[i].q;
  do{const event=events[i++],record=active.get(event.key)??{count:0,b:event.b};record.count+=event.delta;if(record.count)active.set(event.key,record);else active.delete(event.key);}while(i<events.length&&Math.abs(events[i].q-q)<=roundoff(q,events[i].q));
  if(i===events.length)break;
  const end=events[i].q;if(end-q<=roundoff(q,end))continue;
  if(!active.size)throw unsupported('terrain-coverage','Intervallo fuori copertura del terreno nativo.');
  const b=active.values().next().value.b;
  for(const entry of active.values())if(Math.abs(entry.b-b)>roundoff(entry.b,b))throw unsupported('non-extruded-terrain','La superficie nativa non ammette una famiglia manuale parallela con interfila al suolo uniforme.');
  const factor=Math.sqrt(1+b*b/(1+along*along));
  profile.push({lo:q,hi:end,start:accumulated,factor,drift:crossFlat?0:-along*b/(1+along*along)});accumulated+=(end-q)*factor;
 }
 if(!profile.length||profile[0].lo>qmin+roundoff(qmin)||profile.at(-1).hi<qmax-roundoff(qmax))throw unsupported('terrain-coverage','Copertura nativa incompleta per la porzione.');
 function groundAt(q){const p=profile.find(p=>q<=p.hi+roundoff(q,p.hi))??profile.at(-1);return p.start+(q-p.lo)*p.factor;}
 function positionAt(s){let lo=0,hi=profile.length-1;while(lo<hi){const mid=(lo+hi)>>1,p=profile[mid];if(s>p.start+(p.hi-p.lo)*p.factor)lo=mid+1;else hi=mid;}const p=profile[lo];return p.lo+(s-p.start)/p.factor;}
 reference.sort((a,b)=>a.q-b.q);
 const anchor=reference.find(r=>r.q>=qmin&&r.q<=qmax)??reference.reduce((a,b)=>Math.abs(b.q-(qmin+qmax)/2)<Math.abs(a.q-(qmin+qmax)/2)?b:a);
 const anchorQ=Math.max(qmin,Math.min(qmax,anchor.q)),anchorGround=groundAt(anchorQ);
 const firstOrdinal=Math.ceil((-anchorGround)/rowSpacingM),lastOrdinal=Math.floor((accumulated-anchorGround)/rowSpacingM);
 const count=lastOrdinal-firstOrdinal+1;
 if(!Number.isSafeInteger(count)||count>100000)throw unsupported('row-limit','Numero di assi manuali al suolo non supportato.');
 const result=[];let maxSpacingErrorM=0,previousGround=null;
 for(let index=firstOrdinal;index<=lastOrdinal;index++){
  budget?.check?.(2);
  const q=positionAt(anchorGround+index*rowSpacingM);
  const coordinatesXY=[tmin,tmax].map(t=>[origin[0]+t*tangent[0]+q*normal[0],origin[1]+t*tangent[1]+q*normal[1]]);
  const actualGround=groundAt(dot(sub(coordinatesXY[0],origin),normal));
  if(previousGround!==null)maxSpacingErrorM=Math.max(maxSpacingErrorM,Math.abs(actualGround-previousGround-rowSpacingM));previousGround=actualGround;
  result.push({axisId:`${portionId??anchor.axis.portionId??'portion'}:manual-ground:${index}`,portionId:portionId??anchor.axis.portionId,ordinal:result.length,components:[{coordinatesXY}]});
 }
 // Double precision coordinate reconstruction is checked in the native metric.
 // This error limit applies to the stored model, not unknown DTM survey error.
 const supportSegmentChecks=verifyProfileWitnesses({result,profile,origin,tangent,normal,tmin,tmax,mesh,budget});
 const numericalToleranceM=1e-6;
 if(maxSpacingErrorM>numericalToleranceM)throw unsupported('numerical-accuracy','Precisione numerica insufficiente per l’interfila al suolo.');
 return {axes:result,validation:{valid:true,groundSpacing:true,method:nativeGradients.size===1?'native-plane-ground-spacing':crossFlat?'native-along-row-profile-ground-spacing':'native-extruded-profile-ground-spacing',spacingMetric:'shortest-native-surface-perpendicular',supportedFamily:'parallel-straight',originalNativeTriangles:true,spacingM:rowSpacingM,maxSpacingErrorM,numericalToleranceM,inputStraightnessErrorM,manualReferenceTransformation,profileIntervalCount:profile.length,supportSegmentChecks,nativeSupport:'complete-acquired-cross-strip',anchorAxisId:anchor.axis.axisId,anchorXY:[origin[0]+anchorQ*normal[0],origin[1]+anchorQ*normal[1]]}};
}


/** Conservative support-wide bounds, not a fitted plane or sampled guarantee.
 * For v=n+k*t and every native face with gradient (a,b),
 * ds >= sqrt(1+b²/(1+a²))*|dq|, while the lifted straight v-path costs
 * sqrt(1+k²+(b+k*a)²)*|dq|. Taking the minimum lower and maximum upper over
 * the COMPLETE acquired mesh bounds every path below and our witness above.
 * Endpoint-in-rectangle checks prove each straight witness stays on support.
 */
function envelopeGroundSpaceManualAxes({model,axes,geometryXY,rowSpacingM,portionId,budget,manualStraight=false},originalError){
 const boundary=pointsOf(geometryXY),origin=boundary[0],first=axes[0].components[0].coordinatesXY;
 const delta=sub(first.at(-1),first[0]),norm=Math.hypot(...delta),tangent=delta.map(x=>x/norm),normal=[tangent[1],-tangent[0]];
 const manualReferenceTransformation=referenceTransformation({axes,origin,tangent,normal,manualStraight});
 const qb=boundary.map(p=>dot(sub(p,origin),normal)),tb=boundary.map(p=>dot(sub(p,origin),tangent));
 const qmin=Math.min(...qb),qmax=Math.max(...qb),tmin=Math.min(...tb),tmax=Math.max(...tb);
 const mesh=getTerrainMesh(model),slopes=[];let meanA=0,meanB=0;
 for(let id=0;id<mesh.triangles.length;id++){
  if(id%256===0)budget?.check?.();
  const [p,a,b]=mesh.triangles[id].map(i=>mesh.vertices[i]);
  const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1],det=ax*by-ay*bx;
  const g=[((a[2]-p[2])*by-(b[2]-p[2])*ay)/det,(ax*(b[2]-p[2])-bx*(a[2]-p[2]))/det];
  const along=dot(g,tangent),cross=dot(g,normal);slopes.push([along,cross]);meanA+=along;meanB+=cross;
 }
 meanA/=slopes.length;meanB/=slopes.length;
 const drift=-meanA*meanB/(1+meanA*meanA);
 let lower=Infinity,upper=0;
 for(const [a,b] of slopes){lower=Math.min(lower,Math.sqrt(1+b*b/(1+a*a)));upper=Math.max(upper,Math.sqrt(1+drift*drift+(b+drift*a)**2));}
 // Deliberately outward, including gradient arithmetic. No native face value
 // is altered. This padding is separate from the ±0.20 m geometric tolerance.
 const factorPadding=1e-10*Math.max(1,upper);
 lower=Math.max(1,lower-factorPadding);upper+=factorPadding;
 const planarStep=2*rowSpacingM/(lower+upper),numericalToleranceM=1e-6,spacingToleranceM=.20;
 const coordinateRoundoffBoundM=64*Number.EPSILON*Math.max(1,...boundary.flat().map(Math.abs))*upper;
 const spacingIntervalM=[lower*planarStep-numericalToleranceM,upper*planarStep+numericalToleranceM];
 const maxSpacingErrorM=Math.max(rowSpacingM-spacingIntervalM[0],spacingIntervalM[1]-rowSpacingM);
 if(maxSpacingErrorM>spacingToleranceM)throw originalError;
 if(!Number.isFinite(upper)||coordinateRoundoffBoundM>numericalToleranceM)throw unsupported('numerical-accuracy','Precisione numerica insufficiente per l’interfila al suolo.');
 const reference=axes.map(axis=>({axis,q:dot(sub(axis.components[0].coordinatesXY[0],origin),normal)})).sort((a,b)=>a.q-b.q);
 const anchor=reference.find(r=>r.q>=qmin&&r.q<=qmax)??reference[0],anchorQ=Math.max(qmin,Math.min(qmax,anchor.q));
 const low=Math.ceil((qmin-anchorQ)/planarStep),high=Math.floor((qmax-anchorQ)/planarStep);
 if(high-low>100000)throw unsupported('row-limit','Numero di assi manuali al suolo non supportato.');
 const far=[mesh.origin[0]+(mesh.width-1)*mesh.step[0],mesh.origin[1]+(mesh.height-1)*mesh.step[1]];
 const min=[Math.min(mesh.origin[0],far[0]),Math.min(mesh.origin[1],far[1])],max=[Math.max(mesh.origin[0],far[0]),Math.max(mesh.origin[1],far[1])];
 const position=(q,t)=>[origin[0]+q*normal[0]+t*tangent[0],origin[1]+q*normal[1]+t*tangent[1]];
 function supportedTRange(q){
  let lo=tmin,hi=tmax;
  for(let k=0;k<2;k++){
   const c=origin[k]+q*normal[k],v=tangent[k];
   if(Math.abs(v)<1e-15){if(c<min[k]||c>max[k])return null;continue;}
   const a=(min[k]-c)/v,b=(max[k]-c)/v;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
  }
  return lo<=hi?[lo,hi]:null;
 }
 const result=[];let previousQ=null,supportSegmentChecks=0;
 for(let index=low;index<=high;index++){
  budget?.check?.(2);const q=anchorQ+index*planarStep;
  if(previousQ!==null){
   const a=supportedTRange(previousQ),b=supportedTRange(q),shift=drift*(q-previousQ);
   if(!a||!b||Math.max(a[0],b[0]-shift)>Math.min(a[1],b[1]-shift))throw unsupported('terrain-coverage','Il percorso che certifica l’interfila esce dalla copertura nativa.');
   supportSegmentChecks++;
  }
  result.push({axisId:`${portionId??anchor.axis.portionId??'portion'}:manual-ground:${index}`,portionId:portionId??anchor.axis.portionId,ordinal:result.length,components:[{coordinatesXY:[position(q,tmin),position(q,tmax)]}]});previousQ=q;
 }
 return {axes:result,validation:{valid:true,groundSpacing:true,method:'native-metric-envelope-ground-spacing',spacingMetric:'shortest-native-surface-perpendicular',supportedFamily:'parallel-straight',originalNativeTriangles:true,nativeSupport:'complete-acquired-mesh',nativeFaceCount:slopes.length,spacingM:rowSpacingM,spacingToleranceM,spacingIntervalM,maxSpacingErrorM,numericalToleranceM,coordinateRoundoffBoundM,manualReferenceTransformation,metricBounds:{lower,upper},tangentDriftPerCrossM:drift,supportSegmentChecks,anchorAxisId:anchor.axis.axisId}};
}


function verifyProfileWitnesses({result,profile,origin,tangent,normal,tmin,tmax,mesh,budget}){
 const far=[mesh.origin[0]+(mesh.width-1)*mesh.step[0],mesh.origin[1]+(mesh.height-1)*mesh.step[1]],min=mesh.origin.map((v,i)=>Math.min(v,far[i])),max=mesh.origin.map((v,i)=>Math.max(v,far[i]));
 let checks=0;
 for(let index=1;index<result.length;index++){
  budget?.check?.();
  const q0=dot(sub(result[index-1].components[0].coordinatesXY[0],origin),normal),q1=dot(sub(result[index].components[0].coordinatesXY[0],origin),normal);
  let shift=0,lo=tmin,hi=tmax;
  const constrain=q=>{
   for(let k=0;k<2;k++){
    const base=origin[k]+q*normal[k]+shift*tangent[k],v=tangent[k];
    if(Math.abs(v)<1e-15){if(base<min[k]-1e-8||base>max[k]+1e-8)lo=Infinity;continue;}
    const a=(min[k]-base)/v,b=(max[k]-base)/v;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
   }
  };
  constrain(q0);
  for(const p of profile){const left=Math.max(q0,p.lo),right=Math.min(q1,p.hi);if(right<=left)continue;shift+=(right-left)*p.drift;constrain(right);}
  lo=Math.max(lo,tmin-shift);hi=Math.min(hi,tmax-shift);
  if(lo>hi)throw unsupported('terrain-coverage','Il percorso perpendicolare al suolo esce dalla copertura nativa.');
  checks++;
 }
 return checks;
}


/** Explicit straight design intent distinguishes projection convergence from
 * a user curve. It only changes the source carriers, never the native terrain.
 * The caller must derive this flag from the resolved manual design, not infer
 * it from a failed curvature check. Flat/no-terrain bypasses do not transform.
 */
function referenceTransformation({axes,origin,tangent,normal,manualStraight}){
 let maxTransverseAdjustmentM=0;
 for(const axis of axes){
  let q0=null;
  for(const component of axis.components??[])for(const p of component.coordinatesXY??[]){
   const q=dot(sub(p,origin),normal);q0??=q;maxTransverseAdjustmentM=Math.max(maxTransverseAdjustmentM,Math.abs(q-q0));
  }
 }
 const declared=manualStraight===true,maximumAllowedAdjustmentM=declared?.20:1e-4;
 if(maxTransverseAdjustmentM>maximumAllowedAdjustmentM)throw unsupported('manual-curvature','La spaziatura al suolo di questi assi curvi o non paralleli richiede una famiglia dedicata.');
 return {kind:declared?'declared-straight-native-carriers':'native-straight-reference',manualStraight:declared,referenceAxisId:axes[0].axisId,tangentXY:[...tangent],maxTransverseAdjustmentM,maximumAllowedAdjustmentM};
}
