import {calculateProject} from '../src/project-calculator.js?v=51';

const collection=features=>({type:'FeatureCollection',features});
const valid=ring=>Array.isArray(ring)&&ring.length>=4&&ring.every(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1])));
const polygon=(ring,properties,id)=>({type:'Feature',id,properties,geometry:{type:'Polygon',coordinates:[ring]}});

export function buildAdminFieldPreviewData(row={}) {
  const field=row.field??row,ring=field.geometry?.type==='Polygon'?field.geometry.coordinates?.[0]:field.geometry;
  if(!valid(ring))return {valid:false,polygon:[],rows:[],exclusions:[],metrics:null};
  const exclusions=(Array.isArray(field.exclusions)?field.exclusions:[]).map(item=>Array.isArray(item)?item:item?.geometry).filter(valid);
  try {
    const metrics=calculateProject({polygon:ring,exclusions,rowSpacingM:Number(field.rowSpacingM)||2.5,plantSpacingM:Number(field.plantSpacingM)||.9,orientationDeg:Number(field.orientationDeg)||0,rowCurvePoints:Array.isArray(field.rowCurvePoints)?field.rowCurvePoints:[],maintainRowEquidistance:field.maintainRowEquidistance!==false,postSpacingM:Number(field.postSpacingM)||4.5,headlandWidthM:field.headlandWidthM});
    return {valid:true,polygon:ring,rows:metrics.rows.map(row=>row.coordinates??(row.start&&row.end?[row.start,row.end]:[])).filter(line=>line.length>=2),exclusions,metrics};
  }catch{return {valid:false,polygon:[],rows:[],exclusions:[],metrics:null};}
}

export function buildAdminMapData(fieldRows=[]) {
  const fields=[],exclusions=[],rows=[];
  for(const row of fieldRows) {
    const preview=buildAdminFieldPreviewData(row);if(!preview.valid)continue;
    const properties={projectId:String(row.projectId??row.project?.id??''),fieldId:String(row.fieldId??row.field?.id??''),displayLabel:[row.label,row.projectName].filter(Boolean).join(' · ')};
    fields.push(polygon(preview.polygon,properties,row.rowId??`${properties.projectId}:${properties.fieldId}`));
    preview.exclusions.forEach((ring,index)=>exclusions.push(polygon(ring,properties,`${properties.projectId}:${properties.fieldId}:ex:${index}`)));
    preview.rows.forEach((coordinates,index)=>rows.push({type:'Feature',properties:{...properties},geometry:{type:'LineString',coordinates},id:`${properties.projectId}:${properties.fieldId}:row:${index}`}));
  }
  return {fields:collection(fields),exclusions:collection(exclusions),rows:collection(rows)};
}
