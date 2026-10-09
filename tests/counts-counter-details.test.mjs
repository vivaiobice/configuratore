import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsGateway} from '../src/counts-client.js';
import {createCountsStore} from '../conteggi/store.js';
import {mountCountsUI} from '../conteggi/ui.js';

async function setup(t,{count=null,storage=new Map(),transport=null,canSyncWithoutNotice=async()=>false}={}){
 const {document,window}=parseHTML('<html><body><main id="counts-main"></main><p id="counts-status"></p><button id="retry-save" data-action="retry" hidden></button></body></html>');
 const gateway=createCountsGateway({store:createCountsStore({indexedDB:new IDBFactory()}),scope:scope(),channel:false,transport,canSyncWithoutNotice});
 const titleStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 let route={view:'resume'};
 if(count){const list=(await gateway.createList({title:'Rimesse'})).value;const value=(await gateway.createCount({listId:list.listId,...count})).value;route={view:'counter',listId:list.listId,countId:value.countId};}
 const pulses=[],settings={document,window,gateway,route,titleStorage,feedback:{pulse:action=>pulses.push(action)}};
 const fixture={document,window,gateway,pulses,settings,ui:mountCountsUI(settings)};await fixture.ui.ready;
 t.after(async()=>{await fixture.ui.destroy();await gateway.destroy();});return fixture;
}
async function click(f,action,extra=''){f.document.querySelector(`[data-action="${action}"]${extra}`).click();await f.ui.whenIdle();}
function edit(f,name,value){const input=f.document.querySelector(`[name="${name}"]`);assert.ok(input,name);input.value=value;input.dispatchEvent(new f.window.Event('input',{bubbles:true}));}

test('category precedes generated title and active details enrich the name without finishing the draft',async t=>{
 const f=await setup(t);
 const screen=f.document.querySelector('.impulse-counter');assert.ok(screen.innerHTML.indexOf('class="type-switch"')<screen.innerHTML.indexOf('class="reading-title"'));
 assert.equal(f.document.querySelector('[name="title"]').value,'Conteggio barbatelle');
 await click(f,'counter-details');assert.ok(f.document.querySelector('#counter-details-form'));assert.equal(f.document.querySelector('[name="quantity"]'),null);
 edit(f,'varietyLabel','Barbera N.');edit(f,'rootstockLabel','Kober 5 BB');await f.ui.whenIdle();await click(f,'close-modal');
 let count=await f.gateway.getReading();assert.equal(count.quantity,0);assert.match(count.title,/Barbera N\./);assert.match(count.title,/Kober 5 BB/);
 assert.equal((await f.gateway.listRecentLists()).length,0);assert.equal(f.document.querySelectorAll('.counter-detail-summary span').length,2);
 await click(f,'category','[data-category="posts"]');assert.equal(f.document.querySelector('[name="title"]').value,'Conteggio pali');
 await click(f,'counter-details');
 assert.deepEqual([...f.document.querySelectorAll('#reading-postType option')].map(option=>option.value),['Testa','Filare','Altro']);
 edit(f,'postType','Testa');edit(f,'postMaterial','Castagno');await f.ui.whenIdle();await click(f,'close-modal');
 count=await f.gateway.getReading();assert.match(count.title,/Testa/);assert.match(count.title,/Castagno/);
 await click(f,'category','[data-category="other"]');assert.equal(f.document.querySelector('[name="title"]').value,'Conteggio di…');
 await click(f,'counter-details');edit(f,'componentType','Molle');await f.ui.whenIdle();await click(f,'close-modal');
 assert.match(f.document.querySelector('[name="title"]').value,/^Conteggio di molle$/i);
});

test('manually edited name survives category/detail changes, saving and reopening',async t=>{
 const f=await setup(t);edit(f,'title','Controllo filare 4');await f.ui.whenIdle();
 await click(f,'category','[data-category="posts"]');await click(f,'counter-details');edit(f,'postType','Filare');edit(f,'postMaterial','Ferro');await f.ui.whenIdle();await click(f,'close-modal');
 assert.equal((await f.gateway.getReading()).title,'Controllo filare 4');await click(f,'confirm-count');await click(f,'open-count');
 edit(f,'postType','Testa');await f.ui.whenIdle();assert.equal(f.document.querySelector('[name="title"]').value,'Controllo filare 4');
 await click(f,'resume-count');await f.ui.destroy();f.settings.route={view:'resume'};f.ui=mountCountsUI(f.settings);await f.ui.ready;
 assert.equal(f.document.querySelector('[name="title"]').value,'Controllo filare 4');
 await click(f,'category','[data-category="other"]');assert.equal(f.document.querySelector('[name="title"]').value,'Controllo filare 4');
});

