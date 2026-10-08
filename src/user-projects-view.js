import {expandProjectFields} from '../admin/admin-model.js?v=1.3.2';
import {initAdminMap} from '../admin/admin-map.js?v=1.3.2';

export async function loadUserProjectsData(client) {
 if(!client)throw new Error('Connessione non disponibile.');
 async function all(table,columns){
  const rows=[];
  for(let start=0;;start+=200){
   const result=await client.from(table).select(columns).order(table==='projects'?'id':'user_id',{ascending:true}).range(start,start+199);
   if(result.error)throw result.error;rows.push(...(result.data??[]));if((result.data??[]).length<200)return rows;
  }
 }
 const [projects,profiles]=await Promise.all([all('projects','id,owner_user_id,owner_kind,public_code,name,campaign_year,environment,deleted_at,created_at,field_plans,geometry,municipality,province,region,location_label,active_field_id,cadastral_refs,gross_area_m2,net_area_m2,perimeter_m,simulated_plants,commercial_plants_25,row_count,row_linear_m,head_posts,intermediate_posts,total_posts,grape_variety,rootstock,clone_selection,contacts(first_name,last_name,company_name,email,phone)'),all('profiles','user_id,display_name,first_name,last_name,company_name,owner_kind')]);
 return {projects,profiles};
}

export function createUserProjectsView({document=globalThis.document,auth,loadData,mountMap=initAdminMap}={}) {
 let root,map=null,groups=[],sequence=0;
 const allowed=()=>auth?.getState?.().isAdmin===true;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
 function close(){sequence++;map?.destroy?.();map=null;if(root){root.hidden=true;root.querySelector('[data-user-project-content]').replaceChildren();}groups=[];}
 function ensure(){
  if(root)return;
  root=node('section',null,'user-projects-view');root.id='user-projects-view';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Progetti degli utenti');
  const card=node('div',null,'user-projects-card'),header=node('header'),title=node('h2','Progetti degli utenti'),exit=node('button','Chiudi');exit.type='button';exit.addEventListener('click',close);header.append(title,exit);
  const status=node('p','Consultazione: i progetti mantengono il proprio proprietario.');status.setAttribute('role','status');status.dataset.userProjectStatus='';
  const content=node('div');content.dataset.userProjectContent='';card.append(header,status,content);root.append(card);document.body.append(root);
  root.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 }
 function content(){return root.querySelector('[data-user-project-content]');}
 function owners(){
  map?.destroy?.();map=null;content().replaceChildren();
  if(!groups.length){content().append(node('p','Nessun progetto disponibile.'));return;}
  for(const group of groups){const button=node('button',`${group.name} · ${group.projects.length} progetti`,'user-owner-row');button.type='button';button.dataset.ownerProjects=group.id;button.addEventListener('click',()=>projectsFor(group));content().append(button);}
 }
 function back(label,action){const button=node('button',label);button.type='button';button.addEventListener('click',action);return button;}
 function projectsFor(group){
  if(!allowed()){close();return;}
  map?.destroy?.();map=null;content().replaceChildren(back('‹ Utenti',owners),node('h3',group.name));
  for(const project of group.projects){
   const fields=expandProjectFields([project]),invalid=fields.some(f=>f.terrainStatus==='invalid'),area=fields.reduce((s,f)=>s+f.areaM2,0),plants=fields.reduce((s,f)=>s+f.calculatedPlants,0);
   const button=node('button',`${project.name||'Progetto'} · ${project.public_code||''} · ${fields.length} campi · ${invalid?'Da rivedere · — m² · — viti':`${Math.round(area).toLocaleString('it-IT')} m² · ${Math.round(plants).toLocaleString('it-IT')} viti`}`,'user-owner-row');button.type='button';button.dataset.consultProject=project.id;button.addEventListener('click',()=>showProject(project,group));content().append(button);
  }
 }
 function showProject(project,group){
  if(!allowed()){close();return;}
  content().replaceChildren(back('‹ Progetti del cliente',()=>projectsFor(group)),node('h3',project.name||'Progetto'));
  const fields=expandProjectFields([project]),host=node('div',null,'user-project-map');content().append(host);
  map=mountMap({container:host});map?.setFields?.(fields);
  for(const f of fields){const card=node('article',null,'user-project-field');card.append(node('strong',f.label),node('p',`${f.grapeVariety||'Vitigno da definire'} · ${f.rootstock||'Portainnesto da definire'} · ${f.terrainStatus==='invalid'?'Da rivedere · — m² · — viti':`${Math.round(f.areaM2).toLocaleString('it-IT')} m² · ${Math.round(f.calculatedPlants).toLocaleString('it-IT')} viti`}`));content().append(card);}
 }
 async function open(){
  if(!allowed())throw new Error('Accesso riservato all’amministratore.');
  ensure();root.hidden=false;const current=++sequence;root.querySelector('[data-user-project-status]').textContent='Caricamento dei progetti utenti…';content().replaceChildren();
  try{
   const data=await loadData();if(current!==sequence||!allowed())return;
   const profiles=new Map((data.profiles??[]).map(p=>[String(p.user_id),p]));const byOwner=new Map();
   for(const project of data.projects??[]){if(project.deleted_at)continue;const id=String(project.owner_user_id||project.id),profile=profiles.get(id)??{},contact=project.contacts??{};
    const name=profile.company_name||contact.company_name||profile.display_name||[profile.first_name||contact.first_name,profile.last_name||contact.last_name].filter(Boolean).join(' ')||`${project.owner_kind==='guest'?'Ospite':'Utente'} · ${project.public_code||id.slice(0,8)}`;
    if(!byOwner.has(id))byOwner.set(id,{id,name,projects:[]});byOwner.get(id).projects.push(project);
   }
   groups=[...byOwner.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'));
   root.querySelector('[data-user-project-status]').textContent='Consultazione: i progetti mantengono il proprio proprietario.';owners();
  }catch(error){if(current===sequence)root.querySelector('[data-user-project-status]').textContent=error.message||'Caricamento non riuscito.';}
 }
 const unsubscribe=auth?.subscribe?.(state=>{if(!state.isAdmin)close();});
 return {open,close,destroy(){close();unsubscribe?.();root?.remove();root=null;}};
}
