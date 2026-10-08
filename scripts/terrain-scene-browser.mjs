// Real checkout/app, native scene Worker, MapLibre 4.7.1, and browser input.
// Only the SDK/provider and public raster services use anonymous local fixtures.
// MapLibre and WebGL instrumentation forwards every call to its original.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.TERRAIN_SCENE_BROWSER_OUTPUT??process.env.TERRAIN_3D_BROWSER_OUTPUT??'/tmp/terrain-scene-browser');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/v126-browser-assets';
const [maplibre,draw,maplibreCss,drawCss]=await Promise.all([
 readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8'),
 readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8'),
 readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8'),
 readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8')
]);

// A visibly artificial green checker raster exercises real tile textures without
// contacting a satellite service or implying that anonymous data is imagery.
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function png(transparent=false){
 const width=256,height=256,scanlines=Buffer.alloc(height*(width*4+1));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*(width*4+1)+1+x*4,tone=((x>>5)+(y>>5))%2;
  scanlines.set(transparent?[0,0,0,0]:tone?[109,137,92,255]:[139,155,109,255],p);
 }
 const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}
const texture=png(),transparentTexture=png(true);
const server=createServer(async(req,res)=>{try{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname.endsWith('/'))pathname+='index.html';
 const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2'})[extname(path)]??'application/octet-stream');
 res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const exposeMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
 constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}
 addLayer(layer,...args){
  if(layer.type==='custom'){
   const record={id:layer.id,active:true,renders:0,lastCommands:[],firstRenderedAt:null};window.__customLayers.push(record);
   const nativeRender=layer.render;layer.render=function(...renderArgs){
    record.renders++;record.firstRenderedAt??=performance.now();const before=window.__renderScope;
    const commands=[];window.__renderScope=commands;try{return nativeRender.apply(this,renderArgs);}finally{record.lastCommands=commands;window.__renderScope=before;}
   };
  }
  return super.addLayer(layer,...args);
 }
 removeLayer(id){const result=super.removeLayer(id);for(const record of window.__customLayers)if(record.id===id)record.active=false;return result;}
};`;
const sdk=`export function createClient(){
 const user=window.__fixture.user,session={user,access_token:'fixture'};
 const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
  if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{
   user_id:user.id,owner_kind:'user',display_name:'Test',first_name:'Test',last_name:'User',phone:'123',email:'test@example.test',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);
  return (...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
 }});return query;};
 return {auth:{async getSession(){if(!window.__map?.__initialLoad)await new Promise(done=>window.__map.once('load',done));return {data:{session},error:null};},
  onAuthStateChange(callback){(window.__authHandlers??=[]).push(callback);return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
const geometry=[[0,0],[100,0],[100,100],[0,100],[0,0]].map(geo);
const distantGeometry=[[2000,2000],[2100,2000],[2100,2100],[2000,2100],[2000,2000]].map(geo);
const model=createTerrainModel({source:{id:'anonymous-native-3d-dtm',label:'DTM anonimo 3D',resolutionM:5,surveyEpoch:'2019',release:'fixture',url:'about:blank',license:'CC0',citation:'Fixture sintetica anonima'},grid:{width:65,height:65,origin:[499900,5000220],step:[5,-5],values:Array.from({length:4225},(_,i)=>100+(i%65*5-100)*.25)}});
const state=createInitialState();state.project=ensureProjectFields({...state.project,localProjectId:'terrain-scene-fixture',localProjectName:'Terreno 3D anonimo',activeFieldId:'f',fields:['f','other'].map(id=>({...state.project.fields[0],id,label:'Campo '+id,geometry:id==='other'?distantGeometry:geometry,terrain:null,rowPortions:[],orientationLocked:true,headlandWidthM:0}))});
const owner='00000000-0000-4000-8000-000000000138',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const requestedView=process.env.TERRAIN_SCENE_BROWSER_VIEW??process.env.TERRAIN_3D_BROWSER_VIEW;
const views=requestedView==='desktop'?[false]:requestedView==='mobile'?[true]:[false,true];
const reports=[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of views){
  const name=mobile?'mobile':'desktop',context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:900,height:720}}),page=await context.newPage();
  const errors=[],glErrors=[],local404=[],externalDenied=new Set(),fixtureRasters=[];
  page.on('pageerror',error=>errors.push(error.stack??error.message));
  page.on('console',message=>{if(message.type()==='error'&&/WebGL|GL_INVALID|shader compilation|link program/i.test(message.text()))glErrors.push(message.text());});
  page.on('response',response=>{if(response.url().startsWith(base+'/')&&response.status()===404)local404.push(response.url());});
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:'f',map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:geo([50,50]),zoom:17,bearing:19}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({state,workspace,owner,draftKey,model})=>{
   window.__fixture={user:{id:owner,is_anonymous:true,app_metadata:{}},model};localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');
   window.__graphics=[];window.__customLayers=[];window.__renderScope=null;window.__longTasks=[];
   new PerformanceObserver(list=>{for(const entry of list.getEntries())if(__longTasks.length<400)__longTasks.push(entry.toJSON());}).observe({type:'longtask',buffered:true});
   for(const prototype of [globalThis.WebGLRenderingContext?.prototype,globalThis.WebGL2RenderingContext?.prototype].filter(Boolean))for(const method of ['drawElements','drawArrays']){
    const native=prototype[method];prototype[method]=function(...args){if(window.__renderScope)window.__renderScope.push({method,mode:args[0],count:method==='drawElements'?args[1]:args[2]});return native.apply(this,args);};
   }
   const NativeWorker=Worker;
   window.Worker=class extends NativeWorker{
    constructor(url,options){super(url,options);this.record={url:String(url),builds:0,returned:0,terminated:false,requestTimes:[],times:[],scene:null};window.__graphics.push(this.record);
     this.addEventListener('message',({data})=>{if(data.type!=='scene')return;const scene=data.scene;this.record.returned++;this.record.times.push(performance.now());
      let minimum=Infinity,maximum=-Infinity,maxHeightError=0;for(let index=0;index<scene.nativeVertexCount;index++){
       const height=scene.positions[index*3+2]/scene.reference.metersToMercator+scene.reference.height;
       minimum=Math.min(minimum,height);maximum=Math.max(maximum,height);maxHeightError=Math.max(maxHeightError,Math.abs(height-(75+(index%65)*1.25)));
      }
      this.record.scene={modelHash:scene.modelHash,nativeVertexCount:scene.nativeVertexCount,nativeTriangleCount:scene.nativeTriangleCount,positionsLength:scene.positions.length,indicesLength:scene.indices.length,minimumHeight:minimum,maximumHeight:maximum,maxHeightError,reference:scene.reference,bounds:scene.bounds,lineRanges:scene.lineRanges};
     });
    }
    postMessage(data,...args){if(data.type==='build'){
     this.record.builds++;this.record.requestTimes.push(performance.now());
     if(window.__delayNextSceneBuild){window.__delayNextSceneBuild=false;this.record.deliberatelyDelayed=true;this.pendingBuild=[data,args];return;}
    }return super.postMessage(data,...args);}
    terminate(){this.record.terminated=true;this.pendingBuild=null;return super.terminate();}
   };
  },{state,workspace,owner,draftKey,model});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.href.startsWith(base+'/')){
    if(url.pathname==='/src/terrain-provider.js')return route.fulfill({contentType:'application/javascript',body:'export async function loadTerrainForField(){return window.__fixture.model;}'});return route.continue();
   }
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.hostname==='server.arcgisonline.com'&&url.pathname.includes('/MapServer/tile/')){
    fixtureRasters.push(url.pathname);return route.fulfill({contentType:'image/png',body:url.pathname.includes('/Reference/')?transparentTexture:texture});
   }
   if(url.hostname==='tile.openstreetmap.org')return route.fulfill({contentType:'image/png',body:texture});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
   externalDenied.add(url.hostname+url.pathname);return route.abort();
  });
  const click=async selector=>{const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();if(mobile)await node.tap();else await node.click();};
  const camera=()=>page.evaluate(()=>({center:__map.getCenter().toArray(),zoom:__map.getZoom(),pitch:__map.getPitch(),bearing:__map.getBearing(),padding:__map.getPadding()}));
  const handlers=()=>page.evaluate(()=>Object.fromEntries(['dragRotate','touchPitch','touchZoomRotate','scrollZoom','dragPan'].map(key=>[key,__map[key].isEnabled()])));
  const data=()=>page.evaluate(key=>({project:JSON.parse(localStorage.getItem(key)).state.project,metrics:['#summary-rows','#summary-linear','#summary-plants','#summary-commercial'].map(selector=>document.querySelector(selector)?.textContent),eyes:[...document.querySelectorAll('[data-map-visibility]')].map(node=>[node.dataset.mapVisibility,node.checked])}),draftKey);
  const checkpoint=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).workspace.map.camera,draftKey);
  const settle=async()=>{await page.waitForTimeout(450);await page.waitForFunction(()=>!__map.isMoving());};
  const control='[data-map-terrain]';
  const sceneActive=()=>page.evaluate(()=>__customLayers.some(layer=>layer.active&&__map.getLayer(layer.id)));
  const open=async()=>{await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-pressed')==='true'&&__customLayers.some(layer=>layer.active&&layer.renders>=2),null,{timeout:20000});};
  const close=async()=>{await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-pressed')!=='true'&&!__customLayers.some(layer=>layer.active&&__map.getLayer(layer.id)));await settle();};
  const phases=[];
  const beginPhase=async label=>page.evaluate(label=>{
   const sample={label,start:performance.now(),times:[],active:true};window.__phase=sample;
   const frame=time=>{sample.times.push(time);if(sample.active)requestAnimationFrame(frame);};requestAnimationFrame(frame);
  },label);
  const finishPhase=async()=>{
   const phase=await page.evaluate(()=>{const sample=window.__phase;sample.active=false;const times=[sample.start,...sample.times,performance.now()],gaps=times.slice(1).map((time,index)=>Math.max(0,time-times[index]));return {label:sample.label,frameCount:sample.times.length,durationMs:times.at(-1)-sample.start,maxFrameGapMs:Math.max(0,...gaps),longTasks:__longTasks.filter(task=>task.startTime>=sample.start),commands:__customLayers.filter(layer=>layer.active).map(layer=>({id:layer.id,renders:layer.renders,commands:layer.lastCommands}))};});
   phases.push(phase);await writeFile(resolve(output,name+'-phases.json'),JSON.stringify(phases,null,2));
   assert.ok(phase.frameCount>=2,name+' '+phase.label+': animation frames advance');
   assert.ok(phase.maxFrameGapMs<150,name+' '+phase.label+': max frame gap '+phase.maxFrameGapMs+' ms must stay below 150 ms');return phase;
  };
  const timed=async(label,action)=>{await beginPhase(label);await action();return finishPhase();};
  let record;
  try{
   await page.goto(base+'/');await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate')&&document.querySelector('[data-map-terrain]')?.disabled===false,null,{timeout:25000});await settle();
   const environment={browser:await browser.version(),...await page.evaluate(()=>{const canvas=__map.getCanvas(),gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:[canvas.width,canvas.height]};})};
   await page.evaluate(()=>{__map.stop();__map.touchZoomRotate.disable();__map.scrollZoom.disable();__map.jumpTo({pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}});});await settle();
   const savedCamera=await camera(),savedHandlers=await handlers(),savedData=await data(),savedCheckpoint=await checkpoint();
   assert.ok(savedData.metrics.some(value=>value&&/[0-9]/.test(value)),'real manual project quantities are present');assert.equal(savedData.eyes.length,3);
   await timed('open-native-scene',async()=>{await open();await page.waitForTimeout(300);});
   const native=await page.evaluate(()=>__graphics.filter(worker=>worker.url.includes('terrain-scene-worker')&&worker.scene).at(-1).scene);
   assert.equal(native.modelHash,model.contentHash);assert.equal(native.nativeVertexCount,4225);assert.equal(native.nativeTriangleCount,8192);assert.equal(native.positionsLength,12675);assert.equal(native.indicesLength,24576);
   assert.ok(native.maxHeightError<.0001,'all native vertex elevations preserve physical height at factor 1');assert.ok(Math.abs(native.minimumHeight-75)<.0001);assert.ok(Math.abs(native.maximumHeight-155)<.0001);assert.ok(native.lineRanges.some(range=>range.kind==='rows'&&range.count>0),'current calculated field rows are sampled into the native scene');
   const renderState=await page.evaluate(()=>({terrain:__map.getTerrain(),demSources:Object.entries(__map.getStyle().sources).filter(([,source])=>source.type==='raster-dem').map(([id])=>id),commands:__customLayers.filter(layer=>layer.active).flatMap(layer=>layer.lastCommands)}));
   assert.equal(renderState.terrain,null,'native custom scene avoids the MapLibre terrain RTT path');assert.deepEqual(renderState.demSources,[]);assert.ok(renderState.commands.some(command=>command.method==='drawElements'&&command.count===24576),'actual WebGL draws every native terrain face');assert.ok(renderState.commands.some(command=>command.method==='drawArrays'&&command.count>0),'actual WebGL draws sampled field and vineyard lines');
   await page.screenshot({path:resolve(output,name+'-3d-initial.png'),fullPage:true});
   await timed('loaded-stationary',async()=>page.waitForTimeout(1200));
   await timed('loaded-forced-render',async()=>page.evaluate(()=>new Promise(done=>{const start=performance.now();function frame(){__map.triggerRepaint();if(performance.now()-start<1200)requestAnimationFrame(frame);else done();}requestAnimationFrame(frame);})));
   const rect=await page.locator('#map canvas.maplibregl-canvas').boundingBox(),cx=rect.x+rect.width*.5,cy=rect.y+rect.height*.52,deltas={};
   if(!mobile){
    let before=await camera();await timed('mouse-rotate-pitch',async()=>{await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+90,cy+50,{steps:15});await page.mouse.up({button:'right'});await settle();});let after=await camera();deltas.desktopPitch=after.pitch-before.pitch;deltas.desktopRotate=after.bearing-before.bearing;assert.ok(Math.abs(deltas.desktopPitch)>5);assert.ok(Math.abs(deltas.desktopRotate)>10);
    before=await camera();await timed('trackpad-pan',async()=>{await page.mouse.move(cx,cy);await page.mouse.wheel(40,60);await settle();});after=await camera();deltas.trackpadPan=Math.hypot(after.center[0]-before.center[0],after.center[1]-before.center[1]);assert.ok(deltas.trackpadPan>1e-7);
    before=await camera();await timed('trackpad-rotate',async()=>{await page.keyboard.down('Shift');await page.mouse.wheel(0,60);await page.keyboard.up('Shift');await settle();});after=await camera();deltas.trackpadRotate=after.bearing-before.bearing;assert.ok(Math.abs(deltas.trackpadRotate-10.8)<1e-6);
    before=await camera();await timed('trackpad-zoom',async()=>{await page.keyboard.down('Control');await page.mouse.wheel(0,-160);await page.keyboard.up('Control');await settle();});after=await camera();deltas.trackpadZoom=after.zoom-before.zoom;assert.ok(deltas.trackpadZoom>.1);
   }else{
    const cdp=await context.newCDPSession(page);
    const touch=async frames=>{for(let index=0;index<frames.length;index++){await cdp.send('Input.dispatchTouchEvent',{type:index?'touchMove':'touchStart',touchPoints:frames[index].map(([x,y],id)=>({x,y,id,radiusX:5,radiusY:5,force:1}))});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();};
    let before=await camera();await timed('touch-pinch',async()=>touch(Array.from({length:13},(_,index)=>[[cx-45-index*3,cy],[cx+45+index*3,cy]])));let after=await camera();deltas.pinch=after.zoom-before.zoom;assert.ok(deltas.pinch>.5);
    before=await camera();await timed('touch-rotate',async()=>touch(Array.from({length:17},(_,index)=>{const angle=index*Math.PI/32;return [[cx-65*Math.cos(angle),cy-65*Math.sin(angle)],[cx+65*Math.cos(angle),cy+65*Math.sin(angle)]];})));after=await camera();deltas.touchRotate=after.bearing-before.bearing;assert.ok(Math.abs(deltas.touchRotate)>10);
    before=await camera();await timed('touch-pitch',async()=>touch(Array.from({length:13},(_,index)=>[[cx-45,cy-30+index*5],[cx+45,cy-30+index*5]])));after=await camera();deltas.touchPitch=after.pitch-before.pitch;assert.ok(Math.abs(deltas.touchPitch)>5);
    before=await camera();await timed('touch-pan',async()=>touch(Array.from({length:13},(_,index)=>[[cx+index*4,cy+index*2]])));after=await camera();deltas.touchPan=Math.hypot(after.center[0]-before.center[0],after.center[1]-before.center[1]);assert.ok(deltas.touchPan>1e-7);
   }
   assert.deepEqual(await checkpoint(),savedCheckpoint,'3D gestures keep the pre-entry 2D workspace camera');assert.deepEqual(await data(),savedData,'3D rendering and gestures do not change project quantities or data');
   await page.screenshot({path:resolve(output,name+'-3d.png'),fullPage:true});
   await click('[data-map-visibility-trigger]');await click('[data-map-visibility="schema"]');await page.waitForTimeout(100);
   const withoutSchema=await page.evaluate(()=>({checked:document.querySelector('[data-map-visibility="schema"]').checked,commands:__customLayers.filter(layer=>layer.active).flatMap(layer=>layer.lastCommands)}));
   assert.equal(withoutSchema.checked,false);assert.ok(withoutSchema.commands.filter(command=>command.method==='drawArrays').length<renderState.commands.filter(command=>command.method==='drawArrays').length,'schema eye removes actual row drawing commands');
   await click('[data-map-visibility="field"]');await page.waitForTimeout(100);
   const withoutField=await page.evaluate(()=>({checked:document.querySelector('[data-map-visibility="field"]').checked,commands:__customLayers.filter(layer=>layer.active).flatMap(layer=>layer.lastCommands)}));
   assert.equal(withoutField.checked,false);assert.ok(!withoutField.commands.some(command=>command.method==='drawElements'),'field eye hides the native face surface');assert.ok(await sceneActive(),'eye choices keep the 3D camera mode active');
   await click('[data-map-visibility="quotes"]');assert.equal(await page.locator('#map .side-measurement-label:visible').count(),0,'quote eye hides every HTML dimension label');
   await click('[data-map-visibility-restore]');await click('[data-map-visibility-trigger]');await settle();assert.deepEqual((await data()).eyes,savedData.eyes);
   await close();assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);assert.deepEqual(await data(),savedData);
   await open();await close();assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);
   // Transport latency makes this reproducible; production workers and handlers
   // remain unchanged. Cancellation must terminate the worker before delivery.
   await page.evaluate(()=>{window.__delayNextSceneBuild=true;});await click(control);
   await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-busy')==='true'&&__graphics.some(worker=>worker.deliberatelyDelayed&&!worker.terminated));
   assert.equal(await page.locator(control).isDisabled(),false,'pending opening remains cancellable');await click(control);await settle();
   assert.equal(await sceneActive(),false);assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);
   const cancellation=await page.evaluate(()=>__graphics.filter(worker=>worker.deliberatelyDelayed));assert.equal(cancellation.length,1);assert.equal(cancellation[0].terminated,true);assert.equal(cancellation[0].returned,0);
   await open();
   await page.evaluate(()=>{window.__fieldCameraMoves=[];__map.on('moveend',()=>__fieldCameraMoves.push({center:__map.getCenter().toArray(),customActive:__customLayers.some(layer=>layer.active&&__map.getLayer(layer.id))}));});
   if(mobile){await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="other"]');}
   else await page.locator('#map-field-select').selectOption('other');
   await settle();const target=geo([2050,2050]),afterField=await camera();
   const fieldChange=await page.evaluate(({key,target})=>({activeFieldId:JSON.parse(localStorage.getItem(key)).state.project.activeFieldId,targetVisible:__map.getBounds().contains(target),customActive:__customLayers.some(layer=>layer.active&&__map.getLayer(layer.id)),moves:__fieldCameraMoves,controlCount:document.querySelectorAll('[data-map-terrain]').length}),{key:draftKey,target});
   assert.equal(fieldChange.activeFieldId,'other');assert.equal(fieldChange.customActive,false);assert.ok(fieldChange.targetVisible);assert.equal(fieldChange.controlCount,1);assert.ok(Math.hypot(afterField.center[0]-target[0],afterField.center[1]-target[1])<.001,'distant field remains fitted after old 3D view cleanup');assert.deepEqual(await handlers(),savedHandlers);
   const firstFit=fieldChange.moves.findIndex(move=>Math.hypot(move.center[0]-target[0],move.center[1]-target[1])<.001);assert.ok(firstFit>=0);assert.ok(!fieldChange.moves.slice(firstFit+1).some(move=>Math.hypot(move.center[0]-savedCamera.center[0],move.center[1]-savedCamera.center[1])<.00001),'old 3D checkpoint never overwrites the new field fit');
   const workers=await page.evaluate(()=>__graphics.filter(worker=>worker.url.includes('terrain-scene-worker')));assert.ok(workers.length>=4);assert.ok(workers.every(worker=>worker.builds===1&&worker.terminated),'each 3D view owns and releases one graphics worker');
   const glCode=await page.evaluate(()=>{const canvas=__map.getCanvas(),gl=canvas.getContext('webgl2')??canvas.getContext('webgl');return gl.getError();});assert.equal(glCode,0,'real WebGL reports no error');assert.deepEqual(glErrors,[]);assert.deepEqual(errors,[]);assert.deepEqual(local404,[]);assert.ok(fixtureRasters.length>0,'actual local raster tiles were uploaded through the real basemap source');
   record={name,environment,actualMapLibre:'4.7.1',scope:'Actual app with anonymous 65×65 native DTM and synthetic raster fixtures; desktop/mobile Chromium input emulation, not physical-device certification or private-field verification.',native,deltas,phases,renderState,withoutSchema,withoutField,cancellation,workers,fieldChange,afterField,cameraRestored:true,individualHandlersRestored:true,workspaceCameraPreserved:true,projectAndQuantitiesUnchanged:true,errors,glErrors,glCode,local404,fixtureRasterRequests:fixtureRasters.length,externalDenied:[...externalDenied],externalClassification:'External SDKs/graphics are pinned local bytes; provider returns an anonymous frozen model; remaining external services are deliberately blocked.'};
   reports.push(record);await writeFile(resolve(output,name+'-report.json'),JSON.stringify(record,null,2));await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));await page.screenshot({path:resolve(output,name+'-2d-distant-field.png'),fullPage:true});console.log(name+' native scene PASS '+JSON.stringify({maximumFrameGapMs:Math.max(...phases.map(phase=>phase.maxFrameGapMs)),nativeVertices:native.nativeVertexCount,nativeFaces:native.nativeTriangleCount,workers:workers.length}));
  }catch(error){
   await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true}).catch(()=>{});
   const diagnostic=await page.evaluate(()=>({status:document.querySelector('.terrain-status')?.textContent,control:document.querySelector('[data-map-terrain]')?.outerHTML,screen:document.body.dataset.mobileScreen,workers:window.__graphics,layers:window.__customLayers,terrain:window.__map?.getTerrain()})).catch(()=>null);
   await writeFile(resolve(output,name+'-failure.json'),JSON.stringify({message:error.stack,diagnostic,phases,errors,glErrors,local404,externalDenied:[...externalDenied]},null,2));throw error;
  }finally{await context.close();}
 }
 console.log(JSON.stringify({passed:reports.map(report=>report.name),output}));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
