import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createAdminViews} from '../admin/admin-views.js';

function fixture(){
 const {document}=parseHTML('<main><h2 id="admin-list-title"></h2><table><thead id="admin-table-head"></thead><tbody id="admin-table-body"></tbody></table><section id="admin-detail" hidden><h2 id="detail-title"></h2><div id="detail-grid"></div><div id="detail-children"></div></section></main>');
 const selected=[];const views=createAdminViews({document,onSelect:(kind,row)=>selected.push([kind,row.rowId])});
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
