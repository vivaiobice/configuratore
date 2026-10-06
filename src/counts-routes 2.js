const PROD_HOST='progettaimpianto.vivaiobice.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELD=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VIEWS=new Set(['resume','lists','new','list','counter','admin']);

export function resolveIntegrationConfig(currentUrl,{enabled=false,configuratorBaseUrl=null,countsBaseUrl=null}={}){
  const current=new URL(currentUrl);
  const local=['localhost','127.0.0.1'].includes(current.hostname);
  const production=current.hostname===PROD_HOST&&current.protocol==='https:';
  const configurator=new URL(configuratorBaseUrl??(production?'https://'+PROD_HOST+'/':local?current.origin+'/':currentUrl));
  const counts=new URL(countsBaseUrl??new URL('conteggi/',configurator));
  if(configurator.protocol!==counts.protocol||configurator.origin!==counts.origin)throw new Error('L’integrazione fra origini richiede una verifica dedicata.');
  if(enabled&&!production&&!local&&!configuratorBaseUrl)throw new Error('Configura le destinazioni dell’ambiente di test.');
  return Object.freeze({enabled:Boolean(enabled),configuratorBaseUrl:configurator.href,countsBaseUrl:counts.href});
}

export function buildCountsUrl(config,view,params={}){
  if(!config?.enabled)throw new Error('Conteggi non disponibile in questo ambiente.');
  if(!VIEWS.has(view))throw new TypeError('Vista Conteggi non valida.');
  const allowed=view==='new'||view==='lists'?['projectId','fieldId']:view==='list'?['listId']:view==='counter'?['listId','countId']:[];
  if(Object.keys(params).some(key=>!allowed.includes(key)))throw new TypeError('Parametro di navigazione non previsto.');
  for(const key of ['projectId','listId','countId'])if(params[key]&&!UUID.test(params[key]))throw new TypeError(`Identificativo ${key} non valido.`);
  if(params.fieldId&&(!params.projectId||!FIELD.test(params.fieldId)))throw new TypeError('Identificativo del campo non valido.');
  if((view==='list'||view==='counter')&&!params.listId||view==='counter'&&!params.countId)throw new TypeError('Identificativo del conteggio mancante.');
  const url=new URL(config.countsBaseUrl);url.search='';url.hash='';
  url.searchParams.set('integrationVersion','1');url.searchParams.set('view',view);
  for(const key of allowed)if(params[key])url.searchParams.set(key,params[key]);
  return url.href;
}
