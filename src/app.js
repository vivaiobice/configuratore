import { createInitialState, mergeProjectState, applyGeometryWithSuggestedOrientation, normalizeMapState } from './state.js?v=55';
import { createMobileUI } from './mobile-ui.js?v=55';
import { createDesktopLibraryUI } from './desktop-library-ui.js?v=51';
import { createDesktopQuickCalculator, createSaveFeedback, createDesktopMapFieldAction, createCadastreToggle, createDesktopFieldSelectors, createDesktopMapSearchAction, setToolButtonLabel, syncVertexRemovalButton, renderCadastralParcelStatus } from './desktop-ux.js?v=53.2';
import { readLocalProjects, writeLocalProject } from './local-projects.js?v=37';
import { renameArchivedProject as renameArchivedProjectRecord, deleteArchivedProject as deleteArchivedProjectRecord, moveArchivedField as moveArchivedFieldRecord } from './project-archive-actions.js?v=51';
import { initMap } from './map.js?v=53.2';
import { calculateProject, calculateManualPlants } from './project-calculator.js?v=45';
import { loadDraft, saveDraft, newSessionId, getConsentState, setConsentState } from './storage.js';
import { APP_CONFIG } from './config.js';
import { connectSupabase, createBackend, projectPayloadToArchiveItem } from './backend.js?v=55';
import { createCloudService, hydrateOwnedProjects } from './cloud.js?v=51';
import { mergeCloudSnapshot } from './cloud-state.js';
import { createSyncQueue } from './sync-queue.js';
import { createIndexedDbSyncAdapter } from './indexeddb-sync-adapter.js';
import { createProjectSync } from './project-sync.js?v=34';
import { buildCloudSnapshot } from './cloud-project-model.js';
import { parseResumeParams } from './resume.js';
import { adviseProject } from './project-advisor.js';
import { ensureProjectFields, updateActiveFieldProject, updateProjectField, addProjectField, switchProjectField, removeActiveProjectField, renameActiveProjectField, autoNameActiveProjectField, activeField } from './fields.js?v=55';
import {createCadastralReferenceEditor} from './cadastral-reference-editor.js?v=54';
import {createSoilMapController} from './soil-map.js?v=55';
import {SOIL_SOURCE,soilProfileIsCurrent} from './soil.js?v=55';
import { createFieldLocationCoordinator, resolveFieldLocation } from './field-location.js?v=51';
import { normalizeHeadlandForMechanization } from './project-rules.js';
import { OTHER_MATERIAL_VALUE, listVarieties, listClonesForVariety, listRootstocksForSelection, isOtherMaterialSelection, isKnownCloneForVariety, isKnownRootstockForSelection } from './plant-catalog.js?v=45';
import { createAuthService } from './auth-service.js?v=49';
import { createAuthBridge } from './auth-bridge.js';
import { createProfileUI } from './profile-ui.js?v=49';
import { initializeTheme } from './theme.js?v=45';
import { REPORT_HANDOFF_KEY } from './report-handoff.js?v=45';
import { normalizeOrientationDeg,formatOrientationDeg } from './orientation.js?v=45';
import { normalizeRowCurvePoints } from './row-curves.js?v=45';
import { normalizePublicProjectCode, buildPublicProjectUrl } from './public-project-access.js?v=45';

