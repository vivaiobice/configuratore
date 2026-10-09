import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsGateway} from '../src/counts-client.js';
import {createCountsStore} from '../conteggi/store.js';
import {mountCountsUI} from '../conteggi/ui.js';
import {storageBannerView} from '../conteggi/storage-banner.js';
import {icon} from '../conteggi/counter-view.js';

async function setup(t,{registered=false,syncEnabled=true,noticeFailure=false,serviceFailure=false,pullFailure=false}={}){
 const {document,window}=parseHTML(await readFile(new URL('../conteggi/index.html',import.meta.url),'utf8'));
 document.querySelector('#sync-banner').innerHTML=storageBannerView({syncEnabled,registered});
 const calls=[];let rejectNotice=noticeFailure,unavailable=serviceFailure||pullFailure;
 const transport={async request(action,input){calls.push({action,input:structuredClone(input)});if((action==='notice'&&rejectNotice)||(unavailable&&(serviceFailure||action==='pull'))){const error=new Error('Servizio temporaneamente non disponibile');error.code='SYNC_UNAVAILABLE';throw error;}return action==='mutate'?{value:{...input.value,revision:input.expectedRevision+1}}:action==='pull'?{lists:[],counts:[]}:{};},async submit(){assert.fail('A sync control cannot transmit a request');}};
 const gateway=createCountsGateway({store:createCountsStore({indexedDB:new IDBFactory()}),scope:scope(registered?'profile-a':'guest-a'),channel:false,transport:syncEnabled?transport:null,noticeVersion:'notice-v136',canSyncWithoutNotice:async()=>registered});
 const ui=mountCountsUI({document,window,gateway,config:{syncEnabled,noticeVersion:'notice-v136'},titleStorage:{getItem:()=>null,setItem(){}}});await ui.ready;
 t.after(async()=>{await ui.destroy();await gateway.destroy();});
 return {document,window,gateway,ui,calls,allowNotice(){rejectNotice=false;},allowService(){unavailable=false;}};
}
async function click(f,action){const button=f.document.querySelector(`[data-action="${action}"]`);assert.ok(button,action);button.click();await f.ui.whenIdle();}

test('guests see the synchronization disclaimer and explicit inline consent without a notice popup',async t=>{
 const f=await setup(t),banner=f.document.querySelector('#sync-banner'),consent=banner.querySelector('[data-action="accept-notice"]');
 assert.match(banner.textContent,/conteggi e le note sincronizzati/i);assert.match(banner.textContent,/amministratori autorizzati/i);assert.match(banner.textContent,/anche senza una richiesta/i);assert.match(banner.textContent,/volontariamente/i);
 assert.equal(consent.textContent,'Attiva sincronizzazione');assert.equal(f.document.querySelector('[data-action="notice"]'),null);assert.equal(f.document.querySelector('footer [data-action="sync"]'),null);
 await click(f,'increment');await click(f,'confirm-count');await click(f,'sync');
 assert.equal(await f.gateway.hasNotice(),false);assert.equal(f.calls.length,0);assert.equal((await f.gateway.getSyncStatus()).pending,2);
 await click(f,'accept-notice');
 assert.deepEqual(f.calls.filter(call=>call.action==='notice').map(call=>call.input),[{version:'notice-v136'}]);assert.equal(await f.gateway.hasNotice(),true);assert.equal(consent.hidden,true);assert.equal((await f.gateway.getSyncStatus()).pending,0);assert.equal(f.document.querySelector('.counts-modal'),null);
 const list=(await f.gateway.listRecentLists())[0],count=(await f.gateway.getList(list.listId)).counts[0];assert.equal(count.quantity,1);assert.equal(count.syncState,'synced');
});

test('failed inline consent preserves the guest reading and remains available for an explicit retry',async t=>{
 const f=await setup(t,{noticeFailure:true});await click(f,'increment');await click(f,'accept-notice');
 const consent=f.document.querySelector('#sync-banner [data-action="accept-notice"]');assert.equal(consent.disabled,false);assert.equal(consent.hidden,false);assert.equal(await f.gateway.hasNotice(),false);assert.equal((await f.gateway.getReading()).quantity,1);assert.equal(f.document.querySelector('#counts-status').getAttribute('role'),'alert');
 f.allowNotice();await click(f,'accept-notice');assert.equal(await f.gateway.hasNotice(),true);assert.equal(consent.hidden,true);assert.equal(f.document.querySelector('#counts-status').textContent,'Salvato sul dispositivo');assert.equal((await f.gateway.getReading()).quantity,1);
});

test('inline consent visibility follows the current owner and exact notice version',async t=>{
 const f=await setup(t),consent=f.document.querySelector('#sync-banner [data-action="accept-notice"]');
 await f.gateway.acceptNotice('old-notice');await f.ui.refresh();await f.ui.whenIdle();assert.equal(await f.gateway.hasNotice(),false);assert.equal(consent.hidden,false);
 await click(f,'accept-notice');assert.equal(consent.hidden,true);
 await f.gateway.setScope(scope('another-guest'));await f.ui.whenIdle();await f.ui.refresh();await f.ui.whenIdle();assert.equal(await f.gateway.hasNotice(),false);assert.equal(consent.hidden,false);
});

