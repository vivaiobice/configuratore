import { loadDraft } from './storage.js';
import { ensureProjectFields } from './fields.js?v=50';
import { calculateProject } from './project-calculator.js?v=45';
import { buildProjectReportModel } from './pdf-model.js?v=50';
import { createReportPreflight, updateReportPreflight, canIssueReport, DISCLAIMER_VERSION, resolveFieldLocations, locationForSelection } from './report-preflight.js?v=45';
import { buildReportMapModel } from './report-map-model.js?v=45';
import { captureSatelliteImage } from './report-satellite.js?v=50';
import { newReportShareToken, hashReportShareToken, buildSharedReportUrl } from './report-share.js';
import { renderReportQrSvg } from './report-qr.js';
import { renderProjectReportHtml } from './report-template.js?v=50';
import { APP_CONFIG } from './config.js';
import { connectSupabase, createBackend } from './backend.js?v=50';
import { REPORT_HANDOFF_KEY } from './report-handoff.js';
import { buildReportPdfFilename } from './report-filename.js?v=45';
import { mountReportAddressAutocomplete } from './report-address.js?v=45';

export { REPORT_HANDOFF_KEY };

function metricsForField(field){
  const exclusions=(Array.isArray(field.exclusions)?field.exclusions:[]).map(item=>Array.isArray(item)?item:item?.geometry).filter(Array.isArray);
  return calculateProject({polygon:field.geometry,exclusions,rowSpacingM:field.rowSpacingM,plantSpacingM:field.plantSpacingM,orientationDeg:field.orientationDeg,rowCurvePoints:field.rowCurvePoints,maintainRowEquidistance:field.maintainRowEquidistance!==false,postSpacingM:field.postSpacingM,headlandWidthM:field.headlandWidthM});
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
  now=()=>new Date()
}={}){
  return {
    async generate({preflight,state,hostForField,fieldLocations={},baseUrl=globalThis.location?.href??'https://vivaiobice.github.io/'}={}){
      if(!canIssueReport(preflight))throw new Error('Accetta l’avvertenza e completa i dati richiesti prima di generare il documento.');
      const fields=selectedFields(state,preflight.selectedFieldIds);
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

      const token=tokenFactory();
      const tokenHash=await hashToken(token);
      const acceptedAt=now().toISOString();
      const issued=await issueReport({projectId,revisionNumber,selectedFieldIds:preflight.selectedFieldIds,recipient:preflight.recipient,disclaimerVersion:DISCLAIMER_VERSION,acceptedAt,tokenHash});
      const reportId=issued?.reportId??issued?.id;
      if(!reportId)throw new Error('Il documento non è stato registrato.');
      const shareUrl=buildShareUrl(baseUrl,reportId,token);
      const qrSvg=qrRenderer(shareUrl);
      const reportModel=buildProjectReportModel({
        state,selectedFieldIds:preflight.selectedFieldIds,getMetrics:metricsForField,mapAssets,recipient:preflight.recipient,
        report:{id:reportId,projectId,projectCode:state?.cloud?.publicCode,revisionNumber,generatedAt:issued?.createdAt??acceptedAt,shareUrl,qrSvg,disclaimerVersion:DISCLAIMER_VERSION}
      });
      const html=renderer(reportModel);
      return {html,model:reportModel,shareUrl,reportId,printEnabled:true,copyEnabled:true};
    }
  };
}

function readHandoff(storage){try{return JSON.parse(storage.getItem(REPORT_HANDOFF_KEY)||'null');}catch{return null;}}

async function waitForReportRevision(storage,{timeoutMs=30000,requestId=null}={}){
  if(!requestId)throw new Error('Apri il documento dal configuratore per sincronizzare questa versione.');
  const initial=readHandoff(storage);
  if(initial?.requestId!==requestId||!['opened','ready'].includes(initial.status))throw new Error('Questa finestra del documento non è più attiva. Riaprila dal configuratore.');
  if(initial.status==='ready'&&initial.projectId&&Number(initial.revisionNumber)>0)return {state:'synced',projectId:initial.projectId,revisionNumber:Number(initial.revisionNumber)};
  storage.setItem(REPORT_HANDOFF_KEY,JSON.stringify({requestId,status:'requested'}));
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const handoff=readHandoff(storage);
    if(handoff?.requestId!==requestId)throw new Error('È stato aperto un altro documento. Riprova dal configuratore.');
    if(handoff?.status==='error')throw new Error(handoff.message||'Sincronizzazione non riuscita.');
    if(handoff?.status==='ready'&&handoff.projectId&&Number(handoff.revisionNumber)>0)return {state:'synced',projectId:handoff.projectId,revisionNumber:Number(handoff.revisionNumber)};
    await new Promise(resolve=>setTimeout(resolve,180));
  }
  throw new Error('La sincronizzazione del progetto non è terminata. Torna al configuratore e riprova.');
}

function copyWithFallback(text,documentRef){
  if(globalThis.navigator?.clipboard?.writeText)return globalThis.navigator.clipboard.writeText(text);
  const input=documentRef.createElement('textarea');input.value=text;input.readOnly=true;documentRef.body.append(input);input.select();documentRef.execCommand?.('copy');input.remove();return Promise.resolve();
}

