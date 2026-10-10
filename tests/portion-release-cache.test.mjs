import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
async function sourceModules(directory){
  const result=[];
  for(const entry of await readdir(new URL(directory+'/',root),{withFileTypes:true})){
    if(entry.name==='node_modules'||entry.name.startsWith('.'))continue;
    const path=directory+'/'+entry.name;
    if(entry.isDirectory())result.push(...await sourceModules(path));
    else if(entry.isFile()&&entry.name.endsWith('.js'))result.push(path);
  }
  return result;
}
const modules=(await Promise.all(['src','admin','conteggi'].map(sourceModules))).flat();
function moduleDependencies(source){
 // Keep quoted specifiers, but ignore prose, comments and JSDoc import types.
 const tokens=[...source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g)]
  .map(match=>match[0]).filter(token=>!token.startsWith('//')&&!token.startsWith('/*'));
 const quoted=token=>token?.[0]==='"'||token?.[0]==="'";
 const value=token=>token.slice(1,-1).replace(/\\(['"\\])/g,'$1');
 const dependencies=[];
 for(let index=0;index<tokens.length;index++){
  const token=tokens[index];
  if(token==='import'&&tokens[index+1]!=='.'){
   if(quoted(tokens[index+1]))dependencies.push(value(tokens[index+1]));
   else if(tokens[index+1]==='('&&quoted(tokens[index+2]))dependencies.push(value(tokens[index+2]));
   else for(let next=index+1;next<tokens.length&&tokens[next]!==';';next++){
    if(tokens[next]==='from'&&quoted(tokens[next+1])){dependencies.push(value(tokens[next+1]));break;}
   }
  }
  if(token==='export'&&['{','*'].includes(tokens[index+1])){
   for(let next=index+1;next<tokens.length&&tokens[next]!==';';next++){
    if(tokens[next]==='from'&&quoted(tokens[next+1])){dependencies.push(value(tokens[next+1]));break;}
   }
  }
  if(token==='new'&&['Worker','WorkerImpl'].includes(tokens[index+1])&&tokens[index+2]==='('&&tokens[index+3]==='new'&&tokens[index+4]==='URL'&&tokens[index+5]==='('&&quoted(tokens[index+6])&&tokens.slice(index+7,index+14).join('')===',import.meta.url)')dependencies.push(value(tokens[index+6]));
 }
 return dependencies;
}

const graph=[];
for(const path of new Set(modules)){
 const source=await read(path);
 for(const spec of moduleDependencies(source)){if(!spec.startsWith('.'))continue;const url=new URL(spec,new URL(path,root));graph.push({from:path,to:url.pathname.slice(root.pathname.length),url});}
}
const targets=new Set(["admin/admin-cadastre.js","admin/admin-field-map.js","admin/admin-map-data.js","admin/admin-map.js","admin/admin-model.js","admin/admin-service.js","admin/admin-views.js","admin/admin.js","conteggi/boot.js","conteggi/config.js","conteggi/runtime.js","src/app.js","src/backend.js","src/cadastral-auto.js","src/cadastral-overlay.js","src/cadastre.js","src/cloud-project-model.js","src/cloud.js","src/config.js","src/coordinate-editor.js","src/coordinate-system.js","src/counts-auth-bootstrap.js","src/desktop-library-ui.js","src/desktop-ux.js","src/fields.js","src/local-projects.js","src/map-field-label-overlay.js","src/map-gestures.js","src/map-overlay-visibility.js","src/map-terrain-control.js","src/map-terrain-exclusions.js","src/map.js","src/mobile-ui.js","src/passage-coordinates.js","src/pdf-model.js","src/project-archive-actions.js","src/project-calculator.js","src/project-summary.js","src/project-sync.js","src/quote-sync.js","src/release-version.js","src/report-context.js","src/report-diagram.js","src/report-map-model.js","src/report-overview.js","src/report-pdf-download.js","src/report-preflight.js","src/report-project-source.js","src/report-satellite.js","src/report-template.js","src/report.js","src/revision-summary.js","src/row-curves.js","src/row-portion-editor.js","src/row-portion-summary.js","src/row-portions.js","src/satellite-style.js","src/shared-project-entry.js","src/shared-project.js","src/state.js","src/storage.js","src/terrain-algebraic.js","src/terrain-axis-geometry.js","src/terrain-budget.js","src/terrain-camera-controls.js","src/terrain-canonical-domain.js","src/terrain-contour-contracts.js","src/terrain-contour-design.js","src/terrain-contour-domain-owner.js","src/terrain-contour-domain.js","src/terrain-contour-family.js","src/terrain-contour-validation.js","src/terrain-contours.js","src/terrain-controller.js","src/terrain-controls.js","src/terrain-core-presentation.js","src/terrain-cut-candidates.js","src/terrain-cut-suggestions.js","src/terrain-design.js","src/terrain-exact.js","src/terrain-exclusion-groups.js","src/terrain-geodesic-flow.js","src/terrain-ground-spacing.js","src/terrain-history.js","src/terrain-manual-axes.js","src/terrain-map.js","src/terrain-model.js","src/terrain-native-clipping.js","src/terrain-passage.js","src/terrain-polyline-source.js","src/terrain-provider.js","src/terrain-replay.js","src/terrain-report-summary.js","src/terrain-satellite-imagery.js","src/terrain-scene-mesh.js","src/terrain-scene-view.js","src/terrain-scene-worker.js","src/terrain-serialization.js","src/terrain-surface-bands.js","src/terrain-surface-flow.js","src/terrain-tile-client.js","src/terrain-tile-worker.js","src/terrain-worker-client.js","src/terrain-worker.js","src/tool-switch.js","src/user-projects-view.js","src/vendor/geotiff.js","src/vendor/polygon-clipping.js"]);
for(const target of ["src/terrain-context-dem.js","src/terrain-context-worker.js","src/terrain-native-view.js","src/terrain-directional-certificate.js","src/terrain-annotation-presentation.js","src/coordinate-search.js"])targets.add(target);
for(const target of ["conteggi/model.js","conteggi/ui.js","conteggi/counter-view.js","conteggi/submission.js","conteggi/reading-title.js","conteggi/storage-banner.js","src/counts-client.js","src/counts-desktop-gateway.js"])targets.add(target);
targets.add("src/mobile-profile.js");
const styles=new Set(["refinement-cards.css","profile.css","counts-integration.css","button-feedback.css","conteggi/style.css","coordinates.css","map-visibility.css","mobile.css","report-layout.css","row-portions.css","terrain.css"]);
let grew=true;while(grew){grew=false;for(const edge of graph)if(targets.has(edge.to)&&!targets.has(edge.from)){targets.add(edge.from);grew=true;}}

test('all incoming changed runtime module edges use release 1.3.7',async()=>{
  for(const edge of graph){await readFile(edge.url);if(targets.has(edge.to))assert.equal(edge.url.searchParams.get('v'),'1.3.7',`${edge.from} -> ${edge.to}`);}
  for(const path of ['index.html','report.html','shared-project.html','admin/index.html','conteggi/index.html']){
    const source=await read(path);
    for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
      if(!match[1].startsWith('.'))continue;
      const url=new URL(match[1],new URL(path,root)),target=url.pathname.slice(root.pathname.length);
      if(targets.has(target)||styles.has(target))assert.equal(url.searchParams.get('v'),'1.3.7',path+' -> '+target);
    }
  }
});

test('offline precache retains the exact queried entry and all transitive local module URLs',async()=>{
  const sw=await read('conteggi/sw.js'),paths=JSON.parse(sw.match(/const STATIC_ASSETS=(.*);/)[1]);
  const html=await read('conteggi/index.html'),entry=html.match(/type="module" src="([^"]+)"/)[1];
  const seen=new Set();
  async function walk(url){const key=url.href.slice(root.href.length);if(seen.has(key))return;seen.add(key);assert.ok(paths.includes(key),key);
    for(const spec of moduleDependencies(await readFile(url,'utf8')))if(spec.startsWith('.'))await walk(new URL(spec,url));}
  await walk(new URL(entry,new URL('conteggi/index.html',root)));
});