test('registered profiles keep the disclaimer and synchronize from the top icon without fabricating notice receipt',async t=>{
 const f=await setup(t,{registered:true}),sync=f.document.querySelector('#counts-sync'),storage=f.document.querySelector('[data-action="storage-info"]');
 assert.equal(sync.hidden,false);assert.equal(sync.getAttribute('aria-label'),'Sincronizza');assert.equal(storage.nextElementSibling,sync);assert.equal(f.document.querySelectorAll('[data-action="sync"]').length,1);assert.equal(f.document.querySelector('[data-action="accept-notice"]'),null);assert.equal(f.document.querySelector('[data-action="notice"]'),null);assert.match(f.document.querySelector('#sync-banner').textContent,/consultabili dagli amministratori autorizzati/i);
 await click(f,'storage-info');assert.equal(f.document.querySelector('.counts-modal [data-action="notice"]'),null);assert.equal(f.document.querySelector('.counts-modal [data-action="accept-notice"]'),null);await click(f,'close-modal');
 await click(f,'increment');await click(f,'confirm-count');assert.equal(sync.hidden,false);await click(f,'sync');
 const status=await f.gateway.getSyncStatus();assert.equal(status.profileStorage,true);assert.equal(status.acknowledged,false);assert.equal(status.pending,0);assert.equal(f.calls.some(call=>call.action==='notice'),false);assert.equal(f.document.querySelector('#counts-status').textContent,'Sincronizzato');
 await click(f,'open-count');await click(f,'resume-count');assert.equal(sync.hidden,false);await click(f,'sync');assert.equal(f.document.querySelector('#quantity-display').textContent,'1');
});

test('the top sync icon remains hidden when synchronization is disabled',async t=>{
 const f=await setup(t,{syncEnabled:false});assert.equal(f.document.querySelector('#counts-sync').hidden,true);assert.equal(f.document.querySelector('[data-action="accept-notice"]'),null);assert.match(f.document.querySelector('#sync-banner').textContent,/su questo dispositivo/i);
});

for(const view of ['archive','counter'])for(const failure of ['pull','all'])test(`a failed ${failure} top sync stays visible through queued ${view} refreshes until a real retry succeeds`,async t=>{
 const f=await setup(t,{registered:true,serviceFailure:failure==='all',pullFailure:failure==='pull'});await click(f,'increment');await click(f,'confirm-count');if(view==='counter'){await click(f,'open-count');await click(f,'resume-count');}await click(f,'sync');await f.ui.whenIdle();await f.ui.whenIdle();
 const list=(await f.gateway.listRecentLists())[0],count=(await f.gateway.getList(list.listId)).counts[0];assert.equal(count.quantity,1);assert.equal(f.document.querySelector('#counts-status').getAttribute('role'),'alert');assert.equal(f.document.querySelector('#counts-status').textContent,'Servizio temporaneamente non disponibile');await f.ui.prepareExit();
 f.allowService();await click(f,'sync');await f.ui.whenIdle();await f.ui.whenIdle();assert.equal(f.document.querySelector('#counts-status').textContent,'Sincronizzato');assert.equal(f.document.querySelector('#counts-status').getAttribute('role'),'status');assert.equal((await f.gateway.getList(list.listId)).counts[0].quantity,1);
});

test('a failed automatic pull stays visible and does not block device-local exit or a different owner',async t=>{
 const f=await setup(t,{registered:true,pullFailure:true});await click(f,'increment');await click(f,'confirm-count');await click(f,'open-count');await click(f,'resume-count');
 await assert.rejects(f.ui.refresh(),/non disponibile/);await f.ui.whenIdle();await f.ui.whenIdle();assert.equal(f.document.querySelector('#counts-status').textContent,'Servizio temporaneamente non disponibile');await f.ui.prepareExit();
 await f.gateway.setScope(scope('different-profile'));await f.ui.whenIdle();assert.equal((await f.gateway.getReading()).quantity,0);assert.notEqual(f.document.querySelector('#counts-status').textContent,'Servizio temporaneamente non disponibile');
});

test('offline storage copy keeps the guest work local without referring to a removed notice popup',()=>{
 const {document}=parseHTML(storageBannerView({syncEnabled:true,offlineIdentity:true})),text=document.querySelector('p').textContent;assert.match(text,/restano locali/i);assert.doesNotMatch(text,/leggi|leggere|avviso/i);assert.equal(document.querySelector('[data-action]'),null);
});

test('archive deletion uses a trash icon and still requires a separate confirmation',async t=>{
 const f=await setup(t);await click(f,'increment');await click(f,'confirm-count');
 const list=(await f.gateway.listRecentLists())[0],remove=f.document.querySelector('[data-action="delete-list"]'),shape=remove.querySelector('svg path').getAttribute('d');assert.equal(shape,parseHTML(icon('trash')).document.querySelector('path').getAttribute('d'));assert.notEqual(shape,parseHTML(icon('reset')).document.querySelector('path').getAttribute('d'));assert.equal(remove.getAttribute('aria-label'),`Elimina ${list.title}`);assert.equal(remove.getAttribute('title'),'Elimina elenco');
 await click(f,'delete-list');assert.match(f.document.querySelector('#dialog-title').textContent,/Eliminare questa lista/);assert.equal((await f.gateway.getList(list.listId)).counts[0].quantity,1);
 await click(f,'close-modal');assert.equal((await f.gateway.listRecentLists()).length,1);await click(f,'delete-list');await click(f,'confirm-delete-list');assert.equal((await f.gateway.listRecentLists()).length,0);
});
