import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import fs from 'node:fs';
import * as context from '../src/report-context.js';
import * as report from '../src/report.js';
import {createReportPreflight,updateReportPreflight,canIssueReport} from '../src/report-preflight.js';

const polygon=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
const snapshot=()=>({environment:'TEST',reportOwnerId:'owner-a',project:{localProjectId:'saved-a',localProjectName:'Vigneto',fields:[{id:'f1',label:'Collina',geometry:polygon},{id:'f2',label:'Valle',geometry:polygon}]},cloud:{projectId:'server-a',version:1,latestRevisionNumber:1}});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('refresh retains recipient, valid selected fields, overview and current disclaimer',()=>{
  assert.equal(typeof context.refreshReportPreflight,'function');
  const before=snapshot();
  let preflight=updateReportPreflight(createReportPreflight({state:before}),{type:'selection/set',fieldIds:['f1']});
  preflight=updateReportPreflight(preflight,{type:'recipient/update',field:'reference',value:'Destinatario personalizzato'});
  preflight=updateReportPreflight(preflight,{type:'overview/set',enabled:true,cadastre:true});
  preflight=updateReportPreflight(preflight,{type:'disclaimer/set',accepted:true});
  const latest=snapshot();latest.project.fields[0].label='Collina aggiornata';latest.project.fields.push({id:'f3',geometry:polygon});
  const refreshed=context.refreshReportPreflight(preflight,latest,{previousState:before});
  assert.deepEqual(refreshed.selectedFieldIds,['f1']);
  assert.equal(refreshed.fieldOptions[0].label,'Collina aggiornata');
  assert.equal(refreshed.recipient.reference,'Destinatario personalizzato');
  assert.deepEqual(refreshed.overview,{enabled:true,cadastre:true});
  assert.equal(refreshed.disclaimerAccepted,true);
  assert.equal(canIssueReport(refreshed),true);
  latest.project.fields[0].geometry=null;
  const removed=context.refreshReportPreflight(preflight,latest);
  assert.deepEqual(removed.selectedFieldIds,[]);
  assert.equal(removed.disclaimerAccepted,false);
  assert.equal(canIssueReport(removed),false);
  const changed=snapshot();changed.project.fields[0].geometry=[[8,44],[8.02,44],[8.02,44.01],[8,44.01],[8,44]];
  const changedGeometry=context.refreshReportPreflight(preflight,changed,{previousState:before});
  assert.deepEqual(changedGeometry.selectedFieldIds,['f1']);assert.equal(changedGeometry.disclaimerAccepted,false);
});

test('report context refresh refuses a different owner, local project, cloud project or environment',()=>{
  assert.equal(typeof context.assertReportContextScope,'function');
  const before=snapshot();
  assert.doesNotThrow(()=>context.assertReportContextScope(before,snapshot(),{ownerId:'owner-a'}));
  for(const next of [
    {...snapshot(),reportOwnerId:'owner-b'},
    {...snapshot(),project:{...snapshot().project,localProjectId:'saved-b'}},
    {...snapshot(),cloud:{projectId:'server-b'}},
    {...snapshot(),environment:'LIVE'}
  ])assert.throws(()=>context.assertReportContextScope(before,next,{ownerId:'owner-a'}),/profilo|progetto|ambiente/i);
  assert.throws(()=>context.assertReportContextScope(before,snapshot(),{ownerId:'owner-b'}),/profilo/i);
});

test('a local archived project never inherits the unrelated active cloud project',()=>{
  const active=snapshot(),item={id:'local-b',name:'Progetto locale',project:{localProjectId:'local-b',fields:[{id:'b',geometry:polygon}]}};
  const selected=context.prepareReportContext(active,{projectItem:item,ownerId:'owner-a'});
  assert.deepEqual(selected.cloud,{});
  assert.equal(selected.project.localProjectId,'local-b');assert.equal(selected.reportOwnerId,'owner-a');
});

