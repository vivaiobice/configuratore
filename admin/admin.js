import { APP_CONFIG } from '../src/config.js';
import { connectSupabase } from '../src/backend.js?v=50';
import { buildAdminClients, buildAdminProjects, expandProjectFields, filterAdminRows, filterProjects, isAdminUser, projectsToFeatureCollection, summarizeAdministration } from './admin-model.js?v=50';
import { initAdminMap } from './admin-map.js?v=50';
import { createAdminService } from './admin-service.js?v=50';
import { createAdminViews } from './admin-views.js?v=50';

const $=selector=>document.querySelector(selector);
let client=null,service=null,currentUser=null,projects=[],profiles=[],adminMap=null;
let activeSection='fields',selectedProjectId=null,selectedRow=null;
const views=createAdminViews({document,onSelect:selectRow});

function projectFilters(){
  return {
    environment:$('#filter-environment').value,status:$('#filter-status').value,company:$('#filter-company').value,
    zone:$('#filter-zone').value,grapeVariety:$('#filter-variety').value,rootstock:$('#filter-rootstock').value,
    contextType:$('#filter-context').value,campaignYear:$('#filter-campaign').value,origin:$('#filter-origin').value,
    ownerKind:$('#filter-owner').value,includeDeleted:$('#filter-deleted').checked,minPlants:$('#filter-plants').value,minArea:$('#filter-area').value
  };
}

function rowFilters(){
  const campaign=$('#filter-campaign').value;
  return {query:$('#filter-query').value,plantingStatus:$('#filter-planting-status').value,yearFrom:campaign,yearTo:campaign,minPlants:$('#filter-plants').value,minArea:$('#filter-area').value};
}

function filteredData(){
  const base=filterProjects(projects,projectFilters());
  const fieldRows=filterAdminRows(expandProjectFields(base),rowFilters());
  const allowedProjects=new Set(fieldRows.map(row=>row.projectId));
  const projectRows=filterAdminRows(buildAdminProjects(base).filter(row=>!$('#filter-planting-status').value||allowedProjects.has(row.projectId)),{query:$('#filter-query').value,minPlants:$('#filter-plants').value,minArea:$('#filter-area').value});
  const clientRows=filterAdminRows(buildAdminClients(base,profiles),{query:$('#filter-query').value,minPlants:$('#filter-plants').value,minArea:$('#filter-area').value});
  return {base,fieldRows,projectRows,clientRows};
}

function mapProjectsForFields(fieldRows){
  const byProject=new Map();
  for(const row of fieldRows){if(!row.geometryValid)continue;const item=byProject.get(row.projectId)??{...row.project,field_plans:[]};item.field_plans.push(row.field);byProject.set(row.projectId,item);}
  return [...byProject.values()];
}

function render(){
  const data=filteredData(),summary=summarizeAdministration(data.base,profiles);
  $('#kpi-projects').textContent=summary.totalProjects.toLocaleString('it-IT');
  $('#kpi-fields').textContent=data.fieldRows.length.toLocaleString('it-IT');
  $('#kpi-quotes').textContent=data.projectRows.filter(row=>row.quoteRequested).length.toLocaleString('it-IT');
  $('#kpi-clients').textContent=data.clientRows.length.toLocaleString('it-IT');
  $('#kpi-plants').textContent=data.fieldRows.filter(row=>row.plantingStatus==='planned').reduce((sum,row)=>sum+row.commercialPlants,0).toLocaleString('it-IT');
  $('#kpi-area').textContent=`${Math.round(data.fieldRows.reduce((sum,row)=>sum+row.areaM2,0)).toLocaleString('it-IT')} m²`;
  const rows=activeSection==='fields'?data.fieldRows:activeSection==='projects'?data.projectRows:data.clientRows;
  views.renderSection(activeSection,rows);
  adminMap?.setProjects(projectsToFeatureCollection(mapProjectsForFields(data.fieldRows)));
  for(const button of document.querySelectorAll('[data-admin-section]'))button.classList.toggle('active',button.dataset.adminSection===activeSection);
  return data;
}

async function renderNotes(projectId){
  const list=$('#detail-notes');if(!list)return;list.replaceChildren();
  try{
    const notes=await service.loadNotes(projectId);
    if(!notes.length){const li=document.createElement('li');li.textContent='Nessuna nota interna.';list.append(li);return;}
    for(const note of notes){const li=document.createElement('li');li.textContent=`${new Date(note.created_at).toLocaleString('it-IT')} — ${note.body}`;list.append(li);}
  }catch(error){$('#detail-feedback').textContent=`Note non disponibili: ${error.message}`;}
}

async function selectRow(kind,row){
  activeSection=kind;selectedRow=row;selectedProjectId=kind==='fields'?row.projectId:kind==='projects'?row.projectId:null;
  views.renderDetail(kind,row);
  if(kind==='projects'){
    $('#detail-status').value=row.status;
    await renderNotes(row.projectId);
  }
}

