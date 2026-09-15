import { createInitialState, mergeProjectState, applyGeometryWithSuggestedOrientation } from './state.js';
import { initMap } from './map.js';
import { calculateProject, calculateManualPlants } from './project-calculator.js';
import { loadDraft, saveDraft, newSessionId, getConsentState, setConsentState } from './storage.js';
import { APP_CONFIG } from './config.js';
import { connectSupabase, createBackend } from './backend.js';
import { createCloudService } from './cloud.js';
import { mergeCloudSnapshot } from './cloud-state.js';
import { parseResumeParams } from './resume.js';
import { adviseProject } from './project-advisor.js';

const $ = (selector) => document.querySelector(selector);
const stored = loadDraft(globalThis.localStorage);
let state = stored?.project ? { ...createInitialState(), ...stored, project: { ...createInitialState().project, ...stored.project } } : createInitialState();
if (!state.project.projectContextType) state = { ...state, project:{ ...state.project, projectContextType:'new_planting' } };
let mapApi = null;
let cloudService = null;
let latestMetrics = null;
let pendingFinalAction = null;
let perimeterEventSent = Boolean(state.project.geometry);
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
  const input = $('#manual-area');
  if (!input) return;
  const result = calculateManualPlants({
    areaM2:input.value,
    rowSpacingM:state.project.rowSpacingM,
    plantSpacingM:state.project.plantSpacingM
  });
  setText('#manual-theoretical', result.theoreticalPlants ? result.theoreticalPlants.toLocaleString('it-IT') : '—');
  setText('#manual-commercial', result.commercialPlants25 ? result.commercialPlants25.toLocaleString('it-IT') : '—');
}

function renderProjectAdvice(project) {
  const container = $('#project-advice');
  if (!container) return;
  const advice = adviseProject(project);
  container.replaceChildren();
  container.hidden = advice.length === 0;
  for (const item of advice) {
    const message = document.createElement('p');
    message.className = `project-advice-item ${item.level === 'attention' ? 'attention' : 'info'}`;
    message.textContent = item.message;
    container.append(message);
  }
}

function calculateAndRender() {
  const project = state.project;
  const result = calculateProject({ polygon: project.geometry, rowSpacingM: project.rowSpacingM, plantSpacingM: project.plantSpacingM, orientationDeg: project.orientationDeg, postSpacingM: project.postSpacingM, headlandWidthM: project.headlandWidthM });
  latestMetrics = result;
  const areaText = formatArea(result.areaM2);
  const perimeterText = formatMetres(result.perimeterM);
  const rowsText = result.rowCount ? result.rowCount.toLocaleString('it-IT') : '—';
  const linearText = formatMetres(result.rowLinearM);
  const plantsText = result.simulatedPlants ? result.simulatedPlants.toLocaleString('it-IT') : '—';
  setText('#summary-area', areaText);
  setText('#summary-perimeter', perimeterText);
  setText('#summary-rows', rowsText);
  setText('#summary-linear', linearText);
  setText('#summary-plants', plantsText);
  setText('#summary-commercial', result.commercialPlants25 ? `Quantità commerciale: ${result.commercialPlants25.toLocaleString('it-IT')} (multipli di 25)` : 'Quantità commerciale: —');
  renderManualAreaCalculation();
  mapApi?.setRows(result.rows);
  renderProjectAdvice(project);
  if (project.geometry && result.vertexCount) {
    const posts = result.totalPosts ? ` · ${result.totalPosts} pali stimati` : '';
    setStatus(`${result.vertexCount} vertici · ${formatArea(result.areaM2)} · ${result.rowCount} filari${posts}`);
  }
}

function syncOrientationControl() {
  const control = $('#orientation');
  const output = $('#orientation-output');
  if (control) control.value = state.project.orientationDeg ?? 0;
  if (output) output.value = `${state.project.orientationDeg ?? 0}°`;
}
function patchProject(patch) { state = mergeProjectState(state, patch); persist(); calculateAndRender(); }
function patchGeometry(geometry, patch = {}) {
  const project = applyGeometryWithSuggestedOrientation({ ...state.project, ...patch }, geometry);
  state = { ...state, project };
  syncOrientationControl();
  persist();
  calculateAndRender();
}
function bindNumberInput(selector, key) { $(selector)?.addEventListener('input', (event) => patchProject({ [key]: numberOrNull(event.target.value) })); }

