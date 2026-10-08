import {createProjectSync} from './project-sync.js?v=1.3.3';
import {createSyncQueue} from './sync-queue.js';
import {projectPayloadToArchiveItem} from './backend.js?v=1.3.3';
import {mergeCloudSnapshot} from './cloud-state.js';
import {prepareReportContext,assertReportContextScope} from './report-context.js?v=1.3.3';
import {buildCloudSnapshot} from './cloud-project-model.js?v=1.3.3';
const clone=value=>structuredClone(value);
export function hasReportProjectChanges(current,reported){
 const shape=value=>{const {name,campaignYear,origin,fields}=buildCloudSnapshot(value);return {name,campaignYear,origin,fields};};
 return JSON.stringify(shape(current))!==JSON.stringify(shape(reported));
}

// A PDF request uses a frozen project, while the editor keeps its own draft.
export function createReportProjectSource({getState,getOwnerId,getBackend,getSync=()=>null,getArchive=()=>[],checkpoint=()=>{},getMetrics,onSynced=()=>{}}){
 let tail=Promise.resolve();
 async function synchronizeInternal(context,{refresh=false}={}){
  const ownerId=context.reportOwnerId,localId=context.project?.localProjectId;
  const guard=()=>{if(!ownerId||getOwnerId()!==ownerId)throw new Error('Il profilo è cambiato: riapri il documento dal profilo corretto.');};
  const sameCurrent=()=>getState()?.project?.localProjectId===localId;
  guard();assertReportContextScope(context,context,{ownerId});
  const backend=getBackend();if(!backend)throw new Error('Sincronizzazione cloud non disponibile. Riprova quando il backend è collegato.');
  const main=sameCurrent()?getSync():null,mainStatus=main?.status?.();
  const held=main&&mainStatus?.state!=='suspended';
  if((mainStatus?.state==='conflict'||mainStatus?.lastError==='version_conflict')&&!refresh&&context.reportSource!=='cloud')throw new Error('Conflitto di versione: usa Aggiorna progetto per leggere la versione online. La bozza locale resta conservata.');
  let source=clone(context),kind='archive';
  try{
   if(main){
    if(held)main.suspend('report_sync');await main.flush();guard();
    const settled=main.status();
    if((settled.state==='conflict'||settled.lastError==='version_conflict')&&!refresh&&context.reportSource!=='cloud')throw new Error('Conflitto di versione: usa Aggiorna progetto. La bozza locale resta conservata.');
   }
   if(context.cloud?.projectId&&(refresh||context.reportSource==='cloud'||!sameCurrent()&&!getArchive().some(item=>item.id===localId))){
    const payload=await backend.loadEditableProject(context.cloud.projectId);guard();
    if(payload.environment&&context.environment&&payload.environment!==context.environment)throw new Error('L’ambiente del progetto online non corrisponde al documento.');
    source=prepareReportContext(context,{projectItem:projectPayloadToArchiveItem(payload),ownerId});
    source.reportFieldId=context.reportFieldId;source.reportSource='cloud';kind='cloud';
   }else if(sameCurrent()){
    await checkpoint();guard();
    if(!sameCurrent())throw new Error('Il progetto attivo è cambiato. Usa Aggiorna progetto per recuperare quello selezionato.');
    source=prepareReportContext(getState(),{ownerId});source.reportFieldId=context.reportFieldId;delete source.reportSource;kind='current';
   }else{
    const item=getArchive().find(item=>item.id===localId);
    if(!item)throw new Error('Il progetto selezionato non è più disponibile.');
    source=prepareReportContext(context,{projectItem:item,ownerId});source.reportFieldId=context.reportFieldId;
   }
   assertReportContextScope(context,source,{ownerId});
   // Project data is already durable in the editor/archive. This transient
   // request queue keeps report retries separate from unrelated pending edits.
   const records=new Map(),queue=createSyncQueue({async put(value){records.set(value.id,clone(value));},async list(){return [...records.values()].map(clone);},async remove(id){records.delete(id);},async replace(value){records.set(value.id,clone(value));}});
   const protectedBackend=Object.fromEntries(Object.entries(backend).filter(([,value])=>typeof value==='function').map(([key,fn])=>[key,async(...args)=>{guard();const value=await fn.apply(backend,args);guard();return value;}]));
   const sync=createProjectSync({backend:protectedBackend,queue,getState:()=>source,getMetrics,onSnapshot:cloud=>{source=mergeCloudSnapshot(source,cloud);}});
   const revision=await sync.saveRevision({reason:'report_issue'});guard();
   if(revision.state!=='synced'||!revision.projectId||!(Number(revision.latestRevisionNumber)>0))throw new Error(revision.state==='conflict'?'Conflitto di versione. Usa Aggiorna progetto e riprova.':'Sincronizzazione non riuscita. Il progetto e la bozza restano conservati.');
   source=mergeCloudSnapshot(source,revision);assertReportContextScope(context,source,{ownerId});
   await onSynced(clone(source),kind);guard();return clone(source);
  }finally{
   if(getOwnerId()===ownerId&&sameCurrent()&&held)main.resume('report_sync');
  }
 }
 return {synchronize(context,options){const snapshot=clone(context);const work=tail.then(()=>synchronizeInternal(snapshot,options));tail=work.catch(()=>{});return work;}};
}
