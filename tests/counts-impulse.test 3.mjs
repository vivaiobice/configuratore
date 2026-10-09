import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {mountCountsUI} from '../conteggi/ui.js';
import {parseCountsUrl} from '../conteggi/navigation.js';
import {createCountsFeedback} from '../conteggi/feedback.js';

function setup(){
 const {document,window}=parseHTML('<html><body><main id="counts-main"></main><p id="counts-status"></p><button id="retry-save" data-action="retry" hidden></button></body></html>');
 const store=createCountsStore({indexedDB:new IDBFactory()});
 const gateway=createCountsGateway({store,scope:scope(),channel:false});
 return {document,window,store,gateway};
}
const click=async(s,action)=>{const target=s.document.querySelector(`[data-action="${action}"]`);assert.ok(target,action);target.click();await s.ui.whenIdle();};

test('direct entry is ready to count and save finishes into one daily list',async t=>{
 const s=setup();s.ui=mountCountsUI({...s,route:parseCountsUrl('https://example.test/conteggi/')});
 t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 assert.ok(s.document.querySelector('[data-action="increment"]'));
 assert.equal(s.document.querySelector('#quantity-display').textContent,'0');
 assert.equal(s.document.querySelector('[name="title"]').value,'Conteggio barbatelle');
 assert.equal(s.document.querySelector('select'),null);
 for(let i=0;i<17;i++)s.document.querySelector('[data-action="increment"]').click();await s.ui.whenIdle();
 await click(s,'confirm-count');assert.ok(s.document.querySelector('[data-action="open-count"]'));
 const lists=await s.gateway.listRecentLists();assert.equal(lists.length,1);assert.equal((await s.gateway.getList(lists[0].listId)).counts[0].quantity,17);
 await click(s,'add-count');await click(s,'increment');await click(s,'confirm-count');
 assert.equal((await s.gateway.listRecentLists()).length,1);assert.equal((await s.gateway.getList(lists[0].listId)).counts.length,2);
 assert.equal(await s.gateway.getReading(),null);
});

test('unfinished impulses survive reload, type selection and cancellation of reset',async t=>{
 const s=setup();s.ui=mountCountsUI({...s,route:{view:'resume'}});await s.ui.ready;
 for(let i=0;i<5;i++)s.document.querySelector('[data-action="increment"]').click();await s.ui.whenIdle();
 await s.ui.prepareExit();await s.ui.destroy();
 s.ui=mountCountsUI({...s,route:{view:'resume'}});t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 assert.equal(s.document.querySelector('#quantity-display').textContent,'5');
 s.document.querySelector('[data-action="category"][data-category="posts"]').click();await s.ui.whenIdle();
 assert.equal((await s.gateway.getReading()).category,'posts');assert.equal((await s.gateway.getReading()).quantity,5);
 await click(s,'reset');assert.equal((await s.gateway.getReading()).quantity,5);await click(s,'close-modal');
 await click(s,'decrement');assert.equal(s.document.querySelector('#quantity-display').textContent,'4');
 await click(s,'reset');await click(s,'confirm-reset');assert.equal(s.document.querySelector('#quantity-display').textContent,'0');
 assert.equal(s.document.querySelector('[data-action="decrement"]').disabled,true);
});

test('failed local impulse gives no success feedback and retry conserves all taps',async t=>{
 const s=setup();let pulses=0;const original=s.store.mutate;let available=true;
 s.store.mutate=(...args)=>{if(!available){const e=new Error('Storage pieno');e.code='LOCAL_STORAGE_FAILED';throw e;}return original(...args);};
 s.ui=mountCountsUI({...s,route:{view:'resume'},feedback:{pulse(){pulses++;},getPreferences:()=>({sound:true,haptic:true}),capabilities:{sound:true,haptic:true}}});
 t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 available=false;for(let i=0;i<3;i++)s.document.querySelector('[data-action="increment"]').click();await s.ui.whenIdle();
 assert.equal(pulses,0);assert.equal(s.document.body.classList.contains('impulse-flash'),false);await assert.rejects(s.ui.prepareExit());
 available=true;await click(s,'retry');assert.equal((await s.gateway.getReading()).quantity,3);assert.equal(pulses,3);
});

test('reading finalization is atomic, idempotent and scoped to its owner',async t=>{
 const s=setup();t.after(async()=>{await s.gateway.destroy();await s.store.close();});
 const reading=await s.gateway.startReading({title:'Lettura',category:'plants'});
 await s.gateway.changeReadingQuantity(reading.countId,'increment');
 const operationId=crypto.randomUUID();const input={countId:reading.countId,operationId};
 const saved=await s.gateway.finishReading(input);assert.deepEqual(await s.gateway.finishReading(input),saved);
 assert.equal((await s.gateway.getList(saved.value.listId)).counts.length,1);
 const second=await s.gateway.startReading({title:'Altra lettura',category:'posts'});
 await assert.rejects(s.gateway.changeReadingQuantity(reading.countId,'increment'),e=>e.code==='NOT_FOUND_OR_FORBIDDEN');
 await s.gateway.setScope(scope('other-owner'));assert.equal(await s.gateway.getReading(),null);assert.equal((await s.gateway.listRecentLists()).length,0);
 await s.gateway.setScope(scope());assert.equal((await s.gateway.getReading()).countId,second.countId);
});

