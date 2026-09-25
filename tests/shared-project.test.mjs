import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import { loadSharedProject, renderSharedProjectHtml, sharedPrintAllowed, bootSharedProjectPage, buildSharedPrintModel, renderSharedPrintHtml, SHARED_UNAVAILABLE_MESSAGE } from '../src/shared-project.js';

const reportId='11111111-1111-4111-8111-111111111111';
const token='ab'.repeat(32);
const url=`https://vivaiobice.github.io/shared-project.html?report=${reportId}&token=${token}`;
const polygon=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
const payload={reportId,projectId:'22222222-2222-4222-8222-222222222222',projectName:'Progetto Alba',revisionNumber:2,currentRevisionNumber:4,createdAt:'2026-09-24T10:00:00Z',fields:[{id:'f1',label:'Moscato',geometry:polygon},{id:'f2',label:'Nebbiolo',geometry:polygon}]};

test('invalid, missing and revoked shared links resolve to the same neutral result',async()=>{
  const missing=await loadSharedProject({url:'https://example.test/shared-project.html',backend:{}});
  const revoked=await loadSharedProject({url,backend:{async getSharedProjectReport(){return null;}}});
  const failed=await loadSharedProject({url,backend:{async getSharedProjectReport(){throw new Error('database detail');}}});
  assert.deepEqual([missing.message,revoked.message,failed.message],[SHARED_UNAVAILABLE_MESSAGE,SHARED_UNAVAILABLE_MESSAGE,SHARED_UNAVAILABLE_MESSAGE]);
  assert.ok([missing,revoked,failed].every(result=>result.state==='unavailable'));
});

test('shared view renders only sanitized payload fields and Guest has no edit control',()=>{
  const html=renderSharedProjectHtml({payload:{...payload,fields:[payload.fields[0]]},canEdit:false});
  assert.match(html,/Moscato/);
  assert.doesNotMatch(html,/Nebbiolo/);
  assert.doesNotMatch(html,/Apri nel configuratore/);
  assert.doesNotMatch(html,/recipient|ownerUser|e-mail cliente/i);
  assert.match(html,/studio preliminare ed esemplificativo/i);
});

test('authorized owner or Admin gets edit handoff and version divergence is explicit',()=>{
  const html=renderSharedProjectHtml({payload,canEdit:true});
  assert.match(html,/Apri nel configuratore/);
  assert.match(html,/openProject=22222222-2222-4222-8222-222222222222/);
  assert.match(html,/Versione documento: 2/);
  assert.match(html,/Versione attuale: 4/);
});

test('shared printing requires both a registered session and disclaimer acceptance',()=>{
  assert.equal(sharedPrintAllowed({accepted:false,payload,authenticated:true}),false);
  assert.equal(sharedPrintAllowed({accepted:true,payload,authenticated:false}),false);
  assert.equal(sharedPrintAllowed({accepted:true,payload,authenticated:true}),true);
  assert.equal(sharedPrintAllowed({accepted:true,payload:null,authenticated:true}),false);
});

test('a human project code loads the latest public read-only revision',async()=>{
  const backend={
    async getPublicProjectByCode(code){assert.equal(code,'VO-1234567');return {...payload,projectCode:code};},
    async canEditProject(){return false;}
  };
  const result=await loadSharedProject({url:'https://example.test/shared-project.html?code=VO-1234567',backend});
  assert.equal(result.state,'ready');
  assert.equal(result.canEdit,false);
  assert.equal(result.payload.projectCode,'VO-1234567');
  assert.equal(result.payload.fields.length,2);
  const html=renderSharedProjectHtml({payload:result.payload});
  assert.match(html,/2 campi salvati/);
  assert.equal((html.match(/class="shared-field report-page"/g)||[]).length,2);
});

test('a saved field with unfinished perimeter still appears in the public view',()=>{
  const html=renderSharedProjectHtml({payload:{...payload,fields:[payload.fields[0],{id:'draft-field',label:'Campo aggiunto',geometry:null}]}});
  assert.match(html,/Campo aggiunto/);
  assert.match(html,/2 campi salvati/);
});

test('printing from a public code builds the same report model with every saved field',()=>{
  const model=buildSharedPrintModel({...payload,projectCode:'VO-1234567'},
    {displayName:'Mario Rossi',email:'mario@example.it'},{});
  assert.equal(model.fields.length,2);
  assert.equal(model.project.code,'VO-1234567');
  assert.equal(model.recipient.firstName,'Mario');
  assert.equal(model.recipient.lastName,'Rossi');
  assert.equal(model.summary.fieldCount,2);
  const printHtml=renderSharedPrintHtml(model);
  assert.match(printHtml,/document-summary-grid/);
  assert.equal((printHtml.match(/<h2>Mappa satellitare<\/h2>/g)||[]).length,2);
});

