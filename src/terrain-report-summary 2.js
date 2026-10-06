export const TERRAIN_UNAVAILABLE_LABEL='Terreno non disponibile: rivedere il disegno';
export function terrainReportMetadata(metrics={}){
 if(!metrics.terrainStatus)return null;
 return {status:metrics.terrainStatus,source:metrics.terrainSource??null,
  quantityBasis:metrics.quantityBasis??null,surfaceRowLinearM:metrics.surfaceRowLinearM??null,
  horizontalRowLinearM:metrics.horizontalRowLinearM??null,surfaceAreaM2:metrics.surfaceAreaM2??null,
  surfaceNetAreaM2:metrics.surfaceNetAreaM2??null,surfaceHeadlandAreaM2:metrics.surfaceHeadlandAreaM2??null};
}
export function terrainUsesCertifiedQuantities(terrain){
 return terrain?.quantityBasis==='certified-flat-legacy'||terrain?.quantityBasis==='mixed-certified-bases';
}
export function terrainQuantityBasisText(terrain){
 if(terrain?.quantityBasis==='certified-flat-legacy')return 'Quantità del disegno conservate';
 if(terrain?.quantityBasis==='mixed-certified-bases')return 'Quantità in parte conservate';
 return '';
}
export function terrainMeasureText(terrain){
 if(!terrain)return '';
 if(terrain.status==='invalid')return TERRAIN_UNAVAILABLE_LABEL;
 const source=terrain.source??{};
 return [terrainQuantityBasisText(terrain),terrainUsesCertifiedQuantities(terrain)?'Lunghezze sul terreno misurate':'Lunghezze sul terreno',source.label||source.id,source.resolutionM?`${source.resolutionM} m`:null,source.surveyEpoch?`Epoca ${source.surveyEpoch}`:null].filter(Boolean).join(' · ');
}
