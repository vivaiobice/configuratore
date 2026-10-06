import {projectSummaryText} from './project-summary.js?v=1.3.1-prova.1';
import {renderProjectDiagramSvg} from './report-diagram.js?v=1.3.1-prova.1';
const text=(value)=>String(value??'');
const ICON={print:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6zM17 12h1"/></svg>',mail:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>',edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16ZM13.5 6.5l4 4"/></svg>',save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h14l3 3v15H3V3h1Zm3 0v7h10V3M7 21v-8h10v8"/></svg>',refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.5-5.7M20 4v6h-6"/></svg>',new:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',expand:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'};
function setIcon(button,name,label){button.innerHTML=ICON[name];button.title=label;button.setAttribute('aria-label',label);button.classList.add('library-icon-action');return button;}

export function createDesktopLibraryUI(api){
  const document=api.document??globalThis.document;
  let root=null,mode='fields',busy=false;
  const expandedProjects=new Set();
  let draggedField=null,pendingMove=null;
  const notice=message=>{root.querySelector('#desktop-library-feedback').textContent=message;};

  function close(){if(root)root.hidden=true;}
  function fieldButton(field){
    const row=document.createElement('article');row.className='desktop-library-item desktop-field-card';row.dataset.desktopField=field.id;
    const main=document.createElement('button');main.type='button';main.className='desktop-library-item-main';main.setAttribute('aria-label',`Apri il campo ${field.label||'Campo'}`);
    const thumbnail=document.createElement('div');thumbnail.className='desktop-field-thumbnail';
    thumbnail.innerHTML=renderProjectDiagramSvg({polygon:field.geometry,rows:fieldMetrics(field).rows??[]});
    const content=document.createElement('div');content.className='desktop-field-info';
    const title=document.createElement('strong');title.textContent=field.label||'Campo';
    const metrics=fieldMetrics(field),detail=document.createElement('span');
    detail.textContent=`${metrics.terrainStatus==='invalid'?'Da rivedere · — barbatelle comm. · — filari':`${(Number(metrics.commercialPlants25)||0).toLocaleString('it-IT')} barbatelle comm. · ${(Number(metrics.rowCount)||0).toLocaleString('it-IT')} filari`} · ${field.grapeVariety||'Vitigno da definire'}`;
    content.append(title,detail);main.append(thumbnail,content);main.addEventListener('click',()=>{api.selectField?.(field.id);close();});
    let countControls=null;
    if(api.countsEnabled){
      countControls=document.createElement('div');countControls.className='desktop-field-count-controls';
      const count=document.createElement('button');count.type='button';count.className='desktop-field-count-action';count.dataset.fieldAction='new-count';
      count.textContent='＋ Conteggio';count.title=`Nuovo conteggio per ${field.label||'Campo'}`;
      count.addEventListener('click',()=>Promise.resolve().then(()=>api.openCountsForField?.(field.id)).catch(error=>notice(error.message||'Conteggi non disponibile.')));
      countControls.append(count);
      if(api.loadCountsForField){
        const summary=document.createElement('div');summary.className='desktop-field-count-summary';summary.setAttribute('aria-label',`Conteggi di ${field.label||'Campo'}`);countControls.append(summary);
        Promise.resolve().then(()=>api.loadCountsForField(field.id)).then(result=>{
          if(!row.isConnected||!result)return;
          summary.replaceChildren();
          for(const category of result.categories??[]){
            if(!category.items?.length)continue;
            const heading=document.createElement('strong');heading.textContent=category.category==='plants'?'Barbatelle':category.category==='posts'?'Pali':'Altro';summary.append(heading);
            for(const item of category.items){const line=document.createElement('span');line.dataset.countLine=item.countId;line.textContent=`${item.title} · ${item.quantity}`;summary.append(line);}
            const total=document.createElement('small');total.textContent=`Totale: ${category.totalQuantity}`;summary.append(total);
          }
        }).catch(()=>{if(row.isConnected)summary.textContent='Riepilogo Conteggi temporaneamente non disponibile.';});
      }
    }
    const actions=document.createElement('div');actions.className='desktop-library-item-actions';
    const edit=setIcon(document.createElement('button'),'edit',`Modifica ${field.label||'Campo'}`);edit.type='button';edit.dataset.fieldAction='edit';edit.setAttribute('aria-expanded','false');
    const options=document.createElement('div');options.className='desktop-library-edit-options';options.hidden=true;
    edit.addEventListener('click',()=>{options.hidden=!options.hidden;edit.setAttribute('aria-expanded',String(!options.hidden));});
    const duplicate=document.createElement('button');duplicate.type='button';duplicate.dataset.fieldAction='duplicate';duplicate.textContent='Duplica';duplicate.title='Duplica campo';duplicate.addEventListener('click',()=>{try{api.duplicateField?.(field);close();}catch(error){notice(`Duplicazione non riuscita: ${text(error.message)}`);}});
    const rename=document.createElement('button');rename.type='button';rename.dataset.fieldAction='rename';rename.textContent='Rinomina';rename.title='Rinomina campo';
    const remove=document.createElement('button');remove.type='button';remove.dataset.fieldAction='delete';remove.className='danger-soft';remove.textContent='Elimina';remove.title='Elimina campo';
    rename.addEventListener('click',()=>{
      if(row.querySelector('.desktop-library-rename'))return;
      const editor=document.createElement('div');editor.className='desktop-library-rename';
      const input=document.createElement('input');input.value=field.label||'Campo';input.maxLength=80;input.setAttribute('aria-label','Nuovo nome campo');
      const confirm=document.createElement('button');confirm.type='button';confirm.dataset.fieldAction='confirm-rename';confirm.textContent='Salva';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';cancel.addEventListener('click',()=>editor.remove());
      confirm.addEventListener('click',async()=>{try{await api.renameField?.(field,input.value);render();notice('Campo rinominato.');}catch(error){notice(`Rinomina non riuscita: ${text(error.message)}`);}});
      editor.append(input,confirm,cancel);row.append(editor);input.focus?.();input.select?.();
    });
    remove.addEventListener('click',async()=>{
      const ask=api.confirm??globalThis.confirm;if(ask&&!ask(`Eliminare il campo “${field.label||'Campo'}”?`))return;
      try{await api.deleteField?.(field);render();notice('Campo eliminato.');}catch(error){notice(`Eliminazione non riuscita: ${text(error.message)}`);}
    });
    options.append(rename,duplicate,remove);actions.append(edit,options);row.append(main,actions);if(countControls)row.append(countControls);return row;
  }
  function projectButton(item){
    const row=document.createElement('article');row.className='desktop-library-item desktop-project-card';row.dataset.desktopProject=item.id;
    const main=document.createElement('button');main.type='button';main.className='desktop-library-item-main';main.setAttribute('aria-label',`Apri il progetto ${item.name||'Progetto'}`);
    const title=document.createElement('strong');title.textContent=item.name||'Progetto';
    const detail=document.createElement('span');detail.textContent=`${projectSummaryText(item.project,api.getFieldMetrics)} · ${item.savedAt?new Date(item.savedAt).toLocaleDateString('it-IT'):'bozza locale'}`;
    main.append(title,detail);main.addEventListener('click',()=>{api.loadProject?.(item);close();});
    const actions=document.createElement('div');actions.className='desktop-library-item-actions';
    const expand=setIcon(document.createElement('button'),'expand',`Mostra i campi di ${item.name||'Progetto'}`);expand.type='button';expand.dataset.projectAction='expand';expand.setAttribute('aria-expanded',String(expandedProjects.has(item.id)));
    expand.addEventListener('click',()=>{expandedProjects.has(item.id)?expandedProjects.delete(item.id):expandedProjects.add(item.id);render();});
    const edit=setIcon(document.createElement('button'),'edit',`Modifica ${item.name||'Progetto'}`);edit.type='button';edit.dataset.projectAction='edit';edit.setAttribute('aria-expanded','false');
    const options=document.createElement('div');options.className='desktop-library-edit-options';options.hidden=true;
    edit.addEventListener('click',()=>{options.hidden=!options.hidden;edit.setAttribute('aria-expanded',String(!options.hidden));});
    const rename=document.createElement('button');rename.type='button';rename.dataset.projectAction='rename';rename.textContent='Rinomina';rename.title='Rinomina progetto';
    const remove=document.createElement('button');remove.type='button';remove.dataset.projectAction='delete';remove.className='danger-soft';remove.textContent='Elimina';remove.title='Elimina progetto';
    rename.addEventListener('click',()=>{
      if(row.querySelector('.desktop-library-rename'))return;
      const editor=document.createElement('div');editor.className='desktop-library-rename';
      const input=document.createElement('input');input.value=item.name||'Progetto';input.maxLength=80;input.setAttribute('aria-label','Nuovo nome progetto');
      const confirm=document.createElement('button');confirm.type='button';confirm.dataset.projectAction='confirm-rename';confirm.textContent='Salva';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';cancel.addEventListener('click',()=>editor.remove());
      confirm.addEventListener('click',async()=>{try{await api.renameProject?.(item,input.value);render();notice('Progetto rinominato.');}catch(error){notice(`Rinomina non riuscita: ${text(error.message)}`);}});
      editor.append(input,confirm,cancel);row.append(editor);input.focus?.();input.select?.();
    });
    remove.addEventListener('click',async()=>{
      const ask=api.confirm??globalThis.confirm;if(ask&&!ask(`Eliminare il progetto “${item.name||'Progetto'}”?`))return;
      try{await api.deleteProject?.(item);render();notice('Progetto eliminato.');}catch(error){notice(`Eliminazione non riuscita: ${text(error.message)}`);}
    });
    options.append(rename,remove);actions.append(expand,edit,options);row.append(main,actions);
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
    root.querySelector('#desktop-library-save').hidden=false;
    root.querySelector('#desktop-user-projects').hidden=mode!=='projects'||api.isAdmin?.()!==true;
    const projects=api.getProjects?.()??[];
    root.querySelector('#desktop-library-print').disabled=mode==='projects'&&!projects.length;
    root.querySelector('#desktop-library-quote').disabled=mode==='projects'&&!projects.length;
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
    root.innerHTML='<div class="desktop-library-card" role="dialog" aria-modal="true" aria-labelledby="desktop-library-title"><header><h2 id="desktop-library-title"></h2><button id="desktop-library-close" type="button" aria-label="Chiudi">×</button></header><div class="desktop-library-actions"><button id="desktop-library-print" type="button"></button><button id="desktop-library-quote" type="button"></button><button id="desktop-library-refresh" type="button"></button><button id="desktop-library-save" type="button"></button><button id="desktop-library-new" type="button"></button><button id="desktop-user-projects" type="button" hidden>Progetti degli utenti</button></div><div class="desktop-library-list"></div><p id="desktop-library-feedback" role="status"></p></div><section id="desktop-field-move-dialog" class="desktop-field-move-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-field-move-title" hidden><div><h3 id="desktop-field-move-title">Sposta campo</h3><p data-move-message></p><label>Progetto di destinazione<select></select></label><p data-move-error role="alert"></p><footer><button type="button" data-move-cancel>Annulla</button><button type="button" data-move-next>Continua</button><button type="button" data-move-confirm hidden>Sposta campo</button></footer></div></section>';
    document.body.append(root);
    for(const [id,icon,label] of [['desktop-library-print','print','Stampa / PDF del progetto aperto'],['desktop-library-quote','mail','Richiedi preventivo del progetto aperto'],['desktop-library-refresh','refresh','Aggiorna progetti'],['desktop-library-save','save','Salva modifiche'],['desktop-library-new','new','Nuovo progetto']])setIcon(root.querySelector(`#${id}`),icon,label);
    const projectForAction=()=>mode==='fields'?null:(api.getProjects?.()??[]).find(item=>item.id===api.getActiveProjectId?.())??(api.getActiveProjectId?null:(api.getProjects?.()??[])[0]);
    root.querySelector('#desktop-library-print').addEventListener('click',()=>{try{api.openReport?.(projectForAction());}catch(error){notice(error.message||'Documento non disponibile.');}});
    root.querySelector('#desktop-library-quote').addEventListener('click',()=>{try{api.openQuote?.(projectForAction());}catch(error){notice(error.message||'Preventivo non disponibile.');}});
    root.querySelector('#desktop-library-close').addEventListener('click',close);
    root.querySelector('#desktop-user-projects').addEventListener('click',()=>{if(api.isAdmin?.())api.openUserProjects?.();});
    root.addEventListener('click',(event)=>{if(event.target===root)close();});
    const refreshButton=root.querySelector('#desktop-library-refresh');
    refreshButton.addEventListener('click',async()=>{
      if(busy)return;busy=true;refreshButton.disabled=true;
      try{await api.refreshProjects?.();render();root.querySelector('#desktop-library-feedback').textContent='Sincronizzazione completata.';}
      catch(error){root.querySelector('#desktop-library-feedback').textContent=`Sincronizzazione non riuscita: ${text(error.message)}`;}
      finally{busy=false;refreshButton.disabled=false;}
    });
    const saveButton=root.querySelector('#desktop-library-save');
    saveButton.addEventListener('click',async()=>{
      saveButton.disabled=true;saveButton.dataset.saveState='saving';notice('Salvataggio in corso…');
      try{const result=await api.saveProject?.();render();saveButton.dataset.saveState=result?.location==='cloud'?'saved':'local';notice(result?.location==='cloud'?'Progetto salvato online.':'Bozza salvata sul dispositivo.');}
      catch(error){saveButton.dataset.saveState='error';notice(`Salvataggio non riuscito: ${text(error.message)}`);}
      finally{saveButton.disabled=false;}
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
