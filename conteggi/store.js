import {CountsError} from './model.js?v=1.3.5';
export function scopeKey(scope){if(!scope?.backend||!scope?.owner||!['LIVE','TEST'].includes(scope.environment))throw new CountsError('IDENTITY_UNRESOLVED','Identità non ancora disponibile');return JSON.stringify([new URL(scope.backend).origin,scope.environment,scope.owner]);}
export const emptyState=()=>({lists:{},counts:{},outbox:[],commands:{},checkpoint:null,notice:null,submissions:{},submissionDraft:null});
export function createCountsStore({indexedDB=globalThis.indexedDB,name='vivai-obice-counts-v1'}={}){
  let connection;
  function open(){if(!connection)connection=new Promise((resolve,reject)=>{if(!indexedDB)return reject(new CountsError('LOCAL_STORAGE_FAILED','Salvataggio locale non disponibile'));const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('scopes');request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new CountsError('LOCAL_STORAGE_FAILED','Chiudi le altre schede per aggiornare il salvataggio'));});return connection;}
  async function transaction(scope,mutate){const key=scopeKey(scope);try{const db=await open();return await new Promise((resolve,reject)=>{
    const tx=db.transaction('scopes',mutate?'readwrite':'readonly');const store=tx.objectStore('scopes');let result,problem;
    const request=store.get(key);request.onsuccess=()=>{try{const state=request.result??emptyState();if(mutate){if(state.transferredTo)throw new CountsError('AUTH_REQUIRED','Appunti trasferiti: usa l’account destinatario.');result=mutate(state);if(result?.then)throw new TypeError('Transazione locale sincrona richiesta');store.put(state,key);}else result=state;}catch(error){problem=error;tx.abort();}};
    tx.oncomplete=()=>resolve(structuredClone(result));tx.onabort=()=>reject(problem??new CountsError('LOCAL_STORAGE_FAILED','Salvataggio non completato',tx.error?.message));tx.onerror=()=>{};
  });}catch(error){if(error instanceof CountsError)throw error;throw new CountsError('LOCAL_STORAGE_FAILED','Salvataggio locale non riuscito',error.message);}}
  async function transfer(source,target){
    const sourceKey=scopeKey(source),targetKey=scopeKey(target);
    if(source.backend!==target.backend||source.environment!==target.environment||source.owner===target.owner)throw new CountsError('AUTH_REQUIRED');
    try{const db=await open();return await new Promise((resolve,reject)=>{
      const tx=db.transaction('scopes','readwrite'),records=tx.objectStore('scopes');let from,to,result,problem,loaded=0;
      const ready=()=>{if(++loaded!==2)return;try{
        if(from.transferredTo){if(from.transferredTo!==targetKey)throw new CountsError('AUTH_REQUIRED');result={alreadyTransferred:true};return;}
        const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().filter(k=>!['revision','localRevision','syncState','updatedAt'].includes(k)).map(k=>[k,v[k]])):v);
        const retained=new Set(),conflicted=new Set();to.recoveryProposals??={};
        for(const [id,proposal]of Object.entries(from.recoveryProposals??{})){const dest=to.recoveryProposals[id]&&JSON.stringify(to.recoveryProposals[id])!==JSON.stringify(proposal)?`guest:${source.owner}:${id}`:id;to.recoveryProposals[dest]=proposal;}
        for(const key of ['lists','counts'])for(const [id,local]of Object.entries(from[key]??{})){
          const remote=to[key][id],kind=key==='lists'?'list':'count';
          if(!remote){to[key][id]=local;continue;}
          if(stable(local)===stable(remote))continue;
          if(remote.syncState==='synced'){
            to[key][id]={...local,revision:remote.revision,localRevision:Math.max(local.localRevision??0,remote.localRevision??0)+1,syncState:'conflict',conflict:{code:'VERSION_CONFLICT',local:structuredClone(local),remote:structuredClone(remote)}};conflicted.add(kind+':'+id);
          }else{to.recoveryProposals[`guest:${source.owner}:${kind}:${id}`]={kind,local:structuredClone(local),remote:structuredClone(remote),reason:'guest-transfer'};retained.add(kind+':'+id);}
        }
        for(const key of ['submissions','commands','submissionDrafts']){
          to[key]??={};for(const [id,value]of Object.entries(from[key]??{})){if(to[key][id]&&JSON.stringify(to[key][id])!==JSON.stringify(value))throw new CountsError('VERSION_CONFLICT','Una proposta è già presente nell’account. Entrambe le versioni sono conservate; risolvi la voce prima di riprovare.');to[key][id]??=value;}
        }
        const operations=[...to.outbox,...from.outbox.filter(op=>!retained.has(op.kind+':'+op.entityId))];
        to.outbox=Array.from(new Map(operations.map(op=>[op.operationId,conflicted.has(op.kind+':'+op.entityId)?{...op,blocked:true}:op])).values());
        if(from.reading){if(!to.reading)to.reading=from.reading;else if(to.reading.countId!==from.reading.countId||stable(to.reading)!==stable(from.reading))to.recoveryProposals[`guest:${source.owner}:reading:${from.reading.countId}`]={kind:'count',local:structuredClone(from.reading),remote:null,reason:'unfinished-reading'};}
        to.checkpoint??=from.checkpoint;to.notice??=from.notice;to.submissionDraft??=from.submissionDraft;
        from.transferredTo=targetKey;from.transferredAt=new Date().toISOString();
        records.put(to,targetKey);records.put(from,sourceKey);result={alreadyTransferred:false};
      }catch(error){problem=error;tx.abort();}};
      const first=records.get(sourceKey);first.onsuccess=()=>{from=first.result??emptyState();ready();};
      const second=records.get(targetKey);second.onsuccess=()=>{to=second.result??emptyState();ready();};
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem??new CountsError('LOCAL_STORAGE_FAILED','Trasferimento locale non completato'));tx.onerror=()=>{};
    });}catch(error){if(error instanceof CountsError)throw error;throw new CountsError('LOCAL_STORAGE_FAILED','Gli appunti ospite restano conservati; riprova il trasferimento',error.message);}
  }
  return {read:scope=>transaction(scope),mutate:(scope,fn)=>transaction(scope,fn),transfer,async close(){if(connection)(await connection).close();connection=null;}};
}
