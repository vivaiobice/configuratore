import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createCountsHandler,verifiedCountsIdentity} from './counts-handler.js';
import {createCountsRepository} from './counts-repository.js';
import {deliverWithResend} from './counts-email.js';
import {resolveCountsFlags} from './counts-config.js';
export function countsRuntime(mode:'api'|'admin'|'submit'){
 const get=(key:string)=>Deno.env.get(key)??'';const client=createClient(get('SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const flags=resolveCountsFlags(get);
 return createCountsHandler({flags,repository:createCountsRepository(client),authenticate:async(header:string|null)=>{if(!header?.startsWith('Bearer '))return null;const {data,error}=await client.auth.getUser(header.slice(7));if(error)return null;return verifiedCountsIdentity(data?.user);},...(flags.emailEnabled?{deliver:(body:unknown,key:string)=>deliverWithResend(body,{apiKey:get('RESEND_API_KEY'),idempotencyKey:key})}:{})},mode);
}
