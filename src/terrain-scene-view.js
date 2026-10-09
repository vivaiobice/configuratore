import {createTerrainCameraControls} from './terrain-camera-controls.js?v=1.3.5';
import {createSatelliteImageryClient,satelliteAtlasPlan,satelliteUVs} from './terrain-satellite-imagery.js?v=1.3.5';
import {satelliteSources} from './satellite-style.js?v=1.3.5';
// Native scene presentation uses only MapLibre's public custom-layer contract.
// The calculator's frozen vertices and lifted lines arrive from a separate worker.
let viewSequence=0,requestSequence=0;
const aborted=()=>new DOMException('Vista 3D chiusa.','AbortError');
export function createTerrainSceneClient({model,geometry,rows=[],exclusions=[],rowPortions=[],workerFactory=()=>typeof Worker==='function'?new Worker(new URL('./terrain-scene-worker.js?v=1.3.5',import.meta.url),{type:'module'}):null}){
 let worker=null,timer=null,settled=false,destroyed=false,resolveReady,rejectReady;
 const id=++requestSequence,ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
 function retire(){
  clearTimeout(timer);timer=null;
  if(worker){const current=worker;worker=null;current.removeEventListener?.('message',message);current.removeEventListener?.('error',failure);current.terminate();}
 }
 function fail(error){if(settled)return;settled=true;retire();rejectReady(error);}
 function failure(event){fail(new Error(event?.message??'Worker della scena 3D non disponibile.'));}
 function message({data}){
  if(settled||destroyed||data?.id!==id)return;
  if(data.type==='error'){fail(new Error(data.message??'Scena 3D non disponibile.'));return;}
  if(data.type!=='scene')return;
  settled=true;retire();resolveReady(data.scene);
 }
 try{
  worker=workerFactory();if(!worker)throw new Error('Worker della scena 3D non disponibile.');
  worker.addEventListener('message',message);worker.addEventListener('error',failure);
  timer=setTimeout(()=>fail(new Error('Preparazione della scena 3D non disponibile.')),15000);
  worker.postMessage({type:'build',id,scene:{model,geometry,rows,exclusions,rowPortions}});
 }catch(error){fail(error);}
 return {ready,destroy(){if(destroyed)return;destroyed=true;if(!settled)fail(aborted());else retire();}};
}

