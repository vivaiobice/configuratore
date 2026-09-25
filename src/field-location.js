import {interiorLabelPoint} from './geometry.js?v=51';

export function normalizeFieldLocation(address={}){
  const municipality=String(address.City||address.District||address.Neighborhood||'').trim();
  if(!municipality)return null;
  return {
    locationLabel:String(address.Match_addr||address.LongLabel||municipality).trim(),
    municipality,
    province:String(address.Subregion||'').trim(),
    region:String(address.Region||'').trim()
  };
}

export function buildFieldReverseGeocodeUrl(point){
  const url=new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode');
  url.searchParams.set('f','json');
  url.searchParams.set('location',point.join(','));
  url.searchParams.set('langCode','it');
  url.searchParams.set('featureTypes','StreetInt,StreetAddress,Locality');
  return url.toString();
}

export async function resolveFieldLocation(field,{fetchImpl=globalThis.fetch,timeoutMs=6000}={}){
  const point=interiorLabelPoint(field?.geometry);
  if(!point||typeof fetchImpl!=='function')return null;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(buildFieldReverseGeocodeUrl(point),{
      headers:{Accept:'application/json'},signal:controller.signal
    });
    if(!response.ok)return null;
    return normalizeFieldLocation((await response.json())?.address);
  }catch{return null;}finally{clearTimeout(timeout);}
}

function geometrySignature(field){
  return `${String(field?.id??field?.clientFieldId??'')}|${JSON.stringify(field?.geometry??null)}`;
}

export function createFieldLocationCoordinator({resolve=resolveFieldLocation,getField=null,getActiveField=()=>null,apply=()=>{}}={}){
  const requestTokens=new Map();
  return {
    async refresh(field){
      if(!field?.id&&!field?.clientFieldId)return null;
      const fieldId=String(field.id??field.clientFieldId);
      const signature=geometrySignature(field);
      const token=(requestTokens.get(fieldId)??0)+1;requestTokens.set(fieldId,token);
      const location=await resolve(field);
      const current=typeof getField==='function'?getField(fieldId):getActiveField();
      if(!location||token!==requestTokens.get(fieldId)||geometrySignature(current)!==signature)return null;
      const patch={
        locationLabel:String(location.locationLabel??''),municipality:String(location.municipality??''),
        province:String(location.province??''),region:String(location.region??'')
      };
      apply(patch,field);
      return patch;
    },
    invalidate(fieldId){
      if(fieldId!==undefined){const id=String(fieldId);requestTokens.set(id,(requestTokens.get(id)??0)+1);return;}
      for(const [id,token] of requestTokens)requestTokens.set(id,token+1);
    }
  };
}
