import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAdminViews} from '../admin/admin-views.js';
const polygon=[[8,44],[8.01,44],[8,44.01],[8,44]];

function fixture(options={}){
 const {document}=parseHTML('<main><h2 id="admin-list-title"></h2><table><thead id="admin-table-head"></thead><tbody id="admin-table-body"></tbody></table><section id="admin-detail" hidden><h2 id="detail-title"></h2><div id="detail-grid"></div><div id="detail-field-map"></div><div id="detail-children"></div></section></main>');
 const selected=[];const views=createAdminViews({document,onSelect:(kind,row)=>selected.push([kind,row.rowId]),...options});
 return {document,views,selected};
}

test('fields section renders requested columns and opens field detail',()=>{
 const {document,views,selected}=fixture();
 const row={rowId:'p1:f1',label:'Campo Nord',projectDate:'2026-09-01',projectName:'Progetto A',projectCode:'VO-1',client:'Azienda',location:'Alba',year:2027,plantingStatus:'planned',grapeVariety:'Barbera',cloneSelection:'C1',rootstock:'1103 P',areaM2:1000,calculatedPlants:490,commercialPlants:500};
 views.renderSection('fields',[row]);
 assert.match(document.querySelector('#admin-table-head').textContent,/Data progetto/);
 assert.match(document.querySelector('#admin-table-head').textContent,/Quantità commerciale/);
 document.querySelector('#admin-table-body tr').click();
 assert.deepEqual(selected,[['fields','p1:f1']]);
 views.renderDetail('fields',row);
 assert.equal(document.querySelector('#admin-detail').hidden,false);
 assert.match(document.querySelector('#detail-title').textContent,/Campo Nord/);
 assert.match(document.querySelector('#detail-grid').textContent,/Da realizzare/);
 assert.equal(document.querySelector('#admin-table-body tr').classList.contains('selected'),true);
});

test('field detail mounts and disposes its satellite preview lifecycle',()=>{
 let opened=0,disposed=0;const {views}=fixture({onFieldPreviewOpen:()=>{opened++;return ()=>disposed++;}});
 views.renderDetail('fields',{rowId:'p1:f1',label:'Campo',geometryValid:true,field:{geometry:polygon}});
 assert.equal(opened,1);views.clearDetail();assert.equal(disposed,1);views.destroy();assert.equal(disposed,1);
});

test('projects omit grape variety and clients expose aggregate totals',()=>{
 const {document,views}=fixture();
 views.renderSection('projects',[{rowId:'p1',date:'2026-09-01',code:'VO-1',name:'Progetto',client:'Azienda',status:'saved',fieldCount:2,areaM2:3000,commercialPlants:1400,quoteRequested:true,quoteNumber:''}]);
 assert.doesNotMatch(document.querySelector('#admin-table-head').textContent,/Vitigno/);
 assert.match(document.querySelector('#admin-table-body').textContent,/numero da assegnare/);
 views.renderSection('clients',[{rowId:'owner:u1',displayName:'Azienda',email:'a@example.it',phone:'123',projectCount:2,fieldCount:3,areaM2:4000,commercialPlants:1800,plantsToPlant:900}]);
 assert.match(document.querySelector('#admin-table-head').textContent,/Progetti/);
 assert.match(document.querySelector('#admin-table-head').textContent,/Da piantare/);
});

test('rendering a filtered section clears a detail no longer present',()=>{
 const {document,views}=fixture();
 const row={rowId:'p1:f1',label:'Campo'};
 views.renderDetail('fields',row);
 views.renderSection('fields',[]);
 assert.equal(document.querySelector('#admin-detail').hidden,true);
});

test('projects and nested fields open and close independently',()=>{
 const {document,views}=fixture();
 const projectA={rowId:'p1',projectId:'p1',name:'Progetto A',code:'VO-1',status:'saved',fields:[{rowId:'p1:f1',projectId:'p1',fieldId:'f1',label:'Campo 1',field:{geometry:polygon},geometryValid:true},{rowId:'p1:f2',projectId:'p1',fieldId:'f2',label:'Campo 2',field:{geometry:polygon},geometryValid:true}]};
 const projectB={rowId:'p2',projectId:'p2',name:'Progetto B',code:'VO-2',status:'draft',fields:[{rowId:'p2:f1',projectId:'p2',fieldId:'f1',label:'Campo 3',field:{geometry:polygon},geometryValid:true}]};
 views.renderSection('projects',[projectA,projectB]);
 document.querySelector('tr[data-row-id="p1"]').click();document.querySelector('tr[data-row-id="p2"]').click();
 assert.ok(document.querySelector('tr[data-project-detail="p1"]'));assert.ok(document.querySelector('tr[data-project-detail="p2"]'));
 document.querySelector('[data-field-toggle="p1:f1"]').click();document.querySelector('[data-field-toggle="p2:f1"]').click();
 assert.ok(document.querySelector('[data-field-panel="p1:f1"]'));assert.ok(document.querySelector('[data-field-panel="p2:f1"]'));
 document.querySelector('[data-field-close="p1:f1"]').click();
 assert.equal(document.querySelector('[data-field-panel="p1:f1"]'),null);assert.ok(document.querySelector('[data-field-panel="p2:f1"]'));
 assert.match(document.querySelector('tr[data-project-detail="p1"]').textContent,/Campo 2/);
 assert.deepEqual(views.getOpenState(),{projects:['p1','p2'],fields:['p2:f1']});
});

test('filtering removes only previews whose field panels disappear',()=>{
 let disposed=0;const {document,views}=fixture({onFieldPreviewOpen:()=>()=>disposed++});
 const project={rowId:'p1',projectId:'p1',name:'A',fields:[{rowId:'p1:f1',projectId:'p1',fieldId:'f1',label:'Campo',field:{geometry:polygon},geometryValid:true}]};
 views.renderSection('projects',[project]);document.querySelector('tr[data-row-id="p1"]').click();document.querySelector('[data-field-toggle="p1:f1"]').click();
 assert.equal(disposed,0);views.renderSection('projects',[project]);assert.equal(disposed,0);
 views.renderSection('projects',[]);assert.equal(disposed,1);
});

test('nested field panel exposes editable locality and saves without leaving the project',async()=>{
 const saved=[];const {document,views}=fixture({onFieldLocationSave:async(row,location)=>{saved.push([row.rowId,location]);return {message:'Salvata'};}});
 const field={rowId:'p1:f1',projectId:'p1',fieldId:'f1',label:'Campo',municipality:'Alba',province:'CN',region:'Piemonte',location:'Alba, CN',field:{geometry:polygon,municipality:'Alba',province:'CN',region:'Piemonte',locationLabel:'Alba, CN'},geometryValid:true};
 const project={rowId:'p1',projectId:'p1',name:'A',fields:[field]};
 views.renderSection('projects',[project]);document.querySelector('tr[data-row-id="p1"]').click();document.querySelector('[data-field-toggle="p1:f1"]').click();
 const form=document.querySelector('[data-field-location-form="p1:f1"]');assert.ok(form);
 form.querySelector('[name="municipality"]').value='Comune corretto';form.dispatchEvent(new document.defaultView.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(saved[0][0],'p1:f1');assert.equal(saved[0][1].municipality,'Comune corretto');
 assert.ok(document.querySelector('tr[data-project-detail="p1"]'));
});
