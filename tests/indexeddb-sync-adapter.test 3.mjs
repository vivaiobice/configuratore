import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedDbSyncAdapter } from '../src/indexeddb-sync-adapter.js';

test('adapter creation rejects when IndexedDB is unavailable', async () => {
  await assert.rejects(() => createIndexedDbSyncAdapter(null), /IndexedDB unavailable/);
});

test('adapter rejects blocked database upgrades instead of dropping queued data', async () => {
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => request.onblocked?.());
      return request;
    }
  };
  await assert.rejects(() => createIndexedDbSyncAdapter(indexedDB), /blocked/i);
});

test('adapter exposes put, list, remove and replace after a successful open', async () => {
  const calls = [];
  const store = {
    put(value) { calls.push(['put',value]); const request={}; queueMicrotask(() => request.onsuccess?.()); return request; },
    getAll() { const request={}; queueMicrotask(() => { request.result=[{id:'a'}]; request.onsuccess?.(); }); return request; },
    delete(id) { calls.push(['delete',id]); const request={}; queueMicrotask(() => request.onsuccess?.()); return request; }
  };
  const db = {
    objectStoreNames:{ contains:() => true },
    transaction() { return { objectStore:() => store }; }
  };
  const indexedDB = {
    open(name,version) {
      calls.push(['open',name,version]);
      const request={};
      queueMicrotask(() => { request.result=db; request.onsuccess?.(); });
      return request;
    }
  };
  const adapter = await createIndexedDbSyncAdapter(indexedDB,'test-db');
  await adapter.put({id:'a'});
  await adapter.replace({id:'a',attempts:1});
  assert.deepEqual(await adapter.list(), [{id:'a'}]);
  await adapter.remove('a');
  assert.deepEqual(calls[0], ['open','test-db',1]);
  assert.equal(calls.filter(([name]) => name === 'put').length, 2);
  assert.deepEqual(calls.at(-1), ['delete','a']);
});
