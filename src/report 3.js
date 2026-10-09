import {buildOverviewMapModel} from './report-overview.js?v=1.3.5';
import {refreshFieldSoilForReport} from './soil-report.js';
import { loadDraft } from './storage.js?v=1.3.5';
import { ensureProjectFields } from './fields.js?v=1.3.5';
import { calculateProject } from './project-calculator.js?v=1.3.5';
import { buildProjectReportModel } from './pdf-model.js?v=1.3.5';
import { createReportPreflight, updateReportPreflight, canIssueReport, DISCLAIMER_VERSION, resolveFieldLocations, locationForSelection } from './report-preflight.js?v=1.3.5';
import { buildReportMapModel } from './report-map-model.js?v=1.3.5';
import { captureSatelliteImage } from './report-satellite.js?v=1.3.5';
import { newReportShareToken, hashReportShareToken, buildSharedReportUrl } from './report-share.js';
import { renderReportQrSvg } from './report-qr.js';
import { renderProjectReportHtml } from './report-template.js?v=1.3.5';
import { APP_CONFIG } from './config.js?v=1.3.5';
import { connectSupabase, createBackend } from './backend.js?v=1.3.5';
import {bindBackendToIdentity} from './identity-guard.js';
import { REPORT_HANDOFF_KEY } from './report-handoff.js';
import {readReportContext,mountReportProjectContext,assertReportContextScope,refreshReportPreflight} from './report-context.js?v=1.3.5';
import { buildReportPdfFilename } from './report-filename.js?v=45';
import { mountReportAddressAutocomplete } from './report-address.js?v=45';

export { REPORT_HANDOFF_KEY };

function metricsForField(field){
  const exclusions=Array.isArray(field.exclusions)?field.exclusions:[];
  return calculateProject({polygon:field.geometry,exclusions,rowSpacingM:field.rowSpacingM,plantSpacingM:field.plantSpacingM,orientationDeg:field.orientationDeg,rowCurvePoints:field.rowCurvePoints,rowPortions:field.rowPortions,terrain:field.terrain,maintainRowEquidistance:field.maintainRowEquidistance!==false,postSpacingM:field.postSpacingM,headlandWidthM:field.headlandWidthM});
}

function selectedFields(state,ids){
  const project=ensureProjectFields(state?.project??{});
  const byId=new Map((project.fields??[]).map(field=>[String(field.id??field.clientFieldId),field]));
  const fields=ids.map(id=>byId.get(String(id))).filter(Boolean);
  if(fields.length!==ids.length||fields.some(field=>!buildReportMapModel({polygon:field.geometry}).valid))throw new Error('I campi selezionati non sono più disponibili o hanno un perimetro incompleto.');
  return fields;
}

