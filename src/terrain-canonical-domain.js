import {toUTM} from './coordinate-system.js?v=1.3.6';
import {terrainInputHash} from './terrain-model.js?v=1.3.6';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {TERRAIN_EXCLUSION_GEOMETRY_KEYS} from './terrain-contour-contracts.js?v=1.3.6';
import {createExactNativeClipper} from './terrain-native-clipping.js?v=1.3.6';
import {createRegularTerrainRegionOperations} from './terrain-surface-bands.js?v=1.3.6';
import {resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.6';
import {createContourDomain,readAcquiredNativeSupport} from './terrain-contour-domain.js?v=1.3.6';
import {resolveRowPortions} from './row-portions.js?v=1.3.6';

// A single queried URL is used by every parent module, including bare imports.
// Only the owner-derived factories below register exact child authority.
const canonicalScopes=new WeakMap();
const error=(status,message)=>Object.assign(new Error(message),{status});
const overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function coordinateNodes(value){
 if(Array.isArray(value))return value.length>=2&&value.length<=3&&value.every(Number.isFinite)?1:value.reduce((sum,item)=>sum+coordinateNodes(item),0);
 return value&&typeof value==='object'?Object.values(value).reduce((sum,item)=>sum+coordinateNodes(item),0):0;
}
export function canonicalCutDomainScope(domain){
 const scope=canonicalScopes.get(domain);
 if(!scope){if(Object.hasOwn(domain??{},'canonicalScopeRecipe'))throw error('cut-scope-unresolved','Canonical child domain identity is missing');return null;}
 if(!Object.isFrozen(domain)||!Object.isFrozen(domain.geometry)||!Object.isFrozen(domain.faces)||terrainInputHash(domain.canonicalScopeRecipe)!==terrainInputHash(scope.recipe)||scope.scopeHash!==terrainInputHash({recipe:scope.recipe,operands:scope.operands}))throw error('cut-scope-unresolved','Canonical child authority changed');
 const owner=scope.operands.exclusions.find(item=>item?.surfaceGroupOwner===true&&item.passageGroupId===scope.recipe.groupId);
 const source=owner?.scopeGeometry??scope.operands.sourceScope?.geometry;
 if(!source||scope.sourceScopeGeometry!==source)throw error('cut-scope-unresolved','Original canonical source scope binding changed');
 return scope;
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
const scopeFailure=detail=>error('cut-scope-unresolved',detail);
const edgeIdentity=e=>`${e.operandId}:${e.polygonIndex}:${e.ringIndex}:${e.edgeIndex}`;
function pairedComponentRecords(operations,rings){
 const evidence=operations.provenance(rings),exact=operations.exactBoundaries(rings),records=[];
 for(const ring of exact){
  const proof=evidence.find(p=>p.polygonIndex===ring.polygonIndex&&p.ringIndex===ring.ringIndex);
  const tokens=proof.edges.map((edge,i)=>JSON.stringify([
   edge.sources.map(edgeIdentity).sort(),proof.vertices[i].incidentEdges.map(edgeIdentity).sort(),
   proof.vertices[(i+1)%proof.vertices.length].incidentEdges.map(edgeIdentity).sort()
  ]));
  let rotation=0;
  for(let i=1;i<tokens.length;i++)if(JSON.stringify([...tokens.slice(i),...tokens.slice(0,i)])<JSON.stringify([...tokens.slice(rotation),...tokens.slice(0,rotation)]))rotation=i;
  const rotate=xs=>[...xs.slice(rotation),...xs.slice(0,rotation)];
  const coordinates=rotate(ring.coordinates.slice(0,-1));coordinates.push(coordinates[0]);
  records.push({polygonIndex:ring.polygonIndex,ringIndex:ring.ringIndex,coordinates,
   signature:JSON.stringify(rotate(tokens)),edges:rotate(proof.edges),vertices:rotate(proof.vertices)});
 }
 return records.filter(r=>!r.ringIndex).map(outer=>{
  const holes=records.filter(r=>r.polygonIndex===outer.polygonIndex&&r.ringIndex).sort((a,b)=>a.signature.localeCompare(b.signature));
  return {key:terrainInputHash([outer.signature,...holes.map(h=>h.signature)]),rings:[outer,...holes].map((ring,ringIndex)=>({...ring,polygonIndex:0,ringIndex}))};
 });
}
function childDomain({parent,model,native,geographic,scopeHash,recipe,operands,budget}){
 budget.check(geographic.reduce((sum,ring)=>sum+ring.coordinates.length,0));
 const geometry={type:'Polygon',coordinates:geographic.map(r=>r.coordinates.map(p=>p.map(q=>Number(q.n)/Number(q.d))))};
 const clip=createExactNativeClipper([native.map(r=>r.coordinates)],budget),faces=[],byId=new Map();
 let areaM2=0,surfaceAreaM2=0,minM=Infinity,maxM=-Infinity,maxSlopePercent=0,nodeCount=0;
 for(const source of parent.faces){
  budget.check();const measured=clip(source);if(!measured)continue;
  const fallback=measured.fallback();
  const face=freeze({...source,clipped:fallback,bounds:measured.bounds,minM:measured.minM,maxM:measured.maxM,areaM2:measured.areaM2,surfaceAreaM2:measured.surfaceAreaM2});
  faces.push(face);byId.set(face.id,face);areaM2+=face.areaM2;surfaceAreaM2+=face.surfaceAreaM2;
  minM=Math.min(minM,face.minM);maxM=Math.max(maxM,face.maxM);maxSlopePercent=Math.max(maxSlopePercent,measured.slopePercent);
  nodeCount+=fallback.flat(2).length;
 }
 if(!faces.length)throw scopeFailure('Empty native child domain');
 const boundaries=native.map((ring,ringIndex)=>({id:`canonical:${recipe.componentKey??`${recipe.groupId}:physical`}:${ringIndex}`,polygonIndex:0,ringIndex,hole:ringIndex>0,
  coordinatesXY:ring.coordinates.map(p=>{budget.check(1);nodeCount++;return p.map(q=>Number(q.n)/Number(q.d));})}));
 const mesh=readAcquiredNativeSupport(parent,{budget}).mesh;
 const domain=Object.freeze({modelHash:model.contentHash,crs:model.crs,faces:Object.freeze(faces),boundaries:freeze(boundaries),
  faceById:Object.freeze({get:id=>byId.get(id),has:id=>byId.has(id)}),spatialIndex:spatialIndex(faces,mesh,byId),elevationIndex:elevationIndex(faces),
  geometry:freeze(geometry),canonicalScopeRecipe:freeze(structuredClone(recipe)),nodeCount,areaM2,surfaceAreaM2,minM,maxM,maxSlopePercent});
 const exactBoundaries=native.map((ring,ringIndex)=>({id:boundaries[ringIndex].id,polygonIndex:0,ringIndex,hole:ringIndex>0,coordinates:ring.coordinates}));
 const owner=operands.exclusions.find(item=>item?.surfaceGroupOwner===true&&item.passageGroupId===recipe.groupId);
 const sourceScopeGeometry=owner?.scopeGeometry??operands.sourceScope?.geometry;
 if(!sourceScopeGeometry)throw scopeFailure('Original saved source scope is missing');
 canonicalScopes.set(domain,freeze({scopeHash,recipe:structuredClone(recipe),operands,sourceScopeGeometry,boundaries:exactBoundaries,geographicBoundaries:geographic,acquiredSupportParent:parent}));
 return domain;
}

/** Reconstruct first-generation canonical children from saved actual operands.
 * Native and geographic arrangements retain independent intersection values;
 * paired ancestry, not anchors/areas/counts, establishes correspondence. */
function physicalInterpretation({field,scopeGeometry,resolved,target,model,native,budget}){
 const epsg=Number(model.crs.split(':')[1]);
 const projectGeometry=geometry=>{
  budget.check(coordinateNodes(geometry));
  return {type:geometry.type,coordinates:geometry.type==='Polygon'?geometry.coordinates.map(r=>r.map(p=>toUTM(p,epsg))):geometry.coordinates.map(p=>p.map(r=>r.map(v=>toUTM(v,epsg))))};
 };
  const op=createRegularTerrainRegionOperations({budget});
  const read=(geometry,id)=>op.read(native?projectGeometry(geometry):geometry,id);
  let physical=op.operation(read(scopeGeometry,'scope'),read({type:'Polygon',coordinates:[field]},'field'));
  for(const [index,item] of resolved.legacy.entries()){
   const ring=Array.isArray(item)?item:item?.geometry;
   if(!ring)throw scopeFailure('Malformed existing exclusion');
   physical=op.operation(physical,read({type:'Polygon',coordinates:[ring]},`legacy:${item?.id??index}`),'difference');
  }
  for(const group of resolved.groups){
   if(group===target)continue;
   let other=read(group.owner.surfaceGeometry,`group:${group.groupId}`);
   if(group.owner.surfaceGeometryConvention==='domain-intersection')other=op.operation(other,read(group.owner.scopeGeometry,`group-scope:${group.groupId}`));
   physical=op.operation(physical,other,'difference');
  }
  return {op,physical,read,projectGeometry,physicalComponents:pairedComponentRecords(op,physical)};
}
function immutableOperands(project,model,field,budget,sourceScope){
 const selected=item=>Array.isArray(item)?{geometry:item}:Object.fromEntries(TERRAIN_EXCLUSION_GEOMETRY_KEYS.filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]]));
 const actual={field,exclusions:(project.exclusions??[]).map(selected),modelHash:model.contentHash,crs:model.crs,...(sourceScope?{sourceScope}:{})};
 budget.check(coordinateNodes(actual));return freeze(structuredClone(actual));
}
function pairedPhysical(native,geographic){
 if(native.physicalComponents.length!==1||geographic.physicalComponents.length!==1||native.physicalComponents[0].key!==geographic.physicalComponents[0].key)throw scopeFailure('Pre-road source is not one paired physical component');
 return [native.physicalComponents[0].rings,geographic.physicalComponents[0].rings];
}

