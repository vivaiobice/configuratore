import {createTerrainController,checkpointTerrainProposal,terrainPortionEditorState} from './terrain-controller.js?v=1.3.1-prova.1';
import {terrainUsesCertifiedQuantities} from './terrain-report-summary.js?v=1.3.1-prova.1';
import {createCadastralCoordinator} from './cadastral-auto.js?v=1.3.1-prova.1';
import {createUserProjectsView,loadUserProjectsData} from './user-projects-view.js?v=1.3.1-prova.1';
import { createInitialState, mergeProjectState, applyGeometryWithSuggestedOrientation, normalizeMapState } from './state.js?v=1.3.1-prova.1';
import { createMobileUI } from './mobile-ui.js?v=1.3.1-prova.1';
import { createDesktopLibraryUI } from './desktop-library-ui.js?v=1.3.1-prova.1&counts=1';
import {createQuoteUI} from './quote-ui.js?v=55.6.6';
import { createDesktopQuickCalculator, createSaveFeedback, createDesktopMapFieldAction, createCadastreToggle, createDesktopFieldSelectors, createDesktopMapSearchAction, setToolButtonLabel, syncVertexRemovalButton, renderCadastralParcelStatus } from './desktop-ux.js?v=1.3.1-prova.1';
import { readLocalProjects, writeLocalProject } from './local-projects.js?v=1.3.1-prova.1';
import { renameArchivedProject as renameArchivedProjectRecord, deleteArchivedProject as deleteArchivedProjectRecord, moveArchivedField as moveArchivedFieldRecord } from './project-archive-actions.js?v=1.3.1-prova.1';
import { initMap } from './map.js?v=1.3.1-prova.1';
import { calculateProject, calculateManualPlants } from './project-calculator.js?v=1.3.1-prova.1';
import { loadDraftRecord, saveDraft, newSessionId, getOwnerSessionId, getConsentState, setConsentState } from './storage.js?v=1.3.1-prova.1';
import {checkpointBeforeSwitch,restoreWorkspaceForOwner,restoreVersionConflict} from './tool-switch.js?v=1.3.1-prova.1';
import {resolveIntegrationConfig,buildCountsUrl} from './counts-routes.js?v=counts1';
import {createFieldDirectory,fieldRouteParams,writePendingFieldContext,clearPendingFieldContext} from './field-directory.js?v=counts1';
import {mountToolMenu} from './tool-menu.js?v=1.2.4';
import {createDesktopCountsGateway} from './counts-desktop-gateway.js?v=counts2';
import {setLocalOwnerScope} from './local-owner-scope.js';
import { APP_CONFIG } from './config.js?v=1.3.1-prova.1';
import {COUNTS_CONFIG} from '../conteggi/config.js?v=1.3.1-prova.1';
import {rememberCountsOwner} from './counts-offline-owner.js';
import {installIdentityGuard,bindBackendToIdentity} from './identity-guard.js?v=1.2.4';
import {mountWorkspaceRestoreGate,workspaceContextMatches} from './workspace-restore-gate.js?v=1.2.4';
import { connectSupabase, createBackend, projectPayloadToArchiveItem } from './backend.js?v=1.3.1-prova.1';
import { requireSecureConnection } from './secure-context.js';
import { projectContactFromProfile, missingProjectProfileFields, assertSavedRevision } from './project-profile.js';
import { createCloudService, hydrateOwnedProjects } from './cloud.js?v=1.3.1-prova.1';
import { mergeCloudSnapshot } from './cloud-state.js';
import { createSyncQueue } from './sync-queue.js';
import { createIndexedDbSyncAdapter } from './indexeddb-sync-adapter.js';
import { createProjectSync } from './project-sync.js?v=1.3.1-prova.1';
import {ensureQuoteRevision} from './quote-sync.js?v=1.3.1-prova.1';
import { buildCloudSnapshot } from './cloud-project-model.js?v=1.3.1-prova.1';
import { parseResumeParams } from './resume.js';
import { adviseProject } from './project-advisor.js';
import { ensureProjectFields, updateActiveFieldProject, updateProjectField, addProjectField, duplicateProjectField, switchProjectField, removeActiveProjectField, renameActiveProjectField, autoNameActiveProjectField, activeField } from './fields.js?v=1.3.1-prova.1';
import {createCadastralReferenceEditor} from './cadastral-reference-editor.js?v=1.0.2';
import {createSoilMapController} from './soil-map.js?v=55.4';
import {SOIL_LAYER_LABELS,soilProfileIsCurrent} from './soil.js?v=55.3';
import {renderSoilCard} from './soil-card.js?v=55.1';
import {createViewMode} from './view-mode.js?v=55.4';
import {resolveEditableProjectCode} from './project-code-loader.js?v=55.2';
import {prepareReportContext,REPORT_CONTEXT_KEY} from './report-context.js?v=1.3.1-prova.1';
import {serializeTerrainSnapshot} from './terrain-serialization.js?v=1.3.1-prova.1';
import {createReportProjectSource,hasReportProjectChanges} from './report-project-source.js?v=1.3.1-prova.1';
import {installPenTapFallback} from './pen-tap.js?v=55.5';
import { createFieldLocationCoordinator, resolveFieldLocation } from './field-location.js?v=51';
import { normalizeHeadlandForMechanization } from './project-rules.js';
import { OTHER_MATERIAL_VALUE, listVarieties, listClonesForVariety, listRootstocksForSelection, isOtherMaterialSelection, isKnownCloneForVariety, isKnownRootstockForSelection } from './plant-catalog.js?v=45';
import { createAuthService } from './auth-service.js?v=1.2.4';
import { createAuthBridge } from './auth-bridge.js?v=1.2.4';
import { createProfileUI } from './profile-ui.js?v=1.2.4';
import { initializeTheme } from './theme.js?v=45';
import { REPORT_HANDOFF_KEY } from './report-handoff.js?v=45';
import { normalizeOrientationDeg,formatOrientationDeg } from './orientation.js?v=45';
import { resolveRowCurvePoints,getRowCurveSegments } from './row-curves.js?v=1.3.1-prova.1';
import {curveControlRange,nextCurveControlPoint} from './row-curve-control-state.js';
import {rowPortionEditorState,rowPortionDesignPatch,nextPortionCurvePoint,renderRowPortionPicker} from './row-portion-editor.js?v=1.3.1-prova.1';
import { normalizePublicProjectCode, buildPublicProjectUrl } from './public-project-access.js?v=45';

