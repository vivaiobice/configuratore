// Anonymous, spatially varying aerial-test raster. The pattern is continuous
// across tile boundaries and levels because it is defined in world Mercator.
import {deflateSync} from 'node:zlib';
export const imageryPalette=[[34,179,206],[222,78,151],[239,185,55],[53,82,156]];
export function imageryColor(worldX,worldY){
 const x=worldX*256*2**18,y=worldY*256*2**18;
 const strip=Math.floor(x/24),block=Math.floor(y/48);
 return imageryPalette[((strip+block)%4+4)%4];
}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function imageryPng({z=18,x=0,y=0,transparent=false}={}){
 const width=256,height=256,scanlines=Buffer.alloc(height*(width*4+1));
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  const color=imageryColor((x+(px+.5)/256)/2**z,(y+(py+.5)/256)/2**z);
  scanlines.set(transparent?[0,0,0,0]:[...color,255],py*(width*4+1)+1+px*4);
 }
 const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}

// Runs inside Chromium. All wrapped calls forward to their real WebGL native.
export function installTerrainWebGLAcceptance(){
 window.__terrainGL={resources:[],surfaces:[]};window.__nativeImageryRequests=[];
 const nativeFetch=window.fetch;window.fetch=function(...args){const url=String(args[0]?.url??args[0]);if(url.includes('/World_Imagery/')&&new Error().stack.includes('terrain-satellite-imagery'))window.__nativeImageryRequests.push(url);return nativeFetch.apply(this,args);};
 const resources=new WeakMap(),buffers=new WeakMap(),programs=new WeakMap(),shaders=new WeakMap();
 let sequence=0;
 for(const prototype of [globalThis.WebGLRenderingContext?.prototype,globalThis.WebGL2RenderingContext?.prototype].filter(Boolean)){
  for(const kind of ['Buffer','Program','Shader','Texture','VertexArray']){
   const create='create'+kind,remove='delete'+kind;
   if(!prototype[create])continue;
   const original=prototype[create];prototype[create]=function(...args){const value=original.apply(this,args);if(value&&window.__terrainOwner){const record={id:++sequence,kind,owner:window.__terrainOwner,deleted:false};resources.set(value,record);__terrainGL.resources.push(record);}return value;};
   const destroy=prototype[remove];prototype[remove]=function(value){const record=resources.get(value);if(record)record.deleted=true;return destroy.call(this,value);};
  }
  const shaderSource=prototype.shaderSource;prototype.shaderSource=function(shader,source){shaders.set(shader,source);return shaderSource.call(this,shader,source);};
  const attachShader=prototype.attachShader;prototype.attachShader=function(program,shader){const list=programs.get(program)??[];list.push(shaders.get(shader));programs.set(program,list);return attachShader.call(this,program,shader);};
  const bufferData=prototype.bufferData;prototype.bufferData=function(target,data,...args){if(window.__terrainOwner&&ArrayBuffer.isView(data))buffers.set(this.getParameter(target===this.ARRAY_BUFFER?this.ARRAY_BUFFER_BINDING:this.ELEMENT_ARRAY_BUFFER_BINDING),Array.from(data));return bufferData.call(this,target,data,...args);};
  const draw=prototype.drawElements;prototype.drawElements=function(...args){
   const result=draw.apply(this,args);if(!window.__terrainOwner||!window.__captureTerrainSurface)return result;window.__captureTerrainSurface=false;
   const program=this.getParameter(this.CURRENT_PROGRAM),sources=programs.get(program)??[],position=this.getAttribLocation(program,'a_position'),uv=this.getAttribLocation(program,'a_uv');
   const get=index=>index<0?null:buffers.get(this.getVertexAttrib(index,this.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING));
   const vertices=get(position),uvs=get(uv),indices=buffers.get(this.getParameter(this.ELEMENT_ARRAY_BUFFER_BINDING));
   const texture=this.getParameter(this.TEXTURE_BINDING_2D),matrix=this.getUniform(program,this.getUniformLocation(program,'u_matrix'));
   const record={owner:window.__terrainOwner,count:args[1],shader:sources.join('\n'),texture:resources.get(texture)?.id??null,vertices,uvs,indices,matrix:matrix?Array.from(matrix):null,samples:[]};
   if(vertices&&indices&&matrix){
    for(let offset=0;offset<indices.length;offset+=Math.max(3,Math.floor(indices.length/50/3)*3)){
     const tri=indices.slice(offset,offset+3),point=[0,1,2].map(axis=>tri.reduce((sum,index)=>sum+vertices[index*3+axis]/3,0));
     const w=matrix[3]*point[0]+matrix[7]*point[1]+matrix[11]*point[2]+matrix[15];
     const px=(matrix[0]*point[0]+matrix[4]*point[1]+matrix[8]*point[2]+matrix[12])/w,py=(matrix[1]*point[0]+matrix[5]*point[1]+matrix[9]*point[2]+matrix[13])/w;
     if(w<=0||Math.abs(px)>.94||Math.abs(py)>.94)continue;
     const pixel=new Uint8Array(4),x=Math.floor((px+1)*this.drawingBufferWidth/2),y=Math.floor((py+1)*this.drawingBufferHeight/2);this.readPixels(x,y,1,1,this.RGBA,this.UNSIGNED_BYTE,pixel);
     record.samples.push({point,uv:uvs?[0,1].map(axis=>tri.reduce((sum,index)=>sum+uvs[index*3+axis]/3,0)):null,pixel:Array.from(pixel),screen:[x,this.drawingBufferHeight-y]});
    }
   }
   // Last completed real native face draw; bounded instrumentation only.
   const at=__terrainGL.surfaces.findIndex(value=>value.owner===record.owner);if(at<0)__terrainGL.surfaces.push(record);else __terrainGL.surfaces[at]=record;
   return result;
  };
 }
}
