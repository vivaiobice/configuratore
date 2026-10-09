import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {readAcquiredNativeSupport} from './terrain-contour-domain.js?v=1.3.6';
import {canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.6';
import {terrainInputHash} from './terrain-model.js?v=1.3.6';
import {TERRAIN_MAX_NODES} from './terrain-contour-contracts.js?v=1.3.6';
import {fromUTM,toUTM} from './coordinate-system.js?v=1.3.6';
import {
 Q,ZERO,ONE,TWO,add,sub,mul,div,cmp,sign,min,max,sq,dot,cross,vsub,at,
 mid,key,pointKey,pointOnSegment,segmentIntersection,inRegion,
 unique,number,numberBounds,xy,exactDomain,splitSegment,height,radical,
 radd,radicalCompare,radicalBounds,lengthBounds,nextUp,nextDown
} from './terrain-exact.js?v=1.3.6';

export const FINITE_POLYLINE_AXIS_CONVENTION='finite-polyline-domain-intersection-1';
export const POLYLINE_SOURCE_PARAMETER_OPERATION='polyline-source-parameter-intervals-1';
const fail=detail=>Object.assign(new Error(detail),{status:'axis-geometry-unresolved'});
const scopeHash=domain=>canonicalCutDomainScope(domain)?.scopeHash??terrainInputHash(domain.geometry);
const bindingFor=(domain,original)=>({modelHash:domain.modelHash,crs:domain.crs,scopeHash:scopeHash(domain),originalScopeHash:scopeHash(original)});
const samePoint=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const pair=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const onlyKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const absolute=q=>sign(q)<0?sub(ZERO,q):q;
function freeze(value,budget){if(value&&typeof value==='object'&&!Object.isFrozen(value)){budget?.check();for(const child of Object.values(value))freeze(child,budget);Object.freeze(value);}return value;}
function comparePosition(a,b){return a.componentIndex-b.componentIndex||a.segmentIndex-b.segmentIndex||cmp(a.parameter,b.parameter);}

export function validFinitePolylineSourceAxisSchema(axis,budget){
 budget?.check();
 if(!onlyKeys(axis,['axisId','portionId','levelM','ordinal','axisGeometryConvention','axisGeometryBinding','components','axisOperation']))return false;
 if(typeof axis.axisId!=='string'||!axis.axisId||typeof axis.portionId!=='string'||!axis.portionId||!Number.isFinite(axis.levelM)||!Number.isSafeInteger(axis.ordinal)||axis.ordinal<0||axis.axisGeometryConvention!==FINITE_POLYLINE_AXIS_CONVENTION)return false;
 const binding=axis.axisGeometryBinding;
 if(!onlyKeys(binding,['modelHash','crs','scopeHash','originalScopeHash'])||['modelHash','crs','scopeHash','originalScopeHash'].some(k=>typeof binding[k]!=='string'||!binding[k]))return false;
 if(!Array.isArray(axis.components)||!axis.components.length)return false;
 let coordinateCount=0;
 for(const component of axis.components){
  budget?.check();
  if(!onlyKeys(component,['coordinates','coordinatesXY']))return false;
  const native=component.coordinatesXY,geographic=component.coordinates;
  if(!Array.isArray(native)||native.length<2||!Array.isArray(geographic)||native.length!==geographic.length)return false;
  coordinateCount+=native.length+geographic.length;if(coordinateCount>TERRAIN_MAX_NODES)return false;
  for(let i=0;i<native.length;i++){budget?.check();if(!pair(native[i])||!pair(geographic[i])||i&&(samePoint(native[i],native[i-1])||samePoint(geographic[i],geographic[i-1])))return false;}
  if(samePoint(native[0],native.at(-1))||samePoint(geographic[0],geographic.at(-1)))return false;
 }
 if(axis.axisOperation!==undefined){
  const operation=axis.axisOperation;
  if(!onlyKeys(operation,['kind','intervals'])||operation.kind!==POLYLINE_SOURCE_PARAMETER_OPERATION||!Array.isArray(operation.intervals)||!operation.intervals.length)return false;
  let previous=null;
  for(const record of operation.intervals){
   budget?.check();
   if(!onlyKeys(record,['componentIndex','segmentIndex','lo','hi'])||!Number.isSafeInteger(record.componentIndex)||record.componentIndex<0||record.componentIndex>=axis.components.length||!Number.isSafeInteger(record.segmentIndex)||record.segmentIndex<0||record.segmentIndex>=axis.components[record.componentIndex].coordinatesXY.length-1||!Number.isFinite(record.lo)||!Number.isFinite(record.hi)||record.lo<0||record.hi>1||record.lo>=record.hi)return false;
   if(previous&&(record.componentIndex<previous.componentIndex||record.componentIndex===previous.componentIndex&&(record.segmentIndex<previous.segmentIndex||record.segmentIndex===previous.segmentIndex&&record.lo<previous.hi)))return false;
   previous=record;
  }
 }
 return true;
}
export function finitePolylineSourceHash(axis,budget){
 for(const component of axis.components??[])for(const point of component.coordinatesXY??[])budget?.check();
 budget?.check();
 const hash=terrainInputHash({axisId:axis.axisId,portionId:axis.portionId,levelM:axis.levelM,ordinal:axis.ordinal,axisGeometryConvention:axis.axisGeometryConvention,axisGeometryBinding:axis.axisGeometryBinding,components:axis.components});
 budget?.check();return hash;
}

/** Borrow real S. Native Q vertices/faces are constructed only on first touch;
 * neither a new full XYZ mesh nor a geographic support rectangle is created. */
const operationEvidence=new WeakMap();
function evidenceFor(budget){
 let evidence=operationEvidence.get(budget);
 if(!evidence){evidence={readers:new WeakMap(),sources:new WeakMap(),resolved:new WeakMap(),validated:new WeakMap(),intersections:new WeakMap()};operationEvidence.set(budget,evidence);}
 return evidence;
}
function domainEvidence(map,domain,originalDomain=domain){
 let originals=map.get(domain);if(!originals){originals=new WeakMap();map.set(domain,originals);}
 let entries=originals.get(originalDomain);if(!entries){entries=new Map();originals.set(originalDomain,entries);}
 return entries;
}
function supportReader(domain,budget){
 const acquired=readAcquiredNativeSupport(domain,{budget}),readers=evidenceFor(budget).readers;
 if(readers.has(acquired))return readers.get(acquired);
 const mesh=acquired.mesh,vertices=new Map(),faces=new Map();
 const vertex=id=>{
  if(!vertices.has(id)){budget.check(1);vertices.set(id,mesh.vertices[id].map(Q));}
  return vertices.get(id);
 };
 const face=id=>{
  if(!faces.has(id)){
   budget.check(7);
   const vertexIds=mesh.triangles[id],points=vertexIds.map(vertex),[a,b,c]=points;
   budget.check(3);
   const u=vsub(b,a),v=vsub(c,a),det=cross(u,v),g=[div(sub(mul(u[2],v[1]),mul(u[1],v[2])),det),div(sub(mul(u[0],v[2]),mul(u[2],v[0])),det)];
   budget.check(5);
   const edgeIds=vertexIds.map((value,i)=>`${Math.min(value,vertexIds[(i+1)%3])}:${Math.max(value,vertexIds[(i+1)%3])}`),raw=vertexIds.map(i=>mesh.vertices[i]);
   const nativeBounds=[Math.min(...raw.map(p=>p[0])),Math.min(...raw.map(p=>p[1])),Math.max(...raw.map(p=>p[0])),Math.max(...raw.map(p=>p[1]))];
   faces.set(id,{id,vertexIds,vertices:points,edgeIds,g,q:dot(g,g),nativeBounds});
  }
  return faces.get(id);
 };
 const query=(a,b,operationBudget=budget)=>{
  operationBudget.check(2);
  const bounds=[numberBounds(min(a[0],b[0]))[0],numberBounds(min(a[1],b[1]))[0],numberBounds(max(a[0],b[0]))[1],numberBounds(max(a[1],b[1]))[1]];
  const loX=Math.max(0,Math.floor((bounds[0]-mesh.origin[0])/mesh.step[0])-1),hiX=Math.min(mesh.width-2,Math.floor((bounds[2]-mesh.origin[0])/mesh.step[0]));
  const loY=Math.max(0,Math.floor((bounds[3]-mesh.origin[1])/mesh.step[1])-1),hiY=Math.min(mesh.height-2,Math.floor((bounds[1]-mesh.origin[1])/mesh.step[1]));
  const result=[];
  for(let row=loY;row<=hiY;row++)for(let col=loX;col<=hiX;col++)for(let half=0;half<2;half++){
   operationBudget.check(1);
   result.push(face(2*(row*(mesh.width-1)+col)+half));
  }
  return result;
 };
 const reader={acquired,mesh,face,vertex,boundaries:[],queryPoint:(a,b)=>query(a,a,b),querySegment:query};
 readers.set(acquired,reader);return reader;
}

function levelGraph(reader,levelM,budget){
 const h=Q(levelM),nodes=new Map(),segments=new Map(),levelEdges=new Map(),criticalVertices=new Map(),diagnostics=[];
 const node=(face,i,j)=>{
  const a=face.vertices[i],b=face.vertices[j];
  const zero=cmp(a[2],h)===0?i:cmp(b[2],h)===0?j:null;
  const id=zero!==null?`v:${face.vertexIds[zero]}`:`e:${face.edgeIds[i]}`;
  if(!nodes.has(id)){
   budget.check(2);
   nodes.set(id,zero!==null?face.vertices[zero].slice(0,2):at(a.slice(0,2),b.slice(0,2),div(sub(h,a[2]),sub(b[2],a[2]))));
  }
  return nodes.get(id);
 };
 const insert=(a,b)=>{
  if(pointKey(a)===pointKey(b))return;
  const ka=pointKey(a),kb=pointKey(b),id=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
  if(!segments.has(id)){budget.check(3);segments.set(id,{id,a,b,ka,kb});}
 };
 for(let id=0;id<reader.mesh.triangles.length;id++){
  budget.check();
  const ids=reader.mesh.triangles[id],raw=ids.map(i=>reader.mesh.vertices[i][2]);
  if(raw.every(z=>z>levelM)||raw.every(z=>z<levelM))continue;
  const face=reader.face(id);budget.check(3);
  const signs=face.vertices.map(p=>cmp(p[2],h)),zeros=signs.reduce((sum,s)=>sum+(!s?1:0),0);
  for(let i=0;i<3;i++)if(!signs[i]&&!criticalVertices.has(face.vertexIds[i])){budget.check(1);criticalVertices.set(face.vertexIds[i],node(face,i,(i+1)%3));}
  if(zeros===3){budget.check(1);diagnostics.push({reason:'plateau',faceId:id,levelM});continue;}
  if(zeros===2){
   const i=signs.findIndex((s,j)=>!s&&!signs[(j+1)%3]),edgeId=face.edgeIds[i];
   if(!levelEdges.has(edgeId)){budget.check(3);levelEdges.set(edgeId,{a:node(face,i,(i+1)%3),b:node(face,(i+1)%3,(i+2)%3),signs:[],faceIds:[]});}
   const edge=levelEdges.get(edgeId);budget.check(2);edge.signs.push(signs[(i+2)%3]);edge.faceIds.push(id);continue;
  }
  const points=new Map();
  for(let i=0;i<3;i++)if(signs[i]*signs[(i+1)%3]<0||!signs[i]||!signs[(i+1)%3]){const p=node(face,i,(i+1)%3);budget.check(1);points.set(pointKey(p),p);}
  if(points.size===2){const [a,b]=points.values();insert(a,b);}
 }
 for(const [edgeId,edge] of levelEdges){
  budget.check();
  if(edge.signs.length>1&&edge.signs.every(s=>s===edge.signs[0])){budget.check(1);diagnostics.push({reason:'ridge-valley',edgeId,faceIds:edge.faceIds,levelM});}
  else insert(edge.a,edge.b);
 }
 const graph=new Map();
 for(const edge of segments.values())for(const point of [edge.ka,edge.kb]){
  if(!graph.has(point)){budget.check(1);graph.set(point,[]);}
  budget.check(1);graph.get(point).push(edge);
 }
 for(const [id,edges] of graph)if(edges.length>2){budget.check(1);diagnostics.push({reason:'branch',levelM,node:id});}
 const used=new Set(),components=[];
 const walk=start=>{
  let current=start;
  const points=[];
  while(true){
   budget.check();
   const edge=graph.get(current)?.find(e=>!used.has(e.id));
   if(!edge)break;
   budget.check(1);used.add(edge.id);
   if(!points.length){budget.check(1);points.push(current===edge.ka?edge.a:edge.b);}
   const next=current===edge.ka?edge.kb:edge.ka;
   budget.check(1);points.push(current===edge.ka?edge.b:edge.a);current=next;
   if(current===start){budget.check(1);diagnostics.push({reason:'closed-contour',levelM});return;}
  }
  if(points.length>1){budget.check(1);components.push(points);}
 };
 budget.check(graph.size*3);
 for(const [id,edges] of [...graph].sort(([a],[b])=>a.localeCompare(b)))if(edges.length===1&&!used.has(edges[0].id))walk(id);
 for(const [id,edges] of graph)if(edges.some(edge=>!used.has(edge.id)))walk(id);
 return {components,diagnostics,criticalVertices,graph};
}

function regionKernel(domain,budget,geographic=false){
 const scope=canonicalCutDomainScope(domain),native=exactDomain(domain,budget);
 const scopeBindingHash=scope?.scopeHash??terrainInputHash(domain.geometry);budget.check();
 if(!geographic){budget.check(1);return {...native,canonicalSourceScope:scope,scopeBindingHash};}
 const boundaries=[],regions=new Map();
 const source=scope?.geographicBoundaries;
 if(source){
  for(const [i,ring] of source.entries()){
   budget.check(ring.coordinates.length+1);
   boundaries.push({...native.boundaries[i],coordinates:ring.coordinates,ancestry:ring});
  }
 }else{
  const polygons=domain.geometry.type==='Polygon'?[domain.geometry.coordinates]:domain.geometry.coordinates;
  for(const boundary of native.boundaries){
   const ring=polygons[boundary.polygonIndex][boundary.ringIndex];budget.check(ring.length+1);
   boundaries.push({...boundary,coordinates:ring.map(point=>point.map(Q))});
  }
 }
 for(const boundary of boundaries){if(!regions.has(boundary.polygonIndex)){budget.check(1);regions.set(boundary.polygonIndex,[]);}budget.check(1);regions.get(boundary.polygonIndex)[boundary.ringIndex]=boundary.coordinates;}
 return {domain,boundaries,regions,canonicalSourceScope:scope,scopeBindingHash};
}
function boundaryRoots(kernel,a,b,budget,lo=ZERO,hi=ONE){
 budget.check(2);
 const roots=[lo,hi];
 for(const boundary of kernel.boundaries)for(let i=1;i<boundary.coordinates.length;i++){
  budget.check();
  for(const root of segmentIntersection(a,b,boundary.coordinates[i-1],boundary.coordinates[i]))if(cmp(root,lo)>=0&&cmp(root,hi)<=0){budget.check(1);roots.push(root);}
 }
 budget.check(roots.length*2);return unique(roots);
}
function finiteCaps(points,kernel,budget){
 const intervals=[],boundaryPoints=kernel.boundaries.flatMap(boundary=>boundary.coordinates);
 // Only the extremal closed contacts determine finite source caps. Retaining
 // every duplicate root/interior endpoint and sorting them allocated O(knots)
 // redundant records for each native and geographic clipping pass.
 let firstSegment=-1,firstParameter=null,lastSegment=-1,lastParameter=null;
 const contact=(segment,parameter)=>{
  if(firstSegment<0||segment<firstSegment||segment===firstSegment&&cmp(parameter,firstParameter)<0){firstSegment=segment;firstParameter=parameter;}
  if(lastSegment<0||segment>lastSegment||segment===lastSegment&&cmp(parameter,lastParameter)>0){lastSegment=segment;lastParameter=parameter;}
 };
 const bounds=[0,1].map(i=>[boundaryPoints.reduce((v,p)=>min(v,p[i]),boundaryPoints[0][i]),boundaryPoints.reduce((v,p)=>max(v,p[i]),boundaryPoints[0][i])]);
 for(let segmentIndex=0;segmentIndex<points.length-1;segmentIndex++){
  const a=points[segmentIndex],b=points[segmentIndex+1];
  if([0,1].some(i=>cmp(max(a[i],b[i]),bounds[i][0])<0||cmp(min(a[i],b[i]),bounds[i][1])>0)){
   budget.check(1);intervals.push({componentIndex:0,segmentIndex,lo:ZERO,hi:ONE,inside:false});continue;
  }
  const roots=boundaryRoots(kernel,a,b,budget);
  for(const parameter of roots){budget.check(1);if(inRegion(at(a,b,parameter),kernel)>=0)contact(segmentIndex,parameter);}
  for(let i=1;i<roots.length;i++){
   budget.check(2);
   intervals.push({componentIndex:0,segmentIndex,lo:roots[i-1],hi:roots[i],inside:inRegion(at(a,b,mid(roots[i-1],roots[i])),kernel)>=0});
   if(intervals.at(-1).inside){contact(segmentIndex,roots[i-1]);contact(segmentIndex,roots[i]);}
  }
 }
 if(firstSegment<0)return null;
 budget.check(2);
 const first={componentIndex:0,segmentIndex:firstSegment,parameter:firstParameter},last={componentIndex:0,segmentIndex:lastSegment,parameter:lastParameter};
 let before=null,after=null;
 for(const part of intervals){
  budget.check();
  if(!part.inside&&comparePosition({componentIndex:0,segmentIndex:part.segmentIndex,parameter:part.hi},first)<=0)before=part;
  if(!after&&!part.inside&&comparePosition({componentIndex:0,segmentIndex:part.segmentIndex,parameter:part.lo},last)>=0)after=part;
 }
 if(!before||!after)throw fail('Original P has no positive exterior interval within acquired S for a finite source cap');
 budget.check(2);
 const start=at(points[before.segmentIndex],points[before.segmentIndex+1],mid(before.lo,before.hi)),end=at(points[after.segmentIndex],points[after.segmentIndex+1],mid(after.lo,after.hi));
 budget.check(1);const retained=[start];
 for(let i=before.segmentIndex+1;i<=after.segmentIndex;i++){budget.check(1);retained.push(points[i]);}
 budget.check(1);retained.push(end);
 return retained;
}

function constructSourceFresh(domain,levelM,{originalDomain=domain,portionId='default',ordinal=0,budget,preserveNativeKnots=false}){
 if(!Number.isFinite(levelM)||typeof portionId!=='string'||!portionId||!Number.isSafeInteger(ordinal)||ordinal<0)throw fail('Finite contour level and source identity required');
 const reader=supportReader(originalDomain,budget),current=readAcquiredNativeSupport(domain,{budget});
 if(current.modelHash!==reader.acquired.modelHash||current.crs!==reader.acquired.crs)throw fail('Original/current native model or CRS mismatch');
 const kernel=regionKernel(originalDomain,budget),graph=levelGraph(reader,levelM,budget);
 for(const [vertexId,p] of graph.criticalVertices)if(!graph.graph.has(pointKey(p))&&inRegion(p,kernel)>=0){budget.check(1);graph.diagnostics.push({reason:'isolated-level-point',vertexId,levelM});}
 if(graph.diagnostics.length)return {axes:[],diagnostics:graph.diagnostics};
 const components=[],epsg=Number(domain.crs.split(':')[1]);
 for(const points of graph.components){
  const capped=finiteCaps(points,kernel,budget);if(!capped)continue;
  // Collinear native knots carry no contour geometry. Remove them exactly
  // before geographic projection creates artificial ULP-sized bends. Every
  // real turn and both finite caps survive; native face integration is unchanged.
  const retained=[];
  for(const point of capped){
   budget.check();
   while(!preserveNativeKnots&&retained.length>1){
    const a=retained.at(-2),b=retained.at(-1),u=vsub(b,a),v=vsub(point,b);
    if(sign(cross(u,v))||sign(dot(u,v))<=0)break;
    retained.pop();
   }
   retained.push(point);
  }
  const coordinates=[],coordinatesXY=[];
  for(const point of retained){budget.check(3);const geographic=fromUTM(xy(point),epsg);coordinates.push(geographic);coordinatesXY.push(toUTM(geographic,epsg));}
  budget.check(1);components.push({coordinates,coordinatesXY});
 }
 if(!components.length)return {axes:[],diagnostics:[]};
 budget.check(1);return {axes:[freeze({axisId:`${portionId}:level:${levelM}`,portionId,levelM,ordinal,axisGeometryConvention:FINITE_POLYLINE_AXIS_CONVENTION,axisGeometryBinding:bindingFor(domain,originalDomain),components},budget)],diagnostics:[]};
}

// Reuse only deterministic evidence computed by this operation from the actual
// immutable owner domains. New budgets reconstruct; submitted values are still
// compared in full, never accepted on a caller hash or registration.
function constructSource(domain,levelM,{originalDomain=domain,portionId='default',ordinal=0,budget,preserveNativeKnots=false}){
 budget.check();
 if(!Number.isFinite(levelM)||typeof portionId!=='string'||!portionId||!Number.isSafeInteger(ordinal)||ordinal<0)throw fail('Finite contour level and source identity required');
 const originalSupport=readAcquiredNativeSupport(originalDomain,{budget}),currentSupport=readAcquiredNativeSupport(domain,{budget});
 if(currentSupport.modelHash!==originalSupport.modelHash||currentSupport.crs!==originalSupport.crs)throw fail('Original/current native model or CRS mismatch');
 // Geometry is a complete contour capped by original P only. Child P affects
 // its explicit binding and later exact physical clipping, never this source.
 // Share those immutable components across actual child scopes in this operation.
 const entries=domainEvidence(evidenceFor(budget).sources,originalDomain,originalDomain),cacheKey=JSON.stringify([levelM,portionId,preserveNativeKnots]);
 let source=entries.get(cacheKey);
 if(!source){source=freeze(constructSourceFresh(originalDomain,levelM,{originalDomain,portionId,ordinal:0,budget,preserveNativeKnots}),budget);entries.set(cacheKey,source);}
 if(!ordinal&&domain===originalDomain)return source;
 budget.check(source.axes.length);
 return freeze({axes:source.axes.map(axis=>({...axis,ordinal,axisGeometryBinding:bindingFor(domain,originalDomain)})),diagnostics:source.diagnostics},budget);
}

function compileSource(axis,budget){
 const native=[],geographic=[],epsg=Number(axis.axisGeometryBinding.crs.split(':')[1]);
 for(const component of axis.components){
  const n=[],g=[];
  for(let i=0;i<component.coordinates.length;i++){
   budget.check(3);
   let projected;
   try{projected=toUTM(component.coordinates[i],epsg);}catch(error){throw fail(`Invalid geographic source: ${error.message}`);}
   if(!samePoint(projected,component.coordinatesXY[i]))throw fail('Saved native source is not the actual projection of its geographic source');
   n.push(component.coordinatesXY[i].map(Q));g.push(component.coordinates[i].map(Q));
  }
  budget.check(2);native.push(n);geographic.push(g);
 }
 return {native,geographic};
}
function checkSimple(components,budget){
 const segments=[];
 for(let componentIndex=0;componentIndex<components.length;componentIndex++)for(let segmentIndex=0;segmentIndex<components[componentIndex].length-1;segmentIndex++){
  budget.check(1);segments.push({componentIndex,segmentIndex,a:components[componentIndex][segmentIndex],b:components[componentIndex][segmentIndex+1]});
 }
 for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){
  budget.check();
  const a=segments[j],b=segments[i];
  if(cmp(max(a.a[0],a.b[0]),min(b.a[0],b.b[0]))<0||cmp(max(b.a[0],b.b[0]),min(a.a[0],a.b[0]))<0||cmp(max(a.a[1],a.b[1]),min(b.a[1],b.b[1]))<0||cmp(max(b.a[1],b.b[1]),min(a.a[1],a.b[1]))<0)continue;
  const intersections=unique(segmentIntersection(a.a,a.b,b.a,b.b));
  if(!intersections.length)continue;
  const adjacent=a.componentIndex===b.componentIndex&&a.segmentIndex+1===b.segmentIndex&&pointKey(a.b)===pointKey(b.a);
  if(!adjacent||intersections.length!==1||cmp(intersections[0],ONE)!==0)throw fail('Crossing, touching or backtracking finite source topology');
  if(!sign(cross(vsub(a.b,a.a),vsub(b.b,b.a)))&&sign(dot(vsub(a.b,a.a),vsub(b.b,b.a)))<=0)throw fail('Backtracking finite source topology');
 }
}
function checkSupport(axis,compiled,domain,budget){
 const reader=supportReader(domain,budget),first=reader.vertex(0),last=reader.vertex(reader.mesh.vertices.length-1),loX=min(first[0],last[0]),hiX=max(first[0],last[0]),loY=min(first[1],last[1]),hiY=max(first[1],last[1]);
 for(const component of compiled.native){
  budget.check(2);
  for(const cap of [component[0],component.at(-1)])if(cmp(cap[0],loX)<=0||cmp(cap[0],hiX)>=0||cmp(cap[1],loY)<=0||cmp(cap[1],hiY)>=0)throw fail('Initial finite source cap is not strictly within acquired native S');
  for(let i=1;i<component.length;i++)for(const piece of splitSegment(reader,component[i-1],component[i],budget,{region:false})){
   if(!piece.faces.length)throw fail('Actual submitted finite source has uncovered acquired-support interval');
   for(const face of piece.faces)for(const endpoint of [piece.a,piece.b])if(cmp(absolute(sub(height(face,endpoint),Q(axis.levelM))),Q(.001))>0)throw fail('Actual submitted finite source exceeds the native elevation limit');
  }
 }
}

