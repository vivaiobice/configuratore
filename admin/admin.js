import { APP_CONFIG } from '../src/config.js';
import { connectSupabase } from '../src/backend.js';
import { filterProjects, isAdminUser, projectsToFeatureCollection, summarizeProjects } from './admin-model.js';
import { initAdminMap } from './admin-map.js';
import { createAdminService } from './admin-service.js';

const $ = (s) => document.querySelector(s);
const STATUS_LABELS = { draft:'Bozza', saved:'Salvato', pdf_downloaded:'PDF scaricato', quote_requested:'Preventivo richiesto', contacted:'Contattato', client:'Cliente' };
let client = null;
let service = null;
let currentUser = null;
let projects = [];
let selectedProjectId = null;
let adminMap = null;

function td(value) {
  const cell = document.createElement('td');
  cell.textContent = value ?? '—';
  return cell;
}

function render() {
  const filtered = filterProjects(projects, {
    environment: $('#filter-environment').value,
    status: $('#filter-status').value,
    company: $('#filter-company').value,
    zone: $('#filter-zone').value,
    grapeVariety: $('#filter-variety').value,
    rootstock: $('#filter-rootstock').value,
    contextType: $('#filter-context').value,
    campaignYear:$('#filter-campaign').value,
    origin:$('#filter-origin').value,
    ownerKind:$('#filter-owner').value,
    includeDeleted:$('#filter-deleted').checked,
    minPlants: $('#filter-plants').value,
    minArea: $('#filter-area').value
  });
  const kpi = summarizeProjects(filtered);
  adminMap?.setProjects(projectsToFeatureCollection(filtered));
  $('#kpi-projects').textContent = kpi.totalProjects.toLocaleString('it-IT');
  $('#kpi-quotes').textContent = kpi.quoteRequests.toLocaleString('it-IT');
  $('#kpi-clients').textContent = kpi.clients.toLocaleString('it-IT');
  $('#kpi-plants').textContent = kpi.totalPlants.toLocaleString('it-IT', { useGrouping:true });
  $('#kpi-guests').textContent = kpi.guestProjects.toLocaleString('it-IT');
  $('#kpi-users').textContent = kpi.registeredProjects.toLocaleString('it-IT');
  $('#kpi-fieldarea').textContent = kpi.fieldAreaProjects.toLocaleString('it-IT');
  $('#kpi-area').textContent = `${Math.round(kpi.totalAreaM2).toLocaleString('it-IT')} m²`;

  const body = $('#admin-projects');
  body.replaceChildren();
  for (const project of filtered) {
    const tr = document.createElement('tr');
    tr.append(
      td(new Date(project.created_at).toLocaleDateString('it-IT')),
      td(project.company_name ?? '—'),
      td(STATUS_LABELS[project.status] ?? project.status),
      td(`${Math.round(project.gross_area_m2 || 0).toLocaleString('it-IT')} m²`),
      td((project.commercial_plants_25 || 0).toLocaleString('it-IT',{useGrouping:true})),
      td(project.grape_variety ?? '—'),
      td(project.quote_requested ? 'Sì' : '—')
    );
    tr.addEventListener('click', () => showProject(project.id));
    body.append(tr);
  }
}

function detailItem(label, value) {
  const box = document.createElement('div');
  const name = document.createElement('span'); name.textContent = label;
  const data = document.createElement('strong'); data.textContent = value ?? '—';
  box.append(name, data);
  return box;
}

async function renderNotes(projectId) {
  const notes = await service.loadNotes(projectId);
  const list = $('#detail-notes');
  list.replaceChildren();
  if (!notes.length) {
    const li = document.createElement('li'); li.textContent = 'Nessuna nota interna.'; list.append(li); return;
  }
  for (const note of notes) {
    const li = document.createElement('li');
    const date = new Date(note.created_at).toLocaleString('it-IT');
    li.textContent = `${date} — ${note.body}`;
    list.append(li);
  }
}

