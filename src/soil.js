import {pointInPolygon} from './geometry.js?v=45';

export const SOIL_WMS='https://geomap.reteunitaria.piemonte.it/ws/agrigeo/rp-01/carsuowms/wms_carsuo';
export const SOIL_LAYERS=Object.freeze({soil:'CartaSuoli',texture:'TessituraTopsoil',limestone:'CalcareTopsoil',drainage:'Drenaggio',reaction:'ReazioneTopsoil'});
export const SOIL_SOURCE='Regione Piemonte · Carta dei suoli 1:50.000';

function request(viewport,layer,operation){
  const name=SOIL_LAYERS[layer];if(!name)throw new TypeError('Unknown soil layer');
  const {west,south,east,north,width,height}=viewport??{};
  if(![west,south,east,north,width,height].every(v=>Number.isFinite(Number(v)))||Number(width)<1||Number(height)<1)throw new TypeError('Invalid soil viewport');
  const url=new URL(SOIL_WMS);const params={SERVICE:'WMS',VERSION:'1.1.1',REQUEST:operation,LAYERS:name,SRS:'EPSG:4326',BBOX:[west,south,east,north].join(','),WIDTH:String(Math.min(2048,Math.round(width))),HEIGHT:String(Math.min(2048,Math.round(height)))};
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  return url;
}
export function buildSoilMapUrl(viewport,layer='soil'){
  const url=request(viewport,layer,'GetMap');url.searchParams.set('STYLES','');url.searchParams.set('FORMAT','image/png');url.searchParams.set('TRANSPARENT','TRUE');return url.toString();
}
export function buildSoilIdentifyUrl(viewport,point,layer='soil'){
  const url=request(viewport,layer,'GetFeatureInfo');url.searchParams.set('QUERY_LAYERS',SOIL_LAYERS[layer]);url.searchParams.set('INFO_FORMAT','text/plain');url.searchParams.set('FEATURE_COUNT','1');
  url.searchParams.set('X',String(Math.max(0,Math.min(Math.round(Number(viewport.width)-1),Math.round(Number(point?.x)||0)))));
  url.searchParams.set('Y',String(Math.max(0,Math.min(Math.round(Number(viewport.height)-1),Math.round(Number(point?.y)||0)))));return url.toString();
}
export function parseSoilResponse(payload){
  const text=String(payload??'');if(!text||/ServiceException|ExceptionReport|no features|nessun risultato|no data/i.test(text))return null;
  const result={};
  for(const line of text.split(/\r?\n/)){
    const match=line.match(/^\s*([\w\sÀ-ÿ.-]{2,45})\s*[:=]\s*"?(.{1,250}?)"?\s*$/);if(!match)continue;
    const key=match[1].toLowerCase().trim(),value=match[2].replace(/^"|"$/g,'').trim();
    if(!value||/^(null|undefined|n\/a)$/i.test(value))continue;
    if(/descriz|tessitura|classe|denomin|nome|reazione|calcare|drenaggio/.test(key)&&!result.description)result.description=value;
    else if(/codice|^cod$|^id$/.test(key)&&!result.code)result.code=value;
  }
  return Object.keys(result).length?result:null;
}
export function soilSamplePoints(ring){
  if(!Array.isArray(ring)||ring.length<4)return [];
  const xs=ring.map(p=>Number(p?.[0])),ys=ring.map(p=>Number(p?.[1]));if([...xs,...ys].some(v=>!Number.isFinite(v)))return [];
  const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys),points=[];
  for(const y of [.25,.5,.75])for(const x of [.25,.5,.75]){const point=[left+(right-left)*x,bottom+(top-bottom)*y];if(pointInPolygon(point,ring))points.push(point);}
  return points.slice(0,9);
}
export function soilGeometrySignature(ring){return Array.isArray(ring)?ring.map(point=>Array.isArray(point)?point.map(value=>Number(value).toFixed(6)).join(','):'').join(';'):'';}
export function soilProfileIsCurrent(profile,ring){return Boolean(profile?.geometrySignature&&profile.geometrySignature===soilGeometrySignature(ring));}
export function normalizeSoilProfile(value){
  if(!value||typeof value!=='object')return null;
  const layer=SOIL_LAYERS[value.layer]?value.layer:'soil';const description=String(value.description??'').trim().slice(0,250);
  if(!description)return null;
  return {layer,description,code:String(value.code??'').trim().slice(0,80),samples:Math.min(9,Math.max(1,Number(value.samples)||1)),source:SOIL_SOURCE,scale:'1:50.000',observedAt:String(value.observedAt??''),geometrySignature:String(value.geometrySignature??''),indicative:true};
}
