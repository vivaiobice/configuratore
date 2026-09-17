import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createMobileUI} from '../src/mobile-ui.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const controller=app.slice(app.indexOf('const mapWrap = document.querySelector'),app.indexOf('mobileUi = createMobileUI('));
function setup(){
 const {document}=parseHTML(html);globalThis.document=document;
 const $=s=>document.querySelector(s);let mobile=true,stopped=0;
 const window={scrollY:200,scrollTo(){}};globalThis.window=window;
 const context={document,window,$,isMobileMap:()=>mobile,mobileUi:null,requestAnimationFrame:fn=>fn(),addEventListener(){},mapApi:{stopTools(){stopped++;},map:{resize(){}}}};
 vm.createContext(context);vm.runInContext(controller,context);
 const ui=createMobileUI({isMobile:()=>mobile,setFullscreen:context.setMapFullscreen,getField:()=>({label:'Campo test'}),stopTools:()=>stopped++,finishEdit(){},undoPoint(){}});
 context.mobileUi=ui;
 return {$,document,ui,context,get stopped(){return stopped;},desktop(){mobile=false;context.placeMapForViewport();}};
}
test('real mobile DOM: entry, sheets, editor and return retain controls and project data',()=>{
 const c=setup(),{$}=c;
 assert.equal($('.field-manager').parentElement.dataset.content,'fields');
 assert.equal($('.segmented').parentElement.className,'map-toolbar');
 $('[data-view="fields"]').click();assert.equal($('.mobile-sheet').hidden,false);
 assert.equal($('[data-content="fields"]').hidden,false);
 $('.mobile-sheet header button').click();assert.equal($('.mobile-sheet').hidden,true);
 $('#map-fullscreen-button').click();assert.equal($('.map-wrap').parentElement,c.document.body);
 assert.equal($('.segmented').parentElement.dataset.content,'layers');
 $('[data-sheet="perimeter"]').click();assert.equal($('[data-content="perimeter"]').hidden,false);
 c.ui.drawingState({active:true,vertexCount:3});assert.equal($('.mobile-sheet').hidden,true);assert.equal($('.mobile-draw-actions').hidden,false);
 assert.equal($('#close-perimeter-button').parentElement,$('.mobile-draw-actions'));
 $('[data-action="cancel"]').click();assert.ok(c.stopped>0);
 $('#map-fullscreen-button').click();assert.equal($('.map-wrap').parentElement,$('.panel-scroll'));
 assert.equal($('.segmented').parentElement.className,'map-toolbar');
 $('[data-view="map"]').click();assert.ok($('.map-wrap').classList.contains('fullscreen-map'));
 $('[data-view="project"]').click();assert.ok(!$('.map-wrap').classList.contains('fullscreen-map'));
 assert.equal($('.mobile-draw-actions').hidden,true);
});
test('switching to desktop restores every moved control to its original container and order',()=>{
 const c=setup(),{$}=c;
 c.desktop();
 const original=parseHTML(html).document;
 for(const selector of ['.map-toolbar','.field-manager','.map-summary-grid']){
  const structure=doc=>Array.from(doc.querySelector(selector).children).map(el=>el.outerHTML);
  // Fullscreen button is deliberately detached by the existing V17 controller.
  const filter=items=>items.filter(s=>!s.includes('id="map-fullscreen-button"'));
  assert.deepEqual(filter(structure(c.document)),filter(structure(original)));
 }
 assert.equal($('#summary-save-project').textContent,'Salva il progetto');
 assert.equal($('.field-manager').parentElement,$('.step[data-step="1"]'));
 assert.equal($('.map-wrap').parentElement,$('.app-shell'));
});
test('leaving a removal tool restores the main mobile map menu on reentry',()=>{
 const c=setup(),{$}=c;$('#map-fullscreen-button').click();
 c.ui.editingState({active:true});assert.ok($('.map-wrap').classList.contains('mobile-tool-active'));
 $('#map-fullscreen-button').click();$('#map-fullscreen-button').click();
 assert.ok(!$('.map-wrap').classList.contains('mobile-tool-active'));
});
