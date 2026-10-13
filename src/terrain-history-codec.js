import pako from './vendor/pako.js?v=1.3.11';

const MAX_PLAIN_BYTES=4*1024*1024,MAX_COMPRESSED_BYTES=1024*1024;
const invalid=()=>Object.assign(new Error('Invalid compressed terrain restore baseline.'),{status:'invalid-history'});
const utf8=new TextEncoder();
function jsonExact(value,budget,path=new WeakSet(),depth=0){
 budget?.check();if(depth>512)return false;
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0);
 if(!value||typeof value!=='object'||path.has(value))return false;
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
 const keys=Object.keys(value);
 if(Array.isArray(value)&&(keys.length!==value.length||keys.some((key,i)=>key!==String(i))))return false;
 if(Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==keys.length+(Array.isArray(value)?1:0))return false;
 path.add(value);const result=keys.every(key=>{budget?.check();const descriptor=Object.getOwnPropertyDescriptor(value,key);return Object.hasOwn(descriptor,'value')&&jsonExact(descriptor.value,budget,path,depth+1);});path.delete(value);return result;
}
function base64(bytes){let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
export function encodeTerrainHistoryBefore(before,budget){
 budget?.check();if(!jsonExact(before,budget))return before;
 const text=JSON.stringify(before),bytes=utf8.encode(text);budget?.check();
 if(bytes.length<65536||bytes.length>MAX_PLAIN_BYTES)return before;
 const compressed=pako.deflate(bytes);budget?.check();
 if(compressed.length>MAX_COMPRESSED_BYTES)return before;
 const encoded={codec:'json-deflate-1',plainBytes:bytes.length,data:base64(compressed)};
 return JSON.stringify(encoded).length<text.length?encoded:before;
}
export const encodedTerrainHistoryBefore=value=>!!value&&typeof value==='object'&&Object.hasOwn(value,'codec');
// Validate size declarations without decoding or allocating the compressed bytes.
// Project-wide expansion is checked with these declarations before any inflation.
export function inspectTerrainHistoryBefore(encoded,budget){
 budget?.check();
 if(!encoded||Array.isArray(encoded)||![Object.prototype,null].includes(Object.getPrototypeOf(encoded))||Reflect.ownKeys(encoded).some(key=>typeof key!=='string')||Reflect.ownKeys(encoded).sort().join(',')!=='codec,data,plainBytes'||['codec','data','plainBytes'].some(key=>{const d=Object.getOwnPropertyDescriptor(encoded,key);return !d||!d.enumerable||!Object.hasOwn(d,'value');})||encoded.codec!=='json-deflate-1'||!Number.isSafeInteger(encoded.plainBytes)||encoded.plainBytes<1||encoded.plainBytes>MAX_PLAIN_BYTES||typeof encoded.data!=='string'||encoded.data.length>Math.ceil(MAX_COMPRESSED_BYTES/3)*4||!(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).test(encoded.data))throw invalid();
 const padding=encoded.data.endsWith('==')?2:encoded.data.endsWith('=')?1:0;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 if(encoded.data.length/4*3-padding>MAX_COMPRESSED_BYTES||padding&&(alphabet.indexOf(encoded.data.at(-padding-1))&((1<<(padding*2))-1)))throw invalid();
 budget?.check();return encoded.plainBytes;
}
// Inspect JSON before it allocates coordinate arrays. The iterative general
// reader preserves arbitrary legacy plaintext depth; encoded baselines use 512.
export function inspectTerrainJsonText(text,budget,{maxDepth=512}={}){
 let i=0,nodes=0,rootRead=false,hasTerrain=false;const stack=[];
 const tokenPattern=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
 const white=()=>{while(i<text.length&&/[ \t\r\n]/.test(text[i]))i++;};
 function string(capture=false){
  if(text[i++]!=='"')throw invalid();let result='',length=0;
  while(i<text.length){
   if((i&8191)===0)budget?.check();let c=text[i++];
   if(c==='"')return capture?result:length;
   if(c==='\\'){
    c=text[i++];
    if(c==='u'){const code=text.slice(i,i+4);if(!/^[0-9a-fA-F]{4}$/.test(code))throw invalid();c=String.fromCharCode(Number.parseInt(code,16));i+=4;}
    else{if(!c||!'"\\/bfnrt'.includes(c))throw invalid();c=({b:'\b',f:'\f',n:'\n',r:'\r',t:'\t'})[c]??c;}
   }else if(c.charCodeAt(0)<32)throw invalid();
   length++;if(capture&&length<=32)result+=c;
  }
  throw invalid();
 }
 function record(numeric,truthy){
  if(!stack.length){if(rootRead)throw invalid();rootRead=true;return;}
  const frame=stack.at(-1);
  if(frame.type==='array'){if(!['value','first'].includes(frame.state))throw invalid();frame.count++;frame.numeric=numeric&&frame.numeric;}
  else{if(frame.state!=='value')throw invalid();if(frame.key==='terrain'&&truthy)hasTerrain=true;}
  frame.state='comma';
 }
 function value(){
  budget?.check();if(stack.length>maxDepth)throw invalid();white();const c=text[i];
  if(c==='['||c==='{'){record(false,true);i++;stack.push({type:c==='['?'array':'object',state:'first',numeric:true,count:0});return;}
  if(c==='"'){record(false,string()>0);return;}
  tokenPattern.lastIndex=i;const token=tokenPattern.exec(text);if(!token)throw invalid();i=tokenPattern.lastIndex;
  const numeric=!['true','false','null'].includes(token[0]),number=numeric?Number(token[0]):null;
  record(numeric&&Number.isFinite(number),numeric?!!number:token[0]==='true');
 }
 function close(){const frame=stack.pop();i++;if(frame.type==='array'&&frame.numeric&&frame.count>=2&&frame.count<=3)nodes++;}
 for(;;){
  budget?.check();white();
  if(!stack.length){if(rootRead){if(i!==text.length)throw invalid();return {coordinateCount:nodes,hasTerrain};}value();continue;}
  const frame=stack.at(-1),end=frame.type==='array'?']':'}';
  if(frame.state==='first'&&text[i]===end){close();continue;}
  if(frame.state==='comma'){if(text[i]===end){close();continue;}if(text[i++]!==',')throw invalid();frame.state=frame.type==='array'?'value':'key';continue;}
  if(frame.type==='object'&&['first','key'].includes(frame.state)){frame.key=string(true);frame.state='colon';continue;}
  if(frame.state==='colon'){if(text[i++]!==':')throw invalid();frame.state='value';continue;}
  value();
 }
}
export function inspectTerrainJsonCoordinates(text,budget,options){return inspectTerrainJsonText(text,budget,options).coordinateCount;}
export function decodeTerrainHistoryBefore(encoded,budget){
 try{
  inspectTerrainHistoryBefore(encoded,budget);
  const binary=atob(encoded.data),input=Uint8Array.from(binary,c=>c.charCodeAt(0));if(input.length>MAX_COMPRESSED_BYTES||base64(input)!==encoded.data)throw invalid();
  const chunks=[];let size=0;
  const inflater=new pako.Inflate({chunkSize:16384,windowBits:15});
  inflater.onData=chunk=>{budget?.check();if(size+chunk.length>encoded.plainBytes)throw invalid();size+=chunk.length;chunks.push(chunk);};
  inflater.push(input,false);budget?.check();
  if(inflater.err||!inflater.ended||inflater.strm.avail_in!==0||size!==encoded.plainBytes)throw invalid();
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),nodes=inspectTerrainJsonCoordinates(text,budget);
  budget?.check(nodes);const result=JSON.parse(text);budget?.check();
  if(JSON.stringify(result)!==text)throw invalid();return result;
 }catch(error){if(error?.status==='budget-exceeded')throw error;throw invalid();}
}