function copyCamera(camera){return {...camera,center:[...camera.center],padding:camera.padding==null?camera.padding:{...camera.padding}};}
function cameraSnapshot(map){const center=map.getCenter();return copyCamera({center:[center.lng,center.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),padding:map.getPadding?.()});}
function validateScene(scene,model){
 if(!(scene?.positions instanceof Float32Array)||!(scene.normals instanceof Float32Array)||!(scene.indices instanceof Uint32Array)||!(scene.linePositions instanceof Float32Array)||!(scene.lineColors instanceof Float32Array)||scene.positions.length%3||scene.normals.length!==scene.positions.length||scene.indices.length%3||scene.linePositions.length%3||scene.lineColors.length!==scene.linePositions.length)throw new Error('Buffer della scena 3D non validi.');
 const reference=scene.reference;
 if(!reference?.anchor?.every(Number.isFinite)||reference.anchor.length!==3||!Number.isFinite(reference.height)||!(reference.metersToMercator>0)||!Number.isFinite(reference.metersToMercator)||scene.modelHash!==model.contentHash)throw new Error('Riferimento della scena 3D non valido.');
 if(!Array.isArray(scene.lineRanges)||scene.lineRanges.some(range=>!['field','rows','exclusions','portions'].includes(range.kind)||!Number.isSafeInteger(range.offset)||range.offset<0||!Number.isSafeInteger(range.count)||range.count<0||range.count%2||range.offset+range.count>scene.linePositions.length/3))throw new Error('Linee della scena 3D non valide.');
}
function rebaseMatrix(matrix,anchor){
 const result=Array.from(matrix);
 // Apply translation while the public camera matrix still has double precision.
 // Multiplying a float matrix by the world anchor loses precision at field zoom.
 for(let row=0;row<4;row++)result[12+row]=matrix[row]*anchor[0]+matrix[4+row]*anchor[1]+matrix[8+row]*anchor[2]+matrix[12+row];
 return result;
}
function mercator([lng,lat]){return [(lng+180)/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2];}
function surfaceProjector({map,scene,sample,getMatrix}){
 return point=>{
  const coordinate=Array.isArray(point)?point:[point?.lng,point?.lat],matrix=getMatrix();
  if(!matrix||coordinate.length!==2||!coordinate.every(Number.isFinite))return null;
  let height;try{height=sample(coordinate);}catch{return null;}if(!Number.isFinite(height))return null;
  const reference=scene.reference,[mx,my]=mercator(coordinate),x=mx-reference.anchor[0],y=my-reference.anchor[1],z=(height-reference.height)*reference.metersToMercator;
  const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];if(!(w>0))return null;
  const px=(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w,py=(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w;
  const host=map.getContainer?.()??map.getCanvas?.(),width=host?.clientWidth,heightCSS=host?.clientHeight;
  if(!(width>0&&heightCSS>0)||!Number.isFinite(px)||!Number.isFinite(py))return null;
  return {x:(px+1)*width/2,y:(1-py)*heightCSS/2};
 };
}

function nativeLayer({id,scene,imagery,getVisibility,onRemoved,onFailure}){
 let context=null,surface=null,lines=null,vaoAPI=null,lastMatrix=null,texture=null;
 const buffers=[],programs=[],shaders=new Set(),vaos=[];
 const binding=(gl,name)=>gl.getParameter&&name!==undefined?gl.getParameter(name):null;
 function dispose(){
  if(!context)return;
  for(const vao of vaos.splice(0))vaoAPI?.remove(vao);
  for(const buffer of buffers.splice(0))context.deleteBuffer(buffer);
  for(const program of programs.splice(0))context.deleteProgram(program);
  for(const shader of shaders)context.deleteShader(shader);shaders.clear();
  if(texture){context.deleteTexture(texture);texture=null;}
  surface=null;lines=null;lastMatrix=null;context=null;
 }
 function shader(gl,type,source){
  const value=gl.createShader(type);if(!value)throw new Error('Shader WebGL non disponibile.');shaders.add(value);gl.shaderSource(value,source);gl.compileShader(value);
  if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(`Shader WebGL non valido. ${gl.getShaderInfoLog(value)??''}`);return value;
 }
 function program(gl,vertexSource,fragmentSource){
  const vertex=shader(gl,gl.VERTEX_SHADER,vertexSource),fragment=shader(gl,gl.FRAGMENT_SHADER,fragmentSource),value=gl.createProgram();
  if(!value)throw new Error('Programma WebGL non disponibile.');programs.push(value);gl.attachShader(value,vertex);gl.attachShader(value,fragment);gl.linkProgram(value);
  if(!gl.getProgramParameter(value,gl.LINK_STATUS))throw new Error(`Programma WebGL non valido. ${gl.getProgramInfoLog(value)??''}`);
  for(const part of [vertex,fragment]){gl.detachShader?.(value,part);gl.deleteShader(part);shaders.delete(part);}return value;
 }
 function buffer(gl,target,data){const value=gl.createBuffer();if(!value)throw new Error('Buffer WebGL non disponibile.');buffers.push(value);gl.bindBuffer(target,value);gl.bufferData(target,data,gl.STATIC_DRAW);return value;}
 function attributes(gl,draw){
  for(const [location,value] of [[draw.position,draw.positions],[draw.detail,draw.details]])if(location>=0){gl.bindBuffer(gl.ARRAY_BUFFER,value);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);}
  if(draw.indices)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,draw.indices);
 }
 function attributeSnapshot(gl){
  if(vaoAPI||!gl.getVertexAttrib)return null;
  return [...new Set([surface.position,surface.detail,lines.position,lines.detail])].filter(index=>index>=0).map(index=>({index,enabled:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_ENABLED),buffer:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),size:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_SIZE),type:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_TYPE),normalized:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),stride:gl.getVertexAttrib(index,gl.VERTEX_ATTRIB_ARRAY_STRIDE),offset:gl.getVertexAttribOffset(index,gl.VERTEX_ATTRIB_ARRAY_POINTER)}));
 }
 function restoreAttributes(gl,previous){
  if(previous){for(const state of previous){if(state.buffer){gl.bindBuffer(gl.ARRAY_BUFFER,state.buffer);gl.vertexAttribPointer(state.index,state.size,state.type,state.normalized,state.stride,state.offset);}gl[state.enabled?'enableVertexAttribArray':'disableVertexAttribArray'](state.index);}}
  else if(!vaoAPI)for(const location of new Set([surface.position,surface.detail,lines.position,lines.detail]))if(location>=0)gl.disableVertexAttribArray(location);
 }
 function uploadImagery(gl,atlas){
  const activeTexture=binding(gl,gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);
  const previousTexture=binding(gl,gl.TEXTURE_BINDING_2D),previousFlip=binding(gl,gl.UNPACK_FLIP_Y_WEBGL),previousAlignment=binding(gl,gl.UNPACK_ALIGNMENT);
  try{
   const limit=binding(gl,gl.MAX_TEXTURE_SIZE);if(limit>0&&(atlas.width>limit||atlas.height>limit))throw new Error('Texture satellitare oltre i limiti WebGL.');
   if(!texture){texture=gl.createTexture();if(!texture)throw new Error('Texture satellitare non disponibile.');}
   gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas.image);
  }finally{
   gl.bindTexture(gl.TEXTURE_2D,previousTexture);if(activeTexture!=null)gl.activeTexture(activeTexture);
   if(previousFlip!=null)gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,previousFlip);if(previousAlignment!=null)gl.pixelStorei(gl.UNPACK_ALIGNMENT,previousAlignment);
  }
 }
 return {
  updateImagery(atlas){
   if(!context||!surface)return;const gl=context,previousArray=binding(gl,gl.ARRAY_BUFFER_BINDING);
   try{uploadImagery(gl,atlas);gl.bindBuffer(gl.ARRAY_BUFFER,surface.details);gl.bufferData(gl.ARRAY_BUFFER,satelliteUVs(scene,atlas.coverage),gl.STATIC_DRAW);}
   finally{gl.bindBuffer(gl.ARRAY_BUFFER,previousArray);}
  },
  id,type:'custom',renderingMode:'3d',dispose,getMatrix:()=>lastMatrix,
  onAdd(_map,gl){
   context=gl;const webgl2=typeof gl.createVertexArray==='function';
   const previousArray=binding(gl,gl.ARRAY_BUFFER_BINDING),previousElements=binding(gl,gl.ELEMENT_ARRAY_BUFFER_BINDING);
   let previousVAO=null;
   try{
    if(!webgl2&&!gl.getExtension('OES_element_index_uint'))throw new Error('WebGL con indici nativi a 32 bit non disponibile.');
    const extension=!webgl2?gl.getExtension('OES_vertex_array_object'):null;
    vaoAPI=webgl2?{create:()=>gl.createVertexArray(),bind:value=>gl.bindVertexArray(value),remove:value=>gl.deleteVertexArray(value),binding:gl.VERTEX_ARRAY_BINDING}:extension?{create:()=>extension.createVertexArrayOES(),bind:value=>extension.bindVertexArrayOES(value),remove:value=>extension.deleteVertexArrayOES(value),binding:extension.VERTEX_ARRAY_BINDING_OES}:null;
    previousVAO=vaoAPI?binding(gl,vaoAPI.binding):null;
    const version=webgl2?'#version 300 es\n':'',attribute=webgl2?'in':'attribute',varyingOut=webgl2?'out':'varying',varyingIn=webgl2?'in':'varying',output=webgl2?'out vec4 outColor;':'',color=webgl2?'outColor':'gl_FragColor';
    const makeDraw=(detailName,detailData,vertexBody,fragmentBody)=>{
     const value=program(gl,`${version}precision highp float; ${attribute} vec3 a_position; ${attribute} vec3 ${detailName}; uniform mat4 u_matrix; ${varyingOut} vec3 v_detail; void main(){gl_Position=u_matrix*vec4(a_position,1.0);v_detail=${vertexBody};}`,`${version}precision mediump float; ${varyingIn} vec3 v_detail; ${output} ${detailName==='a_uv'?'uniform sampler2D u_satellite;':''} void main(){${fragmentBody.replaceAll('OUTPUT',color)}}`);
     const draw={program:value,position:gl.getAttribLocation(value,'a_position'),detail:gl.getAttribLocation(value,detailName),matrix:gl.getUniformLocation(value,'u_matrix'),sampler:detailName==='a_uv'?gl.getUniformLocation(value,'u_satellite'):null,vao:null};
     if(vaoAPI){draw.vao=vaoAPI.create();if(!draw.vao)throw new Error('VAO WebGL non disponibile.');vaos.push(draw.vao);vaoAPI.bind(draw.vao);}
     draw.positions=buffer(gl,gl.ARRAY_BUFFER,detailName==='a_uv'?scene.positions:scene.linePositions);draw.details=buffer(gl,gl.ARRAY_BUFFER,detailData);
     if(detailName==='a_uv')draw.indices=buffer(gl,gl.ELEMENT_ARRAY_BUFFER,scene.indices);
     if(vaoAPI)attributes(gl,draw);return draw;
    };
    surface=makeDraw('a_uv',satelliteUVs(scene,imagery.coverage),'a_uv',`OUTPUT=${webgl2?'texture':'texture2D'}(u_satellite,v_detail.xy);`);
    uploadImagery(gl,imagery);
    lines=makeDraw('a_color',scene.lineColors,'a_color','OUTPUT=vec4(v_detail,1.0);');
   }catch(error){dispose();throw error;}
   finally{vaoAPI?.bind(previousVAO);gl.bindBuffer(gl.ARRAY_BUFFER,previousArray);if(!vaoAPI)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,previousElements);}
  },
  render(gl,matrix){
   if(!surface||!lines)return;
   if(matrix?.length!==16){onFailure(new Error('Matrice pubblica della mappa non disponibile.'));return;}
   const previousVAO=vaoAPI?binding(gl,vaoAPI.binding):null,previousArray=binding(gl,gl.ARRAY_BUFFER_BINDING),previousElements=binding(gl,gl.ELEMENT_ARRAY_BUFFER_BINDING),previousProgram=binding(gl,gl.CURRENT_PROGRAM),previousAttributes=attributeSnapshot(gl),previousActiveTexture=binding(gl,gl.ACTIVE_TEXTURE);
   gl.activeTexture(gl.TEXTURE0);const previousTexture=binding(gl,gl.TEXTURE_BINDING_2D);
   try{
    lastMatrix=rebaseMatrix(matrix,scene.reference.anchor);const uniform=new Float32Array(lastMatrix),visibility=getVisibility()??{};
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
    if(visibility.field!==false&&scene.indices.length){
     gl.useProgram(surface.program);if(vaoAPI)vaoAPI.bind(surface.vao);else attributes(gl,surface);gl.uniformMatrix4fv(surface.matrix,false,uniform);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(surface.sampler,0);
     // Depth bias changes rasterization only; native vertex heights stay intact.
     gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);gl.drawElements(gl.TRIANGLES,scene.indices.length,gl.UNSIGNED_INT,0);gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.useProgram(lines.program);if(vaoAPI)vaoAPI.bind(lines.vao);else attributes(gl,lines);gl.uniformMatrix4fv(lines.matrix,false,uniform);gl.depthMask(false);gl.lineWidth(1);
    for(const range of scene.lineRanges)if((range.kind==='rows'?visibility.schema:visibility.field)!==false&&range.count)gl.drawArrays(gl.LINES,range.offset,range.count);
   }catch(error){onFailure(error);}
   finally{
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.depthMask(true);restoreAttributes(gl,previousAttributes);vaoAPI?.bind(previousVAO);gl.bindBuffer(gl.ARRAY_BUFFER,previousArray);if(!vaoAPI)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,previousElements);gl.useProgram(previousProgram);gl.bindTexture(gl.TEXTURE_2D,previousTexture);if(previousActiveTexture!=null)gl.activeTexture(previousActiveTexture);
   }
  },
  onRemove(){dispose();onRemoved();}
 };
}

