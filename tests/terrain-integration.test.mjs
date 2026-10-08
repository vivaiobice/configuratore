import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldSummaryMetrics,projectSummaryText} from '../src/project-summary.js';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {renderSharedProjectHtml,buildSharedPrintModel} from '../src/shared-project.js';
import {buildAdminFieldPreviewData} from '../admin/admin-map-data.js';
import {expandProjectFields,buildAdminProjects,buildAdminClients,summarizeAdministration} from '../admin/admin-model.js';
import {summarizeRevisionChanges} from '../src/revision-summary.js';
const field={id:'terrain-field',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,terrain:{model:{},applied:{}}};
const state={project:{localProjectId:'p',fields:[field]}};
test('invalid applied terrain is explicitly unavailable in every field caller',()=>{
 for(const metrics of [fieldSummaryMetrics(field),buildAdminFieldPreviewData(field).metrics]){
  assert.equal(metrics.terrainStatus,'invalid');assert.equal(metrics.rowLinearM,null);assert.equal(metrics.simulatedPlants,null);
 }
 assert.match(projectSummaryText(state.project),/terreno.*non disponib/i);
 const report=buildProjectReportModel({state,getMetrics:fieldSummaryMetrics});
 assert.equal(report.fields[0].metrics.rowLinearM,null);assert.equal(report.summary.commercialPlants,null);
 assert.match(renderProjectReportHtml(report),/terreno.*non disponib/i);
 const payload={projectName:'Replay',fields:[field],createdAt:'2026-10-04T00:00:00Z'};
 assert.match(renderSharedProjectHtml({payload}),/terreno.*non disponib/i);
 assert.equal(buildSharedPrintModel(payload).fields[0].metrics.rowLinearM,null);
 const admin=expandProjectFields([{id:'p',field_plans:[{...field,metrics:{simulatedPlants:999}}]}]);
 assert.equal(admin[0].calculatedPlants,null);assert.equal(admin[0].terrainStatus,'invalid');
 const projects=[{id:'p',field_plans:[field]}];
 assert.equal(buildAdminProjects(projects)[0].commercialPlants,null);
 assert.equal(buildAdminClients(projects)[0].commercialPlants,null);
 assert.equal(summarizeAdministration(projects).plantsToPlant,null);
});
test('terrain application appears in revision change labels',()=>{
 const before={fields:[{...field,terrain:undefined}]};
 const change=summarizeRevisionChanges(before,{fields:[field]});
 assert.deepEqual(change.categories,['terrain']);assert.match(change.label,/terreno/i);
});

test('real applied proposal replays identical quantities across summary, Admin and shared print',async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');
 const {field,result}=appliedTerrainField();
 assert.deepEqual(fieldSummaryMetrics(field),result);
 assert.deepEqual(buildAdminFieldPreviewData(field).metrics,result);
 const admin=expandProjectFields([{id:'p',field_plans:[{...field,metrics:{rowLinearM:123}}]}])[0];
 assert.equal(admin.rowLinearM,result.rowLinearM);assert.equal(admin.calculatedPlants,result.simulatedPlants);
 const payload={projectName:'Frozen',fields:[field],createdAt:'2026-10-04T00:00:00Z'};
 const shared=buildSharedPrintModel(payload).fields[0];
 assert.equal(shared.metrics.rowLinearM,result.rowLinearM);assert.equal(shared.metrics.surfaceAreaM2,result.surfaceAreaM2);
 assert.equal(shared.metrics.horizontalRowLinearM,result.horizontalRowLinearM);
 assert.equal(shared.terrain.source.label,field.terrain.model.source.label);
 const html=renderSharedProjectHtml({payload});assert.match(html,/Lunghezze sul terreno/);assert.match(html,/DTM anonimo/);assert.match(html,/Epoca 2019/);assert.match(html,/Superficie netta orizzontale/);assert.match(html,/Superficie netta sul terreno/);
 assert.match(renderProjectReportHtml(buildSharedPrintModel(payload)),/Metri lineari orizzontali/);
 const {projectToPdfModel}=await import('../src/pdf-model.js');
 const proposal=projectToPdfModel({state:{project:field},metrics:result});
 assert.equal(proposal.terrain.source.label,'DTM anonimo');
});

