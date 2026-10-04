import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),seen=new Set();
async function scan(url){
 const key=url.href;if(seen.has(key))return;seen.add(key);
 const source=await readFile(fileURLToPath(url),'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g))if(match[1].startsWith('.'))await scan(new URL(match[1],url));
}
const html=await readFile(new URL('conteggi/index.html',root),'utf8');
const entry=html.match(/type="module" src="([^"]+)"/)[1];
await scan(new URL(entry,new URL('conteggi/index.html',root)));
const shellAssets=[...html.matchAll(/href="(\.[^"]+)"/g)].map(match=>new URL(match[1],new URL('conteggi/index.html',root))).filter(url=>/\.(css|png)$/.test(url.pathname)).map(url=>url.href.slice(root.href.length));
const paths=[...new Set(['conteggi/index.html','conteggi/style.css','profile.css','fonts.css','assets/fonts/Comfortaa-Variable.ttf','assets/logo-vivai-obice-v14.png','assets/logo-filigrana.png','assets/favicon-v26.png','assets/apple-touch-icon-v26.png',...shellAssets,...Array.from(seen,url=>url.slice(root.href.length))])];
const worker=new URL('conteggi/sw.js',root),source=await readFile(worker,'utf8');
await writeFile(worker,source.replace(/const STATIC_ASSETS=.*?;\n/,`const STATIC_ASSETS=${JSON.stringify(paths)};\n`));
console.log(`Conteggi: ${paths.length} risorse statiche predisposte per l'apertura offline.`);