export async function bootReportPage({documentRef=globalThis.document,storage=globalThis.localStorage,maplibregl=globalThis.maplibregl}={}){
  const root=documentRef?.querySelector?.('#report-root');if(!root)return null;
  let state=loadDraft(storage);
  if(!state?.project){root.innerHTML='<section class="report-card"><h1>Progetto non trovato</h1><p>Apri il Configuratore e salva prima una bozza.</p><a href="./index.html">Torna al Configuratore</a></section>';return null;}
  const client=await connectSupabase({url:APP_CONFIG.supabaseUrl,publishableKey:APP_CONFIG.supabasePublishableKey});
  const backend=client?createBackend(client):null;
  let profile={};
  try{const session=(await client?.auth?.getSession?.())?.data?.session;const storedProfile=session?.user?.id?await backend.getProfile(session.user.id):null;profile={...storedProfile,displayName:storedProfile?.display_name,email:session?.user?.email};}catch{}
  let preflight=createReportPreflight({state,profile,contact:state.contact});
  const fieldLocations=await resolveFieldLocations(ensureProjectFields(state.project).fields);
  const options=documentRef.querySelector('#report-field-options');
  const form=documentRef.querySelector('#report-recipient-form');
  const accept=documentRef.querySelector('#report-disclaimer-accept');
  const generate=documentRef.querySelector('#report-generate');
  const print=documentRef.querySelector('#report-print');
  const copy=documentRef.querySelector('#report-copy-link');
  const warning=documentRef.querySelector('#report-warning');
  const preview=documentRef.querySelector('#report-preview');
  const host=documentRef.querySelector('#report-satellite-host');
  const full=documentRef.querySelector('#report-disclaimer-full');
  if(full)full.textContent='Il presente documento è uno studio preliminare ed esemplificativo di supporto alla valutazione di un possibile impianto viticolo. Non costituisce progetto tecnico firmato, rilievo topografico o catastale, pratica autorizzativa, asseverazione, direzione lavori o garanzia di realizzabilità. Prima dell’esecuzione devono essere verificati sul posto confini, quote, pendenze, vincoli, accessi, distanze, sottoservizi e prescrizioni applicabili.';
  options.replaceChildren();
  for(const field of preflight.fieldOptions){
    const label=documentRef.createElement('label');
    const checkbox=documentRef.createElement('input');checkbox.type='checkbox';checkbox.value=field.id;checkbox.checked=preflight.selectedFieldIds.includes(field.id);checkbox.disabled=!field.valid;
    const caption=documentRef.createElement('span');caption.textContent=`${field.label}${field.valid?'':' · perimetro incompleto'}`;
    label.append(checkbox,caption);options.append(label);
  }
  for(const [key,value] of Object.entries(preflight.recipient)){const input=form.elements.namedItem(key);if(input)input.value=value;}
  let localityEdited=Boolean(preflight.recipient.plantLocation);
  function suggestPlantLocality(){
    if(localityEdited)return;
    const suggested=locationForSelection(preflight.selectedFieldIds,fieldLocations);
    for(const [field,value] of Object.entries(suggested)){
      preflight=updateReportPreflight(preflight,{type:'recipient/update',field,value});
      const input=form.elements.namedItem(field);if(input)input.value=value;
    }
  }
  suggestPlantLocality();
  mountReportAddressAutocomplete({documentRef,form});
  let finalResult=null;
  function refresh(){generate.disabled=!canIssueReport(preflight)||!backend||Boolean(finalResult);print.disabled=!finalResult?.printEnabled;copy.disabled=!finalResult?.copyEnabled;}
  options.addEventListener('change',()=>{preflight=updateReportPreflight(preflight,{type:'selection/set',fieldIds:[...options.querySelectorAll('input:checked')].map(input=>input.value)});suggestPlantLocality();accept.checked=false;finalResult=null;refresh();});
  form.addEventListener('input',event=>{if(event.target.name)preflight=updateReportPreflight(preflight,{type:'recipient/update',field:event.target.name,value:event.target.value});if(['plantLocation','province'].includes(event.target.name))localityEdited=true;accept.checked=false;finalResult=null;refresh();});
  accept.addEventListener('change',()=>{preflight=updateReportPreflight(preflight,{type:'disclaimer/set',accepted:accept.checked});if(!accept.checked)finalResult=null;refresh();});
  const requestId=new URL(globalThis.location.href).searchParams.get('handoff');
  const orchestrator=backend?createReportOrchestrator({sync:{saveRevision:()=>waitForReportRevision(storage,{requestId})},captureSatellite:({container,mapModel})=>captureSatelliteImage({container,mapModel,maplibregl}),issueReport:payload=>backend.issueProjectReport(payload)}):null;
  generate.addEventListener('click',async()=>{
    warning.hidden=true;generate.disabled=true;generate.textContent='Generazione in corso…';
    try{state=loadDraft(storage);finalResult=await orchestrator.generate({preflight,state,fieldLocations,hostForField:()=>host,baseUrl:globalThis.location.href});preview.innerHTML=finalResult.html;documentRef.title=buildReportPdfFilename({code:finalResult.model?.project?.code,recipient:finalResult.model?.recipient}).replace(/\.pdf$/i,'');preview.scrollIntoView({behavior:'smooth',block:'start'});}
    catch(error){finalResult=null;warning.textContent=error?.message||'Documento non generato.';warning.hidden=false;}
    finally{generate.textContent='Genera anteprima';refresh();}
  });
  print.addEventListener('click',()=>{
    if(!finalResult?.printEnabled)return;
    documentRef.title=buildReportPdfFilename({code:finalResult.model?.project?.code,recipient:finalResult.model?.recipient}).replace(/\.pdf$/i,'');
    globalThis.print?.();
  });
  copy.addEventListener('click',async()=>{if(finalResult?.shareUrl){await copyWithFallback(finalResult.shareUrl,documentRef);copy.textContent='Link copiato';setTimeout(()=>{copy.textContent='Copia link';},1600);}});
  refresh();return {getPreflight:()=>preflight};
}

if(typeof document!=='undefined'&&document.querySelector?.('#report-root'))bootReportPage().catch(error=>{const warning=document.querySelector('#report-warning');if(warning){warning.textContent=error.message;warning.hidden=false;}});
