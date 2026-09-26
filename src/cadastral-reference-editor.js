import {normalizeCadastralReferences,manualCadastralReference} from './cadastral-references.js?v=54';

export function createCadastralReferenceEditor({document,container,onChange=()=>{}}) {
  if(!container||!document)throw new TypeError('Editor container required');
  let legacy=[];
  const rows=()=>[...container.querySelectorAll('[data-reference-row]')];
  const values=()=>normalizeCadastralReferences([...legacy,...rows().map(row=>manualCadastralReference(Object.fromEntries(['municipality','sheet','parcel'].map(key=>[key,row.querySelector(`[name="${key}"]`)?.value]))))]);
  function appendRow(ref={}) {
    const row=document.createElement('div');row.dataset.referenceRow='';row.className='cadastral-reference-row';
    for(const [name,title] of [['municipality','Comune'],['sheet','Foglio'],['parcel','Particella']]) {
      const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.className='control-input';input.name=name;input.value=String(ref[name]??'');input.setAttribute('aria-label',`${title} riferimento catastale ${rows().length+1}`);label.append(input);row.append(label);
    }
    const remove=document.createElement('button');remove.type='button';remove.dataset.removeReference='';remove.textContent='Rimuovi';row.append(remove);container.insertBefore(row,container.querySelector('[data-add-reference]'));
  }
  function emit(){onChange(values());}
  function click(event){if(event.target.closest('[data-add-reference]')){appendRow();emit();return;}const remove=event.target.closest('[data-remove-reference]');if(remove){remove.closest('[data-reference-row]')?.remove();if(!rows().length)appendRow();emit();}}
  function change(event){if(event.target.matches?.('input[name]'))emit();}
  container.addEventListener('click',click);container.addEventListener('change',change);
  return {
    render(refs,{municipality=''}={}) {
      const normalized=normalizeCadastralReferences(refs);
      legacy=normalized.filter(ref=>ref.source!=='manual'&&!['municipality','sheet','parcel'].some(key=>key in ref));
      container.replaceChildren();const manual=normalized.filter(ref=>!legacy.includes(ref)&&('municipality' in ref||ref.source==='manual'));
      for(const ref of manual.length?manual:[{municipality}])appendRow(ref);
      const add=document.createElement('button');add.type='button';add.dataset.addReference='';add.textContent='+ Aggiungi mappale';container.append(add);
    },
    destroy(){container.removeEventListener('click',click);container.removeEventListener('change',change);container.replaceChildren();}
  };
}
