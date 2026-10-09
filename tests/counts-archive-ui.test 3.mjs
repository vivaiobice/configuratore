import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {mountCountsUI} from '../conteggi/ui.js';

async function setup(t,route,options={}){
 const {document,window}=parseHTML('<html><body><main id="counts-main"></main><p id="counts-status"></p><button id="retry-save" data-action="retry" hidden></button></body></html>');
 const store=createCountsStore({indexedDB:new IDBFactory()}),gateway=createCountsGateway({store,scope:scope(),channel:false});
 const a=(await gateway.createList({title:'Collina'})).value,b=(await gateway.createList({title:'Fondovalle'})).value;
 const vine=(await gateway.createCount({listId:a.listId,title:'Barbera',category:'plants',quantity:12})).value;
 const post=(await gateway.createCount({listId:b.listId,title:'Pali sud',category:'posts',quantity:7})).value;
 const f={document,window,store,gateway,a,b,vine,post};
 f.ui=mountCountsUI({...f,route:route?.(f)??{view:'lists'},...options});await f.ui.ready;
 t.after(async()=>{await f.ui.destroy();await gateway.destroy();await store.close();});return f;
}
async function click(f,action,listId){const selector=`[data-action="${action}"]${listId?`[data-list-id="${listId}"]`:''}`,target=f.document.querySelector(selector);assert.ok(target,selector);target.click();await f.ui.whenIdle();}

test('legacy individual list route shows every existing list with expandable category totals',async t=>{
 const f=await setup(t,f=>({view:'list',listId:f.a.listId}));
 const cards=[...f.document.querySelectorAll('.archive-list')];assert.equal(cards.length,2);
 const a=f.document.querySelector(`.archive-list[data-list-id="${f.a.listId}"]`),b=f.document.querySelector(`.archive-list[data-list-id="${f.b.listId}"]`);
 assert.equal(a.querySelector('[data-category="plants"] summary strong').textContent,'12');
 assert.equal(b.querySelector('[data-category="posts"] summary strong').textContent,'7');
 assert.equal(a.querySelectorAll('.archive-category').length,3);
 assert.match(a.textContent,/Barbatelle \/ Viti/);assert.equal(a.querySelector('.archive-category').hasAttribute('open'),false);
 await click(f,'open-count',f.b.listId);assert.equal(f.document.querySelector('#reading-details').dataset.countId,f.post.countId);
 f.document.querySelector('[name="quantity"]').value='15';await click(f,'save-details');
 assert.equal((await f.gateway.getCount(f.b.listId,f.post.countId)).quantity,15);
 assert.equal((await f.gateway.getCount(f.a.listId,f.vine.countId)).quantity,12);
 assert.equal(f.document.querySelectorAll('.archive-list').length,2);
});

test('list actions and moves keep the clicked card context while archive remains one screen',async t=>{
 const f=await setup(t,f=>({view:'list',listId:f.a.listId}));
 await click(f,'rename-list',f.b.listId);f.document.querySelector('[name="listTitle"]').value='Pali fondovalle';await click(f,'save-list-title');
 assert.equal((await f.gateway.getList(f.b.listId)).list.title,'Pali fondovalle');assert.equal((await f.gateway.getList(f.a.listId)).list.title,'Collina');
 await click(f,'open-count',f.a.listId);await click(f,'details-new-list');f.document.querySelector('[name="listTitle"]').value='Nuovo elenco';await click(f,'move-new-list');
 const destination=(await f.gateway.listRecentLists()).find(l=>l.title==='Nuovo elenco');
 assert.equal((await f.gateway.getList(destination.listId)).counts[0].countId,f.vine.countId);
 assert.equal(f.document.querySelectorAll('.archive-list').length,3);
 await click(f,'delete-list',f.b.listId);await click(f,'confirm-delete-list');
 await assert.rejects(f.gateway.getList(f.b.listId));assert.equal(f.document.querySelectorAll('.archive-list').length,2);
});

