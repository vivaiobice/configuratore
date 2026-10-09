import {sourceManualRows,manualAxes,manualStraightIntent,preserveFlatManualQuantities} from './terrain-manual-axes.js?v=1.3.4';
import {groundSpaceManualAxes} from './terrain-ground-spacing.js?v=1.3.4';
import {
  createTerrainBudget
}
from './terrain-budget.js?v=1.3.4';
import {
  exactDomain,
  Q,
  number,
  sign,
  cross,
  vsub,
  dot,
  add,
  mul,
  div,
  cmp,
  sqrtBounds
}
from './terrain-exact.js?v=1.3.4';
import {
  toUTM
}
from './coordinate-system.js?v=1.3.4';
import {
  buildContourFamily,
  measureContourAxes
}
from './terrain-contour-family.js?v=1.3.4';
import {
  createContourDomain,createCanonicalCutChildDomain,createCanonicalCutPhysicalDomain,deriveCanonicalCutScopes
}
from './terrain-contour-domain.js?v=1.3.4';
import {
  legacyTerrainInputs,
  terrainGeometryInputHash,
  readTerrainEnvelope,
  createContourEnvelope
}
from './terrain-replay.js?v=1.3.4';
import {
  validateTerrainModel,terrainInputHash
}
from './terrain-model.js?v=1.3.4';
import {
  resolveRowPortions
}
from './row-portions.js?v=1.3.4';
import {
  polygonMetrics,
  estimatePlantsFromRows,
  roundUpTo25
}
from './geometry.js?v=45';
import {
  calculateProject
}
from './project-calculator.js?v=1.3.4';
import {
  assertTerrainSerializationBudget
}
from './terrain-serialization.js?v=1.3.4';
import {
  certifyUniformPlaneSupport,
  measureSurfaceFootprint,
  measureSurfaceUnion,createRegularTerrainRegionOperations,sumMeasuredSurfaceAreas,compareMeasuredSurfaceAreas,measuredSurfaceAreasComparable
}
from './terrain-surface-bands.js?v=1.3.4';
import {buildTerrainPassage} from './terrain-passage.js?v=1.3.4';
import {resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.4';
import {SOURCE_DOMAIN_AXIS_CONVENTION} from './terrain-axis-geometry.js?v=1.3.4';
import {FINITE_POLYLINE_AXIS_CONVENTION} from './terrain-polyline-source.js?v=1.3.4';
import {canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.4';
import {measureDomainSurfaceArea} from './terrain-surface-bands.js?v=1.3.4';
import {validateCoordinate} from './coordinate-editor.js?v=1.3.4';
const failure=(status,message)=>Object.assign(new Error(message),{
  status
});
export {
  measureContourAxes
}
from './terrain-contour-family.js?v=1.3.4';
function geometryNodes(value) {
  if(Array.isArray(value)){
    if((value.length===2||value.length===3)&&value.every(Number.isFinite))return 1;
    return value.reduce((sum,item)=>sum+geometryNodes(item),0);
  }
  return value&&typeof value==='object'?Object.values(value).reduce((sum,item)=>sum+geometryNodes(item),0):0;
}
function totals(rows,postSpacingM,plantSpacingM) {
  const bases=new Set(rows.map(row=>row.quantityBasis??'legacy-planar'));
  const headPosts=postSpacingM>0?rows.length*2:0;
  const intermediatePosts=postSpacingM>0?rows.reduce((s,row)=>s+Math.max(0,Math.ceil(row.lengthM/postSpacingM)-1),0):0;
  return {
    rows,
    rowCount:rows.length,
    rowFragmentCount:rows.length,
    rowAxisCount:new Set(rows.map(row=>row.axisId)).size,
    rowLinearM:rows.reduce((s,r)=>s+r.lengthM,0),
    horizontalRowLinearM:rows.reduce((s,r)=>s+(r.horizontalLengthM??0),0),
    surfaceRowLinearM:rows.every(r=>Number.isFinite(r.surfaceLengthM))?rows.reduce((s,r)=>s+r.surfaceLengthM,0):null,
    quantityBasis:bases.size>1?'mixed-certified-bases':[...bases][0]??'model-surface',
    simulatedPlants:estimatePlantsFromRows(rows,plantSpacingM),
    headPosts,
    intermediatePosts,
    totalPosts:headPosts+intermediatePosts
  };
}
function areaOf(domain,budget) {
  return measureDomainSurfaceArea({domain,budget,areaMode:canonicalCutDomainScope(domain)?'coplanar-patches':'per-face'});
}

function headlandArea(original,physical,axes,width,budget) {
  if(!width)return {
    horizontal:0,
    surface:0
  };
  const unavailable={
    horizontal:null,
    surface:null,
    method:'unavailable-row-continuum-area'
  };
  if(!certifyUniformPlaneSupport(original,budget))return unavailable;
  const pieces=axes.flatMap(a=>a.components.flatMap(c=>c.coordinatesXY.slice(1).map((p,i)=>[c.coordinatesXY[i].map(Q),p.map(Q)])));
  const tangent=pieces.length?vsub(pieces[0][1],pieces[0][0]):null;
  if(!tangent||pieces.some(([a,b])=>sign(cross(tangent,vsub(b,a)))))return unavailable;
  const face=exactDomain(original,budget).faces[0],
  g=face.g.map(number);
  const rise=dot(face.g,tangent),
  norm=sqrtBounds(add(dot(tangent,tangent),mul(rise,rise)));
  if(cmp(norm[0],norm[1]))return unavailable;
  const exactDelta=tangent.map(v=>div(mul(Q(width),v),norm[0]));
  const delta=exactDelta.map(number);
  if(delta.some((v,i)=>cmp(Q(v),exactDelta[i])))return unavailable;
  budget.check(2);
  const geometriesXY=[];
  for(const boundary of original.boundaries){
    for(let i=1;i<boundary.coordinatesXY.length;i++){
      const a=boundary.coordinatesXY[i-1],
      b=boundary.coordinatesXY[i];
      if(!sign(cross(vsub(b.map(Q),a.map(Q)),tangent)))continue;
      const ring=[a.map((v,j)=>v-delta[j]),b.map((v,j)=>v-delta[j]),b.map((v,j)=>v+delta[j]),a.map((v,j)=>v+delta[j])];
      // The optional continuum is reported only if its constructed vertices are
      // the exact prescribed ground translation on the frozen binary plane.
      for(let q=0;q<4;q++)for(let j=0;j<2;j++){
        const tip=q===0||q===3?a:b,
        offset=q<2?-1:1;
        if(cmp(Q(ring[q][j]),add(Q(tip[j]),mul(Q(offset),exactDelta[j]))))return unavailable;
      }
      ring.push([...ring[0]]);
      budget.check(5);
      geometriesXY.push({
        type:'MultiPolygon',
        coordinates:[[ring]]
      });
    }
  }
  const area=measureSurfaceUnion({
    domain:physical,
    geometriesXY,
    areaMode:'constant-plane',
    budget
  });
  const factor=Math.hypot(1,...g);
  return {
    horizontal:area.areaM2/factor,
    surface:area.areaM2,
    method:'native-plane-boundary-sweep-union'
  };
}
/** Atomic field proposal. The legacy facade calls this only for the explicit
 * contour version; measurement starts from retained manual parameters. */
export function buildContourTerrainProposal({
  project,
  model,
  portionId=null,
  mode='adapt',
  recomputeAll=false,
  manualGroundSpacing=false,
  budget=createTerrainBudget({
    kind:mode==='measure'?'measure':'adapt'
  })
}={
}) {
  const diagnostics={
    portions:[]
  };
  try {
    budget.check();
    if(!project||!validateTerrainModel(model).valid)throw failure('invalid-model','Invalid frozen terrain model.');
    if(!['adapt','measure'].includes(mode))throw failure('invalid-input','Unknown contour proposal mode.');
    const input=legacyTerrainInputs(project),
    portions=resolveRowPortions({...input,budget});
    budget.check(geometryNodes(portions));
    if(!portions.length||!(input.rowSpacingM>0)||!(input.plantSpacingM>0)||portionId&&!portions.some(p=>p.id===portionId))throw failure('invalid-input','Invalid field, spacing or portion.');
    const previous=project.terrain?.applied;
    const local=previous?.schemaVersion===2&&previous.algorithmVersion==='terrain-contour-family-1'&&!!portionId&&!recomputeAll;
    if(local){
      if(project.terrain.model.contentHash!==model.contentHash)throw failure('review-required','The model changed; recompute the whole field.');
      const budgetedPrevious=previous.portionResults?.some(portion=>portion.design?.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION||portion.design?.groundSpacing);
      const saved=readTerrainEnvelope({
        ...previous.inputs,
        terrain:project.terrain
      },budgetedPrevious?{budget}:undefined);
      // Saved finite and ground-layout reconstructions precharge their returned
      // result copy. Historical reads retain their original caller charge.
      if(!budgetedPrevious)budget.check(geometryNodes(saved));
      if(saved?.terrainStatus!=='applied')throw failure('invalid-applied','Applied terrain integrity check failed.');
      const withoutTarget=value=>({
        ...value,
        rowPortions:(value.rowPortions??[]).filter(p=>p.id!==portionId)
      });
      if(terrainGeometryInputHash(withoutTarget(input),model)!==terrainGeometryInputHash(withoutTarget(previous.inputs),model))throw failure('review-required','Common inputs or another portion changed; recompute the whole field.');
    }
    const original=createContourDomain({
      model,
      geometry:{
        type:'Polygon',
        coordinates:[input.polygon]
      },
      budget
    });
    const gross=areaOf(original,budget),
    portionResults=[];
    const scoped=new Map();
    for(const portion of portions){
      const domain=Object.hasOwn(portion,'terrainScopeRecipe')?createCanonicalCutChildDomain({project:input,model,recipe:portion.terrainScopeRecipe,budget}):JSON.stringify(portion.geometry)===JSON.stringify([input.polygon])?original:
      createContourDomain({
        model,
        geometry:{
          type:'Polygon',
          coordinates:portion.geometry
        },
        budget
      });
      scoped.set(portion.id,{
        domain,
        area:areaOf(domain,budget)
      });
    }
    const referenceAreaM2=[...scoped.values()].reduce((s,p)=>s+p.area.areaM2,0);
    const legacy=calculateProject({
      ...input,
      terrain:null
    });
    budget.check(geometryNodes(legacy));
    const epsg=Number(model.crs.split(':')[1]);
    for(const portion of portions){
      if(local&&portion.id!==portionId){
        const saved=previous.portionResults.find(p=>p.id===portion.id);
        if(!saved)throw failure('review-required','Portion topology changed.');
        budget.check(geometryNodes(saved));
        portionResults.push(structuredClone(saved));
        continue;
      }
      const {
        domain,
        area
      }
      =scoped.get(portion.id);
      const manual=sourceManualRows(input,portion,budget),
      sourceAxes=manualAxes(input,portion,manual,epsg,budget);
      const adapt=mode==='adapt'&&(!portionId||portion.id===portionId);
      const previousGround=previous?.portionResults?.find(saved=>saved.id===portion.id)?.design?.groundSpacing;
      const ground=!adapt&&mode==='measure'&&(manualGroundSpacing===true||previousGround)?groundSpaceManualAxes({model,axes:sourceAxes,manualStraight:manualStraightIntent(portion),geometryXY:domain.geometryXY??{type:'MultiPolygon',coordinates:[...new Set(domain.boundaries.map(boundary=>boundary.polygonIndex))].map(id=>domain.boundaries.filter(boundary=>boundary.polygonIndex===id).map(boundary=>boundary.coordinatesXY))},rowSpacingM:input.rowSpacingM,portionId:portion.id,budget}):null;
      let axes=ground?.axes??sourceAxes,
      familyRows=null,
      coverage={
        servedAreaM2:null,
        referenceAreaM2,
        percent:null,
        basis:'surface-after-explicit-exclusions-before-headlands'
      },
      validation={
        valid:true,
        method:'manual-native-face-measurement',
        automaticSpacing:false,
        ...(ground?ground.validation:{})
      };
      if(adapt){
        const reference={
          orientationDeg:portion.orientationDeg,
          rowCurvePoints:portion.rowCurvePoints,
          maintainRowEquidistance:portion.maintainRowEquidistance,
          rows:manual,
          headlandWidthM:input.headlandWidthM,
          originalDomain:original
        };
        const family=buildContourFamily({
          domain,
          portion,
          reference,
          ...(!certifyUniformPlaneSupport(domain,budget)||!certifyUniformPlaneSupport(original,budget)?{candidateGeneration:{kind:'scoped-cut-1',axisGeometryConvention:FINITE_POLYLINE_AXIS_CONVENTION}}:{}),
          spacingM:input.rowSpacingM,
          budget,
          referenceAreaM2
        });
        diagnostics.portions.push({
          portionId:portion.id,
          ...family.diagnostics
        });
        if(!family.ok)throw Object.assign(failure(family.status,family.diagnostics?.message??'Non è stata trovata una disposizione verificabile per questa porzione.'),family.diagnostics?.budgetReason?{budgetReason:family.diagnostics.budgetReason,budgetPhase:family.diagnostics.budgetPhase,budgetUsage:family.diagnostics.budgetUsage}:{});
        axes=family.axes;
        familyRows=family.rows;
        coverage={
          ...family.coverage,
          basis:'surface-after-explicit-exclusions-before-headlands'
        };
        validation={
          ...family.validation,
          automaticSpacing:true
        };
      }
      const measured=familyRows?{
        rows:familyRows
      }
      :measureContourAxes({
        domain:original,
        physicalDomain:domain,
        axes,
        headlandWidthM:input.headlandWidthM??0,
        budget
      });
      let rows=measured.rows;
      const flat=exactDomain(domain,budget).faces.every(f=>!sign(f.q));
      if(!adapt&&flat&&!input.headlandWidthM){
        const expected=legacy.rows.filter(r=>r.portionId===portion.id||portions.length===1);
        rows=preserveFlatManualQuantities(rows,expected);
      }
      if(!rows.length)throw failure('review-required','No usable physical row fragments.');
      const heads=headlandArea(original,domain,axes,Math.max(0,input.headlandWidthM??0),budget);
      const design=adapt?{
        mode:'adapt',
        algorithmVersion:'terrain-contour-family-1',
        axes,
        ...(axes.some(axis=>axis.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION)?{
          axisGeometryConvention:FINITE_POLYLINE_AXIS_CONVENTION,
          axisScopeGeometry:scopedClone(domain.geometry,budget),
          ...(canonicalCutDomainScope(domain)?{axisScopeRecipe:scopedClone(canonicalCutDomainScope(domain).recipe,budget)}:{}),
          originalAxisScopeGeometry:scopedClone(original.geometry,budget),
          modelHash:model.contentHash,
          crs:domain.crs
        }:axes.some(axis=>axis.axisGeometryConvention===SOURCE_DOMAIN_AXIS_CONVENTION)?{
          axisGeometryConvention:SOURCE_DOMAIN_AXIS_CONVENTION,
          axisScopeGeometry:structuredClone(domain.geometry),
          ...(canonicalCutDomainScope(domain)?{axisScopeRecipe:structuredClone(canonicalCutDomainScope(domain).recipe)}:{}),
          originalAxisScopeGeometry:structuredClone(original.geometry),
          modelHash:model.contentHash,
          crs:domain.crs
        }:{}),
        ...(validation.method==='native-directional-shortest-spacing-1'?{spacingCertificateMethod:validation.method,serviceMethod:'native-directional-conservative-ribbon-1'}:{}),
        followTerrain:true
      }
      :
      {
        mode:'measure',
        orientationDeg:portion.orientationDeg,
        rowCurvePoints:structuredClone(portion.rowCurvePoints),
        maintainRowEquidistance:portion.maintainRowEquidistance,
        followTerrain:false,
        ...(ground?{groundSpacing:{algorithmVersion:'native-manual-ground-spacing-1',validation:ground.validation},axes,modelHash:model.contentHash,crs:model.crs,axisScopeGeometry:structuredClone(domain.geometry)}:{})
      };
      // Store compact proof summaries, not transient affine-event diagnostic trees.
      const summary={
        valid:true,
        method:validation.method,
        automaticSpacing:adapt,
        ...(adapt?{
          maxElevationDeviationM:validation.maxElevationDeviationM,
          minimumSpacingLowerM:validation.lowerM,
          maximumSpacingUpperM:validation.upperM,
          errorBoundM:validation.errorBoundM,
          coverageComplete:validation.coverage.complete,
          headlandSubset:validation.headlandSubset
        }
        : ground?ground.validation:{})
      };
      portionResults.push({
        ...totals(rows,input.postSpacingM,input.plantSpacingM),
        id:portion.id,
        label:portion.label,
        design,
        validation:summary,
        coverage,
        headlandArea:heads,
        usableSurfaceAreaM2:area.areaM2,
        usableHorizontalAreaM2:domain.areaM2
      });
    }
    budget.phase('envelope');
    const rows=portionResults.flatMap(p=>p.rows),
    sum=totals(rows,input.postSpacingM,input.plantSpacingM);
    const usableSurface=referenceAreaM2,
    usableHorizontal=[...scoped.values()].reduce((s,p)=>s+p.domain.areaM2,0);
    const headlandKnown=portionResults.every(p=>Number.isFinite(p.headlandArea?.surface)&&Number.isFinite(p.headlandArea?.horizontal));
    const surfaceHeadlandAreaM2=headlandKnown?portionResults.reduce((s,p)=>s+p.headlandArea.surface,0):null,
    headlandAreaM2=headlandKnown?portionResults.reduce((s,p)=>s+p.headlandArea.horizontal,0):null;
    const surfaceNetAreaM2=headlandKnown?Math.max(0,usableSurface-surfaceHeadlandAreaM2):null,
    metrics=polygonMetrics(input.polygon);
    const theoreticalPlants=Math.ceil((surfaceNetAreaM2??usableSurface)/(input.rowSpacingM*input.plantSpacingM));
    const served=portionResults.every(p=>Number.isFinite(p.coverage?.servedAreaM2))?portionResults.reduce((s,p)=>s+p.coverage.servedAreaM2,0):null;
    const result={
      ...metrics,
      ...sum,
      areaM2:original.areaM2,
      portions,
      excludedAreaM2:Math.max(0,original.areaM2-usableHorizontal),
      headlandAreaM2,
      netAreaM2:headlandKnown?Math.max(0,usableHorizontal-headlandAreaM2):null,
      surfaceAreaM2:gross.areaM2,
      surfaceHeadlandAreaM2,
      surfaceNetAreaM2,
      theoreticalPlants,
      commercialPlants25:roundUpTo25(sum.simulatedPlants||theoreticalPlants),
      surfaceUsableAreaM2:usableSurface,
      headlandAreaBasis:headlandKnown?'native-plane-boundary-sweep-union':'unavailable-row-continuum-area',
      theoreticalPlantsBasis:headlandKnown?'surface-after-explicit-exclusions-and-headlands':'surface-after-explicit-exclusions-before-headlands',
      coverage:{
        servedAreaM2:served,
        referenceAreaM2,
        percent:served===null?null:100*served/referenceAreaM2,
        basis:'surface-after-explicit-exclusions-before-headlands'
      },
      terrainStatus:'applied',
      terrainRelief:{minM:original.minM,maxM:original.maxM,rangeM:original.maxM-original.minM,maxSlopePercent:original.maxSlopePercent,basis:'native-field-domain-before-exclusions'},
      terrainSource:structuredClone(model.source),
      terrainAreaMethod:'native-face-surface-integration'
    };
    if(portionResults.every(p=>p.quantityBasis==='certified-flat-legacy')){
      for(const key of ['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])result[key]=legacy[key];
      result.theoreticalPlantsBasis='certified-flat-legacy-planar-density';
    }
    const rowPortions=portions.map(p=>{
      if(local&&p.id!==portionId){
        const saved=input.rowPortions.find(saved=>saved.id===p.id);
        budget.check(geometryNodes(saved));
        return structuredClone(saved);
      }
      return {
        ...p,
        terrainDesign:portionResults.find(r=>r.id===p.id).design
      };
    });
    const automatic=portionResults.filter(p=>p.validation.automaticSpacing);
    const validation={
      valid:true,
      method:'contour-family-and-manual-native-measurement',
      maxElevationDeviationM:Math.max(0,...automatic.map(p=>p.validation.maxElevationDeviationM)),
      automaticPortionIds:automatic.map(p=>p.id)
    };
    const proposedProject={
      ...project,
      rowPortions
    };
    // Envelope cloning copies input geometry, result rows and per-portion rows.
    // Counting the complete input is conservative because V2 omits design metadata.
    const finiteEnvelope=portionResults.some(portion=>portion.design?.axisGeometryConvention===FINITE_POLYLINE_AXIS_CONVENTION);
    budget.check(geometryNodes(model)+(finiteEnvelope?0:geometryNodes({
      ...input,
      rowPortions
    })+geometryNodes(result)+geometryNodes(portionResults)));
    const terrain={
      model:structuredClone(model),
      applied:createContourEnvelope({
        project:proposedProject,
        model,
        result,
        portionResults,
        validation,
        ...(finiteEnvelope?{budget}:{})
      })
    };
    assertTerrainSerializationBudget({
      ...proposedProject,
      terrain
    });
    budget.check();
    return {
      ok:true,
      status:'ready',
      kind:mode,
      message:'Proposta terreno verificata.',
      terrain,
      rowPortions,
      result,
      affectedPortionIds:portions.filter(p=>!local||p.id===portionId).map(p=>p.id),
      changes:portionResults.map(p=>({
        portionId:p.id,
        after:{
          rowCount:p.rowCount,
          rowLinearM:p.rowLinearM,
          simulatedPlants:p.simulatedPlants,
          totalPosts:p.totalPosts
        }
      })),
      diagnostics,
      timings:budget.timings()
    };
  }catch(error){
    return {
      ok:false,
      status:error.status??(error instanceof RangeError?'size-exceeded':'review-required'),
      kind:mode,
      message:error.message,
      ...(error.budgetReason?{budgetReason:error.budgetReason}:{}),
      diagnostics:{...diagnostics,...(error.budgetReason?{budget:{reason:error.budgetReason,phase:error.budgetPhase,...error.budgetUsage}}:{})},
      timings:budget.timings()
    };
  }
}

function freezeScopedValue(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freezeScopedValue);Object.freeze(value);
  }
  return value;
}
function scopedClone(value,budget){budget.check(geometryNodes(value));return structuredClone(value);}
function scopedFingerprint(project,model,budget){
  budget.check(geometryNodes(legacyTerrainInputs(project))+(model?.grid?.values?.length??(model?.grid?.width??0)*(model?.grid?.height??0)));
  if(!validateTerrainModel(model).valid)throw failure('stale-context','Frozen terrain model content changed.');
  return terrainInputHash({inputs:legacyTerrainInputs(project),modelHash:model.contentHash});
}
function scopedFieldRegion(op,input,groups,coordinateRole,epsg,excludedGroupId,budget){
  const transform=geometry=>{
    if(coordinateRole==='geographic')return geometry;
    budget.check(geometryNodes(geometry));
    return {type:geometry.type,coordinates:geometry.type==='Polygon'?geometry.coordinates.map(r=>r.map(p=>toUTM(p,epsg))):geometry.coordinates.map(p=>p.map(r=>r.map(v=>toUTM(v,epsg))))};
  };
  const read=geometry=>op.read(transform(geometry));
  let region=read({type:'Polygon',coordinates:[input.polygon]});
  for(const item of groups.legacy){const ring=Array.isArray(item)?item:item.geometry;region=op.operation(region,read({type:'Polygon',coordinates:[ring]}),'difference');}
  for(const group of groups.groups){
    if(group.groupId===excludedGroupId)continue;
    let raw=read(group.owner.surfaceGeometry);
    if(group.owner.surfaceGeometryConvention==='domain-intersection')raw=op.operation(raw,read(group.owner.scopeGeometry));
    region=op.operation(region,raw,'difference');
  }
  return region;
}
function scopedPortionResult({portion,domain,area,family,input,original,referenceAreaM2,budget}){
  const axes=family.axes,rows=family.rows;
  const convention=axes[0]?.axisGeometryConvention;
  const marked=[SOURCE_DOMAIN_AXIS_CONVENTION,FINITE_POLYLINE_AXIS_CONVENTION].includes(convention);
  const recipe=canonicalCutDomainScope(domain)?.recipe;
  if(marked&&recipe?.kind!=='canonical-cut-child-1')throw failure('cut-scope-unresolved','Only canonical child scope recipes can enter an applicable design.');
  const design={mode:'adapt',algorithmVersion:'terrain-contour-family-1',axes,followTerrain:true,
    ...(marked?{axisGeometryConvention:convention,axisScopeGeometry:scopedClone(domain.geometry,budget),axisScopeRecipe:scopedClone(recipe,budget),originalAxisScopeGeometry:scopedClone(original.geometry,budget),modelHash:domain.modelHash,crs:domain.crs}:{})};
  return {...totals(rows,input.postSpacingM,input.plantSpacingM),id:portion.id,label:portion.label,design,
    validation:{valid:true,method:family.validation.method,automaticSpacing:true,maxElevationDeviationM:family.validation.maxElevationDeviationM,
      minimumSpacingLowerM:family.validation.lowerM,maximumSpacingUpperM:family.validation.upperM,errorBoundM:family.validation.errorBoundM,
      coverageComplete:family.validation.coverage.complete,headlandSubset:family.validation.headlandSubset},
    coverage:{...family.coverage,referenceAreaM2,basis:'surface-after-explicit-exclusions-before-headlands'},
    headlandArea:headlandArea(original,domain,axes,Math.max(0,input.headlandWidthM??0),budget),
    usableSurfaceAreaM2:area.areaM2,usableHorizontalAreaM2:domain.areaM2};
}
function scopedManualResult({portion,domain,area,input,original,referenceAreaM2,budget}){
  const rows=sourceManualRows(input,portion,budget),axes=manualAxes(input,portion,rows,Number(domain.crs.split(':')[1]),budget);
  const measured=measureContourAxes({domain:original,physicalDomain:domain,axes,headlandWidthM:input.headlandWidthM??0,budget});
  if(!measured.rows.length)throw failure('review-required','Foreign manual portion has no usable native row fragments.');
  return {...totals(measured.rows,input.postSpacingM,input.plantSpacingM),id:portion.id,label:portion.label,
    design:{mode:'measure',orientationDeg:portion.orientationDeg,rowCurvePoints:scopedClone(portion.rowCurvePoints,budget),maintainRowEquidistance:portion.maintainRowEquidistance,followTerrain:false},
    validation:{valid:true,method:'manual-native-face-measurement',automaticSpacing:false},
    coverage:{servedAreaM2:null,referenceAreaM2,percent:null,basis:'surface-after-explicit-exclusions-before-headlands'},
    headlandArea:headlandArea(original,domain,axes,Math.max(0,input.headlandWidthM??0),budget),
    usableSurfaceAreaM2:area.areaM2,usableHorizontalAreaM2:domain.areaM2};
}

function sameCertifiedNativePlane(original,child,budget){
  if(original.modelHash!==child.modelHash||original.crs!==child.crs||!certifyUniformPlaneSupport(original,budget)||!certifyUniformPlaneSupport(child,budget))return false;
  const a=exactDomain(original,budget).faces[0],b=exactDomain(child,budget).faces[0];
  budget.check(12);
  if(cmp(a.g[0],b.g[0])||cmp(a.g[1],b.g[1]))return false;
  // zB + gA.xyA == zA + gB.xyB proves equal full intercepts
  // without allocating another retained coordinate array.
  const left=add(b.vertices[0][2],add(mul(a.g[0],a.vertices[0][0]),mul(a.g[1],a.vertices[0][1])));
  const right=add(a.vertices[0][2],add(mul(b.g[0],b.vertices[0][0]),mul(b.g[1],b.vertices[0][1])));
  return cmp(left,right)===0;
}

/** Live owner-derived cut evaluator. Private measurements and closures never
 * enter JSON; all widths share this original reference, baseline and budget. */
export function createScopedTerrainCutEvaluator({project,model,portionId,groupId=null,referenceLevelM,onBaselineAreaMeasurement,budget=createTerrainBudget({kind:'cut'})}={}){
  return createScopedTerrainCutContext({project,model,portionId,groupId,referenceLevelM,onBaselineAreaMeasurement,budget});
}
// Only the typed owner-derived endpoint producer below selects this private
// mode. Generic callers and SEARCH retain their eager actual no-road baseline.
function createScopedTerrainCutContext({project,model,portionId,groupId=null,referenceLevelM,onBaselineAreaMeasurement,budget}={},endpointReplacement=false){
  budget.check();
  const fingerprint=scopedFingerprint(project,model,budget),input=legacyTerrainInputs(project),epsg=Number(model.crs.split(':')[1]);
  if(!(input.rowSpacingM>0)||!(input.plantSpacingM>0))throw failure('invalid-input','Positive row and plant spacing required.');
  const groups=resolveTerrainExclusionGroups({exclusions:input.exclusions,field:input.polygon,budget}),oldGroup=groups.groups.find(group=>group.groupId===groupId);
  if(groupId&&!oldGroup)throw failure('cut-scope-unresolved','Replacement group is missing.');
  if(endpointReplacement&&!oldGroup)throw failure('invalid-input','Endpoint replacement needs an actual existing native group.');
  const physicalDomain=createCanonicalCutPhysicalDomain({project,model,scopePortionId:portionId,groupId,budget}),sourceId=canonicalCutDomainScope(physicalDomain).recipe.scopePortionId;
  const originalDomain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[input.polygon]},budget}),gross=areaOf(originalDomain,budget);
  const portions=resolveRowPortions({...input,budget});
  budget.check(geometryNodes(portions));
  const beforePortions=oldGroup?portions.filter(portion=>portion.terrainScopeRecipe?.groupId===groupId):portions.filter(portion=>portion.id===sourceId);
  if(!beforePortions.length||!beforePortions.some(portion=>portion.id===sourceId))throw failure('cut-scope-unresolved','Complete original source identity is missing.');
  const oldScopes=oldGroup?deriveCanonicalCutScopes({project,model,groupId,budget}):null;
  if(oldScopes&&(beforePortions.length!==oldScopes.children.length||new Set(beforePortions.map(portion=>portion.terrainScopeRecipe.componentKey)).size!==oldScopes.children.length||beforePortions.some(portion=>!oldScopes.children.some(child=>child.componentKey===portion.terrainScopeRecipe.componentKey))))throw failure('cut-scope-unresolved','Complete previous group children are not coherently saved.');
  const beforeIds=beforePortions.map(portion=>portion.id),foreign=portions.filter(portion=>!beforeIds.includes(portion.id));
  const foreignScopes=foreign.map(portion=>({portion,domain:portion.terrainScopeRecipe?createCanonicalCutChildDomain({project,model,recipe:portion.terrainScopeRecipe,budget}):createCanonicalCutPhysicalDomain({project,model,scopePortionId:portion.id,budget})}));
  const allScopes=[physicalDomain,...foreignScopes.map(record=>record.domain)];
  for(const coordinateRole of ['native','geographic']){
    const op=createRegularTerrainRegionOperations({budget});let union=[];
    for(const domain of allScopes){const region=op.readCanonicalDomain(domain,{coordinateRole});if(op.hasInterior(op.operation(union,region)))throw failure('cut-scope-unresolved','Pre-road source scopes overlap.');union=op.operation(union,region,'union');}
    if(!op.sameSet(union,scopedFieldRegion(op,input,groups,coordinateRole,epsg,groupId,budget)))throw failure('cut-scope-unresolved','Pre-road scopes do not partition the actual restricted field.');
  }
  const scopeAreas=new Map(allScopes.map(domain=>[domain,areaOf(domain,budget)]));
  const referenceMeasurement=sumMeasuredSurfaceAreas([...scopeAreas.values()],{budget}),referenceAreaM2=referenceMeasurement.areaM2;
  if(!(referenceAreaM2>0))throw failure('cut-scope-unresolved','Positive original restricted field reference required.');
  const savedApplied=project.terrain?.applied,previous=savedApplied?.schemaVersion===2&&savedApplied.algorithmVersion==='terrain-contour-family-1'?savedApplied:null;
  if(previous&&readTerrainEnvelope(project,{budget})?.terrainStatus!=='applied')throw failure('invalid-applied','Current applied terrain context is invalid.');
  if(oldGroup&&!previous)throw failure('invalid-applied','Replacement needs the complete previous applied group.');
  const foreignResults=foreignScopes.map(({portion,domain})=>{
    if(previous){const saved=previous.portionResults.find(result=>result.id===portion.id);if(!saved)throw failure('invalid-applied','Foreign applied portion is missing.');return scopedClone(saved,budget);}
    return scopedManualResult({portion,domain,area:scopeAreas.get(domain),input,original:originalDomain,referenceAreaM2,budget});
  });
  const referencePortion=beforePortions.find(portion=>portion.id===sourceId);
  let baselineMeasurement,noCutFamily;
  const candidateGeneration={kind:'scoped-cut-1',axisGeometryConvention:FINITE_POLYLINE_AXIS_CONVENTION,...(referenceLevelM===undefined?{}:{referenceLevelM})};
  if(!endpointReplacement){
    const manual=sourceManualRows(input,referencePortion,budget);
    const flat=exactDomain(physicalDomain,budget).faces.every(face=>!sign(face.q));
    const baselineGeneration=flat?null:{kind:'scoped-single-level-1',singleLevelM:referenceLevelM??(physicalDomain.minM+(physicalDomain.maxM-physicalDomain.minM)/2)};
    noCutFamily=buildContourFamily({domain:physicalDomain,portion:referencePortion,reference:{rows:manual,headlandWidthM:input.headlandWidthM,originalDomain},spacingM:input.rowSpacingM,referenceAreaM2,candidateGeneration:baselineGeneration,
      onSelectedAreaMeasurement(measurement){baselineMeasurement=measurement;},budget});
    if(noCutFamily.ok&&onBaselineAreaMeasurement){compareMeasuredSurfaceAreas(baselineMeasurement,baselineMeasurement,{budget});onBaselineAreaMeasurement(baselineMeasurement);compareMeasuredSurfaceAreas(baselineMeasurement,baselineMeasurement,{budget});}
  }
  if(scopedFingerprint(project,model,budget)!==fingerprint)throw failure('stale-context','Source changed during cut baseline evaluation.');
  if(noCutFamily)freezeScopedValue(noCutFamily);
  let evaluationCount=0;
  const evaluateCandidate=({sourceAxis,widthM,groupId:candidateGroupId=groupId,createId,onSelectedAreaMeasurement}={})=>{
    const diagnostics={portions:[],stage:'context'};
    try{
      budget.check();
      if(scopedFingerprint(project,model,budget)!==fingerprint)throw failure('stale-context','Cut source or model inputs changed.');
      if(++evaluationCount>3)throw failure('candidate-limit','At most three cut candidates share one evaluation context.');
      if(!candidateGroupId||oldGroup&&candidateGroupId!==groupId||!oldGroup&&groups.groups.some(group=>group.groupId===candidateGroupId))throw failure('invalid-input','Cut group identity is incompatible with this context.');
      if(oldGroup&&widthM!==undefined&&widthM!==oldGroup.owner.widthM)throw failure('invalid-input','Replacement must preserve the original owner width.');
      widthM=oldGroup?oldGroup.owner.widthM:widthM;
      sourceAxis=sourceAxis??oldGroup?.owner.sourceAxis;
      diagnostics.stage='passage';
      const passage=buildTerrainPassage({project,model,portionId,sourceAxis,widthM,groupId:candidateGroupId,createId,budget});
      const candidateInput={...project,exclusions:passage.exclusions},scopes=deriveCanonicalCutScopes({project:candidateInput,model,groupId:candidateGroupId,budget});
      diagnostics.stage='identity';
      const nativeOp=createRegularTerrainRegionOperations({budget}),geographicOp=createRegularTerrainRegionOperations({budget});
      const children=scopes.children.map(child=>({...child,region:nativeOp.readCanonicalDomain(child.domain,{coordinateRole:'native'})}));
      const ranked=[...children].sort((a,b)=>nativeOp.compareAreas(b.region,a.region)||a.componentKey.localeCompare(b.componentKey));
      ranked[0].id=sourceId;
      const occupied=new Set([...input.rowPortions.map(portion=>portion.id),...[...input.exclusions,...passage.exclusions].flatMap(item=>[item?.id,item?.passageGroupId])].filter(Boolean));
      const oldDomains=beforePortions.map(portion=>({portion,domain:oldGroup?oldScopes.children.find(child=>child.componentKey===portion.terrainScopeRecipe.componentKey).domain:physicalDomain}));
      const overlaps=[];
      for(const child of children)for(const record of oldDomains){
        const region=nativeOp.operation(child.region,nativeOp.readCanonicalDomain(record.domain,{coordinateRole:'native'}));
        if(nativeOp.hasInterior(region))overlaps.push({child,portion:record.portion,region});
      }
      overlaps.sort((a,b)=>nativeOp.compareAreas(b.region,a.region)||a.portion.id.localeCompare(b.portion.id)||a.child.componentKey.localeCompare(b.child.componentKey));
      const reused=new Set([sourceId]);
      for(const overlap of overlaps)if(!overlap.child.id&&!reused.has(overlap.portion.id)){overlap.child.id=overlap.portion.id;reused.add(overlap.portion.id);}
      const createdChildIds=[];let ordinal=0;
      for(const child of ranked){
        if(!child.id){let id;if(createId)id=createId();else do{id=`${sourceId}:cut:${candidateGroupId}:${++ordinal}`;budget.check();}while(occupied.has(id));
          if(typeof id!=='string'||!id||occupied.has(id))throw failure('invalid-input','Created child identity collides with the project.');occupied.add(id);child.id=id;createdChildIds.push(id);}
        const references=overlaps.filter(overlap=>overlap.child===child).map(overlap=>overlap.portion);
        const local=references.filter(portion=>portion.mode==='local');
        if(local.length>1&&new Set(local.map(portion=>terrainInputHash({orientationDeg:portion.orientationDeg,rowCurvePoints:portion.rowCurvePoints,maintainRowEquidistance:portion.maintainRowEquidistance,inheritedDesign:portion.inheritedDesign}))).size>1)throw failure('cut-scope-unresolved','Merged old local references are ambiguous.');
        child.reference=local[0]??references[0]??referencePortion;
      }
      diagnostics.stage='families';
      const childMeasurements=[],childResults=[],childPortions=[];
      for(const child of ranked){
        const geometry=geographicOp.serializeTopology(geographicOp.readCanonicalDomain(child.domain,{coordinateRole:'geographic'}));
        if(geometry.coordinates.length!==1)throw failure('cut-scope-unresolved','Child geographic component presentation is incomplete.');
        const portion={...scopedClone(child.reference,budget),id:child.id,geometry:geometry.coordinates[0],terrainScopeRecipe:scopedClone(child.recipe,budget)};
        const rows=sourceManualRows(input,portion,budget);
        const childCandidateGeneration=referenceLevelM===undefined&&sameCertifiedNativePlane(originalDomain,child.domain,budget)?null:candidateGeneration;
        const family=buildContourFamily({domain:child.domain,portion,reference:{rows,headlandWidthM:input.headlandWidthM,originalDomain},spacingM:input.rowSpacingM,referenceAreaM2,candidateGeneration:childCandidateGeneration,
          onSelectedAreaMeasurement(measurement){childMeasurements.push(measurement);},budget});
        diagnostics.portions.push({portionId:portion.id,...family.diagnostics});
        if(!family.ok)throw failure(family.status,'A complete child contour family remains unresolved.');
        child.area=areaOf(child.domain,budget);
        const result=scopedPortionResult({portion,domain:child.domain,area:child.area,family,input,original:originalDomain,referenceAreaM2,budget});
        portion.terrainDesign=result.design;childPortions.push(portion);childResults.push(result);
      }
      // Factory-proved child partition and the pre-road foreign disjointness
      // make this arithmetic sum the actual selected child service union.
      const selectedMeasurement=sumMeasuredSurfaceAreas(childMeasurements,{budget}),selectedArea=selectedMeasurement.areaM2;
      const comparableBaseline=!!baselineMeasurement&&measuredSurfaceAreasComparable(selectedMeasurement,baselineMeasurement,{budget}),improved=comparableBaseline?compareMeasuredSurfaceAreas(selectedMeasurement,baselineMeasurement,{budget})>0:null;
      diagnostics.stage='envelope';
      const rowPortions=[];let inserted=false;
      for(const portion of portions){
        if(beforeIds.includes(portion.id)){if(!inserted){rowPortions.push(...childPortions);inserted=true;}}
        else rowPortions.push(scopedClone(input.rowPortions.find(saved=>saved.id===portion.id)??portion,budget));
      }
      const portionResults=[...childResults,...foreignResults.map(result=>scopedClone(result,budget))];
      const rows=portionResults.flatMap(portion=>portion.rows),sum=totals(rows,input.postSpacingM,input.plantSpacingM);
      const usableMeasurement=sumMeasuredSurfaceAreas([...children.map(child=>child.area),...foreignScopes.map(record=>scopeAreas.get(record.domain))],{budget});
      const usableSurface=usableMeasurement.areaM2,usableHorizontal=portionResults.reduce((total,portion)=>total+portion.usableHorizontalAreaM2,0);
      const headlandKnown=portionResults.every(portion=>Number.isFinite(portion.headlandArea?.surface)&&Number.isFinite(portion.headlandArea?.horizontal));
      const surfaceHeadlandAreaM2=headlandKnown?portionResults.reduce((total,portion)=>total+portion.headlandArea.surface,0):null;
      const headlandAreaM2=headlandKnown?portionResults.reduce((total,portion)=>total+portion.headlandArea.horizontal,0):null;
      const surfaceNetAreaM2=headlandKnown?Math.max(0,usableSurface-surfaceHeadlandAreaM2):null;
      const theoreticalPlants=Math.ceil((surfaceNetAreaM2??usableSurface)/(input.rowSpacingM*input.plantSpacingM));
      const served=portionResults.every(portion=>Number.isFinite(portion.coverage?.servedAreaM2))?portionResults.reduce((total,portion)=>total+portion.coverage.servedAreaM2,0):null;
      const result={...polygonMetrics(input.polygon),...sum,areaM2:originalDomain.areaM2,portions:rowPortions,
        excludedAreaM2:Math.max(0,originalDomain.areaM2-usableHorizontal),headlandAreaM2,netAreaM2:headlandKnown?Math.max(0,usableHorizontal-headlandAreaM2):null,
        surfaceAreaM2:gross.areaM2,surfaceHeadlandAreaM2,surfaceNetAreaM2,theoreticalPlants,commercialPlants25:roundUpTo25(sum.simulatedPlants||theoreticalPlants),surfaceUsableAreaM2:usableSurface,
        headlandAreaBasis:headlandKnown?'native-plane-boundary-sweep-union':'unavailable-row-continuum-area',theoreticalPlantsBasis:headlandKnown?'surface-after-explicit-exclusions-and-headlands':'surface-after-explicit-exclusions-before-headlands',
        coverage:{servedAreaM2:served,referenceAreaM2,percent:served===null?null:100*served/referenceAreaM2,basis:'surface-after-explicit-exclusions-before-headlands'},
        terrainStatus:'applied',terrainRelief:{minM:originalDomain.minM,maxM:originalDomain.maxM,rangeM:originalDomain.maxM-originalDomain.minM,maxSlopePercent:originalDomain.maxSlopePercent,basis:'native-field-domain-before-exclusions'},
        terrainSource:scopedClone(model.source,budget),terrainAreaMethod:'native-face-surface-integration'};
      const validation={valid:true,method:'canonical-cut-independent-contour-families',maxElevationDeviationM:Math.max(0,...childResults.map(portion=>portion.validation.maxElevationDeviationM)),automaticPortionIds:childPortions.map(portion=>portion.id)};
      const proposedProject={...project,exclusions:passage.exclusions,rowPortions};
      budget.check(geometryNodes(model)+(model.grid.values?.length??model.grid.width*model.grid.height));
      const terrain={model:structuredClone(model),applied:createContourEnvelope({project:proposedProject,model,result,portionResults,validation,budget})};
      assertTerrainSerializationBudget({...proposedProject,terrain});
      const afterIds=childPortions.map(portion=>portion.id),affectedPortionIds=[...new Set([...beforeIds,...afterIds,...(!previous?foreign.map(portion=>portion.id):[])])];
      const proposal={ok:true,status:'ready',kind:'cut',message:'Proposta di passaggio verificata.',cut:passage.cut,isSplit:scopes.isSplit,
        cutOperation:{schemaVersion:1,action:oldGroup?'replace':'create',groupId:candidateGroupId,scopePortionId:sourceId,beforePortionIds:beforeIds,afterPortionIds:afterIds},
        createdChildIds,affectedPortionIds,terrain,rowPortions,result,projectPatch:{exclusions:passage.exclusions,rowPortions,terrain},
        comparison:{baselineCertified:comparableBaseline,noCutServedAreaM2:comparableBaseline?baselineMeasurement.areaM2:null,cutServedAreaM2:selectedArea,servedAreaGainM2:comparableBaseline?selectedArea-baselineMeasurement.areaM2:null,improved,...(selectedMeasurement.serviceMethod?{serviceMethod:selectedMeasurement.serviceMethod,serviceQualification:'certified-conservative-distance-to-row-subset'}:{}),...(!comparableBaseline&&baselineMeasurement?{referenceQualification:'different-certified-service-bases'}:{}),...(endpointReplacement?{referenceQualification:'not-evaluated-for-explicit-endpoint-replacement'}:{})},
        changes:portionResults.map(portion=>({portionId:portion.id,after:{rowCount:portion.rowCount,rowLinearM:portion.rowLinearM,simulatedPlants:portion.simulatedPlants,totalPosts:portion.totalPosts}})),diagnostics,timings:budget.timings()};
      if(scopedFingerprint(project,model,budget)!==fingerprint)throw failure('stale-context','Cut source changed during evaluation.');
      if(onSelectedAreaMeasurement){compareMeasuredSurfaceAreas(selectedMeasurement,selectedMeasurement,{budget});onSelectedAreaMeasurement(selectedMeasurement);compareMeasuredSurfaceAreas(selectedMeasurement,selectedMeasurement,{budget});}
      if(scopedFingerprint(project,model,budget)!==fingerprint)throw failure('stale-context','Cut source changed during measurement observation.');
      budget.check();return proposal;
    }catch(error){return {ok:false,status:error.status??'review-required',kind:'cut',message:error.message,diagnostics,timings:budget.timings()};}
  };
  return Object.freeze({physicalDomain,originalDomain,noCutFamily,referenceAreaM2,evaluateCandidate});
}

