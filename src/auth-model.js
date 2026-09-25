const USERNAME_RE=/^[a-z0-9._-]{3,32}$/;
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUsername(value){
  const username=String(value??'').trim().toLowerCase();
  if(!USERNAME_RE.test(username))throw new TypeError('Username non valido');
  return username;
}

export function classifyIdentifier(value){
  const identifier=String(value??'').trim().toLowerCase();
  if(identifier.includes('@')){
    if(!EMAIL_RE.test(identifier))throw new TypeError('E-mail non valida');
    return {kind:'email',value:identifier};
  }
  return {kind:'username',value:normalizeUsername(identifier)};
}

export function validateRegistration(input={}){
  const displayName=String(input.displayName??'').trim();
  const email=String(input.email??'').trim().toLowerCase();
  const password=String(input.password??'');
  if(displayName.length<2)throw new TypeError('Nome profilo non valido');
  if(!EMAIL_RE.test(email))throw new TypeError('E-mail non valida');
  if(password.length<8)throw new TypeError('La password deve contenere almeno 8 caratteri');
  return {displayName,email,username:normalizeUsername(input.username),password};
}

export function profileView(session,profile={}){
  const user=session?.user??null;
  if(!user||user.is_anonymous===true)return {kind:'guest',displayName:'Guest',username:null,email:null,isAdmin:false,user};
  const displayName=String(profile?.display_name??'').trim()||String(user.email??'').split('@')[0]||'Profilo';
  return {
    kind:'user',displayName,username:profile?.username??null,email:user.email??null,
    firstName:profile?.first_name??'',lastName:profile?.last_name??'',companyName:profile?.company_name??'',
    address:profile?.address??'',postalCode:profile?.postal_code??'',city:profile?.city??'',province:profile?.province??'',
    vatNumber:profile?.vat_number??'',phone:profile?.phone??'',
    isAdmin:user.app_metadata?.role==='admin',user
  };
}