test('project name has an accessible discreet refresh control',()=>{
  const {document}=parseHTML('<div id="report-project-context"></div>');let refreshed=0;
  context.mountReportProjectContext(document,snapshot(),{onRefresh:()=>refreshed++});
  const button=document.querySelector('#report-refresh-project');
  assert.ok(button);
  assert.equal(button.getAttribute('aria-label'),'Aggiorna progetto');
  assert.equal(button.title,'Aggiorna progetto');
  button.click();assert.equal(refreshed,1);
  assert.equal(document.querySelector('#report-project-context strong').textContent,'Vigneto');
});

test('failed stale project handoff can refresh and retry the correct snapshot without leaving the PDF page',async()=>{
  assert.equal(typeof report.requestReportContext,'function');
  const store=storage(),before=snapshot(),latest=snapshot();latest.cloud.version=4;latest.cloud.latestRevisionNumber=3;latest.project.fields[0].label='Dati aggiornati';
  store.setItem(report.REPORT_HANDOFF_KEY,JSON.stringify({requestId:'pdf-a',status:'error',message:'Conflitto di versione.'}));
  const originalSet=store.setItem;let requested;
  store.setItem=(key,value)=>{
    originalSet(key,value);
    if(key!==report.REPORT_HANDOFF_KEY)return;
    const request=JSON.parse(value);if(request.status!=='refresh_requested')return;
    requested=request;
    originalSet(context.REPORT_CONTEXT_KEY('pdf-a'),JSON.stringify(latest));
    originalSet(key,JSON.stringify({...request,status:'ready',revisionNumber:3}));
  };
  const result=await report.requestReportContext(store,{requestId:'pdf-a',state:before,refresh:true,getOwnerId:()=> 'owner-a'});
  assert.equal(requested.localProjectId,'saved-a');assert.equal(requested.projectId,'server-a');assert.equal(requested.ownerId,'owner-a');assert.ok(requested.operationId);
  assert.equal(result.reportState.project.fields[0].label,'Dati aggiornati');
  assert.equal(result.revisionNumber,3);
  assert.equal(before.project.fields[0].label,'Collina');
});

test('each generation requests a new checkpoint instead of reusing a cached ready revision',async()=>{
  assert.equal(typeof report.requestReportContext,'function');
  const store=storage(),state=snapshot(),requests=[];
  store.setItem(report.REPORT_HANDOFF_KEY,JSON.stringify({requestId:'pdf-a',status:'ready',projectId:'server-a',revisionNumber:1}));
  const originalSet=store.setItem;
  store.setItem=(key,value)=>{
    originalSet(key,value);if(key!==report.REPORT_HANDOFF_KEY)return;
    const request=JSON.parse(value);if(request.status!=='requested')return;
    requests.push(request);
    originalSet(context.REPORT_CONTEXT_KEY('pdf-a'),JSON.stringify({...state,cloud:{...state.cloud,latestRevisionNumber:requests.length+1}}));
    originalSet(key,JSON.stringify({...request,status:'ready',revisionNumber:requests.length+1}));
  };
  const first=await report.requestReportContext(store,{requestId:'pdf-a',state,getOwnerId:()=> 'owner-a'});
  const second=await report.requestReportContext(store,{requestId:'pdf-a',state,getOwnerId:()=> 'owner-a'});
  assert.equal(requests.length,2);assert.notEqual(requests[0].operationId,requests[1].operationId);
  assert.equal(first.revisionNumber,2);assert.equal(second.revisionNumber,3);
});

test('refresh rejects a superseded operation, account change, wrong project and mismatched revision',async()=>{
  assert.equal(typeof report.requestReportContext,'function');
  for(const mode of ['account','project','window','operation','revision']){
    const store=storage(),state=snapshot();let owner='owner-a';
    store.setItem(report.REPORT_HANDOFF_KEY,JSON.stringify({requestId:'pdf-a',status:'opened'}));
    const originalSet=store.setItem;
    store.setItem=(key,value)=>{
      originalSet(key,value);if(key!==report.REPORT_HANDOFF_KEY)return;
      const request=JSON.parse(value);if(request.status!=='refresh_requested')return;
      const latest=snapshot();
      if(mode==='account')owner='owner-b';
      if(mode==='project')latest.project.localProjectId='saved-b';
      originalSet(context.REPORT_CONTEXT_KEY('pdf-a'),JSON.stringify(latest));
      originalSet(key,JSON.stringify({...request,requestId:mode==='window'?'pdf-b':'pdf-a',operationId:mode==='operation'?'superseded':request.operationId,status:'ready',revisionNumber:mode==='revision'?9:1}));
    };
    await assert.rejects(report.requestReportContext(store,{requestId:'pdf-a',state,refresh:true,getOwnerId:()=>owner}),/profilo|progetto|documento|revisione/i);
    assert.equal(state.project.localProjectId,'saved-a');
  }
});