test('a manual title identical to the default remains authored after reopening',async t=>{
 const f=await setup(t);edit(f,'title','Conteggio barbatelle');await f.ui.whenIdle();assert.equal((await f.gateway.getReading()).titleMode,'manual');await f.ui.destroy();f.ui=mountCountsUI(f.settings);await f.ui.ready;
 await click(f,'category','[data-category="posts"]');assert.equal((await f.gateway.getReading()).title,'Conteggio barbatelle');
});

test('an authored default title survives explicit guest adoption into a new owner scope',async t=>{
 const f=await setup(t);edit(f,'title','Conteggio barbatelle');await f.ui.whenIdle();await click(f,'increment');await click(f,'confirm-count');
 const originalList=(await f.gateway.listRecentLists())[0],original=(await f.gateway.getList(originalList.listId)).counts[0];assert.equal(original.titleMode,'manual');
 await f.ui.destroy();await f.gateway.setScope(scope('registered-account'));await f.gateway.adoptGuestWork({sourceOwnerId:'guest-a',targetOwnerId:'registered-account',environment:'TEST'});
 f.settings.route={view:'counter',listId:original.listId,countId:original.countId};f.settings.titleStorage={getItem:()=>null,setItem(){}};f.ui=mountCountsUI(f.settings);await f.ui.ready;
 await click(f,'category','[data-category="posts"]');await click(f,'counter-details');edit(f,'postMaterial','Ferro');await f.ui.whenIdle();await click(f,'close-modal');
 const adopted=await f.gateway.getCount(original.listId,original.countId);assert.equal(adopted.title,'Conteggio barbatelle');assert.equal(adopted.titleMode,'manual');assert.equal(adopted.quantity,1);
});

test('detail edits interleaved with queued taps conserve quantity and counting feedback',async t=>{
 const f=await setup(t);for(let i=0;i<11;i++)f.document.querySelector('[data-action="increment"]').click();
 f.document.querySelector('[data-action="counter-details"]').click();await f.ui.whenIdle();
 edit(f,'varietyLabel','Nebbiolo');edit(f,'rootstockLabel','1103 Paulsen');
 for(let i=0;i<4;i++)f.document.querySelector('[data-action="increment"]').click();
 f.document.querySelector('[data-action="decrement"]').click();await f.ui.whenIdle();await click(f,'close-modal');
 const count=await f.gateway.getReading();assert.equal(count.quantity,14);assert.equal(count.varietyLabel,'Nebbiolo');assert.equal(count.rootstockLabel,'1103 Paulsen');
 assert.equal(f.document.querySelector('#quantity-display').textContent,'14');assert.equal(f.pulses.filter(action=>action==='increment').length,15);assert.equal(f.pulses.filter(action=>action==='decrement').length,1);
});

test('saved lowercase details display capitalized while preserving a custom saved title and quantity',async t=>{
 const f=await setup(t,{count:{category:'posts',title:'Pali della collina',postType:'testa',postMaterial:'castagno',quantity:37}});
 assert.deepEqual([...f.document.querySelectorAll('.counter-detail-summary span')].map(node=>node.textContent),['Testa','Castagno']);
 await click(f,'counter-details');assert.equal(f.document.querySelector('[name="postType"]').value,'Testa');assert.equal(f.document.querySelector('[name="postMaterial"]').value,'Castagno');
 edit(f,'postMaterial','Ferro');await f.ui.whenIdle();await click(f,'close-modal');
 const saved=await f.gateway.getCount(f.settings.route.listId,f.settings.route.countId);assert.equal(saved.title,'Pali della collina');assert.equal(saved.quantity,37);
 await click(f,'confirm-count');assert.match(f.document.querySelector('.reading-material').textContent,/Tipo palo: Testa/);assert.match(f.document.querySelector('.reading-material').textContent,/Materiale: Ferro/);
});

