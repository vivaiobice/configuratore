// Exercise saved, map-clipped passages through the real configurator in Chromium.
// All external requests are fulfilled from local fixtures or blocked.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';
import {normalizeIntersectionRings} from '../src/geometry.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.COUNTS_BROWSER_OUTPUT??resolve(root,'.counts-work/browser/row-interruption'));
await mkdir(output,{recursive:true});
const assets=process.env.COUNTS_BROWSER_ASSETS??'/tmp/v122-browser-assets';
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');
const engineOverride=process.env.COUNTS_ROW_CURVES_PATH?await readFile(process.env.COUNTS_ROW_CURVES_PATH,'utf8'):null;
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  res.end(pathname==='/src/row-curves.js'&&engineOverride!==null?engineOverride:await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const exposeMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
  constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}};`;
const sdk=`export function createClient(){
  const user=window.__fixture.user,session={user,access_token:'fixture'};
  const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
    if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{
      user_id:user.id,owner_kind:'user',display_name:'Test',first_name:'Test',last_name:'User',
      phone:'123',email:'test@example.test',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);
    return (...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
  }});return query;};
  return {auth:{async getSession(){if(!window.__map?.__initialLoad)await new Promise(done=>window.__map.once('load',done));return {data:{session},error:null};},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(){return Promise.resolve({data:{},error:null});}};
}`;
const metresPerDegree=6371008.8*Math.PI/180;
const lonM=1/(metresPerDegree*Math.cos(44*Math.PI/180)),latM=1/metresPerDegree;
const coordinate=([x,y])=>[8+x*lonM,44+y*latM];
const ring=points=>[...points,points[0]].map(coordinate);
const polygon=ring([[0,0],[100,0],[10,100],[30,200],[-10,200],[9.8,100]]);
// This is the parcel/corridor intersection delivered to onExclusionAdd by the map.
const clippedRing=normalizeIntersectionRings([[ring([[9.7755,99.75],[10.225,99.75],[11.575,98.25],[9.6285,98.25]])]])[0];
const state=createInitialState();
state.project=ensureProjectFields({...state.project,localProjectId:'fixture-clipped-passage',localProjectName:'Passaggio ritagliato',fields:[{
  ...state.project.fields[0],geometry:polygon,orientationDeg:0,orientationLocked:true,rowSpacingM:5,plantSpacingM:1,
  postSpacingM:4.5,headlandWidthM:6,label:'Campo con passaggio ritagliato',
  exclusions:[{id:'ex-saved',label:'Passaggio lineare 1,50 m',type:'linear',widthM:1.5,geometry:clippedRing}],
  rowCurvePoints:[{id:'lower',position:.2,offsetM:3},{id:'upper',position:.8,offsetM:-3}]
}]});
const owner='00000000-0000-4000-8000-000000000124';
const draftKey='vivai-obice:configuratore:draft:live:'+owner;
const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
  map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:coordinate([40,100]),zoom:18,bearing:0}},
  navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.COUNTS_CHROMIUM_PATH?{
    executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  const page=await context.newPage(),errors=[];
  let blockedRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(({draftKey,state,workspace,owner})=>{
    window.__fixture={user:{id:owner,is_anonymous:false,email:'test@example.test',app_metadata:{}}};
    if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));
    localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,state,workspace,owner});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.href.startsWith(base+'/'))return route.continue();
    if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
    if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
    if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
    if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
    if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
    if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
    blockedRequests++;
    return route.abort();
  });
  const ready=()=>page.waitForFunction(key=>{
    const saved=JSON.parse(localStorage.getItem(key));
    return window.__map?.getSource('vineyard-rows')&&window.__map?.getSource('manual-draw')
      &&document.querySelector('#profile-trigger')?.textContent!=='Profilo'
      &&saved?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate');
  },draftKey,{timeout:15000});
  const snapshot=()=>page.evaluate(async key=>{
    const project=JSON.parse(localStorage.getItem(key)).state.project;
    const {calculateProject}=await import('/src/project-calculator.js');
    const {getRowCurveSegments}=await import('/src/row-curves.js');
    const result=calculateProject({polygon:project.geometry,...project});
    const segments=getRowCurveSegments({polygon:project.geometry,...project});
    const mapRows=__map.getSource('vineyard-rows')._data.features.map(feature=>feature.geometry.coordinates);
    const upperId=segments[1]?.id;
    return {segments,rows:result.rows,mapRows,upperRows:result.rows.filter(row=>row.segmentId===upperId),
      upperMapRows:mapRows.filter((_row,index)=>result.rows[index]?.segmentId===upperId),
      lowerRows:result.rows.filter(row=>row.segmentId===segments[0]?.id),headPosts:result.headPosts,
      uiHeadPosts:Number(document.querySelector('#summary-head-posts').textContent.replace(/[^0-9]/g,'')),
      controls:[...document.querySelectorAll('.curve-point-card strong')].map(node=>node.textContent),
      savedPoints:project.rowCurvePoints,sourceType:__map.getSource('vineyard-rows').type};
  },draftKey);
  const checkRendering=snapshot=>{
    assert.equal(snapshot.segments.length,2,'saved clipped passage must create two independent drawings');
    assert.match(snapshot.controls[0],/Tratto 1/);
    assert.match(snapshot.controls[1],/Tratto 2/);
    assert.equal(snapshot.sourceType,'geojson');
    assert.deepEqual(snapshot.mapRows,snapshot.rows.map(row=>row.coordinates),'the actual MapLibre source contains the calculated physical pieces');
    assert.equal(snapshot.headPosts,snapshot.mapRows.length*2);
    assert.equal(snapshot.uiHeadPosts,snapshot.mapRows.length*2,'the visible head-post total accounts for both ends of every surviving map piece');
    assert.ok(snapshot.upperRows.length>=5);
  };
  await page.goto(base+'/');
  await ready();
  const before=await snapshot();
  checkRendering(before);
  await page.locator('#curve-edit-button').click();
  assert.equal(await page.locator('.curve-control-marker').count(),2);
  assert.match(await page.locator('.curve-control-marker').nth(0).getAttribute('title'),/Tratto 1/);
  assert.match(await page.locator('.curve-control-marker').nth(1).getAttribute('title'),/Tratto 2/);
  await page.screenshot({path:resolve(output,'clipped-passage-before.png'),fullPage:true});
  await page.locator('.curve-point-card').nth(0).locator('input[type="range"]').nth(1).evaluate(node=>{
    node.value='12';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const after=await snapshot();
  checkRendering(after);
  assert.equal(JSON.stringify(after.upperRows),JSON.stringify(before.upperRows),'upper drawing is byte-identical after changing the lower offset');
  assert.equal(JSON.stringify(after.upperMapRows),JSON.stringify(before.upperMapRows),'upper MapLibre features are byte-identical after changing the lower offset');
  assert.notDeepEqual(after.lowerRows,before.lowerRows,'lower drawing responds to the real slider');
  assert.equal(after.savedPoints.find(point=>point.id==='lower').offsetM,12);
  assert.ok(after.savedPoints.every(point=>point.segmentId),'resolved drawing assignments persist in the actual draft');
  await page.screenshot({path:resolve(output,'clipped-passage-after.png'),fullPage:true});
  await page.reload();
  await ready();
  const reloaded=await snapshot();
  checkRendering(reloaded);
  assert.equal(JSON.stringify(reloaded.upperRows),JSON.stringify(after.upperRows));
  assert.equal(reloaded.savedPoints.find(point=>point.id==='lower').offsetM,12);
  assert.deepEqual(errors,[],'the real app reports no uncaught browser errors');
  const summary={passed:true,externalRequestsAllowed:0,blockedRequests,
    before:{pieces:before.rows.length,headPosts:before.headPosts,upperPieces:before.upperRows.length,controls:before.controls},
    after:{pieces:after.rows.length,headPosts:after.headPosts,upperPieces:after.upperRows.length,controls:after.controls},
    upperDrawingByteIdentical:true,upperMapSourceByteIdentical:true,persistedAfterReload:true,browserErrors:errors};
  await writeFile(resolve(output,'row-interruption-result.json'),JSON.stringify({summary,before,after,reloaded},null,2)+'\n');
  await writeFile(resolve(output,'row-interruption-result.log'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  await context.close();
}finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
}
