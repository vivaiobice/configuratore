const PHASE_LABELS = {
 domain:'Preparazione del terreno…',
 contours:'Preparazione dei filari…',
 'contour-elevation':'Verifica delle quote…',
 'contour-spacing':'Verifica delle distanze tra i filari…',
 family:'Ricerca della disposizione dei filari…',
 cut:'Ricerca di un passaggio…',
 restore:'Preparazione del ripristino…',
 envelope:'Preparazione dell’anteprima…',
 checkpoint:'Salvataggio del progetto…',
};
const STATUS_LABELS = {
 'budget-exceeded':'Il calcolo ha raggiunto il limite di tempo. Riprova.',
 timeout:'Il calcolo ha raggiunto il limite di tempo. Riprova.',
 incompatible:'Non è stata trovata una disposizione compatibile per questa porzione.',
 'restore-conflict':'Il disegno precedente non può essere ripristinato dopo le modifiche successive.',
 cancelled:'Operazione annullata.',
 unavailable:'Operazione non disponibile per questa porzione.',
 error:'Operazione non riuscita. Riprova.',
 ready:'Anteprima pronta. Controlla il disegno e scegli Applica.',
 applied:'Disegno applicato e salvato.',
 saving:'Salvataggio del progetto…',
};

function normalizeState(value={}) {
 const validTarget=typeof value.portionId==='string' && value.portionId.trim()!=='';
 const restoreKind=value.restoreAvailability?.kind;
 return {
  portionId:validTarget?value.portionId:null,
  contextKey:typeof value.contextKey==='string'?value.contextKey:null,
  mode:value.mode==='terrain'?'terrain':'manual',busy:value.busy===true,
  pendingProposal:value.proposal?.pending===true,
  canApply:value.proposal?.canApply===true,
  canAdapt:value.canAdapt===true,canSuggestCut:value.canSuggestCut===true,repeatMode:value.repeatMode===true,
  restoreKind:['exact','proposal','conflict'].includes(restoreKind)?restoreKind:'unavailable',
  statusKind:typeof value.status?.kind==='string'?value.status.kind:null,
  progressPhase:typeof value.progress?.phase==='string'?value.progress.phase:null,
 };
}

/**
 * Pure curvature widget. The app maps its actual controller state into this DTO;
 * availability is explicit, never inferred from a project, model or proposal.
 * Every callback receives {portionId, contextKey}; onModeChange also gets mode.
 * contextKey is an opaque UI context identity, not a numerical validity proof.
 * The owner still validates context and checkpoints proposals atomically.
 *
 * render({portionId, contextKey?, mode, busy, canAdapt, canSuggestCut, repeatMode?,
 *   proposal: null | {pending, canApply}, status: null | {kind},
 *   progress: null | {phase}, restoreAvailability: {kind}})
 * restore kind: unavailable | exact | proposal | conflict.
 * destroy removes only the widget, preserving the host and manual controls.
 */
export function createTerrainControls({host,onModeChange,onApply,onCancel,onSuggestCut,onRestore}) {
 if(!host?.ownerDocument?.createElement || !host.append)throw new TypeError('A DOM host is required.');
 const document=host.ownerDocument;
 const root=document.createElement('div');
 root.className='terrain-curve-widget';root.setAttribute('role','group');
 root.setAttribute('aria-label','Curvatura della porzione');host.append(root);
 let state=normalizeState(),destroyed=false,epoch=0,renderSerial=0,pending=null,feedback=null;
 let listeners=[];

 function clearListeners() {
  for(const [button,listener] of listeners)button.removeEventListener('click',listener);
  listeners=[];
 }
 function sameContext(a,b) {return a.portionId===b.portionId && a.contextKey===b.contextKey;}
 function element(tag,text,className) {
  const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;
 }
 function settle(token,failed=false) {
  if(destroyed || pending!==token)return;
  pending=null;feedback=failed?STATUS_LABELS.error:null;paint();
 }
 function invoke(callback,payload) {
  const token={target:state,invoking:true,async:false};pending=token;feedback=null;
  const serial=renderSerial;paint();
  try {
   const result=callback(payload);token.invoking=false;
   if(result && typeof result.then==='function') {
    token.async=true;Promise.resolve(result).then(()=>settle(token),()=>settle(token,true));
   } else if(renderSerial!==serial)settle(token);
   // Synchronous callbacks stay locked until the producer supplies another render.
  } catch {token.invoking=false;settle(token,true);}
 }
 function button(parent,action,label,callback,disabled,mode) {
  const node=element('button',label,'terrain-curve-action');node.type='button';node.dataset.terrainAction=action;
  node.disabled=disabled || typeof callback!=='function';
  if(mode)node.setAttribute('aria-pressed',String(state.mode===mode));
  const capturedEpoch=epoch,target={portionId:state.portionId,contextKey:state.contextKey};
  const listener=()=>{
   if(destroyed || capturedEpoch!==epoch || node.disabled || pending || !target.portionId)return;
   if(mode && state.mode===mode && !state.repeatMode)return;
   invoke(callback,mode?{...target,mode}:target);
  };
  node.addEventListener('click',listener);listeners.push([node,listener]);parent.append(node);
 }
 function paint() {
  if(destroyed)return;
  epoch++;clearListeners();root.replaceChildren();
  const blocked=state.busy || pending!==null || !state.portionId;
  root.setAttribute('aria-busy',String(state.busy || pending!==null));
  const modes=element('div',null,'terrain-curve-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','Modalità filari');
  button(modes,'manual','Manuale',onModeChange,blocked || state.pendingProposal,'manual');
  button(modes,'terrain','Adatta al terreno',onModeChange,blocked || state.pendingProposal || !state.canAdapt,'terrain');root.append(modes);

  const actions=element('div',null,'terrain-curve-actions');
  if(state.pendingProposal) {
   button(actions,'apply','Applica',onApply,blocked || !state.canApply);
   button(actions,'cancel','Annulla',onCancel,blocked);
  }
  if(state.canSuggestCut)button(actions,'cut','Suggerisci passaggio',onSuggestCut,blocked || state.pendingProposal);
  if(state.restoreKind==='exact' || state.restoreKind==='proposal') {
   button(actions,'restore','Ripristina disegno precedente',onRestore,blocked || state.pendingProposal);
  }
  if(actions.children.length)root.append(actions);

  let message=feedback;
  if(!message && state.busy)message=Object.hasOwn(PHASE_LABELS,state.progressPhase)?PHASE_LABELS[state.progressPhase]:'Elaborazione in corso…';
  if(!message && pending)message='Operazione in corso…';
  if(!message && state.statusKind)message=Object.hasOwn(STATUS_LABELS,state.statusKind)?STATUS_LABELS[state.statusKind]:STATUS_LABELS.unavailable;
  if(!message && state.restoreKind==='conflict')message=STATUS_LABELS['restore-conflict'];
  if(!message && state.pendingProposal)message=STATUS_LABELS.ready;
  if(message) {
   const status=element('p',message,'terrain-curve-status');
   status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');root.append(status);
  }
 }
 function render(value) {
  if(destroyed)return;
  const next=normalizeState(value);
  if(pending && (!sameContext(pending.target,next) || (!pending.invoking && !pending.async)))pending=null;
  state=next;feedback=null;renderSerial++;paint();
 }
 function destroy() {
  if(destroyed)return;destroyed=true;epoch++;pending=null;clearListeners();root.remove();
 }
 paint();return {render,destroy};
}
