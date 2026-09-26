import {buildSoilMapUrl,buildSoilIdentifyUrl,parseSoilResponse,soilSamplePoints,normalizeSoilProfile,soilGeometrySignature} from './soil.js?v=55.1';

const SOURCE='piemonte-soil-image',LAYER='piemonte-soil-overlay';
export function createSoilMapController({map,fetchImpl=globalThis.fetch,onStatus=()=>{},onObservation=()=>{}}={}){
  if(!map)throw new TypeError('Map required');
  let active=false,layer='texture',destroyed=false,controller=null,sequence=0;
  const cache=new Map();
  async function read(url,signal,{refresh=false}={}){
    if(!refresh&&cache.has(url))return cache.get(url);
    const response=await fetchImpl(url,{signal,headers:{accept:'text/plain'}});
    if(!response.ok)throw new Error(`Servizio suoli non disponibile (${response.status})`);
    const result=parseSoilResponse(await response.text());
    if(result){cache.delete(url);cache.set(url,result);if(cache.size>64)cache.delete(cache.keys().next().value);}
    return result;
  }
  function viewport(){
    const bounds=map.getBounds(),canvas=map.getCanvas(),dpr=Math.min(2,globalThis.devicePixelRatio||1);
    return {west:bounds.getWest(),south:bounds.getSouth(),east:bounds.getEast(),north:bounds.getNorth(),width:Math.min(2048,Math.max(1,Math.round((canvas.clientWidth||canvas.width||1)*dpr))),height:Math.min(2048,Math.max(1,Math.round((canvas.clientHeight||canvas.height||1)*dpr))),clientWidth:Math.max(1,canvas.clientWidth||canvas.width||1),clientHeight:Math.max(1,canvas.clientHeight||canvas.height||1)};
  }
  function refresh(){
    if(destroyed)return;
    if(!active){if(map.getLayer?.(LAYER))map.setLayoutProperty?.(LAYER,'visibility','none');return;}
    if(!map.loaded?.())return;
    const v=viewport(),url=buildSoilMapUrl(v,layer),coordinates=[[v.west,v.north],[v.east,v.north],[v.east,v.south],[v.west,v.south]];
    const source=map.getSource?.(SOURCE);if(source?.updateImage)source.updateImage({url,coordinates});else if(!source)map.addSource(SOURCE,{type:'image',url,coordinates});
    if(!map.getLayer?.(LAYER))map.addLayer({id:LAYER,type:'raster',source:SOURCE,layout:{visibility:'visible'},paint:{'raster-opacity':.55,'raster-fade-duration':0}},map.getLayer?.('vineyard-rows-line')?'vineyard-rows-line':undefined);
    else map.setLayoutProperty?.(LAYER,'visibility','visible');
  }
  function setActive(value){active=Boolean(value);controller?.abort();sequence++;refresh();if(!active)onObservation(null,layer);onStatus(active?'Carta dei suoli Regione Piemonte · CC BY 4.0 · 1:50.000 · dato indicativo':'');}
  function setLayer(value){if(!['soil','texture','limestone','drainage','reaction'].includes(value))return;layer=value;controller?.abort();sequence++;refresh();}
  async function query(point,signal){
    const v=viewport(),coord={x:point.x*v.width/v.clientWidth,y:point.y*v.height/v.clientHeight};
    return read(buildSoilIdentifyUrl(v,coord,layer),signal);
  }
  async function queryCoordinate([lon,lat],signal,options){
    const width=256,height=256,offset=.0006;
    const url=buildSoilIdentifyUrl({west:lon-offset,south:lat-offset,east:lon+offset,north:lat+offset,width,height},{x:128,y:128},layer);
    return read(url,signal,options);
  }
  async function inspect(event){
    if(!active||!event?.point)return null;
    controller?.abort();controller=new AbortController();const current=++sequence;
    try{const result=await query(event.point,controller.signal);if(current!==sequence)return null;onObservation(result,layer);onStatus(result?.description??'Dato pedologico non disponibile nel punto selezionato.');return result;}
    catch(error){if(current===sequence&&error.name!=='AbortError'){onObservation(null,layer);onStatus('Dati del suolo temporaneamente non disponibili');}return null;}
  }
  async function analyze(ring,{refresh=false}={}){
    const points=soilSamplePoints(ring);if(!points.length){onStatus('Per analizzare il suolo disegna prima un campo.');return null;}
    controller?.abort();controller=new AbortController();const current=++sequence;const frequencies=new Map();let queried=0;
    try{
      for(const coordinate of points){
        if(current!==sequence)return null;
        const info=await queryCoordinate(coordinate,controller.signal,{refresh});if(info?.description){queried++;const key=info.soilUnit||info.code||info.description;const entry=frequencies.get(key)??{count:0,info};entry.count++;frequencies.set(key,entry);}
      }
      if(current!==sequence)return null;
      if(!queried){onStatus('Nessun dato sui suoli disponibile per questo campo.');return null;}
      const ranked=[...frequencies.values()].sort((a,b)=>b.count-a.count);
      const major=ranked[0].info,units=ranked.map(({info})=>({description:info.description,code:info.code??''}));
      const profile=normalizeSoilProfile({...major,layer,samples:queried,units,retrievedAt:new Date().toISOString(),geometrySignature:soilGeometrySignature(ring)});
      onStatus(`${major.description} · ${queried} punti consultati${units.length>1?' · Nel campo sono presenti più unità pedologiche.':''} · dato indicativo`);return profile;
    }catch(error){if(current===sequence&&error.name!=='AbortError')onStatus('Dati del suolo temporaneamente non disponibili');return null;}
  }
  function moved(){if(active)refresh();}
  function loaded(){if(active)refresh();}
  function error(event){if(active&&event?.sourceId===SOURCE)onStatus('Carta dei suoli non disponibile. Controlla la connessione o riprova più tardi.');}
  map.on?.('moveend',moved);map.on?.('resize',moved);map.on?.('load',loaded);map.on?.('click',inspect);map.on?.('error',error);
  return {setActive,setLayer,refresh,analyze,inspect,isActive:()=>active,destroy(){if(destroyed)return;setActive(false);destroyed=true;controller?.abort();for(const [event,fn] of [['moveend',moved],['resize',moved],['load',loaded],['click',inspect],['error',error]])map.off?.(event,fn);}};
}
