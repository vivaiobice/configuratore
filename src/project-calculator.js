import { readAppliedTerrainResult } from './terrain-design.js?v=1.3.2';
import { polygonMetrics, generateRows, estimatePlantsFromRows, roundUpTo25 } from './geometry.js?v=45';
import { resolveRowPortions } from './row-portions.js?v=1.3.2';
import { generateCurvedRows, normalizeRowCurvePoints, rowOwnerId } from './row-curves.js?v=1.3.2';
import {terrainSurfaceGroupsPresent,resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.2';
import {invalidTerrainResult} from './terrain-replay.js?v=1.3.2';

export function calculateManualPlants({ areaM2, rowSpacingM, plantSpacingM }) {
  const area = Number(areaM2);
  const rowSpacing = Number(rowSpacingM);
  const plantSpacing = Number(plantSpacingM);
  if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(rowSpacing) || rowSpacing <= 0 || !Number.isFinite(plantSpacing) || plantSpacing <= 0) {
    return { theoreticalPlants:0, commercialPlants25:0 };
  }
  const theoreticalPlants = Math.ceil(area / (rowSpacing * plantSpacing));
  return { theoreticalPlants, commercialPlants25:roundUpTo25(theoreticalPlants) };
}

export function calculateManualArea({ plants, rowSpacingM, plantSpacingM }) {
  const count = Number(plants);
  const rows = Number(rowSpacingM);
  const vines = Number(plantSpacingM);
  if (!Number.isSafeInteger(count) || count <= 0 || !Number.isFinite(rows) || rows <= 0 || !Number.isFinite(vines) || vines <= 0) return { areaM2:0 };
  return { areaM2:count * rows * vines };
}

function emptyResult() {
  return {
    areaM2: 0,
    netAreaM2: 0,
    headlandAreaM2: 0,
    excludedAreaM2: 0,
    perimeterM: 0,
    vertexCount: 0,
    rows: [],
    portions: [],
    rowCount: 0,
    rowLinearM: 0,
    simulatedPlants: 0,
    theoreticalPlants: 0,
    commercialPlants25: 0,
    headPosts: 0,
    intermediatePosts: 0,
    totalPosts: 0
  };
}