const $ = (selector) => document.querySelector(selector);
const storedRecord = loadDraftRecord(globalThis.localStorage);
const stored = storedRecord?.state;
let state = stored?.project ? { ...createInitialState(), ...stored, project: ensureProjectFields({ ...createInitialState().project, ...stored.project }) } : createInitialState();
state = { ...state, map:normalizeMapState(state.map) };
if (!state.project.projectContextType) state = { ...state, project:{ ...state.project, projectContextType:'new_planting' } };
state = { ...state, project:updateActiveFieldProject(state.project, {
  projectContextType:state.project.projectContextType || 'new_planting',
  headlandWidthM:normalizeHeadlandForMechanization(state.project.headlandWidthM, state.project.mechanizedHarvest)
}) };
let mapApi = null;
let terrainController=null;
let overviewMode=false;
const viewMode=createViewMode();
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
let pendingWorkspace=storedRecord?.workspace??null;
let restoringWorkspace=false;
let switchingTool=false;
let coordinatedIdentityChange=false,identitySaveFailed=false,identityFrozen=false;
let fieldDirectory=null,countsGateway=null;
let countsConfig;
try{countsConfig=resolveIntegrationConfig(globalThis.location.href,{enabled:APP_CONFIG.countsEnabled});}
catch{console.warn('Conteggi non configurato su questa origine');countsConfig=resolveIntegrationConfig(globalThis.location.href,{enabled:false});}
let perimeterEventSent = Boolean(state.project.geometry);
let curveEditingActive=false;
let curveControlInteracting=false;
let activeRowPortionId=null;
let rowPortionFieldId=null;
let cadastralOverlayActive=false;
const authBridge=createAuthBridge();
let adminReadClient=null;
const userProjectsView=createUserProjectsView({document,auth:authBridge,loadData:()=>loadUserProjectsData(adminReadClient)});
authBridge.subscribe(()=>desktopLibraryUi?.render());
initializeTheme();
const profileUi=createProfileUI({authService:authBridge,document,countsEnabled:countsConfig.enabled,onCounts:()=>switchToCounts('resume')});
profileUi.mount();
const publicProjectDialog=$('#public-project-dialog');
function openPublicProjectDialog(){
  const feedback=$('#public-project-feedback');
  if(feedback)feedback.textContent='';
  $('#public-project-readonly').hidden=true;
  if(publicProjectDialog?.showModal)publicProjectDialog.showModal();
  else publicProjectDialog?.setAttribute('open','');
  requestAnimationFrame(()=>$('#public-project-code')?.focus?.());
}
$('#public-project-trigger')?.addEventListener('click',openPublicProjectDialog);
$('#public-project-close')?.addEventListener('click',()=>publicProjectDialog?.close?.());
$('#public-project-form')?.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const code=normalizePublicProjectCode($('#public-project-code')?.value);
  const feedback=$('#public-project-feedback'),readonly=$('#public-project-readonly'),submit=event.currentTarget.querySelector('[type="submit"]');
  readonly.hidden=true;
  if(!code){
    if(feedback)feedback.textContent='ID progetto non valido. Verifica il codice e riprova.';
    return;
  }
  submit.disabled=true;feedback.textContent='Ricerca del progetto in corso…';
  try{
    const project=await resolveEditableProjectCode({code,backend:cloudBackend});
    const item=projectPayloadToArchiveItem(project);
    writeLocalProject(globalThis.localStorage,item.project,item.name,item.cloud);
    loadMobileProject(item);mobileUi?.navigate?.('projects');desktopLibraryUi?.render?.();
    publicProjectDialog?.close?.();setStatus(`Progetto ${item.name} caricato.`);
  }catch(error){
    feedback.textContent=error.message||'Caricamento del progetto non riuscito.';
    if(/non hai accesso/.test(error.message)){readonly.href=buildPublicProjectUrl(globalThis.location.href,code);readonly.hidden=false;}
  }finally{submit.disabled=false;}
});
const desktopQuickCalculator=createDesktopQuickCalculator({document,calculate:calculateManualPlants,onCalculate:(areaM2)=>track('manual_area_calculated',{areaM2})});
desktopQuickCalculator.mount();
const summarySaveFeedback=createSaveFeedback($('#summary-save-project'));
const statusEl = $('#map-status');
const cadastralParcelStatusEl = $('#cadastre-parcel-status');
function setStatus(message) { if (statusEl) statusEl.textContent = message; }
mountWorkspaceRestoreGate({document,isPending:()=>restoringWorkspace&&Boolean(pendingWorkspace),onBlocked:()=>setStatus('Ripristino della bozza in corso. Puoi aprire Conteggi dal logo; attendi prima di modificare il campo.')});
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
function captureWorkspace(){
  const ownerId=authBridge.getState()?.user?.id;
  if(!ownerId||!state.project.localProjectId)return null;
  return {version:1,ownerId,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
    cloudVersion:Number(state.cloud?.version)||0,map:mapApi?.capturePendingEdit?.()??null,
    navigation:{mobile:mobileUi?.captureSession?.()??null,fullscreen:Boolean($('.map-wrap')?.classList.contains('fullscreen-map')),
      advancedOpen:Boolean($('.advanced')?.open),panelScroll:$('.panel-scroll')?.scrollTop??0,
      transactionSnapshot:mobileTransactionSnapshot},savedAt:new Date().toISOString()};
}
function persist() {
  if(identityFrozen)return;
  if(!state.project.localProjectId)state={...state,project:{...state.project,localProjectId:newSessionId()}};
  const workspace=restoringWorkspace||!authBridge.getState()?.user?.id?pendingWorkspace:captureWorkspace();
  state=saveDraft(globalThis.localStorage,state,workspace)||state;
}
async function switchToCounts(view,params={}){
  if(switchingTool)return;
  switchingTool=true;
  try{
    const url=buildCountsUrl(countsConfig,view,params);
    if(view!=='new'||params.fieldId)clearPendingFieldContext(globalThis.sessionStorage);
    const ownerId=authBridge.getState()?.user?.id;
    if(!state.project.localProjectId)state={...state,project:{...state.project,localProjectId:newSessionId()}};
    await checkpointBeforeSwitch({storage:globalThis.localStorage,state,ownerId,capture:captureWorkspace,pendingWorkspace:restoringWorkspace?pendingWorkspace:null,
      enqueue:()=>projectSync?.enqueueForLater?.(),navigate:()=>globalThis.location.assign(url)});
  }catch(error){setStatus(error.message||'Salvataggio non riuscito. Resta nel configuratore e riprova.');throw error;}
  finally{switchingTool=false;}
}
async function openCountsForField(fieldId){
  const field=state.project.fields?.find(item=>item.id===fieldId);
  if(!field)throw new Error('Campo non disponibile nel progetto corrente.');
  const sameProject=state.cloud?.clientProjectId===state.project.localProjectId;
  const params=fieldRouteParams({projectId:sameProject?state.cloud?.projectId:null,fieldId});
  const verified=params.projectId?await fieldDirectory?.resolveField(params.projectId,params.fieldId):null;
  if(verified)clearPendingFieldContext(globalThis.sessionStorage);
  if(!verified){
    try{writePendingFieldContext(globalThis.sessionStorage,{ownerId:authBridge.getState()?.user?.id,environment:APP_CONFIG.environment,
      localProjectId:state.project.localProjectId,localFieldId:fieldId,projectLabel:state.project.localProjectName,
      fieldLabel:field.label,varietyLabel:field.grapeVariety});}
    catch{setStatus('Il conteggio si aprirà senza associazione al campo; potrai collegarlo in seguito.');}
  }
  await switchToCounts('new',verified?params:{});
}
async function loadCountsForField(fieldId){
  const ownerId=authBridge.getState()?.user?.id;
  const sameProject=state.cloud?.clientProjectId===state.project.localProjectId;
  const params=fieldRouteParams({projectId:sameProject?state.cloud?.projectId:null,fieldId});
  if(!countsGateway||!fieldDirectory||!params.projectId||!await fieldDirectory.resolveField(params.projectId,fieldId))return null;
  const result=await countsGateway.getFieldSummary(params.projectId,fieldId);
  return ownerId===authBridge.getState()?.user?.id?result:null;
}
function restorePendingWorkspace(ownerId){
  const workspace=restoreWorkspaceForOwner({workspace:pendingWorkspace,state},ownerId,state.project.localProjectId);
  if(!workspace){pendingWorkspace=null;restoringWorkspace=false;return false;}
  restoringWorkspace=true;
  try{
    mobileTransactionSnapshot=workspace.navigation?.transactionSnapshot??null;
    curveEditingActive=Boolean(workspace.map?.curveEditing);syncCurveEditor();renderCurveControls();
    if($('.advanced'))$('.advanced').open=Boolean(workspace.navigation?.advancedOpen);
    mobileUi?.restoreSession?.(workspace.navigation?.mobile);
    if(mapWrap&&Boolean(workspace.navigation?.fullscreen)!==mapWrap.classList.contains('fullscreen-map'))setMapFullscreen(Boolean(workspace.navigation?.fullscreen));
    const restoreMap=()=>{
      if(!workspaceContextMatches(workspace,{ownerId:authBridge.getState()?.user?.id,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId},pendingWorkspace))return;
      if(!workspace.map||mapApi?.restorePendingEdit(workspace.map)){pendingWorkspace=null;restoringWorkspace=false;persist();}
      else setStatus('La bozza locale è conservata, ma il ripristino dell’editor richiede una verifica.');
    };
    if(!workspace.map)restoreMap();
    else mapApi?.whenEditorReady(restoreMap);
    if(Number.isFinite(workspace.navigation?.panelScroll))$('.panel-scroll').scrollTop=workspace.navigation.panelScroll;
    return true;
  }catch(error){setStatus('La bozza locale è conservata. Ripristino non completato: '+error.message);return false;}
}
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
    terrain:project?.terrain,
    exclusions:project?.exclusions ?? [],
    rowSpacingM:project?.rowSpacingM,
    plantSpacingM:project?.plantSpacingM,
    orientationDeg:project?.orientationDeg,
    rowCurvePoints:project?.rowCurvePoints,
    rowPortions:project?.rowPortions,
    maintainRowEquidistance:project?.maintainRowEquidistance!==false,
    postSpacingM:project?.postSpacingM,
    headlandWidthM:project?.headlandWidthM
  });
}

