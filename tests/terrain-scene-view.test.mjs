import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createMapGesturePolicy} from '../src/map-gestures.js';

const sceneAPI=await import('../src/terrain-scene-view.js').catch(error=>{
 if(error.code==='ERR_MODULE_NOT_FOUND')return {};
 throw error;
});
function createView(options){assert.equal(typeof sceneAPI.createTerrainSceneView,'function','native custom scene view is required');return sceneAPI.createTerrainSceneView(options);}
function createClient(options){assert.equal(typeof sceneAPI.createTerrainSceneClient,'function','native scene worker client is required');return sceneAPI.createTerrainSceneClient(options);}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
const mercator=([lng,lat])=>[(lng+180)/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2];
function input(){return {model:createTerrainModel({grid:{width:2,height:2,origin:[500000,5000010],step:[10,-10],values:[100,110,120,130]}}),geometry:[[0,0],[10,0],[10,10],[0,10],[0,0]].map(geo),rows:[],exclusions:[],rowPortions:[]};}
function sceneFor(model){
 const coordinate=geo([5,5]),anchor=[...mercator(coordinate),0],metersToMercator=1/(2*Math.PI*6378137*Math.cos(coordinate[1]*Math.PI/180));
 return {positions:new Float32Array([0,0,0,1e-6,0,0,0,1e-6,1e-7]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),indices:new Uint32Array([0,1,2]),linePositions:new Float32Array(24),lineColors:new Float32Array(24).fill(.8),lineRanges:[{kind:'field',id:'field',offset:0,count:2},{kind:'rows',id:'row',offset:2,count:2},{kind:'exclusions',id:'area',offset:4,count:2},{kind:'portions',id:'portion',offset:6,count:2}],reference:{coordinate,height:115,anchor,metersToMercator},bounds:[8.99,45.1,9.01,45.2],modelHash:model.contentHash,nativeVertexCount:3,nativeTriangleCount:1};
}
function graphics({webgl2=true,uint32=true,compile=true}={}){
 let serial=0;const owned=new Set(),deleted=[],uploads=[],draws=[],matrices=[],depth=[];
 const allocate=kind=>{const value={kind,id:++serial};owned.add(value);return value;};
 const dispose=value=>{if(value){assert.ok(owned.delete(value),'GPU resource must be released once');deleted.push(value);}};
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,ELEMENT_ARRAY_BUFFER:6,STATIC_DRAW:7,FLOAT:8,UNSIGNED_INT:9,TRIANGLES:10,LINES:11,DEPTH_TEST:12,BLEND:13,CULL_FACE:14,POLYGON_OFFSET_FILL:15,LEQUAL:16,DEPTH_BUFFER_BIT:17,
  createShader:()=>allocate('shader'),shaderSource(){},compileShader(){},getShaderParameter:()=>compile,getShaderInfoLog:()=> 'shader failure',deleteShader:dispose,
  createProgram:()=>allocate('program'),attachShader(){},detachShader(){},linkProgram(){},getProgramParameter:()=>true,getProgramInfoLog:()=>'',deleteProgram:dispose,
  createBuffer:()=>allocate('buffer'),bindBuffer(){},bufferData(target,data){uploads.push({target,data:Array.from(data),constructor:data.constructor.name});},deleteBuffer:dispose,
  getAttribLocation:(_program,name)=>({a_position:0,a_normal:1,a_color:1}[name]??2),getUniformLocation:(_program,name)=>name,useProgram(){},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(){},uniformMatrix4fv(_location,_transpose,matrix){matrices.push(Array.from(matrix));},uniform3f(){},uniform1f(){},
  enable(){},disable(){},depthFunc(){},depthMask(){},clearDepth(){},clear(bits){depth.push(bits);},polygonOffset(){},lineWidth(){},
  drawElements(mode,count,type,offset){draws.push({mode,count,type,offset});},drawArrays(mode,offset,count){draws.push({mode,count,offset});},
  getExtension:name=>name==='OES_element_index_uint'&&uint32?{}:null
 };
 if(webgl2){gl.createVertexArray=()=>allocate('vao');gl.bindVertexArray=()=>{};gl.deleteVertexArray=dispose;}
 return {gl,owned,deleted,uploads,draws,matrices,depth};
}
function mapFixture(options){
 const gpu=graphics(options),layers=new Map(),listeners=new Map(),container=new EventTarget();
 let camera={center:[9,45.1],zoom:17,pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}};
 const states={dragRotate:false,touchPitch:false,touchZoomRotate:true,scrollZoom:false,dragPan:true};
 const map={getCenter:()=>({lng:camera.center[0],lat:camera.center[1]}),getZoom:()=>camera.zoom,getPitch:()=>camera.pitch,getBearing:()=>camera.bearing,getPadding:()=>camera.padding,jumpTo(value){camera={...camera,...value};},stop(){},getCanvasContainer:()=>container,getCanvas:()=>({clientWidth:800,clientHeight:600,width:1600,height:1200}),getContainer:()=>({clientWidth:800,clientHeight:600}),
  addLayer(layer){assert.equal(layer.type,'custom');assert.equal(layer.renderingMode,'3d');layer.onAdd(map,gpu.gl);layers.set(layer.id,layer);},getLayer:id=>layers.get(id),removeLayer(id){const layer=layers.get(id);layers.delete(id);layer?.onRemove(map,gpu.gl);},
  on(name,callback){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);},off(name,callback){listeners.get(name)?.delete(callback);},triggerRepaint(){},
 };
 for(const [name,enabled] of Object.entries(states))map[name]={isEnabled:()=>states[name],enable:()=>states[name]=true,disable:()=>states[name]=false};
 map.touchZoomRotate.enableRotation=()=>{};map.touchZoomRotate.disableRotation=()=>{};
 return {map,gpu,layers,states,camera:()=>camera,emit(name){for(const callback of listeners.get(name)??[])callback();}};
}

