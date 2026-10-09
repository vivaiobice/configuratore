import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {appliedTerrainField} from './fixtures/terrain-field.mjs';
import {calculateProject} from '../src/project-calculator.js';
import {createUserProjectsView} from '../src/user-projects-view.js';
import * as model from '../admin/admin-model.js';
import {createAdminViews} from '../admin/admin-views.js';
function payload(invalid=true){
 const {field}=appliedTerrainField();const bad={...field,id:'review',label:'Da aggiornare',rowSpacingM:4},good={...field,id:'valid',label:'Campo valido',terrain:null,rowPortions:[]};
 const fields=(invalid?[good,bad]:[good]).map(field=>({...field,metrics:calculateProject({...field,polygon:field.geometry})}));
 return {id:'p',owner_user_id:'owner',name:'Progetto fixture',environment:'production',field_plans:fields};
}
test('owner project and field cards mark invalid terrain quantities unavailable',async()=>{
 const {document}=parseHTML('<html><body></body></html>');const project=payload();
 const ui=createUserProjectsView({document,auth:{getState:()=>({isAdmin:true})},loadData:async()=>({projects:[project],profiles:[]}),mountMap:()=>({setFields(){},destroy(){}})});await ui.open();document.querySelector('[data-owner-projects]').click();
 assert.match(document.querySelector('[data-consult-project]').textContent,/Da rivedere · — m² · — viti/);document.querySelector('[data-consult-project]').click();
 const cards=[...document.querySelectorAll('.user-project-field')];assert.match(cards.find(card=>card.textContent.includes('Da aggiornare')).textContent,/Da rivedere · — m² · — viti/);assert.doesNotMatch(cards.find(card=>card.textContent.includes('Campo valido')).textContent,/Da rivedere/);
});
function adminDashboard(project){
 const {document}=parseHTML(fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8'));
 const source=fs.readFileSync(new URL('../admin/admin.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^init\(\);$/m,'');
 vm.runInNewContext(`${source}\nprojects=fixtureProjects;render();`,{document,fixtureProjects:[project],...model,createAdminViews,console});return document;
}
test('administration quantity KPIs are unavailable when filtered fields include invalid terrain',()=>{
 const document=adminDashboard(payload());assert.equal(document.querySelector('#kpi-fields').textContent,'2');assert.equal(document.querySelector('#kpi-plants').textContent,'Da rivedere');assert.equal(document.querySelector('#kpi-area').textContent,'Da rivedere');
});
test('administration valid legacy quantity KPIs retain their exact formatted numbers',()=>{
 const project=payload(false),document=adminDashboard(project),m=project.field_plans[0].metrics;
 assert.equal(document.querySelector('#kpi-fields').textContent,'1');assert.equal(document.querySelector('#kpi-plants').textContent,m.commercialPlants25.toLocaleString('it-IT'));assert.equal(document.querySelector('#kpi-area').textContent,`${Math.round(m.areaM2).toLocaleString('it-IT')} m²`);
});
