// Real MapLibre/Draw regression for four independent visual overlay preferences.
// All CDN, auth and raster responses are local fixtures; other external requests
// are blocked. No cloud, delivery, profile or terrain action is exercised.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.env.MAP_VISIBILITY_BROWSER_ROOT??process.cwd());
const [{createInitialState},{ensureProjectFields}]=await Promise.all([
 import(pathToFileURL(resolve(root,'src/state.js')).href),
 import(pathToFileURL(resolve(root,'src/fields.js')).href)
]);
const output=resolve(process.env.MAP_VISIBILITY_BROWSER_OUTPUT??'/workspace/scratch/4dd3fdf3ed89/field-names-v138-verification/browser');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??resolve(root,'.superpowers/sdd/2026-10-05-contour-rows-and-cut-suggestions/task-qa-runtime-oct7/assets');
const [maplibre,draw,maplibreCss,drawCss]=await Promise.all([
 readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8'),
 readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8'),
 readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8'),
 readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8')
]);
const servedHashes=new Map();
const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN48ubBfwAJGAOwBa2qBwAAAABJRU5ErkJggg==','base64');
const referenceTile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
const server=createServer(async(req,res)=>{try{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname.endsWith('/'))pathname+='index.html';
 const path=resolve(root,'.'+pathname);
 if(!path.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
 const bytes=await readFile(path);
 servedHashes.set(pathname,createHash('sha256').update(bytes).digest('hex'));
 res.end(bytes);
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
  onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,
  rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
const state=createInitialState();
const plainGeometry=[[.001,45],[.0015,45],[.0015,45.0005],[.001,45.0005],[.001,45]];
state.project=ensureProjectFields({...state.project,localProjectId:'fixture-portions',localProjectName:'Nomi indipendenti',activeFieldId:'l-field',fields:[
 {...state.project.fields[0],...fixture,id:'l-field',geometry:fixture.polygon,orientationLocked:true,headlandWidthM:4,label:'Campo a L',rowPortions:[]},
 {...state.project.fields[0],id:'plain-field',geometry:plainGeometry,orientationDeg:45,orientationLocked:true,label:'Campo intero',rowCurvePoints:[{id:'plain-curve',position:.5,offsetM:2}],rowPortions:[]}
]});
const owner='00000000-0000-4000-8000-000000000138',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const labels={field:'Campo',schema:'Schema vigneto',quotes:'Quote',names:'Nomi dei campi'};
const defaults={field:true,schema:true,quotes:true,names:true};
const views=[
 {name:'desktop-1440',viewport:{width:1440,height:1000},mobile:false},
 {name:'mobile-390',viewport:{width:390,height:844},mobile:true},
 {name:'mobile-320',viewport:{width:320,height:568},mobile:true},
 {name:'mobile-landscape',viewport:{width:844,height:390},mobile:true}
];
const reports=[];
let browser;
try{
 let executablePath=process.env.MAP_VISIBILITY_CHROMIUM_PATH??process.env.COUNTS_CHROMIUM_PATH;
 if(!executablePath){try{await access('/usr/bin/chromium');executablePath='/usr/bin/chromium';}catch{}}
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 const selectedViews=process.env.MAP_VISIBILITY_BROWSER_VIEW?.split(',');
 for(const {name,viewport,mobile} of views.filter(view=>!selectedViews||selectedViews.includes(view.name))){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],consoleErrors=[],layouts=[],actions=[];
  let blockedRequests=0,localTileRequests=0,visualSwitches=0;
  page.setDefaultTimeout(20000);
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
   map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:[0,44.9993],zoom:17,bearing:0}},
   navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({draftKey,state,workspace,owner})=>{
   window.__fixture={user:{id:owner,is_anonymous:false,email:'test@example.test',app_metadata:{}}};
   localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,state,workspace,owner});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin===base)return route.continue();
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if((url.hostname==='server.arcgisonline.com'&&url.pathname.includes('/MapServer/tile/'))||url.hostname==='tile.openstreetmap.org'){
    localTileRequests++;return route.fulfill({contentType:'image/png',body:url.pathname.includes('/Reference/')?referenceTile:tile});
   }
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
   blockedRequests++;return route.abort();
  });
  const eye='[data-map-visibility-trigger]',input=key=>'[data-map-visibility="'+key+'"]';
  const settled=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const bounds=locator=>locator.evaluate(node=>{
   const box=node.getBoundingClientRect(),clip={left:0,top:0,right:innerWidth,bottom:innerHeight},ancestors=[];
   for(let parent=node.parentElement;parent;parent=parent.parentElement){
    const style=getComputedStyle(parent),r=parent.getBoundingClientRect();
    if(/hidden|auto|scroll|clip/.test(style.overflowX)){clip.left=Math.max(clip.left,r.left+parent.clientLeft);clip.right=Math.min(clip.right,r.left+parent.clientLeft+parent.clientWidth);}
    if(/hidden|auto|scroll|clip/.test(style.overflowY)){clip.top=Math.max(clip.top,r.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,r.top+parent.clientTop+parent.clientHeight);}
    if(/hidden|auto|scroll|clip/.test(style.overflowX+' '+style.overflowY))ancestors.push({selector:parent.id?'#'+parent.id:parent.className,overflowX:style.overflowX,overflowY:style.overflowY,left:r.left,top:r.top,right:r.right,bottom:r.bottom});
   }
   const x=(Math.max(box.left,clip.left)+Math.min(box.right,clip.right))/2,y=(Math.max(box.top,clip.top)+Math.min(box.bottom,clip.bottom))/2;
   const covered=document.elementFromPoint(x,y);
   return {left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height,clip,ancestors,x,y,
    visible:node.checkVisibility({checkVisibilityCSS:true}),enabled:!node.disabled,hit:node.contains(covered),
    coveredBy:covered?.id||covered?.className||covered?.tagName,
    fullyVisible:box.left>=clip.left-1&&box.top>=clip.top-1&&box.right<=clip.right+1&&box.bottom<=clip.bottom+1};
  });
  const click=async(selector,{row=false}={})=>{
   const locator=page.locator(selector).first(),target=row?locator.locator('..'):locator;
   await target.scrollIntoViewIfNeeded();await settled();
   const point=await bounds(target);
   assert.ok(point.visible&&point.enabled&&point.hit&&point.fullyVisible,'native target is visible, enabled, unclipped and receives hit testing: '+selector+'; '+JSON.stringify(point));
   if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
   actions.push({target:selector,method:mobile?'native touchscreen':'native mouse',row,point});await settled();
  };
  const open=async()=>{if(await page.locator(eye).getAttribute('aria-expanded')!=='true')await click(eye);};
  const close=async()=>{if(await page.locator(eye).getAttribute('aria-expanded')==='true')await click(eye);};
  const snapshot=()=>page.evaluate(async key=>{
   const project=JSON.parse(localStorage.getItem(key)).state.project;
   const {calculateProject}=await import('/src/project-calculator.js');
   const result=calculateProject({...project,polygon:project.geometry});
   const sourceIds=['project-geometry','other-project-fields','excluded-zones','vineyard-rows','other-project-rows','row-portions'];
   return {project,rows:result.rows,plants:result.commercialPlants25,headPosts:result.headPosts,
    sources:Object.fromEntries(sourceIds.map(id=>[id,__map.getSource(id)._data]))};
  },draftKey);
  const checkVisibility=async expected=>{
   const actual=await page.evaluate(()=>{
    const fieldIds=['project-geometry-fill','project-geometry-line','other-project-fields-fill','other-project-fields-line','excluded-zones-fill','excluded-zones-line','row-portions-fill','row-portions-outline'];
    const schemaIds=['vineyard-rows-line','other-project-rows-line'];
    const visible=id=>(__map.getLayoutProperty(id,'visibility')??'visible')==='visible';
    const overlay=document.querySelector('.map-field-label-overlay');
    const names=[...document.querySelectorAll('.field-label-marker')];
    return {field:fieldIds.map(visible),schema:schemaIds.map(visible),quotes:[...document.querySelectorAll('.side-measurement-label')].map(node=>getComputedStyle(node).display!=='none'),
     names:getComputedStyle(overlay).display!=='none',nameTexts:names.map(node=>node.textContent).sort(),nameHits:names.map(node=>node.checkVisibility({checkVisibilityCSS:true})),
     sourcePlants:__map.getSource('vineyard-rows')._data.features.length,
     checks:Object.fromEntries([...document.querySelectorAll('[data-map-visibility]')].map(node=>[node.dataset.mapVisibility,node.checked])),
     attributes:Object.fromEntries(['field','schema','quotes','names'].map(key=>[key,__map.getContainer().getAttribute('data-map-'+key+'-visible')]))};
   });
   assert.ok(actual.field.every(value=>value===expected.field),'field layers match their checkbox');
   assert.ok(actual.schema.every(value=>value===expected.schema),'schema layers match their checkbox');
   assert.ok(actual.quotes.length>0,'field measurements exist');
   assert.ok(actual.quotes.every(value=>value===expected.quotes),'measurement labels match their checkbox');
   assert.equal(actual.names,expected.names,'name overlay follows Nomi dei campi independently');
   assert.deepEqual(actual.nameTexts,['Campo a L','Campo intero'],'both active and other field names stay in the DOM');
   if(expected.names)assert.ok(actual.nameHits.some(Boolean),'at least the visible field name is rendered');
   else assert.ok(actual.nameHits.every(value=>!value),'hidden names are effectively invisible');
   assert.deepEqual(actual.checks,expected,'all four native checkbox states are independent');
   assert.deepEqual(actual.attributes,Object.fromEntries(Object.entries(expected).map(([key,value])=>[key,String(value)])));
   assert.ok(actual.sourcePlants>0,'hidden row data remains available');
   return actual;
  };
  const capture=async stage=>{
   await open();await settled();
   const panel=await bounds(page.locator('.map-visibility-panel'));
   const controls=[];
   for(const key of Object.keys(labels))controls.push({key,label:labels[key],...await bounds(page.locator(input(key)).locator('..'))});
   controls.push({key:'restore',label:'Mostra tutto',...await bounds(page.locator('[data-map-visibility-restore]'))});
   const data={stage,screen:await page.evaluate(()=>document.body.dataset.mobileScreen??'desktop'),viewport,panel,controls};
   layouts.push(data);
   await writeFile(resolve(output,name+'-layout.json'),JSON.stringify(layouts,null,2));
   await page.screenshot({path:resolve(output,name+'-'+stage+'.png')});
   assert.ok(panel.fullyVisible,stage+': expanded four-item popup is clipped: '+JSON.stringify(panel));
   assert.ok(controls.every(control=>control.fullyVisible&&control.hit),stage+': popup rows and Mostra tutto are fully visible and receive hit testing: '+JSON.stringify(controls));
   if(mobile)assert.ok(controls.filter(control=>control.key!=='restore').every(control=>control.height>=44),stage+': every native checkbox label has a 44px touch target');
  };
  let expected={...defaults};
  const toggle=async(key,{row=false}={})=>{
   const before=await snapshot();
   await click(input(key),{row});expected={...expected,[key]:!expected[key]};
   await checkVisibility(expected);
   assert.deepEqual(await snapshot(),before,key+' toggle preserves project, calculations and all GeoJSON source data');
   visualSwitches++;
  };
  try{
   await page.goto(base+'/');
   await page.waitForFunction(key=>window.__map?.getSource('row-portions')&&document.querySelector('#profile-trigger')?.textContent!=='Profilo'&&JSON.parse(localStorage.getItem(key))?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate'),draftKey,{timeout:20000});
   await page.waitForFunction(()=>!__map.isMoving());await settled();
   await page.evaluate(()=>__map.fitBounds([[-.000557,44.99843],[.0015,45.0005]],{padding:45,duration:0}));await settled();
   const before=await snapshot();
   await open();
   assert.deepEqual(await page.locator('[data-map-visibility]').evaluateAll(nodes=>nodes.map(node=>({key:node.dataset.mapVisibility,type:node.type,label:node.closest('label').textContent.trim()}))),Object.entries(labels).map(([key,label])=>({key,type:'checkbox',label})));
   await checkVisibility(expected);await capture('main-default');
   await toggle('names'); // Names off leaves field, rows and measurements on.
   await toggle('field');
   await toggle('names',{row:true}); // Names can be on while Campo is off.
   await toggle('schema');await toggle('quotes');
   await toggle('names',{row:true});await capture('main-all-hidden');
   await toggle('field'); // Reenabling Campo must leave names off.
   await page.evaluate(()=>{__map.resize();__map.fire('move');__map.fire('idle');__map.fire('styledata');});
   await checkVisibility(expected);
   // Reselecting the same field uses the app's render pipeline and recreates
   // the HTML name nodes without changing its project or source data.
   await page.evaluate(()=>{window.__beforeRebuild=[...document.querySelectorAll('.field-label-marker')];const select=document.querySelector('#map-field-select');select.value='l-field';select.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>window.__beforeRebuild.every(node=>!node.isConnected)&&document.querySelectorAll('.field-label-marker').length===2);
   await page.waitForFunction(()=>!__map.isMoving());await checkVisibility(expected);
   assert.deepEqual(await snapshot(),before,'resize, style refresh and label rebuild preserve the complete project and source data');
   await capture('main-names-hidden-rebuilt');
   if(mobile){
    await close();await click('#mobile-app [data-view="fields"]');
    await click('.mobile-field-card[data-field-id="l-field"]');
    await page.waitForFunction(()=>document.body.dataset.mobileScreen==='detail'&&!__map.isMoving());
    assert.ok(await page.locator('#mobile-detail-map '+eye).isVisible(),'Campi detail has a visible eye');
    await open();await checkVisibility(expected);await capture('fields-detail-names-hidden');
    await toggle('names',{row:true});await toggle('names');
    await close();await click('#mobile-edit-map');
    await page.waitForFunction(()=>document.body.dataset.mobileScreen==='editor'&&!__map.isMoving());
    await open();await checkVisibility(expected);await capture('editor-names-hidden');
    await toggle('names',{row:true});await toggle('names');
    await close();await click('[data-sheet="perimeter"]');await click('#edit-vertices-button');
   }else{await close();await click('#edit-vertices-button');}
   await page.waitForFunction(()=>document.querySelectorAll('.vertex-edit-handle').length>0);
   const editBefore=await snapshot(),handlesBefore=await page.locator('.vertex-edit-handle').count();
   await open();await toggle('field');
   assert.equal(await page.locator('.vertex-edit-handle').count(),handlesBefore,'visibility switch keeps active vertex editing');
   assert.equal(await page.locator('.vertex-edit-handle').first().isVisible(),true,'hiding Campo leaves edit handles visible');
   await toggle('names',{row:true});await toggle('names');
   await page.locator(input('names')).focus();await page.keyboard.press('Escape');
   assert.equal(await page.locator(eye).getAttribute('aria-expanded'),'false','Escape closes the popup');
   assert.equal(await page.locator('.vertex-edit-handle').count(),handlesBefore,'popup Escape preserves active edit');
   await open();const restoreBefore=await snapshot();await click('[data-map-visibility-restore]');expected={...defaults};await checkVisibility(expected);
   assert.deepEqual(await snapshot(),restoreBefore,'Mostra tutto restores names without changing project, calculations or source data');
   assert.deepEqual(await snapshot(),editBefore,'all visibility changes during vertex editing preserve model and source data');
   assert.equal(await page.locator('.vertex-edit-handle').count(),handlesBefore,'Mostra tutto preserves editing handles');
   await capture('restored-active-edit');
   assert.deepEqual(errors,[],'no browser runtime errors');
   reports.push({name,passed:true,viewport,visualSwitches,blockedRequests,localTileRequests,externalRequestsAllowed:0,
    overlays:Object.values(labels),labelRebuild:true,editingHandles:handlesBefore,layouts,actions});
   console.log(name+': four independent overlays, rebuilt names, native hit targets and active editing passed');
  }catch(error){
   await writeFile(resolve(output,name+'-failure.json'),JSON.stringify({message:error.message,stack:error.stack,errors,consoleErrors,layouts,actions,
    state:await page.evaluate(()=>({map:!!window.__map,loaded:window.__map?.loaded(),initialLoad:window.__map?.__initialLoad,screen:document.body.dataset.mobileScreen,profile:document.querySelector('#profile-trigger')?.textContent}))},null,2));
   await page.screenshot({path:resolve(output,name+'-failure.png')});throw error;
  }finally{await context.close();}
 }
 const summary={passed:true,root,assets,executablePath:executablePath??chromium.executablePath(),reports,servedHashes:Object.fromEntries(servedHashes)};
 await writeFile(resolve(output,'summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({passed:true,reports:reports.map(({layouts,actions,...report})=>({...report,layoutChecks:layouts.length,nativeActions:actions.length}))},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
