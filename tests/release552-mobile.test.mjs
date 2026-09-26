import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createViewMode} from '../src/view-mode.js';
import {resolveEditableProjectCode} from '../src/project-code-loader.js';
import {prepareReportContext,REPORT_CONTEXT_KEY,readReportContext} from '../src/report-context.js';
import {installPenTapFallback} from '../src/pen-tap.js';
import {mobileUserProfileHtml,readMobileProfileForm} from '../src/mobile-profile.js';
import {mountReportProjectContext} from '../src/report-context.js';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('iPad choice persists across rotations and honors desktop selection',()=>{
  const store=storage();let landscape=false;
  const media=()=>!landscape;
  const first=createViewMode({storage:store,isTablet:()=>true,autoMobile:media});
  assert.equal(first.isMobile(),true);landscape=true;assert.equal(first.isMobile(),false);
  first.set('mobile');assert.equal(first.isMobile(),true);
  const reopened=createViewMode({storage:store,isTablet:()=>true,autoMobile:media});assert.equal(reopened.isMobile(),true);
  reopened.set('desktop');landscape=false;assert.equal(reopened.isMobile(),false);
  reopened.set('auto');assert.equal(reopened.isMobile(),true);
  assert.equal(createViewMode({storage:store,isTablet:()=>false,autoMobile:()=>true}).isMobile(),true);
});

test('project code loader requires editable access before returning a project',async()=>{
  const calls=[];const backend={getPublicProjectByCode:async code=>{calls.push(code);return {projectId:'server-p'};},canEditProject:async()=>true,loadEditableProject:async id=>({id,name:'Vigneto',field_plans:[{id:'a'}]})};
  const loaded=await resolveEditableProjectCode({code:'vo-1234567',backend});
  assert.equal(loaded.id,'server-p');assert.deepEqual(calls,['VO-1234567']);
  await assert.rejects(resolveEditableProjectCode({code:'VO-7654321',backend:{...backend,getPublicProjectByCode:async()=>null}}),/non trovato/i);
  await assert.rejects(resolveEditableProjectCode({code:'VO-7654321',backend:{...backend,canEditProject:async()=>false}}),/accesso/i);
  await assert.rejects(resolveEditableProjectCode({code:'no',backend}),/valido/i);
});

test('report context pins the archived project and refuses fields outside it',()=>{
  const current={project:{localProjectId:'current',localProjectName:'Corrente',fields:[{id:'a'}]}};
  const item={id:'saved',name:'Impianto alto',project:{localProjectId:'saved',fields:[{id:'b'}]},cloud:{projectId:'server-b'}};
  const result=prepareReportContext(current,{projectItem:item});
  assert.equal(result.project.localProjectName,'Impianto alto');assert.equal(result.project.fields[0].id,'b');assert.equal(result.cloud.projectId,'server-b');
  assert.throws(()=>prepareReportContext(current,{fieldId:'b'}),/non appartiene/i);
  assert.equal(prepareReportContext(current,{fieldId:'a'}).project.localProjectId,'current');
  assert.equal(prepareReportContext(current,{fieldId:'a'}).reportFieldId,'a');
  assert.match(REPORT_CONTEXT_KEY('request'),/request/);
});
test('report window reads the snapshot for its own handoff request only',()=>{
  const store=storage(),snapshot={project:{localProjectId:'p',localProjectName:'Collina',fields:[{id:'a'}]}};
  store.setItem(REPORT_CONTEXT_KEY('one'),JSON.stringify(snapshot));
  assert.equal(readReportContext(store,'one').project.localProjectName,'Collina');
  assert.equal(readReportContext(store,'two'),null);
  store.setItem(REPORT_CONTEXT_KEY('broken'),'{');assert.equal(readReportContext(store,'broken'),null);
});
test('PDF preflight labels the actual project above the field choices',()=>{
  const {document}=parseHTML('<main><div id="report-project-context"></div><fieldset id="report-field-selection"></fieldset></main>');
  mountReportProjectContext(document,{project:{localProjectName:'Vigneto <alto>'}});
  assert.equal(document.querySelector('#report-project-context strong').textContent,'Vigneto <alto>');
  assert.ok(document.querySelector('#report-project-context').compareDocumentPosition(document.querySelector('#report-field-selection')) & 4);
});

test('Pencil taps activate a button once when WebKit omits its click',async()=>{
  const {document,window}=parseHTML('<html><body><main id="root"><button id="action">Apri</button></main></body></html>');
  const root=document.querySelector('#root'),button=document.querySelector('#action');let count=0;button.addEventListener('click',()=>count++);
  installPenTapFallback(root,()=>true,{delayMs:5});
  const event=new window.Event('pointerup',{bubbles:true});event.pointerType='pen';event.clientX=20;event.clientY=20;button.dispatchEvent(event);
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(count,1);
  button.dispatchEvent(event);button.click();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(count,2);
});
test('Pencil input focuses and map tap falls back only when no native click arrives',async()=>{
  const {document,window}=parseHTML('<main id="root"><input id="name"><div class="map-wrap"><canvas id="map"></canvas></div></main>');
  const root=document.querySelector('#root'),input=document.querySelector('#name'),canvas=document.querySelector('#map');let focused=0,maps=0;
  input.focus=()=>focused++;
  installPenTapFallback(root,()=>true,{delayMs:5,onMapTap:()=>maps++});
  for(const node of [input,canvas]){const event=new window.Event('pointerup',{bubbles:true});event.pointerType='pen';node.dispatchEvent(event);}
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(focused,1);assert.equal(maps,1);
  const event=new window.Event('pointerup',{bubbles:true});event.pointerType='pen';canvas.dispatchEvent(event);canvas.click();
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(maps,1);
});
test('mobile profile exposes desktop account fields and escapes stored user values',()=>{
  const {document}=parseHTML(`<html><body>${mobileUserProfileHtml({displayName:'Mario <script>',email:'m@example.com',companyName:'Vivai Obice',isAdmin:true})}</body></html>`);
  for(const field of ['firstName','lastName','companyName','address','postalCode','city','province','vatNumber','phone'])assert.ok(document.querySelector(`[name="${field}"]`));
  assert.equal(document.querySelector('[name="companyName"]').value,'Vivai Obice');
  assert.equal(document.querySelector('script'),null);assert.ok(document.querySelector('[data-mobile-profile-action="save"]'));
  assert.ok(document.querySelector('[data-mobile-profile-action="reset-password"]'));assert.ok(document.querySelector('[data-mobile-profile-action="logout"]'));
  assert.ok(document.querySelector('[href="./admin/"]'));
  document.querySelector('[name="phone"]').value=' 333 222 ';assert.equal(readMobileProfileForm(document.querySelector('form')).phone,'333 222');
});
