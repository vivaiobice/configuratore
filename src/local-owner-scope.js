let owner=null;
export function setLocalOwnerScope(userId){owner=String(userId||'').trim()||null;}
export function localOwnerScope(){return owner;}
export function ownerStorageKey(base,environment='LIVE'){
  return environment==='LIVE'?`${base}:live:${owner||'uninitialized'}`:base;
}
