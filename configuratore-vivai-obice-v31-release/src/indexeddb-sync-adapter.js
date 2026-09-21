const DEFAULT_DB_NAME = 'vivai-obice-configuratore';
const STORE_NAME = 'sync_operations';

function requestResult(request, action) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`IndexedDB ${action} failed`));
  });
}

function openDatabase(indexedDB, dbName) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    try {
      request = indexedDB.open(dbName, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath:'id' });
    };
    request.onsuccess = () => {
      if (settled) {
        request.result?.close?.();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error('IndexedDB open failed'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB open blocked by another tab'));
    };
  });
}

export async function createIndexedDbSyncAdapter(indexedDB = globalThis.indexedDB, dbName = DEFAULT_DB_NAME) {
  if (!indexedDB?.open) throw new Error('IndexedDB unavailable');
  const db = await openDatabase(indexedDB, dbName);

  function store(mode) {
    try {
      return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    } catch (error) {
      throw new Error(`IndexedDB transaction failed: ${error?.message || error}`);
    }
  }

  return {
    async put(record) {
      await requestResult(store('readwrite').put(record), 'put');
    },
    async list() {
      return (await requestResult(store('readonly').getAll(), 'list')) ?? [];
    },
    async remove(id) {
      await requestResult(store('readwrite').delete(id), 'remove');
    },
    async replace(record) {
      await requestResult(store('readwrite').put(record), 'replace');
    }
  };
}