function calculateAndRender() {
  const project = state.project;
  const result = calculateFieldProject(project);
  latestMetrics = result;
  if(rowPortionFieldId!==project.activeFieldId){activeRowPortionId=null;rowPortionFieldId=project.activeFieldId;curveEditingActive=false;}
  const portionState=terrainPortionEditorState(project,activeRowPortionId,result);
  const reconciledId=portionState.active?.id??null;
  if(activeRowPortionId!==reconciledId)curveEditingActive=false;
  activeRowPortionId=reconciledId;
  renderRowPortionPicker($('#row-portion-picker'),overviewMode?{enabled:false}:portionState,selectRowPortion);
  mapApi?.setRowPortions?.({portions:overviewMode||!portionState.enabled?[]:portionState.portions,activeId:activeRowPortionId,onSelect:selectRowPortion,
    canSelect:()=>!overviewMode&&(!mobileUi?.isActive?.()||mobileUi.captureSession().screen==='editor')});
  syncOrientationControl();
  const areaText = formatArea(result.areaM2);
  const perimeterText = formatMetres(result.perimeterM);
  const rowsText = result.rowCount ? result.rowCount.toLocaleString('it-IT') : '—';
  const linearText = formatMetres(result.terrainStatus==='applied'?(result.surfaceRowLinearM??(terrainUsesCertifiedQuantities(result)?null:result.rowLinearM)):result.rowLinearM);
  const plantsText = result.simulatedPlants ? result.simulatedPlants.toLocaleString('it-IT') : '—';
  const commercialPlantsText = result.commercialPlants25 ? result.commercialPlants25.toLocaleString('it-IT') : '—';
  setText('#summary-area', areaText);
  setText('#summary-net-area', formatArea(result.netAreaM2));
  setText('#summary-perimeter', perimeterText);
  setText('#summary-rows', rowsText);
  setText('#summary-linear', linearText);
  setText('#summary-posts', Number.isFinite(result.totalPosts)?result.totalPosts.toLocaleString('it-IT'):'Da rivedere');
  setText('#summary-head-posts', Number.isFinite(result.headPosts)?result.headPosts.toLocaleString('it-IT'):'Da rivedere');
  setText('#summary-plants', plantsText);
  setText('#summary-commercial', commercialPlantsText);
  const terrainApplied=result.terrainStatus==='applied';
  setText('#summary-linear-label',terrainApplied?'Metri sul terreno':'Metri lineari');
  $('#summary-terrain-surface-wrap').hidden=!terrainApplied;
  $('#summary-horizontal-linear-wrap').hidden=!terrainApplied;
  setText('#summary-terrain-surface',formatArea(result.surfaceAreaM2));
  setText('#summary-horizontal-linear',formatMetres(result.horizontalRowLinearM));
  if(result.terrainStatus==='invalid')for(const selector of ['#summary-rows','#summary-linear','#summary-plants','#summary-commercial'])setText(selector,'Da rivedere');
  mobileUi?.renderField();
  renderManualAreaCalculation();
  mapApi?.setRows(overviewMode?[]:result.rows);
  mapApi?.setExclusions(overviewMode?[]:(project.exclusions ?? []));
  mapApi?.setActiveFieldLabel(project.label ?? 'Campo');
  syncOtherFieldsOnMap();
  if(overviewMode)setOverviewControls(true);
  const centerButton = $('#center-field-button');
  if (centerButton) centerButton.disabled = !project.geometry;
  renderProjectAdvice(project);
  if(!curveControlInteracting)renderCurveControls();
  syncCurveEditor();
  void terrainController?.refresh();
  if(result.terrainStatus==='invalid')setStatus('Disegno sul terreno da rivedere: prepara e applica una nuova proposta.');
  else if (project.geometry && result.vertexCount) {
    const posts = result.totalPosts ? ` · ${result.totalPosts} pali stimati` : '';
    const excluded = result.excludedAreaM2 ? ` · ${formatArea(result.excludedAreaM2)} esclusi` : '';
    setStatus(`${result.vertexCount} vertici · ${formatArea(result.areaM2)}${excluded} · ${result.rowCount} filari${posts}`);
  }
}

function syncOrientationControl() {
  const control = $('#orientation');
  const output = $('#orientation-output');
  const value=normalizeOrientationDeg(portionEditorState().orientationDeg);
  if (control) control.value = String(value);
  if (output&&document.activeElement!==output) output.value = formatOrientationDeg(value);
}

