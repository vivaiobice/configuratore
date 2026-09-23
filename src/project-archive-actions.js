import {renameLocalProject,removeLocalProject,writeLocalProject} from './local-projects.js?v=37';

export async function renameArchivedProject({storage,item,name,backend=null,buildSnapshot=()=>({}),operationId=()=>globalThis.crypto.randomUUID()}={}){
 const normalized=String(name??'').trim();
 if(!normalized)throw new Error('Inserisci un nome per il progetto.');
 if(!item?.id||!item?.project)throw new Error('Progetto non trovato.');
 let cloud=item.cloud??{};
 const project={...item.project,localProjectName:normalized};
 if(cloud.projectId){
  if(!backend?.applyProjectOperation)throw new Error('Connessione necessaria per rinominare un progetto sincronizzato.');
  const response=await backend.applyProjectOperation({operationId:operationId(),expectedVersion:Number(cloud.version)||0,snapshot:buildSnapshot(project,cloud)});
  if(response?.status==='conflict')throw new Error('Il progetto è stato modificato su un altro dispositivo. Aggiorna e riprova.');
  if(response?.status!=='applied')throw new Error('Rinomina cloud non completata.');
  cloud={...cloud,projectId:response.projectId??cloud.projectId,version:Number(response.version)||Number(cloud.version)||0,latestRevisionNumber:Number(response.latestRevisionNumber)||Number(cloud.latestRevisionNumber)||0};
 }
 let saved=renameLocalProject(storage,item.id,normalized);
 if(cloud.projectId)saved=writeLocalProject(storage,project,normalized,cloud);
 return saved;
}

export async function deleteArchivedProject({storage,item,backend=null,operationId=()=>globalThis.crypto.randomUUID()}={}){
 if(!item?.id)throw new Error('Progetto non trovato.');
 if(item.cloud?.projectId){
  if(!backend?.softDeleteProject)throw new Error('Connessione necessaria per eliminare un progetto sincronizzato.');
  await backend.softDeleteProject({operationId:operationId(),projectId:item.cloud.projectId});
 }
 removeLocalProject(storage,item.id);return true;
}
