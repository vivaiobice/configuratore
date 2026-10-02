import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountToolMenu} from '../src/tool-menu.js';
import {createDesktopLibraryUI} from '../src/desktop-library-ui.js';
import {installPenTapFallback} from '../src/pen-tap.js';

for(const triggerClass of ['mobile-brand-tool-trigger','mobile-editor-tool-trigger'])test(`${triggerClass}: a finger tap selects Conteggi when Safari omits the native click`,async()=>{
  const {document,window}=parseHTML('<html><body><a class="brand" href="#"><img></a><div id="mobile-app"><div class="mobile-brand"><img></div><div class="mobile-editor-top"></div></div></body></html>');
  const root=document.querySelector('#mobile-app');let calls=0;
  installPenTapFallback(root,()=>true,{delayMs:5});
  const menu=mountToolMenu({document,onCounts:()=>calls++});
  const tap=async node=>{
    for(const type of ['pointerdown','pointerup']){const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerType:'touch',pointerId:1,clientX:20,clientY:20});node.dispatchEvent(event);}
    await new Promise(resolve=>setTimeout(resolve,20));
  };
  await tap(document.querySelector('.'+triggerClass));
  assert.equal(document.querySelector('#tool-selector').hidden,false);
  const option=document.querySelector('[data-tool="counts"]');await tap(option);
  assert.equal(calls,1);assert.equal(document.querySelector('#tool-selector').hidden,true);
  // Linkedom runs target listeners before capture. Verify cancellation here;
  // the browser runner checks that capture prevents duplicate navigation.
  const lateClick=new window.Event('click',{bubbles:true,cancelable:true});Object.assign(lateClick,{pointerType:'touch',detail:1});option.dispatchEvent(lateClick);await Promise.resolve();
  assert.equal(lateClick.defaultPrevented,true);menu.destroy();
});

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
