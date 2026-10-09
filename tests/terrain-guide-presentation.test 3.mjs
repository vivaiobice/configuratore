import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import {fixture} from './helpers/terrain-fixture.mjs';
import {buildTerrainProposal} from '../src/terrain-design.js';
import {toUTM} from '../src/coordinate-system.js';
import {resolveRowPortions} from '../src/row-portions.js';
import {fieldSummaryMetrics} from '../src/project-summary.js';
import {rowPortionDescriptors,hasPortionDesign,formatPortionDesign} from '../src/row-portion-summary.js';
import {buildProjectReportModel,projectToPdfModel} from '../src/pdf-model.js';
import {renderProjectReportHtml,renderProposalHtml} from '../src/report-template.js';
import {renderSharedProjectHtml,buildSharedPrintModel} from '../src/shared-project.js';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';
import {createMobileUI} from '../src/mobile-ui.js';

const apply=(project,proposal)=>({...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain});
async function automaticField(){
 const {project,model}=await fixture(x=>x/5,{angle:45});
 const proposal=buildTerrainProposal({project,model,followTerrain:true});assert.equal(proposal.ok,true,proposal.message);
 return {field:{id:'automatic',label:'Campo automatico',...apply(project,proposal)},proposal,model};
}
function report(field){return buildProjectReportModel({state:{project:{fields:[field]}},getMetrics:fieldSummaryMetrics});}
function htmlDocument(html){return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;}

test('automatic applied guide describes actual terrain provenance instead of the 45-degree reference',async()=>{
 const {field,proposal}=await automaticField(),before=JSON.stringify(field),metrics=fieldSummaryMetrics(field);
 assert.equal(field.orientationDeg,45);assert.equal(proposal.rowPortions[0].orientationDeg,45);
 assert.ok(Math.abs(proposal.terrain.applied.portionResults[0].design.orientationRad)<1e-12);
 for(const row of metrics.rows){const a=toUTM(row.start),b=toUTM(row.end);assert.ok(Math.abs(a[0]-b[0])<1e-6,'physical rows follow the north-south terrain guide');}
 const descriptors=rowPortionDescriptors(field,metrics);
 assert.equal(descriptors.length,1);assert.equal(descriptors[0].mode,'inherited');
 assert.equal(descriptors[0].orientationDeg,null);assert.equal(descriptors[0].curved,null);
 assert.equal(hasPortionDesign({portions:descriptors}),true,'one inherited automatic guide needs its own description');
 assert.equal(formatPortionDesign(descriptors[0]),'Guida dal terreno');
 assert.equal(formatPortionDesign(descriptors[0],{includeEquidistance:false}),'Guida dal terreno');
 assert.equal(report(field).fields[0].layout.orientationDeg,null);
 assert.equal(projectToPdfModel({state:{project:field},metrics}).layout.orientationDeg,null);
 assert.equal(JSON.stringify(field),before,'descriptions must not rewrite saved control/reference inputs');
});

test('automatic guide reaches report, proposal, shared print and shared HTML without straightness or reference angle',async()=>{
 const {field}=await automaticField(),metrics=fieldSummaryMetrics(field),payload={projectName:'Guida automatica',fields:[field],createdAt:'2026-10-04T00:00:00Z'};
 const print=buildSharedPrintModel(payload);assert.equal(print.fields[0].layout.orientationDeg,null);
 for(const html of [renderProjectReportHtml(report(field)),renderProjectReportHtml(print),renderProposalHtml(projectToPdfModel({state:{project:field},metrics})),renderSharedProjectHtml({payload})]){
  const document=htmlDocument(html),text=document.body.textContent+' '+[...document.querySelectorAll('.document-portion-line')].map(node=>node.textContent).join(' ');
  assert.match(text,/Guida dal terreno/);assert.doesNotMatch(text,/45[,.]0?°|Rettilinei|Equidistanza/);
 }
});

test('native PDF prints the applied automatic guide on the existing geometry page',async()=>{
 const {field}=await automaticField(),require=createRequire(import.meta.url),pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
 const pdfjs=await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdfjs-dist/legacy/build/pdf.mjs');
 const bytes=await buildProjectPdfBytes(report(field),{pdfLib,assetLoader:async()=>null});
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 assert.equal(doc.numPages,4);
 const items=(await (await doc.getPage(3)).getTextContent()).items,text=items.map(item=>item.str).join(' ');
 assert.match(text,/Guida dal terreno/);assert.doesNotMatch(text,/45[,.]0?°|Rettilinei|Curvatura|Equidistanza/);
 const guide=items.find(item=>item.str.includes('Guida dal'));assert.ok(guide.transform[5]>65&&guide.transform[5]<740);
 await doc.destroy();
});

