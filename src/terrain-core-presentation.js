import {terrainQuantityBasisText,terrainTheoreticalBasisText,terrainUsesCertifiedQuantities} from './terrain-report-summary.js?v=1.3.2';
import {createTerrainControls} from './terrain-controls.js?v=1.3.2';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const quantity=value=>Number.isFinite(value)?value.toLocaleString('it-IT',{maximumFractionDigits:1}):'—';

// These identify saved design modes only. They never certify geometry or quantities.
function selectedSavedDesign(project,portionId) {
 const applied=project?.terrain?.applied;
 const design=project?.rowPortions?.find(portion=>portion.id===portionId)?.terrainDesign;
 if(!applied || !design)return null;
 if(applied.schemaVersion===2 && applied.algorithmVersion==='terrain-contour-family-1' && ['adapt','measure'].includes(design.mode)) {
  return {mode:design.mode==='adapt'?'terrain':'manual'};
 }
 if(!Object.hasOwn(applied,'schemaVersion') && applied.algorithmVersion==='terrain-face-chart-1' && typeof design.followTerrain==='boolean') {
  return {mode:design.followTerrain?'terrain':'manual',legacy:true};
 }
 return null;
}

/** Project only public core state. Caller supplies the same live project and
 * disables this projection in overview/account transition. The controller owns
 * cut eligibility and rechecks it when the action is requested.
 */
export function terrainCoreWidgetState(state={}, {project={},enabled=true}={}) {
 const active=enabled===true,proposal=active?state.proposal:null;
 const saved=selectedSavedDesign(project,state.portionId),availability=state.restoreAvailability;
 let restoreKind='unavailable';
 if(active && availability?.available===true) {
  if(availability.reason==='exact')restoreKind='exact';
  if(availability.reason==='recompute-required')restoreKind='proposal';
 } else if(active && availability?.available===false && availability.reason==='restore-conflict')restoreKind='conflict';
 const canAdapt=active && state.canAdapt===true;
 const idleAcquired=canAdapt && state.statusKind==='unavailable' && !state.lastProposalOutcome && !proposal;
 return {
  portionId:active?state.portionId:null,contextKey:active?state.contextKey:null,
  mode:!proposal && saved?.legacy?saved.mode:state.actualMode==='terrain'?'terrain':'manual',
  busy:state.busy===true || state.viewOpening===true,
  canAdapt,canSuggestCut:active && state.canSuggestCut===true,
  repeatMode:Boolean(canAdapt && !state.busy && !state.viewOpening && !proposal && saved),
  proposal:proposal?{pending:true,canApply:state.canApply===true}:null,
  progress:active && state.busy===true && state.statusKind==='saving'?{phase:'checkpoint'}:active && state.progress?{phase:state.progress.phase}:null,
  status:active && state.statusKind && !idleAcquired?{kind:state.statusKind}:null,
  restoreAvailability:{kind:restoreKind},
 };
}

function sourceDetails(source,model) {
 const fields=[['Fonte',source.label??source.id],['Identificativo',source.id],
  ['Risoluzione',Number.isFinite(source.resolutionM)?`${quantity(source.resolutionM)} m`:null],
  ['Epoca del rilievo',source.surveyEpoch],['Rilascio',source.release],
  ['Citazione',source.citation],['Licenza',source.license]];
 if(model?.source?.id===source.id && typeof model.acquiredAt==='string' && Number.isFinite(Date.parse(model.acquiredAt))) {
  fields.push(['Acquisizione',new Date(model.acquiredAt).toLocaleDateString('it-IT',{timeZone:'UTC'})]);
 }
 let url='';
 if(typeof source.url==='string' && source.url) {
  let https=false;try{https=new URL(source.url).protocol==='https:';}catch{}
  url=https?`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.url)}</a>`:escape(source.url);
 }
 const values=fields.filter(([,value])=>value!=null && value!=='').map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('');
 return `<details class="terrain-source"><summary>Dettagli della fonte</summary><dl>${values}${url?`<div><dt>URL della fonte</dt><dd>${url}</dd></div>`:''}</dl></details>`;
}

/** Metrics must be the actual validated result for this field (or visible
 * controller preview). sourceAvailable is explicit current acquisition state.
 * No padded model statistics, sampling, metric fallback or source mutation.
 */
export function terrainFieldSummaryHtml({metrics=null,model=null,preview=false,enabled=true,sourceAvailable=false}={}) {
 if(enabled!==true || metrics?.terrainStatus==='invalid')return '';
 const applied=metrics?.terrainStatus==='applied';
 const source=applied?metrics.terrainSource:sourceAvailable===true?model?.source:null;
 const relief=applied && metrics.terrainRelief?.basis==='native-field-domain-before-exclusions'?metrics.terrainRelief:null;
 const facts=[];
 if(Number.isFinite(relief?.minM) && Number.isFinite(relief?.maxM))facts.push(`Quote del campo ${quantity(relief.minM)}–${quantity(relief.maxM)} m`);
 if(Number.isFinite(relief?.rangeM) && relief.rangeM>=0)facts.push(`Dislivello del campo ${quantity(relief.rangeM)} m`);
 if(Number.isFinite(relief?.maxSlopePercent) && relief.maxSlopePercent>=0)facts.push(`Pendenza massima del campo ${quantity(relief.maxSlopePercent)}%`);
 const sourceLabel=source?.label??source?.id;
 if(!sourceLabel && !facts.length)return '';
 const basis=applied?[terrainQuantityBasisText(metrics),terrainTheoreticalBasisText(metrics)].filter(Boolean).join(' · '):'';
 const summary=[preview?'Anteprima':null,sourceLabel?`Fonte: ${sourceLabel}`:null,...facts].filter(Boolean).join(' · ');
 return `<section class="terrain-field-summary" aria-label="Terreno del campo"><p>${escape(summary)}</p>${basis?`<p class="terrain-summary-basis">${escape(basis)}</p>`:''}${source?sourceDetails(source,model):''}</section>`;
}

