export function createAuthBridge(){
  const listeners=new Set();let service=null,detach=null,state={kind:'guest',displayName:'Guest',username:null,email:null,isAdmin:false};
  const emit=next=>{state=next;for(const listener of listeners)listener(state);};
  const call=(name,...args)=>{if(!service?.[name])throw new Error('Accesso temporaneamente non disponibile');return service[name](...args);};
  return {
    getState:()=>state,
    subscribe(listener){listeners.add(listener);listener(state);return()=>listeners.delete(listener);},
    attach(next){detach?.();service=next;state=next.getState?.()??state;detach=next.subscribe?.(emit)??null;return state;},
    login:value=>call('login',value),register:value=>call('register',value),logout:()=>call('logout'),
    requestPasswordReset:value=>call('requestPasswordReset',value),completePasswordReset:value=>call('completePasswordReset',value)
  };
}
