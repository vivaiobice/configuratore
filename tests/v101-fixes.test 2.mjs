import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {duplicateProjectField} from '../src/fields.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {createDesktopLibraryUI} from '../src/desktop-library-ui.js';
import {refreshFieldSoilForReport} from '../src/soil-report.js';

const polygon=[[8,44],[8.01,44],[8.01,44.01],[8,44]];

test('a duplicated field keeps editable layout and cadastral values but has its own identity and soil analysis',()=>{
 const project={activeFieldId:'a',fields:[{id:'a',label:'Moscato',geometry:polygon,rowSpacingM:2.7,orientationDeg:45,cadastralRefs:[{municipality:'Alba',sheet:'3',parcel:'7'}],soil:{cartographic:{description:'Argilloso'}}}]};
 const copy=duplicateProjectField(project,'a',()=> 'b');
 assert.equal(copy.activeFieldId,'b');assert.equal(copy.fields.length,2);assert.equal(copy.fields[1].label,'Copia di Moscato');
 assert.equal(copy.fields[1].rowSpacingM,2.7);assert.equal(copy.fields[1].orientationDeg,45);
 assert.deepEqual(copy.fields[1].cadastralRefs,copy.fields[0].cadastralRefs);
 assert.notStrictEqual(copy.fields[1].geometry,copy.fields[0].geometry);
 assert.equal(copy.fields[1].soil,null);
 copy.fields[1].geometry[0][0]=9;assert.equal(copy.fields[0].geometry[0][0],8);
});

test('the field list offers save, duplicate, and report actions for the project',async()=>{
 const {document}=parseHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const item={id:'f1',label:'Campo',geometry:polygon};let saved=0,duplicated='',printed=0;
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>[item],getProjects:()=>[],saveProject:async()=>{saved++;return {location:'cloud'};},duplicateField:field=>{duplicated=field.id;},openReport:()=>{printed++;}});
 ui.mount();document.querySelector('#desktop-fields-trigger').click();
 assert.ok(document.querySelector('#desktop-library-save:not([hidden])'));
 document.querySelector('[data-field-action="edit"]').click();
 document.querySelector('[data-field-action="duplicate"]').click();
 document.querySelector('#desktop-library-print').click();
 await document.querySelector('#desktop-library-save').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(duplicated,'f1');assert.equal(printed,1);assert.equal(saved,1);
});

test('report page 2 places overview below all project totals; field evidence remains on the data page',()=>{
 const field={id:'f1',label:'Campo',geometry:polygon,rows:[],layout:{},plantMaterial:{},metrics:{},cadastralRefs:[{municipality:'Alba',section:'A',sheet:'42',parcel:'7'}],soil:{cartographic:{description:'Franco sabbioso',texture:'Franco sabbioso',source:'Regione Piemonte',scale:'1:50.000',samples:1,drainage:null}}};
 const model={title:'Progetto',project:{code:'VO-1',generatedAt:'2026-10-01'},recipient:{},fields:[field],summary:{fieldCount:1},overview:{satelliteImage:'data:image/png;base64,abc',mapAttribution:'Esri'},disclaimer:{}};
 const html=renderProjectReportHtml(model);
 const pages=[...html.matchAll(/<section class="report-page report-page-(\d+)">([\s\S]*?)(?=<section class="report-page report-page-|$)/g)];
 assert.equal(pages[1][1],'2');
 assert.ok(pages[1][2].indexOf('document-summary-grid')<pages[1][2].indexOf('document-overview'));
 const data=pages.find(p=>p[2].includes('document-field-data'))?.[2]??'';
 assert.match(data,/Sezione A/);assert.match(data,/Foglio 42/);assert.match(data,/Franco sabbioso/);
 assert.doesNotMatch(html,/<section class="document-field-evidence">/);assert.doesNotMatch(data,/Non disponibile/);
});

test('projects with more fields place the overview after the final summary list',()=>{
 const fields=Array.from({length:5},(_,i)=>({id:`f${i}`,label:`Campo ${i+1}`,metrics:{},plantMaterial:{}}));
 const html=renderProjectReportHtml({title:'Progetto',project:{},recipient:{},fields,summary:{fieldCount:5},overview:{satelliteImage:'data:image/png;base64,abc'},disclaimer:{}});
 const pages=[...html.matchAll(/<section class="report-page report-page-(\d+)">([\s\S]*?)(?=<section class="report-page report-page-|$)/g)];
 assert.match(pages[1][2],/document-summary-grid/);
 assert.doesNotMatch(pages[1][2],/document-overview/);
 assert.match(pages[2][2],/Campo 5/);
 assert.match(pages[2][2],/document-overview/);
});

test('report refresh requests every available soil theme before rendering, keeping only known values',async()=>{
 const themes=[];
 const values={TessituraTopsoil:'Tessitura: Franco sabbioso',CalcareTopsoil:'Calcare: Moderato',Drenaggio:'Drenaggio: Buono',ReazioneTopsoil:'Reazione: Subalcalina'};
 const soil=await refreshFieldSoilForReport({geometry:polygon},{fetchImpl:async(url)=>{const name=new URL(url).searchParams.get('LAYERS');themes.push(name);return {ok:true,text:async()=>values[name]};}});
 assert.deepEqual(new Set(themes),new Set(Object.keys(values)));
 assert.equal(soil.cartographic.texture,'Franco sabbioso');assert.equal(soil.cartographic.limestone,'Moderato');
 assert.equal(soil.cartographic.drainage,'Buono');assert.equal(soil.cartographic.reaction,'Subalcalina');
});

test('fresh cartographic soil preserves the field laboratory analysis',async()=>{
 const field={geometry:polygon,soil:{labAnalysis:{ph:7.2,source:'Laboratorio Rossi'}}};
 const updated=await refreshFieldSoilForReport(field,{fetchImpl:async()=>({ok:true,text:async()=> 'Tessitura: Franco'})});
 assert.equal(updated.cartographic.texture,'Franco');
 assert.deepEqual(updated.labAnalysis,field.soil.labAnalysis);
});

test('the AdE cadastral section is parsed when available and is editable in the form',async()=>{
 const {parseNationalCadastralReference}=await import('../supabase/functions/_shared/cadastral-wms.js');
 assert.equal(parseNationalCadastralReference('A124A001200.345').section,'A');
 assert.equal(parseNationalCadastralReference('A124_001200.345').section,null);
 const source=readFileSync(new URL('../src/cadastral-auto.js',import.meta.url),'utf8');
 assert.match(source,/section:parcel\.section\|\|''/);
 const html=readFileSync(new URL('../src/cadastral-reference-editor.js',import.meta.url),'utf8');
 assert.match(html,/\['section','Sezione'\]/);
 const css=readFileSync(new URL('../v1.0.1.css',import.meta.url),'utf8');
 assert.match(css,/#mobile-app #cadastral-reference-editor \.cadastral-reference-row label:first-child\{grid-column:auto\}/);
});
