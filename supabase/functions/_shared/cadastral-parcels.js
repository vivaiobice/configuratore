import {parseNationalCadastralReference} from './cadastral-wms.js';
import {MUNICIPALITIES} from './cadastral-municipalities.js';
const CORS={'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'apikey, authorization, content-type, x-region'};
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...CORS,'content-type':'application/json','cache-control':'no-store'}});
const decode=value=>String(value??'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
export function parseParcelCollection(xml){
 if(!/<(?:\w+:)?FeatureCollection\b/i.test(xml)||/<(?:\w+:)?Exception(?:Report)?\b/i.test(xml))throw new Error('Risposta catastale non valida');
 const members=[...xml.matchAll(/<(?:\w+:)?member\b[^>]*>([\s\S]*?)<\/(?:\w+:)?member>/gi)];
 const returned=xml.match(/\bnumberReturned=["'](\d+)["']/i)?.[1];
 if(returned!=null&&Number(returned)!==members.length)throw new Error('Risposta catastale incompleta');
 const matched=xml.match(/\bnumberMatched=["']([^"']+)["']/i)?.[1];
 const parcels=members.map(([,member])=>{
  const reference=decode(member.match(/<(?:\w+:)?nationalCadastralReference\b[^>]*>([\s\S]*?)<\/(?:\w+:)?nationalCadastralReference>/i)?.[1]).trim();
  const parsed=parseNationalCadastralReference(reference);if(!parsed)throw new Error('Riferimento catastale non riconosciuto');
  const polygons=[...member.matchAll(/<(?:\w+:)?Polygon\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Polygon>/gi)].map(([,polygon])=>{
   const rings=[...polygon.matchAll(/<(?:\w+:)?(?:exterior|interior)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:exterior|interior)>/gi)].map(([,ring])=>{
    const pos=ring.match(/<(?:\w+:)?posList\b[^>]*>([\s\S]*?)<\/(?:\w+:)?posList>/i)?.[1];
    const numbers=String(pos??'').trim().split(/\s+/).map(Number);if(numbers.length<6||numbers.length%2||numbers.some(n=>!Number.isFinite(n)))throw new Error('Geometria catastale non valida');
    const points=[];for(let i=0;i<numbers.length;i+=2)points.push([numbers[i+1],numbers[i]]);
    if(points.some(([x,y])=>x<5.5||x>19.5||y<34||y>48.5))throw new Error('Coordinate catastali non valide');
    if(points[0][0]!==points.at(-1)[0]||points[0][1]!==points.at(-1)[1])points.push([...points[0]]);return points;
   });if(!rings.length)throw new Error('Perimetro catastale non disponibile');return rings;
  });if(!polygons.length)throw new Error('Perimetro catastale non disponibile');
  return {id:reference,reference,polygons,...parsed,municipality:MUNICIPALITIES[parsed.municipalityCode]||parsed.municipalityCode};
 });
 return {parcels,matched:matched&&/^\d+$/.test(matched)?Number(matched):null,returned:members.length};
}
export async function handleCadastralParcels(request,{allowedKeys=[],fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(request.method!=='GET')return json(405,{error:'Metodo non consentito'});
 if(!allowedKeys.filter(Boolean).includes(request.headers.get('apikey')))return json(401,{error:'Chiave applicazione richiesta'});
 const url=new URL(request.url),bounds=['west','south','east','north'].map(name=>url.searchParams.get(name));
 if(bounds.some(value=>value==null||value.trim()===''))return json(400,{error:'Area non valida'});
 const [west,south,east,north]=bounds.map(Number);
 if(![west,south,east,north].every(Number.isFinite)||west<5.5||east>19.5||south<34||north>48.5||west>=east||south>=north||east-west>.05||north-south>.05)return json(400,{error:'Area catastale troppo estesa o non valida'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),24000);let calls=0;
 const parcels=new Map();
 async function collect(w,s,e,n,depth=0){
  if(++calls>25||depth>6)throw new Error('Troppe particelle: restringi il perimetro e riprova');
  const endpoint=new URL('https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php');
  for(const [key,value] of Object.entries({language:'ita',SERVICE:'WFS',VERSION:'2.0.0',REQUEST:'GetFeature',TYPENAMES:'CP:CadastralParcel',SRSNAME:'urn:ogc:def:crs:EPSG::6706',BBOX:[s,w,n,e].join(','),COUNT:'100'}))endpoint.searchParams.set(key,value);
  const response=await fetchImpl(endpoint,{signal:controller.signal});if(!response.ok)throw new Error('Servizio catastale temporaneamente non disponibile');
  const text=await response.text();if(text.length>6000000)throw new Error('Risposta catastale troppo estesa');
  const result=parseParcelCollection(text);
  if(result.returned>=100||(result.matched!=null&&result.matched>result.returned)){
   const mx=(w+e)/2,my=(s+n)/2;await collect(w,s,mx,my,depth+1);await collect(mx,s,e,my,depth+1);await collect(w,my,mx,n,depth+1);await collect(mx,my,e,n,depth+1);return;
  }
  for(const parcel of result.parcels)parcels.set(parcel.reference,parcel);
 }
 try{await collect(west,south,east,north);return json(200,{complete:true,parcels:[...parcels.values()],source:'Agenzia delle Entrate · WFS INSPIRE · CC BY 4.0',municipalitySource:'ISTAT · Elenco comuni italiani · 2026-10-01',retrievedAt:now().toISOString()});}
 catch(error){return json(502,{complete:false,error:error.message||'Catasto non disponibile. I dati esistenti sono conservati.'});}
 finally{clearTimeout(timer);}
}
