const clean=value=>String(value??'').trim();

export function manualCadastralReference({municipality,sheet,parcel}={}) {
  const item={source:'manual',municipality:clean(municipality),sheet:clean(sheet),parcel:clean(parcel)};
  return item.municipality||item.sheet||item.parcel?item:null;
}

export function normalizeCadastralReferences(value) {
  const seen=new Set(),result=[];
  for(const original of Array.isArray(value)?value:[]) {
    if(!original||typeof original!=='object'||Array.isArray(original))continue;
    if(original.source==='manual'||['municipality','sheet','parcel'].some(key=>key in original)) {
      const item=manualCadastralReference(original);
      if(!item)continue;
      const key=[item.municipality,item.sheet,item.parcel].map(part=>part.toLocaleLowerCase('it')).join('\u0000');
      if(seen.has(key))continue;
      seen.add(key);result.push(item);
    } else result.push({...original});
  }
  return result;
}

export function formatCadastralReference(ref) {
  if(!ref||typeof ref!=='object')return '—';
  if(ref.source==='manual'||['municipality','sheet','parcel'].some(key=>key in ref))return [clean(ref.municipality),clean(ref.sheet)&&`Foglio ${clean(ref.sheet)}`,clean(ref.parcel)&&`Particella ${clean(ref.parcel)}`].filter(Boolean).join(' · ')||'—';
  return clean(ref.reference)||clean(ref.id)||'—';
}
