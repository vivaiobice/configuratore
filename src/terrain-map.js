// Rendering-only adapter: never read renderer elevations back into the calculator.
let viewSequence=0;
export function encodeTerrainHeight(height){
 if(!Number.isFinite(height)||height< -32768||height>=32768)throw new RangeError('Quota grafica non valida.');
 const encoded=Math.round((height+32768)*256);return [(encoded>>>16)&255,(encoded>>>8)&255,encoded&255,255];
}
function tileCoordinate(z,x,y,column,row,size){const n=2**z,u=(x+(column+.5)/size)/n,v=(y+(row+.5)/size)/n;return [u*360-180,Math.atan(Math.sinh(Math.PI*(1-2*v)))*180/Math.PI];}
export function buildTerrainTilePixels({z,x,y,size=256},heightAt){
 if(!Number.isInteger(z)||z<0||z>22||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=2**z||y>=2**z||!Number.isInteger(size)||size<1||size>256)throw new RangeError('Tile del terreno non valido.');
 const pixels=new Uint8ClampedArray(size*size*4);
 for(let row=0;row<size;row++)for(let column=0;column<size;column++){const rgba=encodeTerrainHeight(heightAt(tileCoordinate(z,x,y,column,row,size)));pixels.set(rgba,(row*size+column)*4);}return pixels;
}
async function canvasPNG(pixels,size){
 const canvas=globalThis.document.createElement('canvas');canvas.width=size;canvas.height=size;
 const context=canvas.getContext('2d');if(!context)throw new Error('Canvas non disponibile.');const image=context.createImageData(size,size);image.data.set(pixels);context.putImageData(image,0,0);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Immagine terreno non disponibile.')),'image/png'));
 canvas.width=0;canvas.height=0;return blob.arrayBuffer();
}
async function frozenSurface(model){
 const [{createTerrainSampler,validateTerrainModel},{toUTM,fromUTM}]=await Promise.all([import('./terrain-model.js?v=1.3.1-prova.1'),import('./coordinate-system.js?v=1.3.1-prova.1')]);
 const validation=validateTerrainModel(model);if(!validation.valid&&!validation.ok)throw new Error('Modello del terreno non valido.');
 const {origin,step,width,height}=model.grid;const epsg=Number(model.crs.split(':')[1]);
 const xs=[origin[0],origin[0]+step[0]*(width-1)],ys=[origin[1],origin[1]+step[1]*(height-1)];const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 const corners=[[xmin,ymin],[xmin,ymax],[xmax,ymin],[xmax,ymax]].map(point=>fromUTM(point,epsg));
 const bounds=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
 // Tile padding repeats the nearest frozen edge for display only. The source
 // bounds restrict the preview; calculator support and quantities stay untouched.
 const sample=createTerrainSampler(model);
 const heightAt=coordinate=>{const metric=toUTM(coordinate,epsg);const clamped=[Math.max(xmin+1e-6,Math.min(xmax-1e-6,metric[0])),Math.max(ymin+1e-6,Math.min(ymax-1e-6,metric[1]))];const value=sample(fromUTM(clamped,epsg));if(value==null)throw new Error('Copertura grafica incompleta.');return value;};
 return {heightAt,bounds};
}
export function createTerrainMapView({map,model,onStatus=()=>{},library=globalThis.maplibregl,heightAt=null,bounds=null,encodePNG=canvasPNG}){
 const id=`obice-terrain-${++viewSequence}`,scheme=`obice-dem-${viewSequence}`;let active=false,disposed=false,snapshot=null,generation=0,registered=false;const cache=new Map();
 function close(){
  generation++;if(active){map.setTerrain(snapshot?.terrain??null);if(map.getSource(id))map.removeSource(id);map.jumpTo(snapshot.camera);active=false;}
  if(registered){library.removeProtocol(scheme);registered=false;}cache.clear();snapshot=null;
 }
 async function open(){
  if(disposed)throw new Error('Anteprima chiusa.');if(active)return;const sequence=++generation;
  if(!map?.setTerrain||!library?.addProtocol)throw new Error('Terreno 3D non supportato.');
  if(!heightAt||!bounds){const surface=await frozenSurface(model);heightAt=surface.heightAt;bounds=surface.bounds;}
  if(sequence!==generation||disposed)return;
  const center=map.getCenter();snapshot={terrain:map.getTerrain?.()??null,camera:{center:[center.lng,center.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),padding:map.getPadding?.()}};
  try{
   library.addProtocol(scheme,async(request,abortController)=>{
    if(disposed||!registered||abortController?.signal?.aborted)throw new DOMException('Anteprima chiusa.','AbortError');
    const match=request.url.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)\.png(?:\?.*)?$/);if(!match)throw new Error('Tile locale non valido.');
    const key=match.slice(1).join('/');if(cache.has(key))return {data:cache.get(key).slice(0)};
    const pixels=buildTerrainTilePixels({z:Number(match[1]),x:Number(match[2]),y:Number(match[3]),size:256},heightAt);
    const data=await encodePNG(pixels,256);if(!registered||abortController?.signal?.aborted)throw new DOMException('Anteprima chiusa.','AbortError');
    cache.set(key,data);if(cache.size>8)cache.delete(cache.keys().next().value);return {data:data.slice(0)};
   });registered=true;
   map.addSource(id,{type:'raster-dem',tiles:[`${scheme}://tiles/{z}/{x}/{y}.png`],tileSize:256,encoding:'terrarium',minzoom:0,maxzoom:18,bounds});
   active=true;map.setTerrain({source:id,exaggeration:1});map.jumpTo({pitch:55});onStatus('Vista 3D approssimata dalla griglia congelata · altezza reale ×1.');
  }catch(error){close();throw error;}
 }
 return {open,close,destroy(){close();disposed=true;}};
}
