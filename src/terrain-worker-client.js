import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {TERRAIN_CONTOUR_ALGORITHM_VERSION,TERRAIN_MAX_NODES} from './terrain-contour-contracts.js?v=1.3.6';

// Accounting for one actual structuredClone/postMessage allocation. Aliases
// are retained by structured cloning, so each shared coordinate/grid is paid
// once in this copy. This grants no authority to the copied geometry.
export function chargeTerrainOperationCopy(value,budget){
 const seen=new WeakSet(),stack=[value];
 while(stack.length){
  budget.check();const item=stack.pop();
  if(!item||typeof item!=='object'||seen.has(item))continue;
  seen.add(item);
  if(Array.isArray(item)&&item.length>=2&&item.length<=3&&item.every(Number.isFinite))budget.check(1);
  if(!Array.isArray(item)&&Array.isArray(item.origin)&&Array.isArray(item.step)&&Number.isSafeInteger(item.width)&&Number.isSafeInteger(item.height)&&(typeof item.valuesBase64==='string'||Array.isArray(item.values))){
   const cells=item.width*item.height;
   if(!Number.isSafeInteger(cells)||cells<0)throw new RangeError('Griglia terreno non valida.');
   budget.check(cells);
  }
  for(const key of Object.keys(item)){budget.check();if(item[key]&&typeof item[key]==='object')stack.push(item[key]);}
 }
 budget.check();
}

const invalidTransport=()=>({ok:false,status:'invalid-transport',kind:'cut',message:'Risposta del calcolo non valida. Il progetto precedente è conservato.'});
function cutUsage(reply,{operationId,initialNodeCount,workerDeadlineMs,requestLimitMs,elapsedMs}){
 const value=reply?.usage,exhausted=reply?.proposal?.ok===false&&reply.proposal.status==='budget-exceeded';
 if(reply?.type!=='result'||reply.operationId!==operationId||reply.proposal?.kind!=='cut'||!value||!Number.isSafeInteger(value.nodeCount)||value.nodeCount<initialNodeCount||value.nodeCount>TERRAIN_MAX_NODES&&!exhausted||!Number.isFinite(value.elapsedMs)||value.elapsedMs<0||!Number.isFinite(value.remainingMs)||value.remainingMs<0||value.remainingMs>Math.max(0,workerDeadlineMs-value.elapsedMs))return null;
 const remainingMs=Math.min(value.remainingMs,Math.max(0,requestLimitMs-elapsedMs));
 return Object.freeze({nodeCount:value.nodeCount,elapsedMs:requestLimitMs-remainingMs,remainingMs});
}

