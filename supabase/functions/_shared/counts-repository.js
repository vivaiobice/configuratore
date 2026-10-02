import {CountsError,keys,id} from '../../../conteggi/model.js';
const codes=['VALIDATION_ERROR','NOT_FOUND_OR_FORBIDDEN','VERSION_CONFLICT','FIELD_UNAVAILABLE','NOTICE_REQUIRED'];
function unwrap({data,error}){if(error){const code=codes.find(c=>error.message?.includes(c))??'SYNC_UNAVAILABLE';let details;try{details=JSON.parse(error.details);}catch{}throw new CountsError(code,code,details);}return data;}
const record=row=>({...row.data,revision:Number(row.revision),updatedAt:row.updated_at});
export function createCountsRepository(client){
 const owned=(table,context)=>client.from(table).select('*').eq('owner_user_id',context.owner).eq('environment',context.environment);
 const rpc=async(name,params)=>unwrap(await client.rpc(name,params));
 async function safeField(field,context){if(!field||field.associationStatus!=='verified')return field;const project=unwrap(await client.from('projects').select('id').eq('id',field.projectId).eq('owner_user_id',context.owner).eq('environment',context.environment).is('deleted_at',null).maybeSingle());const row=project&&unwrap(await client.from('project_fields').select('client_field_id').eq('project_id',field.projectId).eq('client_field_id',field.fieldId).eq('owner_user_id',context.owner).is('deleted_at',null).maybeSingle());return row?field:{projectId:field.projectId,fieldId:field.fieldId,projectLabel:'',fieldLabel:'',associationStatus:'unavailable'};}
 return {
  async notice({owner,environment,version}){unwrap(await client.from('counts_notice_receipts').upsert({owner_user_id:owner,environment,version},{onConflict:'owner_user_id,environment,version'}));},
  async hasNotice(context){return Boolean(unwrap(await owned('counts_notice_receipts',context).eq('version',context.version).maybeSingle()));},
  async apply({owner,environment,operationId,kind,expectedRevision,value}){try{return await rpc('counts_apply',{p_owner:owner,p_environment:environment,p_operation:operationId,p_kind:kind,p_expected:expectedRevision,p_value:value});}catch(error){if(error.details?.current?.field)error.details.current.field=await safeField(error.details.current.field,{owner,environment});throw error;}},
  async pull(context,{cursor={}}={}){
   const tables=['counts_lists','counts_entries','counts_submissions'];const arrays=await Promise.all(tables.map(async table=>{let query=owned(table,context).order('id').limit(201);if(cursor[table])query=query.gt('id',cursor[table]);if(cursor[table]==='done')return [];return unwrap(await query);}));const nextCursor={};let more=false;
   for(let i=0;i<tables.length;i++){const rows=arrays[i];if(rows.length>200){rows.pop();nextCursor[tables[i]]=rows.at(-1).id;more=true;}else nextCursor[tables[i]]='done';}
   const [lists,entries,submissions]=arrays;const counts=await Promise.all(entries.map(async row=>{const value=record(row);value.field=await safeField(value.field,context);return value;}));
   const deliveries=submissions.length?unwrap(await owned('counts_deliveries',context).in('submission_id',submissions.map(s=>s.id))):[];const byId=new Map(deliveries.map(d=>[d.submission_id,d]));
   return {lists:lists.map(record),counts,submissions:submissions.map(s=>({submissionId:s.id,snapshot:s.snapshot,contact:s.contact,message:s.message,noticeVersion:s.notice_version,acceptedAt:s.accepted_at,emailState:byId.get(s.id)?.state??'pending',providerAcceptedAt:byId.get(s.id)?.provider_accepted_at})),nextCursor:more?nextCursor:null};
  },
  acceptSubmission:({owner,environment,submissionId,snapshot,contact,message,noticeVersion,requiredNoticeVersion})=>rpc('counts_accept_submission',{p_owner:owner,p_environment:environment,p_key:submissionId,p_snapshot:snapshot,p_contact:contact,p_message:message,p_notice:noticeVersion,p_required_notice:requiredNoticeVersion}),
  claimDelivery:({owner,environment,submissionId,body})=>rpc('counts_claim_delivery',{p_owner:owner,p_environment:environment,p_key:submissionId,p_body:body}),
  finishDelivery:({owner,environment,submissionId,state,providerId})=>rpc('counts_finish_delivery',{p_owner:owner,p_environment:environment,p_key:submissionId,p_state:state,p_provider_id:providerId}),
  async admin(action,input,context){const allowed={listUserLists:['ownerKind','from','to','listStatus','hasSubmission','cursor','limit'],getUserList:['listId'],listSubmissions:['ownerKind','from','to','emailState','cursor','limit'],getSubmission:['submissionId']}[action];if(!allowed)throw new CountsError('VALIDATION_ERROR');keys(input,allowed);for(const k of ['listId','submissionId','cursor'])if(input[k])id(input[k]);for(const k of ['from','to'])if(input[k]&&!Number.isFinite(Date.parse(input[k])))throw new CountsError('VALIDATION_ERROR');if(input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<1||input.limit>100))throw new CountsError('VALIDATION_ERROR');if(input.ownerKind&&!['guest','user'].includes(input.ownerKind))throw new CountsError('VALIDATION_ERROR');if(input.listStatus&&!['open','closed'].includes(input.listStatus))throw new CountsError('VALIDATION_ERROR');if(input.hasSubmission!==undefined&&typeof input.hasSubmission!=='boolean')throw new CountsError('VALIDATION_ERROR');const result=await rpc('counts_admin_read',{p_environment:context.environment,p_action:action,p_input:input});
   // Administrative visibility of notes does not grant project metadata access.
   if(result.counts)result.counts=result.counts.map(count=>({...count,field:count.field?{associationStatus:'unavailable',projectId:null,fieldId:null,projectLabel:'',fieldLabel:''}:null}));return result;
  }
 };
}