test('saved reading can move lists with quantity and rootstock retained',async t=>{
 const s=setup();t.after(async()=>{await s.gateway.destroy();await s.store.close();});
 const reading=await s.gateway.startReading({category:'plants',title:'Lettura'});await s.gateway.changeReadingQuantity(reading.countId,'increment');
 const saved=(await s.gateway.finishReading({countId:reading.countId})).value;
 const other=(await s.gateway.createList({title:'Rimesse collina'})).value;
 const moved=(await s.gateway.updateCount({listId:saved.listId,countId:saved.countId,expectedRevision:saved.revision,expectedLocalRevision:saved.localRevision,operationId:crypto.randomUUID(),patch:{listId:other.listId,varietyLabel:'Barbera N.',rootstockLabel:'Kober 5 BB'}})).value;
 assert.equal(moved.quantity,1);assert.equal((await s.gateway.getList(saved.listId)).counts.length,0);
 assert.equal((await s.gateway.getCount(other.listId,saved.countId)).rootstockLabel,'Kober 5 BB');
});

test('icon toggles persist feedback preferences and a committed tap flashes the screen',async t=>{
 const s=setup(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const feedback=createCountsFeedback({storage,navigator:{vibrate(){}},AudioContext:class {resume(){return Promise.resolve();}}});
 let frame;s.window.requestAnimationFrame=fn=>{frame=fn;};
 s.ui=mountCountsUI({...s,route:{view:'resume'},feedback});t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 const audio=s.document.querySelector('[data-preference="sound"]');assert.equal(audio.getAttribute('aria-pressed'),'false');audio.click();await s.ui.whenIdle();
 assert.equal(s.document.querySelector('[data-preference="sound"]').getAttribute('aria-pressed'),'true');
 s.document.querySelector('[data-preference="haptic"]').click();await s.ui.whenIdle();
 assert.deepEqual(createCountsFeedback({storage}).getPreferences(),{sound:true,haptic:false});
 await click(s,'increment');assert.equal((await s.gateway.getReading()).quantity,1);frame();assert.equal(s.document.body.classList.contains('impulse-flash'),true);
});

test('details save material and field and can create a new destination list',async t=>{
 const s=setup();const projectId=crypto.randomUUID(),field={projectId,fieldId:'filare-1',projectLabel:'Collina',fieldLabel:'Campo sud',associationStatus:'verified'};
 s.ui=mountCountsUI({...s,route:{view:'resume'},varietyCatalog:['Barbera N.'],fieldDirectory:{listProjects:async()=>[{projectId,projectLabel:'Collina'}],listFields:async()=>[{fieldId:'filare-1',fieldLabel:'Campo sud'}],resolveField:async()=>field}});
 t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;await click(s,'increment');await click(s,'confirm-count');await click(s,'open-count');
 for(const [name,value] of [['varietyLabel','Barbera N.'],['rootstockLabel','Kober 5 BB'],['notes','Filare 2']]){const input=s.document.querySelector(`[name="${name}"]`);input.value=value;input.dispatchEvent(new s.window.Event('input',{bubbles:true}));}
 await s.ui.whenIdle();await click(s,'change-field');await click(s,'field-project');s.document.querySelector('[data-action="choose-field"][data-field-id="filare-1"]').click();await s.ui.whenIdle();await click(s,'save-field');
 await click(s,'details-new-list');s.document.querySelector('[name="listTitle"]').value='Rimesse collina';await click(s,'move-new-list');
 assert.equal(s.document.querySelector('.list-heading h2').textContent,'Rimesse collina');
 const list=(await s.gateway.listRecentLists()).find(l=>l.title==='Rimesse collina');const count=(await s.gateway.getList(list.listId)).counts[0];
 assert.equal(count.quantity,1);assert.equal(count.rootstockLabel,'Kober 5 BB');assert.equal(count.notes,'Filare 2');assert.deepEqual(count.field,field);
});

test('explicit guest adoption conserves an unfinished reading and retains a conflicting one',async t=>{
 const s=setup();t.after(async()=>{await s.gateway.destroy();await s.store.close();});assert.equal(await s.gateway.hasLocalWork(),false);
 const guest=await s.gateway.startReading();assert.equal(await s.gateway.hasLocalWork(),false);
 await s.gateway.changeReadingQuantity(guest.countId,'increment');assert.equal(await s.gateway.hasLocalWork(),true);
 await s.gateway.setScope(scope('account'));const own=await s.gateway.startReading();await s.gateway.changeReadingQuantity(own.countId,'increment');
 await s.gateway.adoptGuestWork({sourceOwnerId:'guest-a',targetOwnerId:'account',environment:'TEST'});
 assert.equal((await s.gateway.getReading()).countId,own.countId);const proposal=(await s.gateway.listRecoveryProposals()).find(p=>p.local.countId===guest.countId);assert.equal(proposal.local.quantity,1);
});

test('resuming an unchanged reading does not broadcast a write to other tabs',async t=>{
 const s=setup();t.after(async()=>{await s.gateway.destroy();await s.store.close();});let events=0;s.gateway.subscribe(e=>{if(e.reason==='reading')events++;});
 const first=await s.gateway.startReading();assert.equal(events,1);
 for(let i=0;i<5;i++)assert.equal((await s.gateway.startReading()).countId,first.countId);
 assert.equal(events,1);
});

test('an unfinished reading recovers into its daily list if its destination was deleted',async t=>{
 const s=setup();t.after(async()=>{await s.gateway.destroy();await s.store.close();});
 const list=(await s.gateway.createList({title:'Elenco temporaneo'})).value;
 const draft=await s.gateway.startReading({listId:list.listId});await s.gateway.changeReadingQuantity(draft.countId,'increment');
 await s.gateway.deleteList(list.listId,list.localRevision);const saved=(await s.gateway.finishReading({countId:draft.countId})).value;
 assert.notEqual(saved.listId,list.listId);assert.equal(saved.countId,draft.countId);assert.equal(saved.quantity,1);
 await assert.rejects(s.gateway.getList(list.listId),e=>e.code==='NOT_FOUND_OR_FORBIDDEN');assert.equal((await s.gateway.getList(saved.listId)).counts.length,1);
});

test('retry after a committed move and failed checkpoint uses the original command',async t=>{
 const s=setup();s.ui=mountCountsUI({...s,route:{view:'resume'}});t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 await click(s,'increment');await click(s,'confirm-count');await click(s,'open-count');await click(s,'details-new-list');s.document.querySelector('[name="listTitle"]').value='Nuovo elenco';
 const original=s.gateway.checkpoint;let fail=true;s.gateway.checkpoint=(...args)=>{if(fail){fail=false;const error=new Error('Storage pieno');error.code='LOCAL_STORAGE_FAILED';throw error;}return original(...args);};
 await click(s,'move-new-list');await assert.rejects(s.ui.prepareExit());await click(s,'retry');await s.ui.prepareExit();
 const lists=(await s.gateway.listRecentLists()).filter(l=>l.title==='Nuovo elenco');assert.equal(lists.length,1);assert.equal((await s.gateway.getList(lists[0].listId)).counts[0].quantity,1);
});

test('destination picker can reach lists older than its first page',async t=>{
 const s=setup();const oldest=(await s.gateway.createList({title:'Vecchio elenco'})).value;
 for(let i=0;i<100;i++)await s.gateway.createList({title:`Elenco ${i}`});
 await s.store.mutate(scope(),state=>{state.lists[oldest.listId].updatedAt='2020-01-01T00:00:00.000Z';});
 s.ui=mountCountsUI({...s,route:{view:'resume'}});t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 await click(s,'increment');await click(s,'confirm-count');await click(s,'open-count');await click(s,'more-destinations');
 s.document.querySelector(`[data-action="choose-destination"][data-list-id="${oldest.listId}"]`).click();await s.ui.whenIdle();await click(s,'save-details');
 assert.equal((await s.gateway.getList(oldest.listId)).counts.length,1);
});

test('a late field lookup cannot write the former owner field into the new reading',async t=>{
 const s=setup(),projectId=crypto.randomUUID();let release,started;const ready=new Promise(r=>started=r),fieldResult=new Promise(r=>release=r);
 s.ui=mountCountsUI({...s,route:{view:'new',projectId,fieldId:'campo-a'},fieldDirectory:{resolveField:async()=>{started();return fieldResult;}}});
 t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await ready;
 await s.gateway.setScope(scope('account-b'));release({projectId,fieldId:'campo-a',projectLabel:'Privato A',fieldLabel:'Campo A',associationStatus:'verified'});await s.ui.ready;await s.ui.whenIdle();
 assert.equal((await s.gateway.getReading()).field,null);
});

test('pending local field context stays bound to the owner that opened the counter',async t=>{
 const s=setup();s.ui=mountCountsUI({...s,route:{view:'new'},pendingFieldContext:{ownerId:'guest-a',environment:'TEST',localProjectId:'bozza-a',localFieldId:'campo-a',projectLabel:'Privato A',fieldLabel:'Campo A',varietyLabel:'Barbera'}});
 t.after(async()=>{await s.ui.destroy();await s.gateway.destroy();await s.store.close();});await s.ui.ready;
 assert.equal((await s.gateway.getReading()).field.fieldLabel,'Campo A');await s.gateway.setScope(scope('account-b'));await s.ui.whenIdle();assert.equal((await s.gateway.getReading()).field,null);
});
