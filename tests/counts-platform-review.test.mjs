import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {createCountsRuntime} from '../conteggi/runtime.js';
import {createAuthService} from '../src/auth-service.js';
import {rememberCountsOwner,readCountsOfflineOwner} from '../src/counts-offline-owner.js';
import {createProfileUI} from '../src/profile-ui.js';
import {parseHTML} from 'linkedom';

const ownerA='00000000-0000-4000-8000-000000000010',ownerB='00000000-0000-4000-8000-000000000011';
const config={backendUrl:'https://backend.example',environment:'TEST'};
const localStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('sign-out clears the offline owner immediately and stale markers cannot restore another SDK identity',async t=>{
 const storage=localStorage(),previousDB=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();let callback;
 t.after(()=>globalThis.indexedDB=previousDB);
 const session={user:{id:ownerA,is_anonymous:false}};storage.setItem('sb-backend-auth-token',JSON.stringify(session));rememberCountsOwner(storage,config,{user:session.user,kind:'user'});
 const client={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}};
 const runtime=await createCountsRuntime({config,storage,client,backendFactory:()=>({getProfile:async()=>null}),authFactory:()=>({refresh:async()=>{}})});t.after(()=>runtime.destroy());
 await runtime.gateway.createList({title:'Solo A'});callback('SIGNED_OUT',null);
 assert.equal(readCountsOfflineOwner(storage,config),null);
 rememberCountsOwner(storage,config,{user:session.user,kind:'user'});storage.setItem('sb-backend-auth-token',JSON.stringify({user:{id:ownerB}}));assert.equal(readCountsOfflineOwner(storage,config),null);
});

test('late profile A cannot roll Auth back after refresh B',async()=>{
 let session={user:{id:ownerA,is_anonymous:false}},finishA,startedA;
 const started=new Promise(resolve=>startedA=resolve),waiting=new Promise(resolve=>finishA=resolve);
 const auth=createAuthService({client:{auth:{getSession:async()=>({data:{session}})}},backend:{getProfile:async id=>{if(id===ownerA){startedA();return waiting;}return {display_name:'B'};}}});
 const first=auth.refresh();await started;session={user:{id:ownerB,is_anonymous:false}};await auth.refresh();finishA({display_name:'A'});await first;
 assert.equal(auth.getState().user.id,ownerB);
});

