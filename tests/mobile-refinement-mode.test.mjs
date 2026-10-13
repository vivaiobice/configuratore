import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createMobileUI} from '../src/mobile-ui.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const parameterOrder=['plant','material','information','cadastre','soil','portions','curve','exclusions'];
const mapOrder=['portions','curve','exclusions','plant','material','information','cadastre','soil'];

function setup(){
 const {document}=parseHTML(html);globalThis.document=document;globalThis.window={};
 const $=selector=>document.querySelector(selector);$('.test-badge').textContent='Release di prova';
 const field={id:'f1',label:'Campo 1',activeFieldId:'f1',localProjectName:'Vigneto <Cascina>',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44]],exclusions:[]};
 const metrics={areaM2:1000,netAreaM2:900,rows:[],simulatedPlants:400,commercialPlants25:400,intermediatePosts:80,headPosts:20,totalPosts:100};
 let mobile=true;
 const originalCards=[...$('.advanced-body').children];
 const ui=createMobileUI({isMobile:()=>mobile,getField:()=>field,getFields:()=>[field],getMetrics:()=>metrics,
  resizeMap(){},focusAll(){},stopTools(){},undoPoint(){},beginEdit(){},beginNewField(){},focusField(){},
  cancelEdit(){},selectField(){},listProjects:()=>[],newProject(){}});
 return {document,$,field,ui,originalCards,desktop(){mobile=false;ui.sync();}};
}

test('mobile map header shows the current project and places the release after navigation',()=>{
 const c=setup(),{$}=c;
 assert.equal($('#mobile-map-project-name')?.textContent,'Vigneto <Cascina>');
 assert.equal($('#mobile-map-project-name').title,'Vigneto <Cascina>');
 assert.equal($('.mobile-brand .mobile-release-label'),null);
 assert.equal($('.mobile-navigation').nextElementSibling,$('.mobile-release-label'));
 assert.equal($('.mobile-release-label').textContent,'Release di prova');
 c.field.localProjectName='Impianto 2027';c.ui.renderField();
 assert.equal($('#mobile-map-project-name').textContent,'Impianto 2027');
});

test('Affina progetto reveals section icons and Chiudi sezione restores the basic editor',()=>{
 const c=setup(),{$}=c;c.ui.navigate('editor');
 const button=$('[data-sheet="orientation"]');button.click();
 assert.equal($('#mobile-app').dataset.refinementMode,'true');
 assert.equal(button.textContent,'Chiudi sezione');assert.equal(button.getAttribute('aria-expanded'),'true');
 assert.equal($('#mobile-refinement-tools')?.hidden,false);
 assert.deepEqual([...$('#mobile-refinement-tools').querySelectorAll('button')].map(node=>node.dataset.refinementSection),mapOrder);
 assert.equal($('.mobile-sheet').hidden,true,'icons appear before choosing a section');
 $('[data-refinement-section="material"]').click();
 assert.equal($('.mobile-sheet').hidden,false);
 button.click();
 assert.equal($('#mobile-app').dataset.refinementMode,undefined);
 assert.equal(button.textContent,'Affina progetto');assert.equal(button.getAttribute('aria-expanded'),'false');
 assert.equal($('#mobile-refinement-tools').hidden,true);assert.equal($('.mobile-sheet').hidden,true);
 assert.ok([...$('.advanced-body').children].every(node=>!node.hidden));
});

test('map section taps show exactly one original card and retain its live controls',()=>{
 const c=setup(),{$}=c,advanced=$('.advanced'),original=$('#orientation');
 let edits=0;original.addEventListener('input',()=>edits++);
 c.ui.navigate('editor');$('[data-sheet="orientation"]').click();
 for(const key of mapOrder){
  const button=$(`[data-refinement-section="${key}"]`);assert.ok(button,`section action exists for ${key}`);button.click();
  const visible=[...$('#mobile-refinement-controls .advanced-body').children].filter(node=>!node.hidden);
  assert.equal(visible.length,1);assert.equal(visible[0].dataset.refinement,key);
  assert.equal(visible[0].open,true);
  assert.equal($('#mobile-sheet-title').textContent,visible[0].querySelector('.refinement-title').textContent);
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal([...$('#mobile-refinement-tools').querySelectorAll('button')].filter(node=>node.getAttribute('aria-pressed')==='true').length,1);
  assert.equal($('.advanced'),advanced);assert.equal($('#orientation'),original);
 }
 original.value='42';original.dispatchEvent(new c.document.defaultView.Event('input',{bubbles:true}));assert.equal(edits,1);
 $('#mobile-close-sheet').click();assert.equal($('.mobile-sheet').hidden,true);
 assert.equal($('#mobile-app').dataset.refinementMode,'true','closing a panel keeps section selection available');
});

test('parameter refinement order is stable and desktop receives the original nodes and states',()=>{
 const c=setup(),{$}=c,advanced=$('.advanced'),orientation=$('#orientation');
 c.ui.navigate('parameters');
 assert.deepEqual([...$('.advanced-body').children].map(node=>node.dataset.refinement),parameterOrder);
 const material=$('[data-refinement="material"]');material.open=true;
 c.ui.navigate('editor');$('[data-sheet="orientation"]').click();$('[data-refinement-section="soil"]').click();
 c.ui.navigate('parameters');
 assert.deepEqual([...$('.advanced-body').children].map(node=>node.dataset.refinement),parameterOrder);
 assert.equal(material.open,true);assert.ok([...$('.advanced-body').children].every(node=>!node.hidden));
 c.desktop();assert.equal($('.advanced'),advanced);assert.equal($('#orientation'),orientation);
 assert.deepEqual([...$('.advanced-body').children],c.originalCards);
 assert.equal($('#mobile-refinement-tools').hidden,true);assert.ok([...$('.advanced-body').children].every(node=>!node.hidden));
});

test('restoring an editor session reopens its chosen section without replacing controls',()=>{
 const first=setup();first.ui.navigate('editor');first.$('[data-sheet="orientation"]').click();
 assert.ok(first.$('[data-refinement-section="cadastre"]'),'cadastre section action exists');first.$('[data-refinement-section="cadastre"]').click();
 const saved=first.ui.captureSession();const second=setup();
 assert.equal(second.ui.restoreSession(saved),true);
 assert.equal(second.$('#mobile-app').dataset.refinementMode,'true');
 assert.equal(second.$('[data-refinement-section="cadastre"]').getAttribute('aria-pressed'),'true');
 assert.equal(second.$('.mobile-sheet').hidden,false);
 assert.equal(second.$('[data-refinement="cadastre"]').hidden,false);
});

test('field detail opens Media for its active field',()=>{
 const {document}=parseHTML(html);globalThis.document=document;globalThis.window={};
 const field={activeFieldId:'field-media',id:'field-media',label:'Campo',exclusions:[]};let selected=null;
 const ui=createMobileUI({isMobile:()=>true,getField:()=>field,getFields:()=>[field],getMetrics:()=>({rows:[]}),
  resizeMap(){},focusAll(){},focusField(){},stopTools(){},openFieldMedia:id=>{selected=id;}});
 ui.navigate('detail');
 const button=document.querySelector('#mobile-detail-media');assert.ok(button,'detail exposes Media');button.click();
 assert.equal(selected,'field-media');
});
