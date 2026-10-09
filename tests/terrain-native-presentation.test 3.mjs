import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {createContourEnvelope} from '../src/terrain-replay.js';
import {terrainReportMetadata,terrainMeasureText} from '../src/terrain-report-summary.js';
import {rowPortionDescriptors,formatPortionDesign} from '../src/row-portion-summary.js';
import {buildProjectReportModel,projectToPdfModel} from '../src/pdf-model.js';
import {renderProjectReportHtml,renderProposalHtml} from '../src/report-template.js';
import {renderSharedProjectHtml,buildSharedPrintModel} from '../src/shared-project.js';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';
import {expandProjectFields} from '../admin/admin-model.js';
import {createAdminViews} from '../admin/admin-views.js';

// Presentation DTO, deliberately not a numerical certification fixture. The
// real envelope reader/formatters are used without replacing product methods.
function nativeFixture(overrides={}){
 const geometry=[[0,0],[10,0],[10,10],[0,10],[0,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const source={id:'presentation-dtm',label:'DTM prova',resolutionM:5,license:'CC0',citation:'Fonte prova',url:'https://example.test/dtm'};
 const model=createTerrainModel({source,grid:{width:3,height:3,origin:[500000,5000010],step:[5,-5],values:[2,2,2,1,1,1,0,0,0]}});
 const design={mode:'adapt',algorithmVersion:'terrain-contour-family-1',axes:[{axisId:'axis-1'}],followTerrain:true};
 const portion={id:'portion-1',label:'Porzione 1',mode:'inherited',geometry:[geometry],orientationDeg:45,rowCurvePoints:[],maintainRowEquidistance:true,terrainDesign:design};
 const rows=[0,1].map(i=>({axisId:'axis-1',fragmentId:`fragment-${i}`,portionId:portion.id,start:geometry[i],end:geometry[i+1],lengthM:10,surfaceLengthM:10,horizontalLengthM:9.8}));
 const metrics={terrainStatus:'applied',terrainSource:model.source,quantityBasis:'model-surface',areaM2:100,netAreaM2:null,headlandAreaM2:null,
  surfaceAreaM2:102,surfaceUsableAreaM2:99,surfaceNetAreaM2:null,surfaceHeadlandAreaM2:null,headlandAreaBasis:'unavailable-row-continuum-area',
  theoreticalPlantsBasis:'surface-after-explicit-exclusions-before-headlands',theoreticalPlants:33,coverage:{servedAreaM2:null,referenceAreaM2:99,percent:null,basis:'surface-after-explicit-exclusions-before-headlands'},
  perimeterM:40,vertexCount:4,rows,portions:[portion],rowCount:2,rowAxisCount:1,rowFragmentCount:2,rowLinearM:20,surfaceRowLinearM:20,horizontalRowLinearM:19.6,
  simulatedPlants:20,commercialPlants25:25,headPosts:4,intermediatePosts:2,totalPosts:6,...overrides};
 const field={id:'native',label:'Campo nativo',geometry,exclusions:[],rowSpacingM:3,plantSpacingM:1,headlandWidthM:1,postSpacingM:5,orientationDeg:45,rowCurvePoints:[],rowPortions:[portion]};
 field.terrain={model,applied:createContourEnvelope({project:field,model,result:metrics,portionResults:[{id:portion.id,design,rows}],validation:{valid:true}})};
 return {field,metrics};
}
function report(field,metrics){return buildProjectReportModel({state:{project:{fields:[field]}},getMetrics:()=>metrics});}
function documentOf(html){return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;}
function rowValue(document,label){const row=[...document.querySelectorAll('.report-row,.document-data-row,.shared-detail-row')].find(row=>row.querySelector('span')?.textContent===label);return row?.querySelector('strong')?.textContent;}

test('explicit null historical metrics preserve Admin field expansion, aliases and defaults',()=>{
 const rows=expandProjectFields([{id:'archive',field_plans:[{
  id:'legacy',metrics:null,gross_area_m2:120,net_area_m2:100,simulated_plants:40,
  commercial_plants_25:50,row_count:4,row_linear_m:80,head_posts:8
 }]}]);
 assert.equal(rows.length,1);const [row]=rows;
 assert.equal(row.fieldId,'legacy');assert.equal(row.areaM2,120);assert.equal(row.netAreaM2,100);
 assert.equal(row.calculatedPlants,40);assert.equal(row.commercialPlants,50);
 assert.equal(row.rowCount,4);assert.equal(row.rowLinearM,80);assert.equal(row.headPosts,8);
 assert.equal(row.intermediatePosts,0);assert.equal(row.perimeterM,0);
 assert.equal(Object.hasOwn(row,'terrainStatus'),false);assert.equal(Object.hasOwn(row,'surfaceUsableAreaM2'),false);
 const defaults=expandProjectFields([{id:'archive',field_plans:[{id:'legacy',metrics:null}]}]);
 assert.equal(defaults.length,1);assert.equal(defaults[0].areaM2,0);assert.equal(defaults[0].commercialPlants,0);
});

test('native metadata preserves optional area, basis, coverage and source without extending historical DTOs',()=>{
 const {metrics}=nativeFixture(),metadata=terrainReportMetadata(metrics);
 assert.equal(metadata.surfaceUsableAreaM2,99);assert.equal(metadata.rowAxisCount,1);assert.equal(metadata.rowFragmentCount,2);
 assert.equal(metadata.theoreticalPlantsBasis,'surface-after-explicit-exclusions-before-headlands');
 assert.deepEqual(metadata.coverage,{servedAreaM2:null,referenceAreaM2:99,percent:null,basis:'surface-after-explicit-exclusions-before-headlands'});
 assert.equal(metadata.source.license,'CC0');assert.equal(metadata.source.url,'https://example.test/dtm');assert.equal(metadata.source.citation,'Fonte prova');
 const historical=terrainReportMetadata({terrainStatus:'applied',quantityBasis:'model-surface'});
 assert.deepEqual(Object.keys(historical).sort(),['status','source','quantityBasis','surfaceRowLinearM','horizontalRowLinearM','surfaceAreaM2','surfaceNetAreaM2','surfaceHeadlandAreaM2'].sort());
});

test('new isoheight family suppresses retained manual orientation while measurement stays manual',()=>{
 const {field,metrics}=nativeFixture(),before=JSON.stringify(field);
 assert.equal(formatPortionDesign(rowPortionDescriptors(field,metrics)[0]),'Guida dal terreno');
 assert.equal(rowPortionDescriptors(field,metrics)[0].orientationDeg,null);
 assert.equal(JSON.stringify(field),before,'presentation leaves the complete saved design and provenance untouched');
 field.terrain.applied.portionResults[0].design={mode:'measure',algorithmVersion:'terrain-contour-family-1'};
 assert.equal(rowPortionDescriptors(field,metrics)[0].orientationDeg,45);
 assert.match(formatPortionDesign(rowPortionDescriptors(field,metrics)[0]),/45,0°/);
 assert.ok(before.includes('"orientationDeg":45'));
});

test('unknown native net stays absent in both report DTOs and totals while verified counts survive',()=>{
 const {field,metrics}=nativeFixture(),proposal=projectToPdfModel({state:{project:field},metrics}),model=report(field,metrics);
 assert.equal(proposal.geometry.netAreaM2,null);assert.equal(proposal.geometry.headlandAreaM2,null);
 assert.equal(model.fields[0].metrics.netAreaM2,null);assert.equal(model.summary.netAreaM2,null);
 assert.equal(model.fields[0].metrics.rowAxisCount,1);assert.equal(model.fields[0].metrics.rowFragmentCount,2);
 assert.equal(proposal.layout.simulatedPlants,20);assert.equal(model.summary.calculatedPlants,20);assert.equal(model.summary.totalPosts,6);
 assert.equal(proposal.terrain.theoreticalPlantsBasis,'surface-after-explicit-exclusions-before-headlands');
 assert.equal(proposal.terrain.source.license,'CC0');assert.equal(model.fields[0].terrain.source.url,'https://example.test/dtm');
});

test('native null nets and basis survive report, proposal and shared renderers',()=>{
 const {field,metrics}=nativeFixture(),payload={projectName:'Prova',fields:[field,structuredClone(field)],createdAt:'2026-10-05T00:00:00Z'};
 const shared=buildSharedPrintModel(payload);assert.equal(shared.summary.netAreaM2,null);
 assert.equal(shared.fields[0].terrain.source.citation,'Fonte prova');assert.equal(shared.fields[0].terrain.coverage.servedAreaM2,null);
 for(const html of [renderProposalHtml(projectToPdfModel({state:{project:field},metrics})),renderProjectReportHtml(report(field,metrics)),renderProjectReportHtml(shared),renderSharedProjectHtml({payload})]){
  const document=documentOf(html),net=rowValue(document,'Superficie netta orizzontale');
  assert.match(net,/Non disponibile|Da definire/);assert.doesNotMatch(net,/^0 m²$|100 m²/);
  const text=document.body.textContent+' '+[...document.querySelectorAll('.document-portion-line')].map(node=>node.textContent).join(' ');
  assert.match(text,/prima delle capezzagne/i);assert.match(text,/Guida dal terreno/);assert.doesNotMatch(text,/45[,.]0?°|Equidistanza/);
  assert.equal(rowValue(document,'Filari'),'1 asse · 2 tratti');
 }
});

test('invalid supplied quantities cannot appear in either report DTO',()=>{
 const {field,metrics}=nativeFixture({terrainStatus:'invalid'}),proposal=projectToPdfModel({state:{project:field},metrics}),model=report(field,metrics);
 assert.equal(proposal.geometry.areaM2,null);assert.equal(proposal.layout.simulatedPlants,null);assert.equal(proposal.plantMaterial.quantity,null);
 assert.equal(model.fields[0].metrics.rowCount,null);assert.equal(model.fields[0].metrics.commercialPlants,null);assert.equal(model.summary.calculatedPlants,null);
});

test('shared native surface and measured lengths keep unknown null distinct from genuine zero',()=>{
 for(const value of [null,0]){
  const {field}=nativeFixture({quantityBasis:'certified-flat-legacy',surfaceAreaM2:value,surfaceNetAreaM2:value,surfaceRowLinearM:value,horizontalRowLinearM:value});
  const document=documentOf(renderSharedProjectHtml({payload:{fields:[field],createdAt:'2026-10-05T00:00:00Z'}}));
  for(const [label,unit] of [['Superficie sul terreno','m²'],['Superficie netta sul terreno','m²'],['Metri lineari sul terreno','m'],['Metri lineari orizzontali','m']]){
   assert.equal(rowValue(document,label),`${value===null?'Non disponibile':'0'} ${unit}`);
  }
 }
});

test('served area never replaces theoretical density and known zero areas remain visible',()=>{
 const {field,metrics}=nativeFixture({netAreaM2:0,headlandAreaM2:0,surfaceNetAreaM2:0,surfaceHeadlandAreaM2:0,coverage:{servedAreaM2:12,referenceAreaM2:99,percent:12.12,basis:'surface-after-explicit-exclusions-before-headlands'}});
 const proposal=projectToPdfModel({state:{project:field},metrics});assert.equal(proposal.layout.theoreticalPlants,33);
 assert.equal(terrainReportMetadata(metrics).coverage?.servedAreaM2,12);
 assert.equal(rowValue(documentOf(renderProposalHtml(proposal)),'Superficie netta orizzontale'),'0 m²');
 assert.match(terrainMeasureText(terrainReportMetadata({...metrics,theoreticalPlantsBasis:'certified-flat-legacy-planar-density',quantityBasis:'certified-flat-legacy'})),/densità.*conservat/i);
});

test('admin native DTO retains null net and new basis in real details',()=>{
 const {field,metrics}=nativeFixture(),project={id:'p',name:'Prova',field_plans:[{...field,terrain:null,metrics}]};
 const [row]=expandProjectFields([project]);assert.equal(row.netAreaM2,null);assert.equal(row.surfaceUsableAreaM2,99);assert.equal(row.rowAxisCount,1);
 // Minimal view host: Linkedom does not implement HTMLFormElement.elements.
 // The unrelated location form is absent, and no product method is replaced.
 const {document}=parseHTML('<html><body><table><thead id="admin-table-head"></thead><tbody id="admin-table-body"></tbody></table><section id="admin-detail"><h2 id="detail-title"></h2><div id="detail-grid"></div><div id="detail-children"></div></section></body></html>');
 const views=createAdminViews({document});views.renderSection('fields',[row]);views.renderDetail('fields',row);
 assert.match(document.querySelector('#detail-grid').textContent,/prima delle capezzagne/i);
 assert.match(document.querySelector('#detail-grid').textContent,/1 asse · 2 tratti/);
});

test('native PDF retains unavailable nets and density basis on existing data page',async()=>{
 const {field,metrics}=nativeFixture(),require=createRequire(import.meta.url),pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
 const pdfjs=await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdfjs-dist/legacy/build/pdf.mjs');
 const bytes=await buildProjectPdfBytes(report(field,metrics),{pdfLib,assetLoader:async()=>null});
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 try{
  assert.equal(doc.numPages,4);const items=(await(await doc.getPage(3)).getTextContent()).items;
  const text=items.map(item=>item.str).join(' ');assert.match(text,/prima delle capezzagne/i);assert.match(text,/Guida dal terreno/);
  const netLabels=items.filter(item=>/netta/.test(item.str));
  for(const label of netLabels){const values=items.filter(item=>Math.abs(item.transform[5]-label.transform[5])<1&&item.transform[4]>label.transform[4]);assert.ok(values.some(item=>item.str.includes('Non disponibile')));}
  assert.doesNotMatch(text,/45[,.]0?°|Equidistanza/);assert.match(text,/Barbatelle calcolate.*20/);
  assert.match(text,/1 asse · 2 tratti/);
 }finally{await doc.destroy();}
});