export function createReportOrchestrator({
  sync,
  captureSatellite=captureSatelliteImage,
  tokenFactory=newReportShareToken,
  hashToken=hashReportShareToken,
  issueReport,
  buildShareUrl=buildSharedReportUrl,
  qrRenderer=renderReportQrSvg,
  renderer=renderProjectReportHtml,
  refreshSoil=async()=>null,
  now=()=>new Date()
}={}){
  return {
    async generate({preflight,state,hostForField,hostForOverview,fieldLocations={},baseUrl=globalThis.location?.href??'https://vivaiobice.github.io/'}={}){
      if(!canIssueReport(preflight))throw new Error('Accetta l’avvertenza e completa i dati richiesti prima di generare il documento.');
      const fields=selectedFields(state,preflight.selectedFieldIds);
      const freshSoils=await Promise.all(fields.map(field=>refreshSoil(field).catch(()=>null)));
      if(!sync?.saveRevision||typeof issueReport!=='function')throw new Error('Sincronizzazione documento non disponibile.');
      const revision=await sync.saveRevision({reason:'report_issue'});
      if(revision?.state==='conflict'||revision?.status==='conflict')throw new Error('Conflitto di versione: aggiorna il progetto prima di generare il documento.');
      const revisionNumber=Number(revision?.revisionNumber??revision?.latestRevisionNumber);
      const projectId=revision?.projectId??state?.cloud?.projectId;
      if(!projectId||!Number.isInteger(revisionNumber)||revisionNumber<1)throw new Error('La revisione del progetto non è disponibile.');

      const mapAssets={};
      for(const field of fields){
        const metrics=metricsForField(field);
        const mapModel=buildReportMapModel({polygon:field.geometry,rows:metrics.rows,exclusions:field.exclusions,width:1000,height:650,padding:62});
        const capture=await captureSatellite({container:hostForField?.(field),mapModel,field});
        mapAssets[field.id??field.clientFieldId]={satelliteImage:capture.dataUrl,mapAttribution:capture.attribution,satelliteOverlayMapModel:capture.overlayModel,location:fieldLocations[field.id??field.clientFieldId]};
      }

      let overview=null;
      if(preflight.overview?.enabled){
        const capture=await captureSatellite({container:hostForOverview?.()??hostForField?.(fields[0]),mapModel:buildOverviewMapModel(fields,metricsForField),cadastre:preflight.overview.cadastre});
        overview={satelliteImage:capture.dataUrl,mapAttribution:capture.attribution,cadastre:preflight.overview.cadastre};
      }
      const token=tokenFactory();
      const tokenHash=await hashToken(token);
      const acceptedAt=now().toISOString();
      const issued=await issueReport({projectId,revisionNumber,selectedFieldIds:preflight.selectedFieldIds,recipient:preflight.recipient,disclaimerVersion:DISCLAIMER_VERSION,acceptedAt,tokenHash});
      const reportId=issued?.reportId??issued?.id;
      if(!reportId)throw new Error('Il documento non è stato registrato.');
      const shareUrl=buildShareUrl(baseUrl,reportId,token);
      const qrSvg=qrRenderer(shareUrl);
      const reportState={...state,project:{...state.project,fields:ensureProjectFields(state.project).fields.map(field=>{
        const index=fields.findIndex(item=>String(item.id??item.clientFieldId)===String(field.id??field.clientFieldId));
        return index>=0&&freshSoils[index]?{...field,soil:freshSoils[index]}:field;
      })}};
      const reportModel=buildProjectReportModel({
        state:reportState,selectedFieldIds:preflight.selectedFieldIds,getMetrics:metricsForField,mapAssets,overview,recipient:preflight.recipient,
        report:{id:reportId,projectId,projectCode:state?.cloud?.publicCode,revisionNumber,generatedAt:issued?.createdAt??acceptedAt,shareUrl,qrSvg,disclaimerVersion:DISCLAIMER_VERSION}
      });
      const html=renderer(reportModel);
      return {html,model:reportModel,shareUrl,reportId,printEnabled:true,copyEnabled:true};
    }
  };
}

function readHandoff(storage){try{return JSON.parse(storage.getItem(REPORT_HANDOFF_KEY)||'null');}catch{return null;}}

export async function requestReportContext(storage,{timeoutMs=30000,requestId=null,state,refresh=false,getOwnerId=()=>state?.reportOwnerId}={}){
  if(!requestId)throw new Error('Apri il documento dal configuratore per sincronizzare questa versione.');
  const ownerId=getOwnerId();
  if(!ownerId)throw new Error('Il profilo non è disponibile. Riapri il documento dopo aver effettuato l’accesso.');
  assertReportContextScope(state,state,{ownerId});
  const initial=readHandoff(storage);
  if(initial?.requestId!==requestId)throw new Error('Questa finestra del documento non è più attiva. Riaprila dal configuratore.');
  const operationId=globalThis.crypto.randomUUID();
  storage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,operationId,status:refresh?'refresh_requested':'requested',ownerId,localProjectId:state.project.localProjectId,projectId:state.cloud?.projectId??null}));
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const handoff=readHandoff(storage);
    if(handoff?.requestId!==requestId)throw new Error('È stato aperto un altro documento. Riprova dal configuratore.');
    if(getOwnerId()!==ownerId)throw new Error('Il profilo è cambiato: riapri il documento dal profilo corretto.');
    if(handoff?.operationId!==operationId)throw new Error('È stato avviato un altro aggiornamento del documento. Riprova.');
    if(handoff?.status==='error')throw new Error(handoff.message||'Sincronizzazione non riuscita.');
    if(handoff?.status==='ready'&&handoff.projectId&&Number.isInteger(Number(handoff.revisionNumber))&&Number(handoff.revisionNumber)>0){
      if(handoff.ownerId!==ownerId||handoff.localProjectId!==state.project.localProjectId)throw new Error('Il profilo o il progetto del documento è cambiato. Riapri il documento.');
      const reportState=assertReportContextScope(state,readReportContext(storage,requestId),{ownerId});
      if(reportState.cloud?.projectId!==handoff.projectId||Number(reportState.cloud?.latestRevisionNumber)!==Number(handoff.revisionNumber))throw new Error('La revisione aggiornata non corrisponde ai dati del progetto. Riprova l’aggiornamento.');
      return {state:'synced',projectId:handoff.projectId,revisionNumber:Number(handoff.revisionNumber),reportState};
    }
    await new Promise(resolve=>setTimeout(resolve,180));
  }
  throw new Error('La sincronizzazione del progetto non è terminata. Torna al configuratore e riprova.');
}