function curveId(){return globalThis.crypto?.randomUUID?.()??`curve-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;}
function rowEditingProject(){const pending=terrainController?.getState();const patch=pending?.projectPatch??pending?.proposal?.projectPatch;return patch?mergeProjectState(state,patch).project:state.project;}
function portionEditorState(){return rowPortionEditorState(rowEditingProject(),activeRowPortionId);}
function selectRowPortion(id){
 if(overviewMode)return;
 const editor=state.project.terrain?rowPortionEditorState(state.project,activeRowPortionId):portionEditorState();if(!editor.enabled||!editor.portions.some(p=>p.id===id))return;
 activeRowPortionId=id;curveEditingActive=false;mapApi?.finishRowCurveEditing?.();
 if(state.project.terrain){terrainController?.cancel();calculateAndRender();return;}
 patchProject({rowPortions:editor.portions});
}
function patchRowDesign(patch,{extraPatch={}}={}){
 const projectPatch={...rowPortionDesignPatch(rowEditingProject(),activeRowPortionId,patch),...extraPatch};
 if(state.project.terrain){terrainController?.close3D();const candidate=mergeProjectState(state,projectPatch);void terrainController?.propose({project:candidate.project,projectPatch,followTerrain:false});return;}
 patchProject(projectPatch);
}
function curveContext(){return portionEditorState().context;}
function syncCurveEditor(){const editor=portionEditorState();mapApi?.setRowCurveEditor?.({geometry:editor.context.polygon,orientationDeg:editor.orientationDeg,exclusions:editor.context.exclusions,points:editor.points,active:!overviewMode&&curveEditingActive&&(!editor.active||editor.active.mode==='local')});}
function patchCurvePoints(points,{preserveControls=false}={}){curveControlInteracting=preserveControls;try{patchRowDesign({rowCurvePoints:resolveRowCurvePoints({...curveContext(),rowCurvePoints:points})});}finally{curveControlInteracting=false;}}
function renderCurveControls(){
  const list=$('#curve-points-list');if(!list)return;
  const editor=portionEditorState(),segments=getRowCurveSegments(editor.context),points=resolveRowCurvePoints({...editor.context,rowCurvePoints:editor.points});
  const equidistance=$('#curve-equidistance');if(equidistance)equidistance.checked=editor.maintainRowEquidistance;
  list.replaceChildren();
  const add=$('#curve-add-button'),edit=$('#curve-edit-button'),reset=$('#curve-reset-button');
  if(add)add.disabled=!state.project.geometry||points.length>=8;
  if(edit){edit.disabled=!state.project.geometry||!points.length;edit.setAttribute('aria-pressed',String(curveEditingActive));edit.textContent=curveEditingActive?'Fine modifica':'Modifica sulla mappa';}
  if(reset)reset.disabled=!points.length&&!(editor.active?.mode==='inherited'&&editor.active.rowCurvePoints.length);
  if(!points.length){const empty=document.createElement('p');empty.className='curve-points-empty';empty.textContent=editor.active?.mode==='inherited'&&editor.active.rowCurvePoints.length?'Curva precedente mantenuta. Aggiungi un punto o raddrizza i filari per progettare questa porzione.':state.project.geometry?'Filari rettilinei. Aggiungi un punto per curvarli.':'Disegna prima il perimetro del campo.';list.append(empty);return;}
  points.forEach((point,index)=>{
    const card=document.createElement('div');card.className='curve-point-card';
    const heading=document.createElement('div');heading.className='curve-point-heading';
    const range=curveControlRange(point,segments);
    const title=document.createElement('strong');title.textContent=`Punto ${index+1}${segments.length>1?' · '+range.segment.label:''}`;
    const remove=document.createElement('button');remove.type='button';remove.className='curve-point-remove';remove.textContent='Elimina';remove.addEventListener('click',()=>patchCurvePoints(points.filter(item=>item.id!==point.id)));
    heading.append(title,remove);
    const position=document.createElement('label');position.textContent=segments.length>1?'Posizione nel tratto':'Posizione lungo il filare';const positionValue=document.createElement('output');positionValue.textContent=`${range.percent}%`;const positionInput=document.createElement('input');positionInput.type='range';positionInput.min=String(range.min);positionInput.max=String(range.max);positionInput.step='.001';positionInput.value=String(point.position);positionInput.addEventListener('input',()=>{positionValue.textContent=`${curveControlRange({...point,position:Number(positionInput.value)},segments).percent}%`;patchCurvePoints(points.map(item=>item.id===point.id?{...item,position:Number(positionInput.value)}:item),{preserveControls:true});});positionInput.addEventListener('change',renderCurveControls);position.append(positionValue,positionInput);
    const offset=document.createElement('label');offset.textContent='Spostamento laterale';const offsetValue=document.createElement('output');offsetValue.textContent=`${point.offsetM.toLocaleString('it-IT',{maximumFractionDigits:1})} m`;const offsetInput=document.createElement('input');offsetInput.type='range';offsetInput.min='-100';offsetInput.max='100';offsetInput.step='.5';offsetInput.value=String(point.offsetM);offsetInput.addEventListener('input',()=>{offsetValue.textContent=`${Number(offsetInput.value).toLocaleString('it-IT',{maximumFractionDigits:1})} m`;patchCurvePoints(points.map(item=>item.id===point.id?{...item,offsetM:Number(offsetInput.value)}:item),{preserveControls:true});});offsetInput.addEventListener('change',renderCurveControls);offset.append(offsetValue,offsetInput);
    card.append(heading,position,offset);list.append(card);
  });
}
function patchProject(patch) { terrainController?.close3D(); if(overviewMode&&!Object.keys(patch).every(key=>['localProjectName','campaignYear'].includes(key)))return; state = mergeProjectState(state, patch); summarySaveFeedback.dirty(); persist(); calculateAndRender(); projectSync?.schedule('project_changed'); }
function patchMaterialProject(patch) {
  if(overviewMode)return;
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
  if(overviewMode)return;
  terrainController?.close3D();
  const proposed = applyGeometryWithSuggestedOrientation({ ...state.project, ...patch }, geometry);
  state = { ...state, project:updateActiveFieldProject(state.project, { ...patch, geometry:proposed.geometry, orientationDeg:proposed.orientationDeg, orientationLocked:proposed.orientationLocked }) };
  summarySaveFeedback.dirty();
  syncOrientationControl();
  persist();
  calculateAndRender();
  renderSoilProfile();
  void fieldLocationCoordinator.refresh(activeField(state.project));
  scheduleCadastralLookup(activeField(state.project));
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
      const exclusions = [...existing, { id:`ex-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, label, type:meta.type || 'area', widthM:meta.widthM ?? null, ...(meta.sourceAxis?{sourceAxis:meta.sourceAxis.map(point=>[...point]),passageGroupId:meta.passageGroupId}:{}), geometry }];
      patchProject({ exclusions });
      renderExclusions();
      track('excluded_zone_added', { count:exclusions.length, type:meta.type || 'area' });
    },
    onExclusionChange: (id, geometry, metadata = {}) => {
      patchProject({exclusions:(state.project.exclusions ?? []).map(item=>item.id===id ? {...item,...metadata,geometry,label:item.type==='linear'&&metadata.type==='area'?'Area esclusa rimodellata':item.label} : item)});
      renderExclusions();
    },
    onExclusionsReplace: (exclusions) => {patchProject({exclusions});renderExclusions();},
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
    onDraftChange:()=>{if(!restoringWorkspace)persist();},
    onReady: calculateAndRender
  });
  if (state.project.geometry) mapApi.setGeometry(state.project.geometry);
  mapApi.setExclusions(state.project.exclusions ?? []);
  syncOtherFieldsOnMap();
  mapApi.setBaseMap(state.map?.base ?? 'satellite');
} catch (error) { console.error(error); setStatus('Impossibile caricare la mappa. Controlla la connessione e riprova.'); }


function terrainContext(){return {ownerId:identityFrozen?null:authBridge.getState()?.user?.id??null,projectId:state.project.localProjectId,fieldId:overviewMode?null:state.project.activeFieldId};}
terrainController=createTerrainController({document,getProject:()=>overviewMode?{...state.project,geometry:null}:state.project,getContext:terrainContext,getPortionId:()=>activeRowPortionId,getMapApi:()=>mapApi,getResult:()=>latestMetrics,onStatus:setStatus,onProposalChange:()=>{renderCurveControls();syncCurveEditor();},
 applyProposal:(proposal,context)=>{
  if(identityFrozen||overviewMode)throw new Error('Il contesto del progetto è cambiato.');
  const checkpoint=checkpointTerrainProposal({state,proposal,context,currentContext:terrainContext(),mergeState:mergeProjectState,saveCheckpoint:candidate=>saveDraft(globalThis.localStorage,candidate,captureWorkspace())});
  state=checkpoint;summarySaveFeedback.dirty();calculateAndRender();projectSync?.schedule('terrain_applied');return true;
 }});
// Every map-edit entry restores the 2D camera before installing edit handles.
for(const method of ['beginDraw','beginExclusionDraw','beginLinearExclusionDraw','beginVertexEditing','beginExclusionEditing','beginVertexRemoval']){
 if(!mapApi?.[method])continue;const edit=mapApi[method];mapApi[method]=(...args)=>{terrainController.close3D();return edit(...args);};
}
if(mapApi?.setRowCurveEditor){const edit=mapApi.setRowCurveEditor;mapApi.setRowCurveEditor=options=>{if(options.active)terrainController.close3D();return edit(options);};}
void terrainController.refresh();

