import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {mountCountsUI} from '../conteggi/ui.js';
import {createCountsFeedback} from '../conteggi/feedback.js';
import {mountCountsDesktopSummary} from '../src/counts-desktop-summary.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const gatewayFor=transport=>createCountsGateway({store:createCountsStore({indexedDB:new IDBFactory()}),scope:scope(),channel:false,transport});
const dom=()=>parseHTML('<html><body><div class="topbar-actions"></div><main id="counts-main"></main><p id="counts-status"></p><button data-action="sync">Sincronizza</button><button id="retry-save" hidden></button></body></html>');

test('sync status includes unsent operations and preserves separate conflicts',async t=>{
 const gateway=gatewayFor({request:async()=>{throw new Error('offline');}});t.after(()=>gateway.destroy());
 await gateway.createList({title:'Rimesse'});
 const status=await gateway.getSyncStatus();
 assert.equal(status.pending,1);assert.equal(status.acknowledged,false);assert.equal(status.enabled,true);
});

test('sync button reports pending work without claiming completed synchronization',async t=>{
 const {document,window}=dom(),gateway=gatewayFor({request:async()=>{throw new Error('offline');}});t.after(()=>gateway.destroy());
 await gateway.createList({title:'Rimesse'});
 const ui=mountCountsUI({document,window,gateway,config:{syncEnabled:true},route:{view:'lists'}});await ui.ready;t.after(()=>ui.destroy());
 document.querySelector('[data-action="sync"]').click();await ui.whenIdle();
 assert.doesNotMatch(document.querySelector('#counts-status').textContent,/verificata|sincronizzati$/i);
 assert.match(document.querySelector('#counts-status').textContent,/avviso|attesa|dispositivo/i);
});

test('feedback confirms successful local mutations and never confirms a failed tap',async t=>{
 const {document,window}=dom(),gateway=gatewayFor();t.after(()=>gateway.destroy());
 const list=(await gateway.createList({title:'Rimesse'})).value,count=(await gateway.createCount({listId:list.listId,category:'plants'})).value;
 const pulses=[];let saving=false;const change=gateway.changeQuantity;
 gateway.changeQuantity=async(...args)=>{saving=true;return change(...args);};
 const ui=mountCountsUI({document,window,gateway,route:{view:'counter',listId:list.listId,countId:count.countId},feedback:{pulse:action=>{assert.equal(saving,true);pulses.push(action);}}});await ui.ready;t.after(()=>ui.destroy());
 document.querySelector('[data-action="increment"]').click();await ui.whenIdle();assert.deepEqual(pulses,['increment']);
 document.querySelector('[data-action="decrement"]').click();await ui.whenIdle();assert.deepEqual(pulses,['increment','decrement']);
 gateway.changeQuantity=async()=>{const error=new Error('Disco pieno');error.code='LOCAL_STORAGE_FAILED';throw error;};
 document.querySelector('[data-action="increment"]').click();await ui.whenIdle();assert.equal(pulses.length,2);assert.equal((await gateway.getCount(list.listId,count.countId)).quantity,0);
});

test('increment and decrement use different audio and haptic patterns',async()=>{
 const tones=[],patterns=[];
 class Audio{constructor(){this.currentTime=0;this.destination={};}resume(){return Promise.resolve();}createOscillator(){const oscillator={frequency:{value:0},connect(){},start(){tones.push(oscillator.frequency.value);},stop(){}};return oscillator;}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}}
 const feedback=createCountsFeedback({AudioContext:Audio,storage:null,navigator:{vibrate:value=>patterns.push(value)}});feedback.setPreferences({sound:true,haptic:true});
 feedback.pulse('increment');await turn();feedback.pulse('decrement');await turn();assert.equal(tones.length,2);assert.notEqual(tones[0],tones[1]);assert.notDeepEqual(patterns[0],patterns[1]);
});

test('a failed identity checkpoint leaves the current count visible and blocks the change',async t=>{
 const {document,window}=dom(),gateway=gatewayFor();t.after(()=>gateway.destroy());const list=(await gateway.createList({title:'Rimesse'})).value,count=(await gateway.createCount({listId:list.listId,category:'plants',quantity:4})).value;
 const ui=mountCountsUI({document,window,gateway,route:{view:'counter',listId:list.listId,countId:count.countId}});await ui.ready;t.after(()=>ui.destroy());
 gateway.checkpoint=async()=>{throw new Error('Storage full');};await assert.rejects(ui.prepareIdentityChange(),/Storage full/);assert.equal(document.querySelector('#quantity-display').textContent,'4');
});

test('desktop summary edits the same stored count and rejects a stale concurrent edit',async t=>{
 const {document}=dom(),gateway=gatewayFor();t.after(()=>gateway.destroy());
 const list=(await gateway.createList({title:'Rimesse'})).value,count=(await gateway.createCount({listId:list.listId,category:'plants',title:'Barbera',quantity:3})).value;
 const ui=mountCountsDesktopSummary({document,gateway,onOpen:()=>{}});t.after(()=>ui.destroy());
 document.querySelector('#desktop-counts-trigger').click();await ui.whenIdle();
 assert.match(document.querySelector('#desktop-counts-panel').textContent,/Barbera/);
 document.querySelector('[data-counts-edit]').click();
 document.querySelector('[name="countsTitle"]').value='Nebbiolo';document.querySelector('[name="countsQuantity"]').value='12';
 document.querySelector('[data-counts-save]').click();await ui.whenIdle();
 assert.equal((await gateway.getCount(list.listId,count.countId)).quantity,12);assert.equal((await gateway.getCount(list.listId,count.countId)).title,'Nebbiolo');
 document.querySelector('[data-counts-edit]').click();document.querySelector('[name="countsQuantity"]').value='20';
 await gateway.changeQuantity(list.listId,count.countId,'increment');await turn();
 document.querySelector('[data-counts-save]').click();await ui.whenIdle();
 assert.equal((await gateway.getCount(list.listId,count.countId)).quantity,13);
 assert.equal(document.querySelector('[name="countsQuantity"]').value,'20');
 assert.match(document.querySelector('[data-counts-feedback]').textContent,/modificati|ricarica|conflitto/i);
});
