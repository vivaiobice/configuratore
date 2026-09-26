import {normalizePublicProjectCode} from './public-project-access.js';

export async function resolveEditableProjectCode({code,backend}={}){
  const normalized=normalizePublicProjectCode(code);
  if(!normalized)throw new Error('Inserisci un codice progetto valido nel formato VO-1234567.');
  if(!backend?.getPublicProjectByCode||!backend?.canEditProject||!backend?.loadEditableProject)throw new Error('Caricamento dei progetti temporaneamente non disponibile.');
  const match=await backend.getPublicProjectByCode(normalized);
  if(!match?.projectId)throw new Error('Codice progetto non trovato. Verifica il codice e riprova.');
  if(await backend.canEditProject(match.projectId)!==true)throw new Error('Progetto trovato, ma non hai accesso alla modifica. Accedi con il profilo proprietario o Admin.');
  return backend.loadEditableProject(match.projectId);
}