test('archive follows every list page so older lists and their readings remain reachable',async t=>{
 const f=await setup(t);await f.ui.destroy();
 for(let i=0;i<103;i++)await f.gateway.createList({title:`Elenco ${i}`});
 f.ui=mountCountsUI({...f,route:{view:'lists'}});await f.ui.ready;
 assert.equal(f.document.querySelectorAll('.archive-list').length,105);
 await click(f,'open-count',f.a.listId);assert.equal(f.document.querySelector('[name="title"]').value,'Barbera');
});

test('details expose material fields for the selected category and preserve hidden metadata',async t=>{
 const f=await setup(t);
 await click(f,'open-count',f.b.listId);
 assert.ok(f.document.querySelector('[name="postType"]'));assert.ok(f.document.querySelector('[name="postMaterial"]'));
 assert.equal(f.document.querySelector('[name="varietyLabel"]'),null);
 for(const [name,value] of [['postType','testa'],['postMaterial','castagno']]){const input=f.document.querySelector(`[name="${name}"]`);input.value=value;input.dispatchEvent(new f.window.Event('input',{bubbles:true}));}
 await f.ui.whenIdle();await click(f,'save-details');
 const post=await f.gateway.getCount(f.b.listId,f.post.countId);assert.equal(post.postType,'testa');assert.equal(post.postMaterial,'castagno');
 await click(f,'open-count',f.b.listId);await click(f,'resume-count');f.document.querySelector('[data-action="category"][data-category="other"]').click();await f.ui.whenIdle();await click(f,'confirm-count');await click(f,'open-count',f.b.listId);
 assert.ok(f.document.querySelector('[name="componentType"]'));assert.equal(f.document.querySelector('[name="postType"]'),null);
 const component=f.document.querySelector('[name="componentType"]');component.value='ancore';component.dispatchEvent(new f.window.Event('input',{bubbles:true}));await f.ui.whenIdle();await click(f,'save-details');
 const changed=await f.gateway.getCount(f.b.listId,f.post.countId);assert.equal(changed.componentType,'ancore');assert.equal(changed.postMaterial,'castagno');
});

test('submission draft belongs to the clicked list even when a different legacy list route is active',async t=>{
 const f=await setup(t,f=>({view:'list',listId:f.a.listId}));await f.ui.destroy();
 f.ui=mountCountsUI({...f,route:{view:'list',listId:f.a.listId},config:{submitEnabled:true},authService:{getState:()=>({firstName:'Mario',lastName:'Rossi',email:'test@example.com',phone:'123'})}});await f.ui.ready;
 await click(f,'review',f.b.listId);
 assert.match(f.document.querySelector('.review-rows').textContent,/Pali sud/);assert.doesNotMatch(f.document.querySelector('.review-rows').textContent,/Barbera/);
 const message=f.document.querySelector('[name="message"]');message.value='Richiesta pali';message.dispatchEvent(new f.window.Event('input',{bubbles:true}));await f.ui.whenIdle();
 assert.equal((await f.gateway.getSubmissionDraft(f.b.listId)).message,'Richiesta pali');assert.equal(await f.gateway.getSubmissionDraft(f.a.listId),null);
 await click(f,'close-modal');await click(f,'review',f.a.listId);assert.match(f.document.querySelector('.review-rows').textContent,/Barbera/);
});

async function returnToOwnerAndRetry(f,action){
 f.document.querySelector(`[data-action="${action}"]`).click();
 await f.gateway.setScope(scope('another-owner'));await f.ui.whenIdle();
 await f.gateway.setScope(scope());await f.ui.whenIdle();
 assert.equal(f.document.querySelector('#retry-save').hidden,false);
 await click(f,'retry');
}

test('queued resume returns to the original reading after switching away and retrying in its owner',async t=>{
 const f=await setup(t,f=>({view:'list',listId:f.b.listId}));await click(f,'open-count',f.a.listId);
 await returnToOwnerAndRetry(f,'resume-count');
 assert.equal(f.document.querySelector('#quantity-display')?.textContent,'12');
 assert.equal(f.document.querySelector('[name="title"]')?.value,'Barbera');
 assert.equal((await f.gateway.getCount(f.b.listId,f.post.countId)).quantity,7);
});

