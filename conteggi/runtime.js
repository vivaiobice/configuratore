import {APP_CONFIG} from '../src/config.js';
import {createAuthService} from '../src/auth-service.js';
import {createBackend,connectSupabase} from '../src/backend.js';
import {createCountsGateway,createCountsTransport,createCountsAdmin} from '../src/counts-client.js';
import {CountsError} from './model.js';
import {createFieldDirectory} from '../src/field-directory.js';
// This reuses the existing Auth service. The Configuratore Work may supply its lightweight bootstrap.
export async function createCountsRuntime({config,client=null,authFactory=createAuthService,backendFactory=createBackend,beforeIdentityChange=async()=>{}}){
 client??=await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
 const backend=backendFactory(client);const existing=await client.auth.getSession();if(!existing?.data?.session?.user){if(globalThis.navigator?.onLine===false)throw new CountsError('IDENTITY_UNRESOLVED','Apri Conteggi una prima volta con connessione, per riconoscere il tuo profilo.');await backend.ensureAnonymousSession();}
 let gateway;const getScope=async()=>{const result=await client.auth.getSession();const user=result.data?.session?.user;if(!user?.id)throw new CountsError('IDENTITY_UNRESOLVED','Identità non disponibile');return {backend:config.backendUrl,environment:config.environment,owner:user.id};};
 const transport=config.syncEnabled?createCountsTransport({client,environment:config.environment}):null;
 gateway=createCountsGateway({scope:await getScope(),transport});
 const auth=authFactory({client,backend:{...backend,getProfile:async owner=>{try{return await backend.getProfile(owner);}catch(error){if(globalThis.navigator?.onLine===false)return null;throw error;}}},beforeIdentityChange,afterIdentityChange:async()=>{await gateway.setScope(await getScope());}});await auth.refresh();
 // Supabase auth callbacks must not await further Auth calls inside the callback.
 let authEpoch=0,observedOwner=gateway.getScope().owner;const {data:subscription}=client.auth.onAuthStateChange((_event,session)=>{const nextOwner=session?.user?.id??null;if(nextOwner===observedOwner)return;observedOwner=nextOwner;const change=++authEpoch;gateway.suspend();queueMicrotask(()=>void (async()=>{try{await beforeIdentityChange();}finally{if(change!==authEpoch)return;if(nextOwner)await gateway.setScope({backend:config.backendUrl,environment:config.environment,owner:nextOwner});}if(change===authEpoch&&nextOwner)await auth.refresh();})().catch(()=>{}));});
 return {gateway,auth,fieldDirectory:typeof client.from==='function'?createFieldDirectory({client,auth,environment:config.environment}):null,
   admin:transport?createCountsAdmin({transport,getScope:gateway.getScope}):null,
   async destroy(){subscription.subscription.unsubscribe();await gateway.destroy();}};
}