/** Source operands are resolved here, never supplied as a caller scope token. */
export function createCanonicalCutPhysicalDomain({project,model,scopePortionId,groupId=null,budget=createTerrainBudget({kind:'cut'})}={}){
 budget.check();
 if(typeof scopePortionId!=='string'||!scopePortionId)throw scopeFailure('Original source identity is required');
 const field=project.polygon??project.geometry,resolved=resolveTerrainExclusionGroups({exclusions:project.exclusions,field,budget});
 const target=resolved.groups.find(group=>group.groupId===groupId),saved=(project.rowPortions??[]).filter(portion=>portion.id===scopePortionId);
 if(!target&&groupId&&(project.exclusions??[]).some(item=>item?.passageGroupId===groupId))throw scopeFailure('Existing legacy passage cannot become a certified replacement');
 if(saved.length>1)throw scopeFailure('Ambiguous original source identity');
 let scopeGeometry,sourceScope;
 if(target){
  if(target.owner.surfaceGeometryConvention!=='domain-intersection'||target.owner.modelHash!==model.contentHash||scopePortionId!==target.owner.scopePortionId&&saved[0]?.terrainScopeRecipe?.groupId!==groupId)throw scopeFailure('Original owner source binding mismatch');
  let originalSource;
  for(const portion of project.rowPortions??[]){
   budget.check();
   if(portion.id!==target.owner.scopePortionId)continue;
   if(originalSource)throw scopeFailure('Ambiguous original owner source identity');
   originalSource=portion;
  }
  if(originalSource&&Object.hasOwn(originalSource,'terrainScopeRecipe')){
   const recipe=originalSource.terrainScopeRecipe;
   if(recipe?.kind!=='canonical-cut-child-1'||recipe.groupId!==groupId||typeof recipe.componentKey!=='string'||!recipe.componentKey||Object.keys(recipe).some(key=>!['kind','groupId','componentKey'].includes(key)))throw scopeFailure('Nested or malformed original owner lineage is not supported');
  }
  scopeGeometry=target.owner.scopeGeometry;
 }else if(saved.length){
  if(Object.hasOwn(saved[0],'terrainScopeRecipe'))throw scopeFailure('Nested canonical lineage is not supported');
  scopeGeometry={type:'Polygon',coordinates:saved[0].geometry};
  sourceScope={scopePortionId,role:'saved-portion',geometry:scopeGeometry};
 }else{
  if(project.rowPortions?.length)throw scopeFailure('Original source is missing');
  const portions=resolveRowPortions({polygon:field,exclusions:project.exclusions,rowPortions:[],budget});
  if(portions.length!==1||portions[0].id!==scopePortionId)throw scopeFailure('Original field fallback is not uniquely selected');
  scopeGeometry={type:'Polygon',coordinates:[field]};
  sourceScope={scopePortionId,role:'field',geometry:scopeGeometry};
 }
 const native=physicalInterpretation({field,scopeGeometry,resolved,target,model,native:true,budget}),geographic=physicalInterpretation({field,scopeGeometry,resolved,target,model,native:false,budget});
 const [nativeRings,geographicRings]=pairedPhysical(native,geographic),operands=immutableOperands(project,model,field,budget,sourceScope);
 const recipe={kind:'canonical-cut-physical-1',groupId:target?.groupId??null,scopePortionId:target?.owner.scopePortionId??scopePortionId};
 const parent=createContourDomain({model,geometry:{type:'Polygon',coordinates:[field]},budget});
 return childDomain({parent,model,native:nativeRings,geographic:geographicRings,scopeHash:terrainInputHash({recipe,operands}),recipe,operands,budget});
}

