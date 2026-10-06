export function mountToolMenu({document=globalThis.document,onCounts,onError=()=>{}}={}){
  const desktop=document.querySelector('.brand'),mobile=document.querySelector('.mobile-brand'),editor=document.querySelector('.mobile-editor-top');
  if(!desktop||!mobile||!editor)throw new Error('Intestazioni Vivai Obice non disponibili.');
  const triggers=[];
  const panel=document.createElement('div');panel.id='tool-selector';panel.className='tool-selector';panel.hidden=true;panel.setAttribute('role','menu');panel.setAttribute('aria-label','Strumenti Vivai Obice');
  const selected=document.createElement('button');selected.type='button';selected.dataset.tool='configurator';selected.setAttribute('role','menuitem');selected.setAttribute('aria-current','page');selected.textContent='✓ Progetta impianto';
  const counts=document.createElement('button');counts.type='button';counts.dataset.tool='counts';counts.setAttribute('role','menuitem');counts.textContent='Conteggi';
  panel.append(selected,counts);document.body.append(panel);
  const mark=trigger=>{trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls','tool-selector');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Scegli uno strumento Vivai Obice');triggers.push(trigger);};
  mark(desktop);
  const arrow=document.createElement('span');arrow.className='tool-chevron';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');desktop.append(arrow);
  const mobileButton=document.createElement('button');mobileButton.type='button';mobileButton.className='mobile-brand-tool-trigger';mobileButton.append(mobile.querySelector('img'));
  const mobileArrow=arrow.cloneNode(true);mobileButton.append(mobileArrow);mobile.prepend(mobileButton);mark(mobileButton);
  const editorButton=document.createElement('button');editorButton.type='button';editorButton.className='mobile-editor-tool-trigger';
  const editorLogo=mobileButton.querySelector('img').cloneNode(true);editorLogo.alt='';editorButton.append(editorLogo,arrow.cloneNode(true));editor.prepend(editorButton);mark(editorButton);
  let active=null;
  function close(){panel.hidden=true;triggers.forEach(button=>button.setAttribute('aria-expanded','false'));active=null;}
  function open(trigger){
    // Keep mobile options in the same touch surface as their trigger. Safari's
    // missing-click fallback is installed on #mobile-app, not document.body.
    const host=trigger.closest('#mobile-app')??document.body;
    if(panel.parentElement!==host)host.append(panel);
    active=trigger;panel.hidden=false;triggers.forEach(button=>button.setAttribute('aria-expanded',String(button===trigger)));
    const rect=trigger.getBoundingClientRect?.();if(rect){panel.style.left=`${Math.max(8,rect.left)}px`;panel.style.top=`${rect.bottom+6}px`;}selected.focus?.();
  }
  function toggle(event){event.preventDefault?.();if(!panel.hidden&&active===event.currentTarget)close();else open(event.currentTarget);}
  const handlers=[];
  for(const trigger of triggers){const click=event=>toggle(event),key=event=>{if(event.key===' '){event.preventDefault();toggle(event);}};trigger.addEventListener('click',click);trigger.addEventListener('keydown',key);handlers.push([trigger,click,key]);}
  const onSelected=()=>{const focus=active;close();focus?.focus?.();};
  const onCountsClick=()=>{close();Promise.resolve().then(()=>onCounts?.()).catch(onError);};
  selected.addEventListener('click',onSelected);counts.addEventListener('click',onCountsClick);
  const outside=event=>{if(!panel.hidden&&!panel.contains(event.target)&&!triggers.some(trigger=>trigger.contains(event.target)))close();};
  const escape=event=>{if(event.key==='Escape'&&!panel.hidden){const focus=active;close();focus?.focus?.();}};
  document.addEventListener('click',outside);document.addEventListener('keydown',escape);
  return {close,destroy(){close();document.removeEventListener('click',outside);document.removeEventListener('keydown',escape);for(const [trigger,click,key] of handlers){trigger.removeEventListener('click',click);trigger.removeEventListener('keydown',key);}panel.remove();}};
}
