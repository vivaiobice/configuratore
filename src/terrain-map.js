import {createTerrainSceneView} from './terrain-scene-view.js?v=1.3.4';
// Rendering-only adapter: never read renderer elevations back into the calculator.
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
export async function frozenSurface(model){
 const [{createTerrainSampler,validateTerrainModel},{toUTM,fromUTM}]=await Promise.all([import('./terrain-model.js?v=1.3.4'),import('./coordinate-system.js?v=1.3.4')]);
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
export function createTerrainMapView(options){return createTerrainSceneView(options);}
