import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createCountsHandler} from './counts-handler.js';
import {createCountsRepository} from './counts-repository.js';
import {deliverWithResend} from './counts-email.js';
export function countsRuntime(mode:'api'|'admin'|'submit'){
 const get=(key:string)=>Deno.env.get(key)??'';const client=createClient(get('SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const flags={sync:get('COUNTS_SYNC_ENABLED')==='true',admin:get('COUNTS_ADMIN_ENABLED')==='true',submit:get('COUNTS_SUBMIT_ENABLED')==='true',environment:get('COUNTS_ENVIRONMENT')||'TEST',noticeVersion:get('COUNTS_NOTICE_VERSION'),allowedOrigins:get('COUNTS_ALLOWED_ORIGINS').split(',').map(v=>v.trim()).filter(Boolean),email:{from:get('QUOTE_EMAIL_FROM'),assetBase:get('CONFIGURATOR_BASE_URL')||'https://progettaimpianto.vivaiobice.com/'}};
 if(!flags.noticeVersion)flags.sync=false;
 return createCountsHandler({flags,repository:createCountsRepository(client),authenticate:async(header:string|null)=>{if(!header?.startsWith('Bearer '))return null;const {data,error}=await client.auth.getUser(header.slice(7));const user=data?.user;if(error||!user)return null;return {id:user.id,isAnonymous:user.is_anonymous===true,isAdmin:user.app_metadata?.role==='admin'};},...(get('COUNTS_EMAIL_ENABLED')==='true'&&get('RESEND_API_KEY')&&get('QUOTE_EMAIL_FROM')?{deliver:(body:unknown,key:string)=>deliverWithResend(body,{apiKey:get('RESEND_API_KEY'),idempotencyKey:key})}:{})},mode);
}
