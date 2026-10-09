export class CountsError extends Error {
  constructor(code, message=code, details=null) { super(message); this.name='CountsError'; this.code=code; this.details=details; }
}
export const CATEGORY_LABELS=Object.freeze({plants:'Barbatelle / Viti',posts:'Pali',other:'Altro'});
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fail=(message)=>{throw new CountsError('VALIDATION_ERROR',`VALIDATION_ERROR: ${message}`);};
export function keys(value,allowed) { if(!value||typeof value!=='object'||Array.isArray(value))fail('Oggetto richiesto'); for(const key of Object.keys(value))if(!allowed.includes(key))fail(`Proprietà non ammessa: ${key}`); }
export function id(value) { if(typeof value!=='string'||!UUID.test(value))fail('Identificatore non valido'); return value; }
export function text(value,max,{required=false,trim=false}={}) { if(typeof value!=='string')fail('Testo richiesto'); const result=trim?value.trim():value; if([...result].length>max||(required&&!result.trim()))fail(`Testo fuori limite (1–${max})`); return result; }
export function quantity(value) { if(typeof value==='string'){if(!/^\d+$/.test(value))fail('Inserisci un intero non negativo');value=Number(value);} if(!Number.isSafeInteger(value)||value<0)fail('Inserisci un intero non negativo rappresentabile esattamente'); return value; }
export function quantityAfter(current,action,value) { quantity(current); if(action==='set')return quantity(value); if(action==='increment')return quantity(current+1); if(action==='decrement')return Math.max(0,current-1); fail('Azione sconosciuta'); }
export function fieldAssociation(value) {
  if(value===null)return null;
  keys(value,['projectId','fieldId','projectLabel','fieldLabel','varietyLabel','associationStatus','localRef']);
  if(!['verified','pending','unavailable'].includes(value.associationStatus))fail('Stato campo non valido');
  const result={projectId:value.projectId??null,fieldId:value.fieldId??null,projectLabel:text(value.projectLabel??'',200),fieldLabel:text(value.fieldLabel??'',200),associationStatus:value.associationStatus};
  if(result.projectId!==null)id(result.projectId);
  if(result.fieldId!==null)text(result.fieldId,200,{required:true});
  if(value.associationStatus==='verified'&&(!result.projectId||!result.fieldId))fail('Campo verificato senza identificatori');
  if(value.varietyLabel!==undefined)result.varietyLabel=text(value.varietyLabel,200);
  if(value.localRef){keys(value.localRef,['localProjectId','localFieldId']);result.localRef={localProjectId:text(value.localRef.localProjectId,200,{required:true}),localFieldId:text(value.localRef.localFieldId,200,{required:true})};}
  return result;
}
export function validateCountPatch(patch) {
  keys(patch,['title','titleMode','varietyLabel','rootstockLabel','postType','postMaterial','componentType','category','listId','quantity','notes','field']);const next={};
  if('category'in patch){if(!Object.hasOwn(CATEGORY_LABELS,patch.category))fail('Categoria non valida');next.category=patch.category;}
  if('listId'in patch)next.listId=id(patch.listId);
  if('title'in patch)next.title=text(patch.title,200,{required:true,trim:true});
  if('titleMode'in patch){if(!['auto','manual'].includes(patch.titleMode))fail('Modalità del nome non valida');next.titleMode=patch.titleMode;}
  if('varietyLabel'in patch)next.varietyLabel=patch.varietyLabel===null?null:text(patch.varietyLabel,200,{required:true,trim:true});
  if('rootstockLabel'in patch)next.rootstockLabel=patch.rootstockLabel===null?null:text(patch.rootstockLabel,200,{required:true,trim:true});
  for(const key of ['postType','postMaterial','componentType'])if(key in patch)next[key]=patch[key]===null?null:text(patch[key],80,{required:true,trim:true});
  if('quantity'in patch)next.quantity=quantity(patch.quantity);
  if('notes'in patch)next.notes=text(patch.notes,10000);
  if('field'in patch)next.field=fieldAssociation(patch.field);
  return next;
}
export function validateListPatch(patch){keys(patch,['title','status']);const next={};if('title'in patch)next.title=text(patch.title,200,{required:true,trim:true});if('status'in patch){if(!['open','closed'].includes(patch.status))fail('Stato lista non valido');next.status=patch.status;}return next;}
export function patchCount(record,patch,now=new Date().toISOString()){const clean=validateCountPatch(patch);if('title'in clean&&!('titleMode'in clean))clean.titleMode='manual';return {...record,...clean,localRevision:record.localRevision+1,updatedAt:now};}
export function newCount(input,now=new Date().toISOString()){
  keys(input,['countId','listId','category','title','titleMode','varietyLabel','rootstockLabel','postType','postMaterial','componentType','quantity','notes','field']);id(input.countId);id(input.listId);
  if(!Object.hasOwn(CATEGORY_LABELS,input.category))fail('Categoria non valida');
  const {countId,listId,category,...patch}=input;
  return {countId,listId,category,title:CATEGORY_LABELS[category],varietyLabel:null,quantity:0,notes:'',field:null,...validateCountPatch(patch),revision:0,localRevision:0,syncState:'local',updatedAt:now,deleted:false};
}
export function newList({listId,title},now=new Date().toISOString()){return {listId:id(listId),title:text(title,200,{required:true,trim:true}),status:'open',revision:0,localRevision:0,syncState:'local',updatedAt:now,deleted:false};}
export function countDetailLines(record){
  const details={plants:[['varietyLabel','Vitigno'],['rootstockLabel','Portainnesto']],posts:[['postType','Tipo palo'],['postMaterial','Materiale']],other:[['componentType','Componente']]};
  return (details[record.category]??[]).filter(([key])=>record[key]).map(([key,label])=>`${label}: ${record[key]}`);
}
export function summarizeCounts(rows){return Object.keys(CATEGORY_LABELS).map(category=>{const items=rows.filter(r=>!r.deleted&&r.category===category);return {category,items,totalQuantity:items.reduce((sum,r)=>sum+BigInt(quantity(r.quantity)),0n).toString()};});}
