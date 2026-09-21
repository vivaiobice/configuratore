import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {publicAuthError,rateLimitKey,resolveIdentifierEmail,validateLoginPayload} from '../_shared/auth-identifiers.js';

const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','content-type':'application/json'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return reply(405,{error:'Metodo non consentito'});
  try{
    const payload=validateLoginPayload(await request.json());
    const url=Deno.env.get('SUPABASE_URL')!;
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const publishableKey=Deno.env.get('SUPABASE_ANON_KEY')!;
    const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    const limitKey=await rateLimitKey(ip,payload.identifier);
    const limited=await service.rpc('consume_login_rate_limit',{p_key:limitKey});
    if(limited.error||limited.data!==true)return reply(429,{error:'Troppi tentativi. Riprova più tardi'});
    const email=await resolveIdentifierEmail(payload.identifier,{resolveUsername:async username=>{
      const result=await service.rpc('resolve_login_email',{p_username:username});
      return result.error?null:result.data;
    }});
    if(!email){const failure=publicAuthError();return reply(failure.status,failure.body);}
    const authClient=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await authClient.auth.signInWithPassword({email,password:payload.password});
    if(result.error||!result.data.session){const failure=publicAuthError();return reply(failure.status,failure.body);}
    return reply(200,{session:result.data.session});
  }catch{
    return reply(400,{error:'Richiesta non valida'});
  }
});
