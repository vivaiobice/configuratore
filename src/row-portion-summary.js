import {resolveRowPortions} from './row-portions.js?v=1.2.5';
import {normalizeRowCurvePoints} from './row-curves.js?v=1.2.5';

// Report only effective designs: saved controls may still use the inherited base.
export function rowPortionDescriptors(field={},metrics={}){
  const portions=Array.isArray(metrics.portions)?metrics.portions:resolveRowPortions({
    polygon:field.geometry,exclusions:field.exclusions,rowPortions:field.rowPortions,
    orientationDeg:field.orientationDeg,rowCurvePoints:field.rowCurvePoints,
    maintainRowEquidistance:field.maintainRowEquidistance!==false
  });
  return portions.map((portion,index)=>({id:portion.id,label:portion.label||`Porzione ${index+1}`,
    mode:portion.mode,orientationDeg:Number(portion.orientationDeg)||0,
    curved:normalizeRowCurvePoints(portion.rowCurvePoints).some(point=>Math.abs(point.offsetM)>0),
    maintainRowEquidistance:portion.maintainRowEquidistance!==false}));
}

export function hasPortionDesign(layout={}){
  return layout.portions?.length>1||layout.portions?.some(portion=>portion.mode==='local')||false;
}

export function formatPortionDesign(portion={}){
  const angle=Number(portion.orientationDeg||0).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1});
  return `${angle}° · ${portion.curved?'Curvi':'Rettilinei'} · Equidistanza ${portion.maintainRowEquidistance!==false?'sì':'no'}`;
}