const sourceEdgeId=edge=>`${edge.operandId}:${edge.polygonIndex}:${edge.ringIndex}:${edge.edgeIndex}`;
function incidence(kernel,p,budget){
 const labels=[];
 const scope=kernel.canonicalSourceScope;
 for(const boundary of kernel.boundaries)for(let i=1;i<boundary.coordinates.length;i++){
  budget.check();
  if(!pointOnSegment(p,boundary.coordinates[i-1],boundary.coordinates[i]))continue;
  const ancestry=scope?.geographicBoundaries[boundary.ringIndex]?.edges[i-1];
  budget.check(1);
  labels.push(`${boundary.polygonIndex}:${boundary.ringIndex}:${i-1}:${ancestry?ancestry.sources.map(sourceEdgeId).sort().join('|'):'saved-scope-edge'}`);
 }
 budget.check(labels.length*2);return [...new Set(labels)].sort();
}
function intervalsFor(axis,budget){
 if(axis.axisOperation)return axis.axisOperation.intervals;
 const intervals=[];
 for(let componentIndex=0;componentIndex<axis.components.length;componentIndex++)for(let segmentIndex=0;segmentIndex<axis.components[componentIndex].coordinatesXY.length-1;segmentIndex++){
  budget.check(1);intervals.push({componentIndex,segmentIndex,lo:0,hi:1});
 }
 return intervals;
}
function sourceCap(axis,interval,parameter,point,kernel,budget){
 const ancestry=incidence(kernel,point,budget);
 if(ancestry.length)return {kind:'physical-boundary',scopeHash:kernel.scopeBindingHash,ancestry};
 if(axis.axisOperation){
  const records=axis.axisOperation.intervals,index=records.indexOf(interval),previous=records[index-1],next=records[index+1];
  const continues=(a,b)=>a&&b&&a.componentIndex===b.componentIndex&&(a.segmentIndex===b.segmentIndex&&a.hi===b.lo||a.segmentIndex+1===b.segmentIndex&&a.hi===1&&b.lo===0);
  if(cmp(parameter,Q(interval.lo))===0&&!continues(previous,interval)||cmp(parameter,Q(interval.hi))===0&&!continues(interval,next))return {kind:'retained-source-cap',componentIndex:interval.componentIndex,segmentIndex:interval.segmentIndex,parameter:cmp(parameter,Q(interval.lo))===0?interval.lo:interval.hi};
 }
 if(cmp(parameter,ZERO)===0||cmp(parameter,ONE)===0)return {kind:'source-knot',componentIndex:interval.componentIndex,vertexIndex:interval.segmentIndex+(cmp(parameter,ONE)===0?1:0)};
 return {kind:'native-face-crossing'};
}

