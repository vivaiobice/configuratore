import {createTerrainBudget} from './terrain-budget.js?v=1.3.7';
import {validateTerrainModel} from './terrain-model.js?v=1.3.7';
import {fromUTM,toUTM} from './coordinate-system.js?v=1.3.7';
import {exactDomain,Q,ZERO,ONE,add,sub,mul,div,cmp,sign,pointKey,numberBounds,sqrtBounds,
 vsub,vadd,scale,dot,cross,mid,in01,inRegion,segmentIntersection,at,unique} from './terrain-exact.js?v=1.3.7';

const unsupported=reason=>Object.assign(new Error(reason),{status:'selection-unresolved',reason});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const nativePoint=p=>p.slice(0,2);
const orderedPoints=(a,b)=>cmp(a[0],b[0])||cmp(a[1],b[1]);
// Point strata can pass directly between native triangles at a common vertex.
// This is localization adjacency, never a reconstructed transport proof.
const nativeTouch=(a,b)=>a.id===b.id||a.vertexIds.some(id=>b.vertexIds.includes(id));

// A cheap UI hint over the actual preselector's recognized witness schemas.
// No grid is decoded, canonical domain constructed, or geometry certified.
// Actual native identity, adjacency and passage eligibility remain SEARCH work.
export function hasTerrainCutConvergence({diagnostics,portionId,model}={}){
 if(typeof portionId!=='string'||!portionId||!Array.isArray(diagnostics?.portions))return false;
 if(['budget-exceeded','timeout','cancelled','worker-error','worker-unavailable','invalid-transport','uncovered','invalid-input','unsupported-operation','unsupported-algorithm','stale-context','elevation'].includes(diagnostics.status))return false;
 let faceCount=null;
 if(model!==undefined){
  const width=model?.grid?.width,height=model?.grid?.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<2||height<2)return false;
  faceCount=2*(width-1)*(height-1);
  if(!Number.isSafeInteger(faceCount)||faceCount<=0)return false;
 }
 const validId=id=>Number.isSafeInteger(id)&&id>=0&&(faceCount===null||id<faceCount);
 let eligible=false;
 for(const portion of diagnostics.portions){
  if(portion?.portionId!==portionId)continue;
  if(portion.candidates!==undefined&&!Array.isArray(portion.candidates))return false;
  for(const candidate of portion.candidates??[]){
   if(candidate?.valid!==false)continue;
   const records=candidate.validation?.critical;
   if(records!==undefined&&!Array.isArray(records))return false;
   for(const record of records??[]){
    if(!['too-close','too-far'].includes(record?.reason)||!['exact-affine-interior-witness','continuous-surface-path'].includes(record.proof))continue;
    const approach=record.proof==='continuous-surface-path';
    if(approach&&record.reason!=='too-close')continue;
    const ids=approach?[record.sourceFaceId,record.targetFaceId]:record.seedFaceIds,path=approach?[]:record.itinerary;
    // The numerical preselector rejects the entire heuristic when an eligible
    // witness is malformed, even if another recognized witness looks usable.
    if(!Array.isArray(ids)||!ids.length||!Array.isArray(path)||!approach&&!path.length||!ids.every(validId)||!path.every(validId))return false;
    eligible=true;
   }
  }
 }
 return eligible;
}

function collectWitnesses(diagnostics,portionId,kernel,budget,unresolved){
 const witnesses=[];
 for(const portion of diagnostics?.portions??[]){
  budget.check();if(portion.portionId!==portionId)continue;
  for(const candidate of portion.candidates??[]){
   budget.check();if(candidate.valid!==false)continue;
   for(const record of candidate.validation?.critical??[]){
    budget.check();
    if(!['too-close','too-far'].includes(record.reason)||!['exact-affine-interior-witness','continuous-surface-path'].includes(record.proof))continue;
    const approach=record.proof==='continuous-surface-path';
    if(approach&&record.reason!=='too-close')continue;
    if(approach)budget.check(2);
    const ids=approach?[record.sourceFaceId,record.targetFaceId]:record.seedFaceIds,path=approach?[]:record.itinerary;
    if(Array.isArray(ids)&&Array.isArray(path))budget.check(ids.length+path.length);
    if(!Array.isArray(ids)||!ids.length||!Array.isArray(path)||!approach&&!path.length||[...ids,...path].some(id=>!Number.isInteger(id)||!kernel.byId.has(id))){
     budget.check(1);unresolved.push({candidateId:candidate.id,reason:'witness-native-identity'});continue;
    }
    let valid=true;
    for(let i=1;i<path.length;i++){
     budget.check();const before=kernel.byId.get(path[i-1]),after=kernel.byId.get(path[i]);
     if(!nativeTouch(before,after))valid=false;
    }
    if(!valid||!approach&&!ids.some(id=>nativeTouch(kernel.byId.get(id),kernel.byId.get(path[0])))){
     budget.check(1);unresolved.push({candidateId:candidate.id,reason:'witness-itinerary'});continue;
    }
    budget.check(ids.length+path.length+1);
    witnesses.push({candidateId:candidate.id,reason:record.reason,proofKind:record.proof,seedFaceIds:[...ids],itinerary:[...path]});
   }
  }
 }
 return witnesses;
}

