import {pointInPolygon} from './geometry.js';
import {APP_CONFIG} from './config.js?v=1.2.5';
import {normalizeCadastralReferences} from './cadastral-references.js';
export const cadastralGeometrySignature=ring=>JSON.stringify(ring??null);
function closed(ring){const points=(ring??[]).map(point=>point.map(Number));if(points.length&&JSON.stringify(points[0])!==JSON.stringify(points.at(-1)))points.push([...points[0]]);return points;}
function onSegment(a,b,p){const cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);return Math.abs(cross)<1e-14&&p[0]>=Math.min(a[0],b[0])-1e-12&&p[0]<=Math.max(a[0],b[0])+1e-12&&p[1]>=Math.min(a[1],b[1])-1e-12&&p[1]<=Math.max(a[1],b[1])+1e-12;}
function crossing(a,b,c,d){const side=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b)||(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0);}
export function intersectsParcel(field,parcel){
 const ring=closed(field);if(ring.length<4)return false;
 return (parcel.polygons??[]).some(polygon=>{
  const rings=polygon.map(closed);if(!rings[0]?.length)return false;
  for(const boundary of rings)for(let i=1;i<ring.length;i++)for(let j=1;j<boundary.length;j++)if(crossing(ring[i-1],ring[i],boundary[j-1],boundary[j]))return true;
  return ring.some(point=>pointInPolygon(point,rings[0])&&!rings.slice(1).some(hole=>pointInPolygon(point,hole)))||rings[0].some(point=>pointInPolygon(point,ring));
 });
}
export function mergeAutomaticReferences(existing,incoming){
 const manual=normalizeCadastralReferences(existing).filter(ref=>ref.source!=='automatic');
 const keys=new Set(manual.map(ref=>ref.lookupKey).filter(Boolean));
 const tuple=ref=>[ref.municipality,ref.section||'',ref.sheet,ref.parcel].map(value=>String(value??'').toLowerCase()).join('|');
 const values=new Set(manual.map(tuple));
 return normalizeCadastralReferences([...manual,...incoming.filter(ref=>!keys.has(ref.lookupKey)&&!values.has(tuple(ref)))]);
}
export async function resolveFieldCadastre(field,{fetchImpl=globalThis.fetch}={}){
 const ring=field.geometry;if(!Array.isArray(ring)||ring.length<4)throw new Error('Disegna prima il perimetro del campo.');
 const xs=ring.map(p=>Number(p[0])),ys=ring.map(p=>Number(p[1]));const url=new URL(`${APP_CONFIG.supabaseUrl}/functions/v1/cadastral-parcels`);
 for(const [key,value] of Object.entries({west:Math.min(...xs),east:Math.max(...xs),south:Math.min(...ys),north:Math.max(...ys)}))url.searchParams.set(key,String(value));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetchImpl(url,{headers:{apikey:APP_CONFIG.supabasePublishableKey,'x-region':'eu-west-1'},signal:controller.signal});const data=await response.json();if(!response.ok||data.complete!==true||!Array.isArray(data.parcels))throw new Error(data.error||'Catasto non disponibile. I riferimenti presenti sono conservati.');
 return {complete:true,references:data.parcels.filter(parcel=>intersectsParcel(ring,parcel)).map(parcel=>({source:'automatic',municipality:parcel.municipality,municipalityCode:parcel.municipalityCode,section:parcel.section||'',sheet:String(parcel.sheet),parcel:String(parcel.parcel),reference:parcel.reference,lookupKey:parcel.reference,retrievedAt:data.retrievedAt,sourceLabel:data.source}))};}
 finally{clearTimeout(timer);}
}
export function createCadastralCoordinator({getField,resolve=resolveFieldCadastre,apply,onStatus=()=>{},getScope=()=>''}){
 const versions=new Map(),success=new Map();let generation=0;
 return {invalidate(){generation++;versions.clear();success.clear();},async refresh(field,{force=false}={}){
  const id=String(field?.id??''),signature=cadastralGeometrySignature(field?.geometry);if(!id||!field?.geometry)return;
  if(!force&&success.get(id)===signature)return;
  const scope=getScope();const epoch=generation,sequence=(versions.get(id)??0)+1;versions.set(id,sequence);onStatus('loading',id);
  try{const result=await resolve(field);const current=getField(id);if(scope!==getScope()||epoch!==generation||versions.get(id)!==sequence||!current||cadastralGeometrySignature(current.geometry)!==signature)return;
   if(result.complete!==true)throw new Error('Risposta catastale incompleta. I riferimenti presenti sono conservati.');
   // An empty cartographic response can indicate a coverage gap: never erase existing values.
   if(!result.references.length){onStatus('empty',id);return;}
   apply(mergeAutomaticReferences(current.cadastralRefs,result.references),current);success.set(id,signature);onStatus('ready',id,result.references.length);
  }catch(error){if(epoch===generation&&versions.get(id)===sequence)onStatus('error',id,error.message||'Catasto non disponibile.');}
 }};
}
