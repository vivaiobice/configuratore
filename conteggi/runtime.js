import {APP_CONFIG} from '../src/config.js?v=1.3.1-prova.1';
import {createAuthService} from '../src/auth-service.js';
import {createBackend,connectSupabase} from '../src/backend.js?v=1.3.1-prova.1';
import {createCountsGateway,createCountsTransport,createCountsAdmin} from '../src/counts-client.js?v=1.2.4';
import {CountsError} from './model.js?v=1.2.4';
import {createFieldDirectory} from '../src/field-directory.js';
import {rememberCountsOwner,readCountsOfflineOwner,forgetCountsOwner,isCountsNetworkError} from '../src/counts-offline-owner.js';
// This reuses the existing Auth service. The Configuratore Work may supply its lightweight bootstrap.
export async function createCountsRuntime({config,client=null,authFactory=createAuthService,backendFactory=createBackend,beforeIdentityChange=async()=>{},storage=globalThis.localStorage}){
 function offlineRuntime(){
  const owner=readCountsOfflineOwner(storage,config);if(!owner)throw new CountsError('IDENTITY_UNRESOLVED','Apri Conteggi una prima volta con connessione, per riconoscere il tuo profilo.');
  const gateway=createCountsGateway({scope:{backend:config.backendUrl,environment:config.environment,owner:owner.ownerId}});
  const state={kind:owner.anonymous?'guest':'user',displayName:owner.displayName,user:{id:owner.ownerId,is_anonymous:owner.anonymous},isAdmin:false};
  const unavailable=()=>{throw new CountsError('SYNC_UNAVAILABLE','Per cambiare profilo, collega prima il dispositivo a Internet.');};
  const auth={getState:()=>state,subscribe(fn){fn(state);return()=>{};},refresh:async()=>state,login:unavailable,register:unavailable,logout:unavailable,updateProfile:unavailable,requestPasswordReset:unavailable};
  const changed=()=>{const next=readCountsOfflineOwner(storage,config);if(next?.ownerId!==owner.ownerId)gateway.suspend();};globalThis.addEventListener?.('storage',changed);
  return {gateway,auth,fieldDirectory:null,admin:null,offlineIdentity:true,async destroy(){globalThis.removeEventListener?.('storage',changed);await gateway.destroy();}};
 }
 if(!client&&globalThis.navigator?.onLine===false)return offlineRuntime();
 try{client??=await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});}catch(error){if(isCountsNetworkError(error))return offlineRuntime();throw error;}
 const backend=backendFactory(client);let existing;try{existing=await client.auth.getSession();if(existing.error)throw existing.error;}catch(error){if(isCountsNetworkError(error))return offlineRuntime();forgetCountsOwner(storage,config);throw error;}
 if(!existing?.data?.session?.user){forgetCountsOwner(storage,config);if(globalThis.navigator?.onLine===false)throw new CountsError('IDENTITY_UNRESOLVED','Apri Conteggi una prima volta con connessione, per riconoscere il tuo profilo.');await backend.ensureAnonymousSession();}
 let gateway;const getScope=async()=>{const result=await client.auth.getSession();const user=result.data?.session?.user;if(!user?.id)throw new CountsError('IDENTITY_UNRESOLVED','Identità non disponibile');return {backend:config.backendUrl,environment:config.environment,owner:user.id};};
 const transport=config.syncEnabled?createCountsTransport({client,environment:config.environment}):null;
 gateway=createCountsGateway({scope:await getScope(),transport});
 const auth=authFactory({client,backend:{...backend,getProfile:async owner=>{try{return await backend.getProfile(owner);}catch(error){if(isCountsNetworkError(error))return null;throw error;}}},beforeIdentityChange:async context=>{
   if(context?.action==='login'&&(await client.auth.getSession())?.data?.session?.user?.is_anonymous===true&&(await gateway.hasLocalWork())&&!context.transferCounts)throw new CountsError('SERVICE_DISABLED',config.guestTransferEnabled?'Scegli di trasferire i conteggi ospite prima di accedere. Puoi anche creare un nuovo account mantenendo questa sessione.':'I tuoi conteggi ospite sono conservati. Il trasferimento a un account esistente richiede l’attivazione del servizio; puoi creare un nuovo account mantenendoli.');
   await beforeIdentityChange();
 },
   countsTransferEnvironment:config.guestTransferEnabled?config.environment:null,
   countsTransferBackend:new URL(config.backendUrl).origin,
   onGuestCountsTransfer:async proof=>{await gateway.setScope(await getScope());await gateway.adoptGuestWork(proof);},
   afterIdentityChange:async()=>{await gateway.setScope(await getScope());}});try{await auth.refresh();}catch(error){await gateway.destroy();throw error;}
 const detachOwner=auth.subscribe?.(state=>rememberCountsOwner(storage,config,state));
 await auth.resumePendingTransfer?.().catch(()=>{});
 // Supabase auth callbacks must not await further Auth calls inside the callback.
 let authEpoch=0,observedOwner=gateway.getScope().owner;const {data:subscription}=client.auth.onAuthStateChange((_event,session)=>{const nextOwner=session?.user?.id??null;if(nextOwner===observedOwner)return;observedOwner=nextOwner;const change=++authEpoch;gateway.suspend();auth.invalidateSession?.(session);rememberCountsOwner(storage,config,{user:session?.user??null});queueMicrotask(()=>void (async()=>{try{await beforeIdentityChange();}finally{if(change!==authEpoch)return;if(nextOwner)await gateway.setScope({backend:config.backendUrl,environment:config.environment,owner:nextOwner});}if(change===authEpoch)await auth.refresh(session);})().catch(()=>{}));});
 return {gateway,auth,fieldDirectory:typeof client.from==='function'?createFieldDirectory({client,auth,environment:config.environment}):null,
   admin:transport?createCountsAdmin({transport,getScope:gateway.getScope}):null,
   async destroy(){detachOwner?.();subscription.subscription.unsubscribe();await gateway.destroy();}};
}