test('native view allocates one custom layer lazily and restores camera handlers and GPU resources exactly once',async()=>{
 const f=mapFixture(),data=input(),scene=sceneFor(data.model),plane=structuredClone(f.camera()),handlers={...f.states},events=[];let clients=0,destroys=0;
 const gesturePolicy=createMapGesturePolicy({map:f.map});
 const view=createView({...data,map:f.map,gesturePolicy,onSceneActive:(active,projector)=>events.push({active,projector}),sceneClientFactory:()=>{clients++;return {ready:Promise.resolve(scene),destroy(){destroys++;}};}});
 assert.equal(clients,0);assert.equal(f.layers.size,0);
 await view.open();await view.open();assert.equal(clients,1);assert.equal(f.layers.size,1);assert.equal(f.camera().pitch,55);assert.equal(events.at(-1).active,true);assert.equal(typeof events.at(-1).projector,'function');
 f.map.jumpTo({center:[10,46],zoom:20,pitch:70,bearing:80});view.close();view.close();view.destroy();
 assert.deepEqual(f.camera(),plane);assert.deepEqual(f.states,handlers);assert.equal(f.layers.size,0);assert.equal(f.gpu.owned.size,0);assert.equal(destroys,1);assert.equal(events.filter(event=>event.active).length,1);assert.equal(events.at(-1).active,false);assert.equal(events.at(-1).projector,null);
 await assert.rejects(view.open(),/chiusa|closed/i);
});

test('native draw uploads unchanged arrays and rebases high zoom translation in double precision before float conversion',async()=>{
 const f=mapFixture(),data=input(),scene=sceneFor(data.model),before=structuredClone(scene);let visibility={field:true,schema:true,quotes:true};
 const view=createView({...data,map:f.map,getVisibility:()=>visibility,sceneClientFactory:()=>({ready:Promise.resolve(scene),destroy(){}})});await view.open();
 const layer=[...f.layers.values()][0],matrix=[2e7,0,0,0,0,2e7,0,0,0,0,1,0,-2e7*scene.reference.anchor[0],-2e7*scene.reference.anchor[1],0,1];
 layer.render(f.gpu.gl,matrix);
 assert.equal(f.gpu.matrices[0][12],0);assert.equal(f.gpu.matrices[0][13],0);
 assert.ok(f.gpu.uploads.some(upload=>upload.constructor==='Float32Array'&&JSON.stringify(upload.data)===JSON.stringify(Array.from(scene.positions))));
 assert.ok(f.gpu.draws.some(draw=>draw.mode===f.gpu.gl.TRIANGLES&&draw.count===3&&draw.type===f.gpu.gl.UNSIGNED_INT));
 assert.deepEqual(f.gpu.draws.filter(draw=>draw.mode===f.gpu.gl.LINES).map(draw=>draw.offset),[0,2,4,6]);
 assert.ok(f.gpu.depth.includes(f.gpu.gl.DEPTH_BUFFER_BIT),'the scene owns depth instead of being hidden by the flat basemap');
 visibility={field:false,schema:true,quotes:true};f.gpu.draws.length=0;layer.render(f.gpu.gl,matrix);
 assert.deepEqual(f.gpu.draws,[{mode:f.gpu.gl.LINES,count:2,offset:2}]);
 visibility={field:true,schema:false,quotes:true};f.gpu.draws.length=0;layer.render(f.gpu.gl,matrix);
 assert.deepEqual(f.gpu.draws.filter(draw=>draw.mode===f.gpu.gl.LINES).map(draw=>draw.offset),[0,4,6]);
 assert.deepEqual(scene,before);view.destroy();assert.equal(f.gpu.owned.size,0);
});

