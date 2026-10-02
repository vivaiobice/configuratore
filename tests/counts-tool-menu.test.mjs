import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountToolMenu} from '../src/tool-menu.js';
import {createDesktopLibraryUI} from '../src/desktop-library-ui.js';

test('original logo opens two accessible tools; active tool closes without navigation',async()=>{
  const {document}=parseHTML('<html><body><header><a class="brand" href="#"><img src="./assets/logo-vivai-obice-v14.png?v=14" alt="Vivai Obice"></a></header><div class="mobile-brand"><img src="./assets/logo-vivai-obice-v14.png?v=14"></div><div class="mobile-editor-top"></div></body></html>');
  const calls=[];const menu=mountToolMenu({document,onCounts:()=>calls.push('counts')});
  const trigger=document.querySelector('.brand'),panel=document.querySelector('#tool-selector');
  trigger.click();assert.equal(panel.hidden,false);assert.equal(panel.querySelectorAll('button').length,2);
  assert.equal(panel.querySelector('[data-tool="configurator"]').getAttribute('aria-current'),'page');
  panel.querySelector('[data-tool="configurator"]').click();assert.equal(panel.hidden,true);assert.deepEqual(calls,[]);
  document.querySelector('.mobile-editor-tool-trigger').click();assert.equal(panel.hidden,false);
  panel.querySelector('[data-tool="counts"]').click();await Promise.resolve();assert.deepEqual(calls,['counts']);
  assert.equal(trigger.querySelector('img').getAttribute('src'),'./assets/logo-vivai-obice-v14.png?v=14');
  menu.destroy();
});

test('profile exposes Conteggi to guests and signed-in users only when enabled',async()=>{
  const {createProfileUI}=await import('../src/profile-ui.js');
  const {document}=parseHTML('<html><body><button id="profile-trigger"></button><div id="profile-menu" hidden></div></body></html>');
  let next={kind:'guest'},listener,calls=0;
  const auth={getState:()=>next,subscribe(fn){listener=fn;return()=>{};}};
  const ui=createProfileUI({authService:auth,document,countsEnabled:true,onCounts:()=>calls++});ui.mount();
  document.querySelector('#profile-trigger').click();
  document.querySelector('[data-profile-counts]').click();await Promise.resolve();assert.equal(calls,1);
  next={kind:'user',username:'a'};listener(next);document.querySelector('#profile-trigger').click();
  document.querySelector('[data-profile-counts]').click();await Promise.resolve();assert.equal(calls,2);
  ui.destroy();
});

test('field card opens a new count and renders gateway category lines without merging them',async()=>{
  const {document}=parseHTML('<html><body><div class="topbar-actions"></div></body></html>');
  const field={id:'f-1',label:'Campo',geometry:[[8,44],[9,44],[8,45],[8,44]]};let opened;
  const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>[field],countsEnabled:true,
    openCountsForField:id=>{opened=id;},loadCountsForField:async()=>({categories:[
      {category:'plants',items:[{countId:'a',title:'Moscato',quantity:7},{countId:'b',title:'Moscato',quantity:3}],totalQuantity:'10'},
      {category:'posts',items:[{countId:'c',title:'Pali',quantity:4}],totalQuantity:'4'}]})});
  ui.mount();ui.open('fields');await new Promise(resolve=>setImmediate(resolve));
  const row=document.querySelector('[data-desktop-field="f-1"]');
  row.querySelector('[data-field-action="new-count"]').click();await Promise.resolve();assert.equal(opened,'f-1');
  assert.equal(row.querySelectorAll('[data-count-line]').length,3);
  assert.match(row.textContent,/Moscato.*7.*Moscato.*3.*Pali.*4/);
});