function gradientRegimes(kernel,budget){
 const regimes=[],byFace=new Map(),visited=new Set();
 budget.check(kernel.faces.length);
 for(const start of [...kernel.faces].sort((a,b)=>a.id-b.id)){
  budget.check();if(visited.has(start.id))continue;
  if(start.clipped?.length>1)throw unsupported('disconnected-native-face-clips');
  const gradientKey=pointKey(start.g),faces=[],queue=[start];visited.add(start.id);budget.check(1);
  while(queue.length){
   budget.check();const face=queue.pop();faces.push(face.id);budget.check(1);
   for(const [edgeIndex,id] of face.neighbors.entries()){
    budget.check();const neighbor=kernel.byId.get(id);
    if(neighbor&&!visited.has(id)&&pointKey(neighbor.g)===gradientKey){
     budget.check(2);
     if(!physicalEdge(kernel,nativePoint(face.vertices[edgeIndex]),nativePoint(face.vertices[(edgeIndex+1)%3]),budget))continue;
     if(neighbor.clipped?.length>1)throw unsupported('disconnected-native-face-clips');
     visited.add(id);queue.push(neighbor);budget.check(1);
    }
   }
  }
  const regime={id:start.id,gradient:start.g,faces};regimes.push(regime);budget.check(1);
  for(const id of faces){budget.check(1);byFace.set(id,regime);}
 }
 return {regimes,byFace};
}

// Native edges are retained only if a positive interval lies in actual P.
// Numeric witness coordinates never enter this geometry construction.
function physicalEdge(kernel,a,b,budget){
 const roots=[ZERO,ONE];budget.check(2);
 for(const boundary of kernel.boundaries)for(let i=1;i<boundary.coordinates.length;i++){
  budget.check();const hits=segmentIntersection(a,b,boundary.coordinates[i-1],boundary.coordinates[i]);budget.check(hits.length);roots.push(...hits);
 }
 const sorted=unique(roots);budget.check(sorted.length);
 for(let i=1;i<sorted.length;i++){
  budget.check(1);if(inRegion(at(a,b,mid(sorted[i-1],sorted[i])),kernel)>0)return true;
 }
 return false;
}

function changeChains(kernel,byFace,budget){
 const pairs=new Map();
 for(const face of kernel.faces)for(let i=0;i<3;i++){
  budget.check();const neighbor=kernel.byId.get(face.neighbors[i]);
  if(!neighbor||neighbor.id<=face.id||byFace.get(face.id)===byFace.get(neighbor.id))continue;
  const edgeId=face.edgeIds[i];if(!neighbor.edgeIds.includes(edgeId))throw unsupported('native-edge-identity');
  budget.check(2);const a=nativePoint(face.vertices[i]),b=nativePoint(face.vertices[(i+1)%3]);
  if(!physicalEdge(kernel,a,b,budget))continue;
  const pair=[byFace.get(face.id).id,byFace.get(neighbor.id).id].sort((x,y)=>x-y),pairKey=pair.join(':');
  if(!pairs.has(pairKey)){budget.check(1);pairs.set(pairKey,[]);}
  budget.check(3);pairs.get(pairKey).push({id:edgeId,vertexIds:[face.vertexIds[i],face.vertexIds[(i+1)%3]],a,b,pair});
 }
 const chains=[];
 for(const edges of pairs.values()){
  const incident=new Map(),seen=new Set();
  for(const edge of edges)for(const id of edge.vertexIds){
   budget.check(1);if(!incident.has(id))incident.set(id,[]);incident.get(id).push(edge);
  }
  for(const first of edges){
   budget.check();if(seen.has(first.id))continue;
   const component=[],queue=[first];seen.add(first.id);budget.check(1);
   while(queue.length){
    const edge=queue.pop();component.push(edge);budget.check(1);
    for(const id of edge.vertexIds)for(const next of incident.get(id)){
     budget.check();if(!seen.has(next.id)){seen.add(next.id);queue.push(next);budget.check(1);}
    }
   }
   const degree=new Map(),points=new Map();
   for(const edge of component)for(const [i,id] of edge.vertexIds.entries()){
    budget.check(2);degree.set(id,(degree.get(id)??0)+1);points.set(id,i?edge.b:edge.a);
   }
   const ends=[...degree].filter(([,d])=>d===1).map(([id])=>points.get(id));budget.check(ends.length);
   if(ends.length!==2||[...degree.values()].some(d=>d>2))throw unsupported('branched-native-change-chain');
   ends.sort(orderedPoints);const tangent=vsub(ends[1],ends[0]);budget.check(1);
   for(const point of points.values()){budget.check();if(sign(cross(tangent,vsub(point,ends[0]))))throw unsupported('noncollinear-native-change-chain');}
   budget.check(component.length+3);chains.push({pair:first.pair,a:ends[0],b:ends[1],tangent,edgeIds:component.map(e=>e.id).sort()});
  }
 }
 return chains.sort((a,b)=>a.edgeIds[0].localeCompare(b.edgeIds[0]));
}