test('surface projector uses native height relative to the field center and CSS viewport dimensions',async()=>{
 const f=mapFixture(),data=input(),scene=sceneFor(data.model);let projector;
 const view=createView({...data,map:f.map,onSceneActive:(active,value)=>{projector=active?value:null;},sceneClientFactory:()=>({ready:Promise.resolve(scene),destroy(){}})});await view.open();
 const [x,y]=scene.reference.anchor,matrix=[1000,0,0,0,0,1000,0,0,0,1e6,1,0,-1000*x,-1000*y,0,1];[...f.layers.values()][0].render(f.gpu.gl,matrix);
 const center=projector(scene.reference.coordinate);assert.ok(Math.abs(center.x-400)<1e-5);assert.ok(Math.abs(center.y-300)<1e-5);
 const point=geo([10,10]),[px,py]=mercator(point),projected=projector(point);
 const expectedY=(1-((py-y)*1000+(110-115)*scene.reference.metersToMercator*1e6))*300;
 assert.ok(Math.abs(projected.x-(1+(px-x)*1000)*400)<1e-5);assert.ok(Math.abs(projected.y-expectedY)<1e-4);
 assert.equal(projector(geo([30,30])),null,'uncovered labels must not be falsely projected onto flat ground');
 view.destroy();assert.equal(projector,null);
});

test('late closed scene cannot add a layer and a new generation can open normally',async()=>{
 const f=mapFixture(),data=input(),scene=sceneFor(data.model),first=deferred();let clients=0,destroys=0;
 const view=createView({...data,map:f.map,sceneClientFactory:()=>({ready:++clients===1?first.promise:Promise.resolve(scene),destroy(){destroys++;}})});
 const pending=view.open();view.close();await view.open();first.resolve(scene);await pending;
 assert.equal(f.layers.size,1);assert.equal(clients,2);view.destroy();assert.equal(destroys,2);assert.equal(f.gpu.owned.size,0);
});

test('unsupported uint32 indices or shader failure release partial setup without activating the scene',async()=>{
 for(const options of [{webgl2:false,uint32:false},{compile:false}]){
  const f=mapFixture(options),data=input(),plane=structuredClone(f.camera()),events=[];let destroys=0;
  const view=createView({...data,map:f.map,gesturePolicy:createMapGesturePolicy({map:f.map}),onSceneActive:active=>events.push(active),sceneClientFactory:()=>({ready:Promise.resolve(sceneFor(data.model)),destroy(){destroys++;}})});
  await assert.rejects(view.open(),/WebGL|32|shader/i);assert.deepEqual(f.camera(),plane);assert.equal(f.layers.size,0);assert.equal(f.gpu.owned.size,0);assert.ok(!events.includes(true));assert.equal(destroys,1);view.destroy();
 }
});

test('public custom onRemove releases scene resources and owned camera after external layer removal',async()=>{
 const f=mapFixture(),data=input(),plane=structuredClone(f.camera()),errors=[];let active=false;
 const view=createView({...data,map:f.map,gesturePolicy:createMapGesturePolicy({map:f.map}),onError:error=>errors.push(error),onSceneActive:value=>active=value,sceneClientFactory:()=>({ready:Promise.resolve(sceneFor(data.model)),destroy(){}})});await view.open();
 f.map.jumpTo({center:[10,46],pitch:70});f.map.removeLayer([...f.layers.keys()][0]);await Promise.resolve();
 assert.equal(active,false);assert.equal(f.gpu.owned.size,0);assert.deepEqual(f.camera(),plane);assert.equal(errors.length,1);view.destroy();
});