test('the code-loaded preview uses the same printable document layout for every saved field',async()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../shared-project.html',import.meta.url),'utf8'));
  let captures=0;
  const result=await bootSharedProjectPage({
    documentRef:document,
    locationHref:'https://example.test/shared-project.html?code=VO-1234567',
    backend:{
      async getPublicProjectByCode(){return {...payload,projectCode:'VO-1234567'};},
      async canEditProject(){return false;}
    },
    authService:{getState:()=>({kind:'guest'}),subscribe(callback){callback({kind:'guest'});}},
    captureSatellite:async()=>{captures++;return {dataUrl:'data:image/png;base64,a',attribution:'Imagery © Esri'};}
  });
  assert.equal(result.state,'ready');
  assert.equal(captures,2);
  const root=document.querySelector('#shared-project-root');
  assert.ok(root.querySelector('.report-document'));
  assert.ok(root.querySelector('.document-cover'));
  assert.ok(root.querySelector('.document-summary-grid'));
  assert.equal(root.querySelectorAll('.document-field-map').length,2);
  assert.equal(root.querySelectorAll('.document-field-data').length,2);
  assert.match(root.textContent,/Moscato/);
  assert.match(root.textContent,/Nebbiolo/);
});

test('shared shell is read-only and provides disclaimer-gated print controls',()=>{
  const html=fs.readFileSync(new URL('../shared-project.html',import.meta.url),'utf8');
  assert.match(html,/id="shared-project-root"/);
  assert.match(html,/id="shared-disclaimer-accept"[^>]*type="checkbox"/);
  assert.match(html,/id="shared-print"[^>]*disabled/);
  assert.match(html,/id="shared-auth-login"/);
  assert.match(html,/id="shared-auth-register"/);
  assert.doesNotMatch(html,/contenteditable|name="geometry"|Salva progetto/i);
});

test('Guest print opens login on the same project; registered print requires disclaimer',async()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../shared-project.html',import.meta.url),'utf8'));
  let user={kind:'guest'},onChange=()=>{},prints=0;
  const authService={getState:()=>user,subscribe(callback){onChange=callback;callback(user);},async login(){user={kind:'user'};onChange(user);}};
  const backend={async getPublicProjectByCode(){return {...payload,projectCode:'VO-1234567'};},async canEditProject(){return false;}};
  const oldPrint=globalThis.print;globalThis.print=()=>{throw new Error('La vista condivisa non è il documento da stampare');};
  for(const form of document.querySelectorAll('#shared-auth-dialog form'))Object.defineProperty(form,'elements',{value:{namedItem:name=>form.querySelector(`[name="${name}"]`)}});
  try{
    await bootSharedProjectPage({documentRef:document,locationHref:'https://example.test/shared-project.html?code=VO-1234567',backend,authService,
      captureSatellite:async()=>({dataUrl:'data:image/png;base64,a',attribution:'Imagery © Esri'}),
      printDocument:async model=>{prints++;assert.equal(model.fields.length,2);}});
    const print=document.querySelector('#shared-print');
    assert.equal(print.disabled,false);
    print.click();
    assert.equal(document.querySelector('#shared-auth-dialog').hidden,false);
    assert.equal(prints,0);
    document.querySelector('#shared-auth-login [name="identifier"]').value='utente@example.it';
    document.querySelector('#shared-auth-login [name="password"]').value='password-valida';
    document.querySelector('#shared-auth-login').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(document.querySelector('#shared-auth-dialog').hidden,true);
    print.click();assert.equal(prints,0);
    const accept=document.querySelector('#shared-disclaimer-accept');accept.checked=true;
    print.click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(prints,1);
  }finally{globalThis.print=oldPrint;}
});

test('shared view preserves curved rows generated from stored control points',()=>{
  const curvedField={...payload.fields[0],rowSpacingM:250,plantSpacingM:1,orientationDeg:0,rowCurvePoints:[{position:.35,offsetM:100},{position:.7,offsetM:-100}]};
  const html=renderSharedProjectHtml({payload:{...payload,fields:[curvedField]},canEdit:false});
  assert.match(html,/<polyline class="vine-row"/);
});

test('public code renders a full per-field report with dimensions, materials, posts and notes while remaining read-only',()=>{
  const field={...payload.fields[0],grapeVariety:'Vitigno A',cloneSelection:'Selezione 1',rootstock:'Portainnesto A',plantHeightCm:60,campaignYear:2027,
    rowSpacingM:2.5,plantSpacingM:.9,postSpacingM:4.5,headlandWidthM:6,orientationDeg:38.5,mechanizedHarvest:true,
    projectContextType:'new_planting',projectContextNote:'Nota generica <script>',materialRequestNote:'Da verificare'};
  const html=renderSharedProjectHtml({payload:{...payload,fields:[field],projectCode:'VO-1234567'},canEdit:false});
  for(const label of ['Superficie lorda','Perimetro','Distanza filari','Orientamento filari','Capezzagna','Pali di testa','Pali intermedi','Clone / selezione','Altezza barbatella','Annata impianto','Vendemmia meccanizzata','Inquadramento e note'])assert.match(html,new RegExp(label));
  assert.match(html,/60 cm/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/Apri nel configuratore/);
  assert.match(html,/class="shared-field-data report-page"/);
});
