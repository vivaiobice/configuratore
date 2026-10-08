export const TERRAIN_UNAVAILABLE_LABEL='Terreno non disponibile: rivedere il disegno';
const OPTIONAL_METRIC_KEYS=['surfaceUsableAreaM2','headlandAreaBasis','theoreticalPlantsBasis','coverage','rowAxisCount','rowFragmentCount'];
export function terrainReportMetadata(metrics={}){
 if(!metrics?.terrainStatus)return null;
 return {status:metrics.terrainStatus,source:metrics.terrainSource??null,
  quantityBasis:metrics.quantityBasis??null,surfaceRowLinearM:metrics.surfaceRowLinearM??null,
  horizontalRowLinearM:metrics.horizontalRowLinearM??null,surfaceAreaM2:metrics.surfaceAreaM2??null,
  surfaceNetAreaM2:metrics.surfaceNetAreaM2??null,surfaceHeadlandAreaM2:metrics.surfaceHeadlandAreaM2??null,
  ...Object.fromEntries(OPTIONAL_METRIC_KEYS.filter(key=>Object.hasOwn(metrics,key)).map(key=>[key,metrics[key]]))};
}
// Flatten the same optional contract for field report and administration DTOs.
export function terrainReportMetricMetadata(metrics={}){
 const terrain=terrainReportMetadata(metrics);
 if(!terrain)return {};
 const {status,source,...values}=terrain;
 return {terrainStatus:status,terrainSource:source,...values};
}
export function terrainTheoreticalBasisText(terrain){
 if(terrain?.theoreticalPlantsBasis==='surface-after-explicit-exclusions-before-headlands')return 'Densità teorica prima delle capezzagne';
 if(terrain?.theoreticalPlantsBasis==='surface-after-explicit-exclusions-and-headlands')return 'Densità teorica dopo le capezzagne';
 if(terrain?.theoreticalPlantsBasis==='certified-flat-legacy-planar-density')return 'Densità teorica del disegno conservata';
 return '';
}
export function terrainRowCountText(terrain,rowCount,format=value=>String(value)){
 const axes=terrain?.rowAxisCount,fragments=terrain?.rowFragmentCount;
 if(terrain?.status!=='invalid'&&Number.isInteger(axes)&&Number.isInteger(fragments)&&axes>=0&&fragments>=0&&axes!==fragments){
  return `${format(axes)} ${axes===1?'asse':'assi'} · ${format(fragments)} ${fragments===1?'tratto':'tratti'}`;
 }
 return format(rowCount);
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
 return [terrainQuantityBasisText(terrain),terrainUsesCertifiedQuantities(terrain)?'Lunghezze sul terreno misurate':'Lunghezze sul terreno',terrainTheoreticalBasisText(terrain),source.label||source.id,source.resolutionM?`${source.resolutionM} m`:null,source.surveyEpoch?`Epoca ${source.surveyEpoch}`:null].filter(Boolean).join(' · ');
}
