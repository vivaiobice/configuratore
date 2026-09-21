const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE=/^[a-z0-9._-]{3,32}$/;

export function validateLoginPayload(input={}){
  const identifier=String(input.identifier??'').trim();
  const password=String(input.password??'');
  if(!identifier||identifier.length>256||!password||password.length>1024)throw new TypeError('invalid_payload');
  return {identifier,password};
}

export async function resolveIdentifierEmail(identifier,{resolveUsername}){
  const value=String(identifier??'').trim().toLowerCase();
  if(value.includes('@'))return EMAIL_RE.test(value)?value:null;
  if(!USERNAME_RE.test(value))return null;
  return await resolveUsername(value);
}

export function publicAuthError(){return {status:401,body:{error:'Credenziali non valide'}};}

export async function rateLimitKey(ip,identifier){
  const input=`${String(ip??'unknown')}|${String(identifier??'').trim().toLowerCase()}`;
  const bytes=new TextEncoder().encode(input);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