async function selectMapField({projectId,fieldId}){
  const data=filteredData();const row=data.fieldRows.find(item=>item.projectId===String(projectId)&&item.fieldId===String(fieldId));
  if(row)await selectRow('fields',row);
}

async function loadProjects(){
  const [projectRows,profileRows]=await Promise.all([service.loadProjects(),service.loadProfiles()]);
  projects=projectRows.map(project=>({...project,company_name:project.contacts?.company_name??null,quote_requested:(project.quote_requests?.length??0)>0}));
  profiles=profileRows;render();
}

async function showDashboard(user){
  if(!isAdminUser(user)){ $('#admin-login-feedback').textContent='Questo account non è autorizzato all’area amministrativa.';await client.auth.signOut();return; }
  currentUser=user;$('#admin-login').hidden=true;$('#admin-dashboard').hidden=false;
  if(!adminMap)adminMap=initAdminMap({container:'admin-map',onProjectClick:selectMapField});
  try{await loadProjects();}catch(error){$('#admin-feedback').textContent=`Errore caricamento: ${error.message}`;}
}

async function init(){
  client=await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
  if(!client){$('#admin-login-feedback').textContent='Backend non ancora configurato.';return;}
  service=createAdminService(client);const {data}=await client.auth.getSession();
  if(data.session?.user&&!data.session.user.is_anonymous)await showDashboard(data.session.user);
}

$('#admin-login-form').addEventListener('submit',async event=>{event.preventDefault();if(!client)return;const form=new FormData(event.currentTarget);const {data,error}=await client.auth.signInWithPassword({email:form.get('email'),password:form.get('password')});if(error){$('#admin-login-feedback').textContent=error.message;return;}await showDashboard(data.user);});
$('#admin-logout').addEventListener('click',async()=>{await client?.auth.signOut();location.reload();});
$('#detail-close').addEventListener('click',()=>{selectedProjectId=null;selectedRow=null;views.clearDetail();});
for(const button of document.querySelectorAll('[data-admin-section]'))button.addEventListener('click',()=>{activeSection=button.dataset.adminSection;views.clearDetail();render();$('#admin-list').scrollIntoView({behavior:'smooth',block:'start'});});
for(const card of document.querySelectorAll('[data-kpi]'))card.addEventListener('click',()=>{const kind=card.dataset.kpi;if(kind==='quotes'){$('#filter-status').value='quote_requested';activeSection='projects';}else activeSection=kind==='clients'?'clients':kind==='projects'?'projects':'fields';views.clearDetail();render();$('#admin-list').scrollIntoView({behavior:'smooth',block:'start'});});

$('#detail-save-status').addEventListener('click',async()=>{if(!selectedProjectId||!selectedRow)return;try{const saved=await service.updateProjectStatus(selectedProjectId,$('#detail-status').value);const project=projects.find(row=>String(row.id)===String(selectedProjectId));if(project)project.status=saved.status;selectedRow.status=saved.status;render();views.renderDetail('projects',selectedRow);$('#detail-feedback').textContent='Stato aggiornato.';}catch(error){$('#detail-feedback').textContent=`Aggiornamento non riuscito: ${error.message}`;}});
$('#detail-note-form').addEventListener('submit',async event=>{event.preventDefault();if(!selectedProjectId||!currentUser)return;const form=new FormData(event.currentTarget);try{await service.addNote(selectedProjectId,currentUser.id,form.get('body'));event.currentTarget.reset();await renderNotes(selectedProjectId);$('#detail-feedback').textContent='Nota aggiunta.';}catch(error){$('#detail-feedback').textContent=`Nota non salvata: ${error.message}`;}});
$('#detail-restore-project').addEventListener('click',async()=>{if(!selectedProjectId)return;try{await service.restoreProject(crypto.randomUUID(),selectedProjectId);await loadProjects();$('#detail-feedback').textContent='Progetto ripristinato.';}catch(error){$('#detail-feedback').textContent=`Ripristino non riuscito: ${error.message}`;}});
$('#detail-restore-revision').addEventListener('click',async()=>{if(!selectedProjectId)return;const revisionNumber=Number($('#detail-revision-number').value);if(!Number.isInteger(revisionNumber)||revisionNumber<1){$('#detail-feedback').textContent='Indica una revisione valida.';return;}try{await service.restoreRevision(crypto.randomUUID(),selectedProjectId,revisionNumber);await loadProjects();$('#detail-feedback').textContent='Revisione ripristinata come nuovo stato corrente.';}catch(error){$('#detail-feedback').textContent=`Ripristino revisione non riuscito: ${error.message}`;}});

for(const id of ['#filter-environment','#filter-status','#filter-zone','#filter-company','#filter-variety','#filter-rootstock','#filter-context','#filter-plants','#filter-area','#filter-campaign','#filter-origin','#filter-owner','#filter-deleted','#filter-query','#filter-planting-status'])document.querySelector(id).addEventListener('input',render);
init();