async function showProject(id) {
  const project = projects.find((row) => row.id === id);
  if (!project) return;
  selectedProjectId = id;
  const contact = project.contacts ?? {};
  const activeField = Array.isArray(project.field_plans) ? (project.field_plans.find((field) => field.id === project.active_field_id) || project.field_plans[0] || {}) : {};
  $('#detail-title').textContent = `${contact.company_name ?? 'Progetto'} · ${project.public_code ?? id.slice(0,8)}`;
  $('#detail-status').value = project.status;
  const grid = $('#detail-grid');
  grid.replaceChildren(
    detailItem('Zona', project.municipality || project.location_label || '—'),
    detailItem('Provincia', project.province || '—'),
    detailItem('Referente', `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || '—'),
    detailItem('Telefono', contact.phone ?? '—'),
    detailItem('E-mail', contact.email ?? '—'),
    detailItem('Superficie', `${Math.round(project.gross_area_m2 || 0).toLocaleString('it-IT')} m²`),
    detailItem('Barbatelle', (project.commercial_plants_25 || 0).toLocaleString('it-IT')),
    detailItem('Filari', (project.row_count || 0).toLocaleString('it-IT')),
    detailItem('Sesto', `${project.row_spacing_m ?? '—'} × ${project.plant_spacing_m ?? '—'} m`),
    detailItem('Vitigno', project.grape_variety || 'Da definire'),
    detailItem('Portainnesto', project.rootstock || 'Consigliami'),
    detailItem('Clone / selezione', project.clone_selection || '—'),
    detailItem('Richiesta materiale', activeField.materialRequestNote || '—'),
    detailItem('Contesto', project.project_context_type || '—'),
    detailItem('Fonte perimetro', project.source_type || '—'),
    detailItem('Preventivo', project.quote_requested ? 'Richiesto' : '—')
  );
  $('#admin-detail').hidden = false;
  $('#detail-feedback').textContent = '';
  try { await renderNotes(id); } catch (error) { $('#detail-feedback').textContent = `Note non disponibili: ${error.message}`; }
  $('#admin-detail').scrollIntoView({ behavior:'smooth', block:'start' });
}

async function loadProjects() {
  const data = await service.loadProjects();
  projects = data.map((p) => ({ ...p, company_name:p.contacts?.company_name ?? null, quote_requested:(p.quote_requests?.length ?? 0)>0 }));
  render();
}

async function showDashboard(user) {
  if (!isAdminUser(user)) {
    $('#admin-login-feedback').textContent = 'Questo account non è autorizzato all’area amministrativa.';
    await client.auth.signOut();
    return;
  }
  currentUser = user;
  $('#admin-login').hidden = true;
  $('#admin-dashboard').hidden = false;
  if (!adminMap) adminMap = initAdminMap({ container:'admin-map', onProjectClick:showProject });
  try { await loadProjects(); } catch (error) { $('#admin-feedback').textContent = `Errore caricamento: ${error.message}`; }
}

async function init() {
  client = await connectSupabase({ url:APP_CONFIG.supabaseUrl, publishableKey:APP_CONFIG.supabasePublishableKey });
  if (!client) { $('#admin-login-feedback').textContent = 'Backend non ancora configurato.'; return; }
  service = createAdminService(client);
  const { data } = await client.auth.getSession();
  if (data.session?.user && !data.session.user.is_anonymous) await showDashboard(data.session.user);
}

$('#admin-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) return;
  const form = new FormData(event.currentTarget);
  const { data, error } = await client.auth.signInWithPassword({ email:form.get('email'), password:form.get('password') });
  if (error) { $('#admin-login-feedback').textContent = error.message; return; }
  await showDashboard(data.user);
});

$('#admin-logout').addEventListener('click', async () => { await client?.auth.signOut(); location.reload(); });
$('#detail-close').addEventListener('click', () => { selectedProjectId = null; $('#admin-detail').hidden = true; });
$('#detail-save-status').addEventListener('click', async () => {
  if (!selectedProjectId) return;
  try {
    const saved = await service.updateProjectStatus(selectedProjectId, $('#detail-status').value);
    const project = projects.find((row) => row.id === selectedProjectId);
    if (project) project.status = saved.status;
    render();
    $('#detail-feedback').textContent = 'Stato aggiornato.';
  } catch (error) { $('#detail-feedback').textContent = `Aggiornamento non riuscito: ${error.message}`; }
});
$('#detail-note-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedProjectId || !currentUser) return;
  const form = new FormData(event.currentTarget);
  try {
    await service.addNote(selectedProjectId, currentUser.id, form.get('body'));
    event.currentTarget.reset();
    await renderNotes(selectedProjectId);
    $('#detail-feedback').textContent = 'Nota aggiunta.';
  } catch (error) { $('#detail-feedback').textContent = `Nota non salvata: ${error.message}`; }
});
$('#detail-restore-project').addEventListener('click', async()=>{
  if(!selectedProjectId)return;
  try { await service.restoreProject(crypto.randomUUID(),selectedProjectId); await loadProjects(); $('#detail-feedback').textContent='Progetto ripristinato.'; }
  catch(error){ $('#detail-feedback').textContent=`Ripristino non riuscito: ${error.message}`; }
});
$('#detail-restore-revision').addEventListener('click', async()=>{
  if(!selectedProjectId)return;
  const revisionNumber=Number($('#detail-revision-number').value);
  if(!Number.isInteger(revisionNumber)||revisionNumber<1){ $('#detail-feedback').textContent='Indica una revisione valida.'; return; }
  try { await service.restoreRevision(crypto.randomUUID(),selectedProjectId,revisionNumber); await loadProjects(); $('#detail-feedback').textContent='Revisione ripristinata come nuovo stato corrente.'; }
  catch(error){ $('#detail-feedback').textContent=`Ripristino revisione non riuscito: ${error.message}`; }
});
for (const id of ['#filter-environment','#filter-status','#filter-zone','#filter-company','#filter-variety','#filter-rootstock','#filter-context','#filter-plants','#filter-area','#filter-campaign','#filter-origin','#filter-owner','#filter-deleted']) document.querySelector(id).addEventListener('input', render);
init();
