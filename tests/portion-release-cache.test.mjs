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
const graph=[];
for(const path of new Set(modules)){
  const source=await read(path);
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g)){
    if(!match[1].startsWith('.'))continue;
    const url=new URL(match[1],new URL(path,root));
    graph.push({from:path,to:url.pathname.slice(root.pathname.length),url});
  }
}
const targets=new Set(['src/config.js','src/fields.js','src/project-calculator.js','src/row-curves.js','src/row-portions.js','src/vendor/polygon-clipping.js','src/row-portion-editor.js','src/row-portion-summary.js','src/app.js','src/map.js','src/mobile-ui.js','src/report.js','src/project-summary.js','src/pdf-model.js','src/report-template.js','src/report-pdf-download.js','src/shared-project.js','admin/admin-map-data.js','src/revision-summary.js']);
let grew=true;while(grew){grew=false;for(const edge of graph)if(targets.has(edge.to)&&!targets.has(edge.from)){targets.add(edge.from);grew=true;}}

test('all incoming changed runtime module edges use release 1.2.5',async()=>{
  for(const edge of graph){await readFile(edge.url);if(targets.has(edge.to))assert.equal(edge.url.searchParams.get('v'),'1.2.5',`${edge.from} -> ${edge.to}`);}
  for(const path of ['index.html','report.html','shared-project.html','admin/index.html','conteggi/index.html']){
    const source=await read(path);
    for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
      if(!match[1].startsWith('.'))continue;
      const url=new URL(match[1],new URL(path,root)),target=url.pathname.slice(root.pathname.length);
      if(targets.has(target)||['row-portions.css','report-layout.css'].includes(target))assert.equal(url.searchParams.get('v'),'1.2.5',path+' -> '+target);
    }
  }
});

test('offline precache retains the exact queried entry and all transitive local module URLs',async()=>{
  const sw=await read('conteggi/sw.js'),paths=JSON.parse(sw.match(/const STATIC_ASSETS=(.*);/)[1]);
  const html=await read('conteggi/index.html'),entry=html.match(/type="module" src="([^"]+)"/)[1];
  const seen=new Set();
  async function walk(url){const key=url.href.slice(root.href.length);if(seen.has(key))return;seen.add(key);assert.ok(paths.includes(key),key);
    for(const match of (await readFile(url,'utf8')).matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g))if(match[1].startsWith('.'))await walk(new URL(match[1],url));}
  await walk(new URL(entry,new URL('conteggi/index.html',root)));
});

test('offline worker never substitutes old script bytes for a different module version',async()=>{
  const source=await read('conteggi/sw.js'),handlers={},saved=new Map();
  const cache={match:async(key,options)=>{const url=typeof key==='string'?key:key.url;if(saved.has(url))return saved.get(url);if(options?.ignoreSearch)return [...saved].find(([old])=>old.split('?')[0]===url.split('?')[0])?.[1];},put:async()=>{}};
  const scope={URL,Set,Map,Promise,console,fetch:async()=>{throw new Error('Offline');},self:{location:{origin:'https://example.test',href:'https://example.test/conteggi/sw.js'},addEventListener:(event,fn)=>handlers[event]=fn},caches:{open:async()=>cache}};
  vm.runInNewContext(source,scope);
  saved.set('https://example.test/src/fields.js?v=55.1','old engine bytes');
  let result;handlers.fetch({request:{url:'https://example.test/src/fields.js?v=1.2.5',method:'GET',mode:'cors',destination:'script'},respondWith:p=>result=p});
  await assert.rejects(result,/Offline/);
  saved.set('https://example.test/src/fields.js?v=1.2.5','current engine bytes');
  handlers.fetch({request:{url:'https://example.test/src/fields.js?v=1.2.5',method:'GET',mode:'cors',destination:'script'},respondWith:p=>result=p});
  assert.equal(await result,'current engine bytes');assert.match(source,/static-1\.2\.5/);
});

test('Admin entry preserves the counts query as a valid HTML-escaped parameter',async()=>{
 const source=await read('admin/index.html'),spec=source.match(/type="module" src="([^"]+)"/)[1].replaceAll('&amp;','&');
 const url=new URL(spec,'https://example.test/admin/');
 assert.equal(url.searchParams.get('v'),'1.2.5');assert.equal(url.searchParams.get('counts'),'2');
});
