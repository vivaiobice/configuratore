// The browser never runs the bounded solver on the UI thread. Each proposal
// owns its worker, so abort/timeout physically stops work and late callbacks.
export function runTerrainProposal(options,{signal,WorkerImpl=globalThis.Worker}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Operazione annullata.','AbortError'));return;}
  if(typeof WorkerImpl!=='function'){resolve({ok:false,status:'worker-unavailable',message:'Calcolo terreno non disponibile in questo browser.'});return;}
  let worker,timer,settled=false;
  const finish=(value,error=false)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();(error?reject:resolve)(value);};
  const abort=()=>finish(new DOMException('Operazione annullata.','AbortError'),true);
  try{
   worker=new WorkerImpl(new URL('./terrain-worker.js?v=1.3.1-prova.1',import.meta.url),{type:'module'});
   signal?.addEventListener('abort',abort,{once:true});
   worker.onmessage=event=>finish(event.data);
   worker.onerror=()=>finish({ok:false,status:'worker-error',message:'Calcolo interrotto. Il progetto precedente è conservato.'});
   timer=setTimeout(()=>finish({ok:false,status:'budget-exceeded',message:'Tempo di calcolo superato. Il progetto precedente è conservato.'}),Math.min(10000,Math.max(0,options?.deadlineMs??10000))+100);
   worker.postMessage(options);
  }catch(error){finish({ok:false,status:'worker-error',message:error.message});}
 });
}
