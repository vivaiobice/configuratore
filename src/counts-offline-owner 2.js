const key=config=>'vivai-obice:counts:last-owner:'+JSON.stringify([new URL(config.backendUrl).origin,config.environment]);
export const countsAuthStorageKey=config=>'sb-'+new URL(config.backendUrl).hostname.split('.')[0]+'-auth-token';
export function forgetCountsOwner(storage,config){try{storage?.removeItem(key(config));}catch{}}
export function isCountsNetworkError(error){return !error?.status&&!['42501','AUTH_REQUIRED','ADMIN_REQUIRED'].includes(error?.code)&&(/Failed to fetch|fetch failed|Network(?:Error| request failed| unavailable)|Load failed|dynamically imported module/i.test(String(error?.message))||error?.name==='AuthRetryableFetchError');}
export function rememberCountsOwner(storage,config,state){
 if(state?.kind==='loading')return;
 if(!state?.user?.id){forgetCountsOwner(storage,config);return;}
 try{storage?.setItem(key(config),JSON.stringify({version:1,ownerId:state.user.id,anonymous:state.user.is_anonymous===true,displayName:String(state.displayName||'Profilo').slice(0,160)}));}catch{}
}
export function readCountsOfflineOwner(storage,config){
 try{const value=JSON.parse(storage?.getItem(key(config))||'null'),session=JSON.parse(storage?.getItem(countsAuthStorageKey(config))||'null');return value?.version===1&&typeof value.ownerId==='string'&&value.ownerId&&session?.user?.id===value.ownerId?value:null;}catch{return null;}
}
