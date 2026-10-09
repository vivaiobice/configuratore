import {mountReleaseVersion} from '../src/release-version.js?v=1.3.5';
import {COUNTS_CONFIG} from './config.js?v=1.3.5';
import {createCountsRuntime} from './runtime.js?v=1.3.5';
import {mountCountsUI} from './ui.js?v=1.3.5';
import {parseCountsUrl,buildCountsUrl} from './navigation.js?v=1.3.5';
import {createCountsFeedback} from './feedback.js?v=1.3.5';
import {createProfileUI} from '../src/profile-ui.js?v=1.3.5';
import {listVarieties} from '../src/plant-catalog.js';
import {readPendingFieldContext,clearPendingFieldContext} from '../src/field-directory.js';
let ui,runtime,profile;
mountReleaseVersion();
document.querySelector('#copyright').textContent=`© ${new Date().getFullYear()} Vivai Obice. Tutti i diritti riservati.`;
document.querySelector('[data-tool="configurator"]').href=COUNTS_CONFIG.configuratorBaseUrl;
if('serviceWorker' in navigator){
 navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:new URL('./',import.meta.url).pathname}).catch(()=>{});
}
try{
 runtime=await createCountsRuntime({config:COUNTS_CONFIG,beforeIdentityChange:async()=>{await ui?.prepareIdentityChange();}});
 const route=parseCountsUrl(location.href);
 const pendingFieldContext=route.view==='new'&&!route.projectId
   ?readPendingFieldContext(sessionStorage,runtime.gateway.getScope().owner,COUNTS_CONFIG.environment):null;
 if(pendingFieldContext)clearPendingFieldContext(sessionStorage);
 ui=mountCountsUI({gateway:runtime.gateway,authService:runtime.auth,admin:runtime.admin,
   fieldDirectory:runtime.fieldDirectory,pendingFieldContext,route,config:COUNTS_CONFIG,
   varietyCatalog:listVarieties(),feedback:createCountsFeedback(),onProfile:()=>profile?.openProfile()});
 profile=createProfileUI({authService:runtime.auth});profile.mount();
 const banner=document.querySelector('#sync-banner');
 let ready=false;
 runtime.auth.subscribe(state=>{
  const link=document.querySelector('#profile-menu a');if(link)link.href=buildCountsUrl(COUNTS_CONFIG.countsBaseUrl,{view:'admin'});document.body.dataset.ownerKind=state.kind==='guest'?'guest':'user';
  if(!COUNTS_CONFIG.syncEnabled)banner.textContent='Salvataggio su questo dispositivo. Per un guest, gli appunti restano legati alla sessione di questo browser.';
  else if(runtime.offlineIdentity)banner.textContent='Le letture sono salvate su questo dispositivo. Con connessione, le letture del tuo account vengono sincronizzate nel profilo; per un guest serve prima leggere l’avviso.';
  else if(state.user?.is_anonymous===false)banner.innerHTML='<p>Le letture salvate vengono sincronizzate nel tuo profilo, anche senza un campo. Gli appunti sincronizzati sono consultabili dagli amministratori autorizzati Vivai Obice. La trasmissione di una richiesta richiede una tua scelta separata.</p><button type="button" data-action="notice">Avviso di salvataggio</button><button type="button" data-action="sync">Sincronizza</button>';
  else banner.innerHTML='<p>Gli appunti guest sono conservati sul dispositivo. Prima di sincronizzarli, leggi l’avviso sulla conservazione e sulla consultazione da parte degli amministratori autorizzati Vivai Obice.</p><button type="button" data-action="notice">Leggi l’avviso e attiva la sincronizzazione</button><button type="button" data-action="sync">Sincronizza</button>';
  if(ready&&COUNTS_CONFIG.syncEnabled&&!runtime.offlineIdentity)void ui.refresh().catch(()=>{});
 });
 runtime.gateway.subscribe(({reason})=>{if(COUNTS_CONFIG.syncEnabled&&!runtime.offlineIdentity&&navigator.onLine!==false&&['change','notice'].includes(reason))queueMicrotask(()=>void runtime.gateway.sync().catch(()=>{}));});
 await ui.ready;
 ready=true;
 if(COUNTS_CONFIG.syncEnabled&&!runtime.offlineIdentity)void ui.refresh().catch(()=>{});
 const refresh=()=>{if(document.visibilityState==='visible'&&COUNTS_CONFIG.syncEnabled)void ui.refresh().catch(()=>{});};
 addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);addEventListener('online',()=>{if(runtime.offlineIdentity)location.reload();else refresh();});
 if(COUNTS_CONFIG.syncEnabled&&!runtime.offlineIdentity)setInterval(()=>{if(navigator.onLine!==false)void runtime.gateway.sync().catch(()=>{});},5000);
 addEventListener('beforeunload',event=>{if(document.querySelector('#retry-save')?.hidden===false){event.preventDefault();event.returnValue='';}});
}catch(error){document.querySelector('#counts-status').textContent=error.message||'Accesso ai conteggi temporaneamente non disponibile.';document.querySelector('#counts-main').innerHTML='<section class="card"><h2>Conteggi</h2><p>Non è stato possibile preparare il salvataggio. Conserva la sessione esistente e riprova con connessione.</p><button type="button" onclick="location.reload()">Riprova</button></section>';}
