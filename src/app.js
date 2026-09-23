import { createInitialState, mergeProjectState, applyGeometryWithSuggestedOrientation } from './state.js';
import { createMobileUI } from './mobile-ui.js?v=40';
import { createDesktopLibraryUI } from './desktop-library-ui.js?v=37';
import { createDesktopQuickCalculator, createSaveFeedback, createDesktopMapFieldAction, createCadastreMenu, createDesktopFieldSelectors, createDesktopMapSearchAction, setToolButtonLabel } from './desktop-ux.js?v=39';
import { readLocalProjects, writeLocalProject } from './local-projects.js?v=37';
import { renameArchivedProject as renameArchivedProjectRecord, deleteArchivedProject as deleteArchivedProjectRecord } from './project-archive-actions.js?v=37';
import { initMap } from './map.js?v=40';
import { calculateProject, calculateManualPlants } from './project-calculator.js?v=16';
import { loadDraft, saveDraft, newSessionId, getConsentState, setConsentState } from './storage.js';
import { APP_CONFIG } from './config.js';
import { connectSupabase, createBackend } from './backend.js?v=34';
import { createCloudService, hydrateOwnedProjects } from './cloud.js?v=34';
import { mergeCloudSnapshot } from './cloud-state.js';
import { createSyncQueue } from './sync-queue.js';
import { createIndexedDbSyncAdapter } from './indexeddb-sync-adapter.js';
import { createProjectSync } from './project-sync.js?v=34';
import { buildCloudSnapshot } from './cloud-project-model.js';
import { parseResumeParams } from './resume.js';
import { adviseProject } from './project-advisor.js';
import { ensureProjectFields, updateActiveFieldProject, addProjectField, switchProjectField, removeActiveProjectField, renameActiveProjectField, autoNameActiveProjectField } from './fields.js?v=28';
import { normalizeHeadlandForMechanization } from './project-rules.js';
import { OTHER_MATERIAL_VALUE, listVarieties, listClonesForVariety, listRootstocksForSelection, isOtherMaterialSelection, isKnownCloneForVariety, isKnownRootstockForSelection } from './plant-catalog.js';
import { createAuthService } from './auth-service.js?v=33';
import { createAuthBridge } from './auth-bridge.js';
import { createProfileUI } from './profile-ui.js';

const $ = (selector) => document.querySelector(selector);
const stored = loadDraft(globalThis.localStorage);
let state = stored?.project ? { ...createInitialState(), ...stored, project: ensureProjectFields({ ...createInitialState().project, ...stored.project }) } : createInitialState();
if (!state.project.projectContextType) state = { ...state, project:{ ...state.project, projectContextType:'new_planting' } };
state = { ...state, project:updateActiveFieldProject(state.project, {
  projectContextType:state.project.projectContextType || 'new_planting',
  headlandWidthM:normalizeHeadlandForMechanization(state.project.headlandWidthM, state.project.mechanizedHarvest)
}) };
let mapApi = null;
let mobileUi = null;
let desktopLibraryUi = null;
let vertexEditingActive = false;
let cloudService = null;
let projectSync = null;
let cloudBackend = null;
let accountAuthService = null;
let latestMetrics = null;
let pendingFinalAction = null;
let mobileTransactionSnapshot = null;
let perimeterEventSent = Boolean(state.project.geometry);
const authBridge=createAuthBridge();
const profileUi=createProfileUI({authService:authBridge,document});
profileUi.mount();
const desktopQuickCalculator=createDesktopQuickCalculator({document,calculate:calculateManualPlants,onCalculate:(areaM2)=>track('manual_area_calculated',{areaM2})});
desktopQuickCalculator.mount();
const summarySaveFeedback=createSaveFeedback($('#summary-save-project'));
const sessionId = (() => {
  const existing = globalThis.sessionStorage?.getItem('vivai-obice:configuratore:session');
  if (existing) return existing;
  const id = newSessionId();
  globalThis.sessionStorage?.setItem('vivai-obice:configuratore:session', id);
  return id;
})();
void sessionId;

const statusEl = $('#map-status');
function setStatus(message) { if (statusEl) statusEl.textContent = message; }
function persist() { saveDraft(globalThis.localStorage, state); }
function track(type, payload = {}) { cloudService?.trackEvent(type, payload).catch((error) => console.warn('Analytics event not recorded', type, error)); }
function numberOrNull(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function formatArea(value) { if (!value) return '—'; if (value >= 10000) return `${(value / 10000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} ha`; return `${Math.round(value).toLocaleString('it-IT')} m²`; }
function formatMetres(value) { return value ? `${Math.round(value).toLocaleString('it-IT')} m` : '—'; }
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }

function renderManualAreaCalculation() {
  desktopQuickCalculator.render();
}

function renderProjectAdvice(project) {
  const container = $('#project-advice');
  if (!container) return;
  const advice = adviseProject(project);
  const mechanizedAdvice=$('#mechanized-advice');
  const mechanizedItem=advice.find(item=>item.code==='mechanization_verify_machine'||item.code==='mechanization_headland_missing');
  if(mechanizedAdvice){mechanizedAdvice.textContent=mechanizedItem?.message??'';mechanizedAdvice.hidden=!mechanizedItem;}
  container.replaceChildren();
  container.hidden = advice.length === 0;
  for (const item of advice) {
    const message = document.createElement('p');
    message.className = `project-advice-item advice-${item.code} ${item.level === 'attention' ? 'attention' : 'info'}`;
    message.textContent = item.message;
    container.append(message);
  }
}

function calculateFieldProject(project) {
  return calculateProject({
    polygon:project?.geometry,
    exclusions:(project?.exclusions ?? []).map((item) => item?.geometry ?? item),
    rowSpacingM:project?.rowSpacingM,
    plantSpacingM:project?.plantSpacingM,
    orientationDeg:project?.orientationDeg,
    postSpacingM:project?.postSpacingM,
    headlandWidthM:project?.headlandWidthM
  });
}

