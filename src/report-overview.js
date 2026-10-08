import {buildReportMapModel} from './report-map-model.js?v=1.3.2';
import {interiorLabelPoint} from './geometry.js';
export const FIELD_COLORS=['#ffe082','#80deea','#ffab91','#c5e1a5','#ce93d8','#90caf9'];
export function buildOverviewMapModel(fields,getMetrics=()=>({})){
 const points=fields.flatMap(field=>field.geometry??[]);
 if(!points.length)return {valid:false};
 const west=Math.min(...points.map(p=>p[0])),east=Math.max(...points.map(p=>p[0])),south=Math.min(...points.map(p=>p[1])),north=Math.max(...points.map(p=>p[1]));
 const model=buildReportMapModel({polygon:[[west,south],[east,south],[east,north],[west,north],[west,south]],width:1000,height:650,padding:62});
 model.geo={fields:fields.map((field,index)=>{const individual=buildReportMapModel({polygon:field.geometry,rows:getMetrics(field).rows,exclusions:field.exclusions});return {id:field.id,label:field.label,color:FIELD_COLORS[index%FIELD_COLORS.length],...individual.geo,labelPoint:interiorLabelPoint(field.geometry)};})};
 return model;
}
