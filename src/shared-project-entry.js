import { APP_CONFIG } from './config.js';
import { connectSupabase, createBackend } from './backend.js?v=42';
import { bootSharedProjectPage } from './shared-project.js?v=42';

const client=await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
const backend=client?createBackend(client):null;
await bootSharedProjectPage({backend});
