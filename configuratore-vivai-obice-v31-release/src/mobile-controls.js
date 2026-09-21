// Mobile adapters preserve the original controls, their listeners and stored values.
// No replacement or event interception is installed in the desktop layout.
export function createMobileChoices(root, isActive) {
 const doc=root.ownerDocument, entries=new Map();
 let activeSelect=null,returnFocus=null,observer=null;
 const dialog=doc.createElement('section');dialog.id='mobile-choice-dialog';dialog.hidden=true;
 dialog.className='mobile-choice-dialog';dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','mobile-choice-title');
 dialog.innerHTML='<header><strong id="mobile-choice-title"></strong><button type="button" data-choice-close>Chiudi</button></header><label class="mobile-choice-search">Cerca nell’elenco<input id="mobile-choice-search" type="search" autocomplete="off" placeholder="Cerca…" /></label><div class="mobile-choice-options"></div><p class="mobile-choice-empty" hidden>Nessuna voce trovata</p>';
 root.append(dialog);
 const list=dialog.querySelector('.mobile-choice-options'),search=dialog.querySelector('input');
 const emit=(node,type)=>node.dispatchEvent(new doc.defaultView.Event(type,{bubbles:true}));
 function labelOf(node){
  return node.getAttribute('aria-label')||[...node.parentElement.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim()||'Scegli';
 }
 function refresh(entry){
  const {native,button}=entry;button.disabled=native.disabled;
  if(native.tagName==='SELECT'){
   const label=[...native.options].find(o=>o.selected||o.value===native.value)?.textContent||'Da definire';
   if(button.textContent!==label)button.textContent=label;
  }else button.setAttribute('aria-checked',String(Boolean(native.checked)));
 }
 function close(restoreFocus=true){
  dialog.hidden=true;root.classList.remove('mobile-choice-open');
  returnFocus?.setAttribute('aria-expanded','false');activeSelect=null;
  if(restoreFocus&&isActive())returnFocus?.focus?.({preventScroll:true});
  returnFocus=null;
 }
 function filter(){
  const query=search.value.trim().toLocaleLowerCase('it-IT');let count=0;
  for(const button of list.children){button.hidden=!button.textContent.toLocaleLowerCase('it-IT').includes(query);if(!button.hidden)count++;}
  dialog.querySelector('.mobile-choice-empty').hidden=count>0;
 }
 function open(native,button){
  if(!isActive()||native.disabled)return;
  doc.activeElement?.blur?.();activeSelect=native;returnFocus=button;search.value='';
  dialog.querySelector('#mobile-choice-title').textContent=labelOf(native);
  list.replaceChildren();
  for(const option of native.options){
   const choice=doc.createElement('button');choice.type='button';choice.dataset.choiceValue=option.value;
   choice.textContent=option.textContent;choice.disabled=option.disabled||option.parentElement?.disabled===true;
   choice.setAttribute('aria-pressed',String(option.value===native.value));
   choice.addEventListener('click',()=>{
    if(activeSelect!==native||choice.disabled)return;
    // Setting selected also works when dependent clone/rootstock options are rebuilt.
    for(const item of native.options)item.selected=false;
    option.selected=true;
    emit(native,'input');emit(native,'change');sync();close();
   });list.append(choice);
  }
  filter();dialog.hidden=false;root.classList.add('mobile-choice-open');button.setAttribute('aria-expanded','true');
  dialog.querySelector('[data-choice-close]').focus?.({preventScroll:true});
 }
 function sync(){
  if(!isActive())return;
  for(const native of root.querySelectorAll('select,input[type="checkbox"]')){
   if(native.id==='field-select'||!native.id)continue;
   let entry=entries.get(native);
   if(!entry){
    const button=doc.createElement('button');button.type='button';
    entry={native,button,tabindex:native.getAttribute('tabindex'),ariaHidden:native.getAttribute('aria-hidden')};entries.set(native,entry);
    native.classList.add('mobile-native-choice');native.setAttribute('tabindex','-1');native.setAttribute('aria-hidden','true');
    if(native.tagName==='SELECT'){
     button.className='mobile-select-trigger';button.dataset.mobileSelect=native.id;
     button.setAttribute('aria-label',labelOf(native));button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
     button.addEventListener('click',()=>open(native,button));
    }else{
     button.className='mobile-check-toggle';button.dataset.mobileCheckbox=native.id;
     button.setAttribute('role','checkbox');button.setAttribute('aria-label',labelOf(native));
     button.addEventListener('click',()=>{
      if(!isActive()||native.disabled)return;
      native.checked=!native.checked;emit(native,'input');emit(native,'change');refresh(entry);
     });
     // The label text remains a usable target, without double-toggling native input.
     entry.labelClick=event=>{
      if(!isActive()||event.target.closest?.('button,input,select'))return;
      event.preventDefault();button.click();
     };
     native.parentElement.addEventListener('click',entry.labelClick);
    }
    native.after(button);
   }
   refresh(entry);
  }
 }
 function activate(){
  sync();
  if(doc.defaultView.MutationObserver&&!observer){
   observer=new doc.defaultView.MutationObserver(()=>{for(const entry of entries.values())refresh(entry);});
   // Observe originals only; never our rendered labels (avoids observer feedback).
   for(const native of entries.keys())observer.observe(native,{childList:true,subtree:true,attributes:true,attributeFilter:['selected','disabled','checked']});
  }
 }
 function deactivate(){
  close(false);observer?.disconnect();observer=null;
  for(const {native,button,tabindex,ariaHidden,labelClick} of entries.values()){
   button.remove();native.classList.remove('mobile-native-choice');
   for(const [key,value] of [['tabindex',tabindex],['aria-hidden',ariaHidden]])if(value===null)native.removeAttribute(key);else native.setAttribute(key,value);
   if(labelClick)native.parentElement.removeEventListener('click',labelClick);
  }
  entries.clear();
 }
 search.addEventListener('input',filter);
 dialog.querySelector('[data-choice-close]').addEventListener('click',()=>close());
 root.addEventListener('change',()=>{if(isActive())sync();});
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key==='Tab'){
   const items=[...dialog.querySelectorAll('button,input')].filter(n=>!n.hidden&&!n.disabled);
   const first=items[0],last=items[items.length-1];
   if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
  }
 });
 return {activate,deactivate,sync,close};
}