const soilMap=mapApi?.map?createSoilMapController({map:mapApi.map,onStatus:message=>{const status=$('#soil-status');if(status&&message)status.textContent=message;},onObservation:(result,layer)=>{const card=$('#soil-point-card');if(card)renderSoilCard(card,result,{layer,close:true});}}):null;
function renderSoilProfile(){const box=$('#soil-profile');if(!box)return;box.replaceChildren();const profile=state.project.soil,data=profile?.cartographic??profile;$('#soil-analyze').textContent=data?'Aggiorna dati suolo':'Analizza suolo del campo';if(!data?.description)return;renderSoilCard(box,data,{layer:data.layer});const source=document.createElement('p');source.textContent=`${data.samples||1} punti consultati · rilevazione ${data.retrievedAt||data.observedAt?new Date(data.retrievedAt||data.observedAt).toLocaleDateString('it-IT'):'non datata'}`;box.append(source);if(!soilProfileIsCurrent(profile,state.project.geometry)){const note=document.createElement('p');note.textContent='Perimetro modificato: aggiorna i dati del suolo.';box.append(note);}}
$('#soil-button')?.addEventListener('click',()=>{if(!soilMap)return;soilMap.setActive(!soilMap.isActive());$('#soil-button').setAttribute('aria-pressed',String(soilMap.isActive()));$('#soil-legend').hidden=!soilMap.isActive();if(!soilMap.isActive())$('#soil-point-card').hidden=true;});
$('#soil-layer-select')?.addEventListener('change',event=>{soilMap?.setLayer(event.target.value);$('#soil-legend').textContent=`${SOIL_LAYER_LABELS[event.target.value]} · Regione Piemonte · 1:50.000`;$('#soil-point-card').hidden=true;});
async function analyzeActiveSoil(){const button=$('#soil-analyze');if(!button||button.disabled)return null;const id=state.project.activeFieldId;button.disabled=true;try{const soil=await (isMobileMap()?soilMap?.analyzeAll(state.project.geometry,{refresh:true}):soilMap?.analyze(state.project.geometry,{refresh:true}));if(soil&&id===state.project.activeFieldId){patchProject({soil});renderSoilProfile();return soil;}return null;}finally{button.disabled=false;}}
$('#soil-analyze')?.addEventListener('click',analyzeActiveSoil);

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
const cadastralCoordinator=createCadastralCoordinator({
 getScope:()=>`${authBridge.getState()?.user?.id??''}|${state.cloud?.projectId??state.project.localProjectId??''}`,
 getField:id=>(ensureProjectFields(state.project).fields??[]).find(field=>String(field.id)===id),
 apply:(refs,field)=>{state={...state,project:updateProjectField(state.project,field.id,{cadastralRefs:refs})};summarySaveFeedback.dirty();persist();projectSync?.schedule('field_cadastre_changed');if(field.id===state.project.activeFieldId){cadastralReferenceEditor.render(refs,{municipality:field.municipality});if(overviewMode)setOverviewControls(true);}},
 onStatus:(status,id,detail)=>{if(id!==state.project.activeFieldId)return;const node=$('#cadastral-auto-status');if(node)node.textContent=status==='loading'?'Ricerca delle particelle toccate dal perimetro…':status==='ready'?`${detail} particelle rilevate. Puoi correggere i dati.`:status==='empty'?'Nessuna particella disponibile per questo perimetro. I dati inseriti sono conservati.':`Ricerca non disponibile: ${detail}. I dati inseriti sono conservati.`;}
});
let cadastralLookupTimer=null;
function scheduleCadastralLookup(field){clearTimeout(cadastralLookupTimer);if(field?.geometry)cadastralLookupTimer=setTimeout(()=>void cadastralCoordinator.refresh(field),700);}
$('#cadastral-auto-refresh')?.addEventListener('click',()=>void cadastralCoordinator.refresh(activeField(state.project),{force:true}));
const desktopFieldSelectors=createDesktopFieldSelectors({document,onSelect:(id)=>{
  if(!id){enterOverviewMode();return;}
  state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap();mapApi?.focusActiveField();
}});
desktopFieldSelectors.mount();

function renderFieldManager() {
  mobileUi?.renderField();
  desktopFieldSelectors.render(state.project.fields ?? [],overviewMode?'':state.project.activeFieldId);
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
    .filter((field) => (overviewMode||field.id !== state.project.activeFieldId) && Array.isArray(field.geometry) && field.geometry.length >= 4)
    .map((field) => {
      const metrics = calculateFieldProject(field);
      return { ...field, rows:metrics.rows };
    });
  mapApi?.setOtherFields(otherFields);
  mapApi?.setActiveFieldLabel(state.project.label ?? 'Campo');
}

const overviewDisabledControls=new Map();
function setOverviewControls(disabled){
 document.body.classList.toggle('map-overview-mode',disabled);
 const selector='#cadastral-auto-refresh,#draw-map-button,#edit-vertices-button,#exclude-zone-button,#exclude-line-button,#field-name,#remove-field-button,#draw-button,#plant-spacing,#row-spacing,#orientation,#orientation-output,#row-curve-controls input,#row-curve-controls button,#curve-add-button,#curve-edit-button,#curve-reset-button,#curve-equidistance,#headland,#post-spacing,#mechanized,#grape-variety,#clone-selection,#rootstock,#plant-height,#material-request-note,#planting-status,#planting-status-desktop,#project-context,#project-context-note,#cadastral-reference-editor input,#cadastral-reference-editor button,#soil-analyze,#exclusion-list input,#exclusion-list button,#clear-field-button,#edit-field-button,#remove-vertex-button,#exclude-area-button,#exclude-linear-button';
 if(disabled)for(const node of document.querySelectorAll(selector)){if(!overviewDisabledControls.has(node))overviewDisabledControls.set(node,node.disabled);node.disabled=true;}
 else{for(const [node,previous] of overviewDisabledControls)node.disabled=previous;overviewDisabledControls.clear();}
}
function enterOverviewMode(){
 mapApi?.stopTools?.();curveEditingActive=false;mapApi?.finishRowCurveEditing?.();mapApi?.clearGeometry();overviewMode=true;
 activeRowPortionId=null;mapApi?.setRowPortions?.({portions:[]});renderRowPortionPicker($('#row-portion-picker'),{enabled:false},selectRowPortion);
 syncOtherFieldsOnMap();desktopFieldSelectors.render(state.project.fields??[],'');setOverviewControls(true);mapApi?.focusAllFields?.();setStatus('Vista generale: nessun campo selezionato. Seleziona un campo per modificarlo.');
}

function loadActiveFieldOnMap() {
  overviewMode=false;setOverviewControls(false);
  curveEditingActive=false;
  activeRowPortionId=null;rowPortionFieldId=state.project.activeFieldId;
  mapApi?.finishRowCurveEditing?.();
  mapApi?.clearGeometry();
  syncOtherFieldsOnMap();
  if (state.project.geometry) mapApi?.setGeometry(state.project.geometry);
  mapApi?.setExclusions(state.project.exclusions ?? []);
  syncProjectControls(); renderFieldManager(); renderExclusions(); calculateAndRender();
  scheduleCadastralLookup(activeField(state.project));
}

