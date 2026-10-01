import { polygonMetrics, generateRows, estimatePlantsFromRows, roundUpTo25 } from './geometry.js?v=45';
import { generateCurvedRows, normalizeRowCurvePoints } from './row-curves.js?v=45';

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

function emptyResult() {
  return {
    areaM2: 0,
    netAreaM2: 0,
    headlandAreaM2: 0,
    excludedAreaM2: 0,
    perimeterM: 0,
    vertexCount: 0,
    rows: [],
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

export function calculateProject({ polygon, exclusions = [], rowSpacingM, plantSpacingM, orientationDeg = 0, rowCurvePoints = [], maintainRowEquidistance = true, postSpacingM = null, headlandWidthM = null }) {
  if (!Array.isArray(polygon) || polygon.length < 4) return emptyResult();
  const rowSpacing = Number(rowSpacingM);
  const plantSpacing = Number(plantSpacingM);
  if (!Number.isFinite(rowSpacing) || rowSpacing <= 0 || !Number.isFinite(plantSpacing) || plantSpacing <= 0) return emptyResult();

  const metrics = polygonMetrics(polygon);
  const validExclusions = (Array.isArray(exclusions) ? exclusions : []).filter((item) => Array.isArray(item) && item.length >= 4);
  const excludedAreaM2 = Math.min(metrics.areaM2, validExclusions.reduce((sum, item) => sum + polygonMetrics(item).areaM2, 0));
  const curvePoints=normalizeRowCurvePoints(rowCurvePoints);
  const rowGenerator=(headland)=>curvePoints.length
    ? generateCurvedRows({polygon,rowSpacingM:rowSpacing,orientationDeg:Number(orientationDeg)||0,rowCurvePoints:curvePoints,maintainEquidistance:maintainRowEquidistance!==false,exclusions:validExclusions,headlandWidthM:headland})
    : generateRows(polygon,rowSpacing,Number(orientationDeg)||0,{exclusions:validExclusions,headlandWidthM:headland});
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
