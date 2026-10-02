import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldSummaryMetrics} from '../src/project-summary.js';
import {buildSharedPrintModel} from '../src/shared-project.js';
import {createReportOrchestrator} from '../src/report.js';
import {createReportPreflight,updateReportPreflight} from '../src/report-preflight.js';

const lonM=1/(111320*Math.cos(44*Math.PI/180)),latM=1/110540;
const polygon=[[8,44],[8+60*lonM,44],[8+60*lonM,44+100*latM],[8,44+100*latM],[8,44]];
const corridor=[[-2,49.25],[62,49.25],[62,50.75],[-2,50.75],[-2,49.25]].map(([x,y])=>[8+x*lonM,44+y*latM]);
const field={id:'f1',label:'Barbera',geometry:polygon,rowSpacingM:5,plantSpacingM:1,postSpacingM:4.5,orientationDeg:0,
 exclusions:[{id:'pass',type:'linear',widthM:1.5,geometry:corridor}],rowCurvePoints:[{id:'one',position:.25,offsetM:5},{id:'two',position:.75,offsetM:-5}]};
const assertSeparated=rows=>{assert.ok(rows.length>0);assert.equal(new Set(rows.map(row=>row.segmentId).filter(Boolean)).size,2,'both independently curved sections must reach this calculation');};

test('project card summaries preserve transverse passage metadata for independent curves',()=>{
 assertSeparated(fieldSummaryMetrics(field).rows);
});

test('shared printable documents calculate the same independently curved sections',()=>{
 const model=buildSharedPrintModel({projectName:'Collina',projectCode:'VO-1234567',fields:[field]},{});
 assertSeparated(model.fields[0].rows);
});

test('issued report models preserve passage metadata through field metrics and map capture',async()=>{
 const state={cloud:{projectId:'22222222-2222-4222-8222-222222222222'},project:{localProjectName:'Collina',fields:[field]}};
 const preflight=updateReportPreflight(createReportPreflight({state}),{type:'disclaimer/set',accepted:true});
 const orchestrator=createReportOrchestrator({sync:{saveRevision:async()=>({projectId:state.cloud.projectId,revisionNumber:1})},
  captureSatellite:async()=>({dataUrl:'data:image/png;base64,YQ==',attribution:'Fixture'}),
  tokenFactory:()=> 'ab'.repeat(32),hashToken:async()=> 'cd'.repeat(32),
  issueReport:async()=>({id:'11111111-1111-4111-8111-111111111111'}),buildShareUrl:()=> 'https://example.test/report',qrRenderer:()=>'',renderer:()=>''});
 const generated=await orchestrator.generate({preflight,state});
 assertSeparated(generated.model.fields[0].rows);
});
