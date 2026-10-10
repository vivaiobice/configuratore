import {terrainUsesCertifiedQuantities,terrainQuantityBasisText} from './terrain-report-summary.js?v=1.3.7';
// Candidate acquisition and solver output never mutate the live project.
import {rowPortionEditorState} from './row-portion-editor.js?v=1.3.7';
import {attachTerrainRestore,terrainRestoreAvailability,assertTerrainRestoreHistory,assertNativeTerrainCutAttachment as verifyNativeAttachment} from './terrain-history.js?v=1.3.7';
import {terrainGeometryInputHash,readTerrainEnvelope} from './terrain-replay.js?v=1.3.7';
import {terrainInputHash} from './terrain-model.js?v=1.3.7';
import {assertTerrainSerializationBudget} from './terrain-serialization.js?v=1.3.7';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.7';
import {chargeTerrainOperationCopy} from './terrain-worker-client.js?v=1.3.7';
import {hasTerrainCutConvergence} from './terrain-cut-candidates.js?v=1.3.7';
import {TERRAIN_CONTOUR_ALGORITHM_VERSION,TERRAIN_OPERATION_CAP_MS,TERRAIN_PORTION_GEOMETRY_KEYS,TERRAIN_EXCLUSION_GEOMETRY_KEYS} from './terrain-contour-contracts.js?v=1.3.7';
export function terrainPortionEditorState(project,activeId,result){
 return rowPortionEditorState(project,activeId,result?.terrainStatus==='invalid'?null:result?.portions);
}
export function terrainContextKey(context,project){
 try{return JSON.stringify([context,terrainGeometryInputHash(project??{},{contentHash:project?.terrain?.model?.contentHash})]);}
 catch{
  // Invalid/incomplete editor numbers cannot be certified, but rendering and
  // cancellation still need a raw input identity without throwing on NaN.
  const select=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
  return JSON.stringify([context,'invalid-inputs',project?.polygon??project?.geometry,...['rowSpacingM','plantSpacingM','postSpacingM','headlandWidthM','orientationDeg','rowCurvePoints','maintainRowEquidistance'].map(key=>project?.[key]),project?.rowPortions?.map(p=>select(p,TERRAIN_PORTION_GEOMETRY_KEYS)),project?.exclusions?.map(e=>Array.isArray(e)?e:select(e,TERRAIN_EXCLUSION_GEOMETRY_KEYS)),project?.terrain?.model?.contentHash]);
 }
}
const clone=value=>structuredClone(value);
function proposalPatch(proposal,draft){
 const patch={...clone(draft??{}),...clone(proposal.projectPatch??{})};
 for(const name of ['terrain','rowPortions'])if(Object.hasOwn(proposal,name)&&proposal[name]!==undefined)patch[name]=clone(proposal[name]);
 return patch;
}
function proposalProject(project,proposal){
 const keys=proposal.removeProjectKeys;
 if(Object.hasOwn(proposal,'removeProjectKeys')&&(!Array.isArray(keys)||new Set(keys).size!==keys.length||keys.some(key=>key!=='rowPortions')))throw new Error('Rimozione del progetto non valida.');
 const candidate={...clone(project),...proposalPatch(proposal)};
 for(const key of keys??[])delete candidate[key];
 if(Array.isArray(candidate.fields))candidate.fields=candidate.fields.map(field=>{
  if(field.id!==candidate.activeFieldId)return field;
  const active={...field,...proposalPatch(proposal)};for(const key of keys??[])delete active[key];return active;
 });
 return candidate;
}
function nativeCutPatch(proposal){
 const patch=proposal.projectPatch;
 if(!patch||Object.keys(patch).some(key=>!['terrain','rowPortions','exclusions'].includes(key))||Object.hasOwn(proposal,'removeProjectKeys'))throw Object.assign(new Error('Modifiche del passaggio non valide.'),{status:'invalid-history'});
 return {...patch,terrain:proposal.terrain,rowPortions:proposal.rowPortions};
}
function nativeCutProject(project,proposal){
 const patch=nativeCutPatch(proposal),candidate={...project,...patch};
 if(Array.isArray(project.fields)){
  if(project.fields.filter(field=>field.id===project.activeFieldId).length!==1)throw Object.assign(new Error('Campo attivo non univoco.'),{status:'invalid-history'});
  candidate.fields=project.fields.map(field=>field.id===project.activeFieldId?{...field,...patch}:field);
 }
 return candidate;
}
const nativeCutProposal=proposal=>proposal?.kind==='cut'&&(Object.hasOwn(proposal,'cutOperation')||(proposal.projectPatch?.exclusions??[]).some(member=>member?.surfaceGroupVersion!==undefined)||(proposal.rowPortions??[]).some(portion=>portion.terrainScopeRecipe));
// Both histories have already passed the existing readonly assertion. This
// transition belongs only to the actual consumed native baseline, never to a
// first remaining portion or a caller-selected ID in a proposal. A tagged
// nullable selection distinguishes the disabled default editor from no transition.
function nativeRestoredSelection(project,effective,proposal,selected){
 if(proposal.kind!=='restore'||typeof selected!=='string')return null;
 const live=project.terrain?.history?.entries??[],remaining=effective.terrain?.history?.entries??[];
 const owned=live.filter(entry=>entry.kind==='cut'&&entry.before?.cut?.protocolVersion===1&&entry.affectedIds.includes(selected));
 if(owned.length!==1)return null;
 const entry=owned[0],cut=entry.before.cut,sourceId=cut.sourceId;
 if(!cut.beforePortionIds.includes(sourceId)||!cut.afterPortionIds.includes(selected)||selected!==sourceId&&cut.beforePortionIds.includes(selected))return null;
 const restored=live.filter(saved=>saved!==entry);
 if(remaining.length!==restored.length||remaining.some((saved,index)=>saved.operationId!==restored[index].operationId||saved.baselineHash!==restored[index].baselineHash))return null;
 if(entry.before.source.referencePortions.filter(portion=>portion.id===sourceId).length!==1||project.rowPortions?.filter(portion=>portion.id===selected).length!==1||project.rowPortions?.filter(portion=>portion.id===sourceId).length!==1)return null;
 if(selected!==sourceId&&effective.rowPortions?.some(portion=>portion.id===selected))return null;
 const editor=terrainPortionEditorState(effective,sourceId,effective.terrain?.applied?.result);
 if(effective.rowPortions?.filter(portion=>portion.id===sourceId).length===1)return selected!==sourceId&&editor.active?.id===sourceId?{selection:sourceId}:null;
 const source=entry.before.source;
 if(source.rowPortionsPresence==='missing'?Object.hasOwn(effective,'rowPortions'):source.rowPortionsPresence!=='empty'||!Array.isArray(effective.rowPortions)||effective.rowPortions.length)return null;
 if(source.portions.length||editor.enabled||editor.active||editor.portions.length!==1||editor.portions[0].id!==sourceId)return null;
 return {selection:null};
}
function validateCandidate(project,proposal){
 assertTerrainRestoreHistory({project});
 if(readTerrainEnvelope(project)?.terrainStatus!=='applied')throw new Error('La proposta non corrisponde agli input del progetto.');
 if(Object.hasOwn(proposal,'result')&&terrainInputHash(proposal.result)!==terrainInputHash(project.terrain.applied.result))throw new Error('Le quantità della proposta non corrispondono al disegno.');
 assertTerrainSerializationBudget(project);
}
const defaultLoad=async options=>(await import('./terrain-provider.js?v=1.3.7')).loadTerrainForField(options);
const defaultRun=async(options,control)=>(await import('./terrain-worker-client.js?v=1.3.7')).runTerrainProposal(options,control);
const defaultSummary=async model=>(await import('./terrain-model.js?v=1.3.7')).terrainSummary(model);
const defaultCoverage=async(model,polygon)=>{const {sampleTerrain}=await import('./terrain-model.js?v=1.3.7');return Array.isArray(polygon)&&polygon.every(point=>sampleTerrain(model,point)!=null);};
const defaultView=async options=>(await import('./terrain-map.js?v=1.3.7')).createTerrainMapView(options);
const quantity=value=>Number.isFinite(value)?value.toLocaleString('it-IT',{maximumFractionDigits:1}):'—';
export function createTerrainController({document,getProject,getContext,getPortionId=()=>null,getMapApi=()=>null,getResult=()=>null,getCheckpointSnapshot,applyProposal,onStatus=()=>{},onProposalChange=()=>{},onStateChange=()=>{},onBudgetUsage=()=>{},loadTerrain=defaultLoad,runProposal=defaultRun,summarize=defaultSummary,covers=defaultCoverage,createMapView=defaultView}){
 const card=document.querySelector('#terrain-card');
 let key=null,model=null,proposal=null,summary=null,status='Disegna e conferma il perimetro per acquisire il terreno.',busy=false,destroyed=false,abort=null,operation=0,view=null,in3D=false,inflight=null,proposalKey=null,proposalRequest=0,projectPatchDraft=null,viewOpening=false,viewOperation=0;
 let mode='terrain',progress=null,lastProposalOutcome=null,statusKind='unavailable',proposalHistory=null,proposalPortion=null,proposalMode=null,progressCurrent=()=>false,applying=null,nativePreview=null,cutFailure=null;
 const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;};
 const currentKey=()=>terrainContextKey(getContext(),getProject());
 const reportBudget=(phase,value)=>{try{onBudgetUsage(Object.freeze({phase,...value}));}catch{}};
 const valid=(captured,sequence)=>!destroyed&&currentKey()===captured&&operation===sequence;
 function close3D(){viewOperation++;viewOpening=false;const hadView=in3D||view;view?.close();view?.destroy();view=null;in3D=false;if(hadView)getMapApi()?.setRows?.(getResult()?.rows??[]);render();}
 function invalidate(){operation++;proposalRequest++;projectPatchDraft=null;progress=null;lastProposalOutcome=null;cutFailure=null;abort?.abort();abort=null;inflight=null;close3D();model=null;summary=null;proposal=null;nativePreview=null;proposalKey=null;busy=false;onProposalChange(null);}
 function setStatus(message,kind=statusKind){status=message;statusKind=kind;onStatus(message);render();}
 function action(label,name,fn,disabled=false){const b=node('button',label);b.type='button';b.dataset.terrain=name;b.disabled=disabled;b.addEventListener('click',fn);return b;}
 const available=()=>Boolean(!destroyed&&getProject()?.geometry&&getContext()?.fieldId!=null);
 const selectedPortion=()=>getPortionId()??getResult()?.portions?.[0]?.id??getProject()?.terrain?.applied?.result?.portions?.[0]?.id??null;
 const historyKey=()=>{try{return assertTerrainRestoreHistory({project:getProject()});}catch{return null;}};
 const targetKey=()=>JSON.stringify([currentKey(),selectedPortion(),historyKey()]);
 const proposalCurrent=()=>!destroyed&&proposal&&currentKey()===proposalKey&&historyKey()===proposalHistory&&selectedPortion()===proposalPortion&&mode===proposalMode;
 const visibleProposal=()=>proposalCurrent()?proposal:null;
 const expectedPromotion=()=>Boolean(applying&&proposal===applying.proposal&&proposalRequest===applying.request&&operation===applying.sequence&&mode===applying.mode&&getPortionId()===applying.selection&&JSON.stringify(getContext())===applying.identity&&currentKey()===applying.key&&historyKey()===applying.history);
 const isTargetCurrent=target=>!destroyed&&typeof target?.portionId==='string'&&target.portionId.length>0&&target.portionId===selectedPortion()&&target.contextKey===targetKey();
 function assertNativeSnapshot(candidateProject,budget){
  budget.check();
  if(typeof getCheckpointSnapshot!=='function')throw Object.assign(new Error('Verifica del salvataggio del progetto non disponibile.'),{status:'checkpoint-unavailable'});
  const snapshot=getCheckpointSnapshot(candidateProject);
  if(!snapshot||typeof snapshot!=='object')throw Object.assign(new Error('Verifica del salvataggio del progetto non valida.'),{status:'checkpoint-unavailable'});
  assertTerrainSerializationBudget(snapshot);budget.check();
 }
 const getState=()=>{
  const portionId=selectedPortion(),restoreAvailability=terrainRestoreAvailability({project:getProject(),portionId});
  const currentProposal=visibleProposal(),current=progressCurrent(),actualDesign=(currentProposal?.rowPortions??getProject()?.rowPortions??[]).find(p=>p.id===portionId)?.terrainDesign;
  let validInputs=false,inputHash;try{inputHash=terrainGeometryInputHash(getProject(),model??{});validInputs=true;}catch{}
  const canAdapt=Boolean(validInputs&&available()&&model&&currentKey()===key&&!busy&&!currentProposal&&historyKey()!==null);
  // Only this request's current failed family may localize a heuristic SEARCH.
  // The numerical producer still constructs every candidate and proof anew.
  const canSuggestCut=Boolean(canAdapt&&current&&mode==='terrain'&&!in3D&&!viewOpening&&cutFailure?.outcome===lastProposalOutcome&&lastProposalOutcome?.ok===false&&lastProposalOutcome.kind==='adapt'&&lastProposalOutcome.status==='review-required'&&cutFailure.modelHash===model.contentHash&&cutFailure.inputHash===inputHash&&hasTerrainCutConvergence({diagnostics:lastProposalOutcome.diagnostics,portionId,model}));
  return {model,proposal:currentProposal,projectPatch:proposal&&!currentProposal?null:projectPatchDraft,busy,in3D,viewOpening,status,statusKind,available:available(),mode,requestedMode:mode,actualMode:actualDesign?.mode==='adapt'?'terrain':'manual',portionId,contextKey:targetKey(),progress:current?progress:null,restoreAvailability,lastProposalOutcome:current||lastProposalOutcome?.status==='cancelled'?lastProposalOutcome:null,canAdapt,canSuggestCut,canApply:Boolean(!busy&&currentProposal)};
 };
 function render(){
  const currentProposal=visibleProposal();onStateChange(getState());
  if(!card||destroyed)return;card.replaceChildren();card.classList.add('terrain-card');
  const heading=node('div',null,'terrain-heading');heading.append(node('h3','Terreno'));
  const state=node('span',currentProposal?'Anteprima':getResult()?.terrainStatus==='invalid'?'Da rivedere':getProject()?.terrain?'Applicato':'Altimetria automatica','terrain-badge');heading.append(state);card.append(heading);
  if(getResult()?.terrainStatus==='invalid')card.append(node('p','Il disegno sul terreno non corrisponde agli input. Prepara e applica una nuova proposta.','terrain-scope'));
  const message=node('p',status,'terrain-status');message.setAttribute('role','status');card.append(message);
  const displayedMetrics=currentProposal?.result??getResult();
  if(displayedMetrics?.terrainStatus!=='invalid'&&terrainUsesCertifiedQuantities(displayedMetrics))card.append(node('p',`${terrainQuantityBasisText(displayedMetrics)} · Lunghezze sul terreno misurate`,'terrain-metrics terrain-quantity-basis'));
  if(model){
   const info=node('details',null,'terrain-source');info.append(node('summary',`Fonte: ${model.source?.label??'Modello del terreno'}`));
   const s=model.source??{};info.append(node('p',[s.label,s.resolutionM!=null?`Risoluzione ${s.resolutionM} m`:null,s.surveyEpoch?`Rilievo ${s.surveyEpoch}`:null,s.release?`Rilascio ${s.release}`:null,s.citation,s.license].filter(Boolean).join(' · ')));
   if(s.url&&/^https:\/\//.test(s.url)){const link=node('a','Informazioni sulla fonte');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';info.append(link);}
   card.append(info);
   if(summary?.valid){card.append(node('p',`Dislivello ${quantity(summary.rangeM)} m${Number.isFinite(summary.maxSlopePercent)?` · Pendenza massima ${quantity(summary.maxSlopePercent)}%`:''}`,'terrain-metrics'));}
   const actions=node('div',null,'terrain-actions');actions.append(action('Segui il terreno','follow',()=>void propose({mode:'terrain'}),busy));
   card.append(actions);
  }
  if(currentProposal){
   card.append(node('p',getProject()?.terrain?(currentProposal.scope==='field'?'Aggiornamento di tutto il campo.':'Proposta per la porzione selezionata.'):'Prima applicazione: conversione di tutto il campo.','terrain-scope'));
   const changes=Array.isArray(currentProposal.changes)?currentProposal.changes:[];
   const separateGround=terrainUsesCertifiedQuantities(currentProposal.beforeTotals)||terrainUsesCertifiedQuantities(currentProposal.result)||changes.some(change=>terrainUsesCertifiedQuantities(change.before)||terrainUsesCertifiedQuantities(change.after));
   const reviewMetrics=['rowCount','rowLinearM',...(separateGround?['surfaceRowLinearM']:[]),'simulatedPlants','totalPosts'];
   const table=node('table',null,'terrain-review');const caption=node('caption','Quantità prima → dopo');table.append(caption);
   const header=node('tr');['Porzione','Filari/tratti',separateGround?'Metri per quantità':'Metri',...(separateGround?['Metri sul terreno']:[]),'Piante','Pali'].forEach(text=>header.append(node('th',text)));const thead=node('thead');thead.append(header);table.append(thead);
   const body=node('tbody');
   for(const change of changes){const tr=node('tr');tr.append(node('th',change.label??currentProposal.rowPortions?.find(portion=>portion.id===change.portionId)?.label??change.portionId??'Campo'));for(const metric of reviewMetrics)tr.append(node('td',`${quantity(change.before?.[metric])} → ${quantity(change.after?.[metric])}`));body.append(tr);}
   const total=node('tr');total.className='terrain-review-total';total.append(node('th','Campo intero'));for(const metric of reviewMetrics)total.append(node('td',`${quantity(currentProposal.beforeTotals?.[metric])} → ${quantity(currentProposal.result?.[metric])}`));body.append(total);table.append(body);const scroll=node('div',null,'terrain-review-scroll');scroll.append(table);card.append(scroll);
   const actions=node('div',null,'terrain-actions');actions.append(action('Applica','apply',()=>void apply(),busy),action('Annulla','cancel',cancel,busy));card.append(actions);
  }
  if(!busy&&getProject()?.geometry&&(!model||(!currentProposal&&status.startsWith('Disegno'))))card.append(action('Riprova','retry',()=>void retry()));
  if(in3D)card.append(node('p',`${currentProposal?'Anteprima · ':''}Vista 3D approssimata · altezza reale ×1. Torna in 2D prima di modificare.`,'terrain-approximation'));
 }
 async function acquire(force=false){
  const captured=key,sequence=++operation;abort?.abort();abort=new AbortController();busy=true;setStatus('Acquisizione altimetria…');
  const discard=()=>{if(!destroyed&&operation===sequence){busy=false;render();}};
  try{
   let frozen=!force&&getProject()?.terrain?.model;
   if(frozen&&!(await covers(frozen,getProject().geometry)))frozen=null;
   if(!valid(captured,sequence)){discard();return;}
   const candidate=frozen||await loadTerrain({polygon:getProject().geometry,signal:abort.signal});
   const details=await summarize(candidate);if(!valid(captured,sequence)){discard();return;}
   if(!details?.valid)throw new Error('Modello del terreno non valido.');model=candidate;summary=details;busy=false;setStatus(frozen?'Terreno congelato disponibile.':'Terreno disponibile. La proposta si salva solo con Applica.');
  }catch(error){if(!valid(captured,sequence)){discard();return;}busy=false;setStatus(error?.name==='AbortError'?'Operazione annullata.':`Terreno non disponibile. ${error.message??''}`,error?.name==='AbortError'?'cancelled':'unavailable');}
 }
 async function refresh(){
  if(destroyed)return;const next=currentKey(),promotion=expectedPromotion();
  if(next!==key){
   if(!promotion)invalidate();key=next;if(!getProject()?.geometry){setStatus('Disegna e conferma il perimetro per acquisire il terreno.');return;}
  }else if(proposal&&!visibleProposal()&&!promotion){
   // History and target are deliberately outside the model acquisition key.
   // Settle obsolete preview ownership without discarding a valid frozen model.
   proposalRequest++;operation++;abort?.abort();proposal=null;nativePreview=null;proposalKey=null;projectPatchDraft=null;progress=null;lastProposalOutcome=null;busy=false;
   close3D();
   onProposalChange(null);setStatus('Il contesto del progetto è cambiato.','unavailable');
  }
  if(!model&&!inflight){const task=acquire().finally(()=>{if(inflight===task)inflight=null;});inflight=task;}render();return inflight;
 }
 async function retry(){invalidate();key=currentKey();if(!getProject()?.geometry)return;const task=acquire(true).finally(()=>{if(inflight===task)inflight=null;});inflight=task;return task;}
 function setMode(next){
  if(!['manual','terrain'].includes(next))throw new RangeError('Modalità del terreno non valida.');
  if(destroyed||next===mode)return;
  cancel();mode=next;render();
 }
 async function propose(options={},control={}){
  if(control.signal?.aborted)return null;
  if(options.kind==='cut'){
   if(Object.hasOwn(options,'project')||Object.hasOwn(options,'projectPatch')||!['suggest','endpoint'].includes(options.cutRequest?.action)||options.cutRequest.action==='suggest'&&options.portionId!==undefined&&options.portionId!==selectedPortion()||options.target!==undefined&&!isTargetCurrent(options.target))return {ok:false,status:'invalid-input',kind:'cut',message:'La richiesta non corrisponde al progetto corrente.'};
   return prepareProposal({...options,kind:'cut'},control);
  }
  const nextMode=options.mode??(options.followTerrain===false?'manual':mode);
  if(!['manual','terrain'].includes(nextMode))throw new RangeError('Modalità del terreno non valida.');
  if(nextMode!==mode)setMode(nextMode);
  return prepareProposal({...options,kind:nextMode==='manual'?'measure':'adapt'},control);
 }
 async function restore(){
  const availability=terrainRestoreAvailability({project:getProject(),portionId:selectedPortion()});
  if(!availability.available){lastProposalOutcome={ok:false,kind:'restore',status:availability.reason==='restore-conflict'?'restore-conflict':'unavailable'};setStatus('Ripristino non disponibile per questa porzione.',lastProposalOutcome.status);return null;}
  return prepareProposal({kind:'restore',portionId:selectedPortion()});
 }
 async function suggestCut(target){
  if(!isTargetCurrent(target)||!getState().canSuggestCut)return null;
  return propose({kind:'cut',portionId:target.portionId,cutRequest:{action:'suggest'},diagnostics:lastProposalOutcome.diagnostics,target});
 }
 async function prepareProposal({project=getProject(),projectPatch=null,portionId=selectedPortion(),kind,recomputeAll=false,cutRequest,diagnostics,noCutProposal}={}, {signal}={}){
  if(destroyed||!available()||signal?.aborted)return null;
  // Bind live identity/history independently of an immutable editor draft.
  const captured=currentKey(),selected=selectedPortion(),capturedMode=mode,nativeCut=kind==='cut';
  let baseline,draftProject,draft,captureBudget,nativeRequest;
  try{
   if(nativeCut){
    captureBudget=createTerrainBudget({kind:'cut'});
    // The solver owns the genuine active project only. Foreign field models
    // remain in the live checkpoint state and are never copied to its worker.
    const {fields,...activeProject}=getProject();
    const source={project:activeProject,cutRequest,diagnostics,noCutProposal};
    chargeTerrainOperationCopy(source,captureBudget);nativeRequest=clone(source);
    baseline=nativeRequest.project;draftProject=baseline;draft=null;
   }else{baseline=clone(getProject());draftProject=clone(project);draft=clone(projectPatch);}
  }catch(error){lastProposalOutcome={ok:false,kind,status:error.status??'invalid-input'};setStatus('La richiesta di calcolo non è disponibile.',lastProposalOutcome.status);return null;}
  let capturedHistory;
  try{capturedHistory=assertTerrainRestoreHistory({project:baseline,...(nativeCut?{budget:captureBudget}:{})});}catch(error){lastProposalOutcome={ok:false,kind,status:error.status??'invalid-history'};setStatus('La storia del progetto non è valida.','unavailable');return null;}
  const currentMetrics=getResult();
  const beforeTotals=currentMetrics&&currentMetrics.terrainStatus!=='invalid'?Object.fromEntries(['rowCount','rowLinearM','surfaceRowLinearM','quantityBasis','simulatedPlants','totalPosts'].map(metric=>[metric,currentMetrics[metric]])):null;
  // Supersede a worker, but keep a shared pending acquisition alive.
  if(model)abort?.abort();
  const loading=refresh(),request=++proposalRequest;
  const externalAbort=()=>{if(!destroyed&&request===proposalRequest)cancel();};
  let listening=Boolean(signal);
  const releaseExternal=()=>{if(listening){listening=false;signal.removeEventListener('abort',externalAbort);}};
  signal?.addEventListener('abort',externalAbort,{once:true});
  if(signal?.aborted)externalAbort();
  const previousProposal=proposal;
  proposal=null;nativePreview=null;proposalKey=null;projectPatchDraft=draft;progress=null;lastProposalOutcome=null;cutFailure=null;
  if(previousProposal)onProposalChange(null);
  const sameInputs=()=>!destroyed&&request===proposalRequest&&currentKey()===captured&&selectedPortion()===selected&&mode===capturedMode&&historyKey()===capturedHistory;
  try{
  await loading;
  if(!sameInputs()||!model)return null;
  if(getResult()?.terrainStatus==='invalid')recomputeAll=true;
  const scope=!draftProject.terrain||recomputeAll||portionId==null||draftProject.terrain.model?.contentHash!==model.contentHash?'field':'portion';
  close3D();const sequence=++operation;abort?.abort();abort=new AbortController();busy=true;
  const current=()=>sameInputs()&&operation===sequence;
  progressCurrent=current;
  const discard=()=>{if(request===proposalRequest&&operation===sequence){busy=false;progress=null;lastProposalOutcome=null;render();}return null;};
  const operationId=globalThis.crypto?.randomUUID?.()??`terrain-${Date.now()}-${sequence}-${request}`;
  setStatus('Calcolo del disegno sul terreno…','unavailable');
  try{
   if(!current())return discard();
   let requestModel,accounting,accountingReceivedAt;
   let complete,nativePrepared;
   if(nativeCut){
    if(baseline.terrain?.model?.contentHash===model.contentHash)requestModel=baseline.terrain.model;
    else{chargeTerrainOperationCopy(model,captureBudget);requestModel=clone(model);}
    captureBudget.check();
   }else requestModel=clone(model);
   const result=await runProposal({project:draftProject,model:requestModel,portionId,recomputeAll,followTerrain:kind==='adapt',...(kind==='measure'?{manualGroundSpacing:true}:{}),algorithmVersion:TERRAIN_CONTOUR_ALGORITHM_VERSION,kind,mode:kind,operationId,deadlineMs:nativeCut?captureBudget.remainingMs():TERRAIN_OPERATION_CAP_MS[kind],...(nativeCut?{initialNodeCount:captureBudget.usage().nodeCount,...Object.fromEntries(['cutRequest','diagnostics','noCutProposal'].filter(key=>nativeRequest[key]!==undefined).map(key=>[key,nativeRequest[key]]))}:{})},{signal:abort.signal,onProgress:value=>{if(current()){progress=clone(value);render();}},...(nativeCut?{onBudgetUsage:value=>{accounting=value;accountingReceivedAt=performance.now();reportBudget('worker-result',value);}}:{})});
   if(!current())return discard();
   if(!result?.ok){
    busy=false;lastProposalOutcome=clone(result??{ok:false,status:'unavailable',kind});
    if(kind==='adapt'&&result?.ok===false&&result.kind==='adapt'&&result.status==='review-required')cutFailure={outcome:lastProposalOutcome,modelHash:requestModel.contentHash,inputHash:terrainGeometryInputHash(draftProject,requestModel)};
    setStatus(`Disegno da rivedere. ${result?.message??result?.status??'Proposta non validabile.'}`,['budget-exceeded','timeout','ground-spacing-unsupported'].includes(result?.status)?result.status:result?.status==='restore-conflict'?'restore-conflict':'incompatible');return result;
   }
   if(nativeCut){
    if(!accounting||!Number.isSafeInteger(accounting.nodeCount)||accounting.nodeCount<0||!Number.isFinite(accounting.remainingMs)||!Number.isFinite(accountingReceivedAt))throw Object.assign(new Error('Contabilità del calcolo non valida.'),{status:'invalid-transport'});
    const continuation=createTerrainBudget({kind:'cut',initialNodeCount:accounting.nodeCount,deadlineMs:Math.max(0,accounting.remainingMs-(performance.now()-accountingReceivedAt))});
    continuation.check();
    const checked=verifyNativeAttachment({project:baseline,proposal:result,operationId,budget:continuation});
    // Reuse the actual validator replay. No second attachment, reconstruction,
    // or model clone is needed to compose the readonly preview.
    complete={...result,result:checked.result,scope,beforeTotals,projectPatch:nativeCutPatch(result)};
    assertNativeSnapshot(nativeCutProject(getProject(),complete),continuation);
    reportBudget('parent-preview',continuation.usage());continuation.check();
    nativePrepared={proposal:complete,baseline,operationId,history:checked.historyFingerprint};
   }else{
    complete={...clone(result),kind,scope,beforeTotals,projectPatch:proposalPatch(result,draft)};
    if(kind!=='restore')complete=attachTerrainRestore({project:baseline,proposal:complete,operationId});
    // Attachment updates the authoritative terrain alias. Publish one composed
    // patch, including history, to both the editor and the eventual checkpoint.
    complete.projectPatch=proposalPatch(complete);
    validateCandidate(proposalProject(baseline,complete),complete);
   }
   if(!current())return discard();
   proposal=complete;nativePreview=nativePrepared??null;proposalKey=captured;proposalHistory=capturedHistory;proposalPortion=selected;proposalMode=capturedMode;projectPatchDraft=complete.projectPatch;busy=false;lastProposalOutcome=complete;
   releaseExternal();onProposalChange(proposal);setStatus('Anteprima pronta. Controlla le quantità e scegli Applica.','ready');return proposal;
  }catch(error){if(!current())return discard();busy=false;lastProposalOutcome={ok:false,kind,status:error?.name==='AbortError'?'cancelled':error.status??'error',...(error.budgetReason?{budgetReason:error.budgetReason}: {})};setStatus(`Disegno da rivedere. ${error.message??'Calcolo non disponibile.'}`,lastProposalOutcome.status==='cancelled'?'cancelled':lastProposalOutcome.status==='budget-exceeded'?'budget-exceeded':'error');return null;}
  }finally{releaseExternal();}
 }
 async function apply({signal}={}){
  if(busy||!proposalCurrent()||signal?.aborted)return false;
  const pending=proposal,request=proposalRequest,sequence=operation,identity=JSON.stringify(getContext()),context={...clone(getContext()),terrainContextKey:proposalKey,terrainHistoryFingerprint:proposalHistory};
  const native=nativePreview?.proposal===pending?nativePreview:null,applyBudget=native?createTerrainBudget({kind:'cut'}):null;
  const capturedKey=proposalKey,capturedHistory=proposalHistory,capturedPortion=proposalPortion,rawSelection=getPortionId(),effective=native?nativeCutProject(getProject(),pending):proposalProject(getProject(),pending);
  const effectiveHistory=assertTerrainRestoreHistory({project:effective,...(native?{budget:applyBudget}:{})});
  const restoredSelection=nativeRestoredSelection(getProject(),effective,pending,capturedPortion);
  const nextSelection=native&&pending.cutOperation.beforePortionIds.includes(capturedPortion)&&!pending.cutOperation.afterPortionIds.includes(capturedPortion)?pending.cutOperation.scopePortionId:restoredSelection?restoredSelection.selection:rawSelection;
  const token={proposal:pending,request,sequence,identity,mode:proposalMode,selection:nextSelection,key:terrainContextKey(getContext(),effective),history:effectiveHistory};applying=token;
  if(native)Object.assign(context,{terrainApplyBudget:applyBudget,terrainOperationId:native.operationId,terrainSelectedPortionId:capturedPortion,terrainNextPortionId:nextSelection});
  else if(restoredSelection!==null)context.terrainNextPortionId=restoredSelection.selection;
  if(signal)context.signal=signal;
  const promotedPair=()=>currentKey()===token.key&&historyKey()===token.history;
  const ownsCompletion=()=>!destroyed&&proposal===pending&&proposalRequest===request&&operation===sequence&&((currentKey()===capturedKey&&historyKey()===capturedHistory)||promotedPair())&&(selectedPortion()===capturedPortion||getPortionId()===token.selection&&promotedPair())&&mode===token.mode&&JSON.stringify(getContext())===identity;
  const discard=()=>{if(!destroyed&&proposal===pending&&proposalRequest===request&&operation===sequence){busy=false;proposal=null;nativePreview=null;proposalKey=null;projectPatchDraft=null;progress=null;lastProposalOutcome=null;onProposalChange(null);render();}return false;};
  busy=true;setStatus('Salvataggio del progetto…','saving');
  try{
   if(native)assertNativeSnapshot(effective,applyBudget);
   if(signal?.aborted)throw new DOMException('Operazione annullata.','AbortError');
   const saved=await applyProposal(pending,context);if(saved===false)throw new Error('checkpoint');
   // Save/recalculate may legitimately change input/history hashes; ownership
   // and identity still prevent an older completion clearing a newer preview.
   if(!ownsCompletion())return discard();
   close3D();proposal=null;nativePreview=null;proposalKey=null;projectPatchDraft=null;progress=null;busy=false;key=null;onProposalChange(null);
   const completionKey=currentKey(),completionHistory=historyKey(),loading=refresh(),completionRequest=proposalRequest,completionOperation=operation;
   await loading;if(destroyed||JSON.stringify(getContext())!==identity||proposalRequest!==completionRequest||operation!==completionOperation||currentKey()!==completionKey||historyKey()!==completionHistory||proposal)return false;
   setStatus('Terreno applicato e salvato.','applied');return true;
  }catch{if(!ownsCompletion())return discard();busy=false;if(proposalCurrent())setStatus('Il salvataggio locale non è riuscito. Il progetto precedente e la proposta sono conservati. Libera spazio e riprova Applica.','error');else setStatus('Il contesto del progetto è cambiato.','unavailable');return false;}
  finally{if(native)reportBudget('apply-validation',applyBudget.usage());if(applying===token)applying=null;}
 }
 function cancel(){proposalRequest++;projectPatchDraft=null;progress=null;cutFailure=null;abort?.abort();inflight=null;operation++;proposal=null;nativePreview=null;proposalKey=null;busy=false;lastProposalOutcome={ok:false,status:'cancelled'};close3D();onProposalChange(null);setStatus('Proposta annullata. Il progetto salvato è conservato.','cancelled');}
 async function toggle3D(){
  if(in3D||viewOpening){close3D();return;}if(!available())return;
  const loading=refresh();const captured=currentKey(),opening=++viewOperation;viewOpening=true;render();let opened=null;
  const current=()=>!destroyed&&opening===viewOperation&&currentKey()===captured&&available();
  try{
   await loading;if(!current()||!model||busy)return;
   const api=getMapApi(),map=api?.map;if(!map){setStatus('Vista 3D non disponibile sulla mappa.');return;}
   const candidate=visibleProposal();
   const scene=api.getTerrainSceneSnapshot?.({exclusions:candidate?.projectPatch?.exclusions,rowPortions:candidate?.rowPortions??candidate?.result?.portions})??{geometry:getProject().geometry,exclusions:[],rowPortions:[]};
   opened=await createMapView({map,model,...scene,rows:visibleProposal()?.result?.rows??getResult()?.rows??scene.rows??[],getVisibility:api.getOverlayVisibility,onSceneActive:api.setTerrainSceneActive,gesturePolicy:api.gesturePolicy,onReturn2D:close3D,onStatus,onError:error=>{if(current()){close3D();setStatus(`Vista 3D non disponibile. ${error.message??''}`);}}});if(!current()){opened.destroy();return;}
   view=opened;api.stopTools?.();if(!current()){opened.destroy();return;}
   await opened.open();if(!current()){opened.destroy();return;}
   in3D=true;api.setRows?.(visibleProposal()?.result?.rows??getResult()?.rows??[]);
  }catch(error){opened?.destroy();if(current()){view=null;in3D=false;setStatus(`Vista 3D non disponibile. ${error.message??''}`);}}
  finally{if(opening===viewOperation){viewOpening=false;render();}}
 }


 render();
 return {refresh,propose,restore,suggestCut,setMode,isTargetCurrent,apply,cancel,retry,toggle3D,close3D,getState,destroy(){if(destroyed)return;destroyed=true;invalidate();card?.replaceChildren();}};
}
// The caller assigns the returned state only after this synchronous checkpoint.
export function checkpointTerrainProposal({state,proposal,context,currentContext,mergeState,saveCheckpoint}){
 if(nativeCutProposal(proposal))return checkpointNativeCut({state,proposal,context,currentContext,mergeState,saveCheckpoint});
 if(!proposal?.ok||context?.terrainContextKey!==terrainContextKey(currentContext,state.project)||context?.terrainHistoryFingerprint!==assertTerrainRestoreHistory({project:state.project}))throw new Error('Il contesto del progetto è cambiato.');
 // Validate the deletion contract before invoking merge or storage.
 const effective=proposalProject(state.project,proposal),patch=proposalPatch(proposal);
 let candidate=mergeState(state,patch);
 // The generic field merger normalizes every field. A terrain checkpoint only
 // owns the active field; preserve foreign raw definitions without defaults.
 if(Array.isArray(state.project.fields))candidate={...candidate,project:{...candidate.project,fields:candidate.project.fields.map(field=>field.id===candidate.project.activeFieldId?field:clone(state.project.fields.find(original=>original.id===field.id)??field))}};
 if(proposal.removeProjectKeys?.length){
  candidate=clone(candidate);delete candidate.project.rowPortions;
  const active=candidate.project.fields?.find(field=>field.id===candidate.project.activeFieldId);
  if(active)delete active.rowPortions;
 }
 validateCandidate(candidate.project,proposal);
 // The merged active field must have exactly the effective geometric inputs.
 if(terrainGeometryInputHash(candidate.project,candidate.project.terrain.model)!==terrainGeometryInputHash(effective,effective.terrain.model))throw new Error('Il progetto candidato non corrisponde alla proposta.');
 assertTerrainSerializationBudget(candidate);
 const checkpoint=saveCheckpoint(candidate);if(!checkpoint)throw new Error('Il salvataggio locale non è riuscito.');return checkpoint;
}
function checkpointNativeCut({state,proposal,context,currentContext,mergeState,saveCheckpoint}){
 const budget=context?.terrainApplyBudget??createTerrainBudget({kind:'cut'});budget.check();
 if(context?.signal?.aborted)throw new DOMException('Operazione annullata.','AbortError');
 if(!proposal?.ok||context?.terrainContextKey!==terrainContextKey(currentContext,state.project)||context?.terrainHistoryFingerprint!==assertTerrainRestoreHistory({project:state.project,budget}))throw new Error('Il contesto del progetto è cambiato.');
 const effective=nativeCutProject(state.project,proposal),patch=nativeCutPatch(proposal);
 const {fields,...activeProject}=state.project;
 const entries=proposal.terrain?.history?.entries?.filter(entry=>entry.kind==='cut'&&entry.before?.cut?.groupId===proposal.cutOperation?.groupId)??[];
 // The controller always supplies its actual request identity. Standalone
 // historical callers can use the unique genuine attached cut entry instead;
 // the validator still compares its complete before state to the live source.
 const operationId=context.terrainOperationId??(entries.length===1?entries[0].operationId:null);
 verifyNativeAttachment({project:activeProject,proposal,operationId,budget});
 let candidate=mergeState(state,patch);
 // Foreign fields retain their exact raw definitions and aliases. A native
 // checkpoint owns only the active terrain/portions/exclusions patch.
 if(Array.isArray(state.project.fields))candidate={...candidate,project:{...candidate.project,fields:candidate.project.fields.map(field=>field.id===candidate.project.activeFieldId?field:state.project.fields.find(original=>original.id===field.id)??field)}};
 budget.check();
 if(terrainGeometryInputHash(candidate.project,candidate.project.terrain.model)!==terrainGeometryInputHash(effective,effective.terrain.model))throw new Error('Il progetto candidato non corrisponde alla proposta.');
 assertTerrainSerializationBudget(candidate);budget.check();
 if(context?.signal?.aborted)throw new DOMException('Operazione annullata.','AbortError');
 const checkpoint=saveCheckpoint(candidate);if(!checkpoint)throw new Error('Il salvataggio locale non è riuscito.');return checkpoint;
}
