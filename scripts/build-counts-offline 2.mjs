import {readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultRoot=new URL('../',import.meta.url);
const baseAssets=['conteggi/index.html','conteggi/style.css','profile.css','fonts.css','assets/fonts/Comfortaa-Variable.ttf','assets/logo-vivai-obice-v14.png','assets/logo-filigrana.png','assets/favicon-v26.png','assets/apple-touch-icon-v26.png'];

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

function shellReferences(html){
 const modules=[],assets=[];
 for(const match of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<(script|link|img)\b[^>]*>/gi)){
  const attributes=Object.fromEntries([...match[0].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(attribute=>[attribute[1].toLowerCase(),attribute[3].replaceAll('&amp;','&')]));
  const tag=match[1].toLowerCase();
  if(tag==='script'&&attributes.type==='module'&&attributes.src)modules.push(attributes.src);
  if(tag==='link'&&attributes.href)assets.push(attributes.href);
  if(tag==='img'&&attributes.src)assets.push(attributes.src);
 }
 return {modules,assets};
}

export async function collectCountsOfflineAssets({root=defaultRoot}={}){
 const rootURL=new URL(root),seen=new Set(),htmlURL=new URL('conteggi/index.html',rootURL);
 const html=await readFile(htmlURL,'utf8'),shell=shellReferences(html);
 const localURL=(specifier,parent)=>{
  const url=new URL(specifier,parent);
  return url.protocol==='file:'&&url.href.startsWith(rootURL.href)?url:null;
 };
 async function scan(url){
  if(seen.has(url.href))return;seen.add(url.href);
  const source=await readFile(fileURLToPath(url),'utf8');
  for(const specifier of moduleDependencies(source)){
   if(!specifier.startsWith('.'))continue;
   const dependency=localURL(specifier,url);
   if(!dependency)throw new Error(`Modulo locale fuori dal pacchetto: ${specifier}`);
   await scan(dependency);
  }
 }
 if(!shell.modules.length)throw new Error('Modulo di avvio Conteggi non disponibile');
 for(const specifier of shell.modules){const url=localURL(specifier,htmlURL);if(url)await scan(url);}
 const paths=new Set(baseAssets);
 for(const specifier of shell.assets){
  const url=localURL(specifier,htmlURL);
  if(url&&/\.(css|png|jpe?g|svg|webp|gif|ico|ttf|woff2?)$/i.test(url.pathname))paths.add(url.href.slice(rootURL.href.length));
 }
 for(const url of seen)paths.add(url.slice(rootURL.href.length));
 // Fail before updating sw.js if any declared resource is absent.
 for(const path of paths)await access(fileURLToPath(new URL(path,rootURL)));
 return [...paths];
}

async function build(){
 const paths=await collectCountsOfflineAssets();
 const worker=new URL('conteggi/sw.js',defaultRoot),source=await readFile(worker,'utf8');
 if(!/const STATIC_ASSETS=.*?;\n/.test(source))throw new Error('Elenco statico Conteggi non disponibile');
 await writeFile(worker,source.replace(/const STATIC_ASSETS=.*?;\n/,`const STATIC_ASSETS=${JSON.stringify(paths)};\n`));
 console.log(`Conteggi: ${paths.length} risorse statiche predisposte per l'apertura offline.`);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await build();
