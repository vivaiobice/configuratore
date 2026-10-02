import {CountsError} from './model.js';
export function scopeKey(scope){if(!scope?.backend||!scope?.owner||!['LIVE','TEST'].includes(scope.environment))throw new CountsError('IDENTITY_UNRESOLVED','Identità non ancora disponibile');return JSON.stringify([new URL(scope.backend).origin,scope.environment,scope.owner]);}
export const emptyState=()=>({lists:{},counts:{},outbox:[],commands:{},checkpoint:null,notice:null,submissions:{},submissionDraft:null});
export function createCountsStore({indexedDB=globalThis.indexedDB,name='vivai-obice-counts-v1'}={}){
  let connection;
  function open(){if(!connection)connection=new Promise((resolve,reject)=>{if(!indexedDB)return reject(new CountsError('LOCAL_STORAGE_FAILED','Salvataggio locale non disponibile'));const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('scopes');request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new CountsError('LOCAL_STORAGE_FAILED','Chiudi le altre schede per aggiornare il salvataggio'));});return connection;}
  async function transaction(scope,mutate){const key=scopeKey(scope);try{const db=await open();return await new Promise((resolve,reject)=>{
    const tx=db.transaction('scopes',mutate?'readwrite':'readonly');const store=tx.objectStore('scopes');let result,problem;
    const request=store.get(key);request.onsuccess=()=>{try{const state=request.result??emptyState();if(mutate){result=mutate(state);if(result?.then)throw new TypeError('Transazione locale sincrona richiesta');store.put(state,key);}else result=state;}catch(error){problem=error;tx.abort();}};
    tx.oncomplete=()=>resolve(structuredClone(result));tx.onabort=()=>reject(problem??new CountsError('LOCAL_STORAGE_FAILED','Salvataggio non completato',tx.error?.message));tx.onerror=()=>{};
  });}catch(error){if(error instanceof CountsError)throw error;throw new CountsError('LOCAL_STORAGE_FAILED','Salvataggio locale non riuscito',error.message);}}
  return {read:scope=>transaction(scope),mutate:(scope,fn)=>transaction(scope,fn),async close(){if(connection)(await connection).close();connection=null;}};
}
