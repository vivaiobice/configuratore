// Chromium smoke test of real app.js -> popup -> report.js -> project sync.
// Supabase SDK responses are local fixtures; all external traffic is blocked.
// Only satellite capture is replaced with a tiny local image. No live writes.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';

const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.COUNTS_BROWSER_OUTPUT??'.counts-work/browser/report-refresh');await mkdir(output,{recursive:true});
const owner='00000000-0000-4000-8000-000000000020',otherOwner='00000000-0000-4000-8000-000000000021';
const activeId='00000000-0000-4000-8000-000000000030',savedId='00000000-0000-4000-8000-000000000031';
const activeCloud='00000000-0000-4000-8000-000000000040',savedCloud='00000000-0000-4000-8000-000000000041';
const draftKey='vivai-obice:configuratore:draft:live:'+owner,archiveKey='vivai-obice:configuratore:projects:v1:live:'+owner;
const ring=[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
const latestRing=[[8,44],[8.0014,44],[8.0014,44.0011],[8,44.0011],[8,44]];
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
const state=createInitialState();state.environment='LIVE';
Object.assign(state.project,{localProjectId:activeId,localProjectName:'Bozza attiva da conservare',geometry:ring,rowSpacingM:3.2});
Object.assign(state.project.fields[0],{geometry:ring,rowSpacingM:3.2,municipality:'Comune prova',province:'CN'});
state.cloud={projectId:activeCloud,clientProjectId:activeId,version:1,latestRevisionNumber:1,publicCode:'VO-1000001'};
const savedProject={...structuredClone(state.project),localProjectId:savedId,localProjectName:'Vigneto archiviato',activeFieldId:'saved-f1',fields:[
  {...structuredClone(state.project.fields[0]),id:'saved-f1',label:'Collina precedente',geometry:ring},
  {...structuredClone(state.project.fields[0]),id:'saved-f2',label:'Valle',geometry:ring}
]};
const savedItem={id:savedId,name:savedProject.localProjectName,savedAt:'2026-10-01T10:00:00Z',project:savedProject,cloud:{projectId:savedCloud,clientProjectId:savedId,version:1,latestRevisionNumber:1,publicCode:'VO-1000002'}};
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH,'utf8'),draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH,'utf8');
const captureFixture=`export async function captureSatelliteImage({mapModel,field}){(window.__reportCaptures??=[]).push({fieldId:field?.id,polygon:mapModel.geo?.polygon});return {dataUrl:${JSON.stringify(image)},attribution:'Local smoke fixture',overlayModel:mapModel};}`;
const sdk=`
const session=()=>({user:window.__fixtureUser,access_token:'local-fixture'});
const observers=new Set();
window.__fixtureSwitchOwner=id=>{window.__fixtureUser={...window.__fixtureUser,id};for(const callback of observers)callback('SIGNED_IN',session());};
const request=async payload=>{const response=await fetch('/__report_fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,ownerId:session().user.id})});return response.json();};
export function createClient(){
 const chain=table=>{const commands=[];const query=new Proxy({}, {get(_target,key){if(key==='then')return (done,fail)=>request({type:'table',table,commands}).then(done,fail);return (...args)=>{commands.push([key,...args]);return query;};}});return query;};
 return {auth:{async getSession(){if(!document.querySelector('#report-root')&&!window.__map?.__initialLoad)await new Promise(resolve=>window.__map.once('load',resolve));return {data:{session:session()},error:null};},onAuthStateChange(callback){observers.add(callback);return {data:{subscription:{unsubscribe(){observers.delete(callback);}}}};}},from:chain,rpc:(name,args)=>request({type:'rpc',name,args})};
}`;
const mapHook=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{constructor(...args){super(...args);window.__map??=this;this.on('load',()=>this.__initialLoad=true);}};`;
const calls=[],reports=[],results=[];let projects,localOnly=false,delayFirstRevision=false;
function resetCloud(){
  const payload=(project,id,version)=>({id,client_project_id:project.localProjectId,name:project.localProjectName,environment:'LIVE',public_code:id===savedCloud?'VO-1000002':'VO-1000001',version,latest_revision_number:1,field_plans:structuredClone(project.fields),active_field_id:project.activeFieldId});
  projects=new Map([[activeCloud,payload(state.project,activeCloud,1)],[savedCloud,payload(savedProject,savedCloud,4)]]);
  if(localOnly){projects.get(savedCloud).version=0;projects.get(savedCloud).latest_revision_number=0;}
  else{projects.get(savedCloud).field_plans[0].geometry=latestRing;projects.get(savedCloud).field_plans[0].label='Collina aggiornata online';}
}
function fixture(payload){
  calls.push(structuredClone(payload));
  if(payload.ownerId!==owner)return {data:null,error:{message:'Owner fixture mismatch'}};
  if(payload.type==='table'){
    const commands=payload.commands,where=key=>commands.find(command=>command[0]==='eq'&&command[1]===key)?.[2];
    const single=commands.some(command=>['single','maybeSingle'].includes(command[0]));
    const row=commands.find(command=>['upsert','insert'].includes(command[0]))?.[1]??{};
    if(payload.table==='profiles')return {data:{user_id:owner,owner_kind:'user',display_name:'Mario Rossi',first_name:'Mario',last_name:'Rossi',phone:'123456789',email:'mario@example.test',...row},error:null};
    if(payload.table==='projects')return {data:where('id')?structuredClone(projects.get(where('id'))):[],error:null};
    if(payload.table==='project_revisions'){const project=projects.get(where('project_id'));return {data:project?[{revision_number:project.latest_revision_number,snapshot:{clientProjectId:project.client_project_id,fields:project.field_plans}}]:[],error:null};}
    return {data:single?{id:'fixture',...row}:[],error:null};
  }
  const args=payload.args;
  if(payload.name==='can_edit_project')return {data:projects.has(args.p_project_id),error:null};
  if(['apply_project_operation','create_project_revision'].includes(payload.name)){
    const project=[...projects.values()].find(project=>project.client_project_id===args.p_snapshot.clientProjectId);
    if(Number(args.p_expected_version)!==project.version)return {data:{status:'conflict',serverVersion:project.version,serverSnapshot:{clientProjectId:project.client_project_id,fields:project.field_plans}},error:null};
    project.version++;project.field_plans=structuredClone(args.p_snapshot.fields);project.name=args.p_snapshot.name;
    if(payload.name==='create_project_revision')project.latest_revision_number++;
    return {data:{status:payload.name==='apply_project_operation'?'applied':'revision_created',projectId:project.id,version:project.version,latestRevisionNumber:project.latest_revision_number,revisionNumber:project.latest_revision_number},error:null};
  }
  if(payload.name==='issue_project_report'){
    assert.equal(args.p_project_id,savedCloud);assert.equal(args.p_revision_number,projects.get(savedCloud).latest_revision_number);
    reports.push(structuredClone(args));return {data:{reportId:'00000000-0000-4000-8000-000000000050',revisionNumber:args.p_revision_number,createdAt:'2026-10-02T10:00:00Z'},error:null};
  }
  return {data:{},error:null};
}
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/__report_fixture'){
    let body='';for await(const chunk of req)body+=chunk;
    const request=JSON.parse(body),result=fixture(request);
    // A successful first checkpoint reaches the opener after the popup timeout.
    // This reproduces the original local-only popup retaining projectId:null.
    if(delayFirstRevision&&request.name==='create_project_revision'&&request.args.p_project_id===savedCloud){delayFirstRevision=false;await new Promise(resolve=>setTimeout(resolve,350));}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  let pathname=decodeURIComponent(url.pathname);if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  let body=await readFile(path);
  if(pathname==='/src/app.js')body=body.toString()+`;window.__reportBrowserFixture={openArchive:()=>openReportPopup({projectItem:readLocalProjects(localStorage).find(item=>item.id==='${savedId}')}),getState:()=>structuredClone(state),isSyncReady:()=>Boolean(projectSync)};`;
  if(pathname==='/src/report-satellite.js')body=captureFixture;
  if(pathname==='/src/report.js'&&localOnly)body=body.toString().replace('timeoutMs=30000','timeoutMs=(globalThis.__reportFixtureRequestCount=(globalThis.__reportFixtureRequestCount??0)+1)===1?200:30000').replace('setTimeout(resolve,180)','setTimeout(resolve,20)');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');res.end(body);
}catch(error){res.writeHead(500);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.COUNTS_CHROMIUM_PATH?{executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
  const scenarios=[['desktop',{viewport:{width:1365,height:960}}],['mobile',{...devices['iPhone 13'],defaultBrowserType:undefined}],['local-only-late-response',{viewport:{width:1365,height:960}}]];
  for(const [name,options] of scenarios.filter(([name])=>!process.env.REPORT_BROWSER_SCENARIO||name===process.env.REPORT_BROWSER_SCENARIO)){
    localOnly=name==='local-only-late-response';delayFirstRevision=localOnly;resetCloud();const startCalls=calls.length,startReports=reports.length;
    const context=await browser.newContext(options),main=await context.newPage(),errors=[],blocked=[];
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));main.on('pageerror',error=>errors.push(error.message));
    await context.addInitScript(({state,savedItem,draftKey,archiveKey,owner})=>{
      window.__fixtureUser={id:owner,is_anonymous:false,email:'mario@example.test',app_metadata:{}};
      if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,savedAt:new Date().toISOString()}));
      if(!localStorage.getItem(archiveKey))localStorage.setItem(archiveKey,JSON.stringify({version:2,projects:[savedItem]}));
      localStorage.setItem('vivai-obice:configuratore:consent','necessary');
    },{state,savedItem:localOnly?{...savedItem,cloud:{}}:savedItem,draftKey,archiveKey,owner});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.href.startsWith(base+'/'))return route.continue();
      if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+mapHook});
      if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
      if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
      if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
      blocked.push({url:url.origin+url.pathname,method:route.request().method()});return route.abort();
    });
    await main.goto(base+'/');await main.waitForFunction(()=>window.__reportBrowserFixture?.isSyncReady(),{timeout:15000});
    if(name==='desktop')await main.locator('#row-spacing').fill('3.70');
    const before=await main.evaluate(()=>__reportBrowserFixture.getState().project);
    const popupPromise=main.waitForEvent('popup');await main.evaluate(()=>__reportBrowserFixture.openArchive());const popup=await popupPromise;
    await popup.waitForFunction(()=>document.querySelector('#report-refresh-project')&&!document.querySelector('#report-refresh-project').disabled);
    const popupUrl=popup.url();
    assert.equal(await popup.locator('#report-project-context strong').textContent(),'Vigneto archiviato');
    const iconPosition=await popup.locator('#report-project-context').evaluate(context=>{const name=context.querySelector('strong').getBoundingClientRect(),button=context.querySelector('button').getBoundingClientRect();return {gap:button.x-name.right,vertical:Math.abs((button.y+button.height/2)-(name.y+name.height/2)),width:button.width};});
    assert.ok(iconPosition.gap>=0&&iconPosition.gap<=12&&iconPosition.vertical<2&&iconPosition.width<=34,'refresh icon sits discreetly beside the project name');
    await popup.locator('[name="reference"]').fill('Destinatario inserito nel PDF');await popup.locator('[name="companyName"]').fill('Azienda scelta nel PDF');
    await popup.locator('#report-field-options input[value="saved-f2"]').uncheck();await popup.locator('#report-disclaimer-accept').check();
    await popup.locator('#report-generate').click();await popup.waitForFunction(()=>!document.querySelector('#report-warning').hidden&&!document.querySelector('#report-refresh-project').disabled);
    assert.match(await popup.locator('#report-warning').textContent(),localOnly?/sincronizzazione.*non.*terminata/i:/conflitto|aggiorna/i);assert.equal(reports.length,startReports);
    if(localOnly)await popup.waitForFunction(()=>JSON.parse(localStorage.getItem('vivai-obice:report-handoff:v1'))?.status==='ready');
    await popup.screenshot({path:output+'/'+name+'-stale-error.png'});
    await popup.locator('#report-refresh-project').click();await popup.waitForFunction(()=>/Progetto aggiornato|Aggiornamento non riuscito/.test(document.querySelector('#report-project-update-status').textContent));
    await popup.screenshot({path:output+'/'+name+'-refresh-result.png'});
    assert.equal(await popup.locator('#report-project-update-status').textContent(),'Progetto aggiornato.',await popup.locator('#report-warning').textContent());
    assert.equal(popup.url(),popupUrl,'same PDF window recovers after the initial error');
    assert.match(await popup.locator('#report-field-options').textContent(),localOnly?/Collina precedente/:/Collina aggiornata online/);
    assert.equal(await popup.locator('[name="reference"]').inputValue(),'Destinatario inserito nel PDF');
    assert.equal(await popup.locator('[name="companyName"]').inputValue(),'Azienda scelta nel PDF');
    assert.equal(await popup.locator('#report-field-options input[value="saved-f1"]').isChecked(),true);assert.equal(await popup.locator('#report-field-options input[value="saved-f2"]').isChecked(),false);
    assert.equal(await popup.locator('#report-disclaimer-accept').isChecked(),localOnly,'new selected geometry requires fresh consent; unchanged geometry retains it');
    const contextSnapshot=await popup.evaluate(()=>{const request=new URL(location.href).searchParams.get('handoff');return JSON.parse(localStorage.getItem('vivai-obice:report-context:v1:'+request));});
    assert.deepEqual(contextSnapshot.project.fields[0].geometry,localOnly?ring:latestRing);assert.equal(contextSnapshot.reportOwnerId,owner);assert.equal(contextSnapshot.cloud.projectId,savedCloud);
    assert.deepEqual(await main.evaluate(()=>__reportBrowserFixture.getState().project),before,'archived PDF does not activate or overwrite the main draft');
    await popup.screenshot({path:output+'/'+name+'-refreshed.png'});
    const revisionsBefore=calls.filter(call=>call.name==='create_project_revision'&&call.args.p_project_id===savedCloud).length;
    await popup.locator('#report-disclaimer-accept').check();await popup.locator('#report-generate').click();await popup.waitForFunction(()=>!document.querySelector('#report-print').disabled);
    assert.equal(calls.filter(call=>call.name==='create_project_revision'&&call.args.p_project_id===savedCloud).length,revisionsBefore+1,'generation creates a fresh selected-project checkpoint');
    assert.equal(reports.length,startReports+1);assert.deepEqual(reports.at(-1).p_selected_field_ids,['saved-f1']);assert.equal(reports.at(-1).p_recipient_snapshot.reference,'Destinatario inserito nel PDF');
    const captures=await popup.evaluate(()=>window.__reportCaptures);assert.equal(captures.length,1);assert.deepEqual(captures[0].polygon,localOnly?ring:latestRing);
    await popup.screenshot({path:output+'/'+name+'-generated.png'});
    assert.deepEqual(await main.evaluate(()=>__reportBrowserFixture.getState().project),before);
    const selectedWrites=calls.filter(call=>['apply_project_operation','create_project_revision','issue_project_report'].includes(call.name)&&JSON.stringify(call.args).includes(savedCloud)).length;
    await popup.evaluate(id=>window.__fixtureSwitchOwner(id),otherOwner);
    await popup.waitForFunction(()=>document.querySelector('#report-refresh-project').disabled&&document.querySelector('#report-generate').disabled);
    assert.match(await popup.locator('#report-warning').textContent(),/profilo.*cambiato/i);
    assert.equal(calls.filter(call=>['apply_project_operation','create_project_revision','issue_project_report'].includes(call.name)&&JSON.stringify(call.args).includes(savedCloud)).length,selectedWrites,'owner switch starts no selected-project operation');
    await popup.screenshot({path:output+'/'+name+'-owner-blocked.png'});
    assert.deepEqual(errors,[]);assert.ok(blocked.every(request=>request.method==='GET'),'no external write request is attempted');
    const result={name,status:'passed',popupUrl:popupUrl.replace(base,'local'),iconPosition,calls:calls.slice(startCalls).map(call=>({type:call.type,table:call.table,name:call.name,ownerId:call.ownerId,projectId:call.args?.p_project_id??call.args?.p_snapshot?.projectId})),blockedExternal:blocked.length};
    results.push(result);console.log(name+': real popup '+(localOnly?'late first checkpoint timeout':'stale error')+' -> refresh -> fresh scoped generation, recipient/selection, active draft preservation and owner guard passed');await context.close();
  }
  await writeFile(output+'/report-refresh-results.json',JSON.stringify({fixture:'Local SDK and database responses; satellite capture fixture; no live traffic',results},null,2));
  await rm(output+'/report-refresh-failure.json',{force:true});
}catch(error){await writeFile(output+'/report-refresh-failure.json',JSON.stringify({error:error.stack,calls},null,2));throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
