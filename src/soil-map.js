import {buildSoilMapUrl,buildSoilIdentifyUrl,parseSoilResponse,soilSamplePoints,normalizeSoilProfile,soilGeometrySignature} from './soil.js?v=55';

const SOURCE='piemonte-soil-image',LAYER='piemonte-soil-overlay';
export function createSoilMapController({map,fetchImpl=globalThis.fetch,onStatus=()=>{},onObservation=()=>{}}={}){
  if(!map)throw new TypeError('Map required');
  let active=false,layer='texture',destroyed=false,controller=null,sequence=0;
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
  function setActive(value){active=Boolean(value);controller?.abort();sequence++;refresh();onStatus(active?'Carta dei suoli Regione Piemonte · CC BY 4.0 · 1:50.000 · dato indicativo':'');}
  function setLayer(value){if(!['soil','texture','limestone','drainage','reaction'].includes(value))return;layer=value;controller?.abort();sequence++;refresh();}
  async function query(point,signal){
    const v=viewport(),coord={x:point.x*v.width/v.clientWidth,y:point.y*v.height/v.clientHeight};
    const response=await fetchImpl(buildSoilIdentifyUrl(v,coord,layer),{signal,headers:{accept:'text/plain'}});
    if(!response.ok)throw new Error(`Servizio suoli non disponibile (${response.status})`);
    return parseSoilResponse(await response.text());
  }
  async function queryCoordinate([lon,lat],signal){
    const width=256,height=256,offset=.0006;
    const url=buildSoilIdentifyUrl({west:lon-offset,south:lat-offset,east:lon+offset,north:lat+offset,width,height},{x:128,y:128},layer);
    const response=await fetchImpl(url,{signal,headers:{accept:'text/plain'}});
    if(!response.ok)throw new Error(`Servizio suoli non disponibile (${response.status})`);
    return parseSoilResponse(await response.text());
  }
  async function inspect(event){
    if(!active||!event?.point)return null;
    controller?.abort();controller=new AbortController();const current=++sequence;
    try{const result=await query(event.point,controller.signal);if(current!==sequence)return null;onObservation(result,layer);onStatus(result?.description??'Dato pedologico non disponibile nel punto selezionato.');return result;}
    catch(error){if(current===sequence&&error.name!=='AbortError')onStatus('Servizio suoli non disponibile. Riprova più tardi.');return null;}
  }
  async function analyze(ring){
    const points=soilSamplePoints(ring);if(!points.length){onStatus('Per analizzare il suolo disegna prima un campo.');return null;}
    controller?.abort();controller=new AbortController();const current=++sequence;const frequencies=new Map();let queried=0;
    try{
      for(const coordinate of points){
        if(current!==sequence)return null;
        const info=await queryCoordinate(coordinate,controller.signal);if(info?.description){queried++;const key=info.description;const entry=frequencies.get(key)??{count:0,code:info.code??''};entry.count++;frequencies.set(key,entry);}
      }
      if(current!==sequence)return null;
      if(!queried){onStatus('Nessun dato sui suoli disponibile per questo campo.');return null;}
      const [description,major]=[...frequencies].sort((a,b)=>b[1].count-a[1].count)[0];
      const profile=normalizeSoilProfile({layer,description,code:major.code,samples:queried,observedAt:new Date().toISOString(),geometrySignature:soilGeometrySignature(ring)});onStatus(`${description} · ${queried} punti consultati · dato indicativo`);return profile;
    }catch(error){if(current===sequence&&error.name!=='AbortError')onStatus('Analisi suolo non disponibile. Verifica la connessione e riprova.');return null;}
  }
  function moved(){if(active)refresh();}
  function loaded(){if(active)refresh();}
  function error(event){if(active&&event?.sourceId===SOURCE)onStatus('Carta dei suoli non disponibile. Controlla la connessione o riprova più tardi.');}
  map.on?.('moveend',moved);map.on?.('resize',moved);map.on?.('load',loaded);map.on?.('click',inspect);map.on?.('error',error);
  return {setActive,setLayer,refresh,analyze,inspect,isActive:()=>active,destroy(){if(destroyed)return;setActive(false);destroyed=true;controller?.abort();for(const [event,fn] of [['moveend',moved],['resize',moved],['load',loaded],['click',inspect],['error',error]])map.off?.(event,fn);}};
}
