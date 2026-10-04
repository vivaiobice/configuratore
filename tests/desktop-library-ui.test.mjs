import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('desktop field cards distinguish invalid terrain quantities and preserve legacy counts',async()=>{
 const [{createDesktopLibraryUI},{appliedTerrainField},{calculateProject}]=await Promise.all([import('../src/desktop-library-ui.js'),import('./fixtures/terrain-field.mjs'),import('../src/project-calculator.js')]);
 const {document}=parseHTML(html);globalThis.document=document;const {field}=appliedTerrainField();const invalid={...field,id:'invalid',rowSpacingM:4},valid={...field,id:'valid',terrain:null,rowPortions:[]};const metrics=field=>calculateProject({...field,polygon:field.geometry});assert.equal(metrics(invalid).terrainStatus,'invalid');
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>[valid,invalid],getProjects:()=>[],getFieldMetrics:metrics});ui.mount();document.querySelector('#desktop-fields-trigger').click();
 const detail=id=>document.querySelector(`[data-desktop-field="${id}"] .desktop-field-info span`).textContent;
 assert.match(detail('invalid'),/Da rivedere/);assert.match(detail('invalid'),/— barbatelle comm\. · — filari/);const m=metrics(valid);assert.equal(detail('valid'),`${m.commercialPlants25.toLocaleString('it-IT')} barbatelle comm. · ${m.rowCount.toLocaleString('it-IT')} filari · Vitigno da definire`);
});

test('desktop library exposes selectable Campi and Progetti without replacing the editor',async()=>{
 const module=await import('../src/desktop-library-ui.js');
 assert.equal(typeof module.createDesktopLibraryUI,'function');
 const {document}=parseHTML(html);globalThis.document=document;
 const fields=[{id:'f1',label:'Campo Nord',geometry:[[8,44],[8.01,44],[8,44.01],[8,44]]}];
 const projects=[{id:'p1',name:'Progetto Alba',savedAt:'2026-09-22T00:00:00Z',project:{fields}}];
 let selected=null,loaded=null,refreshed=0,saved=0,renamed=null,deleted=null,renamedField=null,deletedField=null;
 const ui=module.createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>fields,getProjects:()=>projects,
  selectField:id=>selected=id,loadProject:item=>loaded=item.id,refreshProjects:async()=>{refreshed++;},saveProject:async()=>{saved++;return {location:'local'};},
  renameField:async(field,name)=>{renamedField=[field.id,name];field.label=name;},deleteField:async(field)=>{deletedField=field.id;},
  renameProject:async(item,name)=>{renamed=[item.id,name];item.name=name;},deleteProject:async(item)=>{deleted=item.id;projects.splice(projects.indexOf(item),1);},confirm:()=>true});
 ui.mount();
 assert.ok(document.querySelector('#desktop-fields-trigger'));
 assert.ok(document.querySelector('#desktop-projects-trigger'));
 document.querySelector('#desktop-fields-trigger').click();
 assert.ok(document.querySelector('[data-desktop-field="f1"] [data-field-action="rename"]'));
 assert.ok(document.querySelector('[data-desktop-field="f1"] [data-field-action="delete"]'));
 document.querySelector('[data-desktop-field="f1"] .desktop-library-item-main').click();
 assert.equal(selected,'f1');
 document.querySelector('#desktop-fields-trigger').click();
 document.querySelector('[data-desktop-field="f1"] [data-field-action="edit"]').click();
 document.querySelector('[data-desktop-field="f1"] [data-field-action="rename"]').click();
 const fieldInput=document.querySelector('[data-desktop-field="f1"] input');fieldInput.value='Campo Sud';
 await document.querySelector('[data-desktop-field="f1"] [data-field-action="confirm-rename"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(renamedField,['f1','Campo Sud']);
 document.querySelector('[data-desktop-field="f1"] [data-field-action="edit"]').click();
 await document.querySelector('[data-desktop-field="f1"] [data-field-action="delete"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(deletedField,'f1');
 document.querySelector('#desktop-projects-trigger').click();
 document.querySelector('[data-desktop-project="p1"] .desktop-library-item-main').click();
 assert.equal(loaded,'p1');
 await document.querySelector('#desktop-library-refresh').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(refreshed,1);
 await document.querySelector('#desktop-library-save').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved,1);
 assert.equal(document.querySelector('#desktop-library-save').dataset.saveState,'local');
 assert.match(document.querySelector('#desktop-library-feedback').textContent,/Bozza salvata sul dispositivo/);
 assert.ok(document.querySelector('.app-shell'),'original editor remains mounted');

 document.querySelector('#desktop-projects-trigger').click();
 document.querySelector('[data-desktop-project="p1"] [data-project-action="edit"]').click();
 document.querySelector('[data-desktop-project="p1"] [data-project-action="rename"]').click();
 const renameInput=document.querySelector('[data-desktop-project="p1"] input');renameInput.value='Progetto rinominato';
 await document.querySelector('[data-desktop-project="p1"] [data-project-action="confirm-rename"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(renamed,['p1','Progetto rinominato']);
 assert.equal(document.querySelector('[data-desktop-project="p1"] strong').textContent,'Progetto rinominato');

 document.querySelector('[data-desktop-project="p1"] [data-project-action="edit"]').click();
 await document.querySelector('[data-desktop-project="p1"] [data-project-action="delete"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(deleted,'p1');
 assert.equal(document.querySelector('[data-desktop-project="p1"]'),null);
});

test('project archive expands fields and confirms touch field movement in-app',async()=>{
 const module=await import('../src/desktop-library-ui.js');
 const {document}=parseHTML(html);globalThis.document=document;
 const projects=[
  {id:'p1',name:'Progetto A',cloud:{projectId:'cloud-a'},project:{fields:[{id:'f1',label:'Campo Nord',plantingStatus:'planned',locationLabel:'Alba',grapeVariety:'Nebbiolo',metrics:{grossAreaM2:1200}}]}},
  {id:'p2',name:'Progetto B',cloud:{projectId:'cloud-b'},project:{fields:[{id:'f2',label:'Campo Sud',plantingStatus:'planted'}]}}
 ];
 const moves=[];
 const ui=module.createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>[],getProjects:()=>projects,
  moveField:async(source,target,field)=>moves.push([source.id,target.id,field.id])});
 ui.mount();document.querySelector('#desktop-projects-trigger').click();
 const expand=document.querySelector('[data-desktop-project="p1"] [data-project-action="expand"]');
 expand.click();
 assert.equal(document.querySelector('[data-desktop-project="p1"]').dataset.expanded,'true');
 assert.ok(document.querySelector('[data-project-field="p1:f1"]'));
 assert.match(document.querySelector('[data-project-field="p1:f1"]').textContent,/Da realizzare/);
 document.querySelector('[data-project-field="p1:f1"] [data-field-move]').click();
 const modal=document.querySelector('#desktop-field-move-dialog');
 assert.equal(modal.hidden,false);
 modal.querySelector('option[value="p2"]').selected=true;
 modal.querySelector('[data-move-next]').click();
 assert.match(modal.querySelector('[data-move-message]').textContent,/Spostare “Campo Nord” dal progetto “Progetto A” al progetto “Progetto B”/);
 modal.querySelector('[data-move-cancel]').click();
 assert.equal(moves.length,0);
 document.querySelector('[data-project-field="p1:f1"] [data-field-move]').click();
 modal.querySelector('option[value="p2"]').selected=true;modal.querySelector('[data-move-next]').click();
 await modal.querySelector('[data-move-confirm]').click();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(moves,[['p1','p2','f1']]);
});