test('mobile field detail describes the applied automatic guide through the shared descriptor',async()=>{
 const {field}=await automaticField(),{document}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 const savedDocument=globalThis.document,savedWindow=globalThis.window;globalThis.document=document;globalThis.window={};
 try{
  const ui=createMobileUI({isMobile:()=>true,getMap:()=>null,getField:()=>field,getFields:()=>[field],getMetrics:fieldSummaryMetrics,stopTools(){},resizeMap(){},focusAll(){},focusField(){}});
  ui.navigate('detail');const detail=document.querySelector('#mobile-field-detail').textContent;
  assert.match(detail,/Guida dal terreno/);assert.doesNotMatch(detail,/45[,.]0?°|Rettilinei|Equidistanza/);
 }finally{globalThis.document=savedDocument;globalThis.window=savedWindow;}
});

test('recalculated automatic guide remains descriptive when the latest action follows only the other portion',async()=>{
 const {project,model}=await fixture(x=>x/8,{angle:45,exclusions:[[[9.25,0],[10.75,0],[10.75,40],[9.25,40],[9.25,0]]]});
 project.rowPortions=resolveRowPortions({...project,polygon:project.geometry}).map(p=>({...p,mode:'local'}));
 const selected=project.rowPortions[0].id,other=project.rowPortions[1].id;
 const first=buildTerrainProposal({project,model,portionId:selected,followTerrain:true});assert.equal(first.ok,true,first.message);
 const changed={...apply(project,first),rowSpacingM:4};
 const again=buildTerrainProposal({project:changed,model,portionId:other,followTerrain:true,recomputeAll:true});assert.equal(again.ok,true,again.message);
 const retained=again.terrain.applied.portionResults.find(p=>p.id===selected).design;
 assert.equal(retained.followTerrain,false);assert.equal(retained.guide,'native-contour-distance-family');
 assert.deepEqual(retained.guideCoordinates,first.terrain.applied.portionResults.find(p=>p.id===selected).design.guideCoordinates);
 const field=apply(changed,again),descriptors=rowPortionDescriptors(field,fieldSummaryMetrics(field));
 assert.equal(formatPortionDesign(descriptors.find(p=>p.id===selected)),'Guida dal terreno');
 assert.equal(descriptors.find(p=>p.id===selected).orientationDeg,null);
 const text=htmlDocument(renderProjectReportHtml(report(field))).body.textContent;assert.doesNotMatch(text,/45[,.]0?°|Rettilinei|Equidistanza/);
});

test('local terrain action preserves the manual guide reference and its ordinary description',async()=>{
 const {project,model}=await fixture(x=>x/8,{angle:45,exclusions:[[[9.25,0],[10.75,0],[10.75,40],[9.25,40],[9.25,0]]]});
 project.rowPortions=resolveRowPortions({...project,polygon:project.geometry}).map(p=>({...p,mode:'local'}));
 const saved=JSON.stringify(project),selected=project.rowPortions[0].id,other=project.rowPortions[1].id;
 const proposal=buildTerrainProposal({project,model,portionId:selected,followTerrain:true});assert.equal(proposal.ok,true,proposal.message);
 const descriptors=rowPortionDescriptors(apply(project,proposal),proposal.result);
 assert.equal(formatPortionDesign(descriptors.find(p=>p.id===selected)),'Guida dal terreno');
 const manual=descriptors.find(p=>p.id===other);assert.equal(manual.orientationDeg,45);assert.equal(manual.curved,false);
 assert.equal(formatPortionDesign(manual),'45,0° · Rettilinei · Equidistanza sì');
 assert.equal(JSON.stringify(project),saved);
});

test('manual applied terrain retains ordinary curve descriptors and pending controls never claim an applied guide',async()=>{
 const {project,model}=await fixture(x=>x/8,{angle:45});project.rowCurvePoints=[{id:'bend',position:.5,offsetM:2}];
 const proposal=buildTerrainProposal({project,model,followTerrain:false});assert.equal(proposal.ok,true,proposal.message);
 const field=apply(project,proposal),manual=rowPortionDescriptors(field,fieldSummaryMetrics(field))[0];
 assert.equal(manual.orientationDeg,45);assert.equal(manual.curved,true);assert.equal(formatPortionDesign(manual),'45,0° · Curvi · Equidistanza sì');
 const {field:automatic}=await automaticField();const pending={...automatic,terrain:null},pendingDescriptor=rowPortionDescriptors(pending,fieldSummaryMetrics(pending))[0];
 assert.equal(pendingDescriptor.orientationDeg,45);assert.equal(pendingDescriptor.curved,false);assert.equal(formatPortionDesign(pendingDescriptor),'45,0° · Rettilinei · Equidistanza sì');
});
