import {createSaveFeedback} from './desktop-ux.js?v=36';
const text=(value)=>String(value??'');

export function createDesktopLibraryUI(api){
  const document=api.document??globalThis.document;
  let root=null,mode='fields',busy=false;

  function close(){if(root)root.hidden=true;}
  function fieldButton(field){
    const row=document.createElement('article');row.className='desktop-library-item';row.dataset.desktopField=field.id;
    const main=document.createElement('div');main.className='desktop-library-item-main';
    const title=document.createElement('strong');title.textContent=field.label||'Campo';
    const detail=document.createElement('span');detail.textContent=Array.isArray(field.geometry)&&field.geometry.length>=4?'Perimetro salvato':'Perimetro da completare';
    main.append(title,detail);
    const actions=document.createElement('div');actions.className='desktop-library-item-actions';
    const open=document.createElement('button');open.type='button';open.dataset.fieldAction='open';open.textContent='Apri';open.addEventListener('click',()=>{api.selectField?.(field.id);close();});
    const rename=document.createElement('button');rename.type='button';rename.dataset.fieldAction='rename';rename.textContent='Rinomina';
    const remove=document.createElement('button');remove.type='button';remove.dataset.fieldAction='delete';remove.className='danger-soft';remove.textContent='Elimina';
    rename.addEventListener('click',()=>{
      if(row.querySelector('.desktop-library-rename'))return;
      const editor=document.createElement('div');editor.className='desktop-library-rename';
      const input=document.createElement('input');input.value=field.label||'Campo';input.maxLength=80;input.setAttribute('aria-label','Nuovo nome campo');
      const confirm=document.createElement('button');confirm.type='button';confirm.dataset.fieldAction='confirm-rename';confirm.textContent='Salva';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';cancel.addEventListener('click',()=>editor.remove());
      confirm.addEventListener('click',async()=>{try{await api.renameField?.(field,input.value);render();root.querySelector('#desktop-library-feedback').textContent='Campo rinominato.';}catch(error){root.querySelector('#desktop-library-feedback').textContent=`Rinomina non riuscita: ${text(error.message)}`;}});
      editor.append(input,confirm,cancel);row.append(editor);input.focus?.();input.select?.();
    });
    remove.addEventListener('click',async()=>{
      const ask=api.confirm??globalThis.confirm;if(ask&&!ask(`Eliminare il campo “${field.label||'Campo'}”?`))return;
      try{await api.deleteField?.(field);render();root.querySelector('#desktop-library-feedback').textContent='Campo eliminato.';}catch(error){root.querySelector('#desktop-library-feedback').textContent=`Eliminazione non riuscita: ${text(error.message)}`;}
    });
    actions.append(open,rename,remove);row.append(main,actions);return row;
  }
  function projectButton(item){
    const row=document.createElement('article');row.className='desktop-library-item';row.dataset.desktopProject=item.id;
    const main=document.createElement('div');main.className='desktop-library-item-main';
    const title=document.createElement('strong');title.textContent=item.name||'Progetto';
    const fields=(item.project?.fields??[]).filter((field)=>Array.isArray(field?.geometry)&&field.geometry.length>=4).length;
    const detail=document.createElement('span');detail.textContent=`${fields} campi · ${item.savedAt?new Date(item.savedAt).toLocaleDateString('it-IT'):'bozza locale'}`;
    main.append(title,detail);
    const actions=document.createElement('div');actions.className='desktop-library-item-actions';
    const open=document.createElement('button');open.type='button';open.dataset.projectAction='open';open.textContent='Apri';open.addEventListener('click',()=>{api.loadProject?.(item);close();});
    const rename=document.createElement('button');rename.type='button';rename.dataset.projectAction='rename';rename.textContent='Rinomina';
    const remove=document.createElement('button');remove.type='button';remove.dataset.projectAction='delete';remove.className='danger-soft';remove.textContent='Elimina';
    rename.addEventListener('click',()=>{
      if(row.querySelector('.desktop-library-rename'))return;
      const editor=document.createElement('div');editor.className='desktop-library-rename';
      const input=document.createElement('input');input.value=item.name||'Progetto';input.maxLength=80;input.setAttribute('aria-label','Nuovo nome progetto');
      const confirm=document.createElement('button');confirm.type='button';confirm.dataset.projectAction='confirm-rename';confirm.textContent='Salva';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';cancel.addEventListener('click',()=>editor.remove());
      confirm.addEventListener('click',async()=>{try{await api.renameProject?.(item,input.value);render();root.querySelector('#desktop-library-feedback').textContent='Progetto rinominato.';}catch(error){root.querySelector('#desktop-library-feedback').textContent=`Rinomina non riuscita: ${text(error.message)}`;}});
      editor.append(input,confirm,cancel);row.append(editor);input.focus?.();input.select?.();
    });
    remove.addEventListener('click',async()=>{
      const ask=api.confirm??globalThis.confirm;if(ask&&!ask(`Eliminare il progetto “${item.name||'Progetto'}”?`))return;
      try{await api.deleteProject?.(item);render();root.querySelector('#desktop-library-feedback').textContent='Progetto eliminato.';}catch(error){root.querySelector('#desktop-library-feedback').textContent=`Eliminazione non riuscita: ${text(error.message)}`;}
    });
    actions.append(open,rename,remove);row.append(main,actions);return row;
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
    const saveButton=root.querySelector('#desktop-library-save'),saveFeedback=createSaveFeedback(saveButton,{idleLabel:'Salva progetto'});
    saveButton.addEventListener('click',async()=>{
      saveFeedback.saving();
      try{await api.saveProject?.();render();saveFeedback.saved();root.querySelector('#desktop-library-feedback').textContent='Progetto salvato correttamente.';}
      catch(error){saveFeedback.error();root.querySelector('#desktop-library-feedback').textContent=`Salvataggio non riuscito: ${text(error.message)}`;}
    });
    root.querySelector('#desktop-library-new').addEventListener('click',()=>{api.newProject?.();close();});
  }
  return{mount,open,close,render};
}
