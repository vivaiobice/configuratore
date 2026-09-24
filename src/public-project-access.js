const CODE_PATTERN=/^VO-[0-9]{7}$/;

export function normalizePublicProjectCode(value){
  const raw=String(value??'').trim().toUpperCase();
  const normalized=/^[0-9]{7}$/.test(raw)?`VO-${raw}`:raw;
  return CODE_PATTERN.test(normalized)?normalized:'';
}

export function buildPublicProjectUrl(baseUrl,code){
  const normalized=normalizePublicProjectCode(code);
  if(!normalized)throw new TypeError('Inserisci un ID progetto valido nel formato VO-1234567.');
  const url=new URL('shared-project.html',baseUrl);
  url.search='';url.hash='';url.searchParams.set('code',normalized);
  return url.toString();
}

export function parsePublicProjectCodeUrl(value){
  try{return normalizePublicProjectCode(new URL(value).searchParams.get('code'))||null;}
  catch{return null;}
}
