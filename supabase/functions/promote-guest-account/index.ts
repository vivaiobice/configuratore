import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {rateLimitKey,resolvePromotionTarget} from '../_shared/auth-identifiers.js';

const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','content-type':'application/json'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE=/^[a-z0-9._-]{3,32}$/;

function registration(input:Record<string,unknown>={}){
  const email=String(input.email??'').trim().toLowerCase();
  const username=String(input.username??'').trim().toLowerCase();
  const displayName=String(input.displayName??'').trim();
  const password=String(input.password??'');
  if(!EMAIL_RE.test(email)||!USERNAME_RE.test(username)||displayName.length<2||displayName.length>100||password.length<8||password.length>1024)throw new TypeError('invalid_registration');
  return {email,username,displayName,password};
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return reply(405,{error:'Metodo non consentito'});
  try{
    const payload=registration(await request.json());
    const bearer=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!bearer)return reply(401,{error:'Sessione Guest non valida'});
    const url=Deno.env.get('SUPABASE_URL')!;
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const publishableKey=Deno.env.get('SUPABASE_ANON_KEY')!;
    const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const identity=await service.auth.getUser(bearer);
    const user=identity.data.user;
    if(identity.error||!user||user.is_anonymous!==true)return reply(401,{error:'Sessione Guest non valida'});
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    const limitKey=await rateLimitKey(ip,`register:${payload.email}`);
    const limited=await service.rpc('consume_login_rate_limit',{p_key:limitKey});
    if(limited.error||limited.data!==true)return reply(429,{error:'Troppi tentativi. Riprova più tardi'});
    const conflict=await service.from('profiles').select('user_id').ilike('username',payload.username).neq('user_id',user.id).maybeSingle();
    if(conflict.error)return reply(400,{error:'Registrazione non riuscita'});
    let pendingCredentialsVerified=false;
    if(conflict.data){
      const verified=await service.rpc('verify_pending_registration',{
        p_user_id:conflict.data.user_id,
        p_email:payload.email,
        p_username:payload.username,
        p_password:payload.password
      });
      if(verified.error)return reply(400,{error:'Registrazione non riuscita'});
      pendingCredentialsVerified=verified.data===true;
    }
    let plan;
    try{
      plan=resolvePromotionTarget({currentUserId:user.id,conflictingUserId:conflict.data?.user_id,pendingCredentialsVerified});
    }catch{
      return reply(409,{error:'Username già utilizzato'});
    }
    let transferToken:string|null=null;
    if(plan.transferCurrentGuest){
      const grant=await service.rpc('create_guest_transfer_grant_for',{p_guest_user_id:user.id});
      if(grant.error||!grant.data)return reply(400,{error:'Registrazione non riuscita'});
      transferToken=grant.data;
    }
    const reserved=await service.from('profiles').upsert({user_id:plan.targetUserId,owner_kind:'guest',display_name:payload.displayName,username:payload.username,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(reserved.error)return reply(reserved.error.code==='23505'?409:400,{error:reserved.error.code==='23505'?'Username già utilizzato':'Registrazione non riuscita'});
    const promoted=await service.auth.admin.updateUserById(plan.targetUserId,{email:payload.email,password:payload.password,email_confirm:true,user_metadata:{display_name:payload.displayName}});
    if(promoted.error)return reply(409,{error:'E-mail già utilizzata o non disponibile'});
    const profile=await service.from('profiles').update({owner_kind:'user',display_name:payload.displayName,updated_at:new Date().toISOString()}).eq('user_id',plan.targetUserId);
    if(profile.error)return reply(500,{error:'Profilo non aggiornato'});
    const authClient=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await authClient.auth.signInWithPassword({email:payload.email,password:payload.password});
    if(signed.error||!signed.data.session)return reply(500,{error:'Account creato. Accedi nuovamente'});
    let transfer=null;
    if(transferToken){
      const targetClient=createClient(url,publishableKey,{
        global:{headers:{authorization:`Bearer ${signed.data.session.access_token}`}},
        auth:{persistSession:false,autoRefreshToken:false}
      });
      const moved=await targetClient.rpc('consume_guest_transfer_grant',{p_token:transferToken});
      transfer=moved.error?{status:'pending'}:moved.data;
    }
    return reply(200,{session:signed.data.session,transfer});
  }catch{
    return reply(400,{error:'Dati di registrazione non validi'});
  }
});
