import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperation, createSyncQueue } from '../src/sync-queue.js';

function memoryAdapter(initial = []) {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  return {
    async put(record) { records.set(record.id, structuredClone(record)); },
    async list() { return [...records.values()].map((record) => structuredClone(record)); },
    async remove(id) { records.delete(id); },
    async replace(record) { records.set(record.id, structuredClone(record)); }
  };
}

test('queue preserves order and removes only acknowledged operations', async () => {
  const queue = createSyncQueue(memoryAdapter());
  await queue.enqueue({ id:'a', createdAt:2, attempts:0 });
  await queue.enqueue({ id:'b', createdAt:1, attempts:0 });
  assert.deepEqual((await queue.pending()).map((item) => item.id), ['b','a']);
  await queue.acknowledge('b');
  assert.deepEqual((await queue.pending()).map((item) => item.id), ['a']);
});

test('retry keeps the same operation id after an ambiguous network failure', async () => {
  const operation = createOperation('autosave','project-1',{ value:1 },4,() => 'op-fixed', () => 123);
  const queue = createSyncQueue(memoryAdapter());
  await queue.enqueue(operation);
  await queue.markFailed('op-fixed','network');
  const failed = (await queue.pending())[0];
  assert.equal(failed.id, 'op-fixed');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, 'network');
});

test('operation envelope validates required identity and keeps expected cloud version', () => {
  assert.deepEqual(createOperation('manual_save','project-1',{ value:1 },7,() => 'op-1',() => 50), {
    id:'op-1', type:'manual_save', projectClientId:'project-1', payload:{ value:1 },
    expectedVersion:7, createdAt:50, attempts:0, lastError:null
  });
  assert.throws(() => createOperation('', 'p', {}, 0), /operation type/i);
  assert.throws(() => createOperation('autosave', '', {}, 0), /project client id/i);
});
