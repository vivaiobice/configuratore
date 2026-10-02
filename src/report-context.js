import {createReportPreflight,updateReportPreflight,DISCLAIMER_VERSION} from './report-preflight.js';

const clone=value=>globalThis.structuredClone?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
export const REPORT_CONTEXT_KEY=requestId=>`vivai-obice:report-context:v1:${requestId}`;
export function readReportContext(storage,requestId){
  if(!requestId)return null;
  try{const state=JSON.parse(storage?.getItem(REPORT_CONTEXT_KEY(requestId))||'null');return state?.project&&Array.isArray(state.project.fields)?state:null;}
  catch{return null;}
}
export function mountReportProjectContext(documentRef,state,{onRefresh,busy=false}={}){
  const context=documentRef.querySelector('#report-project-context');if(!context)return;
  context.replaceChildren();
  const label=documentRef.createElement('span');label.textContent='PROGETTO DI RIFERIMENTO';
  const name=documentRef.createElement('strong');name.textContent=state?.project?.localProjectName||'Il mio impianto';
  const row=documentRef.createElement('div');row.className='report-project-context-row';row.append(name);
  if(typeof onRefresh==='function'){
    const button=documentRef.createElement('button');button.id='report-refresh-project';button.type='button';button.className='report-project-refresh';button.title='Aggiorna progetto';button.setAttribute('aria-label','Aggiorna progetto');button.disabled=busy;button.setAttribute('aria-busy',String(busy));
    const icon=documentRef.createElement('span');icon.textContent='↻';icon.setAttribute('aria-hidden','true');button.append(icon);button.addEventListener('click',onRefresh);row.append(button);
  }
  const status=documentRef.createElement('span');status.id='report-project-update-status';status.className='report-project-update-status';status.setAttribute('role','status');status.textContent=busy?'Aggiornamento in corso…':'';
  context.append(label,row,status);
}

export function prepareReportContext(state,{projectItem=null,fieldId=null,ownerId=state?.reportOwnerId??null}={}){
  const project=projectItem?.project??state?.project;
  if(!project||!Array.isArray(project.fields))throw new Error('Il progetto selezionato non è disponibile.');
  if(projectItem?.id&&project.localProjectId&&project.localProjectId!==projectItem.id)throw new Error('I dati del progetto salvato non corrispondono alla voce selezionata.');
  if(fieldId&&!project.fields.some(field=>String(field.id??field.clientFieldId)===String(fieldId)))throw new Error('Il campo non appartiene al progetto selezionato.');
  return {...clone(state),project:{...clone(project),localProjectName:projectItem?.name||project.localProjectName||'Il mio impianto'},cloud:clone(projectItem?(projectItem.cloud??{}):(state.cloud??{})),reportFieldId:fieldId?String(fieldId):null,reportOwnerId:ownerId};
}

export function assertReportContextScope(previous,next,{ownerId=previous?.reportOwnerId}={}){
  if(!next?.project||!Array.isArray(next.project.fields))throw new Error('Il progetto selezionato non è disponibile.');
  if(ownerId&&(!previous?.reportOwnerId||previous.reportOwnerId!==ownerId||next.reportOwnerId!==ownerId))throw new Error('Il profilo è cambiato: riapri il documento dal profilo corretto.');
  const projectId=previous?.project?.localProjectId;
  if(!projectId||next.project.localProjectId!==projectId)throw new Error('Il progetto di riferimento è cambiato: riapri il documento dal progetto corretto.');
  if(previous.cloud?.projectId&&previous.cloud.projectId!==next.cloud?.projectId)throw new Error('Il progetto online non corrisponde al documento selezionato.');
  if(previous.environment&&next.environment&&previous.environment!==next.environment)throw new Error('L’ambiente del progetto è cambiato. Riapri il documento.');
  return next;
}

export function refreshReportPreflight(previous,state,{previousState}={}){
  let next=createReportPreflight({state});
  next={...next,recipient:clone(previous.recipient),overview:clone(previous.overview)};
  next=updateReportPreflight(next,{type:'selection/set',fieldIds:previous.selectedFieldIds});
  const selectionPreserved=next.selectedFieldIds.length===previous.selectedFieldIds.length;
  const beforeFields=new Map((previousState?.project?.fields??[]).map(field=>[String(field.id??field.clientFieldId),field]));
  const afterFields=new Map((state?.project?.fields??[]).map(field=>[String(field.id??field.clientFieldId),field]));
  const geometryPreserved=!previousState||next.selectedFieldIds.every(id=>JSON.stringify(beforeFields.get(id)?.geometry)===JSON.stringify(afterFields.get(id)?.geometry));
  return updateReportPreflight(next,{type:'disclaimer/set',accepted:selectionPreserved&&geometryPreserved&&previous.disclaimerAccepted&&previous.disclaimerVersion===DISCLAIMER_VERSION});
}
