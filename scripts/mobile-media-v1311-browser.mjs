// Audit mobile and desktop v1.3.11 with the shipped configurator and real MapLibre/Draw.
// Run: node scripts/mobile-media-v1311-browser.mjs
// Full shipped app and real MapLibre/Draw; libraries, map tiles, auth and cloud storage are fixtures.
// Real IndexedDB and native inputs/downloads are exercised. No remote mutation is allowed.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';


const require=createRequire(import.meta.url);
const {chromium}=require((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules')+'/playwright');
const root=resolve(process.env.MOBILE_MEDIA_V1311_BROWSER_ROOT??fileURLToPath(new URL('../',import.meta.url)));
const [{createInitialState},{ensureProjectFields}]=await Promise.all([
 import(pathToFileURL(resolve(root,'src/state.js')).href),
 import(pathToFileURL(resolve(root,'src/fields.js')).href)
]);
const output=resolve(process.env.MOBILE_MEDIA_V1311_BROWSER_OUTPUT??resolve(root,'../qa-runtime/browser-results'));
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??resolve(root,'../qa-runtime');
// Runtime cache sits outside the application; only pinned library assets may be fetched.
async function pinnedAsset(path,url){try{return await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;const response=await fetch(url);if(!response.ok)throw new Error('Pinned browser asset download failed: '+url);const data=await response.text();await mkdir(dirname(path),{recursive:true});await writeFile(path,data);return data;}}
const maplibre=await pinnedAsset(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js');
const draw=await pinnedAsset(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js');
const maplibreCss=await pinnedAsset(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css');
const drawCss=await pinnedAsset(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css');
const moduleHashes=new Map(),servedHashes=new Map(),servedVersions=new Map();
// Deterministic local raster fixtures keep MapLibre's load lifecycle independent
// of aborted internet tile requests. Satellite imagery itself is outside this UI audit.
const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN48ubBfwAJGAOwBa2qBwAAAABJRU5ErkJggg==','base64');
const referenceTile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
const cloudFiles=new Map();
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.startsWith('/__fixture_media/')){const value=cloudFiles.get(pathname.slice('/__fixture_media/'.length));if(!value){res.writeHead(404);return res.end('Missing fixture media');}res.setHeader('Content-Type',value.mime);res.setHeader('Content-Disposition','attachment; filename="'+value.name+'"');return res.end(Buffer.from(value.data,'base64'));}
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');servedHashes.set(pathname,hash);if(!servedVersions.has(pathname))servedVersions.set(pathname,new Set());servedVersions.get(pathname).add(hash);if(pathname.endsWith('.js'))moduleHashes.set(pathname,hash);res.end(bytes);
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const exposeMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
  constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}};`;
const sdk=`export function createClient(){
  const user=window.__fixture.user,session={user,access_token:'fixture'};
  const mediaKey='qa-field-media-records',blobKey='qa-field-media-blobs';
  const read=key=>JSON.parse(sessionStorage.getItem(key)||'{}'),write=(key,data)=>sessionStorage.setItem(key,JSON.stringify(data));
  const mediaChain=()=>{let op='select',input=null,one=false,filters=[],windowRange=null;
    const query=new Proxy({}, {get(_target,key){
      if(key==='then')return(done,fail)=>Promise.resolve().then(()=>{
        let db=read(mediaKey),rows=Object.values(db).filter(r=>filters.every(([k,v])=>r[k]===v));
        if(op==='insert'){const values=Array.isArray(input)?input:[input];for(const r of values)db[r.id]={...r,created_at:new Date().toISOString()};rows=values.map(r=>db[r.id]);write(mediaKey,db);}
        if(op==='update'){rows=rows.map(r=>db[r.id]={...r,...input});write(mediaKey,db);}
        if(op==='delete'){for(const r of rows)delete db[r.id];write(mediaKey,db);}
        rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));if(windowRange)rows=rows.slice(windowRange[0],windowRange[1]+1);
        return{data:one?(rows[0]??null):rows,error:null};
      }).then(done,fail);
      return(...args)=>{if(['insert','update','delete'].includes(key)){op=key;input=args[0];}if(key==='eq')filters.push(args);if(key==='range')windowRange=args;if(key==='single'||key==='maybeSingle')one=true;return query;};
    }});return query;};
  const storage={from(){return{async upload(path,file){const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const db=read(blobKey);db[path]={mime:file.type,name:file.name,data:btoa(binary)};write(blobKey,db);await window.__fixtureSaveBlob(path,db[path]);return{data:{path},error:null};},async remove(paths){const db=read(blobKey);for(const path of paths)delete db[path];write(blobKey,db);return{data:[],error:null};},async createSignedUrl(path){return{data:{signedUrl:location.origin+'/__fixture_media/'+encodeURIComponent(path)},error:null};}};}};
  const chain=table=>{if(table==='field_media')return mediaChain();let row=null,single=false,filters=[];const query=new Proxy({}, {get(_target,key){
    if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{
      user_id:user.id,owner_kind:'user',display_name:'Marco Obice',username:'marco_obice_profilo_aziendale',first_name:'Marco',last_name:'Obice',company_name:'Vivai Obice Società Semplice Agricola',address:'Via Fontanette 1',city:'Santo Stefano Belbo',province:'CN',postal_code:'12058',vat_number:'01234567890',
      phone:'123',email:'test@example.test',...row}:{id:table==='project_fields'?'fixture-cloud-field-'+(filters.find(([key])=>key==='client_field_id')?.[1]??'unknown'):table==='projects'?'fixture-project':'fixture',...Object.fromEntries(filters),...row}):[],error:null}).then(done,fail);
    return (...args)=>{if(key==='eq')filters.push(args);if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
  }});return query;};
  return {auth:{async getSession(){if(!location.pathname.startsWith('/conteggi')&&!window.__map?.__initialLoad&&!window.__map?.loaded())await new Promise(done=>window.__map.once('load',done));return {data:{session},error:null};},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,storage,
    functions:{async invoke(name,{body}){if(name!=='counts-api')throw new Error('Only non-delivery Counts fixture is enabled');return {data:body.action==='pull'?{lists:[],counts:[],submissions:[],nextCursor:null}:body.action==='mutate'?{value:{...body.input.value,revision:body.input.expectedRevision+1,syncState:'synced'}}:{accepted:true},error:null};}},
    rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
const state=createInitialState();
const plainGeometry=[[.001,45],[.0015,45],[.0015,45.0005],[.001,45.0005],[.001,45]];
state.project=ensureProjectFields({...state.project,localProjectId:'00000000-0000-4000-8000-000000001311',localProjectName:'Porzioni indipendenti',activeFieldId:'l-field',fields:[
 {...state.project.fields[0],...fixture,id:'l-field',geometry:fixture.polygon,orientationLocked:true,headlandWidthM:4,label:'Chardonnay B. · 775 Paulsen · Cascina Elena',rowPortions:[]},
 {...state.project.fields[0],id:'plain-field',geometry:plainGeometry,orientationDeg:45,orientationLocked:true,label:'Campo intero',rowCurvePoints:[{id:'plain-curve',position:.5,offsetM:2}],rowPortions:[]}
]});
const owner='00000000-0000-4000-8000-000000000125',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const reports=[],diagnostic=process.env.MOBILE_MEDIA_V1311_BROWSER_DIAGNOSTIC==='1';
const views=[['phone',{width:369,height:800}],['small',{width:360,height:640}],['landscape',{width:844,height:390}],['desktop',{width:1440,height:900}]];
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
 const mapExposed=(desktop||['map','editor'].includes(document.body.dataset.mobileScreen))&&(!visible(sheet)||(document.body.dataset.mobileScreen==='editor'&&document.querySelector('#mobile-app')?.dataset.refinementMode==='true')),mapNotices=mapExposed?[...document.querySelectorAll('.map-wrap .map-status,.maplibregl-ctrl-attrib,#mobile-add-field')].filter(node=>visible(node)&&node.textContent.trim()).map(describe):[],mapNoticeConflicts=[];
 for(const overlay of mapNotices.filter(node=>String(node.selector).includes('map-status')||node.selector==='#mobile-add-field'))for(const attribution of mapNotices.filter(node=>String(node.selector).includes('ctrl-attrib'))){const width=Math.min(overlay.clipped.right,attribution.clipped.right)-Math.max(overlay.clipped.left,attribution.clipped.left),height=Math.min(overlay.clipped.bottom,attribution.clipped.bottom)-Math.max(overlay.clipped.top,attribution.clipped.top);if(width>1&&height>1)mapNoticeConflicts.push({overlay:overlay.selector,attribution:attribution.selector,width,height});}
 const mapNoticeObstructions=[];
 const obstructionNodes=desktop?[]:[...new Set([...titleNodes,...document.querySelectorAll('.mobile-home-tools>button,#mobile-refinement-tools>button,.map-visibility-control,.map-terrain-control,.mobile-sheet')])].filter(visible),obstructions=obstructionNodes.map(describe);
 for(const notice of mapNotices)for(const obstruction of obstructions){const width=Math.min(notice.clipped.right,obstruction.clipped.right)-Math.max(notice.clipped.left,obstruction.clipped.left),height=Math.min(notice.clipped.bottom,obstruction.clipped.bottom)-Math.max(notice.clipped.top,obstruction.clipped.top);if(width>1&&height>1)mapNoticeObstructions.push({notice:notice.selector,obstruction:obstruction.selector,width,height});}
 const record=Object.keys(localStorage).filter(key=>key.startsWith('vivai-obice:configuratore:draft:live:')).map(key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}).find(value=>value?.workspace);
 return{stage,screen:document.body.dataset.mobileScreen,desktop,viewport:{width:innerWidth,height:innerHeight},runtime:{map:!!window.__map,sourcePortions:!!window.__map?.getSource('row-portions'),loaded:window.__map?.loaded(),initialLoad:window.__map?.__initialLoad,profile:document.querySelector('#profile-trigger')?.textContent,workspaceSavedAt:record?.workspace?.savedAt,restoreGate:!!document.querySelector('.workspace-restore-gate')},desktopCards:desktop?[...document.querySelectorAll('.advanced-card')].map(node=>({key:node.dataset.refinement,open:node.open,summary:describe(node.querySelector(':scope>summary'))})):null,documentWidth:document.documentElement.scrollWidth,pages:pages?{width:pages.clientWidth,scrollWidth:pages.scrollWidth,height:pages.clientHeight,scrollHeight:pages.scrollHeight,scrollTop:pages.scrollTop}:null,sheet:visible(sheet)?{width:sheet.clientWidth,scrollWidth:sheet.scrollWidth}:null,navTop:nav.top,controls,titles,conflicts,controlConflicts,mapExposed,mapNotices,mapNoticeConflicts,mapNoticeObstructions,profileFields:[...document.querySelectorAll('.mobile-profile-details input')].filter(visible).map(describe)};
},stage);}
function assertLayout(data){
 assert.equal(data.documentWidth,data.viewport.width,data.stage+': no document horizontal overflow');
 if(data.pages?.width)assert.ok(data.pages.scrollWidth<=data.pages.width+1,data.stage+': no content horizontal overflow');
 if(data.sheet?.width)assert.ok(data.sheet.scrollWidth<=data.sheet.width+1,data.stage+': no sheet horizontal overflow');
 assert.deepEqual(data.conflicts,[],data.stage+': visible logo, heading and field name do not overlap');
 assert.deepEqual(data.controlConflicts,[],data.stage+': visible independent controls do not overlap');
 assert.deepEqual(data.mapNoticeConflicts,[],data.stage+': exposed map status/Add Campo and attribution do not overlap');
 assert.deepEqual(data.mapNoticeObstructions,[],data.stage+': exposed map notices stay clear of headings, rail and panel');
}
const photo=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAYABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCzRRRXAcYUUUUAFFFFABRRRQB//9k=','base64');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
const normalOrder=['plant','material','information','cadastre','soil','portions','curve','exclusions'];
const mapOrder=['portions','curve','exclusions','plant','material','information','cadastre','soil'];
async function inspectMedia(page){return page.evaluate(()=>{
 const card=document.querySelector('.field-media-card'),r=card.getBoundingClientRect();
 const controls=[...card.querySelectorAll('button,input:not([type=file]),a')].filter(n=>n.checkVisibility({checkVisibilityCSS:true})).map(n=>{const r=n.getBoundingClientRect();return {label:n.getAttribute('aria-label')||n.textContent.trim(),left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};});
 return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,clientWidth:card.clientWidth,scrollWidth:card.scrollWidth,scrollHeight:card.scrollHeight,controls,items:[...document.querySelectorAll('.field-media-item')].map(n=>({id:n.dataset.mediaId,name:n.querySelector('strong').textContent,date:n.querySelector('time').dateTime,dateLabel:n.querySelector('time').textContent,note:n.querySelector('.field-media-item-note')?.textContent}))};
});}
async function textContrast(page,selector){return page.locator(selector).evaluateAll(nodes=>{
 const parse=color=>color.match(/[\d.]+/g)?.map(Number)??[255,255,255,1];
 const lum=rgb=>rgb.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
 return nodes.filter(n=>n.checkVisibility({checkVisibilityCSS:true})).map(n=>{let bg=[255,255,255,1],ancestors=[];for(let e=n;e;e=e.parentElement)ancestors.push(e);for(const e of ancestors.reverse()){const color=parse(getComputedStyle(e).backgroundColor),alpha=color.length===3?1:color[3];bg=color.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));}const fg=parse(getComputedStyle(n).color),a=lum(fg),b=lum(bg);return{selector:n.id?'#'+n.id:n.className,text:n.textContent.trim().slice(0,80),color:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
});}
try{
 const executablePath=process.env.MAP_VISIBILITY_CHROMIUM_PATH??process.env.COUNTS_CHROMIUM_PATH??'/workspace/sites/dashboard-vivai-obice/.sites-runtime/browser/chromium';
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 const selectedViews=process.env.MOBILE_MEDIA_V1311_BROWSER_VIEW?.split(',');
 const modes=process.env.MOBILE_MEDIA_V1311_BROWSER_AUTH?.split(',')??['guest','user','cloud'];
 for(const mode of modes)for(const [viewName,viewport] of views.filter(([name])=>(!selectedViews||selectedViews.includes(name))&&(mode!=='user'||name!=='desktop')&&(mode!=='cloud'||['phone','desktop'].includes(name)))){
  const name=mode+'-'+viewName,isDesktop=viewName==='desktop';
  const context=await browser.newContext({viewport,isMobile:!isDesktop,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage(),errors=[];
  await context.exposeFunction('__fixtureSaveBlob',(path,value)=>{cloudFiles.set(path,value);});
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:[0,44.9993],zoom:17,bearing:0}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({draftKey,state,workspace,owner,mode})=>{window.__fixture={user:{id:owner,is_anonymous:mode==='guest',email:'qa@example.test',app_metadata:{}}};if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');},{draftKey,state,workspace,owner,mode});
  let blockedRequests=0,localTileRequests=0;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.hostname==='server.arcgisonline.com'&&url.pathname.includes('/MapServer/tile/')||url.hostname==='tile.openstreetmap.org'){localTileRequests++;return route.fulfill({contentType:'image/png',body:url.pathname.includes('/Reference/')?referenceTile:tile});}
   blockedRequests++;return route.abort();});

  const requestFailures=[];page.on('requestfailed',request=>requestFailures.push({url:request.url(),error:request.failure()?.errorText}));const snapshots=[],actions=[],capture=async(stage,{assertUi=true}={})=>{await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));const data=await metrics(page,stage);data.capturedAt=new Date().toISOString();snapshots.push(data);await page.screenshot({path:resolve(output,name+'-'+stage+'.png')});if(!diagnostic&&stage!=='failure'&&assertUi)assertLayout(data);return data;};
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

  const ready=async()=>{await page.waitForFunction(key=>window.__map?.getSource('row-portions')&&(window.__fixture.user.is_anonymous||document.querySelector('#profile-trigger')?.textContent!=='Login')&&JSON.parse(localStorage.getItem(key))?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate'),draftKey,{timeout:30000,polling:100});await page.waitForFunction(()=>!__map.isMoving());};
  const fieldDraft=async()=>{const project=await draft();return project.fields.find(f=>f.id==='l-field');};
  const openMedia=async()=>{await tap(isDesktop?'#summary-field-media':'#mobile-detail-media');await page.waitForSelector('#field-media:not([hidden])');await page.waitForFunction(()=>document.querySelector('.field-media-feedback').textContent!=='Caricamento…');};
  const closeMedia=()=>tap('[data-media-close]');
  const mediaSnapshot=async stage=>{const data=await inspectMedia(page);assert.ok(data.left>=0&&data.right<=viewport.width&&data.top>=0&&data.bottom<=viewport.height,stage+': Media dialog fits viewport');assert.ok(data.scrollWidth<=data.clientWidth+1,stage+': no Media horizontal overflow');await capture(stage,{assertUi:false});snapshots.at(-1).media=data;return data;};
  const pick=async(source,files)=>{const chooserEvent=page.waitForEvent('filechooser');await tap('[data-media-pick="'+source+'"]');const chooser=await chooserEvent;await chooser.setFiles(files);await page.waitForFunction(()=>document.querySelector('#field-media').getAttribute('aria-busy')==='false');assert.match(await page.locator('.field-media-feedback').textContent(),/Media salvat/);};
  try{
   await page.goto(base+'/');await ready();console.log(name+' ready');
   await capture('map');const baseline=await fieldDraft(),baselineRows=(await drawing()).rows;
   if(mode==='user'){
    await tap('#mobile-app [data-view="profile"]');const profile=await capture('profile');
    assert.equal(profile.profileFields.length,10,'signed-in full profile has ten fields');
    assert.ok(profile.pages.scrollHeight<=profile.pages.height+1,'signed-in profile fits without scrolling');
    assert.ok(profile.profileFields.every(f=>f.font<16),'profile field text has compact typography');
    const profileControls=profile.controls.filter(c=>!['Mappa','Campi','Progetti','Profilo'].includes(c.label));
    assert.ok(profileControls.every(c=>c.left>=0&&c.right<=viewport.width&&c.top>=0&&c.bottom<=profile.navTop),'all profile fields/actions fit above navigation');
    await tap('[data-mobile-select="mobile-theme-choice"]');await tap('.mobile-choice-options [data-choice-value="dark"]');await capture('profile-dark');
   }else{
    if(!isDesktop){
     const header=await page.locator('.mobile-brand').evaluate(n=>{const r=n.getBoundingClientRect(),img=n.querySelector('img').getBoundingClientRect(),name=n.querySelector('#mobile-map-project-name').getBoundingClientRect();return{left:r.left,right:r.right,logoRight:img.right,nameLeft:name.left,name:document.querySelector('#mobile-map-project-name').textContent};});
     assert.equal(header.name,'Porzioni indipendenti');assert.ok(header.nameLeft>=header.logoRight,'project name sits beside logo');
     const release=await page.locator('.mobile-release-label').evaluate(n=>({text:n.textContent,bottom:n.getBoundingClientRect().bottom,top:n.getBoundingClientRect().top}));assert.ok(release.text.includes(process.env.MOBILE_MEDIA_V1311_BROWSER_EXPECTED_RELEASE??'1.3.11'),'expected release is displayed');assert.ok(release.bottom<=viewport.height&&release.top>=viewport.height-30,'release sits at bottom');
     await tap('#mobile-app [data-view="fields"]');await capture('fields');await tap('.mobile-field-card[data-field-id="l-field"]');await capture('detail');
     await tap('#mobile-edit-map');await capture('editor');await tap('[data-sheet="orientation"]');
     assert.equal(await page.locator('[data-sheet="orientation"]').textContent(),'Chiudi sezione');
     assert.deepEqual(await page.locator('#mobile-refinement-tools button').evaluateAll(ns=>ns.map(n=>n.dataset.refinementSection)),mapOrder);
     await capture('refinement-rail');
     const nodes=await page.evaluate(()=>{window.__originalRefinement={advanced:document.querySelector('.advanced'),orientation:document.querySelector('#orientation'),curve:document.querySelector('#curve-add-button')};return true;});assert.ok(nodes);
     for(const key of mapOrder){
      await tap('#mobile-refinement-tools [data-refinement-section="'+key+'"]');
      const section=await page.evaluate(()=>{const root=document.querySelector('#mobile-refinement-controls'),sheet=document.querySelector('#mobile-map-sheet'),r=sheet.getBoundingClientRect(),rail=document.querySelector('#mobile-refinement-tools').getBoundingClientRect();return {keys:[...root.querySelectorAll('.advanced-card')].filter(n=>!n.hidden).map(n=>n.dataset.refinement),same:window.__originalRefinement.advanced===document.querySelector('.advanced')&&window.__originalRefinement.orientation===document.querySelector('#orientation')&&window.__originalRefinement.curve===document.querySelector('#curve-add-button'),height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,rail:{left:rail.left,right:rail.right,top:rail.top,bottom:rail.bottom}};});
      assert.deepEqual(section.keys,[key],'each rail tap exposes one section');assert.ok(section.same,'original live controls survive section selection');assert.ok(section.height<=viewport.height*.58,'bottom section panel stays compact');assert.ok(section.rail.right<=viewport.width&&section.rail.left>=viewport.width-100,'section rail stays at right');
      await capture('section-'+key);snapshots.at(-1).section=section;
     }
     await tap('#mobile-close-sheet');assert.equal(await page.locator('#mobile-refinement-tools').isVisible(),true);await tap('[data-sheet="orientation"]');assert.equal(await page.locator('#mobile-refinement-tools').isVisible(),false);
     await tap('#mobile-editor-next');await capture('parameters');
     assert.deepEqual(await page.locator('.advanced-card').evaluateAll(ns=>ns.map(n=>n.dataset.refinement)),normalOrder,'normal cards follow requested order');
     assert.ok(await page.locator('.advanced-card').evaluateAll(ns=>ns.every(n=>!n.hidden)),'all normal cards return');
     await tap('#mobile-save-field');await page.waitForFunction(()=>document.body.dataset.mobileScreen==='detail');
     assert.deepEqual(await fieldDraft(),baseline,'saving reorganized controls preserves manually authored field');assert.deepEqual((await drawing()).rows,baselineRows,'saving reorganized controls preserves calculated vineyard rows');
    }else{
     assert.deepEqual(await page.locator('.advanced-card').evaluateAll(ns=>ns.map(n=>n.dataset.refinement)),normalOrder,'desktop normal card order');
    }
    await openMedia();const empty=await mediaSnapshot('media-empty');assert.equal(empty.items.length,0);
    assert.equal(await page.locator('[data-media-input="camera"]').getAttribute('capture'),'environment','camera requests native rear capture');
    assert.equal(await page.locator('[data-media-input="camera"]').getAttribute('accept'),'image/*');assert.equal(await page.locator('[data-media-input="photos"]').getAttribute('accept'),'image/*');
    await page.locator('[data-media-note]').fill('Controllo del campo · prova locale');
    await pick('camera',{name:'visita-fotocamera.jpg',mimeType:'image/jpeg',buffer:photo});await pick('photos',{name:'visita-galleria.jpg',mimeType:'image/jpeg',buffer:photo});await pick('files',[{name:'visita-nota.txt',mimeType:'text/plain',buffer:Buffer.from('Verifica locale senza modificare la geometria.')},{name:'visita-report.pdf',mimeType:'application/pdf',buffer:pdf}]);
    const uploaded=await mediaSnapshot('media-uploaded');assert.equal(uploaded.items.length,4);assert.ok(uploaded.items.every(i=>i.date&&i.dateLabel&&i.note==='Controllo del campo · prova locale'),'all attachments show visit note and dated timestamp');
    const ids=uploaded.items.map(i=>i.id);
    await tap('.field-media-item-open[aria-label="Apri visita-fotocamera.jpg"]');await page.waitForFunction(()=>document.querySelector('.field-media-preview img')?.complete&&document.querySelector('.field-media-preview img')?.naturalWidth>0);await mediaSnapshot('media-photo-preview');
    assert.match(await page.locator('.field-media-preview img').getAttribute('src'),mode==='cloud'?/\/__fixture_media\//:/^blob:/,'photo preview resolves stored binary');
    await tap('.field-media-item-open[aria-label="Apri visita-report.pdf"]');assert.match(await page.locator('.field-media-preview a').getAttribute('href'),mode==='cloud'?/\/__fixture_media\//:/^blob:/);await mediaSnapshot('media-file-preview');const downloadEvent=page.waitForEvent('download');await tap('.field-media-preview a');const download=await downloadEvent;assert.equal(download.suggestedFilename(),'visita-report.pdf');assert.deepEqual(await readFile(await download.path()),pdf,'PDF download recovers uploaded bytes');
    await closeMedia();assert.deepEqual(await fieldDraft(),baseline,'media writes leave authored geometry/rows values untouched');assert.deepEqual((await drawing()).rows,baselineRows,'media writes preserve map rows');
    await page.reload();await ready();
    if(!isDesktop&&await page.locator('#mobile-detail-media').isVisible()===false){await tap('#mobile-app [data-view="fields"]');await tap('.mobile-field-card[data-field-id="l-field"]');}
    await openMedia();const reloaded=await mediaSnapshot('media-reloaded');assert.deepEqual(reloaded.items.map(i=>i.id),ids,mode==='cloud'?'scoped cloud fixture files survive reload':'real indexedDB files survive reload');await closeMedia();
    if(isDesktop){await page.locator('#map-field-select').selectOption('plain-field');}else{await tap('#mobile-app [data-view="fields"]');await tap('.mobile-field-card[data-field-id="plain-field"]');}
    await openMedia();assert.equal((await mediaSnapshot('media-other-field')).items.length,0,'another field has a separate media scope');
    await pick('files',{name:'altro-campo.txt',mimeType:'text/plain',buffer:Buffer.from('Solo campo due')});assert.equal((await inspectMedia(page)).items.length,1);await closeMedia();
    if(isDesktop){await tap('#desktop-fields-trigger');await page.waitForSelector('#desktop-library:not([hidden])');await tap('[data-desktop-field="plain-field"] [data-field-action="media"]');await page.waitForSelector('#field-media:not([hidden])');await page.waitForFunction(()=>document.querySelector('.field-media-feedback').textContent!=='Caricamento…');assert.match(await page.locator('#field-media-title').textContent(),/Campo intero/);assert.equal((await mediaSnapshot('media-library-entry')).items.length,1,'desktop library action opens the intended field media');await closeMedia();}

    if(isDesktop){await page.locator('#map-field-select').selectOption('l-field');}else{await tap('#mobile-app [data-view="fields"]');await tap('.mobile-field-card[data-field-id="l-field"]');}
    await openMedia();assert.deepEqual((await inspectMedia(page)).items.map(i=>i.id),ids,'returning field exposes only its own attachments');await closeMedia();
    assert.deepEqual(await fieldDraft(),baseline,'switch/reload returns original manually authored field');assert.deepEqual((await drawing()).rows,baselineRows,'switch/reload preserves vineyard row geometry');
    await capture('media-complete');
    if(!isDesktop){await tap('#mobile-app [data-view="profile"]');const profile=await capture('guest-profile');assert.ok(profile.pages.scrollHeight<=profile.pages.height+1,'Guest profile fits without scrolling');}
    if(!isDesktop&&viewName==='phone'&&mode==='guest'){
     await tap('[data-mobile-select="mobile-theme-choice"]');await tap('.mobile-choice-options [data-choice-value="dark"]');
     await tap('#mobile-app [data-view="fields"]');await tap('.mobile-field-card[data-field-id="l-field"]');await openMedia();await mediaSnapshot('media-dark');
     const contrasts=await textContrast(page,'#field-media-title,.field-media-storage,.field-media-info strong,.field-media-info time,.field-media-item-note,.field-media-note input');snapshots.at(-1).contrast=contrasts;if(!diagnostic)assert.ok(contrasts.every(n=>n.ratio>=4.5),'dark Media text stays readable');await closeMedia();
     await tap('#mobile-edit-map');await tap('[data-sheet="orientation"]');await capture('refinement-rail-dark');const railContrast=await textContrast(page,'#mobile-refinement-tools button,#mobile-editor-title');snapshots.at(-1).contrast=railContrast;if(!diagnostic)assert.ok(railContrast.every(n=>n.ratio>=3),'dark refinement rail icons and editor title stay readable');
     for(const key of mapOrder){await tap('#mobile-refinement-tools [data-refinement-section="'+key+'"]');await capture('section-'+key+'-dark');const contrasts=await textContrast(page,'#mobile-sheet-title,#mobile-refinement-controls .refinement-title');snapshots.at(-1).contrast=contrasts;if(!diagnostic)assert.ok(contrasts.every(n=>n.ratio>=4.5),'dark section text stays readable: '+key);}
     await tap('[data-sheet="orientation"]');await tap('#mobile-editor-cancel');
     assert.deepEqual(await fieldDraft(),baseline,'dark refinement UI preserves field draft');assert.deepEqual((await drawing()).rows,baselineRows,'dark refinement UI preserves row geometry');
    }

   }
   assert.deepEqual(errors,[],'whole app has no unhandled browser errors');
   reports.push({name,mode,viewport,diagnostic,blockedRequests,localTileRequests,externalRequestsAllowed:0,actions,snapshots,moduleHashes:Object.fromEntries(moduleHashes),servedHashes:Object.fromEntries(servedHashes)});await writeFile(resolve(output,name+'.json'),JSON.stringify(reports.at(-1),null,2));console.log(name+' completed');
  }catch(error){await capture('failure',{assertUi:false});await writeFile(resolve(output,name+'-failure.json'),JSON.stringify({message:error.message,errors,requestFailures,actions,snapshots},null,2));throw error;}
  finally{await context.close();}
 }
 const release=(await readFile(resolve(root,'src/config.js'),'utf8')).match(/version:\s*['"]([^'"]+)/)?.[1];
 const changedDuringRun=[...servedVersions].filter(([,hashes])=>hashes.size!==1).map(([path,hashes])=>({path,hashes:[...hashes]}));assert.deepEqual(changedDuringRun,[],'served app source and styles stay stable throughout acceptance');
 const stages=reports.reduce((sum,report)=>sum+report.snapshots.length,0),sourceHash=createHash('sha256').update(JSON.stringify([...servedHashes].sort(([a],[b])=>a.localeCompare(b)))).digest('hex'),scriptHash=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
 await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:!diagnostic,diagnostic,release,cases:reports.length,stages,verifiedAt:new Date().toISOString(),sourceHash,scriptHash,reports,moduleHashes:Object.fromEntries(moduleHashes),servedHashes:Object.fromEntries(servedHashes)},null,2));
 console.log(JSON.stringify({passed:!diagnostic,diagnostic,release,cases:reports.length,stages,sourceHash,scriptHash,reports:reports.map(r=>({name:r.name,stages:r.snapshots.length,profile:r.snapshots.find(s=>s.stage==='profile')?.pages}))},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
