import clipping from './vendor/polygon-clipping.js?v=1.3.7';
import {toUTM} from './coordinate-system.js?v=1.3.7';
import {getTerrainMesh,validateTerrainModel,terrainInputHash,MAX_TERRAIN_CELLS} from './terrain-model.js?v=1.3.7';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.7';
import {TERRAIN_MAX_NODES} from './terrain-contour-contracts.js?v=1.3.7';
import {createExactNativeClipper} from './terrain-native-clipping.js?v=1.3.7';
import {canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.7';

// Both modules only call each other's APIs after ESM initialization.
const cache=new Map();
const acquiredSupports=new WeakMap(),meshSupports=new WeakMap(),nativeAreaTerms=new WeakMap();
let cachedNodes=0;
const error=(status,message)=>Object.assign(new Error(message),{status});
const overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function boundsOf(points){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of points){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
 return [minX,minY,maxX,maxY];
}
function ringArea(ring){
 const [x,y]=ring[0];let twice=0;
 for(let i=1;i<ring.length;i++)twice+=(ring[i-1][0]-x)*(ring[i][1]-y)-(ring[i][0]-x)*(ring[i-1][1]-y);
 return Math.abs(twice)/2;
}
function multiArea(multi){return multi.reduce((a,rings)=>a+ringArea(rings[0])-rings.slice(1).reduce((s,r)=>s+ringArea(r),0),0);}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function freezeAcquiredMesh(mesh,budget){
 for(const vertex of mesh.vertices){budget.check();Object.freeze(vertex);}
 for(const triangle of mesh.triangles){budget.check();Object.freeze(triangle);}
 budget.check();
 Object.freeze(mesh.vertices);Object.freeze(mesh.triangles);Object.freeze(mesh.origin);Object.freeze(mesh.step);
 return Object.freeze(mesh);
}
/** Actual factory identity is required; a copied domain/mesh cannot acquire
 * support provenance. The original domain acquisition already charges every
 * retained native vertex. A direct borrow charges it once to a fresh budget. */
export function readAcquiredNativeSupport(domain,{budget=createTerrainBudget({kind:'measure'})}={}){
 budget.check();
 const entry=acquiredSupports.get(domain);
 if(entry){
  const {value,chargedBudgets}=entry;
  if(!Object.isFrozen(domain)||domain.modelHash!==value.modelHash||domain.crs!==value.crs||value.mesh.crs!==value.crs||!Object.isFrozen(value)||!Object.isFrozen(value.mesh)||!Object.isFrozen(value.mesh.vertices)||!Object.isFrozen(value.mesh.triangles)||!Object.isFrozen(value.mesh.origin)||!Object.isFrozen(value.mesh.step))throw error('domain-support-unresolved','Acquired native support identity changed');
  if(!chargedBudgets.has(budget)){budget.check(value.mesh.vertices.length);chargedBudgets.add(budget);}
  return value;
 }
 let canonical;
 try{canonical=canonicalCutDomainScope(domain);}
 catch(cause){throw error('domain-support-unresolved',cause.message);}
 budget.check();
 const parent=canonical?.acquiredSupportParent;
 if(!parent||domain.modelHash!==canonical.operands.modelHash||domain.crs!==canonical.operands.crs||domain.modelHash!==parent.modelHash||domain.crs!==parent.crs)throw error('domain-support-unresolved','Actual acquired native support identity is missing');
 return readAcquiredNativeSupport(parent,{budget});
}
function sharedAcquiredSupport(model,budget){
 let entry=meshSupports.get(model);
 const modelHash=model.contentHash;
 if(entry?.value.modelHash!==modelHash)entry=null;
 if(!entry){
  const mesh=getTerrainMesh(model);
  entry={value:Object.freeze({modelHash,crs:mesh.crs,mesh:freezeAcquiredMesh(mesh,budget)}),chargedBudgets:new WeakSet()};
  meshSupports.set(model,entry);
 }
 if(entry.value.modelHash!==modelHash)throw error('domain-support-unresolved','Native mesh identity mismatch');
 if(!entry.chargedBudgets.has(budget)){budget.check(entry.value.mesh.vertices.length);entry.chargedBudgets.add(budget);}
 return entry;
}
function normalizeGeometry(geometry,retain){
 const source=geometry?.type==='Feature'?geometry.geometry:geometry;
 if(!source||!['Polygon','MultiPolygon'].includes(source.type))throw error('invalid-input','Regione del terreno non valida.');
 const multi=source.type==='Polygon'?[source.coordinates]:source.coordinates;
 if(!Array.isArray(multi)||!multi.length)throw error('invalid-input','Regione del terreno vuota.');
 for(const rings of multi){
  if(!Array.isArray(rings)||!rings.length)throw error('invalid-input','Poligono del terreno vuoto.');
  for(const ring of rings){
   if(!Array.isArray(ring)||ring.length<4||!ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw error('invalid-input','Anello del terreno non valido.');
   retain(ring.length);
  }
 }
 return structuredClone(source);
}
// Native neighbors are computed from cell topology, including faces absent from
// the clip. Null means the raster's edge, not the cultivable region's boundary.
function nativeNeighbors(id,width,height){
 const cell=Math.floor(id/2),col=cell%(width-1),row=Math.floor(cell/(width-1));
 return id%2===0?[row>0?id-2*(width-1)+1:null,id+1,col>0?id-1:null]:[col<width-2?id+1:null,row<height-2?id+2*(width-1)-1:null,id-1];
}
function spatialIndex(faces,grid,byId){
 const cells=new Map();
 for(const f of faces){const cell=Math.floor(f.id/2);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(f.id);}
 return Object.freeze({query(bounds){
  if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]>bounds[2]||bounds[1]>bounds[3])throw new RangeError('Bounds XY non validi.');
  const loX=Math.max(0,Math.floor((bounds[0]-grid.origin[0])/grid.step[0])-1),hiX=Math.min(grid.width-2,Math.floor((bounds[2]-grid.origin[0])/grid.step[0]));
  const loY=Math.max(0,Math.floor((bounds[3]-grid.origin[1])/grid.step[1])-1),hiY=Math.min(grid.height-2,Math.floor((bounds[1]-grid.origin[1])/grid.step[1]));
  const ids=[];for(let row=loY;row<=hiY;row++)for(let col=loX;col<=hiX;col++)for(const id of cells.get(row*(grid.width-1)+col)??[])if(overlap(byId.get(id).bounds,bounds))ids.push(id);
  return ids.sort((a,b)=>a-b);
 }});
}
function elevationIndex(faces){
 // Pruning uses exact native binary vertex extrema, not rounded affine clip
 // extrema. Candidates can lie outside the clipped region; Task3 proves hits.
 const sorted=faces.map(face=>({id:face.id,minM:Math.min(...face.vertices.map(p=>p[2])),maxM:Math.max(...face.vertices.map(p=>p[2]))})).sort((a,b)=>a.minM-b.minM||a.id-b.id);
 const build=(lo,hi)=>{if(lo>=hi)return null;const mid=(lo+hi)>>1,left=build(lo,mid),right=build(mid+1,hi),face=sorted[mid];return {face,left,right,max:Math.max(face.maxM,left?.max??-Infinity,right?.max??-Infinity)};};
 const root=build(0,sorted.length);
 return Object.freeze({query(levelM){
  if(!Number.isFinite(levelM))throw new RangeError('Quota non valida.');
  const ids=[],visit=node=>{if(!node||node.max<levelM)return;visit(node.left);if(node.face.minM<=levelM){if(node.face.maxM>=levelM)ids.push(node.face.id);visit(node.right);}};visit(root);return ids.sort((a,b)=>a-b);
 }});
}
/**
 * Index a real Polygon/MultiPolygon (WGS84, holes retained) on native triangles.
 * Faces are positive-area clips only: id is the original triangle index;
 * vertexIds/edgeIds/neighbors follow its three oriented edges. Edge ids are the
 * sorted vertex pair "min:max". Neighbors remain native ids even if outside
 * this region; only a raster edge has null. vertices retain raw native XYZ for
 * later numerical proofs; plane={origin:XYZ,gradient:[dz/dx,dz/dy]} uses relative
 * metres. clipped is a MultiPolygon of absolute model XY, not row fragments.
 * boundaries contain ONLY real region rings, with stable polygon/ring ids and
 * hole flags; missing coverage throws uncovered rather than creating a boundary.
 * faceById.get/has retrieve native ids. spatialIndex.query([x0,y0,x1,y1]) and
 * elevationIndex.query(levelM) return sorted native ids (inclusive candidates).
 * Elevation pruning uses exact raw native vertex min/max, so a returned face
 * still requires intersection with its clip; affine extrema are summary only.
 * Cache entries are immutable and bounded by four entries/500000 created nodes.
 * Every hit charges its retained node count to the caller's cumulative budget.
 * @returns {import('./terrain-contour-contracts.js?v=1.3.7').ContourDomain}
 */