test('map remove after style deletion releases the scene without map or overlay writes and permanently disposes the view',async()=>{
 const f=mapFixture(),data=input(),handlers={...f.states},events=[];let destroys=0,styleGone=false;
 const view=createView({...data,map:f.map,gesturePolicy:createMapGesturePolicy({map:f.map}),onSceneActive:active=>{assert.equal(styleGone,false,'overlay restoration must not touch a removed map');events.push(active);},sceneClientFactory:()=>({ready:Promise.resolve(sceneFor(data.model)),destroy(){destroys++;}})});await view.open();
 const layer=[...f.layers.values()][0];styleGone=true;
 for(const name of ['getLayer','removeLayer','jumpTo','stop'])f.map[name]=()=>{throw new Error(`Map style already removed: ${name}`);};
 f.map.getStyle=()=>undefined;
 assert.doesNotThrow(()=>f.emit('remove'));assert.equal(destroys,1);assert.equal(f.gpu.owned.size,0);assert.deepEqual(f.states,handlers);assert.deepEqual(events,[true]);
 assert.doesNotThrow(()=>{layer.onRemove(f.map,f.gpu.gl);view.close();view.destroy();f.emit('remove');});assert.equal(destroys,1);assert.equal(f.gpu.owned.size,0);
 await assert.rejects(view.open(),/chiusa|closed/i);
});

test('map remove during worker preparation prevents late scene activation and future opens',async()=>{
 const f=mapFixture(),data=input(),pending=deferred(),events=[];let destroys=0;
 const view=createView({...data,map:f.map,onSceneActive:active=>events.push(active),sceneClientFactory:()=>({ready:pending.promise,destroy(){destroys++;}})}),opening=view.open();
 for(const name of ['getLayer','removeLayer','jumpTo','stop'])f.map[name]=()=>{throw new Error(`Map style already removed: ${name}`);};
 f.map.getStyle=()=>undefined;
 assert.doesNotThrow(()=>f.emit('remove'));pending.resolve(sceneFor(data.model));await opening;
 assert.equal(destroys,1);assert.equal(f.layers.size,0);assert.deepEqual(events,[]);await assert.rejects(view.open(),/chiusa|closed/i);assert.doesNotThrow(()=>view.destroy());
});

class SceneWorker extends EventTarget{
 constructor(){super();this.messages=[];this.terminated=0;}
 postMessage(message,transfer){this.messages.push({message,transfer});}
 terminate(){this.terminated++;}
 reply(data){this.dispatchEvent(new MessageEvent('message',{data}));}
}
test('worker client sends one complete scene request and accepts only its transferred response',async()=>{
 const data=input(),scene=sceneFor(data.model),worker=new SceneWorker();const client=createClient({...data,workerFactory:()=>worker});
 assert.equal(worker.messages.length,1);const [{message,transfer}]=worker.messages;assert.equal(message.type,'build');assert.deepEqual(message.scene,data);assert.ok(!transfer?.length,'input model buffers remain owned by the project');
 worker.reply({type:'scene',id:message.id+1,scene:{bad:true}});worker.reply({type:'scene',id:message.id,scene});assert.equal(await client.ready,scene);
 client.destroy();client.destroy();assert.equal(worker.terminated,1);
});

test('worker cancellation rejects ready and terminates once while worker failure keeps its diagnostic',async()=>{
 const data=input(),cancelled=new SceneWorker(),first=createClient({...data,workerFactory:()=>cancelled});first.destroy();first.destroy();await assert.rejects(first.ready,{name:'AbortError'});assert.equal(cancelled.terminated,1);
 const failed=new SceneWorker(),second=createClient({...data,workerFactory:()=>failed});const id=failed.messages[0].message.id;
 failed.reply({type:'error',id,message:'Native coverage incomplete'});await assert.rejects(second.ready,/Native coverage incomplete/);second.destroy();assert.equal(failed.terminated,1);
});