function copyWithFallback(text,documentRef){
  if(globalThis.navigator?.clipboard?.writeText)return globalThis.navigator.clipboard.writeText(text);
  const input=documentRef.createElement('textarea');input.value=text;input.readOnly=true;documentRef.body.append(input);input.select();documentRef.execCommand?.('copy');input.remove();return Promise.resolve();
}

export async function bootReportPage({documentRef=globalThis.document,storage=globalThis.localStorage,maplibregl=globalThis.maplibregl,locationRef=globalThis.location,connectClient=connectSupabase,backendFactory=createBackend,resolveLocations=resolveFieldLocations,orchestratorFactory=createReportOrchestrator}={}){
  const root=documentRef?.querySelector?.('#report-root');if(!root)return null;
  const params=new URL(locationRef.href).searchParams;
  const mobileSource=params.get('source')==='mobile';
  if(mobileSource){
    documentRef.documentElement.dataset.reportSource='mobile';
    const printStyles=documentRef.createElement('link');printStyles.rel='stylesheet';printStyles.href='./v55.4-report-print.css?v=55.4';printStyles.media='print';documentRef.head.append(printStyles);
    const compactStyles=documentRef.createElement('link');compactStyles.rel='stylesheet';compactStyles.href='./v1.0.1-report-print.css?v=1.0.1';compactStyles.media='print';documentRef.head.append(compactStyles);
  }
  const requestId=params.get('handoff');
  const reportSnapshot=readReportContext(storage,requestId);
  let state=requestId?reportSnapshot:loadDraft(storage);
  if(!state?.project){root.innerHTML='<section class="report-card"><h1>Progetto non trovato</h1><p>Apri il Configuratore e salva prima una bozza.</p><a href="./index.html">Torna al Configuratore</a></section>';return null;}
  const client=await connectClient({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
  const identityRequests=new AbortController();
  const backend=client?bindBackendToIdentity(backendFactory(client,{requestSignal:identityRequests.signal}),identityRequests.signal):null;
  let liveOwnerId=null,identityStopped=false,onIdentityChange=()=>{};
  let profile={};
  const session=(await client?.auth?.getSession?.())?.data?.session;
  liveOwnerId=session?.user?.id??null;
  if(requestId&&state.reportOwnerId)assertReportContextScope(state,state,{ownerId:liveOwnerId||'unavailable'});
  client?.auth?.onAuthStateChange?.((_event,nextSession)=>{
    const nextOwnerId=nextSession?.user?.id??null;if(nextOwnerId===liveOwnerId)return;
    liveOwnerId=nextOwnerId;identityStopped=true;identityRequests.abort();onIdentityChange();
  });
  try{const storedProfile=liveOwnerId?await backend.getProfile(liveOwnerId):null;profile={...storedProfile,displayName:storedProfile?.display_name,email:session?.user?.email};}catch{}
  let preflight=createReportPreflight({state,profile,contact:state.contact});
  if(state.reportFieldId)preflight=updateReportPreflight(preflight,{type:'selection/set',fieldIds:[state.reportFieldId]});
  let fieldLocations=await resolveLocations(ensureProjectFields(state.project).fields);
  const options=documentRef.querySelector('#report-field-options');
  const form=documentRef.querySelector('#report-recipient-form');
  const accept=documentRef.querySelector('#report-disclaimer-accept');
  const generate=documentRef.querySelector('#report-generate');
  const print=documentRef.querySelector('#report-print');
  const copy=documentRef.querySelector('#report-copy-link');
  const printTop=documentRef.querySelector('#report-print-top'),copyTop=documentRef.querySelector('#report-copy-link-top');
  const warning=documentRef.querySelector('#report-warning');
  const preview=documentRef.querySelector('#report-preview');
  const host=documentRef.querySelector('#report-satellite-host');
  const overviewInput=documentRef.querySelector('#report-overview');
  const cadastreInput=documentRef.querySelector('#report-overview-cadastre');
  const full=documentRef.querySelector('#report-disclaimer-full');
  if(full)full.textContent='Il presente documento è uno studio preliminare ed esemplificativo di supporto alla valutazione di un possibile impianto viticolo. Non costituisce progetto tecnico firmato, rilievo topografico o catastale, pratica autorizzativa, asseverazione, direzione lavori o garanzia di realizzabilità. Prima dell’esecuzione devono essere verificati sul posto confini, quote, pendenze, vincoli, accessi, distanze, sottoservizi e prescrizioni applicabili.';
  function renderFieldOptions(){
    options.replaceChildren();
    for(const field of preflight.fieldOptions){
      const label=documentRef.createElement('label');
      const checkbox=documentRef.createElement('input');checkbox.type='checkbox';checkbox.value=field.id;checkbox.checked=preflight.selectedFieldIds.includes(field.id);checkbox.disabled=!field.valid;
      const caption=documentRef.createElement('span');caption.textContent=`${field.label}${field.valid?'':' · perimetro incompleto'}`;
      label.append(checkbox,caption);options.append(label);
    }
  }
  renderFieldOptions();
  for(const [key,value] of Object.entries(preflight.recipient)){const input=form.elements.namedItem(key);if(input)input.value=value;}
  let localityEdited=Boolean(preflight.recipient.plantLocation);
  function suggestPlantLocality(){
    if(localityEdited)return;
    const suggested=locationForSelection(preflight.selectedFieldIds,fieldLocations);
    for(const [field,value] of Object.entries(suggested)){
      if(preflight.recipient[field]===value)continue;
      preflight=updateReportPreflight(preflight,{type:'recipient/update',field,value});
      const input=form.elements.namedItem(field);if(input)input.value=value;
    }
  }
  suggestPlantLocality();
  mountReportAddressAutocomplete({documentRef,form});
  let finalResult=null,busy=false,preparedRevision=null;
  mountReportProjectContext(documentRef,state,{onRefresh:updateProjectFromPage});
  const refreshProject=documentRef.querySelector('#report-refresh-project');
  const updateStatus=documentRef.querySelector('#report-project-update-status');
  function refresh(){
    generate.disabled=busy||identityStopped||!canIssueReport(preflight)||!backend||Boolean(finalResult);
    refreshProject.disabled=busy||identityStopped||!backend||!requestId;refreshProject.setAttribute('aria-busy',String(busy));
    print.disabled=busy||identityStopped||!finalResult?.printEnabled;copy.disabled=busy||identityStopped||!finalResult?.copyEnabled;
    if(printTop)printTop.disabled=print.disabled;if(copyTop)copyTop.disabled=copy.disabled;
    for(const input of form.querySelectorAll('input'))input.disabled=busy||identityStopped;
    for(const input of options.querySelectorAll('input'))input.disabled=busy||identityStopped||!preflight.fieldOptions.find(field=>field.id===input.value)?.valid;
    accept.disabled=busy||identityStopped;overviewInput.disabled=busy||identityStopped;cadastreInput.disabled=busy||identityStopped||!overviewInput.checked;
  }
  onIdentityChange=()=>{finalResult=null;preparedRevision=null;warning.textContent='Il profilo è cambiato: riapri il documento dal profilo corretto.';warning.hidden=false;updateStatus.textContent='Aggiornamento sospeso.';refresh();};
  async function updateProjectContext(force=false){
    const revision=await requestReportContext(storage,{requestId,state,refresh:force,getOwnerId:()=>liveOwnerId});
    const nextLocations=await resolveLocations(ensureProjectFields(revision.reportState.project).fields);
    if(identityStopped)throw new Error('Il profilo è cambiato: riapri il documento dal profilo corretto.');
    assertReportContextScope(state,revision.reportState,{ownerId:liveOwnerId});
    preflight=refreshReportPreflight(preflight,revision.reportState,{previousState:state});
    state=revision.reportState;fieldLocations=nextLocations;preparedRevision=revision;finalResult=null;
    renderFieldOptions();suggestPlantLocality();accept.checked=preflight.disclaimerAccepted;
    documentRef.querySelector('#report-project-context strong').textContent=state.project.localProjectName||'Il mio impianto';
    preview.replaceChildren();const empty=documentRef.createElement('div');empty.className='report-preview-empty report-screen-only';empty.textContent='L’anteprima comparirà qui dopo la verifica dei dati.';preview.append(empty);
    return revision;
  }
  async function updateProjectFromPage(){
    if(busy||identityStopped)return;
    busy=true;warning.hidden=true;updateStatus.textContent='Aggiornamento in corso…';refresh();
    try{await updateProjectContext(true);updateStatus.textContent='Progetto aggiornato.';}
    catch(error){warning.textContent=error?.message||'Aggiornamento del progetto non riuscito.';warning.hidden=false;updateStatus.textContent='Aggiornamento non riuscito.';}
    finally{busy=false;refresh();}
  }
  options.addEventListener('change',()=>{preflight=updateReportPreflight(preflight,{type:'selection/set',fieldIds:[...options.querySelectorAll('input:checked')].map(input=>input.value)});suggestPlantLocality();accept.checked=false;finalResult=null;refresh();});
  form.addEventListener('input',event=>{if(event.target.name)preflight=updateReportPreflight(preflight,{type:'recipient/update',field:event.target.name,value:event.target.value});if(['plantLocation','province'].includes(event.target.name))localityEdited=true;accept.checked=false;finalResult=null;refresh();});
  function updateOverview(){preflight=updateReportPreflight(preflight,{type:'overview/set',enabled:overviewInput.checked,cadastre:cadastreInput.checked});cadastreInput.disabled=!overviewInput.checked;cadastreInput.checked=preflight.overview.cadastre;accept.checked=false;finalResult=null;refresh();}
  overviewInput?.addEventListener('change',updateOverview);cadastreInput?.addEventListener('change',updateOverview);
  accept.addEventListener('change',()=>{preflight=updateReportPreflight(preflight,{type:'disclaimer/set',accepted:accept.checked});if(!accept.checked)finalResult=null;refresh();});
  const orchestrator=backend?orchestratorFactory({sync:{saveRevision:async()=>{
    if(identityStopped||!preparedRevision)throw new Error('Aggiorna il progetto prima di generare il documento.');
    assertReportContextScope(state,preparedRevision.reportState,{ownerId:liveOwnerId});return preparedRevision;
  }},captureSatellite:({container,mapModel,cadastre})=>captureSatelliteImage({container,mapModel,cadastre,maplibregl}),refreshSoil:field=>refreshFieldSoilForReport(field,{signal:AbortSignal.timeout(12000)}),issueReport:payload=>backend.issueProjectReport(payload),renderer:model=>renderProjectReportHtml(model,{mobile:mobileSource})}):null;
  generate.addEventListener('click',async()=>{
    if(busy||identityStopped)return;
    busy=true;warning.hidden=true;generate.textContent='Generazione in corso…';refresh();
    try{
      await updateProjectContext();
      if(!canIssueReport(preflight))throw new Error('Il progetto è stato aggiornato. Verifica i campi e accetta nuovamente l’avvertenza prima di generare il documento.');
      const result=await orchestrator.generate({preflight,state,fieldLocations,hostForField:()=>host,baseUrl:locationRef.href});
      if(identityStopped)throw new Error('Il profilo è cambiato: riapri il documento dal profilo corretto.');
      finalResult=result;preview.innerHTML=finalResult.html;documentRef.title=buildReportPdfFilename({code:finalResult.model?.project?.code,recipient:finalResult.model?.recipient}).replace(/\.pdf$/i,'');preview.scrollIntoView({behavior:'smooth',block:'start'});
    }
    catch(error){finalResult=null;warning.textContent=error?.message||'Documento non generato.';warning.hidden=false;}
    finally{busy=false;preparedRevision=null;generate.textContent='Genera anteprima';refresh();}
  });
  print.addEventListener('click',()=>{
    if(!finalResult?.printEnabled)return;
    documentRef.title=buildReportPdfFilename({code:finalResult.model?.project?.code,recipient:finalResult.model?.recipient}).replace(/\.pdf$/i,'');
    globalThis.print?.();
  });
  copy.addEventListener('click',async()=>{if(finalResult?.shareUrl){await copyWithFallback(finalResult.shareUrl,documentRef);copy.textContent='Link copiato';setTimeout(()=>{copy.textContent='Copia link';},1600);}});
  printTop?.addEventListener('click',()=>print.click());copyTop?.addEventListener('click',()=>copy.click());
  if(identityStopped)onIdentityChange();
  refresh();return {getPreflight:()=>preflight,getState:()=>state};
}

if(typeof document!=='undefined'&&document.querySelector?.('#report-root'))bootReportPage().catch(error=>{const warning=document.querySelector('#report-warning');if(warning){warning.textContent=error.message;warning.hidden=false;}});