export function createContourDomain({model,geometry,budget=createTerrainBudget({kind:'measure'})}={}){
 budget.check();
 if(model?.grid?.width*model?.grid?.height>MAX_TERRAIN_CELLS)throw error('budget-exceeded','Limite celle native superato.');
 const valid=validateTerrainModel(model);
 if(!valid.valid)throw error(valid.code==='budget'?'budget-exceeded':'invalid-model',valid.errors.join('; '));
 let nodeCount=0;
 const retain=n=>{nodeCount+=n;budget.check(n);};
 const canonical=normalizeGeometry(geometry,retain),key=terrainInputHash({modelHash:model.contentHash,geometry:canonical});
 if(cache.has(key)){
  const hit=cache.get(key);budget.check(hit.nodeCount);readAcquiredNativeSupport(hit,{budget});cache.delete(key);cache.set(key,hit);return hit;
 }
 budget.phase('domain');
 const support=sharedAcquiredSupport(model,budget),mesh=support.value.mesh,epsg=Number(model.crs.split(':')[1]),origin=mesh.origin;
 const absolute=canonical.type==='Polygon'?[canonical.coordinates]:canonical.coordinates;
 const region=absolute.map(rings=>rings.map(ring=>ring.map(point=>{
  retain(1);const xy=toUTM(point,epsg).map((v,i)=>v-origin[i]);
  if(xy[0]<0||xy[0]>(mesh.width-1)*mesh.step[0]||xy[1]>0||xy[1]<(mesh.height-1)*mesh.step[1])throw error('uncovered','Regione fuori copertura terreno.');
  return xy;
 })));
 const regionBounds=boundsOf(region.flat(2)),absoluteRegionBounds=regionBounds.map((value,i)=>value+origin[i%2]),faces=[],byId=new Map(),areaTerms=[];
 const clipExact=createExactNativeClipper(region.map(p=>p.map(r=>r.map(v=>{budget.check(1);return [v[0]+origin[0],v[1]+origin[1]];}))),budget);
 let minM=Infinity,maxM=-Infinity,maxSlopePercent=0,areaM2=0,surfaceAreaM2=0;
 // Restrict native cell candidates before creating per-face XY arrays. One
 // extra cell includes every boundary/ULP tie; exact clipping still decides.
 const loCol=Math.max(0,Math.floor(regionBounds[0]/mesh.step[0])-1),hiCol=Math.min(mesh.width-2,Math.floor(regionBounds[2]/mesh.step[0])+1);
 const loRow=Math.max(0,Math.floor(regionBounds[3]/mesh.step[1])-1),hiRow=Math.min(mesh.height-2,Math.floor(regionBounds[1]/mesh.step[1])+1);
 for(let row=loRow;row<=hiRow;row++)for(let col=loCol;col<=hiCol;col++)for(let half=0;half<2;half++){
  const id=2*(row*(mesh.width-1)+col)+half;
  budget.check();const vertexIds=mesh.triangles[id],vertices=vertexIds.map(i=>mesh.vertices[i]);
  if(!overlap(boundsOf(vertices),absoluteRegionBounds))continue;
  const exact=clipExact({id,vertexIds,vertices});
  if(!exact)continue;
  retain(1);areaTerms.push(Object.freeze([Object.freeze(exact.exactArea),Object.freeze(exact.surfaceFactorSquared)]));
  // The exact classifier already proved the whole native triangle interior.
  // Reusing its three raw XY coordinates avoids an unnecessary polygon Boolean
  // plus two copies of every presentation vertex on the common interior case.
  let pieces=null;
  if(!exact.wholeNativeTriangle){budget.check(3);const xy=vertices.map(p=>[p[0]-origin[0],p[1]-origin[1]]);pieces=clipping.intersection(region,[[...xy,xy[0]]]).filter(rings=>multiArea([rings])>0);}
  const [a,b,c]=vertices,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],det=ux*vy-uy*vx;
  const gradient=[(uz*vy-uy*vz)/det,(ux*vz-uz*vx)/det],plane={origin:a,gradient};
  let clipped;
  if(exact.wholeNativeTriangle){const ring=vertices.map(p=>{retain(1);return [p[0],p[1]];});if(det<0)ring.reverse();clipped=[[[...ring,ring[0]]]];}
  else clipped=pieces.length?pieces.map(rings=>rings.map(ring=>ring.map(p=>{
   retain(2);return [p[0]+origin[0],p[1]+origin[1]];
  }))):exact.fallback();
  // The helper already charged creation; record retained fallback points for
  // subsequent cache users without charging this operation twice.
  if(pieces&&!pieces.length)nodeCount+=clipped.flat(2).length;
  const area=exact.areaM2,surface=exact.surfaceAreaM2;
  const face=freeze({id,vertexIds,vertices,edgeIds:vertexIds.map((v,i)=>[v,vertexIds[(i+1)%3]].sort((a,b)=>a-b).join(':')),neighbors:nativeNeighbors(id,mesh.width,mesh.height),plane,clipped,bounds:exact.bounds,minM:exact.minM,maxM:exact.maxM,areaM2:area,surfaceAreaM2:surface});
  faces.push(face);byId.set(id,face);minM=Math.min(minM,exact.minM);maxM=Math.max(maxM,exact.maxM);maxSlopePercent=Math.max(maxSlopePercent,exact.slopePercent);areaM2+=area;surfaceAreaM2+=surface;
 }
 if(!faces.length)throw error('invalid-input','Regione del terreno senza area coltivabile.');
 const boundaries=region.flatMap((rings,polygonIndex)=>rings.map((ring,ringIndex)=>({id:`region:${polygonIndex}:ring:${ringIndex}`,polygonIndex,ringIndex,hole:ringIndex>0,coordinatesXY:ring.map(p=>{retain(1);return [p[0]+origin[0],p[1]+origin[1]];})})));
 const faceById=Object.freeze({get:id=>byId.get(id),has:id=>byId.has(id)});
 const domain=Object.freeze({modelHash:model.contentHash,crs:model.crs,faces:Object.freeze(faces),boundaries:freeze(boundaries),faceById,spatialIndex:spatialIndex(faces,mesh,byId),elevationIndex:elevationIndex(faces),geometry:freeze(canonical),nodeCount,areaM2,surfaceAreaM2,minM,maxM,maxSlopePercent});
 budget.check();
 acquiredSupports.set(domain,support);nativeAreaTerms.set(domain,Object.freeze(areaTerms));
 while(cache.size&&(cache.size>=4||cachedNodes+nodeCount>TERRAIN_MAX_NODES)){const oldest=cache.keys().next().value;cachedNodes-=cache.get(oldest).nodeCount;cache.delete(oldest);}
 if(nodeCount<=TERRAIN_MAX_NODES){cache.set(key,domain);cachedNodes+=nodeCount;}
 return domain;
}

/** Only the actual frozen factory domain owns its exact native clip integrals. */
export function readExactNativeDomainAreaTerms(domain,budget){
 budget?.check();
 return Object.isFrozen(domain)?nativeAreaTerms.get(domain)??null:null;
}