const $ = (selector) => document.querySelector(selector);
const stored = loadDraft(globalThis.localStorage);
let state = stored?.project ? { ...createInitialState(), ...stored, project: ensureProjectFields({ ...createInitialState().project, ...stored.project }) } : createInitialState();
state = { ...state, map:normalizeMapState(state.map) };
if (!state.project.projectContextType) state = { ...state, project:{ ...state.project, projectContextType:'new_planting' } };
state = { ...state, project:updateActiveFieldProject(state.project, {
  projectContextType:state.project.projectContextType || 'new_planting',
  headlandWidthM:normalizeHeadlandForMechanization(state.project.headlandWidthM, state.project.mechanizedHarvest)
}) };
let mapApi = null;
let mobileUi = null;
let desktopLibraryUi = null;
let vertexEditingActive = false;
let vertexRemovalActive = false;
let cloudService = null;
let projectSync = null;
let cloudBackend = null;
let accountAuthService = null;
let latestMetrics = null;
let pendingFinalAction = null;
let mobileTransactionSnapshot = null;
let perimeterEventSent = Boolean(state.project.geometry);
let curveEditingActive=false;
let curveControlInteracting=false;
let cadastralOverlayActive=false;
const authBridge=createAuthBridge();
initializeTheme();
const profileUi=createProfileUI({authService:authBridge,document});
profileUi.mount();
const publicProjectDialog=$('#public-project-dialog');
function openPublicProjectDialog(){
  const feedback=$('#public-project-feedback');
  if(feedback)feedback.textContent='';
  if(publicProjectDialog?.showModal)publicProjectDialog.showModal();
  else publicProjectDialog?.setAttribute('open','');
  requestAnimationFrame(()=>$('#public-project-code')?.focus?.());
}
$('#public-project-trigger')?.addEventListener('click',openPublicProjectDialog);
$('#public-project-close')?.addEventListener('click',()=>publicProjectDialog?.close?.());
$('#public-project-form')?.addEventListener('submit',(event)=>{
  event.preventDefault();
  const code=normalizePublicProjectCode($('#public-project-code')?.value);
  if(!code){
    const feedback=$('#public-project-feedback');
    if(feedback)feedback.textContent='ID progetto non valido. Verifica il codice e riprova.';
    return;
  }
  globalThis.location.href=buildPublicProjectUrl(globalThis.location.href,code);
});
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
const cadastralParcelStatusEl = $('#cadastre-parcel-status');
function setStatus(message) { if (statusEl) statusEl.textContent = message; }
function renderCadastralState(next = {}) {
  const active=Boolean(next.visible);
  const button=$('#cadastre-button');
  const attribution=$('#cadastre-attribution');
  const notice=$('#cadastre-notice');
  if(button)button.setAttribute('aria-busy',String(Boolean(active&&next.loading)));
  if(attribution)attribution.hidden=!active;
  if(notice)notice.hidden=!active;
  if(!active)return;
  if(next.error)setStatus('Cartografia catastale momentaneamente non disponibile.');
  else if(next.reason==='zoom')setStatus('Avvicinati per visualizzare le particelle catastali.');
  else if(next.loading)setStatus('Caricamento della cartografia catastale…');
  else setStatus('Catasto attivo. Riferimento cartografico informativo.');
}
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
    rowCurvePoints:project?.rowCurvePoints,
    maintainRowEquidistance:project?.maintainRowEquidistance!==false,
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
  if(!curveControlInteracting)renderCurveControls();
  syncCurveEditor();
  if (project.geometry && result.vertexCount) {
    const posts = result.totalPosts ? ` · ${result.totalPosts} pali stimati` : '';
    const excluded = result.excludedAreaM2 ? ` · ${formatArea(result.excludedAreaM2)} esclusi` : '';
    setStatus(`${result.vertexCount} vertici · ${formatArea(result.areaM2)}${excluded} · ${result.rowCount} filari${posts}`);
  }
}

function syncOrientationControl() {
  const control = $('#orientation');
  const output = $('#orientation-output');
  const value=normalizeOrientationDeg(state.project.orientationDeg);
  if (control) control.value = String(value);
  if (output&&document.activeElement!==output) output.value = formatOrientationDeg(value);
}

