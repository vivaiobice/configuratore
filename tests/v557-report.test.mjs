import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {createReportPreflight,updateReportPreflight} from '../src/report-preflight.js';
import {createReportOrchestrator} from '../src/report.js';
const ring=(x=8)=>[[x,44],[x+.001,44],[x+.001,44.001],[x,44.001],[x,44]];
const state={project:{localProjectName:'Due varietà',fields:[{id:'a',label:'Moscato',geometry:ring(),cadastralRefs:[{source:'manual',municipality:'Alba',sheet:'12',parcel:'345'}],soil:{cartographic:{description:'Franco sabbioso',texture:'Franco sabbioso',limestone:'Moderato',drainage:'Buono',reaction:'Subalcalina',retrievedAt:'2026-10-01',geometrySignature:'old'}}},{id:'b',label:'Barbera',geometry:ring(8.001)}]}};

test('overview options enforce dependent cadastre and invalidate generated acceptance',()=>{
 let p=createReportPreflight({state});p=updateReportPreflight(p,{type:'disclaimer/set',accepted:true});
 p=updateReportPreflight(p,{type:'overview/set',enabled:true,cadastre:true});assert.deepEqual(p.overview,{enabled:true,cadastre:true});assert.equal(p.disclaimerAccepted,false);
 p=updateReportPreflight(p,{type:'overview/set',enabled:false,cadastre:true});assert.deepEqual(p.overview,{enabled:false,cadastre:false});
});

test('report retains every cadastral reference and stored soil row, with sources and stale warning',()=>{
 const m=buildProjectReportModel({state,getMetrics:()=>({areaM2:100,simulatedPlants:40})});
 assert.equal(m.fields[0].cadastralRefs[0].parcel,'345');assert.equal(m.fields[0].soil.cartographic.texture,'Franco sabbioso');
 const {document}=parseHTML(renderProjectReportHtml(m));const text=document.querySelector("article").textContent;
 assert.match(text,/Foglio 12/);assert.match(text,/Particella 345/);assert.match(text,/Franco sabbioso/);assert.match(text,/Regione Piemonte/);assert.match(text,/1:50.000/);assert.match(text,/perimetro modificato/i);
});

test('overview is included on page two and does not replace separate field maps',()=>{
 const m=buildProjectReportModel({state,getMetrics:()=>({}),overview:{satelliteImage:'data:image/png;base64,b3ZlcnZpZXc=',mapAttribution:'Imagery © Esri · Catasto © Agenzia delle Entrate',cadastre:true}});
 const {document}=parseHTML(renderProjectReportHtml(m));
 assert.ok(document.querySelector('.report-page-2 .document-overview img'));assert.match(document.querySelector('.document-overview').textContent,/60%/);
 assert.equal(document.querySelectorAll('.document-field-map').length,2);
});

test('orchestrator overview includes only chosen fields and passes the cadastre flag to capture',async()=>{
 const calls=[];let preflight=createReportPreflight({state});preflight=updateReportPreflight(preflight,{type:'selection/set',fieldIds:['b']});preflight=updateReportPreflight(preflight,{type:'overview/set',enabled:true,cadastre:true});preflight=updateReportPreflight(preflight,{type:'disclaimer/set',accepted:true});
 const orchestrator=createReportOrchestrator({sync:{saveRevision:async()=>({projectId:'p',revisionNumber:1})},captureSatellite:async args=>{calls.push(args);return {dataUrl:'data:image/png;base64,YQ==',attribution:'Imagery © Esri'};},tokenFactory:()=> 'token',hashToken:async()=> 'hash',issueReport:async()=>({id:'doc'}),qrRenderer:()=>'',buildShareUrl:()=> 'https://example.it/view'});
 const result=await orchestrator.generate({state,preflight,hostForField:()=>({}),hostForOverview:()=>({})});
 assert.equal(calls.length,2);assert.equal(calls[1].mapModel.geo.fields.length,1);assert.equal(calls[1].mapModel.geo.fields[0].label,'Barbera');assert.equal(calls[1].cadastre,true);
 assert.ok(result.html.includes('Visione aerea generale'));
});

test('missing saved cadastral and soil data are explicit and missing soil categories are not fabricated',()=>{
 const model=buildProjectReportModel({state});const {document}=parseHTML(renderProjectReportHtml(model));
 const barbera=[...document.querySelectorAll('.document-field-data')].find(node=>node.textContent.includes('Barbera'));assert.match(barbera.textContent,/Riferimenti catastali: non inseriti/);assert.match(barbera.textContent,/Analisi del suolo: non disponibile/);
 const soil=[...document.querySelectorAll('.document-field-evidence')].filter(node=>node.textContent.includes('Analisi del suolo')).map(node=>node.textContent).join(' ');assert.match(soil,/pHNon disponibile/);assert.match(soil,/DrenaggioBuono/);
});

test('satellite overview exports every field name and row with the cadastral layer at 60%',async()=>{
 const {captureSatelliteImage}=await import('../src/report-satellite.js');const {buildOverviewMapModel}=await import('../src/report-overview.js');
 const labels=[],layers=[],sources=[];let removed=false;
 const context={drawImage(){},scale(){},measureText:text=>({width:text.length*8}),beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},rect(){},fillText:text=>labels.push(text)};
 class Map{resize(){}fitBounds(){}once(event,callback){queueMicrotask(callback);}addSource(id,source){sources.push({id,source});}addLayer(layer){layers.push(layer);}isSourceLoaded(){return true;}getCanvas(){return {width:1000,height:650,toDataURL:()=> 'data:image/png;base64,YQ=='};}remove(){removed=true;}}
 Map.prototype.project=function([x,y]){return {x:(x-8)*100000+100,y:(y-44)*100000+100};};
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});
 try{const capture=await captureSatelliteImage({container:{clientWidth:1000,clientHeight:650},maplibregl:{Map},mapModel:buildOverviewMapModel(state.project.fields,()=>({rows:[{start:[8,44],end:[8.001,44.001]}]})),cadastre:true,documentRef:{createElement:()=>({getContext:()=>context,toDataURL:()=> 'data:image/png;base64,YQ=='})}});assert.deepEqual(labels,['Moscato','Barbera']);assert.equal(layers.find(layer=>layer.id==='overview-cadastre').paint['raster-opacity'],.6);assert.equal(sources.filter(source=>source.id.endsWith('-rows')).length,2);assert.match(capture.attribution,/Catasto/);assert.equal(removed,true);}finally{globalThis.fetch=previous;}
});