test('offline worker never substitutes old script bytes for a different module version',async()=>{
  const source=await read('conteggi/sw.js'),handlers={},saved=new Map();
  const cache={match:async(key,options)=>{const url=typeof key==='string'?key:key.url;if(saved.has(url))return saved.get(url);if(options?.ignoreSearch)return [...saved].find(([old])=>old.split('?')[0]===url.split('?')[0])?.[1];},put:async()=>{}};
  const scope={URL,Set,Map,Promise,console,fetch:async()=>{throw new Error('Offline');},self:{location:{origin:'https://example.test',href:'https://example.test/conteggi/sw.js'},addEventListener:(event,fn)=>handlers[event]=fn},caches:{open:async()=>cache}};
  vm.runInNewContext(source,scope);
  saved.set('https://example.test/src/fields.js?v=55.1','old engine bytes');
  let result;handlers.fetch({request:{url:'https://example.test/src/fields.js?v=1.3.7',method:'GET',mode:'cors',destination:'script'},respondWith:p=>result=p});
  await assert.rejects(result,/Offline/);
  saved.set('https://example.test/src/fields.js?v=1.3.7','current engine bytes');
  handlers.fetch({request:{url:'https://example.test/src/fields.js?v=1.3.7',method:'GET',mode:'cors',destination:'script'},respondWith:p=>result=p});
  assert.equal(await result,'current engine bytes');assert.match(source,/static-1\.3\.7/);
});

test('Admin entry preserves the counts query as a valid HTML-escaped parameter',async()=>{
 const source=await read('admin/index.html'),spec=source.match(/type="module" src="([^"]+)"/)[1].replaceAll('&amp;','&');
 const url=new URL(spec,'https://example.test/admin/');
 assert.equal(url.searchParams.get('v'),'1.3.7');assert.equal(url.searchParams.get('counts'),'2');
});