test('failed detail persistence keeps edits and queued impulses available for retry',async t=>{
 const f=await setup(t);await click(f,'counter-details');
 const original=f.gateway.updateReading;let available=false;
 f.gateway.updateReading=(...args)=>{if(!available){const error=new Error('Disco pieno');error.code='LOCAL_STORAGE_FAILED';throw error;}return original(...args);};
 edit(f,'varietyLabel','Barbera');edit(f,'rootstockLabel','Kober 5 BB');
 for(let i=0;i<3;i++)f.document.querySelector('[data-action="increment"]').click();await f.ui.whenIdle();
 assert.equal(f.document.querySelector('[name="varietyLabel"]').value,'Barbera');assert.equal(f.document.querySelector('[name="rootstockLabel"]').value,'Kober 5 BB');assert.equal(f.pulses.length,0);
 await assert.rejects(f.ui.prepareExit());available=true;await click(f,'retry');await click(f,'close-modal');
 const saved=await f.gateway.getReading();assert.equal(saved.quantity,3);assert.equal(saved.varietyLabel,'Barbera');assert.equal(saved.rootstockLabel,'Kober 5 BB');assert.match(saved.title,/Barbera/);assert.equal(f.pulses.length,3);
});

test('successful profile synchronization updates status while preserving the open detail input and quantity',async t=>{
 const f=await setup(t,{count:{category:'plants',title:'Conteggio barbatelle',titleMode:'auto',quantity:9},canSyncWithoutNotice:async()=>true,transport:{request:async(action,input)=>({value:{...input.value,revision:input.expectedRevision+1}})}});
 await click(f,'counter-details');edit(f,'varietyLabel','Barbera');await f.ui.whenIdle();
 const input=f.document.querySelector('[name="varietyLabel"]');await f.gateway.sync();await f.ui.whenIdle();
 assert.equal(f.document.querySelector('[name="varietyLabel"]'),input);assert.equal(input.value,'Barbera');assert.ok(f.document.querySelector('#counter-details-form'));assert.equal(f.document.querySelector('#quantity-display').textContent,'9');assert.equal(f.document.querySelector('#counts-status').textContent,'Sincronizzato');
 await click(f,'close-modal');await click(f,'confirm-count');assert.equal(f.document.querySelector('.count-row .sync-state').textContent,'Sincronizzato');
});

for(const editor of ['title','counter-details','notes'])test(`a delayed direct refresh preserves the active ${editor} editor and focus`,async t=>{
 let releasePull,beginPull;const pullHeld=new Promise(resolve=>{releasePull=resolve;}),pullStarted=new Promise(resolve=>{beginPull=resolve;});
 const transport={async request(action,input){if(action==='pull'){beginPull();await pullHeld;return {lists:[],counts:[]};}return {value:{...input.value,revision:input.expectedRevision+1}};}};
 const f=await setup(t,{count:{category:'plants',title:'Nome conservato',titleMode:'manual',quantity:9},canSyncWithoutNotice:async()=>true,transport});
 await f.gateway.sync();await f.ui.whenIdle();
 if(editor==='counter-details')await click(f,'counter-details');
 if(editor==='notes'){await click(f,'confirm-count');await click(f,'open-count');}
 const input=f.document.querySelector(`[name="${editor==='counter-details'?'varietyLabel':editor}"]`),dialog=f.document.querySelector('.counts-modal');
 Object.defineProperty(f.document,'activeElement',{get:()=>input,configurable:true});
 const refreshing=f.ui.refresh();await pullStarted;input.value='Modifica ancora in corso';
 input.dispatchEvent(new f.window.Event('input',{bubbles:true}));await f.ui.whenIdle();
 releasePull();await refreshing;await f.ui.whenIdle();
 assert.equal(f.document.querySelector(`[name="${input.name}"]`),input);assert.equal(f.document.activeElement,input);assert.equal(input.isConnected,true);assert.equal(input.value,'Modifica ancora in corso');
 if(dialog)assert.equal(f.document.querySelector('.counts-modal'),dialog);
 assert.equal(f.document.querySelector('#counts-status').textContent,'Sincronizzazione in attesa');
 const saved=await f.gateway.getCount(f.settings.route.listId,f.settings.route.countId);assert.equal(saved.quantity,9);assert.equal(saved[input.name],'Modifica ancora in corso');
});

