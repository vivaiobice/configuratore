export function createQuoteUI({document=globalThis.document,getProfile=()=>({}),onSubmit}){
  const dialog=document.createElement('dialog');dialog.className='quote-dialog';dialog.id='quote-dialog';
  dialog.innerHTML=`<form id="quote-form"><div class="dialog-heading"><div><p class="eyebrow">PREVENTIVO</p><h2>Richiesta a Vivai Obice</h2></div><button type="button" class="dialog-close" data-close aria-label="Chiudi">×</button></div>
    <p data-project class="quote-project-name"></p><p>Seleziona i campi da includere. Non sono indicati prezzi; ti contatteremo dopo la richiesta.</p>
    <div data-fields class="quote-field-list"></div>
    <details data-contact><summary>Continua con i tuoi dati</summary>
      <div class="field-grid"><label>Nome<input name="firstName" autocomplete="given-name" required></label><label>Cognome<input name="lastName" autocomplete="family-name" required></label></div>
      <label>Azienda (facoltativa)<input name="companyName" autocomplete="organization"></label>
      <div class="field-grid"><label>Telefono<input name="phone" type="tel" autocomplete="tel" required></label><label>E-mail<input name="email" type="email" autocomplete="email" required></label></div>
      <label class="check-row"><input name="privacy" type="checkbox" required> Ho letto l’informativa privacy per la gestione della richiesta.</label>
      <button class="primary-button wide" type="submit">Invia richiesta preventivo</button>
    </details><p data-feedback class="form-feedback" role="status"></p></form>`;
  document.body.append(dialog);
  let context=null,requestKey=null,sending=false;
  const form=dialog.querySelector('form'),feedback=dialog.querySelector('[data-feedback]');
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{context=null;requestKey=null;feedback.textContent='';});
  dialog.querySelector('[data-fields]').addEventListener('change',()=>{requestKey=null;});
  form.addEventListener('input',()=>{if(!sending)requestKey=null;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||!context)return;
    const fieldIds=[...form.querySelectorAll('[data-field]:checked')].map(node=>node.value);
    if(!fieldIds.length){feedback.textContent='Seleziona almeno un campo.';return;}
    if(!form.reportValidity())return;
    if(!requestKey)requestKey=globalThis.crypto.randomUUID();
    const data=new FormData(form),contact=Object.fromEntries(['firstName','lastName','companyName','phone','email'].map(key=>[key,String(data.get(key)??'').trim()]));
    const button=form.querySelector('[type="submit"]');sending=true;button.disabled=true;feedback.textContent='Invio della richiesta in corso…';
    try{await onSubmit({...context,fieldIds,contact,requestKey});feedback.textContent='Richiesta inviata a Vivai Obice. Ti contatteremo ai recapiti indicati.';button.hidden=true;}
    catch(error){feedback.textContent=error?.message||'Invio non riuscito. Riprova.';}
    finally{sending=false;button.disabled=false;}
  });
  function open({projectItem=null,fieldId=null,project}){
    form.reset();form.querySelector('[type="submit"]').hidden=false;
    feedback.textContent='';requestKey=null;
    const active=projectItem?.project??project;
    context={projectItem,fieldId};
    const name=projectItem?.name??active?.localProjectName??'Il mio impianto';
    dialog.querySelector('[data-project]').textContent=`Progetto: ${name}`;
    const fields=(active?.fields??[]).filter(field=>Array.isArray(field.geometry)&&field.geometry.length>=4);
    if(fieldId&&!fields.some(field=>field.id===fieldId))throw new Error('Il campo non appartiene al progetto selezionato.');
    const list=dialog.querySelector('[data-fields]');list.replaceChildren();
    for(const field of fields){
      const label=document.createElement('label');label.className='check-row';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=field.id;checkbox.dataset.field='';checkbox.checked=!fieldId||field.id===fieldId;
      label.append(checkbox,document.createTextNode(` ${field.label||'Campo'}`));list.append(label);
    }
    if(!fields.length){feedback.textContent='Salva il perimetro di almeno un campo prima di richiedere il preventivo.';}
    const profile=getProfile();
    for(const key of ['firstName','lastName','companyName','phone','email'])form.elements.namedItem(key).value=profile?.[key]??'';
    dialog.querySelector('[data-contact]').open=false;
    dialog.showModal();
  }
  return {open,dialog};
}
