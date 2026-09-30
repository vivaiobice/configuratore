import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createReportPreflight, updateReportPreflight, canIssueReport, DISCLAIMER_VERSION, resolveFieldLocations, locationForSelection } from '../src/report-preflight.js';

const ring=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
const state={project:{fields:[{id:'f1',label:'Moscato',geometry:ring},{id:'f2',label:'Nebbiolo',geometry:ring}]}};

test('preflight selects every valid field by default and simplifies one-field documents',()=>{
  const all=createReportPreflight({state});
  assert.deepEqual(all.selectedFieldIds,['f1','f2']);
  assert.equal(all.selectionMode,'all');
  const one=createReportPreflight({state:{project:{fields:[state.project.fields[0]]}}});
  assert.deepEqual(one.selectedFieldIds,['f1']);
  assert.equal(one.singleField,true);
});

test('field selection and recipient-only edits invalidate prior disclaimer acceptance',()=>{
  let model=createReportPreflight({state});
  model=updateReportPreflight(model,{type:'disclaimer/set',accepted:true});
  assert.equal(canIssueReport(model),true);
  model=updateReportPreflight(model,{type:'selection/set',fieldIds:['f2']});
  assert.equal(model.disclaimerAccepted,false);
  model=updateReportPreflight(updateReportPreflight(model,{type:'disclaimer/set',accepted:true}),{type:'recipient/update',field:'companyName',value:'Cliente documento'});
  assert.equal(model.disclaimerAccepted,false);
  assert.equal(model.recipient.companyName,'Cliente documento');
});

test('recipient prefill prefers project contact and never copies an invalid email',()=>{
  const contact={companyName:'Azienda Agricola',firstName:'Anna',email:'non valida',province:'CN'};
  const profile={companyName:'Profilo Srl',firstName:'Paolo',lastName:'Verdi',email:'profilo@example.it',phone:'123'};
  const model=createReportPreflight({state,profile,contact});
  assert.equal(model.recipient.companyName,'Azienda Agricola');
  assert.equal(model.recipient.firstName,'Anna');
  assert.equal(model.recipient.lastName,'Verdi');
  assert.equal(model.recipient.email,'profilo@example.it');
  assert.equal(model.recipient.phone,'123');
  assert.equal(model.recipient.province,'CN');
});

test('old test values are omitted from recipient details but real contact is kept',()=>{
  const model=createReportPreflight({state,contact:{companyName:'1',firstName:'1',lastName:'1',phone:'1',email:'cliente@example.it'},profile:{firstName:'Persona',lastName:'Vite'}});
  assert.equal(model.recipient.companyName,'');
  assert.equal(model.recipient.firstName,'Persona');
  assert.equal(model.recipient.lastName,'Vite');
  assert.equal(model.recipient.phone,'');
  assert.equal(model.recipient.email,'cliente@example.it');
});

test('saved canonical locations win while only missing fields are reverse geocoded',async()=>{
  const seen=[];
  const fields=[{...state.project.fields[0],municipality:'Vecchia città'},{...state.project.fields[1],geometry:ring.map(([lon,lat])=>[lon+.1,lat+.1])}];
  const locations=await resolveFieldLocations(fields,{fetchImpl:async url=>{
    const point=new URL(url).searchParams.get('location');seen.push(point);
    return {ok:true,json:async()=>({address:{City:Number(point.split(',')[0])>8.05?'Comune B':'Comune A',Subregion:'Provincia campione'}})};
  }});
  assert.equal(seen.length,1);
  assert.equal(locations.f1.municipality,'Vecchia città');
  assert.equal(locations.f2.municipality,'Comune B');
  assert.deepEqual(locationForSelection(['f1'],locations),{plantLocation:'Vecchia città',province:''});
  assert.equal(locationForSelection(['f1','f2'],locations).plantLocation,'Località diverse (vedi campi)');
});

test('zero valid selections or stale disclaimer version disables document issue',()=>{
  let model=createReportPreflight({state:{project:{fields:[{id:'bad',label:'Incompleto',geometry:null}]}}});
  assert.deepEqual(model.selectedFieldIds,[]);
  assert.equal(canIssueReport(model),false);
  model={...createReportPreflight({state}),disclaimerAccepted:true,disclaimerVersion:'OLD'};
  assert.notEqual(DISCLAIMER_VERSION,'OLD');
  assert.equal(canIssueReport(model),false);
});

test('report shell contains accessible preflight, capture host, preview and locked actions',()=>{
  const html=fs.readFileSync(new URL('../report.html',import.meta.url),'utf8');
  const printCss=fs.readFileSync(new URL('../report-print.css',import.meta.url),'utf8');
  assert.match(html,/id="report-field-selection"/);
  assert.match(html,/id="report-recipient-form"/);
  assert.match(html,/name="addressProvince"[^>]*autocomplete="address-level1"/);
  assert.match(html,/name="plantLocation"/);
  assert.match(html,/name="province"/);
  assert.match(html,/id="report-address-suggestions"/);
  assert.match(html,/id="report-disclaimer"/);
  assert.match(html,/id="report-disclaimer-accept"[^>]*type="checkbox"/);
  assert.match(html,/id="report-warning"[^>]*role="alert"/);
  assert.match(html,/id="report-preview"/);
  assert.match(html,/id="report-satellite-host"[^>]*aria-hidden="true"/);
  assert.match(html,/id="report-print"[^>]*disabled/);
  assert.doesNotMatch(html,/id="report-print-native"/);
  assert.match(html,/id="report-copy-link"[^>]*disabled/);
  assert.match(printCss,/@page\s*\{[^}]*size:\s*A4/si);
  assert.match(printCss,/\.report-page/);
  assert.match(printCss,/print-color-adjust:\s*exact/);
});