export function deriveCanonicalCutScopes({project,model,groupId,budget=createTerrainBudget({kind:'cut'})}={}){
 budget.check();
 const field=project.polygon??project.geometry,resolved=resolveTerrainExclusionGroups({exclusions:project.exclusions,field,budget});
 const target=resolved.groups.find(g=>g.groupId===groupId);
 if(!target||target.owner.surfaceGeometryConvention!=='domain-intersection'||target.owner.modelHash!==model.contentHash)throw scopeFailure('Missing or incompatible canonical owner');
 const owner=target.owner,parentRecipe=project.rowPortions?.find(p=>p.id===owner.scopePortionId)?.terrainScopeRecipe;
 if(parentRecipe&&parentRecipe.groupId!==groupId)throw scopeFailure('Nested canonical lineage is not supported');
 const derive=native=>{
  const {op,physical,read,projectGeometry,physicalComponents}=physicalInterpretation({field,scopeGeometry:owner.scopeGeometry,resolved,target,model,native,budget});
  const stripGeometry=native?projectGeometry(owner.surfaceGeometry):owner.surfaceGeometry,strip=op.read(stripGeometry,'strip');
  const road=op.operation(physical,strip),remainder=op.operation(physical,strip,'difference');
  if(!op.sameSet(op.operation(road,remainder,'union'),physical)||op.hasInterior(op.operation(road,remainder)))throw scopeFailure('Canonical partition is unproved');
  return {op,physical,road,remainder,stripGeometry,components:pairedComponentRecords(op,remainder),physicalComponents};
 };
 const native=derive(true),geographic=derive(false);
 if(!native.components.length||native.components.length!==geographic.components.length)throw scopeFailure('Road has no paired positive remainder');
 pairedPhysical(native,geographic);
 const keys=new Set(native.components.map(c=>c.key));
 if(keys.size!==native.components.length||new Set(geographic.components.map(c=>c.key)).size!==keys.size||geographic.components.some(c=>!keys.has(c.key)))throw scopeFailure('Ambiguous or missing boundary correspondence');
 const parent=createContourDomain({model,geometry:{type:'Polygon',coordinates:[field]},budget});
 const operands=immutableOperands(project,model,field,budget);
 const children=native.components.map(component=>{
  const geo=geographic.components.find(c=>c.key===component.key);
  const recipe={kind:'canonical-cut-child-1',groupId,componentKey:component.key};
  const scopeHash=terrainInputHash({recipe,operands});
  const correspondence=component.rings.map((ring,index)=>({native:ring,geographic:geo.rings[index]}));
  if(correspondence.some(pair=>pair.native.signature!==pair.geographic.signature))throw scopeFailure('Unpaired boundary segmentation');
  return {componentKey:component.key,recipe,correspondence,
   domain:childDomain({parent,model,native:component.rings,geographic:geo.rings,scopeHash,recipe,operands,budget})};
 });
 const physicalRecipe={kind:'canonical-cut-physical-1',groupId};
 const physicalDomain=childDomain({parent,model,native:native.physicalComponents[0].rings,geographic:geographic.physicalComponents[0].rings,scopeHash:terrainInputHash({recipe:physicalRecipe,operands}),recipe:physicalRecipe,operands,budget});
 budget.check();
 return {groupId,owner,children,isSplit:children.length>=2,physicalDomain,nativeRawGeometryXY:freeze(native.stripGeometry),nativePhysicalBoundaries:native.op.exactBoundaries(native.physical),nativeRoadBoundaries:native.op.exactBoundaries(native.road),nativeRoadGeometryXY:native.op.preview(native.road)};
}

export function createCanonicalCutChildDomain({project,model,recipe,budget=createTerrainBudget({kind:'cut'})}={}){
 if(recipe?.kind!=='canonical-cut-child-1'||typeof recipe.groupId!=='string'||typeof recipe.componentKey!=='string'||!recipe.groupId||!recipe.componentKey||Object.keys(recipe).some(key=>!['kind','groupId','componentKey'].includes(key)))throw scopeFailure('Unknown canonical child recipe');
 const derived=deriveCanonicalCutScopes({project,model,groupId:recipe.groupId,budget});
 const child=derived.children.find(c=>c.componentKey===recipe.componentKey);
 if(!child)throw scopeFailure('Canonical component selector is stale');
 return child.domain;
}
