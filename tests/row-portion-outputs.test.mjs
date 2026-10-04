import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateProject} from '../src/project-calculator.js';
import {resolveRowPortions,updateRowPortion} from '../src/row-portions.js';
import {fieldSummaryMetrics} from '../src/project-summary.js';
import {buildAdminFieldPreviewData} from '../admin/admin-map-data.js';
import {buildSharedPrintModel,renderSharedProjectHtml} from '../src/shared-project.js';
import {buildProjectReportModel,projectToPdfModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {createReportOrchestrator} from '../src/report.js';
import {createReportPreflight,updateReportPreflight} from '../src/report-preflight.js';
import {buildCloudSnapshot,snapshotToFieldRows} from '../src/cloud-project-model.js';
import {projectPayloadToState} from '../src/backend.js';
import {prepareReportContext,readReportContext,REPORT_CONTEXT_KEY} from '../src/report-context.js';
import {summarizeRevisionChanges} from '../src/revision-summary.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/l-shaped-portions.json',import.meta.url),'utf8'));
const base={...fixture,id:'portion-field',label:'Campo anonimo',geometry:fixture.polygon,headlandWidthM:4};
let portions=resolveRowPortions(base);
// Resolver takes polygon; fixture supplies the anonymous original perimeter.
portions=updateRowPortion(portions,portions[0].id,{orientationDeg:35,rowCurvePoints:[]});
portions=updateRowPortion(portions,portions[1].id,{orientationDeg:105,rowCurvePoints:[{id:'local',position:.5,offsetM:3}],maintainRowEquidistance:false});
export const mixedField={...base,rowPortions:portions,exclusions:base.exclusions.map(item=>({...item,axis:[item.geometry[0],item.geometry[2]]}))};
const expected=calculateProject({...mixedField,polygon:mixedField.geometry});
const state={environment:'TEST',cloud:{clientProjectId:'anonymous',projectId:'local-only',publicCode:'VO-1234567'},reportOwnerId:'fixture-owner',project:{localProjectId:'anonymous',activeFieldId:base.id,fields:[mixedField]}};
const payload={fields:[mixedField],projectCode:'VO-1234567',projectId:'local-only',revisionNumber:1,createdAt:'2026-10-03T00:00:00Z'};
const agrees=metrics=>{for(const key of ['rows','rowCount','rowLinearM','simulatedPlants','headPosts','totalPosts','portions'])assert.deepEqual(metrics[key],expected[key],key);};

test('archive and Admin calculate the same physical mixed-layout rows as the editor',()=>{
  agrees(fieldSummaryMetrics(mixedField));
  const preview=buildAdminFieldPreviewData(mixedField);agrees(preview.metrics);
  assert.deepEqual(preview.exclusionRecords,mixedField.exclusions);
});

test('report capture, overview and models retain mixed layouts and totals',async()=>{
  const captured=[];
  const orchestrator=createReportOrchestrator({sync:{saveRevision:async()=>({projectId:'local-only',revisionNumber:1})},
    captureSatellite:async args=>{captured.push(args.mapModel);return {dataUrl:null,attribution:'Fixture'};},
    issueReport:async()=>({reportId:'fixture-report'}),buildShareUrl:()=> 'https://example.test/fixture',hashToken:async()=> 'fixture-hash',tokenFactory:()=> 'fixture',qrRenderer:()=>null});
  let preflight=updateReportPreflight(createReportPreflight({state}),{type:'disclaimer/set',accepted:true});
  preflight=updateReportPreflight(preflight,{type:'overview/set',enabled:true,cadastre:false});
  preflight=updateReportPreflight(preflight,{type:'disclaimer/set',accepted:true});
  const result=await orchestrator.generate({state,preflight});
  assert.deepEqual(result.model.fields[0].rows,expected.rows);
  assert.equal(result.model.fields[0].metrics.totalPosts,expected.totalPosts);
  assert.equal(captured.length,2);
  assert.equal(result.model.fields[0].layout.portions.length,2);
  assert.deepEqual(result.model.fields[0].layout.portions.map(p=>[p.orientationDeg,p.curved,p.maintainRowEquidistance]),[[35,false,true],[105,true,false]]);
  const legacy=projectToPdfModel({state:{project:mixedField},metrics:expected});
  assert.deepEqual(legacy.layout.portions,result.model.fields[0].layout.portions);
});

