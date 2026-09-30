import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {buildQuoteRequest} from '../_shared/quote-request.js';

const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','content-type':'application/json'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return reply(405,{error:'Metodo non consentito'});
  const resendKey=Deno.env.get('RESEND_API_KEY');
  const sender=Deno.env.get('QUOTE_EMAIL_FROM');
  if(!resendKey||!sender)return reply(503,{error:'Invio preventivi temporaneamente non disponibile. Riprova più tardi.'});
  try{
    const body=await request.json();
    if(!uuid.test(body?.projectId)||!uuid.test(body?.requestKey)||!Array.isArray(body?.fieldIds))
      return reply(400,{error:'Richiesta non valida'});
    if(body.privacyAccepted!==true)return reply(400,{error:'Conferma l’informativa privacy prima di inviare la richiesta.'});
    const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)return reply(401,{error:'Sessione scaduta. Ricarica la pagina.'});
    const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const identity=await service.auth.getUser(token);
    const owner=identity.data.user;
    if(identity.error||!owner)return reply(401,{error:'Sessione scaduta. Ricarica la pagina.'});
    const previous=await service.from('quote_requests').select('id,owner_user_id,project_id,contact_id,delivery_status').eq('request_key',body.requestKey).maybeSingle();
    if(previous.error)throw previous.error;
    if(previous.data && (previous.data.owner_user_id!==owner.id||previous.data.project_id!==body.projectId))return reply(403,{error:'Richiesta non autorizzata'});
    if(previous.data?.delivery_status==='sent')return reply(200,{id:previous.data.id,contactId:previous.data.contact_id,delivered:true});

    const projectResult=await service.from('projects').select('id,owner_user_id,public_code,name,environment,deleted_at').eq('id',body.projectId).maybeSingle();
    if(projectResult.error)throw projectResult.error;
    const project=projectResult.data;
    if(!project||project.owner_user_id!==owner.id||project.deleted_at||project.environment!=='LIVE')return reply(403,{error:'Il progetto non è accessibile'});
    const fieldResult=await service.from('project_fields').select('client_field_id,label,design_data,gross_area_m2,simulated_plants,commercial_plants_25').eq('project_id',project.id).is('deleted_at',null);
    if(fieldResult.error)throw fieldResult.error;
    let prepared;
    try{prepared=buildQuoteRequest({project,fields:fieldResult.data,fieldIds:body.fieldIds,contact:body.contact});}
    catch(error){return reply(400,{error:error instanceof Error?error.message:'Dati non validi'});}
    if(!previous.data && owner.is_anonymous){
      const since=new Date(Date.now()-60*60*1000).toISOString();
      const count=await service.from('quote_requests').select('id',{count:'exact',head:true}).eq('owner_user_id',owner.id).gte('created_at',since);
      if(count.error)throw count.error;
      if((count.count??0)>=3)return reply(429,{error:'Hai già inviato tre richieste nell’ultima ora. Riprova più tardi.'});
    }
    let quoteId=previous.data?.id,contactId=previous.data?.contact_id;
    if(!quoteId){
      const contact=await service.from('contacts').insert({owner_user_id:owner.id,first_name:prepared.contact.firstName,last_name:prepared.contact.lastName,
        company_name:prepared.contact.companyName,phone:prepared.contact.phone,email:prepared.contact.email,
        privacy_version:'v1',marketing_consent:false}).select('id').single();
      if(contact.error)throw contact.error;
      contactId=contact.data.id;
      const inserted=await service.from('quote_requests').insert({owner_user_id:owner.id,project_id:project.id,contact_id:contact.data.id,
        environment:project.environment,request_key:body.requestKey,field_ids:prepared.fieldIds,
        lot_summary:prepared.details.map(({id,lotStatus,lot})=>({fieldId:id,status:lotStatus,lot})),
        message:prepared.text,delivery_status:'pending'}).select('id').single();
      if(inserted.error)throw inserted.error;
      quoteId=inserted.data.id;
    }
    const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'authorization':`Bearer ${resendKey}`,
      'content-type':'application/json','Idempotency-Key':body.requestKey},body:JSON.stringify({from:sender,to:['info@vivaiobice.com'],
      reply_to:prepared.contact.email,subject:`Richiesta preventivo ${project.public_code||project.name||''}`,text:prepared.text})});
    const result=await sent.json().catch(()=>({}));
    if(!sent.ok||!result.id){
      await service.from('quote_requests').update({delivery_status:'failed',updated_at:new Date().toISOString()}).eq('id',quoteId);
      return reply(502,{error:'E-mail non inviata. Riprova tra poco: la richiesta manterrà lo stesso codice.'});
    }
    const updated=await service.from('quote_requests').update({delivery_status:'sent',email_provider_id:result.id,email_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',quoteId);
    if(updated.error)throw updated.error;
    const updatedProject=await service.from('projects').update({status:'quote_requested',contact_id:contactId}).eq('id',project.id).eq('owner_user_id',owner.id);
    if(updatedProject.error)throw updatedProject.error;
    return reply(200,{id:quoteId,contactId,delivered:true});
  }catch(error){
    console.error('submit-quote failed',error);
    return reply(500,{error:'Invio non confermato. Riprova più tardi con la stessa richiesta.'});
  }
});
