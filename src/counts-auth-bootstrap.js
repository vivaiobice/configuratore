import {APP_CONFIG} from './config.js?v=1.3.2';
import {connectSupabase,createBackend} from './backend.js?v=1.3.2';
import {createAuthService} from './auth-service.js';
import {createAuthBridge} from './auth-bridge.js';
import {setLocalOwnerScope} from './local-owner-scope.js';
import {createFieldDirectory} from './field-directory.js';

// This entrypoint creates no map, editor, project hydration, analytics or sync queue.
export async function createCountsAuthBootstrap({
  client:providedClient=null,backend:providedBackend=null,
  environment=APP_CONFIG.environment,storage=globalThis.localStorage,
  onBeforeIdentityChange=()=>{},onAfterIdentityChange=()=>{},
  resetRedirectTo=globalThis.location?.origin
}={}){
  const client=providedClient??await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
  if(!client)throw new Error('Accesso Vivai Obice non disponibile.');
  const backend=providedBackend??createBackend(client),auth=createAuthBridge();
  let identityEpoch=0,lastOwner=null;
  const service=createAuthService({client,backend,storage,resetRedirectTo,
    beforeIdentityChange:()=>onBeforeIdentityChange(auth.getState()),
    afterIdentityChange:async()=>{await service.refresh();await onAfterIdentityChange(auth.getState());}});
  auth.attach(service);
  auth.subscribe(next=>{
    const ownerId=next.user?.id??null;
    if(ownerId!==lastOwner){identityEpoch++;lastOwner=ownerId;setLocalOwnerScope(ownerId);}
  });
  await backend.ensureAnonymousSession();
  await service.refresh();
  const fieldDirectory=createFieldDirectory({client,auth,environment});
  return {client,backend,auth,fieldDirectory,getIdentityEpoch:()=>identityEpoch};
}
