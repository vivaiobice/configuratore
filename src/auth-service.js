import {profileView,validateRegistration,classifyIdentifier} from './auth-model.js';

const PENDING_TRANSFER_KEY='vivai-obice:auth:pending-transfer';
const GENERIC_ERROR='Credenziali non valide';

export function createAuthService({client,backend,storage=globalThis.localStorage,resetRedirectTo=globalThis.location?.origin,beforeIdentityChange=()=>{},afterIdentityChange=()=>{}}){
  if(!client?.auth||!backend)throw new TypeError('Auth client e backend richiesti');
  const listeners=new Set();
  let state={kind:'loading',displayName:'Profilo',username:null,email:null,isAdmin:false,user:null,transfer:null};
  const emit=next=>{state={...state,...next};for(const listener of listeners)listener(state);return state;};
  const pending=()=>{try{return JSON.parse(storage?.getItem(PENDING_TRANSFER_KEY)||'null');}catch{return null;}};
  const savePending=value=>value?storage?.setItem(PENDING_TRANSFER_KEY,JSON.stringify(value)):storage?.removeItem(PENDING_TRANSFER_KEY);

  async function refresh(sessionOverride=null){
    const response=sessionOverride?{data:{session:sessionOverride}}:await client.auth.getSession();
    const session=response?.data?.session??null;
    const profile=session?.user?.id&&typeof backend.getProfile==='function'?await backend.getProfile(session.user.id):null;
    return emit({...profileView(session,profile),transfer:state.transfer});
  }

  async function register(input){
    await beforeIdentityChange();
    try{
    const value=validateRegistration(input);
    const promoted=await backend.promoteGuestAccount(value);
    const signed=await client.auth.setSession({access_token:promoted.session.access_token,refresh_token:promoted.session.refresh_token});
    if(signed.error)throw signed.error;
    return refresh(signed.data.session);
    }finally{await afterIdentityChange();}
  }

  async function resumePendingTransfer(){
    const record=pending();
    if(!record)return emit({transfer:null});
    try{
      const result=await backend.consumeGuestTransferGrant(record.token);
      savePending(null);
      return emit({transfer:{status:'completed',transferredProjectCount:Number(result?.transferredProjectCount??0)}});
    }catch(error){emit({transfer:{status:'pending',message:'Sincronizzazione in attesa'}});throw error;}
  }

  async function login({identifier,password}){
    await beforeIdentityChange();
    try{
    const normalized=classifyIdentifier(identifier).value;
    const current=await client.auth.getSession();
    const guestSession=current?.data?.session;
    let grant=null;
    if(guestSession?.user?.is_anonymous===true){
      grant=await backend.createGuestTransferGrant();
      savePending({token:grant,createdAt:new Date().toISOString()});
    }
    const session=await backend.loginByIdentifier({identifier:normalized,password:String(password??'')});
    const signed=await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
    if(signed.error)throw new Error(GENERIC_ERROR);
    await refresh(signed.data.session);
    if(grant)await resumePendingTransfer();
    return state;
    }finally{await afterIdentityChange();}
  }

  async function logout(){
    await beforeIdentityChange();
    try{
    const result=await client.auth.signOut();if(result.error)throw result.error;
    const guest=await backend.ensureAnonymousSession();
    savePending(null);
    return emit({...profileView(guest,null),transfer:null});
    }finally{await afterIdentityChange();}
  }

  async function requestPasswordReset(email){
    const normalized=classifyIdentifier(email);if(normalized.kind!=='email')throw new TypeError('Inserisci la tua e-mail');
    const result=await client.auth.resetPasswordForEmail(normalized.value,{redirectTo:resetRedirectTo});
    if(result.error)throw result.error;return true;
  }

  async function completePasswordReset(password){
    if(String(password??'').length<8)throw new TypeError('La password deve contenere almeno 8 caratteri');
    const result=await client.auth.updateUser({password:String(password)});if(result.error)throw result.error;return refresh();
  }

  async function updateProfile(input={}){
    if(state.kind!=='user'||!state.user?.id)throw new Error('Accedi per aggiornare il profilo');
    const clean=value=>String(value??'').trim().slice(0,160);
    const firstName=clean(input.firstName),lastName=clean(input.lastName);
    const row=await backend.upsertProfile({
      user_id:state.user.id,owner_kind:state.isAdmin?'admin':'user',
      display_name:clean([firstName,lastName].filter(Boolean).join(' '))||state.displayName,
      username:state.username,
      first_name:firstName,last_name:lastName,company_name:clean(input.companyName),address:clean(input.address),
      postal_code:clean(input.postalCode).slice(0,16),city:clean(input.city),province:clean(input.province).toUpperCase().slice(0,2),
      vat_number:clean(input.vatNumber).slice(0,32),phone:clean(input.phone).slice(0,32),updated_at:new Date().toISOString()
    });
    return emit({...profileView({user:state.user},row),transfer:state.transfer});
  }

  return {getState:()=>state,subscribe(listener){listeners.add(listener);listener(state);return()=>listeners.delete(listener);},refresh,register,login,logout,requestPasswordReset,completePasswordReset,updateProfile,resumePendingTransfer};
}