test('queued delete confirmation targets the original reading after the archive restores its owner',async t=>{
 const f=await setup(t,f=>({view:'list',listId:f.b.listId}));await click(f,'open-count',f.a.listId);
 await returnToOwnerAndRetry(f,'delete-count');
 assert.ok(f.document.querySelector('[data-action="confirm-delete-count"]'));
 await click(f,'confirm-delete-count');await assert.rejects(f.gateway.getCount(f.a.listId,f.vine.countId));
 assert.equal((await f.gateway.getCount(f.b.listId,f.post.countId)).quantity,7);
});

test('queued move creates one destination and moves its captured reading after account restoration',async t=>{
 const f=await setup(t,f=>({view:'list',listId:f.b.listId}));await click(f,'open-count',f.a.listId);await click(f,'details-new-list');
 f.document.querySelector('[name="listTitle"]').value='Destinazione conservata';
 await returnToOwnerAndRetry(f,'move-new-list');
 const destinations=(await f.gateway.listRecentLists()).filter(l=>l.title==='Destinazione conservata');assert.equal(destinations.length,1);
 const counts=(await f.gateway.getList(destinations[0].listId)).counts;assert.equal(counts.length,1);assert.equal(counts[0].countId,f.vine.countId);assert.equal(counts[0].quantity,12);
 assert.equal((await f.gateway.getCount(f.b.listId,f.post.countId)).quantity,7);
});

test('queued field association preserves selected field and reading after its modal closes on identity change',async t=>{
 const projectId=crypto.randomUUID(),field={projectId,fieldId:'campo-sud',projectLabel:'Collina',fieldLabel:'Campo sud',associationStatus:'verified'};
 const f=await setup(t,f=>({view:'list',listId:f.b.listId}),{fieldDirectory:{listProjects:async()=>[{projectId,projectLabel:'Collina'}],listFields:async()=>[{fieldId:'campo-sud',fieldLabel:'Campo sud'}],resolveField:async()=>field}});
 await click(f,'open-count',f.a.listId);await click(f,'change-field');await click(f,'field-project');
 f.document.querySelector('[data-action="choose-field"][data-field-id="campo-sud"]').click();await f.ui.whenIdle();
 await returnToOwnerAndRetry(f,'save-field');
 assert.deepEqual((await f.gateway.getCount(f.a.listId,f.vine.countId)).field,field);
 assert.equal((await f.gateway.getCount(f.b.listId,f.post.countId)).field,null);
 assert.equal(f.document.querySelector('#reading-details')?.dataset.countId,f.vine.countId);
});

for(const parked of [false,true])test(`rapid duplicate field save ${parked?'after owner restoration':'in the active owner'} does not create a false conflict`,async t=>{
 const projectId=crypto.randomUUID(),field={projectId,fieldId:'campo-nord',projectLabel:'Collina',fieldLabel:'Campo nord',associationStatus:'verified'};
 const f=await setup(t,f=>({view:'list',listId:f.b.listId}),{fieldDirectory:{listProjects:async()=>[{projectId,projectLabel:'Collina'}],listFields:async()=>[{fieldId:'campo-nord',fieldLabel:'Campo nord'}],resolveField:async()=>field}});
 await click(f,'open-count',f.a.listId);await click(f,'change-field');await click(f,'field-project');
 f.document.querySelector('[data-action="choose-field"][data-field-id="campo-nord"]').click();await f.ui.whenIdle();
 const save=f.document.querySelector('[data-action="save-field"]');save.click();save.click();
 if(parked){await f.gateway.setScope(scope('another-owner'));await f.ui.whenIdle();await f.gateway.setScope(scope());await f.ui.whenIdle();await click(f,'retry');}else await f.ui.whenIdle();
 const count=await f.gateway.getCount(f.a.listId,f.vine.countId);assert.deepEqual(count.field,field);assert.notEqual(count.syncState,'conflict');
 assert.equal((await f.gateway.getCount(f.b.listId,f.post.countId)).field,null);
});