test('exact manual restore replays original rows and planar quantities across field callers',async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');
 const {calculateProject}=await import('../src/project-calculator.js');
 const {attachTerrainRestore,buildTerrainRestoreProposal}=await import('../src/terrain-history.js');
 const {field,proposal}=appliedTerrainField();
 const before={...structuredClone(field),rowPortions:[]};delete before.terrain;
 const manual=calculateProject({...before,polygon:before.geometry,terrain:null});
 const attached=attachTerrainRestore({project:before,proposal,operationId:'integration'});
 const current={...before,rowPortions:attached.rowPortions,terrain:attached.terrain};
 const restore=buildTerrainRestoreProposal({project:current,portionId:attached.rowPortions[0].id,model:field.terrain.model});assert.equal(restore.ok,true,restore.message);
 const restored={...current,...restore.projectPatch,rowPortions:restore.rowPortions,terrain:restore.terrain};
 const payload={projectName:'Restored',fields:[restored],createdAt:'2026-10-04T00:00:00Z'};
 const metrics=[fieldSummaryMetrics(restored),buildAdminFieldPreviewData(restored).metrics];
 for(const result of metrics){assert.equal(result.terrainStatus,'applied');assert.equal(result.quantityBasis,'legacy-planar');assert.deepEqual(result.rows,manual.rows);for(const key of ['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])assert.equal(result[key],manual[key],key);}
 for(const report of [buildSharedPrintModel(payload).fields[0],buildProjectReportModel({state:{project:{fields:[restored]}},getMetrics:fieldSummaryMetrics}).fields[0]]){
  assert.deepEqual(report.rows,manual.rows);assert.equal(report.metrics.rowLinearM,manual.rowLinearM);assert.equal(report.metrics.calculatedPlants,manual.simulatedPlants);assert.equal(report.metrics.commercialPlants,manual.commercialPlants25);assert.equal(report.metrics.totalPosts,manual.totalPosts);assert.equal(report.terrain.quantityBasis,'legacy-planar');
 }
 assert.equal(restored.terrain.history.entries.length,0);
});
test('real report orchestrator uses applied rows and measures without external terrain fetch',async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');
 const {createReportOrchestrator}=await import('../src/report.js');
 const {createReportPreflight,updateReportPreflight}=await import('../src/report-preflight.js');
 const {field,result}=appliedTerrainField();const state={cloud:{projectId:'p'},project:{fields:[field]}};
 const preflight=updateReportPreflight(createReportPreflight({state}),{type:'disclaimer/set',accepted:true});
 let capturedRows;
 const orchestrator=createReportOrchestrator({sync:{saveRevision:async()=>({projectId:'p',revisionNumber:1})},captureSatellite:async({mapModel})=>{capturedRows=mapModel.rows;return {dataUrl:null};},tokenFactory:()=> 'a'.repeat(64),hashToken:async()=> 'hash',issueReport:async()=>({reportId:'r'}),buildShareUrl:()=> 'https://example.test/report',qrRenderer:()=> '<svg/>'});
 const issued=await orchestrator.generate({state,preflight});
 assert.equal(capturedRows.length,result.rows.length);assert.equal(issued.model.fields[0].metrics.rowLinearM,result.rowLinearM);
 assert.match(issued.html,/Lunghezze sul terreno/);
});

test('native PDF retains compact source and separates horizontal and surface measures',async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');
 const {buildProjectPdfBytes}=await import('../src/report-pdf-download.js');
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {execFileSync}=await import('node:child_process');
 const dir=await mkdtemp(tmpdir()+'/terrain-pdf-');
 try{
  const {field}=appliedTerrainField();const model=buildProjectReportModel({state:{project:{fields:[field]}},getMetrics:fieldSummaryMetrics});
  const bytes=await buildProjectPdfBytes(model,{pdfLib,assetLoader:async()=>null});await writeFile(dir+'/terrain.pdf',bytes);
  const text=execFileSync('pdftotext',['-layout',dir+'/terrain.pdf','-'],{encoding:'utf8'});
  assert.match(text,/Lunghezze sul terreno.*DTM anonimo.*5 m.*Epoca 2019/);
  assert.match(text,/Sup\. lorda orizzontale/);assert.match(text,/Superficie sul terreno/);assert.match(text,/Metri orizzontali/);
  const invalidModel=buildProjectReportModel({state:{project:{fields:[{...field,id:'invalid',plantSpacingM:2},field]}},getMetrics:fieldSummaryMetrics});
  await writeFile(dir+'/invalid.pdf',await buildProjectPdfBytes(invalidModel,{pdfLib,assetLoader:async()=>null}));
  const invalid=execFileSync('pdftotext',['-layout',dir+'/invalid.pdf','-'],{encoding:'utf8'});
  assert.match(invalid,/Terreno non disponibile/);assert.match(invalid,/Non disponibile/);
  assert.equal(invalidModel.summary.commercialPlants,null);
  assert.doesNotMatch(invalid,/Quantità commerciale\s+0\b/);assert.doesNotMatch(invalid,/\b0 m²/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('unapplied report retains approved 1.2.6 metrics and released 1.3.2 HTML',async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const fixture=JSON.parse(await readFile(new URL('./fixtures/terrain-planar-report-parity.json',import.meta.url),'utf8'));
 const model=buildProjectReportModel({state:fixture.state,report:fixture.report,getMetrics:fieldSummaryMetrics});
 assert.deepEqual(model,fixture.model);
 const released=JSON.parse(await readFile(new URL('./fixtures/terrain-v132-report-parity.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(renderProjectReportHtml(model)).digest('hex'),released.htmlSha256);
});

test('removing applied field geometry keeps explicit unavailable terrain in archive summaries',()=>{
 const missing={...field,geometry:null};const metrics=fieldSummaryMetrics(missing);
 assert.equal(metrics.terrainStatus,'invalid');assert.equal(metrics.simulatedPlants,null);
 assert.match(projectSummaryText({fields:[missing]}),/Terreno non disponibile/);
 assert.equal(expandProjectFields([{id:'p',field_plans:[missing]}])[0].calculatedPlants,null);
});

test('unapplied shared HTML preserves approved 1.2.6 formatting including nullable headland',async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const fixture=JSON.parse(await readFile(new URL('./fixtures/terrain-planar-shared-parity.json',import.meta.url),'utf8'));
 assert.equal(fixture.payload.fields[0].headlandWidthM,null);
 const previousTZ=process.env.TZ;
 try{
  // Approved 1.2.6 HTML fixture was captured at UTC+03.
  process.env.TZ='Etc/GMT-3';
  assert.equal(createHash('sha256').update(renderSharedProjectHtml({payload:fixture.payload})).digest('hex'),fixture.htmlSha256);
 }finally{
  if(previousTZ===undefined)delete process.env.TZ;
  else process.env.TZ=previousTZ;
 }
});

for(const postSpacingM of [null,0])test(`real applied proposal with post spacing ${postSpacingM} replays unchanged in every field caller`,async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');
 const {calculateProject}=await import('../src/project-calculator.js');
 const {field,result}=appliedTerrainField(undefined,{postSpacingM});
 assert.deepEqual(calculateProject({...field,polygon:field.geometry}),result);
 assert.deepEqual(fieldSummaryMetrics(field),result);
 assert.deepEqual(buildAdminFieldPreviewData(field).metrics,result);
 const admin=expandProjectFields([{id:'p',field_plans:[field]}])[0];
 assert.equal(admin.terrainStatus,'applied');assert.equal(admin.rowLinearM,result.rowLinearM);assert.equal(admin.totalPosts,result.totalPosts);
 const print=buildSharedPrintModel({projectName:'Null spacing',fields:[field],createdAt:'2026-10-04T00:00:00Z'});
 assert.deepEqual(print.fields[0].rows,result.rows);assert.equal(print.fields[0].metrics.totalPosts,result.totalPosts);assert.equal(print.fields[0].metrics.rowLinearM,result.rowLinearM);
});

for(const quantityBasis of ['certified-flat-legacy','mixed-certified-bases'])test(`${quantityBasis} report shows quantity metres separately from measured ground metres`,async()=>{
 const {projectToPdfModel}=await import('../src/pdf-model.js');const {renderProposalHtml}=await import('../src/report-template.js');
 const {parseHTML}=await import('linkedom');
 const metrics={terrainStatus:'applied',quantityBasis,rowLinearM:600,surfaceRowLinearM:610,horizontalRowLinearM:605,terrainSource:{label:'DTM numerico'},surfaceAreaM2:1000,surfaceNetAreaM2:900};
 const model=projectToPdfModel({state:{project:{}},metrics});
 const html=renderProposalHtml(model),{document}=parseHTML(html);
 const rowValue=label=>[...document.querySelectorAll('.report-row')].find(row=>row.querySelector('span')?.textContent===label)?.querySelector('strong')?.textContent;
 assert.equal(rowValue('Metri lineari per quantità'),'600 m');
 assert.equal(rowValue('Metri lineari sul terreno'),'610 m');
 assert.equal(rowValue('Metri lineari orizzontali'),'605 m');
 assert.match(document.body.textContent,/Quantità .*conservate/);
});

async function certifiedReportFields(){
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');const {fromUTM}=await import('../src/coordinate-system.js');
 const cut={id:'split',type:'linear',widthM:1.5,geometry:[[18.25,0],[19.75,0],[19.75,40],[18.25,40],[18.25,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632))};
 return [
  {...appliedTerrainField(()=>0,{rowSpacingM:1}),basis:'certified-flat-legacy',quantityMetres:'1602 m'},
  {...appliedTerrainField(x=>x<=20?0:(x-20)/2,{rowSpacingM:1,exclusions:[cut]}),basis:'mixed-certified-bases',quantityMetres:'1601 m'}
 ];
}
test('real certified and mixed quantities retain their basis and physical measurements in field reports and shared print',async()=>{
 const {parseHTML}=await import('linkedom');
 for(const {field,result,basis,quantityMetres} of await certifiedReportFields()){
  const model=buildProjectReportModel({state:{project:{fields:[field]}},getMetrics:fieldSummaryMetrics});
  assert.equal(model.fields[0].terrain.quantityBasis,basis);
  assert.equal(model.fields[0].metrics.surfaceRowLinearM,result.surfaceRowLinearM);
  const payload={projectName:'Certified',fields:[field],createdAt:'2026-10-04T00:00:00Z'};
  assert.equal(buildSharedPrintModel(payload).fields[0].terrain.surfaceRowLinearM,result.surfaceRowLinearM);
  for(const html of [renderProjectReportHtml(model),renderSharedProjectHtml({payload})]){
   const {document}=parseHTML(`<!doctype html><html><body>${html}</body></html>`);
   const rowValue=label=>[...document.querySelectorAll('.document-data-row,.shared-detail-row')].find(row=>row.querySelector('span')?.textContent===label)?.querySelector('strong')?.textContent;
   assert.equal(rowValue('Metri lineari per quantità'),quantityMetres);
   assert.equal(rowValue('Metri lineari sul terreno'),'1600 m');
   assert.match(document.body.textContent,/Quantità .*conservate/);
  }
 }
});

test('native PDF labels certified and mixed quantity metres without replacing measured ground lengths',async()=>{
 const {buildProjectPdfBytes}=await import('../src/report-pdf-download.js');
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url),pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {execFileSync}=await import('node:child_process');
 const dir=await mkdtemp(tmpdir()+'/terrain-basis-pdf-');
 try{
  for(const {field,basis,quantityMetres} of await certifiedReportFields()){
   const model=buildProjectReportModel({state:{project:{fields:[field]}},getMetrics:fieldSummaryMetrics});
   const path=dir+'/'+basis+'.pdf';await writeFile(path,await buildProjectPdfBytes(model,{pdfLib,assetLoader:async()=>null}));
   const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
   assert.match(text,new RegExp('Metri per quantità\\s+'+quantityMetres.replace('.','')));
   assert.match(text,/Metri sul terreno\s+1600 m/);
   assert.match(text,/Quantità .*conservate/);
   assert.match(text,/DTM anonimo.*5 m.*Epoca 2019/);
   assert.match(execFileSync('pdffonts',[path],{encoding:'utf8'}),/Helvetica/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
