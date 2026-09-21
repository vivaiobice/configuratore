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
export function writeLocalProject(storage,project,name){
 if(!storage?.setItem)throw new Error('Salvataggio sul dispositivo non disponibile.');
 if(!project?.localProjectId)throw new Error('Identificativo del progetto mancante.');
 const projects=readLocalProjects(storage);
 const item={id:project.localProjectId,name:String(name||'Il mio impianto').trim(),savedAt:new Date().toISOString(),project:JSON.parse(JSON.stringify(project))};
 const next=[item,...projects.filter(p=>p.id!==item.id)];
 storage.setItem(KEY,JSON.stringify(migrateProjectArchive({version:2,projects:next})));
 return item;
}