function curveId(){return globalThis.crypto?.randomUUID?.()??`curve-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;}
function nextCurvePosition(points){
  const positions=[0,...points.map(point=>point.position),1].sort((a,b)=>a-b);let best=[0,1];
  for(let index=1;index<positions.length;index++)if(positions[index]-positions[index-1]>best[1]-best[0])best=[positions[index-1],positions[index]];
  return Math.round(((best[0]+best[1])/2)*100)/100;
}
function syncCurveEditor(){mapApi?.setRowCurveEditor?.({geometry:state.project.geometry,orientationDeg:state.project.orientationDeg,points:state.project.rowCurvePoints??[],active:curveEditingActive});}
function patchCurvePoints(points,{preserveControls=false}={}){curveControlInteracting=preserveControls;try{patchProject({rowCurvePoints:normalizeRowCurvePoints(points)});}finally{curveControlInteracting=false;}}
function renderCurveControls(){
  const list=$('#curve-points-list');if(!list)return;
  const points=normalizeRowCurvePoints(state.project.rowCurvePoints);
  const equidistance=$('#curve-equidistance');if(equidistance)equidistance.checked=state.project.maintainRowEquidistance!==false;
  list.replaceChildren();
  const add=$('#curve-add-button'),edit=$('#curve-edit-button'),reset=$('#curve-reset-button');
  if(add)add.disabled=!state.project.geometry||points.length>=8;
  if(edit){edit.disabled=!state.project.geometry||!points.length;edit.setAttribute('aria-pressed',String(curveEditingActive));edit.textContent=curveEditingActive?'Fine modifica':'Modifica sulla mappa';}
  if(reset)reset.disabled=!points.length;
  if(!points.length){const empty=document.createElement('p');empty.className='curve-points-empty';empty.textContent=state.project.geometry?'Filari rettilinei. Aggiungi un punto per curvarli.':'Disegna prima il perimetro del campo.';list.append(empty);return;}
  points.forEach((point,index)=>{
    const card=document.createElement('div');card.className='curve-point-card';
    const heading=document.createElement('div');heading.className='curve-point-heading';
    const title=document.createElement('strong');title.textContent=`Punto ${index+1}`;
    const remove=document.createElement('button');remove.type='button';remove.className='curve-point-remove';remove.textContent='Elimina';remove.addEventListener('click',()=>patchCurvePoints(points.filter(item=>item.id!==point.id)));
    heading.append(title,remove);
    const position=document.createElement('label');position.textContent='Posizione lungo il filare';const positionValue=document.createElement('output');positionValue.textContent=`${Math.round(point.position*100)}%`;const positionInput=document.createElement('input');positionInput.type='range';positionInput.min='.02';positionInput.max='.98';positionInput.step='.01';positionInput.value=String(point.position);positionInput.addEventListener('input',()=>{positionValue.textContent=`${Math.round(Number(positionInput.value)*100)}%`;patchCurvePoints(points.map(item=>item.id===point.id?{...item,position:Number(positionInput.value)}:item),{preserveControls:true});});positionInput.addEventListener('change',renderCurveControls);position.append(positionValue,positionInput);
    const offset=document.createElement('label');offset.textContent='Spostamento laterale';const offsetValue=document.createElement('output');offsetValue.textContent=`${point.offsetM.toLocaleString('it-IT',{maximumFractionDigits:1})} m`;const offsetInput=document.createElement('input');offsetInput.type='range';offsetInput.min='-100';offsetInput.max='100';offsetInput.step='.5';offsetInput.value=String(point.offsetM);offsetInput.addEventListener('input',()=>{offsetValue.textContent=`${Number(offsetInput.value).toLocaleString('it-IT',{maximumFractionDigits:1})} m`;patchCurvePoints(points.map(item=>item.id===point.id?{...item,offsetM:Number(offsetInput.value)}:item),{preserveControls:true});});offsetInput.addEventListener('change',renderCurveControls);offset.append(offsetValue,offsetInput);
    card.append(heading,position,offset);list.append(card);
  });
}
function patchProject(patch) { state = mergeProjectState(state, patch); summarySaveFeedback.dirty(); persist(); calculateAndRender(); projectSync?.schedule('project_changed'); }
function patchMaterialProject(patch) {
  state = mergeProjectState(state, patch);
  state = { ...state, project:autoNameActiveProjectField(state.project) };
  summarySaveFeedback.dirty();
  persist(); calculateAndRender(); renderFieldManager(); projectSync?.schedule('material_changed');
}
const fieldLocationCoordinator=createFieldLocationCoordinator({
  resolve:resolveFieldLocation,
  getField:id=>(ensureProjectFields(state.project).fields??[]).find(field=>String(field.id)===String(id)),
  apply:(location,field)=>{
    state={...state,project:updateProjectField(state.project,field.id??field.clientFieldId,location)};
    summarySaveFeedback.dirty();persist();calculateAndRender();projectSync?.schedule('field_location_changed');
  }
});
function patchGeometry(geometry, patch = {}) {
  const proposed = applyGeometryWithSuggestedOrientation({ ...state.project, ...patch }, geometry);
  state = { ...state, project:updateActiveFieldProject(state.project, { ...patch, geometry:proposed.geometry, orientationDeg:proposed.orientationDeg, orientationLocked:proposed.orientationLocked }) };
  summarySaveFeedback.dirty();
  syncOrientationControl();
  persist();
  calculateAndRender();
  renderSoilProfile();
  void fieldLocationCoordinator.refresh(activeField(state.project));
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
    onRowCurvePointsChange:(points)=>patchCurvePoints(points),
    onCadastralState:renderCadastralState,
    onCadastralIdentifyState:(next)=>renderCadastralParcelStatus(cadastralParcelStatusEl,next),
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
    onVertexRemovalState: ({ active }) => {
      vertexRemovalActive = Boolean(active);
      syncVertexRemovalButton($('#remove-vertex-button'),vertexRemovalActive);
    },
    onReady: calculateAndRender
  });
  if (state.project.geometry) mapApi.setGeometry(state.project.geometry);
  mapApi.setExclusions(state.project.exclusions ?? []);
  syncOtherFieldsOnMap();
  mapApi.setBaseMap(state.map?.base ?? 'satellite');
} catch (error) { console.error(error); setStatus('Impossibile caricare la mappa. Controlla la connessione e riprova.'); }

const soilMap=mapApi?.map?createSoilMapController({map:mapApi.map,onStatus:message=>{const status=$('#soil-status');if(status&&message)status.textContent=message;},onObservation:(result)=>{const status=$('#soil-status');if(status&&result?.description)status.textContent=`Punto selezionato: ${result.description} · dato indicativo`;}}):null;
function renderSoilProfile(){const box=$('#soil-profile');if(!box)return;box.replaceChildren();const profile=state.project.soil;if(!profile?.description)return;const title=document.createElement('strong');title.textContent=profile.description;const source=document.createElement('p');source.textContent=`${profile.source||SOIL_SOURCE} · ${profile.samples||1} punti · rilevazione ${profile.observedAt?new Date(profile.observedAt).toLocaleDateString('it-IT'):'non datata'} · indicativo · CC BY 4.0`;box.append(title,source);if(!soilProfileIsCurrent(profile,state.project.geometry)){const note=document.createElement('p');note.textContent='Perimetro modificato: aggiorna l’analisi del suolo.';box.append(note);}}
$('#soil-button')?.addEventListener('click',()=>{if(!soilMap)return;soilMap.setActive(!soilMap.isActive());$('#soil-button').setAttribute('aria-pressed',String(soilMap.isActive()));});
$('#soil-layer-select')?.addEventListener('change',event=>soilMap?.setLayer(event.target.value));
$('#soil-analyze')?.addEventListener('click',async()=>{const button=$('#soil-analyze');const id=state.project.activeFieldId;button.disabled=true;try{const soil=await soilMap?.analyze(state.project.geometry);if(soil&&id===state.project.activeFieldId){patchProject({soil});renderSoilProfile();}}finally{button.disabled=false;}});

$('#row-spacing').value = state.project.rowSpacingM ?? 2.5;
$('#plant-spacing').value = state.project.plantSpacingM ?? 0.9;
syncOrientationControl();
$('#headland').value = state.project.headlandWidthM ?? '';
$('#post-spacing').value = state.project.postSpacingM ?? 4.5;
$('#mechanized').checked = Boolean(state.project.mechanizedHarvest);
$('#headland').min = state.project.mechanizedHarvest ? '6' : '0';
$('#project-context').value = state.project.projectContextType || 'new_planting';
$('#project-context-note').value = state.project.projectContextNote ?? '';
$('#campaign-year').value = state.project.campaignYear ?? new Date().getFullYear();
$('#campaign-year-desktop').value = state.project.campaignYear ?? new Date().getFullYear();
$('#planting-status').value = state.project.plantingStatus === 'planted' ? 'planted' : 'planned';
$('#planting-status-desktop').value = state.project.plantingStatus === 'planted' ? 'planted' : 'planned';
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
  const available = new Set([placeholderValue, ...values, ...(includeOther ? [OTHER_MATERIAL_VALUE] : [])]);
  if (selected && !available.has(selected)) addSelectOption(select, selected, `${selected} (selezione precedente)`);
  if (includeOther) addSelectOption(select, OTHER_MATERIAL_VALUE, 'Altro');
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
  const heightSelect=$('#plant-height');if(heightSelect)heightSelect.value=String(state.project.plantHeightCm===60?60:40);
}

function syncProjectControls() {
  cadastralReferenceEditor.render(state.project.cadastralRefs,{municipality:state.project.municipality});
  renderSoilProfile();
  $('#row-spacing').value = state.project.rowSpacingM ?? 2.5;
  $('#plant-spacing').value = state.project.plantSpacingM ?? 0.9;
  syncOrientationControl();
  $('#headland').value = state.project.headlandWidthM ?? '';
  $('#post-spacing').value = state.project.postSpacingM ?? 4.5;
  $('#mechanized').checked = Boolean(state.project.mechanizedHarvest);
  $('#headland').min = state.project.mechanizedHarvest ? '6' : '0';
  $('#project-context').value = state.project.projectContextType || 'new_planting';
  $('#project-context-note').value = state.project.projectContextNote ?? '';
  $('#campaign-year').value = state.project.campaignYear ?? new Date().getFullYear();
  $('#campaign-year-desktop').value = state.project.campaignYear ?? new Date().getFullYear();
  $('#planting-status').value = state.project.plantingStatus === 'planted' ? 'planted' : 'planned';
  $('#planting-status-desktop').value = state.project.plantingStatus === 'planted' ? 'planted' : 'planned';
  const projectName=$('#project-name');
  if(projectName&&projectName.value!==(state.project.localProjectName??'Il mio impianto'))projectName.value=state.project.localProjectName??'Il mio impianto';
  renderMaterialSelectors();
}

const cadastralReferenceEditor=createCadastralReferenceEditor({document,container:$('#cadastral-reference-editor'),onChange:refs=>patchProject({cadastralRefs:refs})});
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
  curveEditingActive=false;
  mapApi?.finishRowCurveEditing?.();
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
function updatePlantingStatus(event){
  patchProject({plantingStatus:event.target.value});
}
$('#planting-status')?.addEventListener('change',updatePlantingStatus);
$('#planting-status-desktop')?.addEventListener('change',updatePlantingStatus);
$('#project-name')?.addEventListener('input',(event)=>patchProject({localProjectName:event.target.value}));
$('#add-field-button')?.addEventListener('click', () => { state = { ...state, project:addProjectField(state.project) }; summarySaveFeedback.dirty();persist(); loadActiveFieldOnMap(); });
$('#remove-field-button')?.addEventListener('click', () => { if ((state.project.fields?.length ?? 1) <= 1) return; if (!globalThis.confirm?.('Rimuovere il campo attivo dal progetto?')) return; state = { ...state, project:removeActiveProjectField(state.project) };summarySaveFeedback.dirty(); persist(); loadActiveFieldOnMap(); });

function isMobileMap() { return Boolean(globalThis.matchMedia?.('(max-width: 800px), (max-width: 1100px) and (pointer: coarse)')?.matches); }
function startDrawingField() { patchProject({ sourceType:'manual' }); mapApi?.beginDraw(); }
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
$('#remove-vertex-button')?.addEventListener('click', () => vertexRemovalActive ? mapApi?.finishVertexRemoval() : mapApi?.beginVertexRemoval());
$('#clear-field-button')?.addEventListener('click', () => { if (!state.project.geometry && !(state.project.exclusions?.length)) return; fieldLocationCoordinator.invalidate();mapApi?.clearGeometry(); patchProject({ geometry:null, exclusions:[], sourceType:'manual' }); renderExclusions(); setStatus('Campo cancellato. Puoi disegnare un nuovo perimetro.'); });
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
const mapSearchInput=$('#map-search-input');
const mapSearchSuggestions=$('#map-search-suggestions');
const mapSearchAction=createDesktopMapSearchAction({document});mapSearchAction.mount();
const searchSurfaces=[
  {input:searchInput,suggestions:searchSuggestions,form:$('#search-form')},
  {input:mapSearchInput,suggestions:mapSearchSuggestions,form:$('#map-search-form')}
].filter(surface=>surface.input&&surface.suggestions&&surface.form);
let suggestionTimer = null;
let suggestionRequest = 0;
function hideSuggestions() { for(const {suggestions} of searchSurfaces){suggestions.hidden=true;suggestions.replaceChildren();} }
function syncSearchInputs(value,source=null){for(const {input} of searchSurfaces)if(input!==source)input.value=value;}
function storeSearchResult(result) {
  if (!result) return;
  fieldLocationCoordinator.invalidate();
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
function renderSuggestions(items,input,suggestions) {
  if (!suggestions) return;
  suggestions.replaceChildren();
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-suggestion';
    button.setAttribute('role', 'option');
    button.textContent = item.label;
    button.addEventListener('click', async () => {
      input.value=item.label;syncSearchInputs(item.label,input);
      hideSuggestions();
      try {
        const result=await mapApi?.searchSuggestion?.(item)??await mapApi?.search(item.label);
        storeSearchResult(result);
      } catch (error) {
        console.error(error);
        setStatus('Ricerca momentaneamente non disponibile. Puoi navigare manualmente sulla mappa.');
      }
    });
    suggestions.append(button);
  }
  suggestions.hidden = items.length === 0;
}
for(const surface of searchSurfaces){
  surface.input.addEventListener('input',()=>{
    const query=surface.input.value.trim();syncSearchInputs(surface.input.value,surface.input);clearTimeout(suggestionTimer);
    if(query.length<3){hideSuggestions();return;}
    const requestId=++suggestionRequest;
    suggestionTimer=setTimeout(async()=>{try{const items=await mapApi?.suggest(query)??[];if(requestId===suggestionRequest&&surface.input.value.trim()===query)renderSuggestions(items,surface.input,surface.suggestions);}catch{if(requestId===suggestionRequest)hideSuggestions();}},280);
  });
  surface.form.addEventListener('submit',async event=>{event.preventDefault();hideSuggestions();await runSearch(surface.input.value??'');});
}
document.addEventListener('click',event=>{if(!event.target.closest('.search-shell,.map-search-control')){hideSuggestions();mapSearchAction.close();}});
const cadastreToggle=createCadastreToggle({
  document,isActive:()=>cadastralOverlayActive,
  setActive:(next)=>{cadastralOverlayActive=Boolean(next);mapApi?.setCadastralVisible(cadastralOverlayActive);track('cadastre_toggled',{visible:cadastralOverlayActive});},
  setOpacity:(opacity)=>mapApi?.setCadastralOpacity(opacity)
});
cadastreToggle.mount();
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

async function refreshOwnedArchive({flush=true}={}){
  if(!cloudBackend||!accountAuthService)return {projects:readLocalProjects(globalThis.localStorage),imported:0,guest:true};
  const authState=await accountAuthService.refresh();
  if(authState.kind!=='user'||!authState.user?.id)return {projects:readLocalProjects(globalThis.localStorage),imported:0,guest:true};
  if(flush)await projectSync?.flush();
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

async function moveArchivedField(sourceItem,targetItem,field){
  return moveArchivedFieldRecord({
    sourceItem,targetItem,field,backend:cloudBackend,operationId:newSessionId,
    refreshProjects:()=>refreshOwnedArchive({flush:false})
  });
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
  openPublicProject:openPublicProjectDialog,
  finalAction:requestFinalAction
});

desktopLibraryUi=createDesktopLibraryUI({
  document,isDesktop:()=>!isMobileMap(),getFields:()=>state.project.fields??[],getProjects:()=>readLocalProjects(globalThis.localStorage),
  getFieldMetrics:(field)=>calculateFieldProject(field),
  selectField:(id)=>{state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap();},
  renameField:(field,name)=>{state={...state,project:renameActiveProjectField(switchProjectField(state.project,field.id),name)};persist();loadActiveFieldOnMap();},
  deleteField:(field)=>removeMobileField(field.id),
  loadProject:loadMobileProject,refreshProjects:refreshOwnedArchive,saveProject:()=>saveMobileProject(state.project.localProjectName),newProject:newMobileProject,
  renameProject:renameArchivedProject,deleteProject:deleteArchivedProject,moveField:moveArchivedField
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
function applyOrientationValue(raw,{trackChange=false}={}){
  const value=normalizeOrientationDeg(raw,state.project.orientationDeg);
  patchProject({orientationDeg:value,orientationLocked:true});syncOrientationControl();
  if(trackChange)track('orientation_changed',{degrees:value});
}
$('#orientation')?.addEventListener('input',(event)=>applyOrientationValue(event.target.value));
$('#orientation')?.addEventListener('change', () => track('orientation_changed', { degrees:state.project.orientationDeg }));
$('#orientation-output')?.addEventListener('input',(event)=>{if(event.target.value.trim()!=='')applyOrientationValue(event.target.value);});
$('#orientation-output')?.addEventListener('change',(event)=>applyOrientationValue(event.target.value,{trackChange:true}));
for (const button of document.querySelectorAll('[data-angle]')) button.addEventListener('click',()=>applyOrientationValue(button.dataset.angle,{trackChange:true}));
$('#curve-add-button')?.addEventListener('click',()=>{
  if(!state.project.geometry)return;
  const points=normalizeRowCurvePoints(state.project.rowCurvePoints);if(points.length>=8)return;
  curveEditingActive=true;patchCurvePoints([...points,{id:curveId(),position:nextCurvePosition(points),offsetM:0}]);
});
$('#curve-edit-button')?.addEventListener('click',()=>{if(!state.project.geometry||!state.project.rowCurvePoints?.length)return;curveEditingActive=!curveEditingActive;renderCurveControls();syncCurveEditor();});
$('#curve-reset-button')?.addEventListener('click',()=>{curveEditingActive=false;mapApi?.finishRowCurveEditing?.();patchCurvePoints([]);});
$('#curve-equidistance')?.addEventListener('change',event=>patchProject({maintainRowEquidistance:event.target.checked}));
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
$('#plant-height')?.addEventListener('change',event=>patchProject({plantHeightCm:event.target.value==='60'?60:40}));

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
    openReportPopup();
    return;
  }
  if (action === 'quote') {
    if (!cloudService) {
      $('#contact-feedback').textContent = 'Progetto salvato sul dispositivo. Il preventivo online si attiverà appena il backend sarà collegato.';
      return;
    }
    const materialRequest = String(state.project.materialRequestNote ?? '').trim();
    const heights=(state.project.fields??[]).filter(field=>Array.isArray(field.geometry)&&field.geometry.length>=4).map(field=>`${field.label}: ${field.plantHeightCm===60?60:40} cm`).join('; ');
    const quoteMessage = `${materialRequest ? `Richiesta materiale da verificare: ${materialRequest}. ` : ''}Altezza barbatelle: ${heights||'40 cm'}.`;
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

function openReportPopup() {
  persist();
  const requestId=globalThis.crypto.randomUUID();
  globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,status:'opened'}));
  const popup=globalThis.open(`./report.html?handoff=${requestId}`, '_blank');
  if(!popup){setStatus('Il browser ha bloccato la finestra del documento. Consenti i popup per questo sito e riprova.');return;}
  const onReportRequest=async(event)=>{
    if(event.key!==REPORT_HANDOFF_KEY)return;
    let request;
    try{request=JSON.parse(event.newValue);}catch{return;}
    if(request?.requestId!==requestId||request.status!=='requested')return;
    globalThis.removeEventListener('storage',onReportRequest);
    globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,status:'syncing'}));
    try{
      if(!projectSync)throw new Error('Sincronizzazione cloud non disponibile. Riprova quando il backend è collegato.');
      const revision=await projectSync.saveRevision({reason:'report_issue'});
      if(revision.state!=='synced'||!revision.projectId||!(Number(revision.latestRevisionNumber)>0))throw new Error(revision.state==='conflict'?'Conflitto di versione. Aggiorna il progetto e riprova.':'Sincronizzazione non riuscita. La bozza resta su questo dispositivo.');
      globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,status:'ready',projectId:revision.projectId,revisionNumber:revision.latestRevisionNumber}));
    }catch(error){globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,status:'error',message:error.message}));}
  };
  globalThis.addEventListener('storage',onReportRequest);
}

function requestFinalAction(action) {
  if(action==='report'){openReportPopup();return;}
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
    const requestedProjectId=new URL(globalThis.location.href).searchParams.get('openProject');
    if(requestedProjectId && authState.kind === 'user') {
      try {
        const authorizedProject=await backend.loadEditableProject(requestedProjectId);
        loadMobileProject(projectPayloadToArchiveItem(authorizedProject));
        const cleanUrl=new URL(globalThis.location.href);
        cleanUrl.searchParams.delete('openProject');
        globalThis.history.replaceState({},'',cleanUrl);
      } catch(error) {
        console.warn('Apertura progetto condiviso non autorizzata o non disponibile',error);
        setStatus('Non è possibile aprire questo progetto: verifica di essere il proprietario o un Admin.');
      }
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
