const clone=value=>globalThis.structuredClone?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
export const REPORT_CONTEXT_KEY=requestId=>`vivai-obice:report-context:v1:${requestId}`;
export function readReportContext(storage,requestId){
  if(!requestId)return null;
  try{const state=JSON.parse(storage?.getItem(REPORT_CONTEXT_KEY(requestId))||'null');return state?.project&&Array.isArray(state.project.fields)?state:null;}
  catch{return null;}
}
export function mountReportProjectContext(documentRef,state){
  const context=documentRef.querySelector('#report-project-context');if(!context)return;
  context.replaceChildren();
  const label=documentRef.createElement('span');label.textContent='PROGETTO DI RIFERIMENTO';
  const name=documentRef.createElement('strong');name.textContent=state?.project?.localProjectName||'Il mio impianto';
  context.append(label,name);
}

export function prepareReportContext(state,{projectItem=null,fieldId=null}={}){
  const project=projectItem?.project??state?.project;
  if(!project||!Array.isArray(project.fields))throw new Error('Il progetto selezionato non è disponibile.');
  if(projectItem?.id&&project.localProjectId&&project.localProjectId!==projectItem.id)throw new Error('I dati del progetto salvato non corrispondono alla voce selezionata.');
  if(fieldId&&!project.fields.some(field=>String(field.id??field.clientFieldId)===String(fieldId)))throw new Error('Il campo non appartiene al progetto selezionato.');
  return {...clone(state),project:{...clone(project),localProjectName:projectItem?.name||project.localProjectName||'Il mio impianto'},cloud:clone(projectItem?.cloud??state.cloud??{}),reportFieldId:fieldId?String(fieldId):null};
}