/** Independent contact word: parameters stay in their own coordinate role.
 * Source knots, operation caps, real edge/vertex ancestry and interval order
 * must match; counts or copied native roots cannot establish correspondence. */
function contactWord(axis,coordinates,kernel,budget){
 const word=[],positiveEndpoints=new Set(),contacts=new Map();
 for(const [intervalIndex,interval] of intervalsFor(axis,budget).entries()){
  const {componentIndex,segmentIndex}=interval,a=coordinates[componentIndex][segmentIndex],b=coordinates[componentIndex][segmentIndex+1],roots=boundaryRoots(kernel,a,b,budget,Q(interval.lo),Q(interval.hi));
  for(let i=0;i<roots.length;i++){
   budget.check(3);
   const parameter=roots[i],point=at(a,b,parameter),location=inRegion(point,kernel),ancestry=incidence(kernel,point,budget),id=`${componentIndex}:${pointKey(point)}`;
   const source=cmp(parameter,ZERO)===0?`knot:${segmentIndex}`:cmp(parameter,ONE)===0?`knot:${segmentIndex+1}`:cmp(parameter,Q(interval.lo))===0?`retained:${intervalIndex}:start`:cmp(parameter,Q(interval.hi))===0?`retained:${intervalIndex}:end`:'boundary';
   const pointRecord={componentIndex,segmentIndex,kind:'point',source,location,ancestry};
   Object.defineProperty(pointRecord,'exactParameter',{value:key(parameter)});
   word.push(pointRecord);
   if(location>=0)contacts.set(id,point);
   if(i<roots.length-1){
    budget.check(2);
    const inside=inRegion(at(a,b,mid(parameter,roots[i+1])),kernel)>=0;
    word.push({componentIndex,segmentIndex,kind:'open',inside});
    if(inside){budget.check(3);positiveEndpoints.add(id);positiveEndpoints.add(`${componentIndex}:${pointKey(at(a,b,roots[i+1]))}`);}
   }
  }
 }
 for(const id of contacts.keys()){budget.check();if(!positiveEndpoints.has(id))throw fail('Isolated retained source/true-P contact has no point-stratum certificate');}
 return word;
}
function pairedClip(axis,compiled,domain,budget,kernel=exactDomain(domain,budget)){
 const native=regionKernel(domain,budget),geographic=regionKernel(domain,budget,true),nativeWord=contactWord(axis,compiled.native,native,budget),geographicWord=contactWord(axis,compiled.geographic,geographic,budget);
 if(JSON.stringify(nativeWord)!==JSON.stringify(geographicWord)){
  let index=0;while(index<Math.min(nativeWord.length,geographicWord.length)&&JSON.stringify(nativeWord[index])===JSON.stringify(geographicWord[index]))index++;
  const entry=(word,i)=>word[i]?{...word[i],...(word[i].exactParameter?{exactParameter:word[i].exactParameter}:{})}:null;
  throw Object.assign(fail('Independent native/geographic source contact ancestry is unpaired'),{diagnostics:{firstDifference:index,nativeCount:nativeWord.length,geographicCount:geographicWord.length,nativePrevious:entry(nativeWord,index-1),geographicPrevious:entry(geographicWord,index-1),native:entry(nativeWord,index),geographic:entry(geographicWord,index)}});
 }
 const pieces=[],uncovered=[],outside=[];
 for(const interval of intervalsFor(axis,budget)){
  const {componentIndex,segmentIndex}=interval,a=compiled.native[componentIndex][segmentIndex],b=compiled.native[componentIndex][segmentIndex+1],lo=Q(interval.lo),hi=Q(interval.hi);
  budget.check(2);
  for(const part of splitSegment(kernel,at(a,b,lo),at(a,b,hi),budget)){
   const start=add(lo,mul(sub(hi,lo),part.lo)),end=add(lo,mul(sub(hi,lo),part.hi));
   budget.check(1);
   const record={...part,lo:start,hi:end,axisId:axis.axisId,componentIndex,segmentIndex,levelM:axis.levelM,ordinal:axis.ordinal,startCap:sourceCap(axis,interval,start,part.a,native,budget),endCap:sourceCap(axis,interval,end,part.b,native,budget)};
   if(part.faces.length)pieces.push(record);else if(part.inside)uncovered.push(record);else outside.push(record);
  }
 }
 if(uncovered.length)throw fail('Actual physical finite source has uncovered native pieces');
 return {pieces,uncovered,outside,sourceHash:finitePolylineSourceHash(axis,budget)};
}
function validateActual(axis,domain,originalDomain,budget){
 if(!validFinitePolylineSourceAxisSchema(axis,budget))throw fail('Unknown or malformed finite polyline source convention/operation');
 // Only evidence constructed from the actual owner in this operation is
 // shared. The complete submitted source is the key; no caller hash or flag
 // conveys authority, and a fresh budget has an empty evidence store.
 const entries=domainEvidence(evidenceFor(budget).validated,originalDomain),cacheKey=JSON.stringify(axis);
 let evidence=entries.get(cacheKey);
 if(!evidence){
  const compiled=compileSource(axis,budget);
  checkSimple(compiled.native,budget);checkSimple(compiled.geographic,budget);checkSupport(axis,compiled,originalDomain,budget);
  const original=pairedClip(axis,compiled,originalDomain,budget);
  evidence={compiled:freeze(compiled,budget),clips:new WeakMap([[originalDomain,freeze(original,budget)]])};
  entries.set(cacheKey,evidence);
 }
 if(!evidence.clips.has(domain))evidence.clips.set(domain,freeze(pairedClip(axis,evidence.compiled,domain,budget),budget));
 budget.check();return {compiled:evidence.compiled,original:evidence.clips.get(originalDomain),current:evidence.clips.get(domain)};
}