$('#field-name')?.addEventListener('input', (event) => {
  if(overviewMode)return;
  state = { ...state, project:renameActiveProjectField(state.project, event.target.value) };
  summarySaveFeedback.dirty();
  persist();
  desktopFieldSelectors.render(state.project.fields ?? [],overviewMode?'':state.project.activeFieldId);
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

function isMobileMap() { return viewMode.isMobile(); }
installPenTapFallback(document.body,()=>viewMode.isTablet()&&!isMobileMap()||Boolean(publicProjectDialog?.open),{onMapTap:event=>{
  const map=mapApi?.map,canvas=map?.getCanvas?.();if(!canvas?.contains(event.target))return;
  const rect=canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top};
  map.fire('click',{point,lngLat:map.unproject(point),originalEvent:event});
}});
function startDrawingField() { if(overviewMode)return;patchProject({ sourceType:'manual' }); mapApi?.beginDraw(); }
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
$('#clear-field-button')?.addEventListener('click', () => { if(overviewMode)return;cadastralCoordinator.invalidate();if (!state.project.geometry && !(state.project.exclusions?.length)) return; fieldLocationCoordinator.invalidate();mapApi?.clearGeometry(); patchProject({ geometry:null, exclusions:[], sourceType:'manual' }); renderExclusions(); setStatus('Campo cancellato. Puoi disegnare un nuovo perimetro.'); });
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
  if (mobileUi?.isActive?.()&&isMobileMap()) { mobileUi.sync();requestAnimationFrame(()=>mapApi?.map?.resize?.()); return; }
  if (mobileUi?.isActive?.())mobileUi.sync();
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
function promptForProfile(action='salvare') {
  const profile=authBridge.getState();
  if(profile.kind!=='user')return false;
  const missing=missingProjectProfileFields(profile);
  if(!missing.length)return false;
  const message=`Completa il Profilo per ${action} il progetto: ${missing.join(', ')}. L'azienda è facoltativa.`;
  setStatus(message);
  if(mobileUi?.isActive?.()){
    mobileUi.navigate('profile');
    const feedback=$('#mobile-auth-feedback');if(feedback)feedback.textContent=message;
  }else profileUi.openProfile(message);
  return true;
}

async function saveMobileProject(name = '', {commitCloud=false} = {}) {
  ensureLocalProjectIdentity(name || state.project.localProjectName || 'Il mio impianto');
  writeLocalProject(globalThis.localStorage, state.project, state.project.localProjectName, state.cloud);
  mobileTransactionSnapshot = null;
  if(commitCloud && authBridge.getState().kind==='user'){
    if(promptForProfile('salvare'))throw new Error('Completa i dati indicati nel Profilo. La bozza resta sul dispositivo.');
    if(!cloudService)throw new Error('Archivio online non disponibile. La bozza resta sul dispositivo.');
    state={...state,contact:projectContactFromProfile(authBridge.getState())};persist();
    const revision=await projectSync?.saveRevision();assertSavedRevision(revision);
    await saveCloudProject('saved');
    return {location:'cloud'};
  }
  await projectSync?.saveRevision();
  return {location:'local'};
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
function duplicateFieldInCurrentProject(fieldId) {
  state={...state,project:duplicateProjectField(state.project,fieldId)};
  persist();loadActiveFieldOnMap();mapApi?.focusActiveField?.();
  setStatus('Copia creata: modifica i punti del perimetro per posizionare il nuovo campo.');
  return state.project.activeFieldId;
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
  countsEnabled:countsConfig.enabled,openCounts:switchToCounts,openCountsForField,
  auth:authBridge,
  getMap:()=>mapApi?.map,
  isMobile:isMobileMap, getField:()=>state.project, getFields:()=>state.project.fields ?? [], getMetrics:(field)=>calculateFieldProject(field ?? state.project),
  resizeMap:()=>requestAnimationFrame(()=>mapApi?.map?.resize?.()), focusAll:()=>mapApi?.focusAllFields?.(), focusField:()=>mapApi?.focusActiveField(),
  showSatellitePreview:()=>mapApi?.setBaseMap('satellite'), restoreBaseMap:()=>mapApi?.setBaseMap(state.map?.base ?? 'satellite'),
  stopTools:()=>mapApi?.stopTools(), finishEdit:()=>mapApi?.finishVertexEditing(), undoPoint:()=>mapApi?.undoDrawPoint(), finishDraw:()=>mapApi?.finishDraw(),
  beginNewField:beginMobileNewField, beginEdit:beginMobileEdit, cancelEdit:cancelMobileEdit,
  selectField:(id)=>{ state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap(); },
  renameField:(field,name)=>{state={...state,project:renameActiveProjectField(switchProjectField(state.project,field.id),name)};persist();loadActiveFieldOnMap();},
  removeField:removeMobileField,
  duplicateField:duplicateFieldInCurrentProject,beginDuplicateEdit:()=>mapApi?.beginVertexEditing?.(),
  saveProject:saveMobileProject, listProjects:()=>readLocalProjects(globalThis.localStorage), loadProject:loadMobileProject, newProject:newMobileProject,
  renameProject:renameArchivedProject,deleteProject:deleteArchivedProject,
  analyzeSoil:analyzeActiveSoil,
  layoutCadastral:value=>cadastralReferenceEditor.setMobile(value),
  refreshProjects:refreshOwnedArchive,
  openPublicProject:openPublicProjectDialog,
  openUserProjects:()=>userProjectsView.open(),
  openReport:(item)=>openReportPopup({projectItem:item}),
  openReportForField:(id)=>openReportPopup({fieldId:id}),
  openQuote:(item)=>openQuote({projectItem:item}),
  openQuoteForField:(id)=>openQuote({fieldId:id}),
  finalAction:requestFinalAction
});
if(countsConfig.enabled)mountToolMenu({document,onCounts:()=>switchToCounts('resume'),onError:error=>setStatus(error.message||'Conteggi non disponibile.')});

desktopLibraryUi=createDesktopLibraryUI({
  countsEnabled:countsConfig.enabled,openCountsForField,loadCountsForField,
  document,isDesktop:()=>!isMobileMap(),getFields:()=>state.project.fields??[],getProjects:()=>readLocalProjects(globalThis.localStorage),getActiveProjectId:()=>state.project.localProjectId,
  getFieldMetrics:(field)=>calculateFieldProject(field),
  isAdmin:()=>authBridge.getState().isAdmin,openUserProjects:()=>userProjectsView.open(),openReport:(item)=>openReportPopup({projectItem:item}),
  selectField:(id)=>{state={...state,project:switchProjectField(state.project,id)};persist();loadActiveFieldOnMap();},
  renameField:(field,name)=>{state={...state,project:renameActiveProjectField(switchProjectField(state.project,field.id),name)};persist();loadActiveFieldOnMap();},
  deleteField:(field)=>removeMobileField(field.id),
  duplicateField:(field)=>{duplicateFieldInCurrentProject(field.id);mapApi?.beginVertexEditing?.();},
  openReportForField:(id)=>openReportPopup({fieldId:id}),
  loadProject:loadMobileProject,refreshProjects:refreshOwnedArchive,saveProject:()=>saveMobileProject(state.project.localProjectName,{commitCloud:true}),newProject:newMobileProject,
  renameProject:renameArchivedProject,deleteProject:deleteArchivedProject,moveField:moveArchivedField,
  openQuote:(item)=>openQuote({projectItem:item}),openQuoteForField:(id)=>openQuote({fieldId:id})
});
desktopLibraryUi.mount();

const quoteUi=createQuoteUI({document,getProfile:()=>authBridge.getState(),onSubmit:async({projectItem,fieldIds,contact,requestKey})=>{
  if(!cloudService||!projectSync)throw new Error('Connessione non disponibile. Riprova quando il progetto sarà sincronizzato.');
  if(projectItem && state.project.localProjectId!==projectItem.id)loadMobileProject(projectItem);
  const selected=new Set((state.project.fields??[]).map(field=>field.id));
  if(fieldIds.some(id=>!selected.has(id)))throw new Error('Il campo non appartiene al progetto selezionato.');
  const synced=await ensureQuoteRevision({sync:projectSync,backend:cloudBackend,getState:()=>state,getMetrics:(field)=>calculateFieldProject(field)});
  if(synced.state!=='synced'||!synced.projectId)throw new Error(synced.state==='conflict'
    ? 'Il progetto online contiene modifiche diverse. La bozza locale resta invariata: apri Progetti, aggiorna e verifica i campi prima di riprovare.'
    : `Sincronizzazione non riuscita: ${synced.lastError||'riprova tra poco'}. La richiesta non è stata inviata.`);
  cloudService.selectProject({...state.cloud,projectId:synced.projectId});
  await saveCloudProject('saved');
  const snapshot=await cloudService.requestQuote(state,latestMetrics??{}, {fieldIds,contact,requestKey});
  state={...state,contact:{...contact,privacyVersion:'v1',marketingConsent:false}};
  await persistCloudSnapshot(snapshot);
}});
function openQuote({projectItem=null,fieldId=null}={}){
  quoteUi.open({projectItem,fieldId,project:state.project});
}

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
  const value=normalizeOrientationDeg(raw,portionEditorState().orientationDeg);
  patchRowDesign({orientationDeg:value},{extraPatch:{orientationLocked:true}});syncOrientationControl();
  if(trackChange)track('orientation_changed',{degrees:value});
}
$('#orientation')?.addEventListener('input',(event)=>applyOrientationValue(event.target.value));
$('#orientation')?.addEventListener('change', () => track('orientation_changed', { degrees:portionEditorState().orientationDeg }));
$('#orientation-output')?.addEventListener('input',(event)=>{if(event.target.value.trim()!=='')applyOrientationValue(event.target.value);});
$('#orientation-output')?.addEventListener('change',(event)=>applyOrientationValue(event.target.value,{trackChange:true}));
for (const button of document.querySelectorAll('[data-angle]')) button.addEventListener('click',()=>applyOrientationValue(button.dataset.angle,{trackChange:true}));
$('#curve-add-button')?.addEventListener('click',()=>{
  if(!state.project.geometry)return;
  const editor=portionEditorState(),points=editor.points;if(points.length>=8)return;
  const point=editor.active?nextPortionCurvePoint(editor.active,points,curveId()):nextCurveControlPoint(points,getRowCurveSegments(editor.context),curveId());
  if(!point)return;
  curveEditingActive=true;patchCurvePoints([...points,point]);
});
$('#curve-edit-button')?.addEventListener('click',()=>{if(!state.project.geometry||!portionEditorState().points.length)return;curveEditingActive=!curveEditingActive;renderCurveControls();syncCurveEditor();});
$('#curve-reset-button')?.addEventListener('click',()=>{curveEditingActive=false;mapApi?.finishRowCurveEditing?.();patchCurvePoints([]);});
$('#curve-equidistance')?.addEventListener('change',event=>patchRowDesign({maintainRowEquidistance:event.target.checked}));
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
  if(identityFrozen)return;
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
    openQuote();
    return;
  }
  if (action === 'save' && cloudService) requireSecureConnection(globalThis.isSecureContext);
  if (action === 'save') { const revision=await projectSync?.saveRevision();if(cloudService)assertSavedRevision(revision); }
  if (cloudService) {
    await saveCloudProject('saved');
    $('#contact-feedback').textContent = 'Progetto salvato.';
    if(action==='save')summarySaveFeedback.saved();
  } else {
    const message='Bozza salvata su questo dispositivo. Archivio online non disponibile.';
    $('#contact-feedback').textContent = message;
    setStatus(message);
    if(action==='save')summarySaveFeedback.local();
  }
  }catch(error){if(action==='save')summarySaveFeedback.error();throw error;}
}

