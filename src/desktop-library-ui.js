import {createSaveFeedback} from './desktop-ux.js?v=36';
const text=(value)=>String(value??'');

export function createDesktopLibraryUI(api){
  const document=api.document??globalThis.document;
  let root=null,mode='fields',busy=false;
  const expandedProjects=new Set();
  let draggedField=null,pendingMove=null;

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
    main.tabIndex=0;main.setAttribute('role','button');main.setAttribute('aria-expanded',String(expandedProjects.has(item.id)));
    const toggle=()=>{expandedProjects.has(item.id)?expandedProjects.delete(item.id):expandedProjects.add(item.id);render();};
    main.addEventListener('click',toggle);
    main.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
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
    actions.append(open,rename,remove);row.append(main,actions);
    row.dataset.expanded=String(expandedProjects.has(item.id));
    row.addEventListener('dragover',(event)=>{
      if(!draggedField||draggedField.sourceItem.id===item.id)return;
      event.preventDefault();row.classList.add('is-drop-target');
    });
    row.addEventListener('dragleave',()=>row.classList.remove('is-drop-target'));
    row.addEventListener('drop',(event)=>{
      event.preventDefault();row.classList.remove('is-drop-target');
      if(draggedField&&draggedField.sourceItem.id!==item.id)openMoveDialog(draggedField.sourceItem,item,draggedField.field,true);
      draggedField=null;
    });
    if(expandedProjects.has(item.id))row.append(projectFields(item));
    return row;
  }
  function fieldMetrics(field){return api.getFieldMetrics?.(field)??field?.metrics??{};}
  function projectFields(item){
    const list=document.createElement('div');list.className='desktop-project-fields';
    const fields=item.project?.fields??[];
    for(const field of fields){
      const fieldRow=document.createElement('div');fieldRow.className='desktop-project-field';fieldRow.dataset.projectField=`${item.id}:${field.id}`;
      const handle=document.createElement('button');handle.type='button';handle.className='desktop-project-field-handle';handle.draggable=true;handle.title='Trascina in un altro progetto';handle.setAttribute('aria-label',`Sposta ${field.label||'Campo'}`);handle.textContent='↕';
      handle.addEventListener('dragstart',(event)=>{draggedField={sourceItem:item,field};event.dataTransfer?.setData?.('text/plain',`${item.id}:${field.id}`);event.dataTransfer&&(event.dataTransfer.effectAllowed='move');});
      handle.addEventListener('dragend',()=>{draggedField=null;for(const target of root.querySelectorAll('.is-drop-target'))target.classList.remove('is-drop-target');});
      const content=document.createElement('div');content.className='desktop-project-field-main';
      const title=document.createElement('strong');title.textContent=field.label||'Campo';
      const metrics=fieldMetrics(field),area=Number(metrics.grossAreaM2??metrics.areaM2??0);
      const parts=[field.plantingStatus==='planted'?'Impianto realizzato':'Da realizzare'];
      if(field.locationLabel||field.municipality)parts.push(field.locationLabel||field.municipality);
      if(area>0)parts.push(`${Math.round(area).toLocaleString('it-IT')} m²`);
      const material=[field.grapeVariety,field.cloneSelection,field.rootstock].map(text).map(value=>value.trim()).filter(Boolean).join(' · ');
      if(material)parts.push(material);
      const detail=document.createElement('span');detail.textContent=parts.join(' · ');content.append(title,detail);
      const move=document.createElement('button');move.type='button';move.dataset.fieldMove='';move.textContent='Sposta in…';
      move.disabled=!item.cloud?.projectId||!(api.getProjects?.()??[]).some(project=>project.id!==item.id&&project.cloud?.projectId);
      move.addEventListener('click',()=>openMoveDialog(item,null,field,false));
      fieldRow.append(handle,content,move);list.append(fieldRow);
    }
    if(!fields.length){const empty=document.createElement('p');empty.className='desktop-library-empty';empty.textContent='Nessun campo nel progetto.';list.append(empty);}
    return list;
  }
  function openMoveDialog(sourceItem,targetItem,field,confirmedTarget=false){
    pendingMove={sourceItem,targetItem,field};
    const dialog=root.querySelector('#desktop-field-move-dialog'),select=dialog.querySelector('select');
    select.replaceChildren();
    for(const project of api.getProjects?.()??[]){
      if(project.id===sourceItem.id||!project.cloud?.projectId)continue;
      const option=document.createElement('option');option.value=project.id;option.textContent=project.name||'Progetto';select.append(option);
    }
    if(targetItem)select.value=targetItem.id;
    dialog.hidden=false;dialog.querySelector('[data-move-error]').textContent='';
    dialog.querySelector('[data-move-message]').textContent='Scegli il progetto di destinazione.';
    dialog.querySelector('[data-move-confirm]').hidden=true;
    dialog.querySelector('[data-move-next]').hidden=false;
    if(confirmedTarget)prepareMoveConfirmation();
  }
  function prepareMoveConfirmation(){
    const dialog=root.querySelector('#desktop-field-move-dialog'),selectedId=dialog.querySelector('select').value;
    const targetItem=(api.getProjects?.()??[]).find(project=>project.id===selectedId);
    if(!pendingMove||!targetItem)return;
    pendingMove={...pendingMove,targetItem};
    dialog.querySelector('[data-move-message]').textContent=`Spostare “${pendingMove.field.label||'Campo'}” dal progetto “${pendingMove.sourceItem.name||'Progetto'}” al progetto “${targetItem.name||'Progetto'}”?`;
    dialog.querySelector('[data-move-next]').hidden=true;dialog.querySelector('[data-move-confirm]').hidden=false;
  }
  function closeMoveDialog(){const dialog=root?.querySelector('#desktop-field-move-dialog');if(dialog)dialog.hidden=true;pendingMove=null;}
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
    root.innerHTML='<div class="desktop-library-card" role="dialog" aria-modal="true" aria-labelledby="desktop-library-title"><header><h2 id="desktop-library-title"></h2><button id="desktop-library-close" type="button" aria-label="Chiudi">×</button></header><div class="desktop-library-actions"><button id="desktop-library-refresh" type="button">↻ Aggiorna</button><button id="desktop-library-save" type="button">Salva progetto</button><button id="desktop-library-new" type="button">+ Nuovo progetto</button></div><div class="desktop-library-list"></div><p id="desktop-library-feedback" role="status"></p></div><section id="desktop-field-move-dialog" class="desktop-field-move-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-field-move-title" hidden><div><h3 id="desktop-field-move-title">Sposta campo</h3><p data-move-message></p><label>Progetto di destinazione<select></select></label><p data-move-error role="alert"></p><footer><button type="button" data-move-cancel>Annulla</button><button type="button" data-move-next>Continua</button><button type="button" data-move-confirm hidden>Sposta campo</button></footer></div></section>';
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
    root.querySelector('[data-move-cancel]').addEventListener('click',closeMoveDialog);
    root.querySelector('[data-move-next]').addEventListener('click',prepareMoveConfirmation);
    root.querySelector('[data-move-confirm]').addEventListener('click',async()=>{
      if(!pendingMove?.targetItem)return;
      const dialog=root.querySelector('#desktop-field-move-dialog'),confirm=dialog.querySelector('[data-move-confirm]');confirm.disabled=true;
      try{
        await api.moveField?.(pendingMove.sourceItem,pendingMove.targetItem,pendingMove.field);
        closeMoveDialog();render();root.querySelector('#desktop-library-feedback').textContent='Campo spostato correttamente.';
      }catch(error){dialog.querySelector('[data-move-error]').textContent=`Spostamento non riuscito: ${text(error.message)}`;}
      finally{confirm.disabled=false;}
    });
  }
  return{mount,open,close,render};
}
