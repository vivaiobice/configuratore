import {createTerrainBudget} from './terrain-budget.js?v=1.3.5';
import {createRegularTerrainRegionOperations} from './terrain-surface-bands.js?v=1.3.5';
import {terrainInputHash} from './terrain-model.js?v=1.3.5';

const fail=detail=>Object.assign(new Error(`Invalid surface group: ${detail}`),{status:'invalid-surface-group',detail});
const proofs=new WeakMap();
const presentationProofs=new WeakMap();
const marked=item=>item&&!Array.isArray(item)&&Object.hasOwn(item,'surfaceGroupVersion');
const geometryOf=field=>Array.isArray(field)?{type:'Polygon',coordinates:[field]}:field;
const groupKeys=['surfaceGroupOwner','surfaceGeometry','surfaceGeometryConvention','surfaceConstructionPolicy','scopeGeometry','scopePortionId','sourceAxis','widthM','widthBasis','modelHash'];
export const terrainSurfaceGroupMarkerPresent=item=>!!item&&!Array.isArray(item)&&['surfaceGroupVersion',...groupKeys.slice(0,4)].some(key=>Object.hasOwn(item,key));
export const terrainSurfaceGroupsPresent=exclusions=>(exclusions??[]).some(terrainSurfaceGroupMarkerPresent);

/** Validate construction union before any physical effect. Native consumers
 * use owner operands; no projected-member equality is asserted here. */
