import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {createMobileUI} from '../src/mobile-ui.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('legacy responsive controller cannot pull the map out of the active mobile app',()=>{assert.match(app,/mobileUi\?\.isActive\?\.\(\)/);});
function setup(mobile=true){
 const {document}=parseHTML(html);globalThis.document=document;globalThis.window={};
 const $=s=>document.querySelector(s);let begun=0,saved=0,cancelled=0;
 const field={id:'f1',label:'Campo 1',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44]],exclusions:[]};
 const project={activeFieldId:'f1',fields:[field],...field};
 const metrics={areaM2:1000,netAreaM2:900,rows:[],simulatedPlants:400,intermediatePosts:80,headPosts:20,totalPosts:100};
 const ui=createMobileUI({isMobile:()=>mobile,getField:()=>project,getFields:()=>project.fields,getMetrics:()=>metrics,
  resizeMap(){},focusAll(){},stopTools(){},finishEdit(){},undoPoint(){},beginEdit(){begun++;},beginNewField(){begun++;},
  selectField(){},cancelEdit(){cancelled++;},saveProject(){saved++;},listProjects:()=>[],loadProject(){},newProject(){},
  finishDraw:async()=>true,drawField(){},focusField(){},finalAction(){}});
 return {$,ui,document,get begun(){return begun;},get saved(){return saved;},get cancelled(){return cancelled;},desktop(){mobile=false;ui.sync();}};
}
test('mobile opens on map: add → editor → confirm → parameters → save → map',async()=>{
 const c=setup(),{$}=c;assert.equal(c.document.body.dataset.mobileScreen,'map');
 assert.equal($('.map-wrap').parentElement.id,'mobile-map-host');
 $('#mobile-add-field').click();assert.equal(c.begun,1);assert.equal(c.document.body.dataset.mobileScreen,'editor');
 c.ui.geometryCommitted();assert.equal(c.document.body.dataset.mobileScreen,'parameters');
 assert.ok($('#mobile-parameters-body').contains($('#plant-spacing')));
 assert.ok($('#mobile-parameters-body').contains($('#rootstock')));
 $('#mobile-save-field').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.saved,1);assert.equal(c.document.body.dataset.mobileScreen,'map');
});
test('fields expose totals, preview, pole counts and edit/cancel',()=>{
 const c=setup(),{$}=c;$('[data-view="fields"]').click();assert.equal(c.document.body.dataset.mobileScreen,'fields');
 assert.match($('#mobile-fields-total').textContent,/400/);
 $('[data-field-id="f1"]').click();assert.equal(c.document.body.dataset.mobileScreen,'detail');
 assert.ok($('#mobile-field-detail svg'));assert.match($('#mobile-field-detail').textContent,/Pali intermedi/);
 $('#mobile-edit-parameters').click();assert.equal(c.document.body.dataset.mobileScreen,'parameters');
 $('#mobile-cancel-field').click();assert.equal(c.cancelled,1);assert.equal(c.document.body.dataset.mobileScreen,'map');
});
test('desktop restoration keeps the same inputs and values',()=>{
 const c=setup(),{$}=c,input=$('#plant-spacing');input.value='1.2';c.desktop();
 assert.equal($('#plant-spacing'),input);assert.equal(input.value,'1.2');
 assert.ok($('.step[data-step="2"]').contains(input));assert.ok($('.advanced').contains($('#rootstock')));
 assert.ok($('.step[data-step="1"]').contains($('.field-manager')));
 assert.equal($('.map-wrap').parentElement.className,'app-shell');assert.ok(!c.document.body.classList.contains('mobile-app-active'));
});
test('desktop startup never moves controls',()=>{const c=setup(false);assert.equal(c.$('.map-wrap').parentElement.className,'app-shell');assert.ok(c.$('.step[data-step="2"]').contains(c.$('#plant-spacing')));});
test('touch pointer activation reaches mobile controls even when Safari omits the synthetic click',()=>{
 const c=setup(),button=c.$('#mobile-add-field');
 const event=new c.document.defaultView.Event('pointerup',{bubbles:true,cancelable:true});Object.defineProperty(event,'pointerType',{value:'touch'});button.dispatchEvent(event);
 assert.equal(c.begun,1);assert.equal(c.document.body.dataset.mobileScreen,'editor');
});
test('parameters use the live satellite map preview and return it to the home map',async()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 assert.equal($('.map-wrap').parentElement.id,'mobile-parameters-preview');
 assert.equal($('#mobile-parameters-preview').dataset.base,'satellite');
 $('#mobile-save-field').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('.map-wrap').parentElement.id,'mobile-map-host');
});
test('mobile parameter controls remain directly editable',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 assert.equal($('#mobile-parameters-body').dataset.mobileInteractive,'true');
 for(const selector of ['#field-name','#plant-spacing','#row-spacing','#headland','#post-spacing','#grape-variety','#rootstock']){
  const control=$(selector);assert.ok(control);assert.equal(control.disabled,false);assert.equal(control.closest('#mobile-parameters-body')!==null,true);
 }
 $('#field-name').value='Collina sud';$('#field-name').dispatchEvent(new c.document.defaultView.Event('input',{bubbles:true}));
 assert.equal($('#field-name').value,'Collina sud');
});
