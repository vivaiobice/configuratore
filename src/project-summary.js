import {calculateProject} from './project-calculator.js?v=1.2.3';

export function fieldSummaryMetrics(field={}) {
 if(!Array.isArray(field.geometry)||field.geometry.length<4)return {areaM2:0,simulatedPlants:0};
 return calculateProject({polygon:field.geometry,exclusions:field.exclusions??[],rowSpacingM:field.rowSpacingM??2.5,plantSpacingM:field.plantSpacingM??.9,orientationDeg:field.orientationDeg??0,rowCurvePoints:field.rowCurvePoints,maintainRowEquidistance:field.maintainRowEquidistance!==false,postSpacingM:field.postSpacingM??4.5,headlandWidthM:field.headlandWidthM});
}
export function summarizeProject(project={},getMetrics=fieldSummaryMetrics) {
 const result={fieldCount:0,areaM2:0,plants:0};
 for(const field of project.fields??[]) {
  if(!Array.isArray(field?.geometry)||field.geometry.length<4||field.geometry.some(point=>!Array.isArray(point)||!point.slice(0,2).every(value=>Number.isFinite(Number(value)))))continue;
  const m=getMetrics(field)??{};result.fieldCount++;
  result.areaM2+=Math.max(0,Number(m.grossAreaM2??m.areaM2)||0);
  result.plants+=Math.max(0,Number(m.simulatedPlants??m.calculatedPlants)||0);
 }
 return result;
}
export function projectSummaryText(project,getMetrics) {
 const m=summarizeProject(project,getMetrics),n=value=>Math.round(value).toLocaleString('it-IT',{useGrouping:true});
 return `${m.fieldCount} campi · ${n(m.areaM2)} m² · ${n(m.plants)} viti`;
}
