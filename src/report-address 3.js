const ENDPOINT='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer';

export function buildAddressSuggestionUrl(query){
  const text=String(query??'').trim();
  if(text.length<4)return null;
  const url=new URL(`${ENDPOINT}/suggest`);
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

export function parseAddressParts(value,attributes={}){
  const text=String(value??'').trim();
  const segments=text.split(',').map(part=>part.trim()).filter(Boolean);
  const first=segments[0]??'';
  const cityPart=segments[1]?.match(/^\d{5}$/)?`${segments[1]} ${segments[2]??''}`:segments[1]??'';
  const postalMatch=cityPart.match(/^\s*(\d{5})\s+(.+)$/);
  const street=String(attributes.StAddr||attributes.Address||first).trim();
  const postalCode=String(attributes.Postal||postalMatch?.[1]||'').trim();
  const city=String(attributes.City||attributes.Municipality||postalMatch?.[2]||cityPart.replace(/\s*\([A-Z]{2}\)\s*$/,'')).trim();
  const provincePart=segments[segments[1]?.match(/^\d{5}$/)?3:2]??'';
  const province=String(attributes.Subregion||provinceFromAddress(cityPart)||(/^[A-Z]{2}$/.test(attributes.RegionAbbr??'')?attributes.RegionAbbr:'')||(!/^(ITA|Italia)$/i.test(provincePart)?provincePart:'')).trim();
  return {address:street,addressCity:city.replace(/\s*\([A-Z]{2}\)\s*$/,''),addressPostalCode:postalCode,addressProvince:province};
}

async function detailedAddress(choice,fetchImpl,signal){
  if(!choice.magicKey)return parseAddressParts(choice.text);
  try{
    const url=new URL(`${ENDPOINT}/findAddressCandidates`);
    url.searchParams.set('f','json');url.searchParams.set('singleLine',choice.text);
    url.searchParams.set('magicKey',choice.magicKey);
    url.searchParams.set('countryCode','ITA');url.searchParams.set('outFields','StAddr,City,Municipality,Postal,RegionAbbr,Subregion');
    const response=await fetchImpl(url.toString(),{signal,headers:{Accept:'application/json'}});
    if(response.ok){
      const candidate=(await response.json())?.candidates?.[0];
      if(candidate)return parseAddressParts(candidate.address||choice.text,candidate.attributes);
    }
  }catch{}
  return parseAddressParts(choice.text);
}

export function mountReportAddressAutocomplete({documentRef,form,fetchImpl=globalThis.fetch}={}){
  const input=form?.elements?.namedItem('address');
  const list=documentRef?.querySelector?.('#report-address-suggestions');
  if(!input||!list||typeof fetchImpl!=='function')return ()=>{};
  let timer=null,request=null,sequence=0,choosing=false;
  const hide=()=>{list.replaceChildren();list.hidden=true;input.setAttribute('aria-expanded','false');};
  const fill=(name,value)=>{
    const field=form.elements.namedItem(name);
    if(!field||!value)return;
    field.value=value;
    field.dispatchEvent(new documentRef.defaultView.Event('input',{bubbles:true}));
  };
  async function suggest(){
    const url=buildAddressSuggestionUrl(input.value);
    if(!url){hide();return;}
    request?.abort();request=new AbortController();const current=++sequence;
    try{
      const response=await fetchImpl(url,{signal:request.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Suggerimenti non disponibili');
      const payload=await response.json();
      const choices=Array.isArray(payload?.suggestions)?payload.suggestions:[];
      if(current!==sequence)return;
      list.replaceChildren();
      for(const choice of choices.slice(0,5)){
        if(!String(choice?.text??'').trim())continue;
        const option=documentRef.createElement('button');option.type='button';option.setAttribute('role','option');
        option.textContent=choice.text;
        option.addEventListener('click',async()=>{
          const selected=++sequence;clearTimeout(timer);request?.abort();request=new AbortController();choosing=true;hide();
          const parts=await detailedAddress(choice,fetchImpl,request.signal);
          if(selected!==sequence)return;
          for(const [name,value] of Object.entries(parts))fill(name,value);
          choosing=false;
        });
        list.append(option);
      }
      list.hidden=!list.children.length;input.setAttribute('aria-expanded',String(!list.hidden));
    }catch{if(current===sequence)hide();}
  }
  const onInput=()=>{if(choosing)return;clearTimeout(timer);request?.abort();sequence++;hide();if(buildAddressSuggestionUrl(input.value))timer=setTimeout(suggest,300);};
  input.addEventListener('input',onInput);
  input.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  return ()=>{clearTimeout(timer);request?.abort();input.removeEventListener('input',onInput);hide();};
}