try {
  mapApi = initMap({
    container: 'map',
    onGeometryChange: (geometry) => {
      const sourcePatch = state.project.sourceType === 'cadastral' ? { sourceType:'mixed' } : {};
      patchGeometry(geometry, sourcePatch);
      if (geometry && !perimeterEventSent) { perimeterEventSent = true; track('perimeter_completed', { vertices:Math.max(0, geometry.length - 1) }); }
    },
    onCadastralParcel: (parcel, selection) => {
      patchGeometry(selection?.coordinates ?? parcel.coordinates, {
        sourceType:'cadastral',
        cadastralRefs:selection?.refs ?? [{ id:parcel.id, reference:parcel.reference }]
      });
      track('cadastral_parcel_selected', { selected:true, parcelCount:selection?.refs?.length ?? 1 });
    },
    onStatus: setStatus,
    onDrawingState: ({ canClose }) => {
      const closeButton = $('#close-perimeter-button');
      if (closeButton) {
        closeButton.hidden = !canClose;
        closeButton.disabled = !canClose;
      }
    },
    onReady: calculateAndRender
  });
  if (state.project.geometry) mapApi.setGeometry(state.project.geometry);
  mapApi.setBaseMap(state.map?.base ?? 'satellite');
  if (state.map?.cadastralVisible) mapApi.setCadastralVisible(true);
} catch (error) { console.error(error); setStatus('Impossibile caricare la mappa. Controlla la connessione e riprova.'); }

$('#row-spacing').value = state.project.rowSpacingM ?? 2.5;
$('#plant-spacing').value = state.project.plantSpacingM ?? 0.9;
$('#orientation').value = state.project.orientationDeg ?? 0;
$('#orientation-output').value = `${state.project.orientationDeg ?? 0}°`;
$('#headland').value = state.project.headlandWidthM ?? '';
$('#post-spacing').value = state.project.postSpacingM ?? '';
$('#mechanized').checked = Boolean(state.project.mechanizedHarvest);
$('#project-context').value = state.project.projectContextType || 'new_planting';
$('#project-context-note').value = state.project.projectContextNote ?? '';
$('#grape-variety').value = state.project.grapeVariety ?? '';
$('#rootstock').value = state.project.rootstock ?? '';
$('#clone-selection').value = state.project.cloneSelection ?? '';

$('#draw-button')?.addEventListener('click', () => { patchProject({ sourceType:'manual', cadastralRefs:[] }); mapApi?.beginDraw(); });
$('#close-perimeter-button')?.addEventListener('click', () => mapApi?.finishDraw());
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
$('#cadastre-button')?.classList.toggle('active', Boolean(state.map?.cadastralVisible));
$('#cadastre-button')?.addEventListener('click', (event) => { const next = !state.map.cadastralVisible; state = { ...state, map: { ...state.map, cadastralVisible: next } }; persist(); event.currentTarget.classList.toggle('active', next); $('#select-cadastre-button').disabled = !next; mapApi?.setCadastralVisible(next); track('cadastre_toggled', { visible:next }); });
$('#select-cadastre-button').disabled = !state.map?.cadastralVisible;
$('#select-cadastre-button')?.addEventListener('click', () => mapApi?.beginCadastralSelect());
for (const button of document.querySelectorAll('[data-base]')) { button.classList.toggle('active', button.dataset.base === (state.map?.base ?? 'satellite')); button.addEventListener('click', () => { for (const sibling of document.querySelectorAll('[data-base]')) sibling.classList.remove('active'); button.classList.add('active'); const base = button.dataset.base; mapApi?.setBaseMap(base); state = { ...state, map: { ...state.map, base } }; persist(); track('base_map_changed', { base }); }); }
$('#rotate-left')?.addEventListener('click', () => mapApi?.rotateBy(-15));
$('#rotate-right')?.addEventListener('click', () => mapApi?.rotateBy(15));
$('#north-button')?.addEventListener('click', () => mapApi?.resetNorth());
const rotationDragHandle = $('#rotation-drag-handle');
let rotationDrag = null;
rotationDragHandle?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  rotationDragHandle.setPointerCapture?.(event.pointerId);
  rotationDrag = { x:event.clientX, bearing:mapApi?.map?.getBearing?.() ?? 0 };
  rotationDragHandle.classList.add('dragging');
});
rotationDragHandle?.addEventListener('pointermove', (event) => {
  if (!rotationDrag) return;
  event.preventDefault();
  const delta = (event.clientX - rotationDrag.x) * 0.55;
  mapApi?.map?.setBearing?.(rotationDrag.bearing + delta);
});
const stopRotationDrag = (event) => {
  if (!rotationDrag) return;
  rotationDragHandle.releasePointerCapture?.(event.pointerId);
  rotationDrag = null;
  rotationDragHandle.classList.remove('dragging');
};
rotationDragHandle?.addEventListener('pointerup', stopRotationDrag);
rotationDragHandle?.addEventListener('pointercancel', stopRotationDrag);

