import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const repository=new URL('../',import.meta.url);
async function fixture(t,files={}){
 const directory=await mkdtemp(join(tmpdir(),'counts-offline-build-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const seeds=['conteggi/style.css','profile.css','fonts.css','assets/fonts/Comfortaa-Variable.ttf','assets/logo-vivai-obice-v14.png','assets/logo-filigrana.png','assets/favicon-v26.png','assets/apple-touch-icon-v26.png'];
 const contents={...Object.fromEntries(seeds.map(path=>[path,''])),
  'package.json':'{"type":"module"}',
  'scripts/build-counts-offline.mjs':await readFile(new URL('scripts/build-counts-offline.mjs',repository),'utf8'),
  'conteggi/index.html':'<script type="module" src="./boot.js?v=release"></script>',
  'conteggi/boot.js':'export const ready=true;',
  'conteggi/sw.js':'const STATIC_ASSETS=[];\n',...files};
 for(const [path,source] of Object.entries(contents)){await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),source);}
 const module=await import(pathToFileURL(join(directory,'scripts/build-counts-offline.mjs')));
 assert.equal(typeof module.collectCountsOfflineAssets,'function','the build must expose collection without writing the service worker on import');
 return {directory,module,root:pathToFileURL(directory+'/')};
}

test('collecting Counts assets follows actual imports and worker roots with exact query identities',async t=>{
 const {module,root}=await fixture(t,{
  'conteggi/boot.js':`import {one} from '../src/shared.js?v=first';
import('../src/shared.js?v=second');
new Worker(new URL('../src/worker.js?v=release',import.meta.url),{type:'module'});
new WorkerImpl(new URL('../src/alternate.js?v=release', import.meta.url),{type:'module'});
new URL('../',import.meta.url);
/** @type {import('../src/annotation-only.js')} */
// import '../src/comment-only.js';
const documentation="import '../src/string-only.js'";
`,
  'src/shared.js':"export {value} from './leaf.js?v=legacy';",
  'src/leaf.js':'export const value=1;',
  'src/worker.js':"import './worker-dependency.js?v=release';",
  'src/worker-dependency.js':"import '../conteggi/boot.js?v=release';",
  'src/alternate.js':'export const ready=true;'
 });
 const paths=await module.collectCountsOfflineAssets({root});
 for(const path of ['conteggi/boot.js?v=release','src/shared.js?v=first','src/shared.js?v=second','src/leaf.js?v=legacy','src/worker.js?v=release','src/worker-dependency.js?v=release','src/alternate.js?v=release'])assert.ok(paths.includes(path),path);
 assert.equal(paths.length,new Set(paths).size);
 assert.ok(!paths.some(path=>/only|^\.\.\/$/.test(path)));
});

test('Counts shell images and queried styles are validated and collected without precache writes',async t=>{
 const {module,root,directory}=await fixture(t,{
  'conteggi/index.html':`<link rel='stylesheet' href='../button-feedback.css?v=release'>
<img src='../assets/logo-vivai-obice-lineare.png?v=brand'>
<img src='https://external.test/logo.png'><a href='../'>Tool</a>
<script src='./boot.js?v=release' type='module'></script>`,
  'button-feedback.css':'body{}','assets/logo-vivai-obice-lineare.png':'image'
 });
 assert.equal(await readFile(join(directory,'conteggi/sw.js'),'utf8'),'const STATIC_ASSETS=[];\n','import must not rewrite sw.js');
 const paths=await module.collectCountsOfflineAssets({root});
 assert.ok(paths.includes('button-feedback.css?v=release'));
 assert.ok(paths.includes('assets/logo-vivai-obice-lineare.png?v=brand'));
 assert.ok(!paths.some(path=>path.includes('external.test')));
 assert.equal(await readFile(join(directory,'conteggi/sw.js'),'utf8'),'const STATIC_ASSETS=[];\n','collection must not rewrite sw.js');
});

test('a missing transitive worker module rejects collection before a package can be built',async t=>{
 const {module,root}=await fixture(t,{
  'conteggi/boot.js':"new Worker(new URL('../src/worker.js?v=release',import.meta.url),{type:'module'});",
  'src/worker.js':"import './missing-worker-dependency.js?v=release';"
 });
 await assert.rejects(module.collectCountsOfflineAssets({root}),/missing-worker-dependency\.js/);
});

test('a missing local shell image rejects collection',async t=>{
 const {module,root}=await fixture(t,{
  'conteggi/index.html':'<img src="../assets/missing-logo.png"><script type="module" src="./boot.js?v=release"></script>'
 });
 await assert.rejects(module.collectCountsOfflineAssets({root}),/missing-logo\.png/);
});
