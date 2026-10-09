import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {mountCountsUI} from '../conteggi/ui.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {rememberCountsOwner,readCountsOfflineOwner} from '../src/counts-offline-owner.js';
import {createCountsRuntime} from '../conteggi/runtime.js';

test('offline reopening uses only the last resolved owner without a token refresh',async t=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},config={backendUrl:'https://backend.example',environment:'TEST'};
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousDB=globalThis.indexedDB;
 Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});globalThis.indexedDB=new IDBFactory();
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;globalThis.indexedDB=previousDB;});
 storage.setItem('sb-backend-auth-token',JSON.stringify({user:{id:'guest-one',is_anonymous:true}}));rememberCountsOwner(storage,config,{user:{id:'guest-one',is_anonymous:true},displayName:'Guest'});
 const runtime=await createCountsRuntime({config,storage});t.after(()=>runtime.destroy());assert.equal(runtime.offlineIdentity,true);assert.equal(runtime.gateway.getScope().owner,'guest-one');assert.equal(runtime.auth.getState().isAdmin,false);assert.throws(()=>runtime.auth.login({}),/Internet/);
 assert.equal(readCountsOfflineOwner(storage,{...config,environment:'LIVE'}),null);
});

test('offline field directory failure still allows a standalone count',async t=>{
 const {document,window}=parseHTML('<html><body><main id="counts-main"></main><p id="counts-status"></p></body></html>');
 const gateway=createCountsGateway({store:createCountsStore({indexedDB:new IDBFactory()}),scope:scope(),channel:false});t.after(()=>gateway.destroy());
 const ui=mountCountsUI({document,window,gateway,route:{view:'new'},fieldDirectory:{listProjects:async()=>{throw new Error('Network unavailable');}}});t.after(()=>ui.destroy());
 await ui.ready;assert.ok(document.querySelector('[data-action="increment"]'));
 document.querySelector('[name="title"]').value='Pali';document.querySelector('[name="title"]').dispatchEvent(new window.Event('input',{bubbles:true}));
 document.querySelector('[data-action="category"][data-category="posts"]').click();await ui.whenIdle();
 document.querySelector('[data-action="increment"]').click();await ui.whenIdle();
 assert.equal((await gateway.getReading()).field,null);assert.equal((await gateway.getReading()).quantity,1);
 document.querySelector('[data-action="confirm-count"]').click();await ui.whenIdle();assert.equal((await gateway.listLists()).items.length,1);

});

test('worker reloads the cached counts shell offline and never caches API or other tools',async()=>{
 const source=await readFile(new URL('../conteggi/sw.js',import.meta.url),'utf8');
 const handlers={},saved=new Map();const cache={match:async key=>saved.get(typeof key==='string'?key:key.url),put:async(key,response)=>saved.set(typeof key==='string'?key:key.url,response)};
 const scope={URL,Response,Request,Set,Map,Promise,console,fetch:async()=>{throw new Error('Offline');},self:{location:{origin:'https://example.test',href:'https://example.test/conteggi/sw.js'},addEventListener:(event,callback)=>handlers[event]=callback},caches:{open:async()=>cache}};
 vm.runInNewContext(source,scope);
 const shell=new Response('<title>Conteggi</title>',{headers:{'Content-Type':'text/html'}});saved.set('https://example.test/conteggi/index.html',shell);
 let response;handlers.fetch({request:{url:'https://example.test/conteggi/?view=counter&listId=one',method:'GET',mode:'navigate'},respondWith:promise=>response=promise});
 assert.match(await (await response).text(),/Conteggi/);
 for(const url of ['https://backend.supabase.co/rest/v1/counts_lists','https://example.test/','https://example.test/admin/','https://example.test/conteggi/private-data.json']){
  let handled=false;handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:()=>handled=true});assert.equal(handled,false,url);
 }
});
