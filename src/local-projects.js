const KEY='vivai-obice:configuratore:projects:v1';
import {migrateProjectArchive} from './local-migrations.js';
export function readLocalProjects(storage){
 const raw=storage?.getItem?.(KEY);
 if(!raw)return [];
 try {
  const envelope=migrateProjectArchive(JSON.parse(raw));
  return envelope.projects.filter(item=>item?.id&&Array.isArray(item.project?.fields));
 } catch {
  throw new Error('Archivio progetti non leggibile. La bozza corrente è conservata.');
 }
}
function clone(value){return globalThis.structuredClone?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));}
function writeArchive(storage,projects){
 storage.setItem(KEY,JSON.stringify(migrateProjectArchive({version:2,projects})));
}
export function writeLocalProject(storage,project,name,cloud={}){
 if(!storage?.setItem)throw new Error('Salvataggio sul dispositivo non disponibile.');
 if(!project?.localProjectId)throw new Error('Identificativo del progetto mancante.');
 const projects=readLocalProjects(storage);
 const item={id:project.localProjectId,name:String(name||'Il mio impianto').trim(),savedAt:new Date().toISOString(),project:clone(project),cloud:clone(cloud??{})};
 const next=[item,...projects.filter(p=>p.id!==item.id)];
 writeArchive(storage,next);
 return item;
}
export function mergeLocalProjects(storage,importedItems=[]){
 if(!storage?.setItem)throw new Error('Salvataggio sul dispositivo non disponibile.');
 const local=readLocalProjects(storage);
 const imported=migrateProjectArchive({version:2,projects:clone(importedItems)}).projects;
 const importedIds=new Set(imported.map((item)=>item.id));
 const merged=[...imported,...local.filter((item)=>!importedIds.has(item.id))]
  .sort((a,b)=>String(b.savedAt??'').localeCompare(String(a.savedAt??'')));
 writeArchive(storage,merged);
 return readLocalProjects(storage);
}
export function renameLocalProject(storage,projectId,name){
 const normalized=String(name??'').trim();
 if(!normalized)throw new Error('Inserisci un nome per il progetto.');
 const projects=readLocalProjects(storage),index=projects.findIndex(item=>item.id===projectId);
 if(index<0)throw new Error('Progetto non trovato.');
 const item=projects[index];
 const renamed={...item,name:normalized,project:{...item.project,localProjectName:normalized}};
 projects[index]=renamed;writeArchive(storage,projects);return renamed;
}
export function removeLocalProject(storage,projectId){
 const projects=readLocalProjects(storage),removed=projects.find(item=>item.id===projectId)??null;
 if(!removed)return null;
 writeArchive(storage,projects.filter(item=>item.id!==projectId));return removed;
}
