import {resolveTerrainExclusionPresentation,terrainExclusionPresentationVerified,terrainSurfaceGroupMarkerPresent,terrainSurfaceGroupsPresent} from './terrain-exclusion-groups.js?v=1.3.4';

function legacyFeature(item,index){
 const geometry=Array.isArray(item)?item:item?.geometry;
 if(!Array.isArray(geometry)||geometry.length<4)return null;
 return {type:'Feature',id:item?.id??index,properties:{label:item?.label??`Area esclusa ${index+1}`},geometry:{type:'Polygon',coordinates:[geometry]}};
}

/** Map-only effective previews. All physical/group validation stays central. */
export function mapTerrainExclusionFeatures({exclusions=[],field,budget}={}){
 const markedGroupIds=new Set(exclusions.filter(terrainSurfaceGroupMarkerPresent).map(item=>item.passageGroupId).filter(id=>id!=null));
 const legacy=exclusions.map((item,index)=>!terrainSurfaceGroupMarkerPresent(item)&&!markedGroupIds.has(item?.passageGroupId)?legacyFeature(item,index):null).filter(Boolean);
 const collection=features=>({type:'FeatureCollection',features});
 if(!terrainSurfaceGroupsPresent(exclusions))return {featureCollection:collection(legacy),status:'ready'};
 try{
  if(!field)throw Object.assign(new Error('Missing current field'),{status:'invalid-surface-group',detail:'render-field-required'});
  const views=resolveTerrainExclusionPresentation({exclusions,field,...(budget?{budget}:{})});
  const features=views.map(view=>{
   if(!terrainExclusionPresentationVerified(view))throw Object.assign(new Error('Unverified group preview'),{status:'invalid-surface-group',detail:'unverified-render-preview'});
   const index=exclusions.findIndex(item=>item?.passageGroupId===view.groupId&&item?.surfaceGroupOwner===true),owner=exclusions[index];
   return {type:'Feature',id:view.ownerId,properties:{label:owner?.label??`Area esclusa ${index+1}`,ownerId:view.ownerId,groupId:view.groupId,coordinateRole:view.coordinateRole,expressionHash:view.expressionHash},geometry:view.geometry};
  });
  return {featureCollection:collection([...legacy,...features]),status:'ready'};
 }catch(error){
  return {featureCollection:collection(legacy),status:error.status==='budget-exceeded'?'budget-exceeded':'invalid-surface-group',detail:error.detail??error.message};
 }
}
