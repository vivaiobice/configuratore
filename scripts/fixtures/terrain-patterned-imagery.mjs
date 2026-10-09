// Anonymous, spatially varying aerial-test raster. The pattern is continuous
// across tile boundaries and levels because it is defined in world Mercator.
import {deflateSync} from 'node:zlib';
export const imageryPalette=[[34,145,186],[164,48,121],[177,123,35],[44,65,150],[52,126,81],[114,68,166],[23,107,136],[151,74,53]];
export function imageryColor(worldX,worldY){
 const x=worldX*256*2**18,y=worldY*256*2**18;
 const strip=Math.floor(x/32),block=Math.floor(y/40);
 // Asymmetric world-cell hash rejects the old four-color repeating aliases.
 let hash=(Math.imul(strip,73856093)^Math.imul(block,19349663))>>>0;
 hash=Math.imul(hash^(hash>>>16),2246822507);
 hash=Math.imul(hash^(hash>>>13),3266489909);
 hash=(hash^(hash>>>16))>>>0;
 return imageryPalette[hash%imageryPalette.length];
}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function fixturePng(colorAt,{size=256}={}){
 const width=size,height=size,scanlines=Buffer.alloc(height*(width*4+1));
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  scanlines.set(colorAt(px,py),py*(width*4+1)+1+px*4);
 }
 const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}
export function imageryPng({z=18,x=0,y=0,transparent=false}={}){
 return fixturePng((px,py)=>transparent?[0,0,0,0]:[...imageryColor((x+(px+.5)/256)/2**z,(y+(py+.5)/256)/2**z),255]);
}
export const fixtureMercator=([lng,lat])=>[(lng+180)/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2];
export const fixtureLngLat=([x,y])=>[x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];
export function fixtureSurface({anchor,altitude=120}){
 const worldAnchor=fixtureMercator(anchor),metersPerWorld=2*Math.PI*6378137*Math.cos(anchor[1]*Math.PI/180);
 const heightAtWorld=(wx,wy)=>{
  const x=(wx-worldAnchor[0])*metersPerWorld,y=(worldAnchor[1]-wy)*metersPerWorld;
  return altitude+28*Math.sin(x/280)+18*Math.sin(y/320)+10*Math.sin((x+y)/170);
 };
 return {worldAnchor,metersPerWorld,heightAtWorld,heightAt:coordinate=>heightAtWorld(...fixtureMercator(coordinate))};
}
export function terrariumPng({z,x,y,surface}){
 return fixturePng((px,py)=>{
  const height=surface.heightAtWorld((x+(px+.5)/256)/2**z,(y+(py+.5)/256)/2**z),encoded=Math.round((height+32768)*256);
  return [(encoded>>>16)&255,(encoded>>>8)&255,encoded&255,255];
 });
}