export function calculateProject({ terrain = null, polygon, exclusions = [], rowSpacingM, plantSpacingM, orientationDeg = 0, rowCurvePoints = [], rowPortions = [], maintainRowEquidistance = true, postSpacingM = null, headlandWidthM = null }) {
  if(terrainSurfaceGroupsPresent(exclusions)){
    try{resolveTerrainExclusionGroups({exclusions,field:polygon});}
    catch(error){return invalidTerrainResult(error.message);}
    // The strict expression route is installed separately; until then raw
    // construction members must never reach permissive literal filtering.
    if(!terrain)return invalidTerrainResult('Passaggio sul terreno da ricalcolare.');
  }
  if (terrain) return readAppliedTerrainResult({terrain,polygon,exclusions,rowSpacingM,plantSpacingM,orientationDeg,rowCurvePoints,rowPortions,maintainRowEquidistance,postSpacingM,headlandWidthM});
  if (!Array.isArray(polygon) || polygon.length < 4) return emptyResult();
  const rowSpacing = Number(rowSpacingM);
  const plantSpacing = Number(plantSpacingM);
  if (!Number.isFinite(rowSpacing) || rowSpacing <= 0 || !Number.isFinite(plantSpacing) || plantSpacing <= 0) return emptyResult();

  const metrics = polygonMetrics(polygon);
  const validExclusions = (Array.isArray(exclusions) ? exclusions : []).filter((item) => {
    const ring=Array.isArray(item)?item:item?.geometry;
    return Array.isArray(ring)&&ring.length>=4;
  });
  const exclusionRings=validExclusions.map(item=>Array.isArray(item)?item:item.geometry);
  const portions=resolveRowPortions({polygon,exclusions:validExclusions,rowPortions,orientationDeg,rowCurvePoints,maintainRowEquidistance});
  const usableAreaM2=portions.reduce((sum,p)=>sum+polygonMetrics(p.geometry[0]).areaM2-p.geometry.slice(1).reduce((holes,r)=>holes+polygonMetrics(r).areaM2,0),0);
  const excludedAreaM2=validExclusions.length?Math.max(0,Math.min(metrics.areaM2,metrics.areaM2-usableAreaM2)):0;
  const curvePoints=normalizeRowCurvePoints(rowCurvePoints);
  const legacyRows=(headland,design={orientationDeg,rowCurvePoints:curvePoints,maintainRowEquidistance})=>design.rowCurvePoints.length
    ? generateCurvedRows({polygon,rowSpacingM:rowSpacing,orientationDeg:Number(design.orientationDeg)||0,rowCurvePoints:design.rowCurvePoints,maintainEquidistance:design.maintainRowEquidistance!==false,exclusions:validExclusions,headlandWidthM:headland})
    : generateRows(polygon,rowSpacing,Number(design.orientationDeg)||0,{exclusions:exclusionRings,headlandWidthM:headland});
  const usesPortions=portions.length>1||(Array.isArray(rowPortions)&&rowPortions.length>0);
  const rowGenerator=headland=>{
    if(!usesPortions)return legacyRows(headland);
    const inherited=portions.filter(p=>p.mode==='inherited'),groups=new Map(),rows=[];
    for(const p of inherited){
      const design=p.inheritedDesign??p,key=JSON.stringify([design.orientationDeg,design.rowCurvePoints,design.maintainRowEquidistance]);
      if(!groups.has(key))groups.set(key,{design,ids:new Set()});
      groups.get(key).ids.add(p.id);
    }
    for(const {design,ids} of groups.values())for(const row of legacyRows(headland,design)){
      const ownerId=rowOwnerId({coordinates:row.coordinates??[row.start,row.end],portions});
      if(ownerId&&ids.has(ownerId))rows.push({...row,portionId:ownerId});
    }
    for(const p of portions.filter(p=>p.mode==='local'))rows.push(...generateCurvedRows({polygon,guidePolygon:p.geometry[0],rowOwnership:{portionId:p.id,portions},rowSpacingM:rowSpacing,orientationDeg:p.orientationDeg,rowCurvePoints:p.rowCurvePoints,maintainEquidistance:p.maintainRowEquidistance!==false,exclusions:validExclusions,headlandWidthM:headland}).map(row=>({...row,portionId:p.id})));
    return rows;
  };
  const rawRows = rowGenerator(0);
  const headlandWidth = Number(headlandWidthM);
  const effectiveHeadland = Number.isFinite(headlandWidth) && headlandWidth > 0 ? headlandWidth : 0;
  const rows = rowGenerator(effectiveHeadland);
  const rawRowLinearM = rawRows.reduce((sum, row) => sum + row.lengthM, 0);
  const rowLinearM = rows.reduce((sum, row) => sum + row.lengthM, 0);
  const removedLinearM = Math.max(0, rawRowLinearM - rowLinearM);
  const usableBeforeHeadlandsM2 = Math.max(0, metrics.areaM2 - excludedAreaM2);
  const headlandAreaM2 = Math.min(usableBeforeHeadlandsM2, removedLinearM * rowSpacing);
  const netAreaM2 = Math.max(0, usableBeforeHeadlandsM2 - headlandAreaM2);
  const simulatedPlants = estimatePlantsFromRows(rows, plantSpacing);
  const theoreticalPlants = Math.ceil(netAreaM2 / (rowSpacing * plantSpacing));
  const postSpacing = Number(postSpacingM);
  let headPosts = 0;
  let intermediatePosts = 0;

  if (Number.isFinite(postSpacing) && postSpacing > 0) {
    headPosts = rows.length * 2;
    intermediatePosts = rows.reduce((sum, row) => sum + Math.max(0, Math.ceil(row.lengthM / postSpacing) - 1), 0);
  }

  return {
    ...metrics,
    netAreaM2,
    headlandAreaM2,
    excludedAreaM2,
    rows,
    portions,
    rowCount: rows.length,
    rowLinearM,
    simulatedPlants,
    theoreticalPlants,
    commercialPlants25: roundUpTo25(simulatedPlants || theoreticalPlants),
    headPosts,
    intermediatePosts,
    totalPosts: headPosts + intermediatePosts
  };
}
