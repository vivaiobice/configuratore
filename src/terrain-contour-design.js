import {
  createTerrainBudget
}
from './terrain-budget.js?v=1.3.1-prova.1';
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
from './terrain-exact.js?v=1.3.1-prova.1';
import {
  toUTM
}
from './coordinate-system.js?v=1.3.1-prova.1';
import {
  buildContourFamily,
  measureContourAxes
}
from './terrain-contour-family.js?v=1.3.1-prova.1';
import {
  createContourDomain
}
from './terrain-contour-domain.js?v=1.3.1-prova.1';
import {
  legacyTerrainInputs,
  terrainGeometryInputHash,
  readTerrainEnvelope,
  createContourEnvelope
}
from './terrain-replay.js?v=1.3.1-prova.1';
import {
  validateTerrainModel
}
from './terrain-model.js?v=1.3.1-prova.1';
import {
  resolveRowPortions
}
from './row-portions.js?v=1.3.1-prova.1';
import {
  generateRows,
  polygonMetrics,
  estimatePlantsFromRows,
  roundUpTo25
}
from './geometry.js?v=45';
import {
  generateCurvedRows
}
from './row-curves.js?v=1.3.1-prova.1';
import {
  calculateProject
}
from './project-calculator.js?v=1.3.1-prova.1';
import {
  assertTerrainSerializationBudget
}
from './terrain-serialization.js?v=1.3.1-prova.1';
import {
  certifyUniformPlaneSupport,
  measureSurfaceFootprint,
  measureSurfaceUnion
}
from './terrain-surface-bands.js?v=1.3.1-prova.1';
const failure=(status,message)=>Object.assign(new Error(message),{
  status
});
export {
  measureContourAxes
}
from './terrain-contour-family.js?v=1.3.1-prova.1';
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
function sourceManualRows(input,portion,budget) {
  const design=portion.mode==='local'?portion:portion.inheritedDesign??portion;
  const rows=portion.mode==='local'||design.rowCurvePoints?.length?
  generateCurvedRows({
    polygon:input.polygon,
    ...(portion.mode==='local'?{
      guidePolygon:portion.geometry[0]
    }
    :{
    }),
    rowSpacingM:input.rowSpacingM,
    orientationDeg:design.orientationDeg,
    rowCurvePoints:design.rowCurvePoints,
    maintainEquidistance:design.maintainRowEquidistance!==false,
    headlandWidthM:0,
    includeTerrainAxes:true
  }):
  generateRows(input.polygon,input.rowSpacingM,design.orientationDeg);
  budget.check(rows.reduce((s,r)=>s+(r.coordinates?.length??2)+(r.terrainAxisCoordinates?.length??0),0));
  return rows;
}
function manualAxes(input,portion,rows,epsg,budget) {
  const axes=[];
  const groups=new Map();
  const design=portion.mode==='local'?portion:portion.inheritedDesign??portion;
  const angle=(Number(design.orientationDeg)||0)*Math.PI/180;
  const origin=input.polygon[0],
  scaleY=6371008.8*Math.PI/180;
  const latitude=input.polygon.slice(0,-1).reduce((s,p)=>s+p[1],0)/(input.polygon.length-1),
  scaleX=scaleY*Math.cos(latitude*Math.PI/180);
  for(const row of rows){
    const phase=((row.start[0]-origin[0])*scaleX*Math.cos(angle)+(row.start[1]-origin[1])*scaleY*Math.sin(angle))/input.rowSpacingM;
    const key=row.terrainAxisFamily?`${row.terrainAxisFamily}:${row.terrainAxisDistance}`:`straight:${Math.round(phase*1e6)/1e6}`;
    let axis=groups.get(key);
    if(!axis){
      axis={
        axisId:`${portion.id}:manual:${axes.length}`,
        portionId:portion.id,
        ordinal:axes.length,
        components:[]
      };
      groups.set(key,axis);
      axes.push(axis);
    }
    const coordinates=row.terrainAxisCoordinates??row.coordinates??[row.start,row.end];
    const coordinatesXY=coordinates.map(p=>toUTM(p,epsg));
    budget.check(coordinatesXY.length);
    if(!axis.components.some(c=>JSON.stringify(c.coordinatesXY)===JSON.stringify(coordinatesXY)))axis.components.push({
      coordinatesXY
    });
  }
  return axes;
}
function areaOf(domain,budget) {
  return measureSurfaceFootprint({
    domain,
    geometryXY:{
      type:'MultiPolygon',
      coordinates:
      [...new Set(domain.boundaries.map(b=>b.polygonIndex))].map(id=>domain.boundaries.filter(b=>b.polygonIndex===id).map(b=>b.coordinatesXY))
    },
    areaMode:certifyUniformPlaneSupport(domain,budget)?'constant-plane':'coplanar-patches',
    budget
  });
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
    portions=resolveRowPortions(input);
    budget.check(geometryNodes(portions));
    if(!portions.length||!(input.rowSpacingM>0)||!(input.plantSpacingM>0)||portionId&&!portions.some(p=>p.id===portionId))throw failure('invalid-input','Invalid field, spacing or portion.');
    const previous=project.terrain?.applied;
    const local=previous?.schemaVersion===2&&previous.algorithmVersion==='terrain-contour-family-1'&&!!portionId&&!recomputeAll;
    if(local){
      if(project.terrain.model.contentHash!==model.contentHash)throw failure('review-required','The model changed; recompute the whole field.');
      const saved=readTerrainEnvelope({
        ...previous.inputs,
        terrain:project.terrain
      });
      budget.check(geometryNodes(saved));
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
      const domain=JSON.stringify(portion.geometry)===JSON.stringify([input.polygon])?original:
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
      let axes=sourceAxes,
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
        automaticSpacing:false
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
          spacingM:input.rowSpacingM,
          budget,
          referenceAreaM2
        });
        diagnostics.portions.push({
          portionId:portion.id,
          ...family.diagnostics
        });
        if(!family.ok)throw failure(family.status,'The requested contour family remains unresolved.');
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
        if(expected.length===rows.length)rows=rows.map((row,i)=>({
          ...row,
          start:expected[i].start,
          end:expected[i].end,
          coordinates:[expected[i].start,...row.coordinates.slice(1,-1),expected[i].end],
          lengthM:expected[i].lengthM,
          quantityBasis:'certified-flat-legacy'
        }));
      }
      if(!rows.length)throw failure('review-required','No usable physical row fragments.');
      const heads=headlandArea(original,domain,axes,Math.max(0,input.headlandWidthM??0),budget);
      const design=adapt?{
        mode:'adapt',
        algorithmVersion:'terrain-contour-family-1',
        axes,
        followTerrain:true
      }
      :
      {
        mode:'measure',
        orientationDeg:portion.orientationDeg,
        rowCurvePoints:structuredClone(portion.rowCurvePoints),
        maintainRowEquidistance:portion.maintainRowEquidistance,
        followTerrain:false
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
        : {
        })
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
    budget.check(geometryNodes(model)+geometryNodes({
      ...input,
      rowPortions
    })+geometryNodes(result)+geometryNodes(portionResults));
    const terrain={
      model:structuredClone(model),
      applied:createContourEnvelope({
        project:proposedProject,
        model,
        result,
        portionResults,
        validation
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
      diagnostics,
      timings:budget.timings()
    };
  }
}
