const paths={camera:'M4 6h4l2-3h4l2 3h4v15H4zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',photos:'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M16 7h.01',files:'M6 2h8l4 4v16H6zM14 2v5h4',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const contextKey=c=>JSON.stringify([c?.ownerId??null,c?.guestId??'guest',c?.projectId,c?.fieldId,c?.environment??'LIVE',Boolean(c?.readOnly)]);
const sizeLabel=bytes=>bytes>=1048576?`${(bytes/1048576).toLocaleString('it-IT',{maximumFractionDigits:1})} MB`:`${Math.ceil((bytes||0)/1024)} KB`;
const dateLabel=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'}):'';};

export function createFieldMediaUI({document=globalThis.document,getContext,getStore,ensureSaved=async()=>{}}){
 const root=document.createElement('section');root.id='field-media';root.className='field-media';root.hidden=true;
 root.innerHTML=`<div class="field-media-card" role="dialog" aria-modal="true" aria-labelledby="field-media-title"><header><div><h2 id="field-media-title">Media</h2><p class="field-media-storage"></p></div><button type="button" data-media-close aria-label="Chiudi Media">×</button></header><div class="field-media-upload"><div class="field-media-upload-actions">${[['camera','Fotocamera'],['photos','Foto'],['files','File']].map(([key,label])=>`<button type="button" data-media-pick="${key}">${icon(key)}<span>${label}</span></button>`).join('')}</div><input type="file" data-media-input="camera" accept="image/*" capture="environment" hidden><input type="file" data-media-input="photos" accept="image/*" multiple hidden><input type="file" data-media-input="files" multiple hidden><label class="field-media-note">Nota visita <span>(facoltativa)</span><input data-media-note maxlength="1000" placeholder="Es. Controllo estivo dell’impianto"></label></div><p class="field-media-feedback" role="status" aria-live="polite"></p><div class="field-media-preview" hidden></div><div class="field-media-list"></div></div>`;
 document.body.append(root);
 let active=null,store=null,items=[],generation=0,previewGeneration=0,busy=false,origin=null;const urls=new Set(),previewURLs=new Set();
 const $=selector=>root.querySelector(selector);
 const valid=(token=generation)=>!root.hidden&&token===generation&&contextKey(getContext())===contextKey(active);
 const feedback=text=>{$('.field-media-feedback').textContent=text;};
 function clearPreview(){previewGeneration++;for(const url of previewURLs){store?.releaseURL?.(url);urls.delete(url);}previewURLs.clear();$('.field-media-preview').replaceChildren();$('.field-media-preview').hidden=true;}
 function release(){clearPreview();for(const url of urls)store?.releaseURL?.(url);urls.clear();}
 function close(){generation++;root.hidden=true;release();$('.field-media-list').replaceChildren();items=[];active=null;store=null;busy=false;root.removeAttribute('aria-busy');origin?.focus?.({preventScroll:true});}
 function check(){if(!valid()){close();return false;}return true;}
 function setBusy(value){busy=value;root.setAttribute('aria-busy',String(value));root.querySelectorAll('[data-media-pick],[data-media-delete]').forEach(button=>button.disabled=value);}
 async function trackedURL(id,options,token,previewRequest=null){const source=store,url=await source.getURL(id,options);if(!valid(token)||(previewRequest!==null&&previewRequest!==previewGeneration)){source.releaseURL?.(url);return null;}urls.add(url);if(previewRequest!==null)previewURLs.add(url);return url;}
 async function render(){
  const token=generation,nextItems=await store.list();if(!valid(token))return;items=nextItems;release();const list=$('.field-media-list');list.replaceChildren();
  if(!items.length){const empty=document.createElement('p');empty.className='field-media-empty';empty.textContent='Nessun media. Aggiungi foto e documenti per registrare le visite al campo.';list.append(empty);return;}
  for(const item of items){
   const card=document.createElement('article');card.className='field-media-item';card.dataset.mediaId=item.id;
   const open=document.createElement('button');open.type='button';open.className='field-media-item-open';open.setAttribute('aria-label',`Apri ${item.name}`);
   const image=document.createElement('span');image.className='field-media-thumbnail';image.innerHTML=icon(item.kind==='photo'?'photos':'files');
   const info=document.createElement('span');info.className='field-media-info';const name=document.createElement('strong');name.textContent=item.name;
   const date=document.createElement('time');date.dateTime=item.createdAt;date.textContent=`${dateLabel(item.createdAt)} · ${sizeLabel(item.size)}${item.status==='pending'?' · Caricamento incompleto':''}`;info.append(name,date);
   if(item.note){const note=document.createElement('span');note.textContent=item.note;note.className='field-media-item-note';info.append(note);}
   open.append(image,info);if(item.status==='pending'){open.disabled=true;open.setAttribute('aria-label',`Caricamento incompleto: ${item.name}. Elimina e riprova.`);}else open.addEventListener('click',()=>preview(item.id));card.append(open);
   if(!active.readOnly){const remove=document.createElement('button');remove.type='button';remove.dataset.mediaDelete=item.id;remove.className='field-media-delete';remove.innerHTML=icon('trash');remove.setAttribute('aria-label',`Elimina ${item.name}`);remove.addEventListener('click',()=>removeItem(item));card.append(remove);}
   list.append(card);
   if(item.kind==='photo'&&item.status!=='pending')trackedURL(item.id,{},token).then(url=>{if(!url||!valid(token)||!card.isConnected)return;const img=document.createElement('img');img.alt=item.name;img.loading='lazy';img.src=url;image.replaceChildren(img);}).catch(()=>{});
  }
 }
 async function open(){
  close();origin=document.activeElement;active={...getContext()};if(!active.projectId||!active.fieldId)return;
  store=getStore();generation++;root.hidden=false;const token=generation;
  $('#field-media-title').textContent=`Media · ${active.fieldName||'Campo'}`;
  $('.field-media-storage').textContent=(active.ownerId?'Foto e file privati nel profilo.':'Foto e file salvati su questo dispositivo.')+' Max 25 MB per file.';
  $('.field-media-upload').hidden=Boolean(active.readOnly);$('[data-media-note]').value='';feedback('Caricamento…');$('[data-media-close]').focus?.({preventScroll:true});
  try{await render();if(valid(token))feedback('');}catch(error){if(valid(token))feedback(error.code==='PROJECT_NOT_SAVED'?'Aggiungi i primi Media: il campo verrà salvato nel profilo.':error.message||'Media non disponibili. Riprova.');}
 }
 async function uploadFiles(files,source='files'){
  if(busy||!check()||active.readOnly||!files.length)return;
  const token=generation,context={...active},note=$('[data-media-note]').value.trim();setBusy(true);feedback('Salvataggio…');
  try{
   if(context.ownerId)await ensureSaved(context);if(!valid(token))return;
   for(const file of files){if(!valid(token))return;await store.upload(file,{kind:source==='files'?'file':'photo',note});}
   if(!valid(token))return;await render();if(valid(token))feedback(`${files.length===1?'Media salvato':'Media salvati'}.`);
  }catch(error){if(valid(token)){feedback(`Salvataggio non riuscito: ${error.message||'riprova'}`);try{await render();}catch{}}}
  finally{if(valid(token))setBusy(false);}
 }
 async function preview(id){
  if(!check())return;const item=items.find(value=>value.id===id);if(!item||item.status==='pending')return;const token=generation;clearPreview();const request=previewGeneration;
  try{
   const url=await trackedURL(id,{download:item.kind!=='photo'},token,request);if(!url)return;
   const container=$('.field-media-preview');container.replaceChildren();container.hidden=false;
   const back=document.createElement('button');back.type='button';back.textContent='← Torna ai media';back.addEventListener('click',clearPreview);container.append(back);
   if(item.kind==='photo'){const img=document.createElement('img');img.src=url;img.alt=item.name;container.append(img);}
   const link=document.createElement('a');link.textContent=item.kind==='photo'?'Scarica foto':'Apri / scarica file';link.download=item.name;link.target='_blank';link.rel='noopener noreferrer';
   if(item.kind==='photo'){const download=await trackedURL(id,{download:true},token,request);if(!download)return;link.href=download;}else link.href=url;
   link.addEventListener('click',async event=>{event.preventDefault();try{const fresh=await trackedURL(id,{download:true},token,request);if(!fresh)return;const download=document.createElement('a');download.href=fresh;download.download=item.name;download.rel='noopener noreferrer';document.body.append(download);download.click();download.remove();}catch(error){if(valid(token)&&request===previewGeneration)feedback(`Download non riuscito: ${error.message||'riprova'}`);}});
   container.append(link);container.scrollIntoView?.({block:'nearest'});feedback('');
  }catch(error){if(valid(token))feedback(`Apertura non riuscita: ${error.message||'riprova'}`);}
 }
 async function removeItem(item){
  if(busy||!check()||active.readOnly)return;
  if(globalThis.confirm&&!globalThis.confirm(`Eliminare “${item.name}” da questo campo?`))return;
  const token=generation;setBusy(true);
  try{await store.delete(item.id);if(valid(token)){await render();feedback('Media eliminato.');}}
  catch(error){if(valid(token))feedback(`Eliminazione non riuscita: ${error.message||'riprova'}`);}
  finally{if(valid(token))setBusy(false);}
 }
 root.addEventListener('click',event=>{if(event.target===root||event.target.closest?.('[data-media-close]'))close();const button=event.target.closest?.('[data-media-pick]');if(button&&!busy)$(`[data-media-input="${button.dataset.mediaPick}"]`).click();});
 for(const input of root.querySelectorAll('[data-media-input]'))input.addEventListener('change',()=>{const files=[...(input.files??[])];input.value='';uploadFiles(files,input.dataset.mediaInput);});
 const keyHandler=event=>{if(root.hidden)return;if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const controls=[...root.querySelectorAll('button,input,a[href]')].filter(node=>!node.disabled&&!node.hidden&&!node.closest('[hidden]'));const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus?.();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus?.();}}};
 document.addEventListener('keydown',keyHandler);
 return {open,close,preview,uploadFiles,contextChanged(){if(!root.hidden&&!valid())close();},dispose(){close();document.removeEventListener('keydown',keyHandler);root.remove();}};
}
