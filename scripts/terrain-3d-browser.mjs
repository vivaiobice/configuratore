// Actual checkout/app, production graphics Worker and browser input; no app or solver source overrides.
// All external requests are fulfilled from local fixtures or blocked.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';


const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.TERRAIN_3D_BROWSER_OUTPUT??'/tmp/terrain-8a-browser');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/v126-browser-assets';
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');

const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const exposeMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
  constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}};
const nativeProtocol=maplibregl.addProtocol;window.__protocolRequests={active:0,peak:0};maplibregl.addProtocol=(name,handler)=>nativeProtocol(name,async(...args)=>{__protocolRequests.active++;__protocolRequests.peak=Math.max(__protocolRequests.peak,__protocolRequests.active);try{return await handler(...args);}finally{__protocolRequests.active--;}});`;
const sdk=`export function createClient(){
  const user=window.__fixture.user,session={user,access_token:'fixture'};
  const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
    if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{
      user_id:user.id,owner_kind:'user',display_name:'Test',first_name:'Test',last_name:'User',
      phone:'123',email:'test@example.test',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);
    return (...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
  }});return query;};
  return {auth:{async getSession(){if(!window.__map?.__initialLoad)await new Promise(done=>window.__map.once('load',done));return {data:{session},error:null};},
    onAuthStateChange(callback){(window.__authHandlers??=[]).push(callback);return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
const geometry=[[0,0],[100,0],[100,100],[0,100],[0,0]].map(geo);
const fieldCameraOnly=process.env.TERRAIN_3D_BROWSER_CHECK==='field-camera';
const distantGeometry=[[2000,2000],[2100,2000],[2100,2100],[2000,2100],[2000,2000]].map(geo);
const model=createTerrainModel({source:{id:'anonymous-3d-dtm',label:'DTM anonimo 3D',resolutionM:5,surveyEpoch:'2019',release:'fixture',url:'about:blank',license:'CC0',citation:'Fixture sintetica anonima'},grid:{width:65,height:65,origin:[499900,5000220],step:[5,-5],values:Array.from({length:4225},(_,i)=>100+(i%65*5-100)*.25)}});
const state=createInitialState();state.project=ensureProjectFields({...state.project,localProjectId:'terrain-3d-fixture',localProjectName:'Terreno 3D anonimo',activeFieldId:'f',fields:[...['f','other'].map(id=>({...state.project.fields[0],id,label:'Campo '+id,geometry:fieldCameraOnly&&id==='other'?distantGeometry:geometry,terrain:null,rowPortions:[],orientationLocked:true,headlandWidthM:0}))]});
const owner='00000000-0000-4000-8000-000000000138',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const mobileOnly=process.env.TERRAIN_3D_BROWSER_VIEW==='mobile';
const reports=mobileOnly&&!fieldCameraOnly?JSON.parse(await readFile(resolve(output,'report.json'),'utf8')).filter(report=>report.name==='desktop'):[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of mobileOnly||fieldCameraOnly?[true]:[false,true]){
  const name=mobile?'mobile':'desktop',context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:900,height:720}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.stack??error.message));
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:'f',map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:geo([50,50]),zoom:17,bearing:19,pitch:12}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({state,workspace,owner,draftKey,model})=>{
   window.__fixture={user:{id:owner,is_anonymous:true,app_metadata:{}},model};localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');
   window.__graphics=[];window.__pngResponses=[];window.__longTasks=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())if(__longTasks.length<200)__longTasks.push(entry.toJSON());}).observe({type:'longtask',buffered:true});const NativeWorker=Worker;
   window.Worker=class extends NativeWorker{
    constructor(url,options){super(url,options);this.record={url:String(url),init:0,tiles:0,pending:0,maxPending:0,returned:0,terminated:false,times:[],requestTimes:[],coordinates:{}};window.__graphics.push(this.record);this.addEventListener('message',({data})=>{if(data.type==='tile'){this.record.returned++;this.record.pending--;this.record.times.push(performance.now());if(this.record.url.includes('terrain-tile-worker')&&data.data)__pngResponses.push({coordinates:this.record.coordinates[data.id],data:data.data});}});}
    postMessage(data,...args){if(data.type==='init')this.record.init++;if(data.type==='tile'){this.record.tiles++;this.record.coordinates[data.id]=data.coordinates;this.record.requestTimes.push(performance.now());this.record.pending++;this.record.maxPending=Math.max(this.record.maxPending,this.record.pending);}return super.postMessage(data,...args);}
    terminate(){this.record.terminated=true;if(this.record.url.includes('terrain-tile-worker')){const history=JSON.parse(sessionStorage.getItem('__closedGraphics')??'[]');history.push(this.record);sessionStorage.setItem('__closedGraphics',JSON.stringify(history));}return super.terminate();}
   };
  }, {state,workspace,owner,draftKey,model});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.href.startsWith(base+'/')){if(url.pathname==='/src/terrain-provider.js')return route.fulfill({contentType:'application/javascript',body:'export async function loadTerrainForField(){return window.__fixture.model;}'});return route.continue();}
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});return route.abort();
  });
  const click=async selector=>{const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();if(mobile)await node.tap();else await node.click();};
  const camera=()=>page.evaluate(()=>({center:__map.getCenter().toArray(),zoom:__map.getZoom(),pitch:__map.getPitch(),bearing:__map.getBearing(),padding:__map.getPadding()}));
  const handlers=()=>page.evaluate(()=>Object.fromEntries(['dragRotate','touchPitch','touchZoomRotate','scrollZoom','dragPan'].map(name=>[name,__map[name].isEnabled()])));
  const data=()=>page.evaluate(key=>({project:JSON.parse(localStorage.getItem(key)).state.project,metrics:['#summary-rows','#summary-linear','#summary-plants','#summary-commercial'].map(s=>document.querySelector(s)?.textContent),eyes:[...document.querySelectorAll('[data-map-visibility]')].map(n=>[n.dataset.mapVisibility,n.checked])}),draftKey);
  const control='[data-map-terrain]';const open=async()=>{await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-pressed')==='true');};
  const close=async()=>{await click(control);await page.waitForFunction(()=>!__map.getTerrain());await page.waitForFunction(()=>!__map.isMoving());};
  const settle=async()=>{await page.waitForTimeout(650);await page.waitForFunction(()=>!__map.isMoving());};
  try{
   await page.goto(base+'/');await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate')&&document.querySelector('[data-map-terrain]')?.disabled===false,null,{timeout:25000});await settle();
   if(fieldCameraOnly){
    await page.evaluate(()=>{__map.touchZoomRotate.disable();__map.scrollZoom.disable();});const savedHandlers=await handlers(),before=await camera();await open();
    await click('#mobile-app [data-view="fields"]');assert.ok(await page.evaluate(()=>__map.getTerrain()),'old field DEM is active immediately before selecting the distinct field');await page.evaluate(()=>{window.__fieldCameraMoves=[];__map.on('moveend',()=>__fieldCameraMoves.push({center:__map.getCenter().toArray(),terrain:__map.getTerrain()}));});await click('.mobile-field-card[data-field-id="other"]');await settle();
    const after=await camera(),target=geo([2050,2050]),evidence=await page.evaluate(({draftKey,target})=>({activeFieldId:JSON.parse(localStorage.getItem(draftKey)).state.project.activeFieldId,terrain:__map.getTerrain(),targetVisible:__map.getBounds().contains(target),controlCount:document.querySelectorAll('[data-map-terrain]').length,workers:__graphics.filter(w=>w.url.includes('terrain-tile-worker')),moves:__fieldCameraMoves}),{draftKey,target});
    await page.screenshot({path:resolve(output,'field-camera.png'),fullPage:true});await writeFile(resolve(output,'field-camera.json'),JSON.stringify({before,after,target,expectedGeometry:distantGeometry,savedHandlers,restoredHandlers:await handlers(),...evidence},null,2));console.log('DISTINCT distant-field camera',JSON.stringify({before,after,target,...evidence}));
    assert.equal(evidence.activeFieldId,'other');assert.equal(evidence.terrain,null);assert.deepEqual(await handlers(),savedHandlers);assert.equal(evidence.controlCount,1);assert.ok(evidence.workers.length>0&&evidence.workers.every(w=>w.init===1&&w.maxPending<=2&&w.terminated));assert.ok(evidence.targetVisible,'new distant field remains in view after old 3D camera cleanup');assert.ok(Math.hypot(after.center[0]-target[0],after.center[1]-target[1])<0.001,'camera fits the distant active field instead of restoring the old field');const firstTargetFit=evidence.moves.findIndex(move=>Math.hypot(move.center[0]-target[0],move.center[1]-target[1])<0.001);assert.ok(firstTargetFit>=0,'real move events observe the new field fit');assert.ok(!evidence.moves.slice(firstTargetFit+1).some(move=>Math.hypot(move.center[0]-before.center[0],move.center[1]-before.center[1])<0.00001),'new target fit is never followed by restoring the old 3D field camera');assert.deepEqual(errors,[]);console.log('DISTINCT distant-field camera PASS');continue;
   }
   const environment={browser:await browser.version(),...await page.evaluate(()=>{const canvas=document.querySelector('#map canvas.maplibregl-canvas'),gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR)};})};
   const baseline2D=await page.evaluate(()=>new Promise(resolve=>{const times=[],start=performance.now();function frame(t){times.push(t);__map.triggerRepaint();if(performance.now()-start<1500)requestAnimationFrame(frame);else{const gaps=times.slice(1).map((v,i)=>v-times[i]);resolve({frameCount:times.length,durationMs:performance.now()-start,maxFrameGapMs:Math.max(0,...gaps),viewport:[innerWidth,innerHeight]});}}requestAnimationFrame(frame);}));
   // A deliberately nondefault public handler policy must survive the view.
   await page.evaluate(()=>{__map.stop();__map.touchZoomRotate.disable();__map.scrollZoom.disable();__map.jumpTo({pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}});});
   const savedCamera=await camera(),savedHandlers=await handlers(),savedData=await data();assert.ok(savedData.metrics.some(value=>value&&/[0-9]/.test(value)),'real manual quantities are present');assert.equal(savedData.eyes.length,3,'all three actual overlay eye settings are present');await writeFile(resolve(output,name+'-preserved-data.json'),JSON.stringify(savedData,null,2));
   await page.evaluate(()=>{window.__frames=[];const loop=t=>{__frames.push(t);if(__frames.length<2000)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
   const profiler=await context.newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start');
   await open();await page.waitForFunction(()=>__graphics.some(w=>w.url.includes('terrain-tile-worker')&&w.returned>0));
   const coveragePoints=[10,50,90].flatMap(x=>[10,50,90].map(y=>({coordinate:geo([x,y]),height:100+x*.25})));
   await page.waitForFunction(points=>{const values=points.map(p=>__map.queryTerrainElevation(p.coordinate));return Math.max(...values)-Math.min(...values)>15;},coveragePoints,{timeout:15000});
   const coverage=await page.evaluate(points=>points.map(p=>({...p,rendered:__map.queryTerrainElevation(p.coordinate)})),coveragePoints);
   const baseline=coverage[4].rendered;for(const point of coverage)assert.ok(Math.abs((point.rendered-baseline)-(point.height-112.5))<1,'nine field samples reproduce the frozen slope');
   // Pinned 4.7.1 queryTerrainElevation subtracts the current camera ground.
   // Decode the exact returned worker PNG at field center for absolute height.
   const height=await page.evaluate(async point=>{
    const [lon,lat]=point,u=(lon+180)/360,v=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2;
    const responses=__pngResponses.filter(({coordinates:c})=>Math.floor(u*2**c.z)===c.x&&Math.floor(v*2**c.z)===c.y).sort((a,b)=>b.coordinates.z-a.coordinates.z);
    if(!responses.length)throw new Error('No actual PNG covers field center');const {coordinates:c,data}=responses[0],bitmap=await createImageBitmap(new Blob([data],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const px=ctx.getImageData(Math.floor((u*2**c.z-c.x)*256),Math.floor((v*2**c.z-c.y)*256),1,1).data;bitmap.close();canvas.width=0;canvas.height=0;return px[0]*256+px[1]+px[2]/256-32768;
   },geo([50,50]));assert.ok(Math.abs(height-112.5)<1,'real production PNG center elevation');console.log(name,'decoded height',height,'coverage',coverage.map(p=>p.rendered));
   const {profile}=await profiler.send('Profiler.stop');await writeFile(resolve(output,name+'-main-thread.cpuprofile'),JSON.stringify(profile));const nodeById=new Map(profile.nodes.map(node=>[node.id,node.callFrame])),cpu=new Map();for(let i=0;i<(profile.samples??[]).length;i++){const frame=nodeById.get(profile.samples[i]),key=[frame?.functionName,frame?.url,frame?.lineNumber].join(' ');cpu.set(key,(cpu.get(key)??0)+(profile.timeDeltas?.[i]??0));}const cpuTop=[...cpu].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([frame,microseconds])=>({frame,selfMs:microseconds/1000}));
   const steady3D=await page.evaluate(()=>new Promise(resolve=>{const times=[],start=performance.now();function frame(t){times.push(t);__map.triggerRepaint();if(performance.now()-start<1500)requestAnimationFrame(frame);else{const gaps=times.slice(1).map((v,i)=>v-times[i]);resolve({frameCount:times.length,durationMs:performance.now()-start,maxFrameGapMs:Math.max(0,...gaps)});}}requestAnimationFrame(frame);}));
   const gestureStart=await page.evaluate(()=>performance.now()),rect=await page.locator('#map canvas.maplibregl-canvas').boundingBox(),cx=rect.x+rect.width*.5,cy=rect.y+rect.height*.52;
   const deltas={};
   if(!mobile){
    let before=await camera();await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+90,cy+50,{steps:15});await page.mouse.up({button:'right'});await settle();let after=await camera();deltas.desktopPitch=after.pitch-before.pitch;deltas.desktopRotate=after.bearing-before.bearing;assert.ok(Math.abs(deltas.desktopPitch)>5);assert.ok(Math.abs(deltas.desktopRotate)>10);
    before=await camera();await page.mouse.move(cx,cy);await page.mouse.wheel(40,60);await settle();after=await camera();deltas.trackpadPan=Math.hypot(after.center[0]-before.center[0],after.center[1]-before.center[1]);assert.ok(deltas.trackpadPan>1e-7);
    before=await camera();await page.keyboard.down('Shift');await page.mouse.wheel(0,60);await page.keyboard.up('Shift');await settle();after=await camera();deltas.trackpadRotate=after.bearing-before.bearing;assert.ok(Math.abs(deltas.trackpadRotate-10.8)<1e-6);
    before=await camera();await page.keyboard.down('Control');await page.mouse.wheel(0,-160);await page.keyboard.up('Control');await settle();after=await camera();deltas.trackpadZoom=after.zoom-before.zoom;assert.ok(deltas.trackpadZoom>.1);
   }else{
    const cdp=await context.newCDPSession(page);
    const touch=async frames=>{for(let i=0;i<frames.length;i++){await cdp.send('Input.dispatchTouchEvent',{type:i?'touchMove':'touchStart',touchPoints:frames[i].map(([x,y],id)=>({x,y,id,radiusX:5,radiusY:5,force:1}))});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();};
    let before=await camera();await touch(Array.from({length:13},(_,i)=>[[cx-45-i*3,cy],[cx+45+i*3,cy]]));let after=await camera();deltas.pinch=after.zoom-before.zoom;assert.ok(deltas.pinch>.5);
    before=await camera();await touch(Array.from({length:17},(_,i)=>{const angle=i*Math.PI/32;return [[cx-65*Math.cos(angle),cy-65*Math.sin(angle)],[cx+65*Math.cos(angle),cy+65*Math.sin(angle)]];}));after=await camera();deltas.touchRotate=after.bearing-before.bearing;assert.ok(Math.abs(deltas.touchRotate)>10);
    before=await camera();await touch(Array.from({length:13},(_,i)=>[[cx-45,cy-30+i*5],[cx+45,cy-30+i*5]]));after=await camera();deltas.touchPitch=after.pitch-before.pitch;assert.ok(Math.abs(deltas.touchPitch)>5);
    before=await camera();await touch(Array.from({length:13},(_,i)=>[[cx+i*4,cy+i*2]]));after=await camera();deltas.touchPan=Math.hypot(after.center[0]-before.center[0],after.center[1]-before.center[1]);assert.ok(deltas.touchPan>1e-7);
   }
   const gestureTiming=await page.evaluate(start=>{const times=__frames.filter(t=>t>=start),gaps=times.slice(1).map((t,i)=>t-times[i]);return {frameCount:times.length,durationMs:performance.now()-start,maxFrameGapMs:Math.max(0,...gaps)};},gestureStart);
   const rendering=await page.evaluate(()=>{const workers=__graphics.filter(w=>w.url.includes('terrain-tile-worker'));const start=workers[0].requestTimes[0],end=workers[0].times[0],during=__frames.filter(t=>t>=start&&t<=end),gaps=during.slice(1).map((t,i)=>t-during[i]);return {workers,requests:__protocolRequests,frameCount:during.length,firstTileDurationMs:end-start,maxFrameGapMs:Math.max(0,...gaps),longTasks:__longTasks.filter(task=>task.startTime>=start&&task.startTime<=end)};});await writeFile(resolve(output,name+'-render-timing.json'),JSON.stringify({environment,baseline2D,steady3D,gestureTiming,rendering,deltas,cpuTop},null,2));assert.ok(rendering.frameCount>=2,'animation frames advance during production tile work');assert.ok(rendering.requests.peak<=10,'protocol admission remains bounded');
   const frames=await page.evaluate(()=>window.__frames.length);await page.screenshot({path:resolve(output,name+'-3d.png'),fullPage:true});await close();assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);assert.deepEqual(await data(),savedData);
   if(!mobile){await open();await click('#edit-vertices-button');assert.equal(await page.evaluate(()=>__map.getTerrain()),null);assert.equal((await camera()).pitch,savedCamera.pitch);await click('#edit-vertices-button');}
   else{
    await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="f"]');assert.equal(await page.locator(control).count(),1);await open();await click('#mobile-edit-map');await click('[data-sheet="perimeter"]');await click('#edit-vertices-button');assert.equal(await page.evaluate(()=>__map.getTerrain()),null);assert.equal((await camera()).pitch,savedCamera.pitch);await click('#mobile-finish-edit');await click('#mobile-editor-cancel');
   }
   const firstEpochWorkers=await page.evaluate(()=>__graphics.filter(w=>w.url.includes('terrain-tile-worker')));assert.ok(firstEpochWorkers.every(w=>w.init===1&&w.maxPending<=2&&w.terminated));
   // Restart with actual bootstrap for field/account lifecycle independently.
   await page.reload();await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&document.querySelector('[data-map-terrain]')?.disabled===false);await settle();await open();
   if(mobile){await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="other"]');}
   else{await page.locator('#map-field-select').selectOption('other');}
   assert.equal(await page.evaluate(()=>__map.getTerrain()),null);
   if(!mobile){await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.disabled===false);await open();await page.locator('#map-field-select').selectOption('');assert.equal(await page.evaluate(()=>__map.getTerrain()),null,'overview releases the active field DEM');assert.equal(await page.locator(control).isDisabled(),true,'overview has no available arbitrary-field model');await page.locator('#map-field-select').selectOption('other');}
   if(mobile)await click('#mobile-app [data-view="map"]');await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.disabled===false);await open();const accountReload=page.waitForEvent('domcontentloaded');await page.evaluate(()=>{for(const callback of __authHandlers)callback('SIGNED_OUT',null);});await accountReload;await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!window.__map.getTerrain());
   const workers=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('__closedGraphics')??'[]'));assert.ok(workers.length>=(mobile?4:5),'actual termination evidence survives account reload');assert.ok(workers.every(w=>w.init===1&&w.maxPending<=2&&w.terminated));
   assert.deepEqual(errors,[]);reports.push({name,environment,actualMapLibre:'4.7.1',height,coverage,deltas,preservedData:savedData,cameraRestored:true,individualHandlersRestored:true,eyeAndMetricsUnchanged:true,editFieldAccountClose:true,workers,firstEpochWorkers,baseline2D,steady3D,gestureTiming,rendering,cpuTop,frames});await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));await page.screenshot({path:resolve(output,name+'-2d.png'),fullPage:true});
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true});console.error(name,await page.evaluate(()=>({status:document.querySelector('.terrain-status')?.textContent,tiles:window.__map?.getTerrain()?Object.values(__map.style.sourceCaches[__map.getTerrain().source]?._tiles??{}).map(t=>({state:t.state,id:t.tileID.key})):[],terrain:window.__map?.getTerrain(),screen:document.body.dataset.mobileScreen,workers:window.__graphics})),errors);throw error;}finally{await context.close();}
 }
 if(!fieldCameraOnly){await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));for(const report of reports)assert.ok(report.rendering.maxFrameGapMs<150,report.name+': tile work does not block rendering');}
}finally{await browser?.close();server.close();}