/** Explicit replacement of one endpoint on an actual native owned group. This
 * producer derives ownership itself; callers cannot supply width/scope/group,
 * a skipped-baseline flag, a family certificate or a create fallback. */
export function buildOwnedTerrainEndpointReplacement({project,model,exclusionId,sourceAxis,budget=createTerrainBudget({kind:'cut'}),...extra}={}){
  budget.check();
  if(Object.keys(extra).length||typeof exclusionId!=='string'||!exclusionId)throw failure('invalid-input','Invalid owned endpoint replacement input.');
  const validateAxis=axis=>{
    if(!Array.isArray(axis)||axis.length!==2)throw failure('invalid-input','An endpoint replacement needs two complete coordinates.');
    for(let index=0;index<2;index++){
      const point=axis[index];validateCoordinate(point);
      if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))throw failure('invalid-input','An endpoint replacement needs two complete coordinates.');
    }
  };
  try{validateAxis(sourceAxis);}catch(error){throw failure('invalid-input',error.message);}
  const matches=(project?.exclusions??[]).filter(member=>member?.id===exclusionId);
  if(matches.length!==1||typeof matches[0].passageGroupId!=='string'||!matches[0].passageGroupId)throw failure('invalid-input','Endpoint member is not uniquely owned.');
  const group=resolveTerrainExclusionGroups({exclusions:project.exclusions,field:project.polygon??project.geometry,budget}).groups.find(group=>group.groupId===matches[0].passageGroupId);
  if(!group||!group.members.some(member=>member.id===exclusionId)||group.owner.surfaceGeometryConvention!=='domain-intersection'||group.owner.modelHash!==model?.contentHash)throw failure('invalid-input','Endpoint replacement needs a matching actual native owner.');
  const owner=group.owner,applied=project.terrain?.applied;
  if(applied?.schemaVersion!==2||applied.algorithmVersion!=='terrain-contour-family-1')throw failure('invalid-applied','Endpoint replacement needs a complete previous applied group.');
  // Own the submitted axis before the guard and long context construction. Pay
  // this real clone separately; no mutable caller axis becomes private authority.
  const ownedSourceAxis=freezeScopedValue(scopedClone(sourceAxis,budget));
  try{validateAxis(ownedSourceAxis);}catch(error){throw failure('invalid-input',error.message);}
  const changed=ownedSourceAxis.filter((point,index)=>point.some((value,coordinate)=>value!==owner.sourceAxis[index][coordinate])).length;
  if(changed!==1)throw failure('invalid-input','Exactly one actual owner endpoint must change.');
  const context=createScopedTerrainCutContext({project,model,portionId:owner.scopePortionId,groupId:group.groupId,budget},true);
  return context.evaluateCandidate({sourceAxis:ownedSourceAxis});
}
