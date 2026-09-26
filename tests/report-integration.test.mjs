import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createReportOrchestrator } from '../src/report.js';
import { createReportPreflight, updateReportPreflight } from '../src/report-preflight.js';

const polygon=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
const state={environment:'TEST',cloud:{projectId:'22222222-2222-4222-8222-222222222222',publicCode:'VO-1'},project:{localProjectName:'Progetto',fields:[{id:'f1',label:'Moscato',geometry:polygon,rowSpacingM:2.5,plantSpacingM:.9,postSpacingM:4.5,exclusions:[]}]}};
const accepted=updateReportPreflight(createReportPreflight({state}),{type:'disclaimer/set',accepted:true});

function harness({captureError=false,conflict=false}={}){
  const order=[];
  const orchestrator=createReportOrchestrator({
    sync:{async saveRevision(options){order.push(['sync',options.reason]);return conflict?{state:'conflict'}:{state:'synced',projectId:state.cloud.projectId,revisionNumber:3};}},
    async captureSatellite(){order.push(['capture']);if(captureError)throw new Error('tile error');return {dataUrl:'data:image/png;base64,abc',attribution:'Imagery © Esri'};},
    tokenFactory(){order.push(['token']);return 'ab'.repeat(32);},
    async hashToken(){order.push(['hash']);return 'cd'.repeat(32);},
    async issueReport(){order.push(['issue']);return {reportId:'11111111-1111-4111-8111-111111111111',revisionNumber:3,createdAt:'2026-09-24T10:00:00Z'};},
    buildShareUrl(){order.push(['url']);return 'https://example.test/shared-project.html?report=x&token=y';},
    qrRenderer(){order.push(['qr']);return '<svg></svg>';},
    renderer(){order.push(['render']);return '<article>ok</article>';},
    now:()=>new Date('2026-09-24T10:00:00Z')
  });
  return {order,orchestrator};
}

test('report orchestration validates, syncs, captures, issues, builds QR and renders in order',async()=>{
  const {order,orchestrator}=harness();
  const result=await orchestrator.generate({preflight:accepted,state,hostForField:()=>({})});
  assert.deepEqual(order.map(item=>item[0]),['sync','capture','token','hash','issue','url','qr','render']);
  assert.equal(result.printEnabled,true);assert.equal(result.copyEnabled,true);
  assert.equal(result.html,'<article>ok</article>');
});

test('report field location uses the geocoded polygon rather than a stale field label',async()=>{
  const {orchestrator}=harness();
  const result=await orchestrator.generate({preflight:accepted,state,fieldLocations:{f1:{municipality:'Comune esempio',province:'Provincia esempio',label:'Comune esempio'}},hostForField:()=>({})});
  assert.equal(result.model.fields[0].location.municipality,'Comune esempio');
  assert.equal(result.model.fields[0].location.province,'Provincia esempio');
});

test('conflict or satellite failure stops before immutable report insertion',async()=>{
  const conflict=harness({conflict:true});
  await assert.rejects(conflict.orchestrator.generate({preflight:accepted,state,hostForField:()=>({})}),/conflitto/i);
  assert.equal(conflict.order.some(item=>item[0]==='issue'),false);
  const capture=harness({captureError:true});
  await assert.rejects(capture.orchestrator.generate({preflight:accepted,state,hostForField:()=>({})}),/tile error/);
  assert.equal(capture.order.some(item=>item[0]==='issue'),false);
});

test('stale disclaimer and selected fields missing from the current state fail before synchronization',async()=>{
  const {order,orchestrator}=harness();
  await assert.rejects(orchestrator.generate({preflight:{...accepted,disclaimerAccepted:false},state}),/avvertenza/i);
  await assert.rejects(orchestrator.generate({preflight:{...accepted,selectedFieldIds:['missing']},state}),/campi selezionati/i);
  assert.deepEqual(order,[]);
});

test('desktop and mobile open the report popup synchronously and use the Stampa / PDF label',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const mobile=fs.readFileSync(new URL('../src/mobile-ui.js',import.meta.url),'utf8');
  assert.match(html,/id="summary-open-report"[^>]*>Stampa \/ PDF</);
  assert.match(mobile,/id="mobile-detail-pdf">Stampa \/ PDF</);
  const handler=app.match(/function openReportPopup\([^\n]*\)[\s\S]*?\n\}/)?.[0]??'';
  assert.match(handler,/globalThis\.open\(`\.\/report\.html\?handoff=/);
  assert.ok(handler.indexOf('globalThis.open')<handler.indexOf('await projectSync'));
  assert.match(handler,/reason:'report_issue'/);
  assert.match(handler,/REPORT_HANDOFF_KEY/);
  assert.match(handler,/request\.status!=='requested'/);
});

test('shared edit handoff loads only an authorized cloud project into the editor',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const backend=fs.readFileSync(new URL('../src/backend.js',import.meta.url),'utf8');
  assert.match(app,/searchParams\.get\('openProject'\)/);
  assert.match(app,/authState\.kind === 'user'/);
  assert.match(app,/backend\.loadEditableProject\(requestedProjectId\)/);
  assert.match(backend,/async loadEditableProject\(projectId\)/);
  assert.doesNotMatch(app,/claimProject\(requestedProjectId/);
});