/** Only the public visible successful proposal belongs here. Failed outcomes
 * are not a preview. All unknown quantities remain em dashes, including before.
 */
export function terrainProposalReviewHtml(proposal,{hasSavedTerrain=false}={}) {
 if(proposal?.ok!==true || proposal.result?.terrainStatus!=='applied')return '';
 const changes=Array.isArray(proposal.changes)?proposal.changes:[];
 const metrics=[proposal.beforeTotals,proposal.result,...changes.flatMap(change=>[change.before,change.after])];
 const axes=metrics.some(value=>Number.isFinite(value?.rowAxisCount));
 const fragments=metrics.some(value=>Number.isFinite(value?.rowFragmentCount));
 const ground=metrics.some(value=>terrainUsesCertifiedQuantities(value) || Number.isFinite(value?.surfaceRowLinearM));
 const columns=[...(axes?[['rowAxisCount','Assi di filare']]:[]),...(fragments?[['rowFragmentCount','Tratti di filare']]:[]),
  ...(!axes && !fragments?[['rowCount','Filari/tratti']]:[]),['rowLinearM',ground?'Metri per quantità':'Metri'],
  ...(ground?[['surfaceRowLinearM','Metri sul terreno']]:[]),['simulatedPlants','Barbatelle'],['totalPosts','Pali']];
 const cells=(before,after)=>columns.map(([key])=>`<td>${quantity(before?.[key])} → ${quantity(after?.[key])}</td>`).join('');
 const rows=changes.map(change=>`<tr><th scope="row">${escape(change.label??change.portionId??'Campo')}</th>${cells(change.before,change.after)}</tr>`).join('');
 const scope=!hasSavedTerrain?'Prima applicazione: conversione di tutto il campo.':proposal.scope==='portion'?'Proposta per la porzione selezionata.':'Aggiornamento di tutto il campo.';
 const basis=[terrainQuantityBasisText(proposal.result),terrainTheoreticalBasisText(proposal.result)].filter(Boolean).join(' · ');
 return `<p class="terrain-scope">${escape(scope)}</p>${basis?`<p class="terrain-summary-basis">${escape(basis)}</p>`:''}<div class="terrain-review-scroll"><table class="terrain-review"><caption>Quantità prima → dopo</caption><thead><tr><th scope="col">Porzione</th>${columns.map(([,label])=>`<th scope="col">${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows}<tr class="terrain-review-total"><th scope="row">Campo intero</th>${cells(proposal.beforeTotals,proposal.result)}</tr></tbody></table></div>`;
}

/** Mount only in the existing curvature and field summary hosts. The owner
 * supplies the actual controller and live field; every event is guarded again.
 */
export function createTerrainCoreMount({document,getController,getProject,getMetrics,isEnabled=()=>true}) {
 const host=document.querySelector('#terrain-curve-controls');
 if(!host)return {render(){},destroy(){}};
 const review=document.querySelector('#terrain-proposal-review'),summary=document.querySelector('#terrain-summary'),retryHost=document.querySelector('#terrain-retry-controls');
 let destroyed=false,epoch=0,retryButton=null,retryListener=null;
 const dispatch=async(target,method,options)=>{
  const controller=getController();
  if(destroyed || !isEnabled() || !controller?.isTargetCurrent(target))return null;
  return controller[method](options);
 };
 const actions={
  onModeChange:target=>dispatch(target,'propose',{mode:target.mode,portionId:target.portionId}),
  onApply:target=>dispatch(target,'apply'),onCancel:target=>dispatch(target,'cancel'),
  onRestore:target=>dispatch(target,'restore'),
  onSuggestCut:target=>dispatch(target,'suggestCut',target),
 };
 const controls=createTerrainControls({host,...actions});
 function clearRetry() {
  if(retryButton)retryButton.removeEventListener('click',retryListener);
  retryButton=null;retryListener=null;retryHost?.replaceChildren();
 }
 function render(state) {
  if(destroyed)return;const active=isEnabled()===true,project=getProject();epoch++;
  controls.render(terrainCoreWidgetState(state,{project,enabled:active}));
  if(review)review.innerHTML=active?terrainProposalReviewHtml(state.proposal,{hasSavedTerrain:Boolean(project.terrain)}):'';
  if(summary)summary.innerHTML=terrainFieldSummaryHtml({enabled:active,metrics:state.proposal?.result??getMetrics(),
   model:state.proposal?.terrain?.model??project.terrain?.model??(state.canAdapt===true?state.model:null),
   preview:Boolean(state.proposal),sourceAvailable:state.canAdapt===true});
  clearRetry();
  if(active && retryHost && state.available===true && !state.busy && !state.viewOpening && !state.model && !state.proposal && state.statusKind==='unavailable' && state.portionId) {
   const target={portionId:state.portionId,contextKey:state.contextKey},captured=epoch;
   retryButton=document.createElement('button');retryButton.type='button';retryButton.className='terrain-curve-action';retryButton.dataset.terrainRetry='';retryButton.textContent='Riprova acquisizione';
   retryListener=()=>{if(destroyed || captured!==epoch || retryButton.disabled)return;retryButton.disabled=true;void dispatch(target,'retry');};
   retryButton.addEventListener('click',retryListener);retryHost.append(retryButton);
  }
 }
 function destroy() {if(destroyed)return;destroyed=true;epoch++;clearRetry();controls.destroy();review?.replaceChildren();summary?.replaceChildren();}
 return {render,destroy,actions};
}