export function createTerrainMeshView({map,model,geometry,rows=[],exclusions=[],rowPortions=[],gesturePolicy=null,onStatus=()=>{},onError=()=>{},getVisibility=()=>({field:true,schema:true,quotes:true}),onSceneActive=()=>{},sceneClientFactory=createTerrainSceneClient,imageryClientFactory=createSatelliteImageryClient,onReturn2D=null}){
 const id=`obice-native-terrain-${++viewSequence}`;
 let generation=0,disposed=false,active=false,opening=null,client=null,imageryClient=null,pendingImagery=null,pendingImageryZoom=null,imageryZoom=null,imagerySequence=0,refreshImagery=null,snapshot=null,cameraControls=null,layer=null,layerAdded=false,closing=false;
 function close(){
  if(disposed)return;
  generation++;opening=null;const previous=layer,wasActive=active;layer=null;active=false;client?.destroy();client=null;imageryClient?.destroy();imageryClient=null;pendingImagery?.destroy();pendingImagery=null;pendingImageryZoom=null;imagerySequence++;if(refreshImagery)map.off?.('moveend',refreshImagery);refreshImagery=null;map.stop?.();closing=true;
  try{if(layerAdded&&map.getLayer?.(id))map.removeLayer(id);else previous?.dispose();}
  finally{
   layerAdded=false;closing=false;
   try{cameraControls?.destroy();}finally{cameraControls=null;if(snapshot){map.jumpTo(copyCamera(snapshot));snapshot=null;}if(wasActive)onSceneActive(false,null);}
  }
 }
 function disposeRemovedMap(){
  if(disposed)return;
  // MapLibre has already deleted its style when the public remove event fires.
  // Free owned resources without camera writes or style-dependent UI callbacks.
  disposed=true;generation++;opening=null;active=false;client?.destroy();client=null;imageryClient?.destroy();imageryClient=null;pendingImagery?.destroy();pendingImagery=null;pendingImageryZoom=null;imagerySequence++;if(refreshImagery)map.off?.('moveend',refreshImagery);refreshImagery=null;
  layer?.dispose();layer=null;layerAdded=false;snapshot=null;
  const controls=cameraControls;cameraControls=null;controls?.destroy({restoreCamera:false});
  map.off?.('remove',disposeRemovedMap);
 }
 async function start(){
  const sequence=++generation;
  try{
   if(!map?.addLayer||!map?.removeLayer)throw new Error('Vista 3D nativa non supportata.');
   const graphics=sceneClientFactory({model,geometry,rows,exclusions,rowPortions});client=graphics;
   const [scene,{createTerrainSampler}]=await Promise.all([graphics.ready,import('./terrain-model.js?v=1.3.5')]);if(disposed||sequence!==generation)return;
   validateScene(scene,model);const sample=createTerrainSampler(model);
   const source=map.getStyle?.()?.sources?.satellite??satelliteSources().satellite;
   const canvas=map.getCanvas?.(),gl=canvas?.getContext?.('webgl2')??canvas?.getContext?.('webgl'),maxTextureSize=gl?.getParameter(gl.MAX_TEXTURE_SIZE)??4096;
   onStatus('Caricamento immagini satellitari sulla superficie nativa…');
   const loader=imageryClientFactory({scene,source,zoom:map.getZoom(),maxTextureSize});imageryClient=loader;
   const imagery=await loader.ready;if(disposed||sequence!==generation)return;imageryZoom=imagery.zoom;
   map.stop?.();snapshot=cameraSnapshot(map);
   const failure=error=>{queueMicrotask(()=>{if(!disposed&&sequence===generation){close();onError(error);}});};
   layer=nativeLayer({id,scene,imagery,getVisibility,onFailure:failure,onRemoved:()=>{layerAdded=false;if(!closing&&active&&!disposed&&sequence===generation){close();onError(new Error('Livello della scena 3D rimosso.'));}}});
   const projector=surfaceProjector({map,scene,sample,getMatrix:layer.getMatrix});map.addLayer(layer);layerAdded=true;active=true;onSceneActive(true,projector);cameraControls=createTerrainCameraControls({map,reference:scene.reference,gesturePolicy,onReturn2D:()=>{close();onReturn2D?.();}});map.triggerRepaint?.();onStatus(`Quote relative al centro del campo · scala verticale ×1. · ${imagery.attribution.replace(/<[^>]*>/g,'')}`);
   refreshImagery=()=>{
    if(!active||disposed||sequence!==generation)return;
    let plan;try{plan=satelliteAtlasPlan(scene,{source,zoom:map.getZoom(),maxTextureSize});}catch(error){failure(error);return;}
    if(plan.zoom===imageryZoom){pendingImagery?.destroy();pendingImagery=null;pendingImageryZoom=null;imagerySequence++;return;}
    if(plan.zoom===pendingImageryZoom)return;
    pendingImagery?.destroy();const request=++imagerySequence,next=imageryClientFactory({scene,source,zoom:map.getZoom(),maxTextureSize});pendingImagery=next;pendingImageryZoom=plan.zoom;
    next.ready.then(atlas=>{
     if(!active||disposed||sequence!==generation||request!==imagerySequence)return;
     try{layer.updateImagery(atlas);const previous=imageryClient;imageryClient=next;pendingImagery=null;pendingImageryZoom=null;imageryZoom=atlas.zoom;previous?.destroy();map.triggerRepaint?.();}
     catch(error){failure(error);}
    },error=>{if(active&&!disposed&&sequence===generation&&request===imagerySequence&&error?.name!=='AbortError')failure(error);});
   };map.on?.('moveend',refreshImagery);
  }catch(error){if(sequence===generation){close();throw error;}if(error?.name!=='AbortError')throw error;}
 }
 function open(){if(disposed)return Promise.reject(new Error('Vista 3D chiusa.'));if(active)return Promise.resolve();if(opening)return opening;const task=start();opening=task;return task.finally(()=>{if(opening===task)opening=null;});}
 map.on?.('remove',disposeRemovedMap);
 return {open,close,destroy(){if(disposed)return;close();disposed=true;map.off?.('remove',disposeRemovedMap);}};
}

// Default presentation is one continuous native terrain surface.
export {createTerrainNativeView as createTerrainSceneView} from './terrain-native-view.js?v=1.3.5';