export function traceFinitePolylineContourLevel(domain,levelM,{originalDomain=domain,portionId='default',ordinal=0,budget=createTerrainBudget({kind:'measure'})}={}){
 budget.phase('finite-polyline-contours');
 const result=constructSource(domain,levelM,{originalDomain,portionId,ordinal,budget});
 if(result.axes.length)validateActual(result.axes[0],domain,originalDomain,budget);
 return result;
}

/** Completeness is recomputed from actual owner S and actual original P. The
 * saved hash, a caller facade or process registration is never such a proof. */
export function resolveFinitePolylineSourceAxis(kernel,axis,budget=createTerrainBudget({kind:'measure'}),{original=false,originalDomain=kernel.domain}={}){
 budget.check();
 if(!validFinitePolylineSourceAxisSchema(axis,budget))throw fail('Unknown or malformed finite polyline source convention/operation');
 const domain=kernel.domain,binding=axis.axisGeometryBinding;
 readAcquiredNativeSupport(domain,{budget});readAcquiredNativeSupport(originalDomain,{budget});
 if(kernel!==exactDomain(domain,budget))throw fail('Finite polyline resolution requires the actual owner-domain exact kernel');
 if(binding.modelHash!==domain.modelHash||binding.crs!==domain.crs||originalDomain.modelHash!==domain.modelHash||originalDomain.crs!==domain.crs||binding.originalScopeHash!==scopeHash(originalDomain)||(original?binding.originalScopeHash:binding.scopeHash)!==scopeHash(domain))throw fail('Finite polyline model/CRS/current/original scope binding mismatch');
 const entries=domainEvidence(evidenceFor(budget).resolved,domain,originalDomain),cacheKey=JSON.stringify(axis);
 if(entries.has(cacheKey)){budget.check(1);return {...entries.get(cacheKey)};}
 const regenerationOptions={originalDomain,portionId:axis.portionId,ordinal:axis.ordinal,budget};
 const matches=regenerated=>regenerated.axes.length===1&&regenerated.axes[0].axisId===axis.axisId&&JSON.stringify(regenerated.axes[0].components)===JSON.stringify(axis.components);
 // Existing dense saved sources retain their original complete construction.
 // Both forms are freshly reconstructed from actual S, never caller evidence.
 if(!matches(constructSource(domain,axis.levelM,regenerationOptions))&&!matches(constructSource(domain,axis.levelM,{...regenerationOptions,preserveNativeKnots:true})))throw fail('Saved finite source differs from deterministic complete native-level regeneration');
 const {current:resolved}=validateActual(axis,domain,originalDomain,budget);
 freeze(resolved,budget);entries.set(cacheKey,resolved);budget.check(1);return {...resolved};
}

