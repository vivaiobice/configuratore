const text=(value)=>String(value??'');

export function createDesktopLibraryUI(api){
  const document=api.document??globalThis.document;
  let root=null,mode='fields',busy=false;

  function close(){if(root)root.hidden=true;}
  function fieldButton(field){
    const button=document.createElement('button');button.type='button';button.className='desktop-library-item';button.dataset.desktopField=field.id;
    const title=document.createElement('strong');title.textContent=field.label||'Campo';
    const detail=document.createElement('span');detail.textContent=Array.isArray(field.geometry)&&field.geometry.length>=4?'Perimetro salvato':'Perimetro da completare';
    button.append(title,detail);button.addEventListener('click',()=>{api.selectField?.(field.id);close();});return button;
  }
  function projectButton(item){
    const button=document.createElement('button');button.type='button';button.className='desktop-library-item';button.dataset.desktopProject=item.id;
    const title=document.createElement('strong');title.textContent=item.name||'Progetto';
    const fields=(item.project?.fields??[]).filter((field)=>Array.isArray(field?.geometry)&&field.geometry.length>=4).length;
    const detail=document.createElement('span');detail.textContent=`${fields} campi · ${item.savedAt?new Date(item.savedAt).toLocaleDateString('it-IT'):'bozza locale'}`;
    button.append(title,detail);button.addEventListener('click',()=>{api.loadProject?.(item);close();});return button;
  }
  function render(){
    if(!root)return;
    root.querySelector('h2').textContent=mode==='fields'?'Campi del progetto':'Archivio progetti';
    root.querySelector('#desktop-library-new').hidden=mode!=='projects';
    root.querySelector('#desktop-library-save').hidden=mode!=='projects';
    const list=root.querySelector('.desktop-library-list');list.replaceChildren();
    const items=mode==='fields'?(api.getFields?.()??[]):(api.getProjects?.()??[]);
    if(!items.length){const empty=document.createElement('p');empty.className='desktop-library-empty';empty.textContent=mode==='fields'?'Nessun campo disegnato.':'Nessun progetto archiviato.';list.append(empty);return;}
    for(const item of items)list.append(mode==='fields'?fieldButton(item):projectButton(item));
  }
  function open(next){if(!api.isDesktop?.())return;mode=next;root.hidden=false;render();}
  function mount(){
    if(root)return;
    const actions=document.querySelector('.topbar-actions');if(!actions)return;
    const fields=document.createElement('button');fields.id='desktop-fields-trigger';fields.type='button';fields.textContent='Campi';
    const projects=document.createElement('button');projects.id='desktop-projects-trigger';projects.type='button';projects.textContent='Progetti';
    fields.addEventListener('click',()=>open('fields'));projects.addEventListener('click',()=>open('projects'));actions.prepend(fields,projects);
    root=document.createElement('section');root.id='desktop-library';root.className='desktop-library';root.hidden=true;
    root.innerHTML='<div class="desktop-library-card" role="dialog" aria-modal="true" aria-labelledby="desktop-library-title"><header><h2 id="desktop-library-title"></h2><button id="desktop-library-close" type="button" aria-label="Chiudi">×</button></header><div class="desktop-library-actions"><button id="desktop-library-refresh" type="button">↻ Aggiorna</button><button id="desktop-library-save" type="button">Salva progetto</button><button id="desktop-library-new" type="button">+ Nuovo progetto</button></div><div class="desktop-library-list"></div><p id="desktop-library-feedback" role="status"></p></div>';
    document.body.append(root);
    root.querySelector('#desktop-library-close').addEventListener('click',close);
    root.addEventListener('click',(event)=>{if(event.target===root)close();});
    const refreshButton=root.querySelector('#desktop-library-refresh');
    refreshButton.addEventListener('click',async()=>{
      if(busy)return;busy=true;refreshButton.disabled=true;
      try{await api.refreshProjects?.();render();root.querySelector('#desktop-library-feedback').textContent='Sincronizzazione completata.';}
      catch(error){root.querySelector('#desktop-library-feedback').textContent=`Sincronizzazione non riuscita: ${text(error.message)}`;}
      finally{busy=false;refreshButton.disabled=false;}
    });
    root.querySelector('#desktop-library-save').addEventListener('click',async()=>{await api.saveProject?.();render();});
    root.querySelector('#desktop-library-new').addEventListener('click',()=>{api.newProject?.();close();});
  }
  return{mount,open,close,render};
}