bindNumberInput('#row-spacing', 'rowSpacingM'); bindNumberInput('#plant-spacing', 'plantSpacingM'); bindNumberInput('#headland', 'headlandWidthM'); bindNumberInput('#post-spacing', 'postSpacingM');
$('#manual-area')?.addEventListener('input', renderManualAreaCalculation);
$('#manual-area')?.addEventListener('change', (event) => { const areaM2 = Number(event.target.value); if (Number.isFinite(areaM2) && areaM2 > 0) track('manual_area_calculated', { areaM2 }); });
$('#row-spacing')?.addEventListener('change', () => track('planting_spacing_changed', { rowSpacingM:state.project.rowSpacingM, plantSpacingM:state.project.plantSpacingM }));
$('#plant-spacing')?.addEventListener('change', () => track('planting_spacing_changed', { rowSpacingM:state.project.rowSpacingM, plantSpacingM:state.project.plantSpacingM }));
$('#headland')?.addEventListener('change', () => track('advanced_option_changed', { option:'headland', enabled:Boolean(state.project.headlandWidthM) }));
$('#post-spacing')?.addEventListener('change', () => track('advanced_option_changed', { option:'post_spacing', enabled:Boolean(state.project.postSpacingM) }));
$('#orientation')?.addEventListener('input', (event) => { const value = Number(event.target.value); $('#orientation-output').value = `${value}°`; patchProject({ orientationDeg:value, orientationLocked:true }); });
$('#orientation')?.addEventListener('change', () => track('orientation_changed', { degrees:state.project.orientationDeg }));
for (const button of document.querySelectorAll('[data-angle]')) { button.addEventListener('click', () => { const value = Number(button.dataset.angle); $('#orientation').value = value; $('#orientation-output').value = `${value}°`; patchProject({ orientationDeg:value, orientationLocked:true }); track('orientation_changed', { degrees:value }); }); }
$('#mechanized')?.addEventListener('change', (event) => { patchProject({ mechanizedHarvest: event.target.checked }); track('advanced_option_changed', { option:'mechanized_harvest', enabled:event.target.checked }); });
$('#project-context')?.addEventListener('change', (event) => { patchProject({ projectContextType: event.target.value }); track('advanced_option_changed', { option:'project_context', enabled:Boolean(event.target.value) }); });
$('#project-context-note')?.addEventListener('input', (event) => patchProject({ projectContextNote: event.target.value }));
$('#grape-variety')?.addEventListener('change', (event) => { patchProject({ grapeVariety: event.target.value }); track('plant_material_changed', { field:'grape_variety', defined:Boolean(event.target.value) }); });
$('#rootstock')?.addEventListener('change', (event) => { patchProject({ rootstock:event.target.value }); track('plant_material_changed', { field:'rootstock', defined:Boolean(event.target.value) }); });
$('#clone-selection')?.addEventListener('change', (event) => { patchProject({ cloneSelection:event.target.value }); track('plant_material_changed', { field:'clone_selection', defined:Boolean(event.target.value) }); });

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
    const snapshot = await cloudService.requestQuote(state, latestMetrics ?? {}, 'Richiesta dal Configuratore');
    await persistCloudSnapshot(snapshot);
    $('#contact-feedback').textContent = 'Richiesta preventivo registrata.';
    return;
  }
  if (cloudService) {
    await saveCloudProject('saved');
    $('#contact-feedback').textContent = 'Progetto salvato.';
  } else {
    $('#contact-feedback').textContent = 'Progetto salvato su questo dispositivo.';
  }
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
    const action = pendingFinalAction;
    pendingFinalAction = null;
    if (action && action !== 'save') await runFinalAction(action);
    if (action === 'save' && cloudService) $('#contact-feedback').textContent = 'Progetto salvato.';
    setTimeout(() => contactDialog?.close(), action === 'report' ? 250 : 900);
  } catch (error) {
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
    cloudService = createCloudService({
      backend:createBackend(client),
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
    await cloudService.trackEvent('configurator_opened', { device:matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop' });
    setStatus('Backend TEST collegato. La bozza viene sincronizzata quando salvi il progetto.');
  } catch (error) {
    console.error(error);
    setStatus('Backend temporaneamente non disponibile. La bozza locale resta attiva.');
  }
}

calculateAndRender();
initializeCloud();