function openReportPopup({projectItem=null,fieldId=null}={}) {
  if(promptForProfile('scaricare'))return;
  const ownerId=authBridge.getState()?.user?.id;
  let snapshot,serializedSnapshot;
  try{snapshot=prepareReportContext(state,{projectItem,fieldId,ownerId});serializedSnapshot=serializeTerrainSnapshot(snapshot);}
  catch(error){setStatus(error.message);throw error;}
  persist();
  const initialProjectId=snapshot.cloud?.projectId??null;
  const requestId=globalThis.crypto.randomUUID();
  globalThis.localStorage.setItem(REPORT_CONTEXT_KEY(requestId),serializedSnapshot);
  globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,status:'opened'}));
  const popup=globalThis.open(`./report.html?handoff=${requestId}${isMobileMap()?'&source=mobile':''}`, '_blank');
  if(!popup){globalThis.localStorage.removeItem(REPORT_CONTEXT_KEY(requestId));throw new Error('Il browser ha bloccato la finestra del documento. Consenti i popup per questo sito e riprova.');}
  const currentOwner=()=>identityFrozen?null:authBridge.getState()?.user?.id;
  const source=createReportProjectSource({getState:()=>state,getOwnerId:currentOwner,getBackend:()=>cloudBackend,getSync:()=>projectSync,
    getArchive:()=>readLocalProjects(globalThis.localStorage),getMetrics:field=>calculateFieldProject(field),
    checkpoint:()=>checkpointBeforeSwitch({storage:globalThis.localStorage,state,ownerId:currentOwner(),capture:captureWorkspace,pendingWorkspace:restoringWorkspace?pendingWorkspace:null}),
    onSynced:async(reportState,kind)=>{
      if(currentOwner()!==ownerId||state.project.localProjectId!==reportState.project.localProjectId)return;
      // A cloud refresh can deliberately use a different online drawing. Keep
      // the editor's local draft and its conflict base until it is reconciled.
      if(kind!=='current'&&hasReportProjectChanges(state,reportState))return;
      if(kind==='current')await projectSync?.acknowledgeReportAutosaves?.(reportState.project.localProjectId);
      if(currentOwner()!==ownerId||state.project.localProjectId!==reportState.project.localProjectId)return;
      state=mergeCloudSnapshot(state,reportState.cloud);cloudService?.selectProject(state.cloud);projectSync?.adoptCloudState(state.cloud);persist();
      if(kind==='current'&&hasReportProjectChanges(state,reportState))projectSync?.schedule('after_report');
    }
  });
  const onReportRequest=async(event)=>{
    if(event.key!==REPORT_HANDOFF_KEY)return;
    let request;try{request=JSON.parse(event.newValue);}catch{return;}
    if(request?.requestId!==requestId||!['requested','refresh_requested'].includes(request.status))return;
    const matchingOperation=()=>{
      try{const active=JSON.parse(globalThis.localStorage.getItem(REPORT_HANDOFF_KEY)||'null');return active?.requestId===requestId&&active.operationId===request.operationId;}catch{return false;}
    };
    try{
      if(!request.operationId||request.ownerId!==ownerId||request.localProjectId!==snapshot.project.localProjectId||(request.projectId!==(snapshot.cloud?.projectId??null)&&!(initialProjectId===null&&request.projectId===null)))throw new Error('Il progetto o il profilo del documento non corrisponde. Riapri il generatore PDF.');
      globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({...request,status:'syncing'}));
      const fresh=await source.synchronize(snapshot,{refresh:request.status==='refresh_requested'});
      if(!matchingOperation())return;
      globalThis.localStorage.setItem(REPORT_CONTEXT_KEY(requestId),serializeTerrainSnapshot(fresh));
      snapshot=fresh;
      globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({...request,status:'ready',projectId:fresh.cloud.projectId,revisionNumber:fresh.cloud.latestRevisionNumber}));
    }catch(error){if(matchingOperation())globalThis.localStorage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({...request,status:'error',message:error.message}));}
  };
  globalThis.addEventListener('storage',onReportRequest);
}

function requestFinalAction(action) {
  if(action==='report'){try{openReportPopup();}catch(error){setStatus(error.message);}return;}
  if(action==='quote'){try{openQuote();}catch(error){setStatus(error.message);}return;}
  if (action === 'save' && cloudService && globalThis.isSecureContext === false) {
    try { requireSecureConnection(false); } catch (error) { setStatus(error.message); summarySaveFeedback.error(); }
    return;
  }
  if(action==='save' && authBridge.getState().kind==='user'){
    if(promptForProfile('salvare'))return;
    state={...state,contact:projectContactFromProfile(authBridge.getState())};persist();
    runFinalAction('save').catch(error=>{console.error(error);setStatus(error.message||'Salvataggio non riuscito. La bozza resta sul dispositivo.');});
    return;
  }
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
  if (cloudService) {
    try { requireSecureConnection(globalThis.isSecureContext); }
    catch (error) { $('#contact-feedback').textContent = error.message; return; }
  }
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
      const revision=await projectSync?.saveRevision();if(cloudService)assertSavedRevision(revision);
      if (cloudService) $('#contact-feedback').textContent = 'Progetto salvato.';
      if(cloudService)summarySaveFeedback.saved();else summarySaveFeedback.local();
    }
    setTimeout(() => contactDialog?.close(), action === 'report' ? 250 : 900);
  } catch (error) {
    if(submittedAction==='save')summarySaveFeedback.error();
    console.error(error);
    state={...state,contact:null};persist();
    $('#contact-feedback').textContent = `Salvataggio cloud non riuscito: ${error.message||'riprova più tardi'}. La bozza resta su questo dispositivo.`;
  }
});