test('unfinished readings keep their local indicator after profile refresh and preserve a storage error',async t=>{
 const transport={async request(action,input){return action==='pull'?{lists:[],counts:[]}:{value:{...input.value,revision:input.expectedRevision+1}};}};
 const f=await setup(t,{canSyncWithoutNotice:async()=>true,transport});await click(f,'increment');await f.ui.refresh();await f.ui.whenIdle();
 assert.equal(f.document.querySelector('#counts-status').textContent,'Salvato sul dispositivo');assert.equal((await f.gateway.getReading()).quantity,1);assert.equal((await f.gateway.listRecentLists()).length,0);
 f.document.body.insertAdjacentHTML('beforeend','<button type="button" data-action="sync">Sincronizza</button>');await click(f,'sync');assert.equal(f.document.querySelector('#counts-status').textContent,'Salvato sul dispositivo');
 const original=f.gateway.changeReadingQuantity;f.gateway.changeReadingQuantity=()=>{const error=new Error('Disco pieno');error.code='LOCAL_STORAGE_FAILED';throw error;};
 await click(f,'increment');const indicator=f.document.querySelector('#counts-status');assert.equal(indicator.textContent,'Disco pieno');assert.equal(indicator.getAttribute('role'),'alert');
 await f.ui.refresh();await f.ui.whenIdle();assert.equal(indicator.textContent,'Disco pieno');assert.equal(indicator.getAttribute('role'),'alert');await assert.rejects(f.ui.prepareExit());
 f.gateway.changeReadingQuantity=original;await click(f,'retry');assert.equal((await f.gateway.getReading()).quantity,2);
});

test('background acknowledgements and pulls preserve expanded categories by list and category',async t=>{
 const transport={async request(action,input){return action==='pull'?{lists:[],counts:[]}:{value:{...input.value,revision:input.expectedRevision+1}};}};
 const f=await setup(t,{count:{category:'plants',title:'Prima lettura',quantity:3},canSyncWithoutNotice:async()=>true,transport});
 const second=(await f.gateway.createList({title:'Secondo elenco'})).value;await f.gateway.createCount({listId:second.listId,category:'posts',title:'Seconda lettura',quantity:5});
 await click(f,'confirm-count');
 const selector=(listId,category)=>`.archive-list[data-list-id="${listId}"] .archive-category[data-category="${category}"]`;
 f.document.querySelector(selector(f.settings.route.listId,'plants')).setAttribute('open','');f.document.querySelector(selector(second.listId,'posts')).setAttribute('open','');
 await f.gateway.sync();await f.ui.whenIdle();
 for(const [listId,category] of [[f.settings.route.listId,'plants'],[second.listId,'posts']])assert.equal(f.document.querySelector(selector(listId,category)).hasAttribute('open'),true);
 assert.equal(f.document.querySelector(selector(f.settings.route.listId,'posts')).hasAttribute('open'),false);assert.equal(f.document.querySelector(selector(second.listId,'plants')).hasAttribute('open'),false);
 await f.ui.refresh();await f.ui.whenIdle();
 for(const [listId,category] of [[f.settings.route.listId,'plants'],[second.listId,'posts']])assert.equal(f.document.querySelector(selector(listId,category)).hasAttribute('open'),true);
 f.document.body.insertAdjacentHTML('beforeend','<button type="button" data-action="sync">Sincronizza</button>');await click(f,'sync');for(const [listId,category] of [[f.settings.route.listId,'plants'],[second.listId,'posts']])assert.equal(f.document.querySelector(selector(listId,category)).hasAttribute('open'),true);
 assert.equal(f.document.querySelector('#counts-status').textContent,'Sincronizzato');
});