test('HTML report and shared card describe each actual portion instead of the legacy direction',()=>{
  const model=buildSharedPrintModel(payload);
  assert.deepEqual(model.fields[0].rows,expected.rows);
  for(const html of [renderProjectReportHtml(model),renderSharedProjectHtml({payload})]){
    assert.match(html,/35[,.]0°/);assert.match(html,/105[,.]0°/);assert.match(html,/Rettilinei/);assert.match(html,/Curvi/);
    assert.doesNotMatch(html,/86[,.]5°/);
  }
});

test('snapshot, persisted field rows, backend restore and report handoff retain one field with local layouts',()=>{
  const snapshot=buildCloudSnapshot(state,fieldSummaryMetrics);
  const rows=snapshotToFieldRows(snapshot,'local-only','fixture-owner');
  assert.equal(rows.length,1);assert.deepEqual(rows[0].design_data.rowPortions,portions);assert.deepEqual(rows[0].exclusions,mixedField.exclusions);
  const restored=projectPayloadToState({id:'local-only',field_plans:snapshot.fields,active_field_id:base.id});
  assert.deepEqual(restored.project.fields[0].rowPortions,portions);agrees(fieldSummaryMetrics(restored.project.fields[0]));
  const handoff=prepareReportContext(restored,{ownerId:'fixture-owner'}),key=REPORT_CONTEXT_KEY('fixture');
  const storage={getItem:name=>name===key?JSON.stringify(handoff):null};
  assert.deepEqual(readReportContext(storage,'fixture').project.fields[0].rowPortions,portions);
});

test('portion-only direction, curve and topology edits are recorded as layout revisions',()=>{
  const before=buildCloudSnapshot(state);
  for(const change of [p=>p.orientationDeg++,p=>p.rowCurvePoints.push({id:'extra',position:.3,offsetM:2}),p=>p.geometry[0][0][0]+=.000001]){
    const after=structuredClone(before);change(after.fields[0].rowPortions[0]);
    const summary=summarizeRevisionChanges(before,after);
    assert.deepEqual(summary.categories,['layout']);assert.deepEqual(summary.fieldIds,[base.id]);
  }
});

test('fixed-height HTML print pages retain every descriptor in a large portion layout',()=>{
 const model=buildProjectReportModel({state,getMetrics:()=>expected});
 const field=model.fields[0];
 field.layout.portions=Array.from({length:60},(_,i)=>({id:`p${i}`,label:`Porzione-${i+1} ${'Etichetta '.repeat(i%4)}`,mode:'local',orientationDeg:i,curved:i%2===0,maintainRowEquidistance:true}));
 const html=renderProjectReportHtml(model);
 for(let i=1;i<=60;i++)assert.ok(html.includes(`Porzione-${i} `));
 assert.ok((html.match(/Orientamento e curvatura per porzione/g)||[]).length>2);
 assert.ok(!html.includes('86,5°'));
 assert.equal((html.match(/\bCurvi\b/g)||[]).length,30,'wrapping must preserve whole curve-status words');
 assert.equal((html.match(/\bEquidistanza\b/g)||[]).length,60);
});

test('wide and fallback-font labels fit conservative single-line print chunks without losing characters',()=>{
 const model=buildProjectReportModel({state,getMetrics:()=>expected}),label='W'.repeat(1728)+'界'.repeat(120)+'🙂'.repeat(20);
 model.fields[0].layout.portions=[{id:'wide',label,mode:'local',orientationDeg:35,curved:false,maintainRowEquidistance:true}];
 const html=renderProjectReportHtml(model),lines=[...html.matchAll(/class="document-portion-line">([^<]*)<\/p>/g)].map(match=>match[1]);
 const budget=text=>Array.from(text).reduce((n,c)=>n+(c.codePointAt(0)<=255?1:2),0);
 for(const line of lines)assert.ok(budget(line)<=48,'chunk fits 48 conservative font-width units');
 assert.equal(lines.join('').match(/W/g)?.length,1728);
 assert.equal(lines.join('').match(/界/g)?.length,120);
 assert.equal(lines.join('').match(/🙂/gu)?.length,20);
 assert.ok((html.match(/Orientamento e curvatura per porzione/g)||[]).length>=2);
});