export function polylinePhysicalFragments(pieces,budget=createTerrainBudget({kind:'measure'})){
 const fragments=[];
 for(const piece of pieces){
  budget.check(1);
  const fragment=fragments.at(-1),last=fragment?.at(-1);
  const adjacent=last&&last.axisId===piece.axisId&&last.componentIndex===piece.componentIndex&&pointKey(last.b)===pointKey(piece.a)&&(last.segmentIndex===piece.segmentIndex&&cmp(last.hi,piece.lo)===0||last.segmentIndex+1===piece.segmentIndex&&cmp(last.hi,ONE)===0&&cmp(piece.lo,ZERO)===0);
  if(adjacent)fragment.push(piece);else {budget.check(1);fragments.push([piece]);}
 }
 return fragments;
}
export function intersectPolylineSourceIntervals(axis,pieces,originalPieces,budget=createTerrainBudget({kind:'measure'})){
 const cacheable=Object.isFrozen(pieces)&&Object.isFrozen(originalPieces),all=evidenceFor(budget).intersections,cacheKey=cacheable?JSON.stringify(axis):null;
 let entries;
 if(cacheable){let originals=all.get(pieces);if(!originals){originals=new WeakMap();all.set(pieces,originals);}entries=originals.get(originalPieces);if(!entries){entries=new Map();originals.set(originalPieces,entries);}if(entries.has(cacheKey)){budget.check();return entries.get(cacheKey);}}
 const result=[];
 for(const piece of pieces)for(const original of originalPieces){
  budget.check();
  if(piece.componentIndex!==original.componentIndex||piece.segmentIndex!==original.segmentIndex)continue;
  const lo=max(piece.lo,original.lo),hi=min(piece.hi,original.hi);if(cmp(lo,hi)>=0)continue;
  budget.check(5);
  const component=axis.components[piece.componentIndex].coordinatesXY,a=component[piece.segmentIndex].map(Q),b=component[piece.segmentIndex+1].map(Q);
  // A physical cap has priority only while its own endpoint is retained.
  result.push({...piece,lo,hi,a:at(a,b,lo),b:at(a,b,hi),startCap:cmp(lo,piece.lo)===0&&piece.startCap?.kind==='physical-boundary'?piece.startCap:cmp(lo,original.lo)===0?original.startCap:piece.startCap,endCap:cmp(hi,piece.hi)===0&&piece.endCap?.kind==='physical-boundary'?piece.endCap:cmp(hi,original.hi)===0?original.endCap:piece.endCap});
 }
 if(entries)entries.set(cacheKey,freeze(result,budget));
 return result;
}

