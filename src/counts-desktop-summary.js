import {CATEGORY_LABELS} from '../conteggi/model.js?v=1.3.7';
const syncLabels={local:'Sul dispositivo',pending:'Da sincronizzare',synced:'Sincronizzato',error:'Da riprovare',conflict:'Conflitto da risolvere'};

export function mountCountsDesktopSummary({document=globalThis.document,gateway,onOpen}){
 const actions=document.querySelector('.topbar-actions');
 if(!actions||!gateway?.listRecentLists)throw new TypeError('Gateway Conteggi non disponibile.');
 const trigger=document.createElement('button');trigger.id='desktop-counts-trigger';trigger.type='button';trigger.textContent='Conteggi';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','desktop-counts-panel');
 const panel=document.createElement('section');panel.id='desktop-counts-panel';panel.hidden=true;panel.setAttribute('aria-label','Conteggi recenti');
 const heading=document.createElement('strong');heading.textContent='Conteggi recenti';
 const list=document.createElement('div');panel.append(heading,list);
 const feedback=document.createElement('p');feedback.dataset.countsFeedback='';feedback.setAttribute('role','status');panel.append(feedback);
 const all=button('Tutte le liste',()=>open('lists'));panel.append(all);
 let sequence=0,work=Promise.resolve(),editing=null,disposed=false;
 function button(label,handler){const node=document.createElement('button');node.type='button';node.textContent=label;node.addEventListener('click',handler);return node;}
 function queue(fn){work=work.catch(()=>{}).then(fn).catch(error=>{feedback.textContent=error.message||'Operazione non riuscita.';});return work;}
 function open(view,params={}){
  if(editing){feedback.textContent='Salva o annulla la modifica prima di aprire una lista.';return;}
  panel.hidden=true;trigger.setAttribute('aria-expanded','false');work=Promise.resolve().then(()=>onOpen(view,params)).catch(error=>{panel.hidden=false;feedback.textContent=error.message||'Conteggi non disponibile.';});
 }
 function edit(count){
  editing={count:structuredClone(count),attempt:null};feedback.textContent='';
  list.replaceChildren();const label=document.createElement('p');label.textContent=CATEGORY_LABELS[count.category];list.append(label);
  for(const [name,title,value]of [['countsTitle','Titolo',count.title],['countsQuantity','Quantità',count.quantity]]){
   const field=document.createElement('label');field.textContent=title;
   const input=document.createElement('input');input.name=name;input.value=String(value);input.required=true;
   if(name==='countsTitle')input.maxLength=200;else input.setAttribute('inputmode','numeric');field.append(input);list.append(field);
  }
  const save=button('Salva modifica',()=>queue(async()=>{
   const snapshot=editing;if(!snapshot)return;const patch={title:list.querySelector('[name="countsTitle"]').value.trim(),quantity:list.querySelector('[name="countsQuantity"]').value};
   const digest=JSON.stringify(patch);if(snapshot.attempt?.digest!==digest)snapshot.attempt={digest,input:{listId:count.listId,countId:count.countId,expectedRevision:count.revision,expectedLocalRevision:count.localRevision,operationId:crypto.randomUUID(),patch}};
   await gateway.updateCount(snapshot.attempt.input);if(disposed||snapshot!==editing)return;
   editing=null;feedback.textContent='Salvato sul dispositivo.';await refresh();
  }));save.dataset.countsSave='';list.append(save);
  list.append(button('Annulla modifica',()=>{editing=null;feedback.textContent='';queue(refresh);}));
  list.querySelector('input')?.focus();
 }
 async function refresh(){
  if(editing||disposed)return;const current=++sequence;list.textContent='Caricamento…';
  const rows=await gateway.listRecentLists(5);if(current!==sequence||panel.hidden||disposed)return;
  const details=await Promise.all(rows.map(row=>gateway.getList?gateway.getList(row.listId):null));
  if(current!==sequence||panel.hidden||disposed||editing)return;list.replaceChildren();
  if(!rows.length){list.textContent='Nessuna lista recente.';return;}
  for(let i=0;i<rows.length;i++){
   const row=rows[i],section=document.createElement('section');section.className='counts-summary-list';
   const link=button(`${row.title} · ${row.status==='closed'?'Chiusa':'Aperta'}`,()=>open('list',{listId:row.listId}));link.dataset.countsList=row.listId;section.append(link);
   for(const count of (details[i]?.counts??[]).slice(0,5)){
    const item=document.createElement('div');item.className='counts-summary-item';
    const title=document.createElement('strong');title.textContent=`${count.title} · ${count.quantity}`;
    const metadata=document.createElement('small');metadata.textContent=`${CATEGORY_LABELS[count.category]} · ${count.field?.fieldLabel||'Senza campo'} · ${syncLabels[count.syncState]||'Sul dispositivo'}`;
    const change=button('Modifica titolo e quantità',()=>edit(count));change.dataset.countsEdit=count.countId;
    const full=button('Apri conteggio',()=>open('counter',{listId:row.listId,countId:count.countId}));
    item.append(title,metadata,change,full);section.append(item);
   }
   list.append(section);
  }
 }
 trigger.addEventListener('click',()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&!editing){feedback.textContent='';queue(refresh);}});
 const unsubscribe=gateway.subscribe?.(event=>{
  if(event.reason==='identity-change'){sequence++;editing=null;list.replaceChildren();panel.hidden=true;trigger.setAttribute('aria-expanded','false');return;}
  if(panel.hidden)return;if(editing){feedback.textContent='Gli appunti sono stati aggiornati. La tua modifica resta visibile; il salvataggio verifica la versione.';return;}queue(refresh);
 });
 actions.append(trigger);document.body.append(panel);
 return {refresh:()=>queue(refresh),whenIdle:()=>work,destroy(){disposed=true;sequence++;unsubscribe?.();trigger.remove();panel.remove();}};
}
