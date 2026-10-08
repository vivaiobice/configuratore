import {TERRAIN_MAX_NODES,TERRAIN_OPERATION_CAP_MS} from './terrain-contour-contracts.js?v=1.3.2';

/** @returns {import('./terrain-contour-contracts.js?v=1.3.1-prova.1').TerrainBudget} */
export function createTerrainBudget({kind,deadlineMs,initialNodeCount=0,clock=()=>performance.now(),onProgress=()=>{}}={}){
 const cap=TERRAIN_OPERATION_CAP_MS[kind];
 if(!Object.hasOwn(TERRAIN_OPERATION_CAP_MS,kind)||deadlineMs!==undefined&&(!Number.isFinite(deadlineMs)||deadlineMs<0)||!Number.isSafeInteger(initialNodeCount)||initialNodeCount<0||initialNodeCount>TERRAIN_MAX_NODES)throw new RangeError('Budget terreno non valido.');
 const limit=Math.min(cap,deadlineMs??cap),started=clock();
 let nodeCount=initialNodeCount,currentPhase=null,phaseStarted=started;
 const completed=Object.create(null);
 const remainingAt=now=>Math.max(0,limit-(now-started));
 const checkAt=now=>{if(now-started>=limit||nodeCount>TERRAIN_MAX_NODES)throw Object.assign(new Error('Budget di calcolo terreno superato.'),{status:'budget-exceeded'});};
 return {
  check(nodeDelta=0){
   if(!Number.isSafeInteger(nodeDelta)||nodeDelta<0)throw new RangeError('Conteggio dei nodi non valido.');
   nodeCount+=nodeDelta;checkAt(clock());
  },
  phase(name){
   const now=clock();checkAt(now);
   if(currentPhase!==null)completed[currentPhase]=(completed[currentPhase]??0)+now-phaseStarted;
   currentPhase=name;phaseStarted=now;
   onProgress({phase:name,elapsedMs:now-started,remainingMs:remainingAt(now),nodeCount});
  },
  remainingMs(){return remainingAt(clock());},
  usage(){const now=clock();return Object.freeze({nodeCount,elapsedMs:now-started,remainingMs:remainingAt(now)});},
  timings(){
   const result={...completed};
   if(currentPhase!==null)Object.defineProperty(result,currentPhase,{value:(completed[currentPhase]??0)+clock()-phaseStarted,enumerable:true,writable:true,configurable:true});
   return result;
  }
 };
}
