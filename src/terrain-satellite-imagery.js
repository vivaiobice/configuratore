import {satelliteSources} from './satellite-style.js?v=1.3.6';

const cancelled=()=>new DOMException('Caricamento satellitare annullato.','AbortError');
// The atlas shares the basemap's provider and Mercator grid. Bounds come from
// every native vertex, including the terrain support beyond the field perimeter.
export function satelliteAtlasPlan(scene,{zoom=18,maxTextureSize=4096,maxTiles=64,source=satelliteSources().satellite}={}){
 if(!source?.tiles?.length||!source.tiles.every(url=>typeof url==='string'))throw new Error('Sorgente satellitare non disponibile.');
 const tileSize=source.tileSize??256,limit=Math.min(4096,maxTextureSize);
 if(!Number.isInteger(tileSize)||tileSize<1||limit<tileSize||!(maxTiles>=1))throw new Error('Dimensioni della texture satellitare non supportate.');
 const anchor=scene?.reference?.anchor,positions=scene?.positions;
 if(!anchor?.slice(0,2).every(Number.isFinite)||!positions?.length||positions.length%3)throw new Error('Copertura satellitare non valida.');
 let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
 for(let i=0;i<positions.length;i+=3){const x=anchor[0]+positions[i],y=anchor[1]+positions[i+1];xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
 if(![xmin,ymin,xmax,ymax].every(Number.isFinite)||xmin<0||xmax>1||ymin<0||ymax>1)throw new Error('Copertura satellitare fuori Mercatore.');
 const minZoom=Math.max(0,source.minzoom??0);
 for(let z=Math.max(minZoom,Math.min(source.maxzoom??19,Math.ceil(zoom)));z>=minZoom;z--){
  const scale=2**z,x0=Math.min(scale-1,Math.floor(xmin*scale)),y0=Math.min(scale-1,Math.floor(ymin*scale));
  const x1=Math.max(x0,Math.min(scale-1,Math.ceil(xmax*scale-1e-8)-1)),y1=Math.max(y0,Math.min(scale-1,Math.ceil(ymax*scale-1e-8)-1));
  const columns=x1-x0+1,rows=y1-y0+1;
  if(columns*rows>Math.min(64,maxTiles)||columns*tileSize>limit||rows*tileSize>limit)continue;
  const tiles=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const template=source.tiles[(x+y)%source.tiles.length],tileY=source.scheme==='tms'?scale-y-1:y;
   tiles.push({x,y,left:(x-x0)*tileSize,top:(y-y0)*tileSize,url:template.replaceAll('{z}',String(z)).replaceAll('{x}',String(x)).replaceAll('{y}',String(tileY)).replaceAll('{ratio}','')});
  }
  return {zoom:z,width:columns*tileSize,height:rows*tileSize,tileSize,tiles,coverage:[x0/scale,y0/scale,(x1+1)/scale,(y1+1)/scale],attribution:source.attribution??''};
 }
 throw new Error('Copertura satellitare oltre i limiti della texture.');
}

export function satelliteUVs(scene,coverage){
 const [left,top,right,bottom]=coverage,anchor=scene.reference.anchor,result=new Float32Array(scene.positions.length);
 if(!(right>left&&bottom>top))throw new Error('Copertura della texture satellitare non valida.');
 // Subtract the world anchor in double precision; never store full world
 // coordinates in a float attribute at field zoom. Height is intentionally unused.
 const offsetX=anchor[0]-left,offsetY=anchor[1]-top;
 for(let i=0;i<result.length;i+=3){result[i]=(scene.positions[i]+offsetX)/(right-left);result[i+1]=(scene.positions[i+1]+offsetY)/(bottom-top);}
 return result;
}

export function createSatelliteImageryClient({scene,source=satelliteSources().satellite,zoom=18,maxTextureSize=4096,maxTiles=64,concurrency=4,timeoutMs=15000,fetchImpl=(...args)=>fetch(...args),decodeImage=blob=>createImageBitmap(blob),canvasFactory=()=>document.createElement('canvas')}={}){
 const controller=new AbortController();let canvas=null,destroyed=false,timer=null,settled=false,rejectReady;
 const ready=new Promise((resolve,reject)=>{
  rejectReady=reject;
  (async()=>{
   try{
    const plan=satelliteAtlasPlan(scene,{source,zoom,maxTextureSize,maxTiles});canvas=canvasFactory();canvas.width=plan.width;canvas.height=plan.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Composizione satellitare non disponibile.');
    timer=setTimeout(()=>{controller.abort();settled=true;if(canvas){canvas.width=0;canvas.height=0;}reject(new Error('Tempo di caricamento satellitare esaurito.'));},timeoutMs);
    let next=0;
    async function load(){
     while(next<plan.tiles.length){
      if(controller.signal.aborted)throw cancelled();const tile=plan.tiles[next++];
      const response=await fetchImpl(tile.url,{signal:controller.signal,mode:'cors',credentials:'omit'});
      if(controller.signal.aborted)throw cancelled();
      if(!response.ok)throw new Error(`Immagine satellitare non disponibile (${response.status}).`);
      const blob=await response.blob();if(controller.signal.aborted)throw cancelled();
      const image=await decodeImage(blob);
      try{if(controller.signal.aborted)throw cancelled();if(!(image.width>0&&image.height>0))throw new Error('Immagine satellitare non valida.');context.drawImage(image,tile.left,tile.top,plan.tileSize,plan.tileSize);}finally{image.close?.();}
     }
    }
    await Promise.all(Array.from({length:Math.min(plan.tiles.length,Math.max(1,Math.min(4,Math.floor(concurrency))))},load));
    if(controller.signal.aborted||destroyed)throw cancelled();settled=true;resolve({...plan,image:canvas});
   }catch(error){controller.abort();if(canvas){canvas.width=0;canvas.height=0;}settled=true;reject(error);}
   finally{clearTimeout(timer);timer=null;}
  })();
 });
 ready.catch(()=>{});
 return {ready,destroy(){if(destroyed)return;destroyed=true;controller.abort();clearTimeout(timer);timer=null;if(!settled)rejectReady(cancelled());if(canvas){canvas.width=0;canvas.height=0;canvas=null;}}};
}
