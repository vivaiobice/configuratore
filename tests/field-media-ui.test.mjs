import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createFieldMediaUI} from '../src/field-media-ui.js';

const setup=()=>{
 const {document}=parseHTML('<html><body><button id="origin">Media</button></body></html>');
 let context={ownerId:null,projectId:'p1',fieldId:'f1',environment:'LIVE',fieldName:'Campo prova'},saved=0,uploads=[],released=[];
 const store={list:async()=>[{id:'photo',name:'Visita.jpg',mime:'image/jpeg',kind:'photo',size:123,createdAt:'2026-10-13T06:00:00Z',storage:'local'}],getURL:async()=> 'blob:photo',upload:async(file,options)=>uploads.push([file,options]),delete:async()=>{},releaseURL:url=>released.push(url)};
 const ui=createFieldMediaUI({document,getContext:()=>context,getStore:()=>store,ensureSaved:async()=>saved++});
 return {document,ui,uploads,released,get saved(){return saved;},change:()=>context={...context,fieldId:'f2'}};
};
test('field Media opens dated collection with camera gallery and file controls',async()=>{
 const c=setup();await c.ui.open();
 assert.equal(c.document.querySelector('#field-media-title').textContent,'Media · Campo prova');
 assert.equal(c.document.querySelector('[data-media-input="camera"]').getAttribute('capture'),'environment');
 assert.equal(c.document.querySelector('[data-media-input="photos"]').getAttribute('capture'),null);
 assert.equal(c.document.querySelector('[data-media-input="files"]').hasAttribute('multiple'),true);
 assert.match(c.document.querySelector('.field-media-list').textContent,/Visita.jpg/);
 assert.equal(c.saved,0);
});
test('photo opens inline enlargement and close releases local preview URLs',async()=>{
 const c=setup();await c.ui.open();await c.ui.preview('photo');
 assert.equal(c.document.querySelector('.field-media-preview img').getAttribute('src'),'blob:photo');
 c.ui.close();assert.ok(c.released.includes('blob:photo'));assert.equal(c.document.querySelector('#field-media').hidden,true);
});
test('upload batches keep camera kind and add only to the captured field',async()=>{
 const c=setup();await c.ui.open();const file=new Blob(['image'],{type:'image/jpeg'});file.name='Visita.jpg';
 await c.ui.uploadFiles([file],'camera');assert.equal(c.uploads.length,1);assert.equal(c.uploads[0][1].kind,'photo');
 c.change();await c.ui.uploadFiles([file],'photos');assert.equal(c.uploads.length,1);assert.equal(c.document.querySelector('#field-media').hidden,true);
});
test('late list results from previous field never appear after closing',async()=>{
 const {document}=parseHTML('<html><body></body></html>');let complete;
 const ui=createFieldMediaUI({document,getContext:()=>({ownerId:null,projectId:'p',fieldId:'f'}),getStore:()=>({list:()=>new Promise(resolve=>complete=resolve),releaseURL(){}})});
 const pending=ui.open();ui.close();complete([{id:'private',name:'old-file',kind:'file'}]);await pending;
 assert.equal(document.querySelector('#field-media').hidden,true);assert.doesNotMatch(document.querySelector('.field-media-list').textContent,/old-file/);
});
test('a later photo preview replaces pending earlier preview and download',async()=>{
 const {document}=parseHTML('<html><body></body></html>');let complete;const released=[];
 const store={list:async()=>['a','b'].map(id=>({id,name:`${id}.jpg`,kind:'photo',createdAt:'2026-10-13',size:1})),releaseURL:url=>released.push(url),getURL:async(id,options)=>id==='a'&&options.download?new Promise(resolve=>complete=resolve):`blob:${id}${options.download?'-download':''}`};
 const ui=createFieldMediaUI({document,getContext:()=>({ownerId:null,projectId:'p',fieldId:'f'}),getStore:()=>store});
 await ui.open();const first=ui.preview('a');while(!complete)await Promise.resolve();await ui.preview('b');complete('blob:a-download');await first;
 assert.equal(document.querySelector('.field-media-preview img').getAttribute('src'),'blob:b');
 assert.equal(document.querySelectorAll('.field-media-preview a').length,1);assert.equal(document.querySelector('.field-media-preview a').getAttribute('href'),'blob:b-download');
 assert.ok(released.includes('blob:a-download'));
});