export function installMobileKeyboard(root,isActive){
 const doc=root.ownerDocument,viewport=globalThis.visualViewport;
 let focused=null,framePending=false;
 function update(){
  framePending=false;if(!isActive())return;
  const height=viewport?.height||globalThis.innerHeight;
  if(!height||viewport?.scale>1.05)return;
  const top=viewport?.offsetTop||0;
  root.style.setProperty('--mobile-viewport-height',`${height}px`);
  root.style.setProperty('--mobile-viewport-top',`${top}px`);
  const keyboard=Boolean(focused&&(globalThis.innerHeight-height>120));
  root.classList.toggle('mobile-keyboard-open',keyboard);
  if(!focused||!root.contains(focused))return;
  const scroller=focused.closest('.mobile-choice-dialog,.mobile-sheet,#mobile-pages');
  if(!scroller||!focused.getBoundingClientRect)return;
  const rect=focused.getBoundingClientRect(),bounds=scroller.getBoundingClientRect();
  const visibleBottom=Math.min(top+height,bounds.bottom)-12,visibleTop=Math.max(top,bounds.top)+12;
  if(rect.bottom>visibleBottom)scroller.scrollTop+=rect.bottom-visibleBottom;
  else if(rect.top<visibleTop)scroller.scrollTop-=visibleTop-rect.top;
 }
 function schedule(){
  if(framePending)return;
  if(globalThis.requestAnimationFrame){framePending=true;globalThis.requestAnimationFrame(update);}else update();
 }
 root.addEventListener('focusin',event=>{
  focused=event.target.matches?.('textarea,input:not([type="checkbox"]):not([type="range"]):not([type="button"])')?event.target:null;
  schedule();
 });
 root.addEventListener('focusout',event=>{if(event.target===focused)focused=null;schedule();});
 viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);
 globalThis.addEventListener?.('resize',schedule);
 return {update:schedule,reset(){focused=null;root.classList.remove('mobile-keyboard-open');root.style.removeProperty('--mobile-viewport-height');root.style.removeProperty('--mobile-viewport-top');}};
}
