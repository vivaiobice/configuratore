// Never await Auth methods from its own callback. Save using the previous page scope.
export function bindBackendToIdentity(backend,signal){
 const guard=()=>{if(signal.aborted)throw new Error('Account cambiato: operazione sospesa.');};
 return Object.fromEntries(Object.entries(backend).map(([name,method])=>[name,async(...args)=>{guard();const result=await method(...args);guard();return result;}]));
}
export function installIdentityGuard({client,ownerId,onSuspend,onCheckpoint,onHide,onReload,isCoordinated=()=>false}){
 let owner=ownerId??null,stopped=false;
 const {data}=client.auth.onAuthStateChange((_event,session)=>{
  const next= session?.user?.id??null;if(next===owner)return;owner=next;
  onSuspend(session);
  if(stopped)return;stopped=true;
  let problem=null;try{onCheckpoint();}catch(error){problem=error;}
  onHide(problem,session);
  if(!problem&&!isCoordinated())queueMicrotask(onReload);
 });
 return {isStopped:()=>stopped,destroy:()=>data.subscription.unsubscribe()};
}
