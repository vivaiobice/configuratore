import {CountsError,keys,id,text,newCount,newList,validateListPatch} from '../../../conteggi/model.js';
import {validateSubmission} from '../../../conteggi/submission.js';
import {validateQuoteContact} from './quote-request.js';
import {composeCountsEmail} from './counts-email.js';
const status={AUTH_REQUIRED:401,NOT_FOUND_OR_FORBIDDEN:404,VERSION_CONFLICT:409,FIELD_UNAVAILABLE:409,NOTICE_REQUIRED:403,ADMIN_REQUIRED:403,SERVICE_DISABLED:503,SYNC_UNAVAILABLE:503,VALIDATION_ERROR:400};
/** @param {{flags:any, authenticate:(header:string|null)=>Promise<any>, repository:any, deliver?:((body:any,key:string)=>Promise<any>)|null, composeEmail?:typeof composeCountsEmail}} options */
export function createCountsHandler({flags,authenticate,repository,deliver=null,composeEmail=composeCountsEmail},mode='api'){
 return async request=>{
  const origin=request.headers.get('Origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const respond=(body,code=200)=>new Response(JSON.stringify(body),{status:code,headers});
  try{
   if(origin&&!flags.allowedOrigins?.includes(origin))throw new CountsError('NOT_FOUND_OR_FORBIDDEN');
   if(origin)headers['Access-Control-Allow-Origin']=origin;
   headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS';
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(request.method!=='POST')return respond({code:'VALIDATION_ERROR',error:'Metodo non consentito'},405);
   if(!flags.sync||(mode==='admin'&&!flags.admin)||(mode==='submit'&&!flags.submit))throw new CountsError('SERVICE_DISABLED','Servizio non ancora attivato');
   const user=await authenticate(request.headers.get('Authorization'));if(!user?.id)throw new CountsError('AUTH_REQUIRED','Sessione non valida');
   if(mode==='admin'&&(user.isAnonymous||!user.isAdmin))throw new CountsError('ADMIN_REQUIRED','Accesso amministrativo non autorizzato');
   const raw=await request.text();if(new TextEncoder().encode(raw).length>2_000_000)throw new CountsError('VALIDATION_ERROR','Richiesta troppo grande');
   let body;try{body=JSON.parse(raw);}catch{throw new CountsError('VALIDATION_ERROR');}keys(body,['action','input','environment']);if(body.environment!==flags.environment)throw new CountsError('VALIDATION_ERROR','Ambiente non valido');
   const context={owner:user.id,environment:flags.environment};const {action,input={}}=body;
   if(mode==='admin')return respond(await repository.admin(action,input,context));
   if(mode==='api'&&action==='notice'){keys(input,['version']);if(input.version!==flags.noticeVersion)throw new CountsError('VALIDATION_ERROR','Avviso non aggiornato');await repository.notice({...context,version:input.version});return respond({acknowledged:true});}
   if(!await repository.hasNotice({...context,version:flags.noticeVersion}))throw new CountsError('NOTICE_REQUIRED','Leggi l’avviso prima della sincronizzazione');
   if(mode==='submit'){
    validateSubmission(input);
    let contact;try{contact=validateQuoteContact(input.contact);}catch(error){throw new CountsError('VALIDATION_ERROR',error.message);}for(const key of Object.keys(contact))if(contact[key]!==String(input.contact[key]??'').trim()&&(key!=='email'||contact[key]!==input.contact[key].trim().toLowerCase()))throw new CountsError('VALIDATION_ERROR','Recapito fuori limite');
    const accepted=await repository.acceptSubmission({...context,...input,contact,requiredNoticeVersion:flags.noticeVersion});
    if(!deliver)return respond({...accepted,emailState:'pending'});
    const body=composeEmail(accepted,flags.email);const claim=await repository.claimDelivery({...context,submissionId:accepted.submissionId,body});
    if(!claim.send)return respond({...accepted,emailState:claim.state,providerAcceptedAt:claim.providerAcceptedAt});
    let state,providerId=null;try{const result=await deliver(claim.body,`counts:${accepted.submissionId}`);providerId=result.id;state='provider_accepted';}catch(error){state=error.definitive?'failed':'uncertain';}
    await repository.finishDelivery({...context,submissionId:accepted.submissionId,state,providerId});return respond({...accepted,emailState:state});
   }
   if(action==='pull'){keys(input,['cursor']);return respond(await repository.pull(context,input));}
   if(action==='mutate'){
    keys(input,['operationId','kind','entityId','expectedRevision','value','blocked']);id(input.operationId);id(input.entityId);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw new CountsError('VALIDATION_ERROR');
    const v=input.value;let value;
    if(input.kind==='list'){keys(v,['listId','title','status','deleted','revision','localRevision','syncState','updatedAt']);newList(v);value={listId:id(v.listId),...validateListPatch({title:v.title,status:v.status}),deleted:v.deleted??false};}
    else if(input.kind==='count'){keys(v,['countId','listId','category','title','varietyLabel','quantity','notes','field','deleted','revision','localRevision','syncState','updatedAt']);const {revision,localRevision,syncState,updatedAt,deleted,...inputCount}=v;const created=newCount(inputCount);const {revision:r,localRevision:l,syncState:s,updatedAt:u,...clean}=created;value={...clean,deleted:deleted??false};if(value.field&&repository.validateField)value.field=await repository.validateField({...context,value});}
    else throw new CountsError('VALIDATION_ERROR');
    if(typeof value.deleted!=='boolean'||(value.countId??value.listId)!==input.entityId)throw new CountsError('VALIDATION_ERROR');
    return respond(await repository.apply({...context,kind:input.kind,operationId:input.operationId,expectedRevision:input.expectedRevision,value}));
   }
   throw new CountsError('VALIDATION_ERROR','Operazione non consentita');
  }catch(error){const code=error.code??'SYNC_UNAVAILABLE';return respond({code,error:error.code?error.message:'Servizio temporaneamente non disponibile',...(code==='VERSION_CONFLICT'?{details:error.details}: {})},status[code]??503);}
 };
}
