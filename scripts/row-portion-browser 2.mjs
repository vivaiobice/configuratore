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


const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.COUNTS_BROWSER_OUTPUT??resolve(root,'.counts-work/browser/row-portions'));
await mkdir(output,{recursive:true});
const assets=process.env.COUNTS_BROWSER_ASSETS??'/tmp/v122-browser-assets';
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');
const appOverride=process.env.COUNTS_APP_PATH?await readFile(process.env.COUNTS_APP_PATH,'utf8'):null;
const engineOverride=process.env.COUNTS_ROW_CURVES_PATH?await readFile(process.env.COUNTS_ROW_CURVES_PATH,'utf8'):null;
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  if(pathname==='/src/app.js'&&appOverride!==null){res.end(appOverride);return;}
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
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
const state=createInitialState();
const plainGeometry=[[.001,45],[.0015,45],[.0015,45.0005],[.001,45.0005],[.001,45]];
state.project=ensureProjectFields({...state.project,localProjectId:'fixture-portions',localProjectName:'Porzioni indipendenti',activeFieldId:'l-field',fields:[
 {...state.project.fields[0],...fixture,id:'l-field',geometry:fixture.polygon,orientationLocked:true,headlandWidthM:4,label:'Campo a L',rowPortions:[]},
 {...state.project.fields[0],id:'plain-field',geometry:plainGeometry,orientationDeg:45,orientationLocked:true,label:'Campo intero',rowCurvePoints:[{id:'plain-curve',position:.5,offsetM:2}],rowPortions:[]}
]});
const owner='00000000-0000-4000-8000-000000000125',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const reports=[];
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.COUNTS_CHROMIUM_PATH?{executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 for(const mobile of (process.env.COUNTS_BROWSER_MODE==='mobile'?[true]:process.env.COUNTS_BROWSER_MODE==='desktop'?[false]:[false,true])){
  const name=mobile?'mobile':'desktop';
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1100}});
  const page=await context.newPage(),errors=[];let blockedRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
   map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:[0,44.9993],zoom:17,bearing:0}},
   navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({draftKey,state,workspace,owner})=>{
   window.__fixture={user:{id:owner,is_anonymous:false,email:'test@example.test',app_metadata:{}}};
   if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,state,workspace,owner});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.href.startsWith(base+'/'))return route.continue();
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
   blockedRequests++;return route.abort();
  });
  const ready=()=>page.waitForFunction(key=>{const saved=JSON.parse(localStorage.getItem(key));return window.__map?.getSource('row-portions')&&window.__map?.getSource('manual-draw')&&document.querySelector('#profile-trigger')?.textContent!=='Profilo'&&saved?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate');},draftKey,{timeout:15000});
  const snapshot=()=>page.evaluate(async key=>{
   const record=JSON.parse(localStorage.getItem(key)),project=record.state.project;
   const {calculateProject}=await import('/src/project-calculator.js?v=1.2.6');
   const result=calculateProject({...project,polygon:project.geometry});
   const mapRows=__map.getSource('vineyard-rows')._data.features.map(f=>f.geometry.coordinates);
   const features=__map.getSource('row-portions')._data.features;
   return {project,rows:result.rows,mapRows,portions:result.portions,features,activeId:document.querySelector('#row-portion-picker button[aria-pressed="true"]')?.dataset.portionId,
    heads:result.headPosts,uiHeads:Number(document.querySelector('#summary-head-posts').textContent.replace(/[^0-9]/g,'')),screen:document.body.dataset.mobileScreen,
    controls:[...document.querySelectorAll('.curve-point-card')].map(n=>n.textContent),workspace:record.workspace};
  },draftKey);
  const check=s=>{assert.deepEqual(s.mapRows,s.rows.map(r=>r.coordinates));assert.equal(s.heads,s.rows.length*2);assert.equal(s.uiHeads,s.heads);assert.ok(Number.isFinite(s.heads));};
  const buttons=()=>page.locator('#row-portion-picker button');
  const pick=async id=>{await page.locator('#row-portion-picker button[data-portion-id="'+id+'"]').click();};
  const closeSheet=async()=>{if(mobile&&await page.locator('.mobile-sheet').isVisible())await page.locator('#mobile-close-sheet').click();};
  const openOrientation=async()=>{if(mobile){if(await page.locator('.mobile-sheet').isVisible()&&await page.locator('.mobile-sheet [data-content="orientation"]').isVisible())return;await closeSheet();await page.locator('[data-sheet="orientation"]').click();}};
  const openCurves=async()=>{if(mobile){await openOrientation();if(!await page.locator('[data-filari-section="curve"]').evaluate(node=>node.open))await page.locator('[data-filari-section="curve"] summary').click();}};
  const mapCoordinate=async id=>{
   await page.waitForFunction(()=>!__map.isMoving());
   await page.locator('.maplibregl-canvas').first().scrollIntoViewIfNeeded();
   return page.evaluate(async id=>{
    const {portionAtCoordinate}=await import('/src/row-portions.js?v=1.2.6');
    const portion=__map.getSource('row-portions')._data.features.find(f=>f.properties.portionId===id);
    const geometry=portion.geometry.coordinates,p={id,geometry};
    const candidates=[],outer=geometry[0],xs=outer.map(c=>c[0]),ys=outer.map(c=>c[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    for(let y=1;y<20;y++)for(let x=1;x<20;x++)candidates.push([minX+(maxX-minX)*x/20,minY+(maxY-minY)*y/20]);
    const rect=__map.getCanvas().getBoundingClientRect();
    for(const coordinate of candidates){if(!portionAtCoordinate([p],coordinate))continue;const point=__map.project(coordinate),x=rect.left+point.x,y=rect.top+point.y;
     if(x<rect.left+20||x>rect.right-20||y<rect.top+80||y>rect.bottom-70||y<0||y>innerHeight)continue;
     if(document.elementFromPoint(x,y)?.classList.contains('maplibregl-canvas'))return{x,y,coordinate};
    }throw new Error('No visible interior map coordinate for '+id);
   },id);
  };
  const switchField=async id=>{if(mobile){await page.locator('#mobile-app [data-view="fields"]').click();await page.locator('.mobile-field-card[data-field-id="'+id+'"]').click();}else await page.locator('#field-select').selectOption(id);};
  const saveMobile=async()=>{await page.locator('#mobile-save-field').click();await page.waitForFunction(()=>document.body.dataset.mobileScreen==='detail');};
  const tapMap=async id=>{await closeSheet();const point=await mapCoordinate(id);if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);};
  console.log(name+' loading');await page.goto(base+'/');console.log(name+' loaded');await ready();console.log(name+' ready');
  if(process.env.COUNTS_VERIFY_ENGINE_OVERRIDE==='1'){
   assert.equal(await page.evaluate(()=>globalThis.__rowCurvesOverrideProof),true,'requested engine override module executed');
   reports.push({name,passed:true,engineOverrideUsed:true});await context.close();continue;
  }
  const before=await snapshot();check(before);assert.equal(before.portions.length,2);
  assert.equal(await buttons().count(),2,'the full app renders two native portion buttons');
  const [a,b]=before.portions;
  if(mobile){
   await tapMap(b.id);assert.equal((await snapshot()).screen,'detail','home map tap still opens the field card');
   assert.equal((await snapshot()).project.rowPortions.length,0,'home navigation does not materialize portion layout');
   await page.locator('#mobile-edit-map').click();await openOrientation();
  }
  console.log(name+' select B');await pick(b.id);const selected=await snapshot();check(selected);assert.equal(selected.activeId,b.id);
  assert.deepEqual(selected.rows,before.rows,'selection alone preserves inherited drawing');
  assert.equal(selected.project.orientationDeg,86.5);assert.deepEqual(selected.project.rowCurvePoints,fixture.rowCurvePoints);
  assert.equal(selected.features.filter(f=>f.properties.active).length,1);assert.equal(selected.features.find(f=>f.properties.active).properties.portionId,b.id);
  if(mobile){await buttons().last().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'mobile-portions-picker.png'),fullPage:true});}
  const pickerColors=await buttons().evaluateAll(nodes=>nodes.map(node=>({active:node.getAttribute('aria-pressed')==='true',background:getComputedStyle(node).backgroundColor})));
  assert.notEqual(pickerColors.find(c=>c.active).background,pickerColors.find(c=>!c.active).background,'selected portion has a distinct visible button color');
  const aRows=selected.rows.filter(r=>r.portionId===a.id),aSaved=selected.project.rowPortions.find(p=>p.id===a.id);
  const isolated=s=>{check(s);assert.deepEqual(s.rows.filter(r=>r.portionId===a.id),aRows,'A rows remain byte-identical');assert.deepEqual(s.project.rowPortions.find(p=>p.id===a.id),aSaved,'A saved design remains byte-identical');assert.equal(s.project.orientationDeg,86.5);assert.deepEqual(s.project.rowCurvePoints,fixture.rowCurvePoints);};
  console.log(name+' map taps');await tapMap(a.id);assert.equal((await snapshot()).activeId,a.id);await tapMap(b.id);assert.equal((await snapshot()).activeId,b.id);
  // Direct Reset must work even while inherited handles are intentionally hidden.
  console.log(name+' reset inherited');await openCurves();assert.equal(await page.locator('#curve-reset-button').isEnabled(),true);await page.locator('#curve-reset-button').click();
  const resetInherited=await snapshot();isolated(resetInherited);assert.equal(resetInherited.project.rowPortions.find(p=>p.id===b.id).mode,'local');assert.deepEqual(resetInherited.project.rowPortions.find(p=>p.id===b.id).rowCurvePoints,[]);
  if(mobile){await closeSheet();await openOrientation();}
  await page.locator('#orientation-output').fill('20,0');await page.locator('#orientation-output').dispatchEvent('change');
  const angled=await snapshot();isolated(angled);assert.equal(angled.project.rowPortions.find(p=>p.id===b.id).orientationDeg,20);
  await openCurves();await page.locator('#curve-add-button').click();
  const curved=await snapshot();isolated(curved);const localB=curved.project.rowPortions.find(p=>p.id===b.id);assert.equal(localB.rowCurvePoints.length,1);
  assert.equal(await page.locator('.curve-control-marker').count(),1);
  const inside=await page.evaluate(async p=>{const {portionAtCoordinate}=await import('/src/row-portions.js?v=1.2.6');const {curvePointToLonLat}=await import('/src/row-curves.js?v=1.2.6');return portionAtCoordinate([p],curvePointToLonLat({polygon:p.geometry[0],orientationDeg:p.orientationDeg,point:p.rowCurvePoints[0]}))?.id;},localB);
  assert.equal(inside,b.id,'actual first map handle is inside selected component');
  await page.locator('.curve-point-card input[type="range"]').nth(1).evaluate(node=>{node.value='12';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});
  const offset=await snapshot();isolated(offset);assert.equal(offset.project.rowPortions.find(p=>p.id===b.id).rowCurvePoints[0].offsetM,12);
  await page.screenshot({path:resolve(output,name+'-portions-curve.png'),fullPage:true});
  await page.locator('#curve-reset-button').click();const reset=await snapshot();isolated(reset);assert.deepEqual(reset.project.rowPortions.find(p=>p.id===b.id).rowCurvePoints,[]);
  await page.locator('#curve-add-button').click();const saved=await snapshot();isolated(saved);
  // Save is the real owner-scoped draft used by reload, not a test-only state store.
  console.log(name+' reload');await page.reload();await ready();const restored=await snapshot();check(restored);assert.deepEqual(restored.project.rowPortions,saved.project.rowPortions);assert.deepEqual(restored.rows,saved.rows);
  if(mobile){if(restored.screen!=='editor'){if(restored.screen==='map'){await tapMap(b.id);}await page.locator('#mobile-edit-map').click();}await closeSheet();await page.locator('#mobile-editor-next').click();await saveMobile();}
  await switchField('plain-field');
  const plain=await snapshot();assert.equal(plain.project.activeFieldId,'plain-field');assert.equal(await page.locator('#row-portion-picker').isVisible(),false);assert.equal(plain.activeId,undefined);assert.equal(plain.features.length,0);assert.equal(plain.project.orientationDeg,45);assert.equal(plain.project.rowCurvePoints[0].id,'plain-curve');
  if(mobile){await page.locator('#mobile-edit-map').click();await openOrientation();}
  await page.locator('#orientation-output').fill('60,0');await page.locator('#orientation-output').dispatchEvent('change');
  await openCurves();await page.locator('.curve-point-card input[type="range"]').nth(1).evaluate(node=>{node.value='6';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});
  const plainEdited=await snapshot();check(plainEdited);assert.equal(plainEdited.project.orientationDeg,60);assert.equal(plainEdited.project.rowCurvePoints[0].offsetM,6);assert.equal(plainEdited.project.rowPortions.length,0,'unsplit controls retain the legacy global design path');
  if(mobile){await closeSheet();await page.locator('#mobile-editor-next').click();await saveMobile();}
  await switchField('l-field');const returned=await snapshot();assert.deepEqual(returned.rows,saved.rows);assert.deepEqual(returned.project.rowPortions,saved.project.rowPortions);assert.equal(returned.activeId,a.id,'field switch reconciles transient selection to first current portion');
  if(mobile)await page.locator('#mobile-edit-map').click();
  // The first direction edit of still-inherited A must leave the saved local B untouched.
  await openOrientation();await pick(a.id);await page.locator('#orientation-output').fill('40,0');await page.locator('#orientation-output').dispatchEvent('change');
  const firstDirection=await snapshot();check(firstDirection);assert.equal(firstDirection.project.rowPortions.find(p=>p.id===a.id).mode,'local');assert.deepEqual(firstDirection.project.rowPortions.find(p=>p.id===a.id).rowCurvePoints,[]);assert.deepEqual(firstDirection.rows.filter(r=>r.portionId===b.id),returned.rows.filter(r=>r.portionId===b.id));assert.deepEqual(firstDirection.project.rowPortions.find(p=>p.id===b.id),returned.project.rowPortions.find(p=>p.id===b.id));assert.equal(firstDirection.project.orientationDeg,86.5);assert.deepEqual(firstDirection.project.rowCurvePoints,fixture.rowCurvePoints);
  // Real perimeter and vertex tools retain their tap handlers and cannot select B.
  await closeSheet();await tapMap(a.id);const pointB=await mapCoordinate(b.id);
  const startTool=async(type)=>{
   if(mobile){await page.locator('[data-sheet="'+(type==='line'?'cuts':'perimeter')+'"]').click();await page.locator(type==='line'?'#exclude-line-button':'#edit-vertices-button').click();}
   else await page.locator(type==='line'?'#exclude-line-button':'#edit-vertices-button').click();
  };
  console.log(name+' vertex guard');await startTool('vertices');if(mobile)await page.touchscreen.tap(pointB.x,pointB.y);else await page.mouse.click(pointB.x,pointB.y);
  assert.equal((await snapshot()).activeId,a.id,'vertex editing does not intercept portion selection');
  // Stop via the actual edit action before drawing a synthetic passage on plain field.
  if(mobile){await page.locator('#mobile-finish-edit').click();await page.locator('#mobile-editor-next').click();await saveMobile();}
  else await page.locator('#edit-vertices-button').click();
  await switchField('plain-field');if(mobile)await page.locator('#mobile-edit-map').click();
  console.log(name+' road drawing');await startTool('line');await page.waitForFunction(()=>!__map.isMoving());
  const actualClick=async coordinate=>{const point=await page.evaluate(coordinate=>{const p=__map.project(coordinate),r=__map.getCanvas().getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},coordinate);if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);};
  await actualClick([.00095,45.00025]);await actualClick([.00155,45.00025]);
  if(mobile)await page.locator('#close-perimeter-button').click();
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.project.exclusions.length>0,draftKey,{timeout:10000});
  const drawn=await snapshot();check(drawn);assert.equal(drawn.project.exclusions[0].type,'linear');assert.equal(drawn.project.exclusions[0].widthM,1.5);assert.equal(drawn.portions.length,2,'real drawn and clipped road splits the plain field');
  await page.screenshot({path:resolve(output,name+'-drawn-road.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  reports.push({name,passed:true,externalRequestsAllowed:0,blockedRequests,beforePieces:before.rows.length,afterPieces:saved.rows.length,portionIds:[a.id,b.id],roadWidthM:drawn.project.exclusions[0].widthM});
  await context.close();
 }
 await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify({passed:true,reports},null,2));
}catch(error){console.error(error);throw error;}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