test('profile transport failure permits local counts even when navigator reports online; permission errors do not',async t=>{
 const previousDB=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();t.after(()=>globalThis.indexedDB=previousDB);
 const session={user:{id:ownerA,is_anonymous:false}},client={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
 const runtime=await createCountsRuntime({config,client,backendFactory:()=>({getProfile:async()=>{throw new TypeError('Failed to fetch');}})});t.after(()=>runtime.destroy());
 await runtime.gateway.createList({title:'Senza Internet'});assert.equal((await runtime.gateway.listLists()).items.length,1);
 await assert.rejects(createCountsRuntime({config,client,backendFactory:()=>({getProfile:async()=>{throw Object.assign(new Error('Permission denied'),{code:'42501'});}})}),/Permission denied/);
});

test('guest handoff preserves recovery proposals and coalesces an already pulled cloud copy',async t=>{
 const store=createCountsStore({indexedDB:new IDBFactory()}),gateway=createCountsGateway({store,scope:scope(ownerA),channel:false});t.after(()=>gateway.destroy());
 const list=(await gateway.createList({title:'Guest'})).value,count=(await gateway.createCount({listId:list.listId,category:'posts',quantity:12,notes:'Proposta offline'})).value;
 await store.mutate(scope(ownerA),state=>{state.recoveryProposals={old:{kind:'count',local:{...count,quantity:4},remote:null}};});
 await store.mutate(scope(ownerB),state=>{state.lists[list.listId]={...list,revision:1,syncState:'synced'};state.counts[count.countId]={...count,quantity:7,revision:2,syncState:'synced'};});
 await gateway.setScope(scope(ownerB));await gateway.adoptGuestWork({sourceOwnerId:ownerA,targetOwnerId:ownerB,environment:'TEST'});
 assert.equal((await gateway.listRecoveryProposals())[0].local.quantity,4);
 const proposal=await gateway.getCount(list.listId,count.countId);assert.equal(proposal.quantity,12);assert.equal(proposal.conflict.remote.quantity,7);
 assert.ok((await store.read(scope(ownerB))).outbox.filter(op=>op.entityId===count.countId).every(op=>op.blocked));
 await gateway.resolveConflict('count',count.countId,'local');assert.equal((await gateway.getCount(list.listId,count.countId)).quantity,12);
});

test('transferred guest cannot confirm new mutations or sync from an old tab',async t=>{
 const store=createCountsStore({indexedDB:new IDBFactory()});let calls=0;
 const old=createCountsGateway({store,scope:scope(ownerA),channel:false,transport:{request:async()=>{calls++;}}}),target=createCountsGateway({store,scope:scope(ownerB),channel:false});t.after(async()=>{await old.destroy();await target.destroy();});
 const list=(await old.createList({title:'Guest'})).value;await target.adoptGuestWork({sourceOwnerId:ownerA,targetOwnerId:ownerB,environment:'TEST'});
 await assert.rejects(old.createList({title:'Persa'}),error=>error.code==='AUTH_REQUIRED');await assert.rejects(old.sync(),error=>error.code==='AUTH_REQUIRED');assert.equal(calls,0);assert.equal((await target.getList(list.listId)).list.title,'Guest');
});

test('SDK network failure falls back only to matching cached Auth identity',async t=>{
 const previousDB=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();t.after(()=>globalThis.indexedDB=previousDB);const storage=localStorage();
 storage.setItem('sb-backend-auth-token',JSON.stringify({user:{id:ownerA,is_anonymous:false}}));rememberCountsOwner(storage,config,{kind:'user',user:{id:ownerA}});
 const runtime=await createCountsRuntime({config,storage,client:{auth:{getSession:async()=>{throw new TypeError('Failed to fetch');}}},backendFactory:()=>({})});t.after(()=>runtime.destroy());
 assert.equal(runtime.offlineIdentity,true);await runtime.gateway.createList({title:'Locale'});assert.equal((await runtime.gateway.listLists()).items.length,1);
});

test('pending guest transfer remains visible after reopening and offers an explicit retry',async t=>{
 const {document}=parseHTML('<html><body><button id="profile-trigger"></button><div id="profile-menu" hidden></div></body></html>');let listener,retried=0,state={kind:'user',user:{id:ownerB},transfer:{status:'pending'}};
 const auth={getState:()=>state,subscribe:fn=>{listener=fn;fn(state);return()=>{};},resumePendingTransfer:async()=>{retried++;state={...state,transfer:{status:'completed'}};listener(state);}};
 const ui=createProfileUI({authService:auth,document});ui.mount();t.after(()=>ui.destroy());assert.match(document.querySelector('#counts-transfer-recovery').textContent,/conservati/i);
 document.querySelector('#counts-transfer-recovery button').click();await Promise.resolve();assert.equal(retried,1);assert.equal(document.querySelector('#counts-transfer-recovery').hidden,true);
});

test('pending guest transfer from another environment is retained without consuming its proof',async()=>{
 const storage=localStorage();storage.setItem('vivai-obice:auth:pending-transfer',JSON.stringify({token:'proof',transferCounts:true,countsEnvironment:'LIVE',countsBackend:'https://backend.example'}));let consumed=0;
 const auth=createAuthService({client:{auth:{}},backend:{consumeGuestTransferGrant:async()=>consumed++},storage,countsTransferEnvironment:'TEST',countsTransferBackend:'https://backend.example',onGuestCountsTransfer:async()=>{}});
 await assert.rejects(auth.resumePendingTransfer(),/ambiente originale/);assert.equal(consumed,0);assert.ok(storage.getItem('vivai-obice:auth:pending-transfer'));
});
