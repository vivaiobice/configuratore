// Audit mobile v1.3.7 with the shipped configurator and real MapLibre/Draw.
// Only external libraries/auth data are fixtures. No remote mutation is allowed.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';


const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.env.MOBILE_V137_BROWSER_ROOT??fileURLToPath(new URL('../',import.meta.url)));
const [{createInitialState},{ensureProjectFields}]=await Promise.all([
 import(pathToFileURL(resolve(root,'src/state.js')).href),
 import(pathToFileURL(resolve(root,'src/fields.js')).href)
]);
const output=resolve(process.env.MOBILE_V137_BROWSER_OUTPUT??'/tmp/mobile-v137-browser');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??resolve(root,'.superpowers/sdd/2026-10-05-contour-rows-and-cut-suggestions/task-qa-runtime-oct7/assets');
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');
const moduleHashes=new Map(),servedHashes=new Map();
// Deterministic local raster fixtures keep MapLibre's load lifecycle independent
// of aborted internet tile requests. Satellite imagery itself is outside this UI audit.
const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN48ubBfwAJGAOwBa2qBwAAAABJRU5ErkJggg==','base64');
const referenceTile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');servedHashes.set(pathname,hash);if(pathname.endsWith('.js'))moduleHashes.set(pathname,hash);res.end(bytes);
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const exposeMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
  constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}};`;
const sdk=`export function createClient(){
  const user=window.__fixture.user,session={user,access_token:'fixture'};
  const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
    if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{
      user_id:user.id,owner_kind:'user',display_name:'Marco Obice',username:'marco_obice_profilo_aziendale',first_name:'Marco',last_name:'Obice',company_name:'Vivai Obice Società Semplice Agricola',address:'Via Fontanette 1',city:'Santo Stefano Belbo',province:'CN',postal_code:'12058',vat_number:'01234567890',
      phone:'123',email:'test@example.test',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);
    return (...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
  }});return query;};
  return {auth:{async getSession(){if(!location.pathname.startsWith('/conteggi')&&!window.__map?.__initialLoad&&!window.__map?.loaded())await new Promise(done=>window.__map.once('load',done));return {data:{session},error:null};},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,
    functions:{async invoke(name,{body}){if(name!=='counts-api')throw new Error('Only non-delivery Counts fixture is enabled');return {data:body.action==='pull'?{lists:[],counts:[],submissions:[],nextCursor:null}:body.action==='mutate'?{value:{...body.input.value,revision:body.input.expectedRevision+1,syncState:'synced'}}:{accepted:true},error:null};}},
    rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
const state=createInitialState();
const plainGeometry=[[.001,45],[.0015,45],[.0015,45.0005],[.001,45.0005],[.001,45]];
state.project=ensureProjectFields({...state.project,localProjectId:'fixture-portions',localProjectName:'Porzioni indipendenti',activeFieldId:'l-field',fields:[
 {...state.project.fields[0],...fixture,id:'l-field',geometry:fixture.polygon,orientationLocked:true,headlandWidthM:4,label:'Chardonnay B. · 775 Paulsen · Cascina Elena',rowPortions:[]},
 {...state.project.fields[0],id:'plain-field',geometry:plainGeometry,orientationDeg:45,orientationLocked:true,label:'Campo intero',rowCurvePoints:[{id:'plain-curve',position:.5,offsetM:2}],rowPortions:[]}
]});
const owner='00000000-0000-4000-8000-000000000125',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const reports=[],diagnostic=process.env.MOBILE_V137_BROWSER_DIAGNOSTIC==='1',numericEnabled=process.env.MOBILE_V137_BROWSER_NUMERIC!=='0';
const views=[['small',{width:320,height:568}],['small-tall',{width:320,height:667}],['medium',{width:360,height:740}],['phone',{width:390,height:844}],['wide-phone',{width:430,height:932}],['landscape',{width:844,height:390}]];
let browser;
async function metrics(page,stage){return page.evaluate(stage=>{
 const visible=node=>{
  const r=node.getBoundingClientRect();if(!node.checkVisibility({checkVisibilityCSS:true,opacityProperty:true})||node.closest('[hidden],[aria-hidden="true"]')||r.width<=0||r.height<=0)return false;
  for(let ancestor=node;ancestor;ancestor=ancestor.parentElement)if(Number(getComputedStyle(ancestor).opacity)===0)return false;
  // On list/form pages the map is a visual backdrop, not an active control surface.
  return !node.closest('#mobile-map-host,.mobile-home-bottom,.mobile-home-tools,.mobile-brand,#mobile-add-field')||['map','editor'].includes(document.body.dataset.mobileScreen);
 };
 const describe=node=>{
  const r=node.getBoundingClientRect(),s=getComputedStyle(node),label=node.getAttribute('aria-label')||node.textContent?.trim()||node.name||node.id,clipped={left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)};
  for(let parent=node.parentElement;parent;parent=parent.parentElement){const css=getComputedStyle(parent),box=parent.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(css.overflowX)){clipped.left=Math.max(clipped.left,box.left+parent.clientLeft);clipped.right=Math.min(clipped.right,box.left+parent.clientLeft+parent.clientWidth);}if(/hidden|auto|scroll|clip/.test(css.overflowY)){clipped.top=Math.max(clipped.top,box.top+parent.clientTop);clipped.bottom=Math.min(clipped.bottom,box.top+parent.clientTop+parent.clientHeight);}}
  if(!document.body.classList.contains('mobile-app-active')&&node.closest('.panel-scroll')&&!node.closest('.map-summary')){const footer=document.querySelector('.map-summary'),css=footer&&getComputedStyle(footer);if(css?.position==='sticky')clipped.bottom=Math.min(clipped.bottom,footer.getBoundingClientRect().top);}
  const hit=clipped.right>clipped.left&&clipped.bottom>clipped.top&&node.contains(document.elementFromPoint((clipped.left+clipped.right)/2,(clipped.top+clipped.bottom)/2));
  return{selector:node.id?'#'+node.id:node.className,label:String(label).slice(0,90),left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,font:parseFloat(s.fontSize),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,hit,clipped};
 };
 const desktop=!document.body.classList.contains('mobile-app-active'),selector=desktop?'.panel button,.panel input,.panel select,.panel textarea,.panel summary,.topbar button':'#mobile-app button,#mobile-app input,#mobile-app select,#mobile-app textarea,#mobile-app summary';
 const nodes=[...document.querySelectorAll(selector)].filter(visible),controls=nodes.map(describe),controlConflicts=[];
 for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
  const a=controls[i],b=controls[j],na=nodes[i],nb=nodes[j];if(na.contains(nb)||nb.contains(na))continue;
  // A popover/nav and the scroll content underneath are separate UI surfaces.
  const surface=node=>node.closest('#tool-selector,.mobile-sheet,.mobile-choice-dialog,.mobile-navigation');if(surface(na)!==surface(nb))continue;
  // Existing edit shortcuts intentionally overlay their clickable card.
  const entry=node=>node.closest('.mobile-field-card-row,.mobile-project-titlebar');if(entry(na)&&entry(na)===entry(nb)&&(na.matches('.mobile-card-edit')||nb.matches('.mobile-card-edit')))continue;
  const width=Math.min(a.clipped.right,b.clipped.right)-Math.max(a.clipped.left,b.clipped.left),height=Math.min(a.clipped.bottom,b.clipped.bottom)-Math.max(a.clipped.top,b.clipped.top);if(width>1&&height>1)controlConflicts.push({a:a.label,b:b.label,width,height});
 }
 const pages=document.querySelector('#mobile-pages'),titleNodes=[...document.querySelectorAll('.mobile-brand-tool-trigger,.mobile-editor-tool-trigger,#mobile-editor-title,.mobile-page-heading,#mobile-detail-title,#mobile-active-field,#tool-selector')].filter(visible),titles=titleNodes.map(describe);
 const conflicts=[];for(let i=0;i<titles.length;i++)for(let j=i+1;j<titles.length;j++){
  const a=titles[i],b=titles[j],na=titleNodes[i],nb=titleNodes[j];if(na.contains(nb)||nb.contains(na))continue;
  // Tool popovers intentionally cover the map, including the field chip below.
  const surface=node=>node.closest('#tool-selector,.mobile-sheet,.mobile-choice-dialog');if(surface(na)!==surface(nb))continue;
  const width=Math.min(a.clipped.right,b.clipped.right)-Math.max(a.clipped.left,b.clipped.left),height=Math.min(a.clipped.bottom,b.clipped.bottom)-Math.max(a.clipped.top,b.clipped.top);if(width>1&&height>1)conflicts.push({a:a.selector,b:b.selector,width,height});
 }
 const nav=document.querySelector('.mobile-navigation').getBoundingClientRect(),sheet=document.querySelector('.mobile-sheet');
 const mapExposed=(desktop||['map','editor'].includes(document.body.dataset.mobileScreen))&&!visible(sheet),mapNotices=mapExposed?[...document.querySelectorAll('.map-wrap .map-status,.maplibregl-ctrl-attrib,#mobile-add-field')].filter(node=>visible(node)&&node.textContent.trim()).map(describe):[],mapNoticeConflicts=[];
 for(const overlay of mapNotices.filter(node=>String(node.selector).includes('map-status')||node.selector==='#mobile-add-field'))for(const attribution of mapNotices.filter(node=>String(node.selector).includes('ctrl-attrib'))){const width=Math.min(overlay.clipped.right,attribution.clipped.right)-Math.max(overlay.clipped.left,attribution.clipped.left),height=Math.min(overlay.clipped.bottom,attribution.clipped.bottom)-Math.max(overlay.clipped.top,attribution.clipped.top);if(width>1&&height>1)mapNoticeConflicts.push({overlay:overlay.selector,attribution:attribution.selector,width,height});}
 const record=Object.keys(localStorage).filter(key=>key.startsWith('vivai-obice:configuratore:draft:live:')).map(key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}).find(value=>value?.workspace);
 return{stage,screen:document.body.dataset.mobileScreen,desktop,viewport:{width:innerWidth,height:innerHeight},runtime:{map:!!window.__map,sourcePortions:!!window.__map?.getSource('row-portions'),loaded:window.__map?.loaded(),initialLoad:window.__map?.__initialLoad,profile:document.querySelector('#profile-trigger')?.textContent,workspaceSavedAt:record?.workspace?.savedAt,restoreGate:!!document.querySelector('.workspace-restore-gate')},desktopCards:desktop?[...document.querySelectorAll('.advanced-card')].map(node=>({key:node.dataset.refinement,open:node.open,summary:describe(node.querySelector(':scope>summary'))})):null,documentWidth:document.documentElement.scrollWidth,pages:pages?{width:pages.clientWidth,scrollWidth:pages.scrollWidth,height:pages.clientHeight,scrollHeight:pages.scrollHeight,scrollTop:pages.scrollTop}:null,sheet:visible(sheet)?{width:sheet.clientWidth,scrollWidth:sheet.scrollWidth}:null,navTop:nav.top,controls,titles,conflicts,controlConflicts,mapExposed,mapNotices,mapNoticeConflicts,profileFields:[...document.querySelectorAll('.mobile-profile-details input')].filter(visible).map(describe)};
},stage);}
function assertLayout(data){
 assert.equal(data.documentWidth,data.viewport.width,data.stage+': no document horizontal overflow');
 if(data.pages?.width)assert.ok(data.pages.scrollWidth<=data.pages.width+1,data.stage+': no content horizontal overflow');
 if(data.sheet?.width)assert.ok(data.sheet.scrollWidth<=data.sheet.width+1,data.stage+': no sheet horizontal overflow');
 assert.deepEqual(data.conflicts,[],data.stage+': visible logo, heading and field name do not overlap');
 assert.deepEqual(data.controlConflicts,[],data.stage+': visible independent controls do not overlap');
 assert.deepEqual(data.mapNoticeConflicts,[],data.stage+': exposed map status/Add Campo and attribution do not overlap');
}
try{
 const executablePath=process.env.MAP_VISIBILITY_CHROMIUM_PATH??process.env.COUNTS_CHROMIUM_PATH;
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 const selectedViews=process.env.MOBILE_V137_BROWSER_VIEW?.split(',');
 for(const [name,viewport] of views.filter(([name])=>!selectedViews||selectedViews.includes(name))){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:[0,44.9993],zoom:17,bearing:0}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({draftKey,state,workspace,owner})=>{window.__fixture={user:{id:owner,is_anonymous:false,email:'qa@example.test',app_metadata:{}}};if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');},{draftKey,state,workspace,owner});
  let blockedRequests=0,localTileRequests=0;
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.hostname==='server.arcgisonline.com'&&url.pathname.includes('/MapServer/tile/')||url.hostname==='tile.openstreetmap.org'){localTileRequests++;return route.fulfill({contentType:'image/png',body:url.pathname.includes('/Reference/')?referenceTile:tile});}
   blockedRequests++;return route.abort();});
  const snapshots=[],actions=[],capture=async stage=>{await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));const data=await metrics(page,stage);data.capturedAt=new Date().toISOString();snapshots.push(data);await page.screenshot({path:resolve(output,name+'-'+stage+'.png')});if(!diagnostic&&stage!=='failure')assertLayout(data);return data;};
  const tap=async target=>{
   const started=performance.now();
   const node=typeof target==='string'?page.locator(target).first():target;await node.scrollIntoViewIfNeeded();
   const hitPoint=()=>node.evaluate(node=>{const r=node.getBoundingClientRect(),p={left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)};for(let ancestor=node.parentElement;ancestor;ancestor=ancestor.parentElement){const s=getComputedStyle(ancestor),b=ancestor.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(s.overflowX)){p.left=Math.max(p.left,b.left+ancestor.clientLeft);p.right=Math.min(p.right,b.left+ancestor.clientLeft+ancestor.clientWidth);}if(/hidden|auto|scroll|clip/.test(s.overflowY)){p.top=Math.max(p.top,b.top+ancestor.clientTop);p.bottom=Math.min(p.bottom,b.top+ancestor.clientTop+ancestor.clientHeight);}}const x=(p.left+p.right)/2,y=(p.top+p.bottom)/2,cover=document.elementFromPoint(x,y),scroller=node.closest('.panel-scroll'),footer=document.querySelector('.map-summary'),desktop=!document.body.classList.contains('mobile-app-active');const nativeScroll=desktop&&scroller&&!node.closest('.map-summary')&&cover?.closest('.map-summary')&&getComputedStyle(footer).position==='sticky'?{x:scroller.getBoundingClientRect().left+scroller.clientWidth/2,y:Math.min(footer.getBoundingClientRect().top-40,scroller.getBoundingClientRect().top+140),delta:Math.max(220,r.top-scroller.getBoundingClientRect().top-100)}:null;return{x,y,visible:node.checkVisibility({checkVisibilityCSS:true}),enabled:!node.disabled,hit:node.contains(cover),nativeScroll};});
   let point=await hitPoint();
   for(let attempt=0;!point.hit&&point.nativeScroll&&attempt<2;attempt++){
    const scroll=point.nativeScroll,scrollStarted=performance.now();await page.mouse.move(scroll.x,scroll.y);await page.mouse.wheel(0,scroll.delta);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));actions.push({method:'native wheel',target:'.panel-scroll',...scroll,durationMs:Math.round(performance.now()-scrollStarted)});point=await hitPoint();
   }
   assert.ok(point.visible&&point.enabled&&point.hit,'real touchscreen target is visible, enabled and receives hit testing');await page.touchscreen.tap(point.x,point.y);actions.push({method:'native touchscreen',target:String(target),point,durationMs:Math.round(performance.now()-started)});
  };
  const enter=async(selector,value)=>{await tap(selector);const started=performance.now();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(value);await page.keyboard.press('Tab');actions.push({method:'native keyboard',target:selector,text:value,durationMs:Math.round(performance.now()-started)});};
  const draft=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.project,draftKey);
  const drawing=()=>page.evaluate(()=>({rows:__map.getSource('vineyard-rows')._data,portions:__map.getSource('row-portions')._data.features.map(f=>({id:f.properties.portionId,active:f.properties.active}))}));
  const card=key=>page.locator('.advanced-card[data-refinement="'+key+'"]');
  const openAdvanced=async()=>{if(!await page.locator('.advanced').evaluate(node=>node.open))await tap('.advanced>summary');};
  const openCard=async key=>{await openAdvanced();if(!await card(key).evaluate(node=>node.open))await tap(card(key).locator(':scope>summary'));};
  const verifyCards=async stage=>{
   await openAdvanced();
   const originalOpen=await page.locator('.advanced-card').evaluateAll(nodes=>nodes.map(node=>node.open));
   const cards=await page.locator('.advanced-card').evaluateAll(nodes=>nodes.map(node=>({key:node.dataset.refinement,title:node.querySelector('.refinement-title')?.textContent,icon:!!node.querySelector(':scope>summary .refinement-icon'),native:node.tagName==='DETAILS',exclusive:node.hasAttribute('name')})));
   assert.deepEqual(cards.map(c=>c.key),['portions','curve','exclusions','plant','material','information','cadastre','soil']);
   assert.deepEqual(cards.map(c=>c.title),['Porzioni','Curvatura','Gestione aree escluse','Caratteristiche impianto','Materiale vegetale','Informazioni','Catasto','Suolo']);
   assert.ok(cards.every(c=>c.icon&&c.native&&!c.exclusive),'all eight cards have icon/text and independent native disclosure');
   if(stage==='parameters-refinement'||stage==='desktop-return'){
    for(const {key} of cards)if(await card(key).evaluate(node=>node.open))await tap(card(key).locator(':scope>summary'));
    await page.locator('.advanced').scrollIntoViewIfNeeded();await capture(stage+'-collapsed');
   }
   for(const key of ['portions','curve','exclusions'])await openCard(key);
   assert.equal(await card('portions').evaluate(node=>node.open),true);assert.equal(await card('curve').evaluate(node=>node.open),true);assert.equal(await card('exclusions').evaluate(node=>node.open),true);
   await tap(card('curve').locator(':scope>summary'));
   assert.equal(await card('curve').evaluate(node=>node.open),false);assert.equal(await card('portions').evaluate(node=>node.open),true);assert.equal(await card('exclusions').evaluate(node=>node.open),true);
   await openCard('curve');
   if(stage==='desktop-return'){
    await openCard('soil');assert.equal(await card('soil').evaluate(node=>node.open),true,'the last card is reachable with native wheel and hit testing');await tap(card('soil').locator(':scope>summary'));assert.equal(await card('soil').evaluate(node=>node.open),false);
    for(let i=0;i<cards.length;i++)if(await card(cards[i].key).evaluate(node=>node.open)!==originalOpen[i])await tap(card(cards[i].key).locator(':scope>summary'));
   }
   assert.equal(await page.locator('#row-portion-picker').count(),1,'portion control is reparented, never cloned');assert.equal(await page.locator('#curve-add-button').count(),1);
   await capture(stage);
  };
  const verifyPortions=async(stage='portions-none')=>{
   const originallyOpen=await card('portions').evaluate(node=>node.open);
   await openCard('portions');
   const portionButtons=page.locator('#row-portion-picker button[data-portion-id]:not([data-portion-clear])'),ids=await portionButtons.evaluateAll(nodes=>nodes.map(node=>node.dataset.portionId));assert.equal(ids.length,2);
   await tap(portionButtons.last());await page.waitForFunction(id=>__map.getSource('row-portions')._data.features.some(f=>f.properties.portionId===id&&f.properties.active),ids[1]);
   const before=draft(),beforeRows=await drawing();
   await tap('#row-portion-picker [data-portion-clear]');
   await page.waitForFunction(()=>__map.getSource('row-portions')._data.features.every(f=>!f.properties.active));
   assert.deepEqual(await draft(),await before,'clearing the visual selection preserves all authored field values');assert.deepEqual((await drawing()).rows,beforeRows.rows,'clearing selection preserves row drawing');
   assert.equal(await page.locator('#row-portion-picker [data-portion-clear]').getAttribute('aria-pressed'),'true');
   for(const selector of ['#orientation','#orientation-output','#curve-add-button','#curve-reset-button'])assert.equal(await page.locator(selector).isDisabled(),true,selector+': no accidental global edits while a split field has no portion selected');
   const dimensions=await portionButtons.evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,font:parseFloat(getComputedStyle(node).fontSize)})));assert.ok(dimensions.every(d=>d.height<=44&&d.font<=13),'portion choices are compact');
   await capture(stage);await tap(portionButtons.first());await page.waitForFunction(id=>__map.getSource('row-portions')._data.features.some(f=>f.properties.portionId===id&&f.properties.active),ids[0]);
   assert.equal(await page.locator('#orientation-output').isEnabled(),true);assert.equal(await page.locator('#curve-add-button').isEnabled(),true);
   if(stage==='desktop-portions-none'&&!originallyOpen)await tap(card('portions').locator(':scope>summary'));
   return ids;
  };
  try{
   await page.goto(base+'/');await page.waitForFunction(key=>window.__map?.getSource('row-portions')&&document.querySelector('#profile-trigger')?.textContent!=='Login'&&JSON.parse(localStorage.getItem(key))?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate'),draftKey,{timeout:30000,polling:100});
   await page.waitForFunction(()=>!__map.isMoving());
   console.log(name+' ready');await capture('map');
   await tap('.mobile-brand-tool-trigger');await capture('tool-menu');await tap('#tool-selector [data-tool="configurator"]');
   await tap('#mobile-app [data-view="fields"]');await capture('fields');await tap('.mobile-field-card[data-field-id="l-field"]');await capture('detail');
   await tap('#mobile-edit-map');await capture('editor');
   await tap('.mobile-editor-tool-trigger');await capture('editor-tool-menu');await tap('#tool-selector [data-tool="configurator"]');
   await tap('[data-sheet="orientation"]');await capture('filari');
   if(!diagnostic){await verifyCards('editor-refinement');await verifyPortions('editor-portions-none');}
   await tap('#mobile-close-sheet');
   await tap('#mobile-editor-next');await capture('parameters');
   if(diagnostic){
    if(!await page.locator('.advanced').evaluate(node=>node.open))await tap('.advanced>summary');await capture('refinement');
   }else{
    await verifyCards('parameters-refinement');
    const ids=await verifyPortions('parameters-portions-none'),before=await draft();
    // Shared numeric callbacks need one full representative path; duplicating
    // the real L-shaped calculation on every SoftwareGL viewport adds no UI
    // coverage. All viewports still exercise selection and both transactions.
    if(name==='phone'&&numericEnabled){
     await openCard('portions');await enter('#orientation-output','40,0');
     await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).state.project.rowPortions.some(p=>p.id===id&&p.orientationDeg===40),{key:draftKey,id:ids[0]});
     await openCard('curve');await tap('#curve-add-button');
     await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).state.project.rowPortions.some(p=>p.id===id&&p.rowCurvePoints.length===1),{key:draftKey,id:ids[0]});
     const edited=await draft();assert.deepEqual(edited.rowPortions.find(p=>p.id===ids[1]),before.rowPortions.find(p=>p.id===ids[1]),'editing A preserves the authored design in B');assert.equal(edited.orientationDeg,before.orientationDeg,'global legacy orientation survives local portion changes');assert.deepEqual(edited.rowCurvePoints,before.rowCurvePoints);
     await capture('portion-curve-edited');
    }
    await tap('#mobile-save-field');await page.waitForFunction(()=>document.body.dataset.mobileScreen==='detail',null,{timeout:name==='phone'&&numericEnabled?60000:30000});
    const saved=await draft(),savedRows=(await drawing()).rows;await page.reload();await page.waitForFunction(key=>window.__map?.getSource('row-portions')&&JSON.parse(localStorage.getItem(key))?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate'),draftKey,{timeout:30000,polling:100});
    await page.waitForFunction(()=>!__map.isMoving());assert.deepEqual((await draft()).rowPortions,saved.rowPortions,'save/reload preserves independent designs');assert.deepEqual((await drawing()).rows,savedRows,'save/reload preserves visible vineyard schema');
    await capture('saved-reloaded');
    // Real parameter cancel must discard changes made in the reorganized cards.
    if(await page.locator('#mobile-edit-parameters').isVisible())await tap('#mobile-edit-parameters');else{await tap('#mobile-app [data-view="fields"]');await tap('.mobile-field-card[data-field-id="l-field"]');await tap('#mobile-edit-parameters');}
    const beforeCancel=await draft();if(name==='phone'&&numericEnabled){await enter('#plant-spacing','1.05');await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.project.plantSpacingM===1.05,draftKey);}
    await openCard('exclusions');await tap('#exclude-line-button');await page.waitForFunction(()=>document.body.dataset.mobileScreen==='editor'&&document.body.classList.contains('mobile-drawing'));
    assert.equal(await page.locator('.advanced').evaluate(node=>node.parentElement.id),'mobile-refinement-controls','the whole original refinement tree follows an exclusion action from parameters');
    await capture('parameters-start-passage');await tap('#mobile-stop-tool');await tap('#mobile-editor-cancel');assert.deepEqual(await draft(),beforeCancel,'cancel after starting a passage restores the complete prior field draft');
   }
   if(diagnostic)await tap('#mobile-cancel-field');await tap('#mobile-app [data-view="projects"]');await capture('projects');
   await tap('#mobile-app [data-view="profile"]');const profile=await capture('profile');
   if(!diagnostic){
    assert.equal(profile.profileFields.length,10);assert.ok(profile.pages.scrollHeight<=profile.pages.height+1,'profile fits without scrolling');assert.ok(profile.profileFields.every(f=>f.font<16),'profile input text is visibly smaller');
    const profileControls=profile.controls.filter(c=>c.hit&&!['Mappa','Campi','Progetti','Profilo'].includes(c.label));assert.ok(profileControls.every(c=>c.left>=0&&c.right<=viewport.width&&c.top>=0&&c.bottom<=profile.navTop),'all profile fields/actions fit above navigation');
    await tap('[data-mobile-select="mobile-theme-choice"]');await tap('.mobile-choice-options [data-choice-value="dark"]');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await capture('profile-dark');
    if(name==='phone'){
     const beforeDesktop=await draft(),rowsBeforeDesktop=(await drawing()).rows,disclosures=await page.locator('.advanced-card').evaluateAll(nodes=>nodes.map(node=>node.open));
     await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>!document.body.classList.contains('mobile-app-active'));
     assert.deepEqual(await page.locator('.advanced-card').evaluateAll(nodes=>nodes.map(node=>node.open)),disclosures,'each independent card state survives relocation before any desktop interaction');
     assert.equal(await page.locator('.advanced').evaluate(node=>!!node.closest('.panel')),true,'original Affina tree returns to the desktop panel');
     await verifyCards('desktop-return');await verifyPortions('desktop-portions-none');
     assert.deepEqual((await draft()).rowPortions,beforeDesktop.rowPortions);assert.deepEqual((await drawing()).rows,rowsBeforeDesktop);assert.deepEqual(await page.locator('.advanced-card').evaluateAll(nodes=>nodes.map(node=>node.open)),disclosures,'each independent card state survives mobile/desktop relocation');
     // sync() deliberately returns to the mobile map after a breakpoint change.
     // Assert disclosure preservation before navigating to the profile again.
     await page.setViewportSize(viewport);await page.waitForFunction(()=>document.body.classList.contains('mobile-app-active')&&document.body.dataset.mobileScreen==='map',null,{polling:100});assert.deepEqual(await page.locator('.advanced-card').evaluateAll(nodes=>nodes.map(node=>node.open)),disclosures,'each independent card state survives relocation back to mobile before further interaction');await capture('map-desktop-return');
     await tap('#mobile-app [data-view="profile"]');await page.waitForFunction(()=>document.querySelector('.mobile-profile-details input')?.checkVisibility(),null,{polling:100});await capture('profile-desktop-return');
    }
    await tap('#mobile-app [data-view="map"]');await tap('.mobile-brand-tool-trigger');await tap('#tool-selector [data-tool="counts"]');await page.waitForURL(/\/conteggi\//);await page.waitForSelector('#quantity-display');
    const anchor=page.locator('.counts-footer-brand');await anchor.scrollIntoViewIfNeeded();
    const logo=await anchor.evaluate(node=>{const r=node.getBoundingClientRect(),img=node.querySelector('img'),image=img.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom,imageWidth:image.width,imageHeight:image.height,height:r.height,viewport:innerWidth,filter:getComputedStyle(img).filter,leftOutsideLinked:!!document.elementFromPoint(Math.max(1,r.left-4),(r.top+r.bottom)/2)?.closest('a')};});
    assert.ok(Math.abs(logo.width-logo.imageWidth)<=1&&Math.abs(logo.height-logo.imageHeight)<=1,'only the logo image has a link hit area');assert.ok(Math.abs((logo.left+logo.right)/2-logo.viewport/2)<=1,'footer mark stays centered');assert.equal(logo.leftOutsideLinked,false,'blank logo row does not link to the website');
    assert.ok(new URL(await anchor.getAttribute('href')).hostname.endsWith('vivaiobice.com'),'logo points at the approved website');let popupCount=0;page.on('popup',()=>popupCount++);await page.touchscreen.tap(Math.max(1,logo.left-4),(logo.top+logo.bottom)/2);assert.equal(popupCount,0);const popupPromise=page.waitForEvent('popup');await tap(anchor);const popup=await popupPromise;assert.equal(popupCount,1,'tapping the mark opens its website link');await popup.close();
    await page.screenshot({path:resolve(output,name+'-counts-logo.png')});
   }
   assert.deepEqual(errors,[]);reports.push({name,viewport,diagnostic,numericEdit:name==='phone'&&numericEnabled,blockedRequests,localTileRequests,externalRequestsAllowed:0,actions,snapshots,moduleHashes:Object.fromEntries(moduleHashes),servedHashes:Object.fromEntries(servedHashes)});
   await writeFile(resolve(output,name+'.json'),JSON.stringify(reports.at(-1),null,2));
   console.log(name+' completed');
  }catch(error){await capture('failure');await writeFile(resolve(output,name+'-failure.json'),JSON.stringify({message:error.message,errors,actions,snapshots},null,2));throw error;}
  finally{await context.close();}
 }
 const release=(await readFile(resolve(root,'src/config.js'),'utf8')).match(/version:\s*['"]([^'"]+)/)?.[1];
 await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,release,diagnostic,reports,desktopReport:reports.find(r=>r.name==='phone')?.snapshots.filter(s=>s.stage==='desktop-return'),moduleHashes:Object.fromEntries(moduleHashes),servedHashes:Object.fromEntries(servedHashes)},null,2));
 console.log(JSON.stringify({passed:true,diagnostic,reports:reports.map(r=>({name:r.name,stages:r.snapshots.length,conflicts:r.snapshots.filter(s=>s.conflicts.length).map(s=>({stage:s.stage,conflicts:s.conflicts})),profile:r.snapshots.find(s=>s.stage==='profile')?.pages}))},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