function calculateAndRender() {
  const project = state.project;
  const result = calculateFieldProject(project);
  latestMetrics = result;
  const areaText = formatArea(result.areaM2);
  const perimeterText = formatMetres(result.perimeterM);
  const rowsText = result.rowCount ? result.rowCount.toLocaleString('it-IT') : '—';
  const linearText = formatMetres(result.rowLinearM);
  const plantsText = result.simulatedPlants ? result.simulatedPlants.toLocaleString('it-IT') : '—';
  const commercialPlantsText = result.commercialPlants25 ? result.commercialPlants25.toLocaleString('it-IT') : '—';
  setText('#summary-area', areaText);
  setText('#summary-perimeter', perimeterText);
  setText('#summary-rows', rowsText);
  setText('#summary-linear', linearText);
  setText('#summary-posts', result.totalPosts.toLocaleString('it-IT'));
  setText('#summary-head-posts', result.headPosts.toLocaleString('it-IT'));
  setText('#summary-plants', plantsText);
  setText('#summary-commercial', commercialPlantsText);
  mobileUi?.renderField();
  renderManualAreaCalculation();
  mapApi?.setRows(result.rows);
  mapApi?.setExclusions(project.exclusions ?? []);
  mapApi?.setActiveFieldLabel(project.label ?? 'Campo');
  syncOtherFieldsOnMap();
  const centerButton = $('#center-field-button');
  if (centerButton) centerButton.disabled = !project.geometry;
  renderProjectAdvice(project);
  if (project.geometry && result.vertexCount) {
    const posts = result.totalPosts ? ` · ${result.totalPosts} pali stimati` : '';
    const excluded = result.excludedAreaM2 ? ` · ${formatArea(result.excludedAreaM2)} esclusi` : '';
    setStatus(`${result.vertexCount} vertici · ${formatArea(result.areaM2)}${excluded} · ${result.rowCount} filari${posts}`);
  }
}

function syncOrientationControl() {
  const control = $('#orientation');
  const output = $('#orientation-output');
  if (control) control.value = state.project.orientationDeg ?? 0;
  if (output) output.value = `${state.project.orientationDeg ?? 0}°`;
}
function patchProject(patch) { state = mergeProjectState(state, patch); summarySaveFeedback.dirty(); persist(); calculateAndRender(); projectSync?.schedule('project_changed'); }
function patchMaterialProject(patch) {
  state = mergeProjectState(state, patch);
  state = { ...state, project:autoNameActiveProjectField(state.project) };
  summarySaveFeedback.dirty();
  persist(); calculateAndRender(); renderFieldManager(); projectSync?.schedule('material_changed');
}
function patchGeometry(geometry, patch = {}) {
  const proposed = applyGeometryWithSuggestedOrientation({ ...state.project, ...patch }, geometry);
  state = { ...state, project:updateActiveFieldProject(state.project, { ...patch, geometry:proposed.geometry, orientationDeg:proposed.orientationDeg, orientationLocked:proposed.orientationLocked }) };
  summarySaveFeedback.dirty();
  syncOrientationControl();
  persist();
  calculateAndRender();
  void projectSync?.flush();
}
function bindNumberInput(selector, key) { $(selector)?.addEventListener('input', (event) => patchProject({ [key]: numberOrNull(event.target.value) })); }

