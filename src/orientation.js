export function normalizeOrientationDeg(value,fallback=0){
  const normalized=typeof value==='string'?value.trim().replace(',','.'):value;
  const parsed=Number(normalized);
  const base=Number.isFinite(parsed)?parsed:Number(fallback);
  return Math.round(Math.max(0,Math.min(179.9,Number.isFinite(base)?base:0))*10)/10;
}

export function formatOrientationDeg(value){
  return normalizeOrientationDeg(value).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1});
}
