const INVALID_MESSAGE='Coordinate non valide. Usa latitudine, longitudine (es. 44.972361, 7.963694) oppure gradi, minuti e secondi con N/S ed E/W.';
const NUMBER='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const DECIMAL_PAIR=new RegExp(`^(${NUMBER})\\s*,\\s*(${NUMBER})$`);
const DMS_AXIS='(\\d+)\\s*°\\s*(\\d+)\\s*\'\\s*(\\d+(?:\\.\\d+)?)\\s*"\\s*([NSEW])';
const DMS_PAIR=new RegExp(`^${DMS_AXIS}\\s*[,;]?\\s*${DMS_AXIS}$`,'i');

// Keep coordinate-looking input local even while the user is still typing or
// has mixed/invalid axis notation. Ordinary named and numbered addresses pass.
function coordinateIntent(value){
 return /^(?:lat(?:itude)?|lon(?:gitude)?|lng)\s*[:=]/i.test(value)
  || (/^(?:[NSEW]\s*)?[+-]?\d/i.test(value)&&/\d\s*[°'"]/.test(value))
  || (/\d/.test(value)&&/^[\d\s.,;:+\-()NSEW]+$/i.test(value))
  || new RegExp(`^${NUMBER}\\s*[,;]\\s*(?:${NUMBER}|NaN|Infinity)`,'i').test(value);
}

/** Decimal input is latitude,longitude; DMS axis order is set by hemispheres. */
export function parseCoordinateSearch(query){
 const label=String(query??'').trim();
 const value=label.replace(/[º]/g,'°').replace(/[′’‘]/g,"'").replace(/[″“”]/g,'"').replace(/−/g,'-');
 const invalid=()=>({kind:'invalid',message:INVALID_MESSAGE});
 const result=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180
  ?{kind:'coordinate',result:{kind:'coordinate',lat,lon,label}}:invalid();
 const decimal=value.match(DECIMAL_PAIR);
 if(decimal)return result(Number(decimal[1]),Number(decimal[2]));
 const dms=value.match(DMS_PAIR);
 if(dms){
  const axes={};
  for(const offset of [1,5]){
   const degrees=Number(dms[offset]),minutes=Number(dms[offset+1]),seconds=Number(dms[offset+2]),hemisphere=dms[offset+3].toUpperCase();
   const axis=/[NS]/.test(hemisphere)?'lat':'lon',limit=axis==='lat'?90:180;
   if(axis in axes||minutes>=60||seconds>=60||degrees>limit||(degrees===limit&&(minutes!==0||seconds!==0)))return invalid();
   axes[axis]=(degrees+minutes/60+seconds/3600)*(/[SW]/.test(hemisphere)?-1:1);
  }
  return result(axes.lat,axes.lon);
 }
 return coordinateIntent(value)?invalid():{kind:'address'};
}
