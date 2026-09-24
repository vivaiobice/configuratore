const ENDPOINT='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest';

export function buildAddressSuggestionUrl(query){
  const text=String(query??'').trim();
  if(text.length<4)return null;
  const url=new URL(ENDPOINT);
  url.searchParams.set('f','json');url.searchParams.set('text',text);
  url.searchParams.set('countryCode','ITA');url.searchParams.set('maxSuggestions','5');
  return url.toString();
}

export function normalizeAddressSuggestions(payload){
  return (Array.isArray(payload?.suggestions)?payload.suggestions:[])
    .map(item=>String(item?.text??'').trim()).filter(Boolean).slice(0,5);
}

export function provinceFromAddress(value){
  const text=String(value??'');
  const match=text.match(/\(([A-Z]{2})\)(?=\s*(?:,|$))|,\s*([A-Z]{2})(?=\s*(?:,|$))/);
  return match?.[1]??match?.[2]??'';
}

export function mountReportAddressAutocomplete({documentRef,form,fetchImpl=globalThis.fetch}={}){
  const input=form?.elements?.namedItem('address');
  const province=form?.elements?.namedItem('province');
  const list=documentRef?.querySelector?.('#report-address-suggestions');
  if(!input||!list||typeof fetchImpl!=='function')return ()=>{};
  let timer=null,request=null,sequence=0,choosing=false;
  const hide=()=>{list.replaceChildren();list.hidden=true;input.setAttribute('aria-expanded','false');};
  async function suggest(){
    const url=buildAddressSuggestionUrl(input.value);
    if(!url){hide();return;}
    request?.abort();request=new AbortController();const current=++sequence;
    try{
      const response=await fetchImpl(url,{signal:request.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Suggerimenti non disponibili');
      const choices=normalizeAddressSuggestions(await response.json());
      if(current!==sequence)return;
      list.replaceChildren();
      for(const choice of choices){
        const option=documentRef.createElement('button');option.type='button';option.setAttribute('role','option');
        option.textContent=choice;
        option.addEventListener('click',()=>{
          choosing=true;
          input.value=choice;input.dispatchEvent(new documentRef.defaultView.Event('input',{bubbles:true}));
          const code=provinceFromAddress(choice);
          if(code&&province){province.value=code;province.dispatchEvent(new documentRef.defaultView.Event('input',{bubbles:true}));}
          choosing=false;
          hide();
        });
        list.append(option);
      }
      list.hidden=!choices.length;input.setAttribute('aria-expanded',String(choices.length>0));
    }catch{if(current===sequence)hide();}
  }
  const onInput=()=>{if(choosing)return;clearTimeout(timer);request?.abort();sequence++;hide();if(buildAddressSuggestionUrl(input.value))timer=setTimeout(suggest,300);};
  input.addEventListener('input',onInput);
  input.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  return ()=>{clearTimeout(timer);request?.abort();input.removeEventListener('input',onInput);hide();};
}