function physicalReach(kernel,anchor,tangent,budget){
 const hits=[];
 for(const boundary of kernel.boundaries)for(let i=1;i<boundary.coordinates.length;i++){
  budget.check();const a=boundary.coordinates[i-1],edge=vsub(boundary.coordinates[i],a),den=cross(tangent,edge),delta=vsub(a,anchor);
  if(!sign(den)){if(!sign(cross(delta,tangent)))throw unsupported('carrier-coincident-physical-boundary');continue;}
  const t=div(cross(delta,edge),den),s=div(cross(delta,tangent),den);
  if(in01(s)){if(boundary.hole)throw unsupported('carrier-hole-reach');budget.check(1);hits.push(t);}
 }
 const reach=unique(hits);budget.check(reach.length);
 if(reach.length!==2||inRegion(vadd(anchor,scale(tangent,mid(reach[0],reach[1]))),kernel)<=0)throw unsupported('carrier-physical-reach');
 return reach;
}

function stripWidth(chains,regimes,budget){
 const common=chains[0].pair.filter(id=>chains[1].pair.includes(id));
 if(common.length!==1)throw unsupported('parallel-strip-regime');
 const inner=regimes.find(r=>r.id===common[0]),t=chains[0].tangent,norm2=dot(t,t),delta=vsub(chains[1].a,chains[0].a);
 const d2=div(mul(cross(t,delta),cross(t,delta)),norm2),b2=div(mul(dot(inner.gradient,t),dot(inner.gradient,t)),norm2);
 const required2=mul(d2,div(add(ONE,dot(inner.gradient,inner.gradient)),add(ONE,b2)));
 budget.check(5);const bounds=sqrtBounds(required2),upper=numberBounds(bounds[1])[1];
 // The lower/upper thickness estimate applies only to the planar inner strip.
 // Actual full geodesic continuation, caps and saved width are later gates.
 if(!(upper>0)||upper>=5)throw unsupported('strip-width-above-limit');
 const wider=Math.floor(upper*2+1)/2;
 if(wider>5)throw unsupported('strip-width-above-limit');
 return {widths:wider>1.5?[1.5,wider,...(wider<5?[5]:[])]:[1.5],innerRegimeId:inner.id,requiredWidthUpperM:upper};
}

function originalSource({model,anchor,tangent,reach,widthM,budget}){
 // One native X raster step is chosen at each end BEFORE submission. It is
 // part of the original finite source, never a repair of an evaluated axis.
 const step=model.grid.step.map(Q),norm=dot(tangent,tangent),nativeLength2=mul(step[0],step[0]);
 const margin=sqrtBounds(div(nativeLength2,norm))[1];
 budget.check(2);
 const endpoints=[sub(reach[0],margin),add(reach[1],margin)].map(t=>vadd(anchor,scale(tangent,t)));
 const epsg=Number(model.crs.split(':')[1]),sourceAxis=endpoints.map(p=>{budget.check(1);return fromUTM(p.map(v=>numberBounds(v)[0]),epsg);});
 const projected=sourceAxis.map(p=>{budget.check(1);return toUTM(p,epsg);});
 const grid=model.grid,bounds=[grid.origin[0],grid.origin[1]+(grid.height-1)*grid.step[1],grid.origin[0]+(grid.width-1)*grid.step[0],grid.origin[1]],clearance=widthM/2+.1;
 if(projected.some(([x,y])=>x-bounds[0]<=clearance||bounds[2]-x<=clearance||y-bounds[1]<=clearance||bounds[3]-y<=clearance))throw unsupported('source-native-support-clearance');
 return {sourceAxis,projected};
}

