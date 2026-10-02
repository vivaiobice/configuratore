import {id,keys,text,newCount,CountsError} from './model.js?v=1.2.4';
export function snapshotRecord(record){const {syncState,localRevision,conflict,deleted,...value}=record;return structuredClone(value);}
export function buildSubmission({list,counts,contact,message='',noticeVersion,submissionId=crypto.randomUUID()}){
  if(!counts.length||counts.length>500)throw new CountsError('VALIDATION_ERROR','Seleziona da 1 a 500 conteggi');
  if(list.syncState!=='synced'||counts.some(c=>c.syncState!=='synced'))throw new CountsError('SYNC_UNAVAILABLE','Sincronizza prima le righe selezionate e verifica il riepilogo');
  const result={submissionId,snapshot:{listId:list.listId,listTitle:list.title,entries:counts.map(snapshotRecord)},contact,message,noticeVersion};validateSubmission(result);return result;
}
export function validateSubmission(value){
  keys(value,['submissionId','snapshot','contact','message','noticeVersion']);id(value.submissionId);keys(value.snapshot,['listId','listTitle','entries']);id(value.snapshot.listId);text(value.snapshot.listTitle,200,{required:true});text(value.message,5000);text(value.noticeVersion,200,{required:true});
  if(!Array.isArray(value.snapshot.entries)||value.snapshot.entries.length<1||value.snapshot.entries.length>500)throw new CountsError('VALIDATION_ERROR');
  const seen=new Set();for(const record of value.snapshot.entries){keys(record,['countId','listId','category','title','varietyLabel','rootstockLabel','postType','postMaterial','componentType','quantity','notes','field','revision','updatedAt']);const {revision,updatedAt,...input}=record;newCount(input);if(record.listId!==value.snapshot.listId||!Number.isSafeInteger(revision)||revision<1||seen.has(record.countId)||!Number.isFinite(Date.parse(updatedAt)))throw new CountsError('VALIDATION_ERROR');seen.add(record.countId);}
  keys(value.contact,['firstName','lastName','phone','email','companyName']);for(const [key,max]of [['firstName',160],['lastName',160],['phone',32],['email',254],['companyName',160]])text(value.contact[key]??'',max,{required:key!=='companyName'});
  return value;
}
