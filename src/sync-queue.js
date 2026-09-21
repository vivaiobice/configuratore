function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function createOperation(
  type,
  projectClientId,
  payload,
  version,
  idFactory = () => globalThis.crypto.randomUUID(),
  now = () => Date.now()
) {
  if (!String(type ?? '').trim()) throw new TypeError('Operation type required');
  if (!String(projectClientId ?? '').trim()) throw new TypeError('Project client id required');
  const expectedVersion = Number(version);
  return {
    id:idFactory(),
    type:String(type),
    projectClientId:String(projectClientId),
    payload:clone(payload),
    expectedVersion:Number.isSafeInteger(expectedVersion) && expectedVersion >= 0 ? expectedVersion : 0,
    createdAt:now(),
    attempts:0,
    lastError:null
  };
}

export function createSyncQueue(adapter) {
  for (const method of ['put','list','remove','replace']) {
    if (typeof adapter?.[method] !== 'function') throw new TypeError(`Queue adapter requires ${method}()`);
  }
  return {
    async enqueue(record) {
      await adapter.put(clone(record));
      return record;
    },
    async pending() {
      const records = await adapter.list();
      return records.map(clone).sort((a,b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)));
    },
    acknowledge(id) {
      return adapter.remove(id);
    },
    async markFailed(id, message) {
      const record = (await adapter.list()).find((item) => item.id === id);
      if (!record) return false;
      await adapter.replace({
        ...record,
        attempts:(Number(record.attempts) || 0) + 1,
        lastError:String(message ?? 'unknown error')
      });
      return true;
    }
  };
}
