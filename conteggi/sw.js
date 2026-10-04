// STATIC_ASSETS is generated from the existing module graph by scripts/build-counts-offline.mjs.
const STATIC_ASSETS=["conteggi/index.html","conteggi/style.css","profile.css","fonts.css","assets/fonts/Comfortaa-Variable.ttf","assets/logo-vivai-obice-v14.png","assets/logo-filigrana.png","assets/favicon-v26.png","assets/apple-touch-icon-v26.png","conteggi/style.css?v=1.2.4","profile.css?v=1.2.4","fonts.css?v=1.2.4","conteggi/boot.js?v=1.2.5","conteggi/config.js?v=1.2.5","src/config.js?v=1.2.5","conteggi/runtime.js?v=1.2.5","src/auth-service.js","src/auth-model.js","src/backend.js?v=1.2.5","src/fields.js?v=1.2.5","src/cadastral-references.js?v=55.7","src/soil.js?v=55.1","src/geometry.js?v=45","src/state.js?v=1.2.5","src/counts-client.js?v=1.2.4","conteggi/model.js?v=1.2.4","conteggi/store.js","src/field-directory.js","src/counts-offline-owner.js","conteggi/ui.js?v=1.2.4","conteggi/navigation.js","conteggi/submission.js?v=1.2.4","conteggi/counter-view.js?v=1.2.4","src/plant-catalog.js","conteggi/feedback.js?v=1.2.4","src/profile-ui.js?v=1.2.4","src/theme.js"];
const CACHE='vivai-obice-counts-static-1.2.5';
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const origin=self.location.origin;
const urls=STATIC_ASSETS.map(path=>new URL('../'+path,self.location.href).href);
const staticPaths=new Set(urls.map(url=>new URL(url).pathname));
const shell=origin+'/conteggi/index.html';

async function cacheScriptGraph(cache,url,visited=new Set()){
 if(visited.has(url))return;visited.add(url);
 const response=await fetch(url,{cache:'reload'});
 if(!response.ok||!/javascript/.test(response.headers.get('Content-Type')||''))throw new Error('Modulo offline non disponibile');
 const source=await response.clone().text();await cache.put(url,response);
 for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g)){
  const dependency=new URL(match[1],url);
  if(dependency.hostname==='cdn.jsdelivr.net'&&dependency.pathname.startsWith('/npm/'))await cacheScriptGraph(cache,dependency.href,visited);
 }
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const url of urls){const response=await fetch(url,{cache:'reload'});if(!response.ok)throw new Error('File offline non disponibile');await cache.put(url,response);}
 // Offline entry uses the last resolved local owner; it never requires a network token refresh.
 try{await cacheScriptGraph(cache,SDK);}catch{}
 // A new worker waits for existing Conteggi tabs to close, preserving their running code.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await self.clients.claim();
 for(const name of await caches.keys())if(name.startsWith('vivai-obice-counts-static-')&&name!==CACHE)await caches.delete(name);
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET')return;
 const navigation=request.mode==='navigate'&&url.origin===origin&&url.pathname.startsWith('/conteggi/');
 const asset=url.origin===origin&&staticPaths.has(url.pathname);
 const script=request.destination==='script'||/\.m?js$/i.test(url.pathname);
 const sdk=request.destination==='script'&&url.hostname==='cdn.jsdelivr.net'&&url.pathname.startsWith('/npm/');
 if(!navigation&&!asset&&!sdk)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(request);
   if(response.ok){if(!navigation)await cache.put(request,response.clone());return response;}
   const stored=await cache.match(navigation?shell:request,{ignoreSearch:!sdk&&!script});if(stored)return stored;return response;
  }catch(error){const stored=await cache.match(navigation?shell:request,{ignoreSearch:!sdk&&!script});if(stored)return stored;throw error;}
 })());
});