function pieceSpeed(axis,piece,budget){
 const points=axis.components[piece.componentIndex]?.coordinatesXY;
 if(!points||!points[piece.segmentIndex+1]||!piece.faces?.length||cmp(piece.lo,piece.hi)>=0)throw fail('Invalid actual piece for original ground trim');
 budget.check(5);
 const a=points[piece.segmentIndex].map(Q),b=points[piece.segmentIndex+1].map(Q),v=vsub(b,a),dz=dot(piece.faces[0].g,v);
 if(pointKey(at(a,b,piece.lo))!==pointKey(piece.a)||pointKey(at(a,b,piece.hi))!==pointKey(piece.b))throw fail('Ground trim piece does not match the submitted source interval');
 return add(dot(v,v),sq(dz));
}
/** Operates on freshly resolved original-P native pieces. Applicable replay
 * regenerates these pieces and this operation; display paths are never inputs.
 * Every prefix is an actual sum of per-face ground radicals, not one speed. */
export function trimPolylineSourceFragment(axis,pieces,amount,budget=createTerrainBudget({kind:'measure'})){
 budget.check();
 if(!validFinitePolylineSourceAxisSchema(axis,budget)||axis.axisOperation||!Array.isArray(pieces)||!pieces.length||!Number.isFinite(amount)||amount<0)throw fail('Original ground trim requires an untrimmed finite source and actual nonempty pieces');
 const fragments=polylinePhysicalFragments(pieces,budget);
 if(fragments.length!==1||pieces.some(p=>p.axisId!==axis.axisId))throw fail('Original ground trim requires one contiguous actual source fragment');
 const speeds=[];let total=[];
 for(const piece of pieces){
  const speed2=pieceSpeed(axis,piece,budget);budget.check(1);speeds.push(speed2);
  total=radd(total,radical([[sub(piece.hi,piece.lo),speed2]]));
 }
 const requested=Q(amount),maximum=add(requested,Q(1e-6)),comparison=radicalCompare(total,mul(TWO,requested),budget);
 if(comparison===null)throw fail('Original ground length versus consumed 2h remains unresolved');
 const sourceLengthBoundsM=lengthBounds(total);
 if(comparison<=0)return {consumed:true,sourceLengthBoundsM};
 if(!amount)return {consumed:false,operation:null,removedEnds:[],sourceLengthBoundsM};
 const choose=end=>{
  let prefix=[];
  for(let walk=0;walk<pieces.length;walk++){
   budget.check();
   const index=end?pieces.length-1-walk:walk,piece=pieces[index],speed2=speeds[index],complete=radd(prefix,radical([[sub(piece.hi,piece.lo),speed2]])),reaches=radicalCompare(complete,requested,budget);
   if(reaches===null)throw fail('Original ground prefix comparison remains unresolved');
   if(reaches<0){prefix=complete;continue;}
   const prefixBounds=lengthBounds(prefix),residual=amount-(prefixBounds[0]+prefixBounds[1])/2,speed=Math.sqrt(number(speed2));
   const lower=numberBounds(piece.lo)[1],upper=numberBounds(piece.hi)[0];
   if(lower>upper)throw fail('Original trim piece has no finite local parameter');
   let parameter=Math.max(lower,Math.min(upper,number(end?piece.hi:piece.lo)+(end?-1:1)*residual/speed));
   for(let attempt=0;attempt<16;attempt++){
    budget.check();
    const q=Q(parameter);
    if(cmp(q,piece.lo)<0||cmp(q,piece.hi)>0)break;
    const delta=end?sub(piece.hi,q):sub(q,piece.lo),removed=radd(prefix,radical([[delta,speed2]])),lowerProof=radicalCompare(removed,requested,budget),upperProof=radicalCompare(removed,maximum,budget);
    if(lowerProof===null||upperProof===null)throw fail('Conservative ground trim radical comparison remains unresolved');
    if(lowerProof>=0&&upperProof<=0){
     const bounds=radicalBounds(removed,512);
     if(cmp(bounds[0],requested)<0||cmp(bounds[1],maximum)>0)throw fail('Conservative ground trim bounds remain unresolved');
     return {componentIndex:piece.componentIndex,segmentIndex:piece.segmentIndex,parameter,removedLengthBoundsM:bounds.map((q,i)=>numberBounds(q)[i]),excessBoundsM:[numberBounds(sub(bounds[0],requested))[0],numberBounds(sub(bounds[1],requested))[1]]};
    }
    if(lowerProof<0)parameter=end?nextDown(parameter):nextUp(parameter);else break;
   }
   throw fail('Ground trim has no proved conservative finite source parameter within 16 ULP');
  }
  throw fail('Original ground trim did not locate its actual piece');
 };
 const start=choose(false),end=choose(true);
 if(comparePosition({...start,parameter:Q(start.parameter)},{...end,parameter:Q(end.parameter)})>=0)throw fail('A proved positive ground remainder has no nonempty finite retained interval');
 const intervals=[];
 for(let segmentIndex=start.segmentIndex;segmentIndex<=end.segmentIndex;segmentIndex++){
  const lo=segmentIndex===start.segmentIndex?start.parameter:0,hi=segmentIndex===end.segmentIndex?end.parameter:1;
  if(lo===hi)continue;
  budget.check(1);intervals.push({componentIndex:start.componentIndex,segmentIndex,lo,hi});
 }
 const operation=freeze({kind:POLYLINE_SOURCE_PARAMETER_OPERATION,intervals},budget);
 if(!validFinitePolylineSourceAxisSchema({...axis,axisOperation:operation},budget))throw fail('Ground trim retained source operation is malformed');
 return {consumed:false,operation,removedEnds:[{end:'start',...start},{end:'end',...end}],sourceLengthBoundsM};
}
