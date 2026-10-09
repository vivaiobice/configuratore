// Real app, native display Worker, MapLibre 4.7.1 and browser input.
// Only SDK/provider/raster services use anonymous local fixtures.
// Acceptance uses final composed pixels and independent known-height projection;
// a zero-geometry observer reads the public camera callback without GL draws.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {imageryPng,imageryColor,terrariumPng,fixtureSurface,fixtureMercator,fixtureLngLat} from './fixtures/terrain-patterned-imagery.mjs';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp');
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

const transparentTexture=imageryPng({transparent:true}),rasterCache=new Map(),demCache=new Map();
function raster(z,x,y){const key=[z,x,y].join('/');if(!rasterCache.has(key))rasterCache.set(key,imageryPng({z,x,y}));return rasterCache.get(key);}
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
 constructor(...args){super(...args);(window.__maps??=[]).push(this);window.__map??=this;this.on('load',()=>{this.__initialLoad=true;});this.on('render',()=>{window.__completedFrames=(window.__completedFrames??0)+1;});}
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
const surface=fixtureSurface({anchor:geo([50,50]),altitude:process.env.TERRAIN_SCENE_BROWSER_CASE==='negative'?-35:120});
const nativeValues=Array.from({length:4225},(_,i)=>Math.fround(surface.heightAt(fromUTM([499900+(i%65)*5,5000220-Math.floor(i/65)*5],32632))));
const model=createTerrainModel({source:{id:'anonymous-native-continuous-dtm',label:'DTM anonimo variato',resolutionM:5,surveyEpoch:'2019',release:'fixture',url:'about:blank',license:'CC0',citation:'Fixture sintetica anonima'},grid:{width:65,height:65,origin:[499900,5000220],step:[5,-5],values:nativeValues}});
const state=createInitialState();state.project=ensureProjectFields({...state.project,localProjectId:'terrain-scene-fixture',localProjectName:'Terreno 3D anonimo',activeFieldId:'f',fields:['f','other'].map(id=>({...state.project.fields[0],id,label:'Campo '+id,geometry:id==='other'?distantGeometry:geometry,terrain:null,rowPortions:[],orientationLocked:true,headlandWidthM:0}))});
const owner='00000000-0000-4000-8000-000000000138',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const requestedView=process.env.TERRAIN_SCENE_BROWSER_VIEW??process.env.TERRAIN_3D_BROWSER_VIEW;
const views=requestedView==='desktop'?[false]:requestedView==='mobile'?[true]:[false,true];
const reports=[];let browser;
const multiply=(m,[x,y,z])=>{const w=m[3]*x+m[7]*y+m[11]*z+m[15];return {w,x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w};};
function project(coordinate,height,matrix,width,heightCSS,worldSize){
 const [x,y]=fixtureMercator(coordinate),z=height/(2*Math.PI*6378137*Math.cos(coordinate[1]*Math.PI/180)),p=multiply(matrix,worldSize?[x*worldSize,y*worldSize,height]:[x,y,z]);
 return {x:(p.x+1)*width/2,y:(1-p.y)*heightCSS/2,w:p.w};
}
function pixelAt(frame,x,y){const px=Math.round(x*frame.scaleX),py=Math.round(y*frame.scaleY);if(px<0||py<0||px>=frame.width||py>=frame.height)return null;const offset=(py*frame.width+px)*4;return [...frame.pixels.subarray(offset,offset+4)];}
function nearestPixel(frame,point,expected,radius=3){let best=Infinity,observed=null,position=null;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const pixel=pixelAt(frame,point.x+dx,point.y+dy);if(!pixel)continue;const error=Math.max(...expected.map((value,index)=>Math.abs(value-pixel[index])));if(error<best){best=error;observed=pixel;position=[point.x+dx,point.y+dy];}}return {error:best,observed,position};}
function differencePixel(a,b,point,radius=3){let best=0,position=null;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const ap=pixelAt(a,point.x+dx,point.y+dy),bp=pixelAt(b,point.x+dx,point.y+dy);if(!ap||!bp)continue;const diff=Math.max(...[0,1,2].map(i=>Math.abs(ap[i]-bp[i])));if(diff>best){best=diff;position=[point.x+dx,point.y+dy];}}return {difference:best,position};}
function inverseMatrix(matrix){
 const rows=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>matrix[c*4+r]),...Array.from({length:4},(_,c)=>Number(r===c))]);
 for(let column=0;column<4;column++){let pivot=column;for(let row=column+1;row<4;row++)if(Math.abs(rows[row][column])>Math.abs(rows[pivot][column]))pivot=row;if(Math.abs(rows[pivot][column])<1e-20)return null;[rows[pivot],rows[column]]=[rows[column],rows[pivot]];const scale=rows[column][column];rows[column]=rows[column].map(value=>value/scale);for(let row=0;row<4;row++)if(row!==column){const factor=rows[row][column];rows[row]=rows[row].map((value,index)=>value-factor*rows[column][index]);}}
 return Array.from({length:16},(_,index)=>rows[index%4][4+Math.floor(index/4)]);
}
function terrainOccluded(candidate,frame,inverse){
 if(!inverse||!frame.worldSize)return false;
 const x=candidate.screen[0]/frame.cssWidth*2-1,y=1-candidate.screen[1]/frame.cssHeight*2,w=inverse[3]*x+inverse[7]*y-inverse[11]+inverse[15];
 const near=[0,1,2].map(axis=>(inverse[axis]*x+inverse[axis+4]*y-inverse[axis+8]+inverse[axis+12])/w),[mx,my]=fixtureMercator(candidate.coordinate),end=[mx*frame.worldSize,my*frame.worldSize,candidate.height];
 // Independent known-height ray samples, before any screenshot pixel reads.
 for(let step=1;step<80;step++){const t=step/80,point=near.map((value,axis)=>value+(end[axis]-value)*t);if(point[2]<surface.heightAtWorld(point[0]/frame.worldSize,point[1]/frame.worldSize)-.5)return true;}
 return false;
}
function raySurfacePoint(frame,x,y,inverse){
 const nx=x/frame.cssWidth*2-1,ny=1-y/frame.cssHeight*2,unproject=z=>{const w=inverse[3]*nx+inverse[7]*ny+inverse[11]*z+inverse[15];return [0,1,2].map(axis=>(inverse[axis]*nx+inverse[axis+4]*ny+inverse[axis+8]*z+inverse[axis+12])/w);},near=unproject(-1),far=unproject(1),horizontal=Math.hypot(far[0]-near[0],far[1]-near[1]);
 if(!(horizontal>0))return null;const direction=far.map((value,index)=>(value-near[index])/horizontal),worldStep=5/surface.metersPerWorld*frame.worldSize;
 const difference=distance=>{const point=near.map((value,axis)=>value+direction[axis]*distance);return {point,gap:point[2]-surface.heightAtWorld(point[0]/frame.worldSize,point[1]/frame.worldSize)};};
 let previous=0,a=difference(0);if(a.gap<-.5)return null;
 for(let step=1;step<=2000;step++){const distance=step*worldStep,b=difference(distance);if(b.gap<=0&&a.gap>=0){let low=previous,high=distance;for(let iteration=0;iteration<35;iteration++){const middle=(low+high)/2;if(difference(middle).gap>0)low=middle;else high=middle;}const {point}=difference((low+high)/2),coordinate=fixtureLngLat([point[0]/frame.worldSize,point[1]/frame.worldSize]);return {coordinate,height:surface.heightAt(coordinate)};}if(direction[2]>0&&b.point[2]>200)return null;previous=distance;a=b;}
 return null;
}
function grazingTerrainEvidence(frame,{outsideOnly=false}={}){
 const inverse=inverseMatrix(frame.matrix),samples=[],cells=new Map();let skyTargets=0,boundaryTargets=0;
 for(let row=0;row<3;row++)for(let column=0;column<4;column++)for(const [fx,fy]of [[.25,.25],[.75,.25],[.25,.75],[.75,.75],[.5,.5],[.15,.5],[.85,.5],[.5,.85]]){
  const x=(column+fx)*frame.cssWidth/4,y=(row+fy)*frame.cssHeight/3,gx=Math.floor(x/8),gy=Math.floor(y/8);if(frame.visibilityMap&&!frame.visibilityMap.cells[gy*frame.visibilityMap.columns+gx])continue;
  const hit=raySurfacePoint(frame,x,y,inverse);if(!hit){skyTargets++;continue;}const [wx,wy]=fixtureMercator(hit.coordinate),mx=(wx-surface.worldAnchor[0])*surface.metersPerWorld+50,my=(surface.worldAnchor[1]-wy)*surface.metersPerWorld+50,native=mx>=-100&&mx<=220&&my>=-100&&my<=220;if(outsideOnly&&native)continue;
  const cx=((wx*256*2**18)%32+32)%32,cy=((wy*256*2**18)%40+40)%40;if(cx<2||cx>30||cy<2||cy>38){boundaryTargets++;continue;}
  const expected=imageryColor(wx,wy),flat=project(hit.coordinate,0,frame.matrix,frame.cssWidth,frame.cssHeight,frame.worldSize),cell=row*4+column,sample={...hit,screen:[x,y],flatScreen:[flat.x,flat.y],native,cell,expected,displacement:Math.hypot(x-flat.x,y-flat.y),...nearestPixel(frame,{x,y},expected,3),flatError:nearestPixel(frame,flat,expected,2).error};samples.push(sample);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(sample);
 }
 const matching=samples.filter(sample=>sample.error<35),matchingCells=[...cells.values()].filter(values=>values.filter(sample=>sample.error<35).length/values.length>=.75);
 return {eligibleCells:cells.size,matchingCells:matchingCells.length,witnessCount:samples.length,matchingWitnesses:matching.length,matchingFraction:matching.length/Math.max(1,samples.length),outsideNative:matching.filter(sample=>!sample.native).length,displacedCorrect:matching.filter(sample=>sample.displacement>=8&&sample.flatError>45).length,highPitch:true,skyTargets,boundaryTargets,occlusionRule:'independent known-surface ray first-hit at preselected viewport targets',cameraMatrix:frame.matrix,worldSize:frame.worldSize,samples};
}
function terrainEvidence(frame,{outsideOnly=false,highPitch=false}={}){
 if(highPitch)return grazingTerrainEvidence(frame,{outsideOnly});
 const cells=new Map();
 for(let dx=-160;dx<=160;dx++)for(let dy=-160;dy<=160;dy++){
  const coordinate=geo([50+dx*10,50+dy*10]),height=surface.heightAt(coordinate),screen=project(coordinate,height,frame.matrix,frame.cssWidth,frame.cssHeight,frame.worldSize);
  if(frame.visibilityMap){const gx=Math.floor(screen.x/8),gy=Math.floor(screen.y/8);if(!frame.visibilityMap.cells[gy*frame.visibilityMap.columns+gx])continue;}
  if(screen.w<=0||screen.x<12||screen.y<12||screen.x>frame.cssWidth-12||screen.y>frame.cssHeight-12)continue;
  const native=50+dx*10>=-100&&50+dx*10<=220&&50+dy*10>=-100&&50+dy*10<=220;
  if(outsideOnly&&native)continue;
  const [wx,wy]=fixtureMercator(coordinate),fx=((wx*256*2**18)%32+32)%32,fy=((wy*256*2**18)%40+40)%40;
  if(fx<7||fx>25||fy<7||fy>33)continue; // Exclude known filtering boundaries before reading pixels.
  const column=Math.min(3,Math.floor(screen.x/frame.cssWidth*4)),row=Math.min(2,Math.floor(screen.y/frame.cssHeight*3)),cell=column+row*4;
  const flat=project(coordinate,0,frame.matrix,frame.cssWidth,frame.cssHeight,frame.worldSize),expected=imageryColor(wx,wy);
  if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push({coordinate,height,screen:[screen.x,screen.y],flatScreen:[flat.x,flat.y],displacement:Math.hypot(screen.x-flat.x,screen.y-flat.y),native,cell,column,row,expected});
 }
 // Select independently of observed pixels. Picking the best pixel match out
 // of many candidates would allow a wrong flat/repeating surface to pass.
 const selected=[],occluded=[],inverse=highPitch?inverseMatrix(frame.matrix):null;
 for(const values of cells.values()){
  const used=new Set();for(const [fx,fy]of [[.3,.3],[.7,.3],[.3,.7],[.7,.7]]){
   const {column,row}=values[0],tx=(column+fx)*frame.cssWidth/4,ty=(row+fy)*frame.cssHeight/3;
   const candidate=values.filter(value=>!used.has(value)).sort((a,b)=>Math.hypot(a.screen[0]-tx,a.screen[1]-ty)-Math.hypot(b.screen[0]-tx,b.screen[1]-ty))[0];if(!candidate)continue;used.add(candidate);if(highPitch&&terrainOccluded(candidate,frame,inverse)){occluded.push(candidate);continue;}
   const point={x:candidate.screen[0],y:candidate.screen[1]},flat={x:candidate.flatScreen[0],y:candidate.flatScreen[1]};
   selected.push({...candidate,...nearestPixel(frame,point,candidate.expected,3),flatError:nearestPixel(frame,flat,candidate.expected,2).error});
  }
 }
 const matching=selected.filter(sample=>sample.error<35),matchingCells=[...cells.keys()].filter(cell=>{const witnesses=selected.filter(sample=>sample.cell===cell);return witnesses.length>=1&&witnesses.filter(sample=>sample.error<35).length/witnesses.length>=.75;}),outside=matching.filter(sample=>!sample.native),displaced=matching.filter(sample=>sample.displacement>=8&&sample.flatError>45);
 return {eligibleCells:cells.size,matchingCells:matchingCells.length,witnessCount:selected.length,matchingWitnesses:matching.length,matchingFraction:matching.length/Math.max(1,selected.length),outsideNative:outside.length,displacedCorrect:displaced.length,highPitch,occludedWitnesses:occluded.length,occlusionRule:highPitch?'independent known-surface ray first-hit':null,cameraMatrix:frame.matrix,worldSize:frame.worldSize,samples:selected};
}
function overlayEvidence(shown,hidden,paths,kind){
 const samples=[],inverse=shown.pitch>=75?inverseMatrix(shown.matrix):null;let naturallyOccludedCount=0;for(let pathIndex=0;pathIndex<paths.length;pathIndex++){
  const path=paths[pathIndex];for(let index=1;index<path.length;index++)for(let step=1;step<8;step++){
   const a=fixtureMercator(path[index-1]),b=fixtureMercator(path[index]),coordinate=fixtureLngLat([a[0]+(b[0]-a[0])*step/8,a[1]+(b[1]-a[1])*step/8]),height=surface.heightAt(coordinate),p=project(coordinate,height,shown.matrix,shown.cssWidth,shown.cssHeight,shown.worldSize);
   if(p.w<=0||p.x<8||p.y<8||p.x>shown.cssWidth-8||p.y>shown.cssHeight-8)continue;
   if(inverse&&terrainOccluded({coordinate,height,screen:[p.x,p.y]},shown,inverse)){naturallyOccludedCount++;continue;}
   samples.push({pathIndex,coordinate,height,screen:[p.x,p.y],...differencePixel(shown,hidden,p)});
  }
 }
 const visible=samples.filter(sample=>sample.difference>18),datum=surface.heightAt(geo([50,50]));
 return {kind,sampleCount:samples.length,naturallyOccludedCount,visibleCount:visible.length,visiblePaths:new Set(visible.map(sample=>sample.pathIndex)).size,belowDatum:visible.filter(sample=>sample.height<datum-.5).length,aboveDatum:visible.filter(sample=>sample.height>datum+.5).length,samples};
}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of views){
  const name=mobile?'mobile':'desktop',context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:900,height:720}}),page=await context.newPage();
  const errors=[],glErrors=[],local404=[],externalDenied=new Set(),fixtureRasters=[],fixtureDEMs=[],geocoderRequests=[],phases=[],visuals=[],failedPerformancePhases=[];
  let failureMode=null,delayDEM=false;const delayedRoutes=[];
  page.on('pageerror',error=>errors.push(error.stack??error.message));
  page.on('request',request=>{const url=new URL(request.url());if(['nominatim.openstreetmap.org','geocode.arcgis.com'].includes(url.hostname))geocoderRequests.push(url.href);});
  page.on('console',message=>{if(message.type()==='error'&&/WebGL|GL_INVALID|shader compilation|link program/i.test(message.text()))glErrors.push(message.text());});
  page.on('response',response=>{if(response.url().startsWith(base+'/')&&response.status()===404)local404.push(response.url());});
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:'f',map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:geo([50,50]),zoom:17,bearing:19}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({state,workspace,owner,draftKey,model})=>{
   window.__fixture={user:{id:owner,is_anonymous:true,app_metadata:{}},model};localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');
   window.__graphics=[];window.__longTasks=[];window.__maps=[];window.__completedFrames=0;
   new PerformanceObserver(list=>{for(const entry of list.getEntries())__longTasks.push(entry.toJSON());if(__longTasks.length>512)__longTasks.splice(0,__longTasks.length-512);}).observe({type:'longtask',buffered:true});
   const NativeWorker=Worker;window.Worker=class extends NativeWorker{
    constructor(url,options){super(url,options);this.record={url:String(url),posted:0,returned:0,terminated:false,events:[]};__graphics.push(this.record);this.addEventListener('message',({data})=>{this.record.returned++;if(/terrain-/.test(this.record.url)&&this.record.events.length<100)this.record.events.push({direction:'reply',type:data.type,id:data.id,time:performance.now()});});}
    postMessage(data,...args){this.record.posted++;if(/terrain-/.test(this.record.url)&&this.record.events.length<100)this.record.events.push({direction:'request',type:data.type,id:data.id,z:data.z,x:data.x,y:data.y,time:performance.now()});if(window.__delayNextTerrainWorker&&String(this.record.url).includes('terrain-')){window.__delayNextTerrainWorker=false;this.record.deliberatelyDelayed=true;this.pending=[data,args];window.__delayedWorker=this;return;}return super.postMessage(data,...args);}
    terminate(){this.record.terminated=true;this.pending=null;return super.terminate();}
   };
  },{state,workspace,owner,draftKey,model});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.href.startsWith(base+'/')){
    if(url.pathname==='/src/terrain-provider.js')return route.fulfill({contentType:'application/javascript',body:'export async function loadTerrainForField(){return window.__fixture.model;}'});return route.continue();
   }
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(/terrarium/i.test(url.pathname)){
    const match=url.pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);if(!match){externalDenied.add(url.hostname+url.pathname);return route.abort();}
    const [,z,x,y]=match.map(Number);fixtureDEMs.push({z,x,y,path:url.pathname});
    if(failureMode==='dem')return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},body:'Anonymous context failure'});
    if(delayDEM)await new Promise(resolveDelay=>delayedRoutes.push(resolveDelay));
    const key=[z,x,y].join('/');if(!demCache.has(key))demCache.set(key,terrariumPng({z,x,y,surface}));return route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:demCache.get(key)}).catch(()=>{});
   }
   if(url.hostname==='server.arcgisonline.com'&&url.pathname.includes('/MapServer/tile/')){
    if(failureMode==='imagery')return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'},body:'Anonymous imagery failure'});
    const match=url.pathname.match(/\/tile\/(\d+)\/(\d+)\/(\d+)/);const [,z,y,x]=match?.map(Number)??[];fixtureRasters.push({path:url.pathname,z,y,x});return route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:url.pathname.includes('/Reference/')?transparentTexture:raster(z,x,y)});
   }
   if(url.hostname==='tile.openstreetmap.org')return route.fulfill({contentType:'image/png',body:raster(18,0,0)});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});externalDenied.add(url.hostname+url.pathname);return route.abort();
  });
  const click=async selector=>{const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();if(mobile)await node.tap();else await node.click();};
  const camera=()=>page.evaluate(()=>({center:__map.getCenter().toArray(),zoom:__map.getZoom(),pitch:__map.getPitch(),bearing:__map.getBearing(),padding:__map.getPadding(),maxPitch:__map.getMaxPitch(),pixelRatio:__map.getPixelRatio()}));
  const handlers=()=>page.evaluate(()=>Object.fromEntries(['dragRotate','touchPitch','touchZoomRotate','scrollZoom','dragPan','doubleClickZoom','keyboard'].map(key=>[key,__map[key].isEnabled()])));
  const data=()=>page.evaluate(key=>({project:JSON.parse(localStorage.getItem(key)).state.project,metrics:['#summary-rows','#summary-linear','#summary-plants','#summary-commercial'].map(selector=>document.querySelector(selector)?.textContent),eyes:[...document.querySelectorAll('[data-map-visibility]')].map(node=>[node.dataset.mapVisibility,node.checked])}),draftKey);
  const checkpoint=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).workspace.map.camera,draftKey);
  const settle=async()=>{await page.waitForFunction(()=>!__map.isMoving());await page.waitForTimeout(220);};
  const frames=async()=>{await page.waitForFunction(()=>__map.areTilesLoaded(),null,{timeout:25000});await page.evaluate(()=>new Promise(done=>{let count=0;function rendered(){if(++count>=2){__map.off('render',rendered);done();}else __map.triggerRepaint();}__map.on('render',rendered);__map.triggerRepaint();}));};
  const control='[data-map-terrain]',sceneActive=()=>page.evaluate(()=>!!__map.getTerrain());
  const observer='acceptance-no-geometry-camera';
  const installObserver=()=>page.evaluate(id=>{if(__map.getLayer(id))return;__map.addLayer({id,type:'custom',renderingMode:'3d',render(_gl,matrix,projection){window.__frameMatrix=Array.from(projection?.modelViewProjectionMatrix??matrix);window.__frameWorldSize=projection?.modelViewProjectionMatrix?512*2**__map.getZoom():null;}});},observer);
  const open=async()=>{await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-pressed')==='true'&&__map.getTerrain()&&document.querySelector('[data-map-terrain]')?.getAttribute('aria-busy')!=='true',null,{timeout:30000});await frames();};
  const close=async()=>{await page.evaluate(id=>{if(__map.getLayer(id))__map.removeLayer(id);},observer);await click(control);await page.waitForFunction(()=>!__map.getTerrain()&&document.querySelector('[data-map-terrain]')?.getAttribute('aria-pressed')!=='true');await settle();};
  const eyes=async next=>{const trigger=page.locator('[data-map-visibility-trigger]').first();if(await trigger.getAttribute('aria-expanded')!=='true')await click('[data-map-visibility-trigger]');for(const [key,value]of Object.entries(next)){const input=page.locator('[data-map-visibility="'+key+'"]').first();if(await input.isChecked()!==value)await click('[data-map-visibility="'+key+'"]');}await click('[data-map-visibility-trigger]');await frames();};
  const capture=async label=>{await installObserver();await frames();const canvas=page.locator('#map canvas.maplibregl-canvas').first(),rect=await canvas.boundingBox(),png=await canvas.screenshot({path:resolve(output,name+'-'+label+'.png')});const {data:pixels,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});const {matrix,worldSize,visibilityMap,pitch}=await page.evaluate(()=>{const canvas=__map.getCanvas(),host=canvas.getBoundingClientRect(),columns=Math.ceil(host.width/8),rows=Math.ceil(host.height/8),cells=[];for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const hit=document.elementFromPoint(host.x+column*8+4,host.y+row*8+4);cells.push(hit===canvas?1:0);}return {matrix:__frameMatrix,worldSize:__frameWorldSize,pitch:__map.getPitch(),visibilityMap:{columns,rows,cells}};});assert.equal(matrix?.length,16,'completed public custom-layer camera matrix is available');assert.ok(worldSize>0,'pinned SDK callback provides absolute-height modelViewProjectionMatrix');return {pixels,width:info.width,height:info.height,cssWidth:rect.width,cssHeight:rect.height,scaleX:info.width/rect.width,scaleY:info.height/rect.height,matrix,worldSize,visibilityMap,pitch};};
  const timed=async(label,action)=>{
   const loadedFrameSLA=!label.startsWith('open-')&&label!=='pointer-entry';
   await page.evaluate(label=>{const sample={label,start:performance.now(),times:[],frames:__completedFrames,active:true};window.__phase=sample;const frame=time=>{sample.times.push(time);if(sample.active)requestAnimationFrame(frame);};requestAnimationFrame(frame);},label);
   await action();const phase=await page.evaluate(()=>{const sample=__phase;sample.active=false;const times=[sample.start,...sample.times,performance.now()],gaps=times.slice(1).map((time,index)=>time-times[index]);return {label:sample.label,durationMs:times.at(-1)-sample.start,frameCount:sample.times.length,completedPresentationFrames:__completedFrames-sample.frames,maxFrameGapMs:Math.max(0,...gaps),longTasks:__longTasks.filter(task=>task.startTime>=sample.start)};});
   phase.loadedFrameSLA=loadedFrameSLA;phases.push(phase);await writeFile(resolve(output,name+'-phases.json'),JSON.stringify(phases,null,2));assert.ok(phase.frameCount>=2,label+': animation frames advance');if(label.includes('forced-render'))assert.ok(phase.completedPresentationFrames>=2,label+': actual presentation frames advance');if(loadedFrameSLA&&!(phase.maxFrameGapMs<150))failedPerformancePhases.push({label,maxFrameGapMs:phase.maxFrameGapMs,requiredBelowMs:150});return phase;
  };
  const labelTexts=()=>page.locator('#map .side-measurement-label').allTextContents();
  const coordinateSearchChecks=async()=>{
   // The mobile detail preview reparents #map; search belongs to the main map.
   if(mobile){await click('#mobile-app [data-view="map"]');await settle();await frames();}
   const before=await camera(),beforeData=await data(),requestCount=geocoderRequests.length;
   const form=mobile?'#search-form':'#map-search-form',input=mobile?'#search-input':'#map-search-input';
   const showSearch=async()=>{if(mobile)await click('#mobile-app [data-sheet="search"]');else if(await page.locator(form).isHidden())await click('#map-search-button');};
   const hideSearch=async()=>{if(mobile){if(await page.locator('.mobile-sheet').isVisible())await click('#mobile-close-sheet');}else if(await page.locator(form).isVisible())await click('#map-search-button');};
   const submit=async query=>{await showSearch();await page.locator(input).fill(query);await click(form+' button[aria-label="Cerca"]');};
   const query=`44°58'20.5"N 7°57'49.3"E`,expected=[7.963694444444445,44.97236111111111];
   await submit(query);
   await page.waitForFunction(expected=>!__map.isMoving()&&__map.getCenter().toArray().every((value,index)=>Math.abs(value-expected[index])<1e-7),expected,{timeout:15000});
   await hideSearch();await settle();await frames();await page.waitForTimeout(400);
   const found=await camera();assert.ok(found.center.every((value,index)=>Math.abs(value-expected[index])<1e-7),'real DMS search positions the main map at the exact parsed location');
   const marker=await page.evaluate(expected=>{const target=__map.project(expected),canvas=__map.getCanvas().getBoundingClientRect();return [...document.querySelectorAll('#map .maplibregl-marker:not(.side-measurement-label)')].map(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {x:rect.x+rect.width/2-canvas.x,y:rect.bottom-canvas.y,top:rect.top-canvas.y,width:rect.width,height:rect.height,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0&&rect.width>0&&rect.height>0&&rect.right>canvas.left&&rect.left<canvas.right&&rect.bottom>canvas.top&&rect.top<canvas.bottom};}).find(value=>value.visible&&Math.abs(value.x-target.x)<6&&target.y>=value.top-6&&target.y<=value.y+6);},expected);
   assert.ok(marker,'the actual search marker is visible at the projected coordinate');assert.deepEqual(await data(),beforeData,'coordinate navigation preserves the entire project, quantities and eye state');assert.equal(geocoderRequests.length,requestCount,'valid coordinates and their autocomplete never request a remote geocoder');
   await page.screenshot({path:resolve(output,name+'-coordinate-search.png'),fullPage:true});
   await submit(`91°0'0"N 7°57'49.3"E`);await page.waitForFunction(()=>/coordinate non valide/i.test(document.querySelector('#map-status')?.textContent??''));await hideSearch();await settle();await page.waitForTimeout(400);
   const invalidStatus=await page.locator('#map-status').textContent();assert.deepEqual(await camera(),found,'out-of-range coordinate input does not move the map');assert.deepEqual(await data(),beforeData,'invalid coordinates preserve all project data');assert.equal(geocoderRequests.length,requestCount,'out-of-range coordinates never fall back to remote geocoding');
   await page.evaluate(before=>__map.jumpTo(before),before);await settle();await frames();assert.deepEqual(await camera(),before,'search proof restores its pre-search camera');
   return {query,expected,actual:found.center,marker,invalidStatus,geocoderRequests:geocoderRequests.length-requestCount,projectUnchanged:true,cameraRestored:true,surface:mobile?'mobile-search-sheet':'map-search-toolbar'};
  };
  let savedCamera,savedHandlers,savedData,savedCheckpoint,savedLabelTexts,environment;
  try{
   await page.goto(base+'/');await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate')&&document.querySelector('[data-map-terrain]')?.disabled===false,null,{timeout:25000});await settle();
   environment={browser:await browser.version(),...await page.evaluate(()=>{const canvas=__map.getCanvas(),gl=canvas.getContext('webgl2')??canvas.getContext('webgl'),debug=gl?.getExtension('WEBGL_debug_renderer_info');return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:[canvas.width,canvas.height]};})};
   await page.evaluate(()=>{__map.stop();__map.touchZoomRotate.disable();__map.scrollZoom.disable();__map.jumpTo({pitch:12,bearing:19,padding:{top:3,bottom:4,left:5,right:6}});});await settle();
   savedCamera=await camera();savedHandlers=await handlers();savedData=await data();savedCheckpoint=await checkpoint();savedLabelTexts=await labelTexts();assert.ok(savedLabelTexts.length>=4,'real field side measurements are present');
   const sources=()=>page.evaluate(()=>({field:__map.getSource('project-geometry')?._data,rows:__map.getSource('vineyard-rows')?._data}));const planarSources=await sources();await writeFile(resolve(output,name+'-real-app-planar-sources.json'),JSON.stringify(planarSources,null,2));
   assert.ok(savedData.metrics.some(value=>value&&/[0-9]/.test(value)),'real project quantities are present');
   await timed('open-continuous-terrain',open);assert.equal(await page.locator('.terrain-camera-controls,[data-terrain-camera]').count(),0,'terrain has no rejected manual navigation buttons');
   const terrain=await page.evaluate(()=>({terrain:__map.getTerrain(),drawingBuffer:[__map.getCanvas().width,__map.getCanvas().height],pixelRatio:__map.getPixelRatio(),demSources:Object.entries(__map.getStyle().sources).filter(([,source])=>source.type==='raster-dem').map(([id,source])=>({id,bounds:source.bounds})),mapCount:__maps.length}));assert.equal(terrain.terrain.exaggeration,1);assert.ok(terrain.demSources.some(source=>source.id===terrain.terrain.source&&!source.bounds),'one unbounded DEM covers the visible context');assert.equal(terrain.mapCount,1,'editable map remains the same real map');
   assert.deepEqual(await sources(),planarSources,'native draped overlays preserve real project/row sources');
   const rowPaths=(planarSources.rows?.features??[]).flatMap(feature=>feature.geometry?.type==='LineString'?[feature.geometry.coordinates]:feature.geometry?.type==='MultiLineString'?feature.geometry.coordinates:[]),fieldPaths=(planarSources.field?.features??[]).flatMap(feature=>feature.geometry?.type==='Polygon'?feature.geometry.coordinates:[]);assert.ok(rowPaths.length>=3,'real running app has calculated row paths');assert.ok(fieldPaths.length>0);
   await timed('loaded-stationary',()=>page.waitForTimeout(1200));await timed('loaded-forced-render',()=>page.evaluate(()=>new Promise(done=>{const start=performance.now();function frame(){__map.triggerRepaint();if(performance.now()-start<1200)requestAnimationFrame(frame);else done();}requestAnimationFrame(frame);})));
   const rendererDiagnostic=await page.evaluate(()=>({layers:__map.getStyle().layers.map(layer=>({id:layer.id,type:layer.type,visibility:layer.layout?.visibility??'visible',source:layer.source})),rttStacks:__map.painter?.renderToTexture?._stacks??null,rttTiles:__map.painter?.renderToTexture?._renderableTiles?.length??null}));await writeFile(resolve(output,name+'-renderer-diagnostic.json'),JSON.stringify(rendererDiagnostic,null,2));
   if(process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_HIDE_EDIT_CIRCLES==='1'){
    await page.evaluate(()=>{window.__diagnosticCircleVisibility=[];for(const layer of __map.getStyle().layers)if(layer.type==='circle'&&(/gl-draw|manual/i.test(layer.id))){__diagnosticCircleVisibility.push([layer.id,layer.layout?.visibility??'visible']);__map.setLayoutProperty(layer.id,'visibility','none');}});await frames();await timed('diagnostic-hidden-edit-circles-forced-render',()=>page.evaluate(()=>new Promise(done=>{const start=performance.now();function frame(){__map.triggerRepaint();if(performance.now()-start<1200)requestAnimationFrame(frame);else done();}requestAnimationFrame(frame);})));await writeFile(resolve(output,name+'-renderer-hidden-circles.json'),JSON.stringify(await page.evaluate(()=>({hidden:__diagnosticCircleVisibility,rttStacks:__map.painter?.renderToTexture?._stacks??null,rttTiles:__map.painter?.renderToTexture?._renderableTiles?.length??null})),null,2));
   }
   const sweepPitches=process.env.TERRAIN_SCENE_BROWSER_PITCHES?process.env.TERRAIN_SCENE_BROWSER_PITCHES.split(',').map(Number):mobile?[30,55,75,85]:[0,30,55,75,85];assert.ok(sweepPitches.length&&sweepPitches.every(value=>[0,30,55,75,85].includes(value)));
   for(const pitch of sweepPitches)for(const bearing of [0,90,180,270]){
    const label='p'+pitch+'-b'+bearing;await page.evaluate(({center,pitch,bearing,zoom})=>{__map.stop();__map.jumpTo({center,pitch,bearing,zoom});},{center:geo([50,50]),pitch,bearing,zoom:savedCamera.zoom});await settle();
    await eyes({field:false,schema:false,quotes:false});const bare=await capture(label+'-context'),continuity=terrainEvidence(bare,{highPitch:pitch>=75});
    await writeFile(resolve(output,name+'-'+label+'-continuity.json'),JSON.stringify(continuity,null,2));const minCells=pitch>=75?4:8;assert.ok(continuity.matchingFraction>=.70,label+': independently preselected world witnesses agree with composed imagery');assert.ok(continuity.matchingCells>=minCells,label+': final imagery matches independent elevated world samples in '+continuity.matchingCells+' viewport cells');
    if(pitch>=30&&pitch<=55)assert.ok(continuity.displacedCorrect>=2,label+': context satellite appears at physical elevation rather than flat datum');
    await eyes({field:true,schema:false,quotes:false});const fieldOnly=await capture(label+'-field');await eyes({schema:true});const shown=await capture(label+'-all');
    const rows=overlayEvidence(shown,fieldOnly,rowPaths,'rows'),field=overlayEvidence(fieldOnly,bare,fieldPaths,'field');
    if(pitch<=55){assert.ok(rows.visibleCount>=12&&rows.visiblePaths>=3,label+': final composed row pixels visible on separated real rows');assert.ok(rows.belowDatum>=3&&rows.aboveDatum>=3,label+': rows visible on both sides of field datum');assert.ok(field.visibleCount>=12,label+': real field perimeter/fill pixels survive composed frame');}
    else {assert.ok(rows.sampleCount===0||rows.visibleCount>=Math.min(3,rows.sampleCount),label+': independently unoccluded grazing rows remain visible');assert.ok(field.sampleCount===0||field.visibleCount>=Math.min(3,field.sampleCount),label+': independently unoccluded grazing field remains visible');assert.ok(rows.sampleCount+rows.naturallyOccludedCount>=12&&field.sampleCount+field.naturallyOccludedCount>=8,label+': grazing setup retains actual geometry samples and explains physical occlusion');}
    visuals.push({label,camera:await camera(),continuity,rows,field});await writeFile(resolve(output,name+'-visual-evidence.json'),JSON.stringify(visuals,null,2));
   }
   await eyes({field:true,schema:true,quotes:true});await page.evaluate(({center,zoom})=>__map.jumpTo({center,zoom,pitch:55,bearing:19}),{center:geo([50,50]),zoom:savedCamera.zoom});await settle();
   const annotationRects=await page.evaluate(()=>{const host=__map.getCanvas().getBoundingClientRect();return [...document.querySelectorAll('#map .side-measurement-label')].map(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {text:node.textContent,x:rect.x-host.x,y:rect.y-host.y,width:rect.width,height:rect.height,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0};}).filter(rect=>rect.visible&&rect.width>0&&rect.height>0&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<host.width&&rect.y+rect.height<host.height);});
   assert.ok(annotationRects.length>=2,'native quote labels occupy the visible viewport');assert.deepEqual(await labelTexts(),savedLabelTexts,'native presentation retains actual side text');
   const quoteShown=await capture('quote-labels-on');await eyes({quotes:false});const quoteHidden=await capture('quote-labels-off');
   const annotations=annotationRects.map(rect=>{let changedPixels=0;for(let y=Math.ceil(rect.y);y<rect.y+rect.height;y++)for(let x=Math.ceil(rect.x);x<rect.x+rect.width;x++){const a=pixelAt(quoteShown,x,y),b=pixelAt(quoteHidden,x,y);if(a&&b&&Math.max(...[0,1,2].map(index=>Math.abs(a[index]-b[index])))>18)changedPixels++;}return {...rect,changedPixels};});
   assert.ok(annotations.filter(label=>label.changedPixels>=20).length>=2,'quote eye controls actual composed label pixels');await eyes({quotes:true});
   await page.evaluate(id=>{if(__map.getLayer(id))__map.removeLayer(id);},observer);await frames();
   const rect=await page.locator('#map canvas.maplibregl-canvas').boundingBox(),cx=rect.x+rect.width*.5,cy=rect.y+rect.height*.52,deltas={};
   const angle=(a,b)=>((a-b+540)%360)-180;
   if(!mobile){
    // MapLibre's first mouseover queries the GPU terrain to pick a ground
    // coordinate. Record that cold pointer-entry cost separately; trackpad
    // input assumes its pointer is already over the map, as in actual use.
    const beforePointer=await camera();await timed('pointer-entry',async()=>{await page.mouse.move(cx,cy);await settle();});assert.deepEqual(await camera(),beforePointer,'pointer entry does not navigate the map');await frames();await settle();
    let before=await camera();await timed('trackpad-pan',async()=>{await page.mouse.wheel(40,60);await settle();});let after=await camera();deltas.pan=Math.hypot(after.center[0]-before.center[0],after.center[1]-before.center[1]);assert.ok(deltas.pan>1e-7);assert.ok(Math.abs(after.pitch-before.pitch)<1e-6&&Math.abs(angle(after.bearing,before.bearing))<1e-6&&Math.abs(after.zoom-before.zoom)<1e-6);
    for(const [label,dx,dy]of [['shift-horizontal',60,0],['shift-vertical',0,45],['shift-diagonal',30,-30]]){
     before=await camera();await timed(label,async()=>{await page.keyboard.down('Shift');await page.mouse.wheel(dx,dy);await page.keyboard.up('Shift');await settle();});after=await camera();const bearing=angle(after.bearing,before.bearing),pitch=after.pitch-before.pitch;assert.ok(Math.abs(bearing-dx*.18)<1e-5&&Math.abs(pitch-dy*.18)<1e-5,label+': Shift axes change bearing/pitch independently');assert.ok(Math.hypot(...after.center.map((value,index)=>value-before.center[index]))<1e-10,label+': retains panned center');assert.ok(Math.abs(after.zoom-before.zoom)<1e-6);deltas[label]={bearing,pitch};
    }
    before=await camera();await timed('mouse-pan',async()=>{await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+55,cy+25,{steps:10});await page.mouse.up();await settle();});after=await camera();assert.ok(Math.hypot(...after.center.map((value,index)=>value-before.center[index]))>1e-7);
    before=await camera();await timed('mouse-rotate-pitch',async()=>{await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});await page.mouse.move(cx+65,cy-35,{steps:12});await page.mouse.up({button:'right'});await settle();});after=await camera();assert.ok(Math.abs(angle(after.bearing,before.bearing))>10&&Math.abs(after.pitch-before.pitch)>3);
    before=await camera();await timed('native-pinch-zoom',async()=>{await page.keyboard.down('Control');await page.mouse.wheel(0,-160);await page.keyboard.up('Control');await settle();});after=await camera();assert.ok(after.zoom-before.zoom>.1);
   }else{
    const cdp=await context.newCDPSession(page),touch=async frames=>{for(let index=0;index<frames.length;index++){await cdp.send('Input.dispatchTouchEvent',{type:index?'touchMove':'touchStart',touchPoints:frames[index].map(([x,y],id)=>({x,y,id,radiusX:5,radiusY:5,force:1}))});await page.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();};
    let before=await camera();await timed('touch-pinch',()=>touch(Array.from({length:13},(_,i)=>[[cx-45-i*3,cy],[cx+45+i*3,cy]])));let after=await camera();assert.ok(after.zoom-before.zoom>.5);
    before=await camera();await timed('touch-rotate',()=>touch(Array.from({length:17},(_,i)=>{const a=i*Math.PI/32;return [[cx-65*Math.cos(a),cy-65*Math.sin(a)],[cx+65*Math.cos(a),cy+65*Math.sin(a)]];})));after=await camera();assert.ok(Math.abs(angle(after.bearing,before.bearing))>10);
    before=await camera();await timed('touch-pitch',()=>touch(Array.from({length:13},(_,i)=>[[cx-45,cy-30+i*5],[cx+45,cy-30+i*5]])));after=await camera();assert.ok(Math.abs(after.pitch-before.pitch)>5);
    before=await camera();await timed('touch-pan',()=>touch(Array.from({length:13},(_,i)=>[[cx+i*4,cy+i*2]])));after=await camera();assert.ok(Math.hypot(...after.center.map((value,index)=>value-before.center[index]))>1e-7);
   }
   assert.deepEqual(await checkpoint(),savedCheckpoint,'3D gestures preserve pre-entry workspace camera');assert.deepEqual(await data(),savedData,'3D view leaves project, quantities and visibility unchanged');
   // Far context is deliberately beyond the entire frozen 320m DTM support.
   await page.evaluate(({center,zoom})=>__map.jumpTo({center,zoom,pitch:55,bearing:135}),{center:geo([750,650]),zoom:savedCamera.zoom-1});await settle();await eyes({field:false,schema:false,quotes:false});const farFrame=await capture('far-context'),far=terrainEvidence(farFrame,{outsideOnly:true});assert.ok(far.matchingCells>=8&&far.outsideNative>=8,'final whole-viewport imagery extends beyond native DTM footprint');assert.ok(far.displacedCorrect>=3,'far context is actual elevated satellite terrain rather than a flat surrounding map');await eyes({field:true,schema:true,quotes:true});
   await close();assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);assert.deepEqual(await data(),savedData);assert.deepEqual(await labelTexts(),savedLabelTexts,'original 2D marker text restored');await open();failureMode='imagery';await page.evaluate(center=>__map.jumpTo({center,zoom:18,pitch:55}),geo([6000,5000]));await page.waitForFunction(()=>!__map.getTerrain()&&document.querySelector('[data-map-terrain]')?.getAttribute('aria-pressed')!=='true',null,{timeout:25000});const imageryFailure=await page.locator('#map-status').textContent();assert.ok(/immagin|satellit|tile|503|risors/i.test(imageryFailure),'missing uncached satellite is explicit');failureMode=null;await settle();assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);await open();await close();assert.deepEqual(await camera(),savedCamera);
   failureMode='dem';await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-busy')!=='true'&&!__map.getTerrain()&&/terreno|contesto|satellit|DTM|3D/i.test(document.querySelector('#map-status')?.textContent??''),null,{timeout:30000});const contextFailure=await page.locator('#map-status').textContent();assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);failureMode=null;
   await page.evaluate(()=>{window.__delayNextTerrainWorker=true;});await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-busy')==='true'&&__graphics.some(worker=>worker.deliberatelyDelayed&&!worker.terminated));assert.equal(await page.locator(control).isDisabled(),false);await click(control);await settle();await page.evaluate(()=>{const worker=__delayedWorker;if(worker?.pending){const [data,args]=worker.pending;worker.pending=null;worker.postMessage(data,...args);}});await page.waitForTimeout(500);assert.equal(await sceneActive(),false);assert.deepEqual(await camera(),savedCamera);const cancellation=await page.evaluate(()=>__graphics.filter(worker=>worker.deliberatelyDelayed));assert.ok(cancellation.every(worker=>worker.terminated&&worker.returned===0),'pending worker retired before stale delivery');
   delayDEM=true;await click(control);await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.getAttribute('aria-busy')==='true');await page.waitForTimeout(150);assert.ok(delayedRoutes.length>0,'context tile response is genuinely pending');await click(control);delayDEM=false;for(const release of delayedRoutes.splice(0))release();await page.waitForTimeout(500);assert.equal(await sceneActive(),false);assert.deepEqual(await camera(),savedCamera);assert.deepEqual(await handlers(),savedHandlers);
   await open();await page.evaluate(()=>{window.__fieldCameraMoves=[];__map.on('moveend',()=>__fieldCameraMoves.push({center:__map.getCenter().toArray(),terrain:!!__map.getTerrain()}));});
   if(mobile){await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="other"]');}else await page.locator('#map-field-select').selectOption('other');await settle();const target=geo([2050,2050]),afterField=await camera(),fieldChange=await page.evaluate(({key,target})=>({activeFieldId:JSON.parse(localStorage.getItem(key)).state.project.activeFieldId,targetVisible:__map.getBounds().contains(target),terrain:__map.getTerrain(),moves:__fieldCameraMoves,controlCount:document.querySelectorAll('[data-map-terrain]').length}),{key:draftKey,target});assert.equal(fieldChange.activeFieldId,'other');assert.equal(fieldChange.terrain,null);assert.ok(fieldChange.targetVisible);assert.equal(fieldChange.controlCount,1);assert.ok(Math.hypot(...afterField.center.map((value,index)=>value-target[index]))<.001);assert.deepEqual(await handlers(),savedHandlers);
   const firstFit=fieldChange.moves.findIndex(move=>Math.hypot(...move.center.map((value,index)=>value-target[index]))<.001);assert.ok(firstFit>=0);assert.ok(!fieldChange.moves.slice(firstFit+1).some(move=>Math.hypot(...move.center.map((value,index)=>value-savedCamera.center[index]))<.00001),'old terrain snapshot never overwrites newly selected field fit');
   let mobilePreview=null;if(mobile){await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="f"]');await settle();assert.equal(await page.locator('#mobile-detail-map #map').count(),1);const previewCamera=await camera();await page.waitForFunction(()=>document.querySelector('[data-map-terrain]')?.disabled===false);await open();await eyes({field:false,schema:false,quotes:false});const frame=await capture('detail-preview'),evidence=terrainEvidence(frame);assert.ok(evidence.matchingCells>=6,'reparented preview has rendered satellite terrain pixels');await eyes({field:true,schema:true,quotes:true});await close();assert.deepEqual(await camera(),previewCamera);assert.deepEqual(await handlers(),savedHandlers);mobilePreview={evidence,cameraRestored:true};}
   const workers=await page.evaluate(()=>__graphics.filter(worker=>/terrain-/.test(worker.url)));assert.ok(workers.length>=4&&workers.every(worker=>worker.terminated),'all display workers terminate after repeat/failure/cancel/field changes');const remaining=await page.evaluate(()=>Object.entries(__map.getStyle().sources).filter(([,source])=>source.type==='raster-dem'));assert.deepEqual(remaining,[],'owned DEM sources removed after teardown');assert.equal(await page.locator('.terrain-camera-controls,[data-terrain-camera]').count(),0);
   const coordinateSearch=await coordinateSearchChecks();
   const glCode=await page.evaluate(()=>{const canvas=__map.getCanvas(),gl=canvas.getContext('webgl2')??canvas.getContext('webgl');return gl.getError();});assert.equal(glCode,0);assert.deepEqual(glErrors,[]);assert.deepEqual(errors,[]);assert.deepEqual(local404,[]);assert.ok(fixtureDEMs.length>0&&fixtureRasters.length>0);
   const record={name,functionalAccepted:true,appRoot:root,diagnosticHiddenEditCircles:process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_HIDE_EDIT_CIRCLES==='1',rendererDiagnostic,performanceAccepted:failedPerformancePhases.length===0&&process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_PERF_BYPASS!=='1'&&process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_HIDE_EDIT_CIRCLES!=='1',failedPerformancePhases,fullVisualMatrix:!process.env.TERRAIN_SCENE_BROWSER_PITCHES,environment,actualMapLibre:'4.7.1',scope:'Actual application, anonymous varied native Float32 5m DTM, independent global Terrarium context and world-continuous patterned satellite fixtures; desktop/mobile Chromium input emulation, not physical-device certification.',modelHash:model.contentHash,nativeRange:[Math.min(...nativeValues),Math.max(...nativeValues)],terrain,visuals,annotations,far,phases,deltas,contextFailure,imageryFailure,cancellation,workers,fieldChange,mobilePreview,coordinateSearch,cameraRestored:true,handlersRestored:true,workspacePreserved:true,projectUnchanged:true,fixtureRasterRequests:fixtureRasters.length,fixtureDEMRequests:fixtureDEMs.length,externalDenied:[...externalDenied],errors,glErrors,glCode,local404};reports.push(record);await writeFile(resolve(output,name+'-report.json'),JSON.stringify(record,null,2));await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));await page.screenshot({path:resolve(output,name+'-2d-restored.png'),fullPage:true});console.log(name+(record.performanceAccepted?' continuous terrain PASS ':' continuous terrain FUNCTIONAL CHECKS; performance not accepted ')+JSON.stringify({visualStates:visuals.length,outsideNativeCells:far.outsideNative,maximumLoadedFrameGapMs:Math.max(...phases.filter(phase=>phase.loadedFrameSLA).map(phase=>phase.maxFrameGapMs)),coldOpenFrameGapMs:phases.find(phase=>phase.label==='open-continuous-terrain')?.maxFrameGapMs,pointerEntryFrameGapMs:phases.find(phase=>phase.label==='pointer-entry')?.maxFrameGapMs}));
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true}).catch(()=>{});const diagnostic=await page.evaluate(()=>({status:document.querySelector('#map-status')?.textContent,control:document.querySelector('[data-map-terrain]')?.outerHTML,workers:__graphics,terrain:__map?.getTerrain(),matrix:window.__frameMatrix,camera:__map?{center:__map.getCenter().toArray(),zoom:__map.getZoom(),pitch:__map.getPitch(),bearing:__map.getBearing()}:null})).catch(()=>null);await writeFile(resolve(output,name+'-failure.json'),JSON.stringify({message:error.stack,functionalAccepted:false,appRoot:root,performanceAccepted:false,diagnosticPerfBypass:process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_PERF_BYPASS==='1',fullVisualMatrix:!process.env.TERRAIN_SCENE_BROWSER_PITCHES,environment,diagnostic,failedPerformancePhases,phases,visuals,errors,glErrors,local404,externalDenied:[...externalDenied]},null,2));throw error;
  }finally{delayDEM=false;for(const release of delayedRoutes.splice(0))release();await context.close();}
 }
 const failed=reports.flatMap(report=>report.failedPerformancePhases.map(phase=>({view:report.name,...phase})));
 console.log(JSON.stringify({functionalChecks:reports.map(report=>report.name),performanceAccepted:reports.every(report=>report.performanceAccepted),failedPerformancePhases:failed,output}));
 if(process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_PERF_BYPASS!=='1'&&process.env.TERRAIN_SCENE_BROWSER_DIAGNOSTIC_HIDE_EDIT_CIRCLES!=='1')assert.equal(failed.length,0,'Loaded performance must stay below150ms in every phase: '+JSON.stringify(failed));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