export function resolveTerrainExclusionGroups({exclusions=[],field,budget=createTerrainBudget({kind:'cut'})}={}) {
  try{
    budget.check();
    const operations=createRegularTerrainRegionOperations({budget});
    const groups=new Map(),legacy=[];
    for(const item of exclusions){
      budget.check();
      if(!marked(item)){
        if(item&&!Array.isArray(item)&&groupKeys.slice(0,4).some(key=>Object.hasOwn(item,key)))throw fail('missing-group-version');
        legacy.push(item);continue;
      }
      if(item.surfaceGroupVersion!==1||typeof item.passageGroupId!=='string'||!item.passageGroupId)throw fail('unsupported-group-version-or-id');
      if(!groups.has(item.passageGroupId))groups.set(item.passageGroupId,[]);
      groups.get(item.passageGroupId).push(item);
    }
    const resolved=[];
    for(const [groupId,members] of groups){
      if(exclusions.some(item=>!marked(item)&&item?.passageGroupId===groupId))throw fail('unmarked-group-member');
      const owners=members.filter(item=>item.surfaceGroupOwner===true);
      if(owners.length!==1)throw fail('missing-or-duplicate-owner');
      const owner=owners[0];
      if(!['literal','domain-intersection'].includes(owner.surfaceGeometryConvention))throw fail('unsupported-geometry-convention');
      if(owner.surfaceGeometryConvention==='domain-intersection'){
        if(owner.surfaceConstructionPolicy!=='native-supported-axis-clip-1'||owner.widthBasis!=='model-surface'||!(owner.widthM>0)||!Number.isFinite(owner.widthM)||typeof owner.modelHash!=='string'||!owner.modelHash||typeof owner.scopePortionId!=='string'||!owner.scopePortionId||!owner.scopeGeometry||!Array.isArray(owner.sourceAxis)||owner.sourceAxis.length!==2||owner.sourceAxis.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw fail('missing-or-unsupported-construction-binding');
      }else if(['surfaceConstructionPolicy','scopeGeometry','scopePortionId','sourceAxis','widthBasis','modelHash'].some(key=>Object.hasOwn(owner,key))||owner.widthM!=null)throw fail('literal-retains-construction-certificate');
      const canonical=operations.read(owner.surfaceGeometry,`group:${groupId}`);
      if(!canonical.length)throw fail('empty-canonical-geometry');
      let union=[];
      for(const member of members){
        if(member!==owner&&groupKeys.some(key=>Object.hasOwn(member,key)))throw fail('duplicated-owner-metadata');
        const part=operations.read({type:'Polygon',coordinates:[member.geometry]});
        if(operations.hasInterior(operations.operation(union,part)))throw fail('overlapping-member-interiors');
        union=operations.operation(union,part,'union');
      }
      if(!operations.sameSet(union,canonical))throw fail('stale-construction-union');
      let effective=canonical;
      if(owner.surfaceGeometryConvention==='domain-intersection')effective=operations.operation(effective,operations.read(owner.scopeGeometry,`scope:${groupId}`));
      if(field)effective=operations.operation(effective,operations.read(geometryOf(field),'field'));
      const group={groupId,ownerId:owner.id,owner,members,expressionHash:terrainInputHash({owner,members,field:field??null})};
      proofs.set(group,{operations,effective});resolved.push(group);
    }
    const result={groups:resolved,legacy};
    proofs.set(result,{groups:resolved,exclusions,field,fingerprint:JSON.stringify({exclusions,field})});
    return result;
  }catch(error){
    if(error.status==='budget-exceeded'||error.status==='invalid-surface-group')throw error;
    throw fail(error.detail??error.message);
  }
}

export function terrainExclusionContains(resolved,point){
  const current=proofs.get(resolved);
  if(!current||current.fingerprint!==JSON.stringify({exclusions:current.exclusions,field:current.field}))throw fail('unverified-or-changed-group-resolution');
  return resolved.groups.some(group=>{
    const proof=proofs.get(group);
    return proof.operations.contains(proof.effective,point);
  });
}

/** Presentation-only effective geometry, never native metric/width authority.
 * Exact boundaries retain source ancestry. The actual finite geographic preview
 * must pass the bounded boundary-isotopy proof; it never becomes metric authority. */
export function resolveTerrainExclusionPresentation(options={}){
  const resolved=resolveTerrainExclusionGroups(options);
  return resolved.groups.map(group=>{
    const proof=proofs.get(group),ancestry=proof.operations.provenance(proof.effective),geometry=proof.operations.serializeTopology(proof.effective);
    const view={groupId:group.groupId,ownerId:group.ownerId,geometry,coordinateRole:'render-export-preview',expressionHash:group.expressionHash};
    presentationProofs.set(view,{fingerprint:JSON.stringify(view),options,operandsFingerprint:JSON.stringify({exclusions:options.exclusions,field:options.field}),expressionHash:group.expressionHash,ancestry});
    return view;
  }).filter(view=>view.geometry.coordinates.length);
}

export function terrainExclusionPresentationVerified(view){
  const proof=presentationProofs.get(view);
  return !!proof&&proof.fingerprint===JSON.stringify(view)&&proof.operandsFingerprint===JSON.stringify({exclusions:proof.options.exclusions,field:proof.options.field});
}

/** Geographic layout preview of the strict current physical remainder. Native
 * quantities reconstruct the canonical owner operands instead of this DTO. */
export function resolveTerrainUsablePresentation(options={}){
 const budget=options.budget??createTerrainBudget({kind:'cut'}),resolved=resolveTerrainExclusionGroups({...options,budget});
 if(!options.field)throw fail('usable-field-required');
 const operations=resolved.groups.length?proofs.get(resolved.groups[0]).operations:createRegularTerrainRegionOperations({budget});
 let region=operations.read(geometryOf(options.field),'usable-field');
 for(const group of resolved.groups)region=operations.operation(region,proofs.get(group).effective,'difference');
 for(const [index,item] of resolved.legacy.entries()){
  const ring=Array.isArray(item)?item:item?.geometry;
  region=operations.operation(region,operations.read({type:'Polygon',coordinates:[ring]},`legacy:${item?.id??index}`),'difference');
 }
 const ancestry=operations.provenance(region),geometry=operations.serializeTopology(region);
 const view={geometry,coordinateRole:'render-export-preview',expressionHash:terrainInputHash({exclusions:options.exclusions,field:options.field})};
 presentationProofs.set(view,{fingerprint:JSON.stringify(view),options,operandsFingerprint:JSON.stringify({exclusions:options.exclusions,field:options.field}),ancestry,usable:{operations,region,budget}});
 return view;
}

/** Rank actual expression components against saved f64 scopes. The caller gets
 * indices only; neither exact regions nor arbitrary registration is exposed. */
export function rankTerrainUsablePortionOverlaps(view,savedPortions,{budget}={}){
 const proof=presentationProofs.get(view),usable=proof?.usable;
 if(!usable||!terrainExclusionPresentationVerified(view)||budget&&budget!==usable.budget)throw fail('unverified-or-changed-usable-resolution');
 const {operations,region}=usable,componentCount=view.geometry.coordinates.length;
 const saved=savedPortions.map(portion=>operations.read({type:'Polygon',coordinates:portion.geometry}));
 const pairs=[];
 for(let i=0;i<componentCount;i++){
  usable.budget.check();const exactComponent=region.filter(ring=>ring.polygonIndex===i);
  for(let j=0;j<saved.length;j++){
   const score=operations.operation(exactComponent,saved[j]);
   if(operations.hasInterior(score))pairs.push({i,j,score});
  }
 }
 pairs.sort((a,b)=>operations.compareAreas(b.score,a.score)||savedPortions[a.j].id.localeCompare(savedPortions[b.j].id)||a.i-b.i);
 usable.budget.check(pairs.length);
 return Object.freeze(pairs.map(({i,j})=>Object.freeze({i,j})));
}
