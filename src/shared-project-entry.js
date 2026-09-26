import { APP_CONFIG } from './config.js';
import { connectSupabase, createBackend } from './backend.js?v=55';
import { bootSharedProjectPage } from './shared-project.js?v=51';
import { createAuthService } from './auth-service.js?v=45';

const client=await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
const backend=client?createBackend(client):null;
const authService=client&&backend?createAuthService({client,backend,afterIdentityChange:()=>{}}):null;
if(authService)await authService.refresh().catch(()=>{});
await bootSharedProjectPage({backend,authService});