// The browser never runs the bounded solver on the UI thread. Each proposal
// owns its worker, so abort/timeout physically stops work and late callbacks.
export function runTerrainProposal(options,{signal,WorkerImpl=globalThis.Worker,onProgress=()=>{},onBudgetUsage=()=>{},clock=()=>performance.now(),setTimeoutImpl=globalThis.setTimeout,clearTimeoutImpl=globalThis.clearTimeout}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Operazione annullata.','AbortError'));return;}
  const version=options?.algorithmVersion;
  if(version!==undefined&&version!=='terrain-face-chart-1'&&version!==TERRAIN_CONTOUR_ALGORITHM_VERSION){resolve({ok:false,status:'unsupported-algorithm',message:'Versione del motore terreno non supportata.'});return;}
  let deadlineMs,nativeCut=false,copyBudget,started,lastClock,request=options,workerDeadlineMs,workerInitialNodeCount;
  try{
   if(version===TERRAIN_CONTOUR_ALGORITHM_VERSION){
    const kind=options.kind===undefined?(options.mode??(options.followTerrain===false?'measure':'adapt')):options.kind;
    // This budget only selects the shared configured limit. The worker owns
    // the real cumulative clock/nodes; transport starts its own timer below.
    nativeCut=kind==='cut';
    if(nativeCut){
     if(typeof options.operationId!=='string'||!options.operationId)throw new RangeError('Identità del calcolo non valida.');
     const monotonicClock=()=>{const now=clock();if(!Number.isFinite(now)||lastClock!==undefined&&now<lastClock)throw new RangeError('Tempo di calcolo non valido.');lastClock=now;return now;};
     deadlineMs=createTerrainBudget({kind,deadlineMs:options.deadlineMs,initialNodeCount:options.initialNodeCount??0,clock:()=>0}).remainingMs();
     started=monotonicClock();
     copyBudget=createTerrainBudget({kind,deadlineMs,initialNodeCount:options.initialNodeCount??0,clock:monotonicClock});
     chargeTerrainOperationCopy(options,copyBudget);
     workerInitialNodeCount=copyBudget.usage().nodeCount;workerDeadlineMs=copyBudget.remainingMs();
     request={...options,initialNodeCount:workerInitialNodeCount,deadlineMs:workerDeadlineMs};
    }else deadlineMs=createTerrainBudget({kind,deadlineMs:options.deadlineMs,clock:()=>0}).remainingMs();
   }else deadlineMs=Math.min(10000,Math.max(0,options?.deadlineMs??10000));
  }catch(error){resolve({ok:false,status:error.status??'invalid-input',...(nativeCut?{kind:'cut'}:{}),message:error.message});return;}
  if(typeof WorkerImpl!=='function'){resolve({ok:false,status:'worker-unavailable',message:'Calcolo terreno non disponibile in questo browser.'});return;}
  let worker,timer,settled=false,lastProgress=null;
  const finish=(value,error=false)=>{if(settled)return;settled=true;clearTimeoutImpl(timer);signal?.removeEventListener('abort',abort);worker?.terminate();(error?reject:resolve)(value);};
  const abort=()=>finish(new DOMException('Operazione annullata.','AbortError'),true);
  try{
   worker=new WorkerImpl(new URL('./terrain-worker.js?v=1.3.6',import.meta.url),{type:'module'});
   signal?.addEventListener('abort',abort,{once:true});
   worker.onmessage=event=>{
    if(settled)return;
    if(event.data?.type==='progress'){
     lastProgress=event.data;
     // Observers are diagnostics: failure cannot settle or orphan the worker.
     try{onProgress(event.data);}catch{}
     return;
    }
    if(nativeCut){
     let accounting;
     try{
      const now=clock();if(!Number.isFinite(now)||now<lastClock)throw new RangeError('Tempo di calcolo non valido.');lastClock=now;
      accounting=cutUsage(event.data,{operationId:options.operationId,initialNodeCount:workerInitialNodeCount,workerDeadlineMs,requestLimitMs:deadlineMs,elapsedMs:now-started});
     }catch{}
     if(!accounting){finish(invalidTransport());return;}
     // The observer receives bookkeeping only. Its failure cannot orphan the
     // transport or turn a failed producer into an applicable proposal.
     try{onBudgetUsage(accounting);}catch{}
    }
    finish(event.data?.type==='result'?event.data.proposal:event.data);
   };
   worker.onerror=()=>finish({ok:false,status:'worker-error',message:'Calcolo interrotto. Il progetto precedente è conservato.'});
   if(nativeCut){const now=clock();if(!Number.isFinite(now)||now<lastClock)throw new RangeError('Tempo di calcolo non valido.');lastClock=now;workerDeadlineMs=Math.min(copyBudget.remainingMs(),Math.max(0,deadlineMs-(now-started)));request={...request,deadlineMs:workerDeadlineMs};}
   timer=setTimeoutImpl(()=>finish({ok:false,status:'budget-exceeded',budgetReason:'time',diagnostics:{budget:{reason:'time',phase:lastProgress?.phase??null,nodeCount:lastProgress?.nodeCount??null,elapsedMs:lastProgress?.elapsedMs??null}},message:'Tempo di calcolo superato. Il progetto precedente è conservato.'}),(nativeCut?workerDeadlineMs:deadlineMs)+100);
   worker.postMessage(request);
  }catch(error){finish({ok:false,status:'worker-error',message:error.message});}
 });
}
