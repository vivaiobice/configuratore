const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE=/^[0-9a-f]{64}$/;

function hex(bytes){
  return Array.from(bytes,value=>Number(value).toString(16).padStart(2,'0')).join('');
}

export function newReportShareToken(bytesFactory=()=>{
  const bytes=new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}){
  const bytes=bytesFactory();
  if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw new TypeError('Report token requires 32 random bytes');
  return hex(bytes);
}

export async function hashReportShareToken(token){
  const normalized=String(token??'').toLowerCase();
  if(!TOKEN_RE.test(normalized))throw new TypeError('Invalid report share token');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  return hex(new Uint8Array(digest));
}

export function buildSharedReportUrl(baseUrl,reportId,token){
  const normalizedId=String(reportId??'');
  const normalizedToken=String(token??'').toLowerCase();
  if(!UUID_RE.test(normalizedId))throw new TypeError('Invalid report id');
  if(!TOKEN_RE.test(normalizedToken))throw new TypeError('Invalid report share token');
  const url=new URL('shared-project.html',baseUrl);
  url.search='';url.hash='';
  url.searchParams.set('report',normalizedId);
  url.searchParams.set('token',normalizedToken);
  return url.toString();
}

export function parseSharedReportUrl(value){
  let url;
  try{url=value instanceof URL?value:new URL(value,globalThis.location?.href??'https://invalid.local/');}catch{return null;}
  const reportId=url.searchParams.get('report')??'';
  const token=(url.searchParams.get('token')??'').toLowerCase();
  return UUID_RE.test(reportId)&&TOKEN_RE.test(token)?{reportId,token}:null;
}
