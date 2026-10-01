import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createDesktopLibraryUI} from '../src/desktop-library-ui.js';
import {createCadastralReferenceEditor} from '../src/cadastral-reference-editor.js';
import {expandProjectFields} from '../admin/admin-model.js';
import {createMapFieldLabelOverlay} from '../src/map-field-label-overlay.js';

const ring=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
const field={id:'a',label:'Moscato',geometry:ring,grapeVariety:'Moscato',metrics:{commercialPlants25:1025,rowCount:8,simulatedPlants:1004}};
const documentFor=()=>parseHTML('<html><body><header class="topbar"><div class="topbar-actions"></div></header></body></html>').document;

test('field cards have a map preview and metrics; card opens, edit menu groups mutations',()=>{
 const document=documentFor();let opened='',printed=0,quoted=0;
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>[field],getProjects:()=>[],getFieldMetrics:()=>field.metrics,selectField:id=>opened=id,openReport:()=>printed++,openQuote:()=>quoted++});
 ui.mount();document.querySelector('#desktop-fields-trigger').click();
 const card=document.querySelector('[data-desktop-field="a"]');
 assert.ok(card.querySelector('.desktop-field-thumbnail svg'));
 assert.match(card.textContent,/1\.?025/);assert.match(card.textContent,/8 filari/);assert.match(card.textContent,/Moscato/);
 assert.equal(card.querySelector('[data-field-action="open"]'),null);
 assert.equal(card.querySelector('.desktop-library-edit-options').hidden,true);
 card.querySelector('[data-field-action="edit"]').click();
 assert.equal(card.querySelector('.desktop-library-edit-options').hidden,false);
 card.querySelector('.desktop-library-item-main').click();assert.equal(opened,'a');
 document.querySelector('#desktop-library-print').click();document.querySelector('#desktop-library-quote').click();
 assert.equal(printed,1);assert.equal(quoted,1);
 assert.ok(document.querySelector('#desktop-library-print').title);
});

test('projects keep archive expansion but open on card click and group edit actions',()=>{
 const document=documentFor(),item={id:'p1',name:'Ca del Principe',project:{fields:[field]},savedAt:'2026-10-01'};let loaded='';
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>[field],getProjects:()=>[item],getActiveProjectId:()=>item.id,loadProject:value=>loaded=value.id,getFieldMetrics:()=>field.metrics});
 ui.mount();document.querySelector('#desktop-projects-trigger').click();
 const card=document.querySelector('[data-desktop-project="p1"]');
 assert.equal(card.querySelector('[data-project-action="pdf"]'),null);
 assert.equal(card.querySelector('.desktop-library-edit-options').hidden,true);
 card.querySelector('[data-project-action="edit"]').click();assert.equal(card.querySelector('.desktop-library-edit-options').hidden,false);
 card.querySelector('[data-project-action="expand"]').click();assert.ok(document.querySelector('.desktop-project-fields'));
 document.querySelector('[data-desktop-project="p1"] .desktop-library-item-main').click();assert.equal(loaded,'p1');
 for(const id of ['desktop-library-refresh','desktop-library-save','desktop-library-new','desktop-library-print','desktop-library-quote'])assert.ok(document.querySelector(`#${id}`).title);
});

test('project toolbar sends PDF and quote for the explicitly chosen archive item',()=>{
 const document=documentFor(),items=[{id:'a',name:'Primo',project:{fields:[field]}},{id:'b',name:'Secondo',project:{fields:[field]}}];let pdf='',quote='';
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getProjects:()=>items,getFields:()=>[],getActiveProjectId:()=>items[0].id,openReport:item=>pdf=item.id,openQuote:item=>quote=item.id});
 ui.mount();ui.open('projects');
 const target=document.querySelector('#desktop-library-project-target');target.querySelector('option[value="b"]').selected=true;
 target.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));
 document.querySelector('#desktop-library-print').click();document.querySelector('#desktop-library-quote').click();
 assert.equal(pdf,'b');assert.equal(quote,'b');
});

test('cadastral row keeps comune, foglio, particella, and circular remove on one line',()=>{
 const {document}=parseHTML('<div id="editor"></div>');
 const editor=createCadastralReferenceEditor({document,container:document.querySelector('#editor')});
 editor.render([{municipality:'Alba',sheet:'20',parcel:'105'}]);
 const row=document.querySelector('[data-reference-row]');
 assert.equal(row.querySelector('[name="section"]'),null);
 assert.equal(row.querySelector('[data-remove-reference]').textContent,'×');
 assert.match(row.querySelector('[data-remove-reference]').getAttribute('aria-label'),/Rimuovi/);
});

test('net vineyard area appears among the configurator summary cards',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="summary-net-area"/);
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/setText\('#summary-net-area',\s*formatArea\(result\.netAreaM2\)\)/);
});

test('admin fields use profile username or a stable Guest number instead of customer contact',()=>{
 const projects=[
  {id:'live',owner_user_id:'u1',owner_kind:'user',contacts:{company_name:'Cliente diverso'},field_plans:[field]},
  {id:'guest',owner_user_id:'abcd-1234',owner_kind:'guest',field_plans:[{...field,id:'b'}]}
 ];
 const rows=expandProjectFields(projects,[{user_id:'u1',username:'marco'}]);
 assert.equal(rows[0].userLabel,'marco');assert.equal(rows[1].userLabel,'Guest1234');
 const views=readFileSync(new URL('../admin/admin-views.js',import.meta.url),'utf8');
 assert.match(views,/\['Utente',row=>row\.userLabel/);
});

test('map labels persist and reproject after panning even with no selected field',()=>{
 const {document}=parseHTML('<div id="map"></div>'),host=document.querySelector('#map'),handlers=new Map();let offset=0;
 const map={getContainer:()=>host,project:([x,y])=>({x:x+offset,y}),on:(event,fn)=>handlers.set(event,fn),off:(event)=>handlers.delete(event)};
 const labels=createMapFieldLabelOverlay({map,documentRef:document});
 labels.setFields([{geometry:ring,label:'Moscato'},{geometry:ring.map(([x,y])=>[x+.02,y]),label:'Barbera'}]);
 assert.deepEqual([...host.querySelectorAll('.field-label-marker')].map(node=>node.textContent),['Moscato','Barbera']);
 const marker=host.querySelector('.field-label-marker'),position=marker.style.left;offset=5;handlers.get('move')();
 assert.equal(host.querySelector('.field-label-marker'),marker);
 assert.notEqual(host.querySelector('.field-label-marker').style.left,position);
 labels.destroy();assert.equal(host.querySelector('.map-field-label-overlay'),null);
});
