import {generateRows} from './geometry.js?v=45';
import {generateCurvedRows,normalizeRowCurvePoints} from './row-curves.js?v=1.3.3';
import {toUTM} from './coordinate-system.js?v=1.3.3';

export function manualStraightIntent(portion){
 const design=portion.mode==='local'?portion:portion.inheritedDesign??portion;
 return normalizeRowCurvePoints(design.rowCurvePoints).every(point=>point.offsetM===0);
}

export function preserveFlatManualQuantities(rows,expected){
 if(expected.length!==rows.length)return rows;
 return rows.map((row,index)=>({...row,start:expected[index].start,end:expected[index].end,
  coordinates:[expected[index].start,...row.coordinates.slice(1,-1),expected[index].end],
  lengthM:expected[index].lengthM,quantityBasis:'certified-flat-legacy'}));
}

export function sourceManualRows(input,portion,budget) {
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
export function manualAxes(input,portion,rows,epsg,budget) {
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
