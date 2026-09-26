import {pointInPolygon} from './geometry.js?v=45';

export const SOIL_WMS='https://geomap.reteunitaria.piemonte.it/ws/agrigeo/rp-01/carsuowms/wms_carsuo';
export const SOIL_LAYERS=Object.freeze({soil:'CartaSuoli',texture:'TessituraTopsoil',limestone:'CalcareTopsoil',drainage:'Drenaggio',reaction:'ReazioneTopsoil'});
export const SOIL_SOURCE='Regione Piemonte · Carta dei suoli 1:50.000';
export const SOIL_DISCLAIMER='Le caratteristiche riportate derivano da cartografia e modelli territoriali e hanno valore indicativo. Per la progettazione agronomica definitiva è consigliata un\'analisi del terreno effettuata su campione.';
export const SOIL_LAYER_LABELS=Object.freeze({soil:'Carta dei suoli',texture:'Tessitura superficiale',limestone:'Calcare superficiale',drainage:'Drenaggio',reaction:'Reazione superficiale'});

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
    const key=match[1].toLowerCase().trim().replace(/[\s.-]+/g,'_'),value=match[2].replace(/^"|"$/g,'').trim();
    if(!value||/^(null|undefined|n\/a)$/i.test(value))continue;
    if(/^(unita_pedologica|unita_di_suolo|soil_unit)$/.test(key))result.soilUnit=value;
    else if(/^(tipo_suolo|tipo_di_suolo|soil_type)$/.test(key))result.soilType=value;
    else if(/^(tessitura|texture|tessitura_topsoil)$/.test(key))result.texture=value;
    else if(/^(descrizione|descriz|denominazione|nome)$/.test(key))result.description=value;
    else if(/^(codice|cod|id)$/.test(key))result.code=value;
    else if(/^(sabbia|sabbia_pct|sand)$/.test(key))assignNumber(result,'sand',value,0,100);
    else if(/^(limo|limo_pct|silt)$/.test(key))assignNumber(result,'silt',value,0,100);
    else if(/^(argilla|argilla_pct|clay)$/.test(key))assignNumber(result,'clay',value,0,100);
    else if(/^(ph|reazione_ph)$/.test(key))assignNumber(result,'ph',value,0,14);
    else if(/^(calcare|calcare_topsoil|limestone)$/.test(key))result.limestone=value;
    else if(/^(sostanza_organica|carbonio_organico|organic_matter)$/.test(key))result.organicMatter=value;
    else if(/^(scheletro|skeleton)$/.test(key))result.skeleton=value;
    else if(/^(drenaggio|drainage)$/.test(key))result.drainage=value;
    else if(/^(reazione|reazione_topsoil)$/.test(key))result.reaction=value;
  }
  if(!result.description)result.description=result.texture||result.soilType||result.soilUnit||result.limestone||result.drainage||result.reaction;
  if(!result.description)delete result.description;
  return Object.keys(result).length?result:null;
}
function assignNumber(target,key,value,min,max){const text=String(value).trim().replace(',','.').replace(/\s*%$/,'');if(!text||!/^\d+(?:\.\d+)?$/.test(text))return;const parsed=Number(text);if(Number.isFinite(parsed)&&parsed>=min&&parsed<=max)target[key]=parsed;}
export function soilSamplePoints(ring){
  if(!Array.isArray(ring)||ring.length<4)return [];
  const xs=ring.map(p=>Number(p?.[0])),ys=ring.map(p=>Number(p?.[1]));if([...xs,...ys].some(v=>!Number.isFinite(v)))return [];
  const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys),points=[];
  for(const y of [.25,.5,.75])for(const x of [.25,.5,.75]){const point=[left+(right-left)*x,bottom+(top-bottom)*y];if(pointInPolygon(point,ring))points.push(point);}
  return points.slice(0,9);
}
export function soilGeometrySignature(ring){return Array.isArray(ring)?ring.map(point=>Array.isArray(point)?point.map(value=>Number(value).toFixed(6)).join(','):'').join(';'):'';}
export function soilProfileIsCurrent(profile,ring){const signature=profile?.cartographic?.geometrySignature??profile?.geometrySignature;return Boolean(signature&&signature===soilGeometrySignature(ring));}
export function normalizeSoilProfile(value){
  if(!value||typeof value!=='object')return null;
  const raw=value.cartographic??value;
  const layer=SOIL_LAYERS[raw.layer]?raw.layer:'soil';const description=String(raw.description??raw.texture??raw.soilType??raw.soilUnit??'').trim().slice(0,250);
  if(!description)return null;
  const cartographic={layer,description,code:String(raw.code??'').trim().slice(0,80),samples:Math.min(9,Math.max(1,Number(raw.samples)||1)),source:SOIL_SOURCE,scale:'1:50.000',retrievedAt:String(raw.retrievedAt??raw.observedAt??''),geometrySignature:String(raw.geometrySignature??''),indicative:true};
  for(const key of ['soilUnit','soilType','texture','limestone','organicMatter','skeleton','drainage','reaction'])cartographic[key]=raw[key]==null?null:String(raw[key]).trim().slice(0,250)||null;
  for(const key of ['sand','silt','clay','ph']){cartographic[key]=null;if(raw[key]!=null)assignNumber(cartographic,key,raw[key],0,key==='ph'?14:100);}
  cartographic.units=Array.isArray(raw.units)?raw.units.slice(0,9).map(unit=>({description:String(unit?.description??'').slice(0,250),code:String(unit?.code??'').slice(0,80)})).filter(unit=>unit.description):[];
  return {cartographic,labAnalysis:value.labAnalysis??null};
}
export function soilRows(data){
  if(!data)return [];
  return [['Unità pedologica',data.soilUnit],['Tipo di suolo',data.soilType],['Tessitura',data.texture],['Sabbia',data.sand==null?null:`${data.sand}%`],['Limo',data.silt==null?null:`${data.silt}%`],['Argilla',data.clay==null?null:`${data.clay}%`],['pH',data.ph==null?null:String(data.ph).replace('.',',')],['Calcare',data.limestone],['Sostanza organica / carbonio',data.organicMatter],['Scheletro',data.skeleton],['Drenaggio',data.drainage],['Reazione',data.reaction]].filter(([,value])=>value!=null&&value!=='');
}