/** Bounded heuristic preselection only. No returned tuple is a certified
 * passage, native region, split, width, family, area or benefit proof. */
export function preselectTerrainPassageCandidates({domain,model,portionId,diagnostics,budget=createTerrainBudget({kind:'cut'})}={}){
 const summary={status:'selection-unresolved',unresolved:[],preselectionOnly:true,completeCandidates:0};
 try{
  budget.check();
  if(!domain||domain.modelHash!==model?.contentHash||domain.crs!==model?.crs||typeof portionId!=='string'||!portionId||!validateTerrainModel(model).valid)throw unsupported('invalid-model-domain-binding');
  budget.phase('cut-preselection');
  budget.check();const kernel=exactDomain(domain,budget),witnesses=collectWitnesses(diagnostics,portionId,kernel,budget,summary.unresolved);
  if(!witnesses.length)return {candidates:[],diagnostics:summary};
  // A malformed eligible witness cannot be silently discarded in favor of a
  // better-looking one from the same failed family.
  if(summary.unresolved.length)return {candidates:[],diagnostics:summary};
  const {regimes,byFace}=gradientRegimes(kernel,budget),chains=changeChains(kernel,byFace,budget);
  if(!chains.length)throw unsupported('no-native-change-chain');
  const relevant=new Set(witnesses.flatMap(w=>[...w.seedFaceIds,...w.itinerary].map(id=>byFace.get(id).id)));budget.check(relevant.size);
  // Only the native change-connected neighborhood is considered. Identical
  // gradients in disconnected outer regimes remain different identities.
  let changed=true;
  while(changed){changed=false;for(const chain of chains){budget.check();if(chain.pair.some(id=>relevant.has(id)))for(const id of chain.pair)if(!relevant.has(id)){budget.check(1);relevant.add(id);changed=true;}}}
  const selected=chains.filter(c=>c.pair.every(id=>relevant.has(id)));budget.check(selected.length);
  if(!selected.length||selected.length>2)throw unsupported('ambiguous-native-change-chains');
  const tangent=vsub(selected[0].b,selected[0].a);budget.check(1);
  let anchor=selected[0].a,widths=[1.5],widthSelection={};
  if(selected.length===2){
   if(sign(cross(tangent,selected[1].tangent))||!sign(cross(tangent,vsub(selected[1].a,anchor))))throw unsupported('nonparallel-native-change-chains');
   anchor=anchor.map((v,i)=>mid(v,selected[1].a[i]));budget.check(1);
   widthSelection=stripWidth(selected,regimes,budget);widths=widthSelection.widths;
  }
  const reach=physicalReach(kernel,anchor,tangent,budget);
  const original=originalSource({model,anchor,tangent,reach,widthM:Math.max(...widths),budget});
  budget.check(2+selected.reduce((count,chain)=>count+chain.edgeIds.length,0));
  const selection={kind:'native-crease-preselection',certified:false,portionId,modelHash:model.contentHash,regimeCount:relevant.size,
   chainEdgeIds:selected.map(c=>[...c.edgeIds]),witnesses,initialSourceXY:original.projected.map(p=>[...p]),sourceReach:'native-chain-carrier-and-physical-boundaries',
   ...(selected.length===2?{widthSelection:'planar-inner-strip-thickness-only',requiredWidthUpperM:widthSelection.requiredWidthUpperM}:{}),
   requires:['supported-whole-source','serialized-ground-width','paired-physical-split','all-child-families','exact-served-gain']};
  const candidates=widths.map(widthM=>{budget.check(2+selection.chainEdgeIds.reduce((n,ids)=>n+ids.length,0)+witnesses.reduce((n,w)=>n+w.seedFaceIds.length+w.itinerary.length,0)+2);return freeze({sourceAxis:original.sourceAxis.map(p=>[...p]),widthM,selection:structuredClone(selection)});});
  budget.check();return {candidates,diagnostics:{...summary,status:'preselected',selectedSourceCount:1,candidateCount:candidates.length}};
 }catch(error){
  const status=error.status??'selection-unresolved';
  summary.status=status;summary.unresolved.push({reason:error.reason??error.message});return {candidates:[],diagnostics:summary};
 }
}