test('PDF page refresh updates the selected project and generates from fresh data while preserving the recipient',async()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../report.html',import.meta.url),'utf8'));
  const form=document.querySelector('#report-recipient-form');
  Object.defineProperty(form,'elements',{value:{namedItem:name=>form.querySelector(`[name="${name}"]`)}});
  document.querySelector('#report-preview').scrollIntoView=()=>{};
  const store=storage(),state=snapshot(),latest=snapshot();latest.project.fields[0].label='Collina aggiornata';latest.cloud.version=4;latest.cloud.latestRevisionNumber=3;
  store.setItem(context.REPORT_CONTEXT_KEY('pdf-a'),JSON.stringify(state));
  store.setItem(report.REPORT_HANDOFF_KEY,JSON.stringify({requestId:'pdf-a',status:'error',message:'Conflitto di versione.'}));
  const originalSet=store.setItem;const requests=[];
  store.setItem=(key,value)=>{
    originalSet(key,value);if(key!==report.REPORT_HANDOFF_KEY)return;
    const request=JSON.parse(value);if(!['requested','refresh_requested'].includes(request.status))return;
    requests.push(request);originalSet(context.REPORT_CONTEXT_KEY('pdf-a'),JSON.stringify(latest));
    originalSet(key,JSON.stringify({...request,status:'ready',revisionNumber:3}));
  };
  let authChange,issued,rendered;
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'owner-a',email:'a@example.test'}}}}),onAuthStateChange:callback=>{authChange=callback;return {data:{subscription:{unsubscribe(){}}}};}}};
  const backend={getProfile:async()=>({}),issueProjectReport:async payload=>{issued=payload;return {reportId:'11111111-1111-4111-8111-111111111111',createdAt:'2026-10-02T10:00:00Z'};}};
  const page=await report.bootReportPage({documentRef:document,storage:store,locationRef:{href:'https://example.test/report.html?handoff=pdf-a'},connectClient:async()=>client,backendFactory:()=>backend,resolveLocations:async()=>({f1:{municipality:'Comune A',province:'CN'},f2:{municipality:'Comune A',province:'CN'}}),orchestratorFactory:options=>report.createReportOrchestrator({...options,captureSatellite:async()=>({dataUrl:'data:image/png;base64,abc'}),refreshSoil:async()=>null,tokenFactory:()=> 'a'.repeat(64),hashToken:async()=> 'b'.repeat(64),qrRenderer:()=>'<svg/>',renderer:model=>{rendered=model;return '<article>Documento aggiornato</article>';}})});
  const recipient=form.elements.namedItem('reference');recipient.value='Riferimento scritto';recipient.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  const consent=document.querySelector('#report-disclaimer-accept');consent.checked=true;consent.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));
  document.querySelector('#report-refresh-project').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(page.getState().project.fields[0].label,'Collina aggiornata');
  assert.equal(page.getPreflight().recipient.reference,'Riferimento scritto');
  assert.equal(page.getPreflight().disclaimerAccepted,true);
  assert.equal(document.querySelector('#report-project-update-status').textContent,'Progetto aggiornato.');
  document.querySelector('#report-generate').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(document.querySelector('#report-warning').hidden,true,document.querySelector('#report-warning').textContent);
  assert.equal(issued.projectId,'server-a');assert.equal(issued.revisionNumber,3);
  assert.equal(issued.recipient.reference,'Riferimento scritto');assert.equal(rendered.fields[0].label,'Collina aggiornata');
  assert.equal(document.querySelector('#report-print').disabled,false);
  assert.deepEqual(requests.map(request=>request.status),['refresh_requested','requested']);
  authChange('SIGNED_OUT',null);
  assert.equal(document.querySelector('#report-generate').disabled,true);assert.equal(document.querySelector('#report-refresh-project').disabled,true);
});
