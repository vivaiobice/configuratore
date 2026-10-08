const aborted=()=>new DOMException('Tile del terreno annullata.','AbortError');
export function createTerrainTileClient({model,encodePNG,workerFactory=()=>typeof Worker==='function'?new Worker(new URL('./terrain-tile-worker.js?v=1.3.3',import.meta.url),{type:'module'}):null}){
 let worker=null,workerReady=false,timeout=null;
 let destroyed=false,sequence=0,resolveReady,rejectReady;const cache=new Map(),pending=new Map();
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
 function retire(){clearTimeout(timeout);worker?.terminate();worker=null;workerReady=false;}
 function pump(){
  if(!workerReady)return;let active=[...pending.values()].filter(job=>job.posted).length;
  for(const job of pending.values()){if(active>=2)break;if(!job.posted&&job.subscribers.size){job.posted=true;active++;worker.postMessage({type:'tile',id:job.id,coordinates:job.coordinates});}}
 }
 function destroy(error=aborted()){
  if(destroyed)return;destroyed=true;retire();cache.clear();rejectReady(error);
  for(const job of pending.values())for(const sub of job.subscribers)sub.reject(error);pending.clear();
 }
 function startWorker(){
  worker=workerFactory?.();if(!worker)throw new Error('Worker grafico non disponibile: vista 3D non applicabile.');
  const current=worker;timeout=setTimeout(()=>destroy(new Error('Worker grafico non disponibile.')),15000);
  worker.onerror=event=>{if(worker===current)destroy(new Error(event.message??'Worker grafico non disponibile.'));};
  worker.onmessage=async({data:message})=>{
  if(destroyed||worker!==current)return;
  if(message.type==='ready'){clearTimeout(timeout);workerReady=true;resolveReady({bounds:message.bounds});pump();return;}
  if(message.type==='error'&&!message.id){destroy(new Error(message.message));return;}
  const job=[...pending.values()].find(value=>value.id===message.id);if(!job)return;if(!job.subscribers.size){pending.delete(job.key);pump();return;}
  try{
   if(message.type==='error')throw new Error(message.message);
   const data=message.data??await encodePNG(message.pixels,message.size);
   if(destroyed||worker!==current||pending.get(job.key)!==job)return;
   if(!job.subscribers.size){pending.delete(job.key);pump();return;}
   cache.set(job.key,data);if(cache.size>8)cache.delete(cache.keys().next().value);
   pending.delete(job.key);for(const sub of job.subscribers)sub.resolve(data.slice(0));pump();
  }catch(error){if(pending.get(job.key)===job){pending.delete(job.key);for(const sub of job.subscribers)sub.reject(error);pump();}}
 };
 worker.postMessage({type:'init',model});
 }
 startWorker();
 function tile(coordinates,{signal}={}){
  if(destroyed||signal?.aborted)return Promise.reject(aborted());const key=[coordinates.z,coordinates.x,coordinates.y,coordinates.size??256].join('/');
  if(cache.has(key))return Promise.resolve(cache.get(key).slice(0));
  let job=pending.get(key);if(!job){if(pending.size>=10)return Promise.reject(aborted());job={id:++sequence,key,coordinates,subscribers:new Set(),posted:false};pending.set(key,job);if(!worker)startWorker();}
  const result=new Promise((resolve,reject)=>{
   let sub;
   const cleanup=()=>signal?.removeEventListener('abort',cancel);
   const cancel=()=>{job.subscribers.delete(sub);cleanup();reject(aborted());if(!job.subscribers.size){if(!job.posted)pending.delete(job.key);if([...pending.values()].every(value=>!value.subscribers.size)){pending.clear();retire();}}};
   sub={resolve:value=>{cleanup();resolve(value);},reject:error=>{cleanup();reject(error);}};job.subscribers.add(sub);signal?.addEventListener('abort',cancel,{once:true});
  });
  pump();return result;
 }
 return {ready,tile,destroy};
}
