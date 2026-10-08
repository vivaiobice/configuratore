import {TERRAIN_MAX_NODES,TERRAIN_OPERATION_CAP_MS} from './terrain-contour-contracts.js?v=1.3.3';

/** @returns {import('./terrain-contour-contracts.js?v=1.3.3').TerrainBudget} */
export function createTerrainBudget({kind,deadlineMs,initialNodeCount=0,clock=()=>performance.now(),onProgress=()=>{}}={}){
 const cap=TERRAIN_OPERATION_CAP_MS[kind];
 if(!Object.hasOwn(TERRAIN_OPERATION_CAP_MS,kind)||deadlineMs!==undefined&&(!Number.isFinite(deadlineMs)||deadlineMs<0)||!Number.isSafeInteger(initialNodeCount)||initialNodeCount<0||initialNodeCount>TERRAIN_MAX_NODES)throw new RangeError('Budget terreno non valido.');
 const limit=Math.min(cap,deadlineMs??cap),started=clock();
 let nodeCount=initialNodeCount,currentPhase=null,phaseStarted=started;
 const completed=Object.create(null),reservations=[];
 const remainingAt=now=>Math.max(0,limit-(now-started));
 const snapshot=now=>Object.freeze({nodeCount,elapsedMs:now-started,remainingMs:remainingAt(now)});
 const checkAt=now=>{
  const budgetReason=now-started>=limit?'time':nodeCount>TERRAIN_MAX_NODES?'work':null;
  if(budgetReason)throw Object.assign(new Error(budgetReason==='time'?'Tempo di calcolo terreno esaurito.':'Limite di lavoro del calcolo terreno raggiunto.'),{status:'budget-exceeded',budgetReason,budgetPhase:currentPhase,budgetUsage:snapshot(now)});
  for(const reservation of reservations){
   const reason=remainingAt(now)<=reservation.remainingMs?'time':nodeCount>TERRAIN_MAX_NODES-reservation.nodeCount?'work':null;
   if(reason){
    reservation.error??=Object.assign(new Error('Riserva per completare la famiglia già verificata.'),{status:'budget-exceeded',budgetReservation:true,budgetReason:reason,budgetPhase:currentPhase,budgetUsage:snapshot(now)});
    throw reservation.error;
   }
  }
 };
 const budget={
  withReserve({nodeCount:reserveNodes,remainingMs:reserveMs},callback){
   if(!Number.isSafeInteger(reserveNodes)||reserveNodes<0||reserveNodes>TERRAIN_MAX_NODES||!Number.isFinite(reserveMs)||reserveMs<0||typeof callback!=='function')throw new RangeError('Riserva del budget non valida.');
   const reservation={nodeCount:reserveNodes,remainingMs:reserveMs};
   reservations.push(reservation);
   try{
    checkAt(clock());
    const result=callback();
    if(result&&typeof result.then==='function')throw new RangeError('La riserva deve essere sincrona.');
    if(reservation.error)throw reservation.error;
    checkAt(clock());
    return result;
   }catch(error){throw reservation.error??error;}
   finally{reservations.pop();checkAt(clock());}
  },
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
  usage(){return snapshot(clock());},
  timings(){
   const result={...completed};
   if(currentPhase!==null)Object.defineProperty(result,currentPhase,{value:(completed[currentPhase]??0)+clock()-phaseStarted,enumerable:true,writable:true,configurable:true});
   return result;
  }
 };
 return budget;
}