try {
  mapApi = initMap({
    container: 'map',
    requiresLinearConfirmation:isMobileMap,
    enableTouchRotation:isMobileMap,
    allowPanWhileEditing:isMobileMap,
    onFieldSelect:(fieldId)=>{
      if (!isMobileMap()) return;
      // Preview gestures must not switch fields or leave the parameters transaction.
      if (mobileUi && !mobileUi.isHome()) return;
      if (fieldId) { state={...state,project:switchProjectField(state.project,fieldId)};persist();loadActiveFieldOnMap(); }
      mobileUi?.openField(state.project.activeFieldId);
    },
    onGeometryChange: (geometry) => {
      const sourcePatch = state.project.sourceType === 'cadastral' ? { sourceType:'mixed' } : {};
      patchGeometry(geometry, sourcePatch);
      mobileUi?.geometryCommitted();
      if (geometry && !perimeterEventSent) { perimeterEventSent = true; track('perimeter_completed', { vertices:Math.max(0, geometry.length - 1) }); }
    },
    onExclusionAdd: (geometry, meta = {}) => {
      const existing = state.project.exclusions ?? [];
      const baseLabel = meta.label || `Area esclusa ${existing.length + 1}`;
      const label = Number(meta.parts) > 1 ? `${baseLabel} · parte ${meta.part}` : baseLabel;
      const exclusions = [...existing, { id:`ex-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label, type:meta.type || 'area', widthM:meta.widthM ?? null, geometry }];
      patchProject({ exclusions });
      renderExclusions();
      track('excluded_zone_added', { count:exclusions.length, type:meta.type || 'area' });
    },
    onExclusionChange: (id, geometry) => {
      patchProject({exclusions:(state.project.exclusions ?? []).map(item=>item.id===id ? {...item,geometry} : item)});
    },
    onCadastralParcel: (parcel, selection) => {
      patchGeometry(selection?.coordinates ?? parcel.coordinates, {
        sourceType:'cadastral',
        cadastralRefs:selection?.refs ?? [{ id:parcel.id, reference:parcel.reference }]
      });
      track('cadastral_parcel_selected', { selected:true, parcelCount:selection?.refs?.length ?? 1 });
    },
    onStatus: setStatus,
    onDrawingState: ({ active, canClose, mode, vertexCount }) => {
      mobileUi?.drawingState({active,vertexCount});
      desktopMapFieldAction.drawingState({active,canClose,mode});
      const closeButton = $('#close-perimeter-button');
      if (closeButton) {
        closeButton.hidden = !active;
        closeButton.disabled = !canClose;
        setToolButtonLabel(closeButton,mode === 'linear-exclusion' ? 'Conferma passaggio' : mode === 'exclusion' ? 'Chiudi esclusione' : 'Chiudi perimetro',{icon:'✓'});
      }
      $('#exclude-zone-button')?.classList.toggle('active', Boolean(active && mode === 'exclusion'));
      $('#exclude-line-button')?.classList.toggle('active', Boolean(active && mode === 'linear-exclusion'));
      $('#draw-button')?.classList.toggle('active', Boolean(active && mode === 'perimeter'));
    },
    onEditingState: ({ active }) => {
      mobileUi?.editingState({active});
      vertexEditingActive = Boolean(active);
      const button = $('#edit-vertices-button');
      if (button) {
        button.classList.toggle('active', vertexEditingActive);
        setToolButtonLabel(button,vertexEditingActive ? 'Fine modifica' : 'Modifica punti',{icon:vertexEditingActive?'✓':'✥'});
        button.setAttribute('aria-pressed', String(vertexEditingActive));
      }
    },
    onReady: calculateAndRender
  });
  if (state.project.geometry) mapApi.setGeometry(state.project.geometry);
  mapApi.setExclusions(state.project.exclusions ?? []);
  syncOtherFieldsOnMap();
  mapApi.setBaseMap(state.map?.base ?? 'satellite');
  if (state.map?.cadastralVisible) mapApi.setCadastralVisible(true);
} catch (error) { console.error(error); setStatus('Impossibile caricare la mappa. Controlla la connessione e riprova.'); }

$('#row-spacing').value = state.project.rowSpacingM ?? 2.5;
$('#plant-spacing').value = state.project.plantSpacingM ?? 0.9;
$('#orientation').value = state.project.orientationDeg ?? 0;
$('#orientation-output').value = `${state.project.orientationDeg ?? 0}°`;
$('#headland').value = state.project.headlandWidthM ?? '';
$('#post-spacing').value = state.project.postSpacingM ?? 4.5;
$('#mechanized').checked = Boolean(state.project.mechanizedHarvest);
$('#headland').min = state.project.mechanizedHarvest ? '6' : '0';
$('#project-context').value = state.project.projectContextType || 'new_planting';
$('#project-context-note').value = state.project.projectContextNote ?? '';
$('#campaign-year').value = state.project.campaignYear ?? new Date().getFullYear();
$('#campaign-year-desktop').value = state.project.campaignYear ?? new Date().getFullYear();
renderMaterialSelectors();
const newPlantingOption = $('#project-context')?.querySelector('option[value="new_planting"]');
if (newPlantingOption) newPlantingOption.dataset.context = 'new_planting', newPlantingOption.textContent = 'Nuovo Impianto';

function addSelectOption(select, value, label = value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function populateMaterialSelect(select, { placeholderValue = '', placeholderLabel, values = [], selected = '', includeOther = true }) {
  if (!select) return;
  select.replaceChildren();
  addSelectOption(select, placeholderValue, placeholderLabel);
  for (const value of values) addSelectOption(select, value);
  if (includeOther) addSelectOption(select, OTHER_MATERIAL_VALUE, 'Altro');
  const available = new Set([placeholderValue, ...values, ...(includeOther ? [OTHER_MATERIAL_VALUE] : [])]);
  if (selected && !available.has(selected)) addSelectOption(select, selected, `${selected} (selezione precedente)`);
  select.value = selected && [...select.options].some((option) => option.value === selected) ? selected : placeholderValue;
}

function renderMaterialSelectors() {
  const varietySelect = $('#grape-variety');
  const cloneSelect = $('#clone-selection');
  const rootstockSelect = $('#rootstock');
  if (!varietySelect || !cloneSelect || !rootstockSelect) return;

  const variety = state.project.grapeVariety ?? '';
  const clone = state.project.cloneSelection ?? '';
  const rootstock = state.project.rootstock ?? '';
  populateMaterialSelect(varietySelect, { placeholderLabel:'Da definire', values:listVarieties(), selected:variety });
  populateMaterialSelect(cloneSelect, { placeholderLabel:'Da definire', values:listClonesForVariety(variety), selected:clone });
  populateMaterialSelect(rootstockSelect, { placeholderLabel:'Consigliami', values:listRootstocksForSelection(variety, clone), selected:rootstock });

  const requestWrap = $('#material-request-wrap');
  const requestNote = $('#material-request-note');
  const hasOther = [variety, clone, rootstock].some(isOtherMaterialSelection);
  if (requestWrap) requestWrap.hidden = !hasOther;
  if (requestNote && requestNote.value !== (state.project.materialRequestNote ?? '')) requestNote.value = state.project.materialRequestNote ?? '';
}

function syncProjectControls() {
  $('#row-spacing').value = state.project.rowSpacingM ?? 2.5;
  $('#plant-spacing').value = state.project.plantSpacingM ?? 0.9;
  $('#orientation').value = state.project.orientationDeg ?? 0;
  $('#orientation-output').value = `${state.project.orientationDeg ?? 0}°`;
  $('#headland').value = state.project.headlandWidthM ?? '';
  $('#post-spacing').value = state.project.postSpacingM ?? 4.5;
  $('#mechanized').checked = Boolean(state.project.mechanizedHarvest);
  $('#headland').min = state.project.mechanizedHarvest ? '6' : '0';
  $('#project-context').value = state.project.projectContextType || 'new_planting';
  $('#project-context-note').value = state.project.projectContextNote ?? '';
  $('#campaign-year').value = state.project.campaignYear ?? new Date().getFullYear();
  $('#campaign-year-desktop').value = state.project.campaignYear ?? new Date().getFullYear();
  const projectName=$('#project-name');
  if(projectName&&projectName.value!==(state.project.localProjectName??'Il mio impianto'))projectName.value=state.project.localProjectName??'Il mio impianto';
  renderMaterialSelectors();
}

const desktopFieldSelectors=createDesktopFieldSelectors({document,onSelect:(id)=>{
  state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap();mapApi?.focusActiveField();
}});
desktopFieldSelectors.mount();

function renderFieldManager() {
  mobileUi?.renderField();
  desktopFieldSelectors.render(state.project.fields ?? [],state.project.activeFieldId);
  const remove = $('#remove-field-button'); if (remove) remove.disabled = (state.project.fields?.length ?? 1) <= 1;
  const fieldName = $('#field-name');
  if (fieldName && fieldName.value !== (state.project.label ?? '')) fieldName.value = state.project.label ?? '';
}

function renderExclusions() {
  const list = $('#exclusion-list'); if (!list) return; list.replaceChildren();
  const items = state.project.exclusions ?? [];
  if (!items.length) { const empty = document.createElement('p'); empty.className='empty-exclusions'; empty.textContent='Nessuna area esclusa.'; list.append(empty); return; }
  items.forEach((item, index) => {
    const row = document.createElement('div'); row.className='exclusion-item';
    const input = document.createElement('input'); input.value=item.label ?? `Area esclusa ${index+1}`; input.setAttribute('aria-label','Nome area esclusa');
    input.addEventListener('change', () => { const exclusions = (state.project.exclusions ?? []).map(x=>x.id===item.id?{...x,label:input.value.trim() || `Area esclusa ${index+1}`} : x); patchProject({exclusions}); });
    const edit = document.createElement('button'); edit.type='button'; edit.textContent='Modifica'; edit.addEventListener('click',()=>{ if (isMobileMap()) setMapFullscreen(true); mapApi?.beginExclusionEditing(item.id); });
    const remove = document.createElement('button'); remove.type='button'; remove.textContent='Elimina'; remove.title='Rimuovi area esclusa'; remove.addEventListener('click', () => {
      mapApi?.finishVertexEditing();
      const exclusions = (state.project.exclusions ?? []).filter(x=>x.id!==item.id);
      patchProject({exclusions}); renderExclusions();
    });
    row.append(input, edit, remove); list.append(row);
  });
}

function syncOtherFieldsOnMap() {
  const otherFields = (state.project.fields ?? [])
    .filter((field) => field.id !== state.project.activeFieldId && Array.isArray(field.geometry) && field.geometry.length >= 4)
    .map((field) => {
      const metrics = calculateFieldProject(field);
      return { ...field, rows:metrics.rows };
    });
  mapApi?.setOtherFields(otherFields);
  mapApi?.setActiveFieldLabel(state.project.label ?? 'Campo');
}

function loadActiveFieldOnMap() {
  mapApi?.clearGeometry();
  syncOtherFieldsOnMap();
  if (state.project.geometry) mapApi?.setGeometry(state.project.geometry);
  mapApi?.setExclusions(state.project.exclusions ?? []);
  syncProjectControls(); renderFieldManager(); renderExclusions(); calculateAndRender();
}

$('#field-name')?.addEventListener('input', (event) => {
  state = { ...state, project:renameActiveProjectField(state.project, event.target.value) };
  summarySaveFeedback.dirty();
  persist();
  desktopFieldSelectors.render(state.project.fields ?? [],state.project.activeFieldId);
  mapApi?.setActiveFieldLabel(state.project.label);
  syncOtherFieldsOnMap();
});
function updateCampaignYear(event){
  const value=Number(event.target.value);
  if(Number.isInteger(value)&&value>=2000&&value<=2100)patchProject({campaignYear:value});
}
$('#campaign-year')?.addEventListener('input',updateCampaignYear);
$('#campaign-year-desktop')?.addEventListener('input',updateCampaignYear);
$('#project-name')?.addEventListener('input',(event)=>patchProject({localProjectName:event.target.value}));
$('#add-field-button')?.addEventListener('click', () => { state = { ...state, project:addProjectField(state.project) }; summarySaveFeedback.dirty();persist(); loadActiveFieldOnMap(); });
$('#remove-field-button')?.addEventListener('click', () => { if ((state.project.fields?.length ?? 1) <= 1) return; if (!globalThis.confirm?.('Rimuovere il campo attivo dal progetto?')) return; state = { ...state, project:removeActiveProjectField(state.project) };summarySaveFeedback.dirty(); persist(); loadActiveFieldOnMap(); });

function isMobileMap() { return Boolean(globalThis.matchMedia?.('(max-width: 800px), (max-width: 1100px) and (pointer: coarse)')?.matches); }
function startDrawingField() { patchProject({ sourceType:'manual', cadastralRefs:[] }); mapApi?.beginDraw(); }
function addFieldAndStartDrawing(){
  if(state.project.geometry){state={...state,project:addProjectField(state.project)};summarySaveFeedback.dirty();persist();loadActiveFieldOnMap();}
  startDrawingField();
}
const desktopMapFieldAction=createDesktopMapFieldAction({document,addField:addFieldAndStartDrawing,finishDraw:()=>mapApi?.finishDraw()});
desktopMapFieldAction.mount();
$('#draw-button')?.addEventListener('click', () => { if (isMobileMap()) setMapFullscreen(true); else startDrawingField(); });
$('#draw-map-button')?.addEventListener('click', startDrawingField);
$('#close-perimeter-button')?.addEventListener('click', () => mapApi?.finishDraw());
$('#exclude-zone-button')?.addEventListener('click', () => mapApi?.beginExclusionDraw());
$('#exclude-line-button')?.addEventListener('click', () => mapApi?.beginLinearExclusionDraw());
$('#edit-vertices-button')?.addEventListener('click', () => vertexEditingActive ? mapApi?.finishVertexEditing() : mapApi?.beginVertexEditing());
$('#center-field-button')?.addEventListener('click', () => mapApi?.focusActiveField());
$('#remove-vertex-button')?.addEventListener('click', () => mapApi?.beginVertexRemoval());
$('#clear-field-button')?.addEventListener('click', () => { if (!state.project.geometry && !(state.project.exclusions?.length)) return; mapApi?.clearGeometry(); patchProject({ geometry:null, exclusions:[], sourceType:'manual', cadastralRefs:[] }); renderExclusions(); setStatus('Campo cancellato. Puoi disegnare un nuovo perimetro.'); });
async function locateFrom(source) {
  try {
    await mapApi?.locate();
    track('gps_used', { source });
  } catch {}
}
$('#gps-button')?.addEventListener('click', () => locateFrom('panel_button'));
$('#map-gps-button')?.addEventListener('click', () => locateFrom('map_button'));
const searchInput = $('#search-input');
const searchSuggestions = $('#search-suggestions');
createDesktopMapSearchAction({document}).mount();
let suggestionTimer = null;
let suggestionRequest = 0;
function hideSuggestions() { if (searchSuggestions) { searchSuggestions.hidden = true; searchSuggestions.replaceChildren(); } }
function storeSearchResult(result) {
  if (!result) return;
  patchProject({ locationLabel:result.locationLabel ?? result.label ?? '', municipality:result.municipality ?? '', province:result.province ?? '', region:result.region ?? '' });
}
async function runSearch(query) {
  try {
    const result = await mapApi?.search(query);
    storeSearchResult(result);
    track('location_searched', { found:Boolean(result) });
    return result;
  } catch (error) {
    console.error(error);
    setStatus('Ricerca momentaneamente non disponibile. Puoi navigare manualmente sulla mappa.');
    return null;
  }
}
function renderSuggestions(items) {
  if (!searchSuggestions) return;
  searchSuggestions.replaceChildren();
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-suggestion';
    button.setAttribute('role', 'option');
    button.textContent = item.label;
    button.addEventListener('click', async () => {
      if (searchInput) searchInput.value = item.label;
      hideSuggestions();
      await runSearch(item.label);
    });
    searchSuggestions.append(button);
  }
  searchSuggestions.hidden = items.length === 0;
}
searchInput?.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearTimeout(suggestionTimer);
  if (query.length < 3) { hideSuggestions(); return; }
  const requestId = ++suggestionRequest;
  suggestionTimer = setTimeout(async () => {
    try {
      const items = await mapApi?.suggest(query) ?? [];
      if (requestId === suggestionRequest && searchInput.value.trim() === query) renderSuggestions(items);
    } catch { if (requestId === suggestionRequest) hideSuggestions(); }
  }, 280);
});
$('#search-form')?.addEventListener('submit', async (event) => { event.preventDefault(); hideSuggestions(); await runSearch(searchInput?.value ?? ''); });
document.addEventListener('click', (event) => { if (!event.target.closest('.search-shell')) hideSuggestions(); });
const cadastreMenu=createCadastreMenu({
  document,isActive:()=>Boolean(state.map?.cadastralVisible),
  setActive:(next)=>{state={...state,map:{...state.map,cadastralVisible:next}};persist();mapApi?.setCadastralVisible(next);track('cadastre_toggled',{visible:next});},
  onSelect:()=>mapApi?.beginCadastralSelect()
});
cadastreMenu.mount();
for (const button of document.querySelectorAll('[data-base]')) { button.classList.toggle('active', button.dataset.base === (state.map?.base ?? 'satellite')); button.addEventListener('click', () => { for (const sibling of document.querySelectorAll('[data-base]')) sibling.classList.remove('active'); button.classList.add('active'); const base = button.dataset.base; mapApi?.setBaseMap(base); state = { ...state, map: { ...state.map, base } }; persist(); track('base_map_changed', { base }); }); }
$('#rotate-left')?.addEventListener('click', () => mapApi?.rotateBy(-15));
$('#rotate-right')?.addEventListener('click', () => mapApi?.rotateBy(15));
$('#north-button')?.addEventListener('click', () => mapApi?.resetNorth());

const mapWrap = document.querySelector('.map-wrap');
const appShell = document.querySelector('.app-shell');
const panelScroll = document.querySelector('.panel-scroll');
const stepOne = document.querySelector('.step[data-step="1"]');
const exclusionPanel = document.querySelector('.exclusion-panel');
const exclusionHome = document.createComment('exclusions-home');
exclusionPanel?.before(exclusionHome);
let fullscreenScrollY = 0;
function placeMapForViewport() {
  if (!mapWrap || !appShell || !panelScroll || !stepOne) return;
  if (mobileUi?.isActive?.()) { mobileUi.sync(); requestAnimationFrame(()=>mapApi?.map?.resize?.()); return; }
  if (mapWrap.classList.contains('fullscreen-map')) { mobileUi?.sync(); requestAnimationFrame(()=>mapApi?.map?.resize?.()); return; }
  const mobile = isMobileMap();
  if (mobile) mapApi?.stopTools();
  const drawButton=$('#draw-button');
  if (drawButton) drawButton.textContent=mobile ? 'Apri editor mappa' : 'Disegna terreno';
  if (mobile) stepOne.insertAdjacentElement('afterend', mapWrap);
  else if (mapWrap.parentElement !== appShell) appShell.append(mapWrap);
  mobileUi?.sync();
  requestAnimationFrame(() => mapApi?.map?.resize?.());
}
placeMapForViewport();
globalThis.addEventListener?.('resize', placeMapForViewport);
const mapFullscreenButton = $('#map-fullscreen-button');
// Keep entry/exit outside the scrollable toolbar so it is always reachable.
if (mapFullscreenButton) mapWrap?.append(mapFullscreenButton);
function setMapFullscreen(active) {
  const next = Boolean(active);
  if (next && mobileUi?.isActive?.()) {
    mobileUi.navigate?.('editor');
    requestAnimationFrame(()=>mapApi?.map?.resize?.());
    return;
  }
  if (!mapWrap || next === mapWrap.classList.contains('fullscreen-map')) return;
  if (next) {
    fullscreenScrollY=window.scrollY;
    document.body.append(mapWrap);
    if (isMobileMap() && exclusionPanel) $('#fullscreen-exclusions-content')?.append(exclusionPanel);
  } else {
    mapApi?.stopTools();
    if (exclusionPanel) exclusionHome.after(exclusionPanel);
    const exclusions=$('#fullscreen-exclusions'); if (exclusions) exclusions.open=false;
  }
  mapWrap?.classList.toggle('fullscreen-map', next);
  document.body.classList.toggle('map-fullscreen-open', next);
  if (mapFullscreenButton) {
    mapFullscreenButton.setAttribute('aria-pressed', String(next));
    mapFullscreenButton.setAttribute('aria-label', next ? 'Chiudi mappa a tutto schermo' : 'Apri la mappa a tutto schermo');
    mapFullscreenButton.textContent = next ? '✓ Torna al progetto' : '⛶ Apri mappa a tutto schermo';
  }
  if (!next) { placeMapForViewport(); window.scrollTo(0,fullscreenScrollY); }
  mobileUi?.sync();
  requestAnimationFrame(() => mapApi?.map?.resize?.());
}
if (mapFullscreenButton) mapFullscreenButton.textContent='⛶ Apri mappa a tutto schermo';
mapFullscreenButton?.addEventListener('click', () => setMapFullscreen(!mapWrap?.classList.contains('fullscreen-map')));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mapWrap?.classList.contains('fullscreen-map')) setMapFullscreen(false);
});

function snapshotMobileTransaction() { mobileTransactionSnapshot = JSON.parse(JSON.stringify(state)); }
function ensureLocalProjectIdentity(name = '') {
  if (!state.project.localProjectId) state = { ...state, project:{ ...state.project, localProjectId:newSessionId() } };
  if (name.trim()) state = { ...state, project:{ ...state.project, localProjectName:name.trim() } };
  persist();
}
function beginMobileNewField() {
  snapshotMobileTransaction();
  const fields = state.project.fields ?? [];
  if (!(fields.length === 1 && !fields[0].geometry)) state = { ...state, project:addProjectField(state.project) };
  persist(); loadActiveFieldOnMap(); mapApi?.beginDraw();
}
function beginMobileEdit() { snapshotMobileTransaction(); }
function cancelMobileEdit() {
  if (!mobileTransactionSnapshot) return;
  state = mobileTransactionSnapshot; mobileTransactionSnapshot = null;
  persist(); loadActiveFieldOnMap();
}
async function saveMobileProject(name = '') {
  ensureLocalProjectIdentity(name || state.project.localProjectName || 'Il mio impianto');
  await projectSync?.saveRevision();
  writeLocalProject(globalThis.localStorage, state.project, state.project.localProjectName, state.cloud);
  mobileTransactionSnapshot = null;
}
function loadMobileProject(item) {
  if (!item?.project) return;
  state = {
    ...state,
    project:ensureProjectFields(JSON.parse(JSON.stringify(item.project))),
    cloud:item.cloud ? JSON.parse(JSON.stringify(item.cloud)) : undefined
  };
  cloudService?.selectProject(state.cloud);
  projectSync?.adoptCloudState(state.cloud);
  mobileTransactionSnapshot = null; persist(); loadActiveFieldOnMap();
}
function newMobileProject() {
  state = { ...state, project:createInitialState().project, cloud:undefined };
  cloudService?.selectProject({});
  projectSync?.adoptCloudState({});
  ensureLocalProjectIdentity('Il mio impianto'); mobileTransactionSnapshot = null; loadActiveFieldOnMap();
}
function removeMobileField(fieldId) {
  const selected = switchProjectField(state.project, fieldId);
  const localProjectId = selected.localProjectId;
  const localProjectName = selected.localProjectName;
  const project = selected.fields.length > 1
    ? removeActiveProjectField(selected)
    : { ...createInitialState().project, localProjectId, localProjectName };
  state = { ...state, project:ensureProjectFields(project) };
  mobileTransactionSnapshot = null; persist(); loadActiveFieldOnMap();
}

async function renameArchivedProject(item,name){
  const saved=await renameArchivedProjectRecord({
    storage:globalThis.localStorage,item,name,backend:cloudBackend,operationId:newSessionId,
    buildSnapshot:(project,cloud)=>buildCloudSnapshot({environment:state.environment??APP_CONFIG.environment,project,cloud},field=>calculateFieldProject(field))
  });
  if(state.project.localProjectId===item.id){
    state={...state,project:{...state.project,localProjectName:saved.name},cloud:saved.cloud};
    cloudService?.selectProject(saved.cloud);projectSync?.adoptCloudState(saved.cloud);persist();syncProjectControls();
  }
  return saved;
}

async function deleteArchivedProject(item){
  await deleteArchivedProjectRecord({storage:globalThis.localStorage,item,backend:cloudBackend,operationId:newSessionId});
  if(state.project.localProjectId===item.id)newMobileProject();
  return true;
}

async function refreshOwnedArchive(){
  if(!cloudBackend||!accountAuthService)return {projects:readLocalProjects(globalThis.localStorage),imported:0,guest:true};
  const authState=await accountAuthService.refresh();
  if(authState.kind!=='user'||!authState.user?.id)return {projects:readLocalProjects(globalThis.localStorage),imported:0,guest:true};
  await projectSync?.flush();
  const currentId=state.project.localProjectId;
  const hydrated=await hydrateOwnedProjects({
    backend:cloudBackend,ownerUserId:authState.user.id,storage:globalThis.localStorage,
    currentProject:state.project,environment:state.environment??APP_CONFIG.environment
  });
  const currentCloud=hydrated.projects.find((item)=>item.id===currentId);
  if(currentCloud)loadMobileProject(currentCloud);
  else if(hydrated.activeProject)loadMobileProject(hydrated.activeProject);
  desktopLibraryUi?.render();
  return hydrated;
}

mobileUi = createMobileUI({
  auth:authBridge,
  getMap:()=>mapApi?.map,
  isMobile:isMobileMap, getField:()=>state.project, getFields:()=>state.project.fields ?? [], getMetrics:(field)=>calculateFieldProject(field ?? state.project),
  resizeMap:()=>requestAnimationFrame(()=>mapApi?.map?.resize?.()), focusAll:()=>mapApi?.focusAllFields?.(), focusField:()=>mapApi?.focusActiveField(),
  showSatellitePreview:()=>mapApi?.setBaseMap('satellite'), restoreBaseMap:()=>mapApi?.setBaseMap(state.map?.base ?? 'satellite'),
  stopTools:()=>mapApi?.stopTools(), finishEdit:()=>mapApi?.finishVertexEditing(), undoPoint:()=>mapApi?.undoDrawPoint(), finishDraw:()=>mapApi?.finishDraw(),
  beginNewField:beginMobileNewField, beginEdit:beginMobileEdit, cancelEdit:cancelMobileEdit,
  selectField:(id)=>{ state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap(); },
  removeField:removeMobileField,
  saveProject:saveMobileProject, listProjects:()=>readLocalProjects(globalThis.localStorage), loadProject:loadMobileProject, newProject:newMobileProject,
  renameProject:renameArchivedProject,deleteProject:deleteArchivedProject,
  refreshProjects:refreshOwnedArchive,
  finalAction:requestFinalAction
});

desktopLibraryUi=createDesktopLibraryUI({
  document,isDesktop:()=>!isMobileMap(),getFields:()=>state.project.fields??[],getProjects:()=>readLocalProjects(globalThis.localStorage),
  selectField:(id)=>{state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap();},
  loadProject:loadMobileProject,refreshProjects:refreshOwnedArchive,saveProject:()=>saveMobileProject(state.project.localProjectName),newProject:newMobileProject,
  renameProject:renameArchivedProject,deleteProject:deleteArchivedProject
});
desktopLibraryUi.mount();

bindNumberInput('#row-spacing', 'rowSpacingM'); bindNumberInput('#plant-spacing', 'plantSpacingM'); bindNumberInput('#post-spacing', 'postSpacingM');
$('#headland')?.addEventListener('input', (event) => {
  const normalized = normalizeHeadlandForMechanization(numberOrNull(event.target.value), state.project.mechanizedHarvest);
  if (state.project.mechanizedHarvest && normalized === 6 && Number(event.target.value) !== 6) event.target.value = '6';
  patchProject({ headlandWidthM:normalized });
});
$('#row-spacing')?.addEventListener('change', () => track('planting_spacing_changed', { rowSpacingM:state.project.rowSpacingM, plantSpacingM:state.project.plantSpacingM }));
$('#plant-spacing')?.addEventListener('change', () => track('planting_spacing_changed', { rowSpacingM:state.project.rowSpacingM, plantSpacingM:state.project.plantSpacingM }));
$('#headland')?.addEventListener('change', () => track('advanced_option_changed', { option:'headland', enabled:Boolean(state.project.headlandWidthM) }));
$('#post-spacing')?.addEventListener('change', () => track('advanced_option_changed', { option:'post_spacing', enabled:Boolean(state.project.postSpacingM) }));
$('#orientation')?.addEventListener('input', (event) => { const value = Number(event.target.value); $('#orientation-output').value = `${value}°`; patchProject({ orientationDeg:value, orientationLocked:true }); });
$('#orientation')?.addEventListener('change', () => track('orientation_changed', { degrees:state.project.orientationDeg }));
for (const button of document.querySelectorAll('[data-angle]')) { button.addEventListener('click', () => { const value = Number(button.dataset.angle); $('#orientation').value = value; $('#orientation-output').value = `${value}°`; patchProject({ orientationDeg:value, orientationLocked:true }); track('orientation_changed', { degrees:value }); }); }
$('#mechanized')?.addEventListener('input', (event) => {
  const enabled = event.target.checked;
  const headlandWidthM = normalizeHeadlandForMechanization(state.project.headlandWidthM, enabled);
  const headlandInput = $('#headland');
  if (headlandInput) { headlandInput.min = enabled ? '6' : '0'; headlandInput.value = headlandWidthM ?? ''; }
  patchProject({ mechanizedHarvest:enabled, headlandWidthM });
  track('advanced_option_changed', { option:'mechanized_harvest', enabled });
});
$('#project-context')?.addEventListener('change', (event) => { patchProject({ projectContextType: event.target.value }); track('advanced_option_changed', { option:'project_context', enabled:Boolean(event.target.value) }); });
$('#project-context-note')?.addEventListener('input', (event) => patchProject({ projectContextNote: event.target.value }));
$('#grape-variety')?.addEventListener('change', (event) => {
  const grapeVariety = event.target.value;
  const cloneSelection = isKnownCloneForVariety(grapeVariety, state.project.cloneSelection) ? state.project.cloneSelection : '';
  const rootstock = isKnownRootstockForSelection(grapeVariety, cloneSelection, state.project.rootstock) ? state.project.rootstock : '';
  patchMaterialProject({ grapeVariety, cloneSelection, rootstock });
  renderMaterialSelectors();
  track('plant_material_changed', { field:'grape_variety', defined:Boolean(grapeVariety) });
});
$('#clone-selection')?.addEventListener('change', (event) => {
  const cloneSelection = event.target.value;
  const rootstock = isKnownRootstockForSelection(state.project.grapeVariety, cloneSelection, state.project.rootstock) ? state.project.rootstock : '';
  patchMaterialProject({ cloneSelection, rootstock });
  renderMaterialSelectors();
  track('plant_material_changed', { field:'clone_selection', defined:Boolean(cloneSelection) });
});
$('#rootstock')?.addEventListener('change', (event) => {
  patchMaterialProject({ rootstock:event.target.value });
  renderMaterialSelectors();
  track('plant_material_changed', { field:'rootstock', defined:Boolean(event.target.value) });
});
$('#material-request-note')?.addEventListener('input', (event) => patchProject({ materialRequestNote:event.target.value }));

const consentBanner = $('#consent-banner');
if (!getConsentState(globalThis.localStorage)) consentBanner.hidden = false;
$('#consent-necessary')?.addEventListener('click', () => { setConsentState(globalThis.localStorage, 'necessary'); consentBanner.hidden = true; cloudService?.updateConsent('necessary').catch(console.warn); });
$('#consent-analytics')?.addEventListener('click', () => { setConsentState(globalThis.localStorage, 'analytics'); consentBanner.hidden = true; cloudService?.updateConsent('analytics').catch(console.warn); });

const contactDialog = $('#contact-dialog');

async function persistCloudSnapshot(snapshot) {
  state = mergeCloudSnapshot(state, snapshot);
  persist();
}

async function saveCloudProject(status = null) {
  if (!cloudService) return null;
  const snapshot = await cloudService.saveProject(state, latestMetrics ?? {}, { status });
  await persistCloudSnapshot(snapshot);
  return snapshot;
}

async function runFinalAction(action) {
  if(action==='save')summarySaveFeedback.saving();
  try{
  if (action === 'report') {
    if (cloudService) { await saveCloudProject('pdf_downloaded'); track('pdf_generated'); }
    globalThis.open('./report.html', '_blank', 'noopener');
    return;
  }
  if (action === 'quote') {
    if (!cloudService) {
      $('#contact-feedback').textContent = 'Progetto salvato sul dispositivo. Il preventivo online si attiverà appena il backend sarà collegato.';
      return;
    }
    const materialRequest = String(state.project.materialRequestNote ?? '').trim();
    const quoteMessage = materialRequest ? `Richiesta materiale da verificare: ${materialRequest}` : 'Richiesta dal Configuratore';
    const snapshot = await cloudService.requestQuote(state, latestMetrics ?? {}, quoteMessage);
    await persistCloudSnapshot(snapshot);
    $('#contact-feedback').textContent = 'Richiesta preventivo registrata.';
    return;
  }
  if (action === 'save') await projectSync?.saveRevision();
  if (cloudService) {
    await saveCloudProject('saved');
    $('#contact-feedback').textContent = 'Progetto salvato.';
  } else {
    $('#contact-feedback').textContent = 'Progetto salvato su questo dispositivo.';
  }
  if(action==='save')summarySaveFeedback.saved();
  }catch(error){if(action==='save')summarySaveFeedback.error();throw error;}
}

function requestFinalAction(action) {
  pendingFinalAction = action;
  if (!state.contact) {
    $('#contact-feedback').textContent = action === 'quote' ? 'Inserisci i dati obbligatori per richiedere un preventivo.' : 'Inserisci i dati obbligatori per completare questa azione.';
    contactDialog?.showModal();
    return;
  }
  runFinalAction(action).catch((error) => { console.error(error); $('#contact-feedback').textContent = 'Operazione non completata. La bozza locale resta salvata.'; });
}

$('#summary-save-project')?.addEventListener('click', () => requestFinalAction('save'));
$('#summary-open-report')?.addEventListener('click', () => requestFinalAction('report'));
$('#summary-request-quote')?.addEventListener('click', () => requestFinalAction('quote'));
$('#close-dialog')?.addEventListener('click', () => contactDialog?.close());
$('#contact-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const data = new FormData(event.currentTarget);
  const contact = { companyName: data.get('company'), firstName: data.get('firstName'), lastName: data.get('lastName'), phone: data.get('phone'), email: data.get('email'), privacyVersion:'v1', marketingConsent:data.get('marketing') === 'on' };
  const submittedAction=pendingFinalAction;
  state = { ...state, contact };
  persist();
  try {
    if (cloudService) {
      const snapshot = await cloudService.saveContactAndProject(state, latestMetrics ?? {}, contact);
      await persistCloudSnapshot(snapshot);
      $('#contact-feedback').textContent = 'Dati associati al progetto.';
    } else {
      $('#contact-feedback').textContent = 'Dati associati alla bozza su questo dispositivo.';
    }
    const action = submittedAction;
    pendingFinalAction = null;
    if (action && action !== 'save') await runFinalAction(action);
    if (action === 'save') {
      summarySaveFeedback.saving();
      await projectSync?.saveRevision();
      if (cloudService) $('#contact-feedback').textContent = 'Progetto salvato.';
      summarySaveFeedback.saved();
    }
    setTimeout(() => contactDialog?.close(), action === 'report' ? 250 : 900);
  } catch (error) {
    if(submittedAction==='save')summarySaveFeedback.error();
    console.error(error);
    $('#contact-feedback').textContent = 'Salvataggio cloud non riuscito. La bozza resta disponibile su questo dispositivo.';
  }
});

async function initializeCloud() {
  try {
    const client = await connectSupabase({ url:APP_CONFIG.supabaseUrl, publishableKey:APP_CONFIG.supabasePublishableKey });
    if (!client) return;
    const resumeRequest = parseResumeParams(globalThis.location.href);
    const resumeBaseUrl = `${globalThis.location.origin}${globalThis.location.pathname}`;
    const backend = createBackend(client);
    cloudBackend=backend;
    const authService=createAuthService({
      client,backend,storage:globalThis.localStorage,
      resetRedirectTo:`${globalThis.location.origin}${globalThis.location.pathname}`,
      beforeIdentityChange:() => projectSync?.suspend('identity_transfer'),
      afterIdentityChange:()=>globalThis.location.reload()
    });
    accountAuthService=authService;
    authBridge.attach(authService);
    const authState=await authService.refresh();
    await authService.resumePendingTransfer().catch(()=>{});
    if (authState.user && authState.kind === 'user') {
      const hydrated=await hydrateOwnedProjects({
        backend,
        ownerUserId:authState.user.id,
        storage:globalThis.localStorage,
        currentProject:state.project,
        environment:state.environment ?? APP_CONFIG.environment
      });
      if (hydrated.activeProject) loadMobileProject(hydrated.activeProject);
      mobileUi?.sync();
    }
    cloudService = createCloudService({
      backend,
      sessionId,
      environment:state.environment ?? APP_CONFIG.environment,
      consentState:getConsentState(globalThis.localStorage) ?? 'necessary',
      referrer:document.referrer,
      deviceClass:matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop',
      resumeBaseUrl,
      initialCloud:state.cloud ?? null,
      resumeRequest
    });
    const snapshot = await cloudService.initialize();
    if (snapshot.restoredState) {
      saveDraft(globalThis.localStorage, snapshot.restoredState);
      const cleanUrl = new URL(globalThis.location.href);
      cleanUrl.searchParams.delete('project');
      cleanUrl.searchParams.delete('token');
      globalThis.history.replaceState({}, '', cleanUrl);
      globalThis.location.reload();
      return;
    }
    await persistCloudSnapshot(snapshot);
    try {
      const queueAdapter = await createIndexedDbSyncAdapter(globalThis.indexedDB);
      projectSync = createProjectSync({
        backend,
        queue:createSyncQueue(queueAdapter),
        getState:() => state,
        getMetrics:(field) => calculateFieldProject(field ?? state.project),
        onSnapshot:(cloud) => { state=mergeCloudSnapshot(state,cloud); persist(); }
      });
      await projectSync.retryPending();
      if (state.project.geometry) projectSync.schedule('startup_reconcile');
    } catch (syncError) {
      console.warn('Cloud archive queue unavailable; local persistence remains active',syncError);
    }
    await cloudService.trackEvent('configurator_opened', { device:matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop' });
    setStatus('Backend TEST collegato. La bozza locale resta sempre disponibile.');
  } catch (error) {
    console.error(error);
    setStatus('Backend temporaneamente non disponibile. La bozza locale resta attiva.');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

renderFieldManager();
renderExclusions();
syncProjectControls();
calculateAndRender();
initializeCloud();