async function initializeCloud() {
  try {
    let startupConflict=false;
    const client = await connectSupabase({ url:APP_CONFIG.supabaseUrl, publishableKey:APP_CONFIG.supabasePublishableKey });
    adminReadClient=client;
    if (!client) return;
    const resumeRequest = parseResumeParams(globalThis.location.href);
    const resumeBaseUrl = `${globalThis.location.origin}${globalThis.location.pathname}`;
    const backend = createBackend(client);
    cloudBackend=backend;
    const authService=createAuthService({
      client,backend,storage:globalThis.localStorage,
      resetRedirectTo:`${globalThis.location.origin}${globalThis.location.pathname}`,
      beforeIdentityChange:async context=>{
        persist();
        if(context?.action==='login'&&authBridge.getState().kind==='guest'&&countsGateway&&(await countsGateway.hasLocalWork())&&!context.transferCounts)throw new Error(COUNTS_CONFIG.guestTransferEnabled?'Scegli di trasferire i conteggi ospite prima di accedere, oppure crea un nuovo account mantenendo questa sessione.':'I conteggi ospite sono conservati. Il trasferimento a un account esistente richiede l’attivazione del servizio; puoi creare un nuovo account mantenendoli.');
        projectSync?.suspend('identity_transfer');
        coordinatedIdentityChange=true;
      },
      countsTransferEnvironment:COUNTS_CONFIG.guestTransferEnabled?APP_CONFIG.environment:null,
      countsTransferBackend:new URL(APP_CONFIG.supabaseUrl).origin,
      onGuestCountsTransfer:async proof=>{
        const temporary=createDesktopCountsGateway({client,ownerId:proof.targetOwnerId,environment:APP_CONFIG.environment,backendUrl:APP_CONFIG.supabaseUrl,syncEnabled:COUNTS_CONFIG.syncEnabled});
        try{await temporary.adoptGuestWork(proof);}finally{await temporary.destroy();}
      },
      afterIdentityChange:()=>{if(!identitySaveFailed)globalThis.location.reload();}
    });
    accountAuthService=authService;
    authBridge.attach(authService);
    await backend.ensureAnonymousSession();
    const authState=await authService.refresh();
    setLocalOwnerScope(authState.user?.id);
    const ownedRecord=loadDraftRecord(globalThis.localStorage);
    const ownedDraft=ownedRecord?.state;
    pendingWorkspace=ownedRecord?.workspace??null;
    restoringWorkspace=Boolean(pendingWorkspace);
    state=ownedDraft?.project
      ? {...createInitialState(),...ownedDraft,environment:'LIVE',project:ensureProjectFields(ownedDraft.project)}
      : createInitialState();
    state={...state,map:normalizeMapState(state.map)};
    authBridge.subscribe(next=>rememberCountsOwner(globalThis.localStorage,COUNTS_CONFIG,next));
    const identityRequests=new AbortController(),projectBackend=bindBackendToIdentity(createBackend(client,{requestSignal:identityRequests.signal}),identityRequests.signal);
    cloudBackend=projectBackend;
    let identityCheckpoint;
    const identityGuard=installIdentityGuard({client,ownerId:authState.user?.id,isCoordinated:()=>coordinatedIdentityChange,
      onSuspend:session=>{identityFrozen=true;identityRequests.abort();countsGateway?.suspend();projectSync?.suspend('identity_changed');rememberCountsOwner(globalThis.localStorage,COUNTS_CONFIG,{user:session?.user??null});},
      onCheckpoint:()=>{identityCheckpoint={state:structuredClone(state),workspace:restoringWorkspace&&pendingWorkspace?pendingWorkspace:captureWorkspace()};mapApi?.stopTools?.();terrainController?.cancel();if(!saveDraft(globalThis.localStorage,identityCheckpoint.state,identityCheckpoint.workspace))throw new Error('Salvataggio locale non disponibile');},
      onHide:(problem,session)=>{
        identitySaveFailed=Boolean(problem);authService.invalidateSession(session);
        for(const node of document.body.children)if(!['SCRIPT','STYLE','LINK'].includes(node.tagName)){node.style.setProperty('display','none','important');node.inert=true;}
        const notice=document.createElement('section');notice.setAttribute('role','alert');notice.className='identity-change-notice';notice.textContent=problem?'Il profilo è cambiato. Conserva questa scheda: la bozza del profilo precedente non è ancora salvata.':'Il profilo è cambiato. Ripristino della sessione corretta…';
        if(problem){const retry=document.createElement('button');retry.type='button';retry.textContent='Riprova il salvataggio';retry.addEventListener('click',()=>{try{if(!saveDraft(globalThis.localStorage,identityCheckpoint.state,identityCheckpoint.workspace))throw new Error('Salvataggio non disponibile');globalThis.location.reload();}catch(error){notice.firstChild.textContent='Bozza conservata in questa scheda. '+error.message;}});notice.append(retry);}
        document.body.append(notice);
      },onReload:()=>globalThis.location.reload()});
    await authService.resumePendingTransfer().catch(()=>{});
    if(identityGuard.isStopped())return;
    if(countsConfig.enabled){
      fieldDirectory=createFieldDirectory({client,auth:authBridge,environment:APP_CONFIG.environment});
      try{
        countsGateway=createDesktopCountsGateway({client,ownerId:authState.user?.id,environment:APP_CONFIG.environment,
          backendUrl:APP_CONFIG.supabaseUrl,syncEnabled:COUNTS_CONFIG.syncEnabled});
      }catch(error){console.warn('Gateway Conteggi non disponibile nell’ambiente corrente',error);}
    }
    loadActiveFieldOnMap();renderFieldManager();renderExclusions();syncProjectControls();calculateAndRender();
    mobileUi?.sync();desktopLibraryUi?.render();
    if (authState.user && authState.kind === 'user') {
      const hydrated=await hydrateOwnedProjects({
        backend:projectBackend,
        ownerUserId:authState.user.id,
        storage:globalThis.localStorage,
        currentProject:state.project,
        environment:state.environment ?? APP_CONFIG.environment
      });
      if(identityGuard.isStopped())return;
      startupConflict=restoreVersionConflict({workspace:pendingWorkspace,state},hydrated.projects);
      if (hydrated.activeProject&&!restoreWorkspaceForOwner({workspace:pendingWorkspace,state},authState.user.id,state.project.localProjectId))loadMobileProject(hydrated.activeProject);
      mobileUi?.sync();
    }
    restorePendingWorkspace(authState.user?.id);
    const requestedProjectId=new URL(globalThis.location.href).searchParams.get('openProject');
    if(requestedProjectId && authState.kind === 'user') {
      try {
        const authorizedProject=await projectBackend.loadEditableProject(requestedProjectId);
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
      backend:projectBackend,
      sessionId:getOwnerSessionId(globalThis.sessionStorage,authState.user?.id),
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
      const queueAdapter = await createIndexedDbSyncAdapter(globalThis.indexedDB,`vivai-obice-configuratore-live-${authState.user?.id}`);
      if(identityGuard.isStopped())return;
      projectSync = createProjectSync({
        backend:projectBackend,
        queue:createSyncQueue(queueAdapter),
        getState:() => state,
        getMetrics:(field) => calculateFieldProject(field ?? state.project),
        onSnapshot:(cloud) => { if(identityFrozen)return;state=mergeCloudSnapshot(state,cloud); persist(); }
      });
      if(startupConflict)projectSync.suspend('version_conflict');
      else{
        await projectSync.retryPending();
        if (state.project.geometry) projectSync.schedule('startup_reconcile');
      }
    } catch (syncError) {
      console.warn('Cloud archive queue unavailable; local persistence remains active',syncError);
    }
    await cloudService.trackEvent('configurator_opened', { device:matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop' });
    setStatus(startupConflict?'Il progetto online è cambiato: la bozza locale è conservata. Verifica il conflitto prima di sincronizzare.':'Archivio collegato. La bozza resta disponibile su questo dispositivo.');
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
