import test from 'node:test';import assert from 'node:assert/strict';import {IDBFactory,scope} from './counts-support.mjs';
const {createCountsStore}=await import('../conteggi/store.js').catch(()=>({}));
test('checkpoint and outbox survive a new connection, with scopes isolated in TEST too',async()=>{
 const indexedDB=new IDBFactory();const store=createCountsStore({indexedDB});
 await store.mutate(scope(),state=>{state.checkpoint={view:'counter',quantity:27};state.outbox.push({operationId:'one'});});
 const reopened=createCountsStore({indexedDB});assert.equal((await reopened.read(scope())).checkpoint.quantity,27);assert.equal((await reopened.read(scope())).outbox.length,1);
 assert.equal((await reopened.read(scope('other'))).checkpoint,null);assert.equal((await reopened.read(scope('guest-a','LIVE'))).outbox.length,0);
 await store.close();await reopened.close();
});
test('transaction abort after successful put does not report durability or retain half a checkpoint',async()=>{
 const real=new IDBFactory();const db=await new Promise((resolve,reject)=>{const request=real.open('vivai-obice-counts-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('scopes');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const wrapped={open(){const request=real.open('vivai-obice-counts-v1',1);request.addEventListener('success',()=>{const d=request.result;const original=d.transaction.bind(d);d.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){const store=tx.objectStore('scopes'),put=store.put.bind(store);store.put=(...v)=>{const r=put(...v);r.addEventListener('success',()=>tx.abort());return r;};tx.objectStore=()=>store;}return tx;};});return request;}};
 const store=createCountsStore({indexedDB:wrapped});await assert.rejects(store.mutate(scope(),s=>{s.checkpoint={view:'counter'};s.outbox.push({operationId:'one'});}),e=>e.code==='LOCAL_STORAGE_FAILED');
 assert.equal((await store.read(scope())).checkpoint,null);assert.equal((await store.read(scope())).outbox.length,0);await store.close();db.close();
});
