import {terrainUsesCertifiedQuantities,terrainQuantityBasisText} from './terrain-report-summary.js?v=1.3.1-prova.1';
// Candidate acquisition and solver output never mutate the live project.
import {rowPortionEditorState} from './row-portion-editor.js?v=1.3.1-prova.1';
export function terrainPortionEditorState(project,activeId,result){
 return rowPortionEditorState(project,activeId,result?.terrainStatus==='invalid'?null:result?.portions);
}
const DESIGN_KEYS=['geometry','exclusions','rowSpacingM','plantSpacingM','postSpacingM','headlandWidthM','orientationDeg','rowCurvePoints','rowPortions','maintainRowEquidistance'];
export function terrainContextKey(context,project){return JSON.stringify([context,...DESIGN_KEYS.map(key=>project?.[key]),project?.terrain?.model?.contentHash]);}
const defaultLoad=async options=>(await import('./terrain-provider.js?v=1.3.1-prova.1')).loadTerrainForField(options);
const defaultRun=async(options,control)=>(await import('./terrain-worker-client.js?v=1.3.1-prova.1')).runTerrainProposal(options,control);
const defaultSummary=async model=>(await import('./terrain-model.js?v=1.3.1-prova.1')).terrainSummary(model);
const defaultCoverage=async(model,polygon)=>{const {sampleTerrain}=await import('./terrain-model.js?v=1.3.1-prova.1');return Array.isArray(polygon)&&polygon.every(point=>sampleTerrain(model,point)!=null);};
const defaultView=async options=>(await import('./terrain-map.js?v=1.3.1-prova.1')).createTerrainMapView(options);
const quantity=value=>Number.isFinite(value)?value.toLocaleString('it-IT',{maximumFractionDigits:1}):'—';
export function createTerrainController({document,getProject,getContext,getPortionId=()=>null,getMapApi=()=>null,getResult=()=>null,applyProposal,onStatus=()=>{},onProposalChange=()=>{},loadTerrain=defaultLoad,runProposal=defaultRun,summarize=defaultSummary,covers=defaultCoverage,createMapView=defaultView}){
 const card=document.querySelector('#terrain-card');
 let key=null,model=null,proposal=null,summary=null,status='Disegna e conferma il perimetro per acquisire il terreno.',busy=false,destroyed=false,abort=null,operation=0,view=null,in3D=false,inflight=null,proposalKey=null,proposalRequest=0,projectPatchDraft=null,viewOpening=false,viewOperation=0;
 const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;};
 const currentKey=()=>terrainContextKey(getContext(),getProject());
 const valid=(captured,sequence)=>!destroyed&&currentKey()===captured&&operation===sequence;
 function close3D(){viewOperation++;viewOpening=false;const hadView=in3D||view;view?.close();view?.destroy();view=null;in3D=false;if(hadView)getMapApi()?.setRows?.(getResult()?.rows??[]);render();}
 function invalidate(){operation++;proposalRequest++;projectPatchDraft=null;abort?.abort();abort=null;inflight=null;close3D();model=null;summary=null;proposal=null;proposalKey=null;busy=false;onProposalChange(null);}
 function setStatus(message){status=message;onStatus(message);render();}
 function action(label,name,fn,disabled=false){const b=node('button',label);b.type='button';b.dataset.terrain=name;b.disabled=disabled;b.addEventListener('click',fn);return b;}
 function render(){
  if(!card||destroyed)return;card.replaceChildren();card.classList.add('terrain-card');
  const heading=node('div',null,'terrain-heading');heading.append(node('h3','Terreno'));
  const state=node('span',proposal?'Anteprima':getResult()?.terrainStatus==='invalid'?'Da rivedere':getProject()?.terrain?'Applicato':'Altimetria automatica','terrain-badge');heading.append(state);card.append(heading);
  if(getResult()?.terrainStatus==='invalid')card.append(node('p','Il disegno sul terreno non corrisponde agli input. Prepara e applica una nuova proposta.','terrain-scope'));
  const message=node('p',status,'terrain-status');message.setAttribute('role','status');card.append(message);
  const displayedMetrics=proposal?.result??getResult();
  if(displayedMetrics?.terrainStatus!=='invalid'&&terrainUsesCertifiedQuantities(displayedMetrics))card.append(node('p',`${terrainQuantityBasisText(displayedMetrics)} · Lunghezze sul terreno misurate`,'terrain-metrics terrain-quantity-basis'));
  if(model){
   const info=node('details',null,'terrain-source');info.append(node('summary',`Fonte: ${model.source?.label??'Modello del terreno'}`));
   const s=model.source??{};info.append(node('p',[s.label,s.resolutionM!=null?`Risoluzione ${s.resolutionM} m`:null,s.surveyEpoch?`Rilievo ${s.surveyEpoch}`:null,s.release?`Rilascio ${s.release}`:null,s.citation,s.license].filter(Boolean).join(' · ')));
   if(s.url&&/^https:\/\//.test(s.url)){const link=node('a','Informazioni sulla fonte');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';info.append(link);}
   card.append(info);
   if(summary?.valid){card.append(node('p',`Dislivello ${quantity(summary.rangeM)} m${Number.isFinite(summary.maxSlopePercent)?` · Pendenza massima ${quantity(summary.maxSlopePercent)}%`:''}`,'terrain-metrics'));}
   const actions=node('div',null,'terrain-actions');actions.append(action('Segui il terreno','follow',()=>void propose(),busy));
   actions.append(action(in3D?'2D':'3D','view',()=>void toggle3D(),busy||viewOpening));card.append(actions);
  }
  if(proposal){
   card.append(node('p',getProject()?.terrain?(proposal.scope==='field'?'Aggiornamento di tutto il campo.':'Proposta per la porzione selezionata.'):'Prima applicazione: conversione di tutto il campo.','terrain-scope'));
   const changes=Array.isArray(proposal.changes)?proposal.changes:[];
   const separateGround=terrainUsesCertifiedQuantities(proposal.beforeTotals)||terrainUsesCertifiedQuantities(proposal.result)||changes.some(change=>terrainUsesCertifiedQuantities(change.before)||terrainUsesCertifiedQuantities(change.after));
   const reviewMetrics=['rowCount','rowLinearM',...(separateGround?['surfaceRowLinearM']:[]),'simulatedPlants','totalPosts'];
   const table=node('table',null,'terrain-review');const caption=node('caption','Quantità prima → dopo');table.append(caption);
   const header=node('tr');['Porzione','Filari/tratti',separateGround?'Metri per quantità':'Metri',...(separateGround?['Metri sul terreno']:[]),'Piante','Pali'].forEach(text=>header.append(node('th',text)));const thead=node('thead');thead.append(header);table.append(thead);
   const body=node('tbody');
   for(const change of changes){const tr=node('tr');tr.append(node('th',change.label??change.portionId??'Campo'));for(const metric of reviewMetrics)tr.append(node('td',`${quantity(change.before?.[metric])} → ${quantity(change.after?.[metric])}`));body.append(tr);}
   const total=node('tr');total.className='terrain-review-total';total.append(node('th','Campo intero'));for(const metric of reviewMetrics)total.append(node('td',`${quantity(proposal.beforeTotals?.[metric])} → ${quantity(proposal.result?.[metric])}`));body.append(total);table.append(body);const scroll=node('div',null,'terrain-review-scroll');scroll.append(table);card.append(scroll);
   const actions=node('div',null,'terrain-actions');actions.append(action('Applica','apply',()=>void apply(),busy),action('Annulla','cancel',cancel,busy));card.append(actions);
  }
  if(!busy&&getProject()?.geometry&&(!model||(!proposal&&status.startsWith('Disegno'))))card.append(action('Riprova','retry',()=>void retry()));
  if(in3D)card.append(node('p',`${proposal?'Anteprima · ':''}Vista 3D approssimata · altezza reale ×1. Torna in 2D prima di modificare.`,'terrain-approximation'));
 }
 async function acquire(force=false){
  const captured=key,sequence=++operation;abort?.abort();abort=new AbortController();busy=true;setStatus('Acquisizione altimetria…');
  try{
   let frozen=!force&&getProject()?.terrain?.model;
   if(frozen&&!(await covers(frozen,getProject().geometry)))frozen=null;
   if(!valid(captured,sequence))return;
   const candidate=frozen||await loadTerrain({polygon:getProject().geometry,signal:abort.signal});
   const details=await summarize(candidate);if(!valid(captured,sequence))return;
   if(!details?.valid)throw new Error('Modello del terreno non valido.');model=candidate;summary=details;busy=false;setStatus(frozen?'Terreno congelato disponibile.':'Terreno disponibile. La proposta si salva solo con Applica.');
  }catch(error){if(!valid(captured,sequence))return;busy=false;setStatus(error?.name==='AbortError'?'Operazione annullata.':`Terreno non disponibile. ${error.message??''}`);}
 }
 async function refresh(){
  if(destroyed)return;const next=currentKey();if(next!==key){invalidate();key=next;if(!getProject()?.geometry){setStatus('Disegna e conferma il perimetro per acquisire il terreno.');return;}}
  if(!model&&!inflight){const task=acquire().finally(()=>{if(inflight===task)inflight=null;});inflight=task;}render();return inflight;
 }
 async function retry(){invalidate();key=currentKey();if(!getProject()?.geometry)return;const task=acquire(true).finally(()=>{if(inflight===task)inflight=null;});inflight=task;return task;}
 async function propose({project=getProject(),projectPatch=null,portionId=getPortionId(),followTerrain=true,recomputeAll=false}={}){
  const currentMetrics=getResult();
  const beforeTotals=currentMetrics&&currentMetrics.terrainStatus!=='invalid'?Object.fromEntries(['rowCount','rowLinearM','surfaceRowLinearM','quantityBasis','simulatedPlants','totalPosts'].map(metric=>[metric,currentMetrics[metric]])):null;
  const loading=refresh(),request=++proposalRequest;projectPatchDraft=projectPatch;proposal=null;proposalKey=null;
  await loading;if(request!==proposalRequest||!model||destroyed)return null;
  // A global input mutation cannot reuse any previously applied portion result.
  if(getResult()?.terrainStatus==='invalid')recomputeAll=true;
  const scope=!project.terrain||recomputeAll||portionId==null||project.terrain.model?.contentHash!==model.contentHash?'field':'portion';
  close3D();proposal=null;proposalKey=null;const captured=key,sequence=++operation;abort?.abort();abort=new AbortController();busy=true;setStatus('Calcolo del disegno sul terreno…');
  const current=()=>request===proposalRequest&&valid(captured,sequence);
  try{
   const result=await runProposal({project,model,portionId,recomputeAll,followTerrain,deadlineMs:10000},{signal:abort.signal});
   if(!current())return null;busy=false;
   if(!result?.ok){setStatus(`Disegno da rivedere. ${result?.message??result?.status??'Proposta non validabile.'}`);return result;}
   proposal={...result,scope,beforeTotals,...(projectPatch?{projectPatch}:{} )};proposalKey=captured;onProposalChange(proposal);setStatus('Anteprima pronta. Controlla le quantità e scegli Applica.');return proposal;
  }catch(error){if(!current())return null;busy=false;setStatus(`Disegno da rivedere. ${error.message??'Calcolo non disponibile.'}`);return null;}
 }
 async function apply(){
  if(!proposal||busy||currentKey()!==proposalKey)return false;
  const captured=proposalKey,sequence=operation,identity=JSON.stringify(getContext()),context={...getContext(),terrainContextKey:captured};busy=true;setStatus('Salvataggio del progetto…');
  try{const saved=await applyProposal(proposal,context);if(saved===false)throw new Error('checkpoint');if(destroyed||JSON.stringify(getContext())!==identity){busy=false;return false;}close3D();proposal=null;proposalKey=null;busy=false;key=null;await refresh();setStatus('Terreno applicato e salvato.');return true;}
  catch{if(valid(captured,sequence)){busy=false;setStatus('Il salvataggio locale non è riuscito. Il progetto precedente e la proposta sono conservati. Libera spazio e riprova Applica.');}return false;}
 }
 function cancel(){proposalRequest++;projectPatchDraft=null;abort?.abort();operation++;proposal=null;proposalKey=null;busy=false;close3D();onProposalChange(null);setStatus('Proposta annullata. Il progetto salvato è conservato.');}
 async function toggle3D(){
  if(in3D){close3D();return;}if(!model||busy||viewOpening)return;
  const map=getMapApi()?.map;if(!map){setStatus('Vista 3D non disponibile sulla mappa.');return;}
  const captured=key,sequence=operation,opening=++viewOperation;viewOpening=true;render();let opened=null;
  const current=()=>opening===viewOperation&&valid(captured,sequence);
  try{
   opened=await createMapView({map,model,onStatus});if(!current()){opened.destroy();return;}
   view=opened;getMapApi()?.stopTools?.();if(!current()){opened.destroy();return;}
   await opened.open();if(!current()){opened.destroy();return;}
   in3D=true;if(proposal?.result?.rows)getMapApi()?.setRows?.(proposal.result.rows);
  }catch(error){opened?.destroy();if(current()){view=null;in3D=false;setStatus(`Vista 3D non disponibile. ${error.message??''}`);}}
  finally{if(opening===viewOperation){viewOpening=false;render();}}
 }

 render();
 return {refresh,propose,apply,cancel,retry,toggle3D,close3D,getState:()=>({model,proposal,projectPatch:projectPatchDraft,busy,in3D,viewOpening,status}),destroy(){invalidate();destroyed=true;card?.replaceChildren();}};
}
// The caller assigns the returned state only after this synchronous checkpoint.
export function checkpointTerrainProposal({state,proposal,context,currentContext,mergeState,saveCheckpoint}){
 if(!proposal?.ok||context?.terrainContextKey!==terrainContextKey(currentContext,state.project))throw new Error('Il contesto del progetto è cambiato.');
 const candidate=mergeState(state,{...(proposal.projectPatch??{}),terrain:proposal.terrain,rowPortions:proposal.rowPortions});
 const checkpoint=saveCheckpoint(candidate);if(!checkpoint)throw new Error('Il salvataggio locale non è riuscito.');return checkpoint;
}