test('saving details keeps the dialog until the next archive is ready and preserves the first row tap',async t=>{
 const f=await setup(t,{count:{category:'posts',title:'Conteggio pali',titleMode:'manual',quantity:2}});await click(f,'confirm-count');
 const groupSelector=`.archive-list[data-list-id="${f.settings.route.listId}"] .archive-category[data-category="posts"]`;
 f.document.querySelector(groupSelector).setAttribute('open','');await click(f,'open-count');edit(f,'postMaterial','Ferro');await f.ui.whenIdle();
 let releaseCheckpoint,beginCheckpoint;const checkpointHeld=new Promise(resolve=>{releaseCheckpoint=resolve;}),checkpointStarted=new Promise(resolve=>{beginCheckpoint=resolve;});const checkpoint=f.gateway.checkpoint;
 f.gateway.checkpoint=async(...args)=>{beginCheckpoint();await checkpointHeld;return checkpoint(...args);};
 const form=f.document.querySelector('#reading-details');f.document.querySelector('[data-action="save-details"]').click();await checkpointStarted;
 assert.equal(f.document.querySelector('#reading-details'),form);assert.equal(form.inert,true);assert.equal(form.getAttribute('aria-busy'),'true');assert.equal(f.document.querySelector(groupSelector).hasAttribute('open'),true);
 releaseCheckpoint();await f.ui.whenIdle();assert.equal(f.document.querySelector('#reading-details'),null);assert.equal(f.document.querySelector(groupSelector).hasAttribute('open'),true);
 await click(f,'open-count');assert.equal(f.document.querySelector('#reading-details [name="postMaterial"]').value,'Ferro');assert.equal(f.document.querySelector('#reading-details [name="title"]').value,'Conteggio pali');
 await click(f,'close-modal');assert.equal(f.document.querySelector(groupSelector).hasAttribute('open'),true);await click(f,'open-count');assert.ok(f.document.querySelector('#reading-details'));
});

test('editing the retained details after a committed save and failed checkpoint retries without a false conflict',async t=>{
 const f=await setup(t,{count:{category:'posts',title:'Conteggio pali',titleMode:'manual',quantity:7}});await click(f,'confirm-count');await click(f,'open-count');
 const before=await f.gateway.getCount(f.settings.route.listId,f.settings.route.countId),checkpoint=f.gateway.checkpoint;let available=false;
 f.gateway.checkpoint=(...args)=>{if(!available){const error=new Error('Salvataggio navigazione non disponibile');error.code='LOCAL_STORAGE_FAILED';throw error;}return checkpoint(...args);};
 await click(f,'save-details');const retained=f.document.querySelector('#reading-details');assert.ok(retained);assert.equal(retained.inert,false);assert.equal(retained.hasAttribute('aria-busy'),false);
 const committed=await f.gateway.getCount(f.settings.route.listId,f.settings.route.countId);assert.equal(committed.localRevision,before.localRevision+1);assert.equal(committed.quantity,7);
 edit(f,'postMaterial','Ferro');await f.ui.whenIdle();assert.equal(retained.querySelector('[name="postMaterial"]').value,'Ferro');await assert.rejects(f.ui.prepareExit());
 available=true;await click(f,'retry');
 const saved=await f.gateway.getCount(f.settings.route.listId,f.settings.route.countId);assert.equal(saved.postMaterial,'Ferro');assert.equal(saved.quantity,7);assert.equal(saved.title,'Conteggio pali');assert.equal(saved.titleMode,'manual');assert.equal(saved.localRevision,before.localRevision+2);assert.equal(saved.conflict,undefined);assert.notEqual(saved.syncState,'conflict');
 await f.ui.prepareExit();assert.equal(f.document.querySelector('#retry-save').hidden,true);
});

for(const action of ['save-details','close-modal'])test(`a previous owner's delayed ${action} cannot close the current owner's detail dialog`,async t=>{
 const f=await setup(t,{count:{category:'posts',title:'Lettura del primo profilo',titleMode:'manual',quantity:2}});await click(f,'confirm-count');await click(f,'open-count');
 const listLists=f.gateway.listLists;let releaseArchive,beginArchive,once=true;const archiveHeld=new Promise(resolve=>{releaseArchive=resolve;}),archiveStarted=new Promise(resolve=>{beginArchive=resolve;});
 f.gateway.listLists=async(...args)=>{const result=await listLists(...args);if(once){once=false;beginArchive();await archiveHeld;}return result;};
 f.document.querySelector(`[data-action="${action}"]`).click();const previousOwnerAction=f.ui.whenIdle();await archiveStarted;
 await f.gateway.setScope(scope('second-owner'));await f.ui.whenIdle();await click(f,'counter-details');const currentDialog=f.document.querySelector('.counts-modal');assert.ok(currentDialog.querySelector('#counter-details-form'));
 releaseArchive();await previousOwnerAction;await f.ui.whenIdle();
 assert.equal(f.document.querySelector('.counts-modal'),currentDialog);assert.ok(f.document.querySelector('#counter-details-form'));assert.equal(f.gateway.getScope().owner,'second-owner');assert.equal((await f.gateway.getReading()).quantity,0);
});
