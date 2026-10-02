export function mountCountsDesktopSummary({document=globalThis.document,gateway,onOpen}){
  const actions=document.querySelector('.topbar-actions');
  if(!actions||!gateway?.listRecentLists)throw new TypeError('Gateway Conteggi non disponibile.');
  const trigger=document.createElement('button');trigger.id='desktop-counts-trigger';trigger.type='button';trigger.textContent='Conteggi';trigger.setAttribute('aria-expanded','false');
  const panel=document.createElement('section');panel.id='desktop-counts-panel';panel.hidden=true;panel.setAttribute('aria-label','Conteggi recenti');
  const heading=document.createElement('strong');heading.textContent='Conteggi recenti';
  const list=document.createElement('div');panel.append(heading,list);
  const all=document.createElement('button');all.type='button';all.textContent='Tutte le liste';all.addEventListener('click',()=>open('lists'));panel.append(all);
  function open(view,params={}){panel.hidden=true;trigger.setAttribute('aria-expanded','false');Promise.resolve().then(()=>onOpen(view,params)).catch(error=>{list.textContent=error.message||'Conteggi non disponibile.';panel.hidden=false;});}
  let sequence=0;
  async function refresh(){
    const current=++sequence;list.textContent='Caricamento…';
    try{
      const rows=await gateway.listRecentLists(5);
      if(current!==sequence||panel.hidden)return;
      list.replaceChildren();
      if(!rows.length){list.textContent='Nessuna lista recente.';return;}
      for(const row of rows){
        const button=document.createElement('button');button.type='button';button.dataset.countsList=row.listId;
        button.textContent=`${row.title} · ${row.status==='closed'?'Chiusa':'Aperta'}`;
        button.addEventListener('click',()=>open('list',{listId:row.listId}));list.append(button);
      }
    }catch(error){if(current===sequence&&!panel.hidden)list.textContent=error.message||'Liste non disponibili.';}
  }
  trigger.addEventListener('click',()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)refresh();});
  actions.append(trigger);document.body.append(panel);
  return {refresh,destroy(){sequence++;trigger.remove();panel.remove();}};
}
