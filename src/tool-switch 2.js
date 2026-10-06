import {loadDraftRecord,saveDraft} from './storage.js?v=1.3.0';

export function restoreWorkspaceForOwner(record,ownerId,projectId){
  const workspace=record?.workspace;
  if(!ownerId||workspace?.version!==1||workspace.ownerId!==ownerId||workspace.projectId!==projectId)return null;
  if(record.state?.project?.localProjectId!==projectId)return null;
  return workspace;
}

export function restoreVersionConflict(record,archive){
  const projectId=record?.state?.cloud?.projectId,version=Number(record?.workspace?.cloudVersion);
  if(!record?.workspace||!projectId||!Number.isFinite(version))return false;
  const remote=archive?.find(item=>item.cloud?.projectId===projectId);
  return Boolean(remote&&Number(remote.cloud?.version)>version);
}

export async function checkpointBeforeSwitch({storage,state,ownerId,capture,pendingWorkspace=null,navigate,enqueue=()=>{}}){
  if(!ownerId||!state?.project||typeof capture!=='function')throw new Error('Identità o bozza non disponibile. Riprova tra poco.');
  const workspace=pendingWorkspace??capture();
  if(workspace?.ownerId!==ownerId||workspace?.projectId!==state.project.localProjectId)throw new Error('Identità della bozza cambiata: resta nell’editor.');
  if(!saveDraft(storage,state,workspace))throw new Error('Salvataggio locale non disponibile. Riprova senza uscire.');
  const verified=restoreWorkspaceForOwner(loadDraftRecord(storage),ownerId,workspace.projectId);
  if(!verified||JSON.stringify(verified)!==JSON.stringify(workspace))throw new Error('Verifica della bozza locale non riuscita. Riprova senza uscire.');
  try{await enqueue();}catch{ /* The verified draft is durable even when the sync queue is unavailable. */ }
  return navigate?.();
}

export function createToolSwitch(options){
  let pending=null;
  return target=>{
    if(pending)return pending;
    pending=Promise.resolve().then(()=>checkpointBeforeSwitch({...options,navigate:()=>options.navigate(target)})).finally(()=>{pending=null;});
    return pending;
  };
}
