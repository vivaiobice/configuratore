export const OWNER='11111111-1111-4111-8111-111111111111';
export const PROJECT='22222222-2222-4222-8222-222222222222';
export const SERVER_PROJECT='33333333-3333-4333-8333-333333333333';
export const SERVER_FIELD='55555555-5555-4555-8555-555555555555';
export function context(extra={}) { return {ownerId:null,guestId:'browser-guest',projectId:PROJECT,fieldId:'field-a',environment:'LIVE',...extra}; }
export function file(name='foto.jpg',type='image/jpeg',body='photo bytes') { return Object.assign(new Blob([body],{type}),{name}); }
export function deferred() { let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve}; }
export function fakeIndexedDB() {
  const databases=new Map();let failCommit=false;
  return {
    failNextCommit(){failCommit=true;},
    open(name) {
      const req={};queueMicrotask(()=>{
        let data=databases.get(name);const fresh=!data;
        if(!data){data=new Map();databases.set(name,data);}
        const db={objectStoreNames:{contains:n=>data.has(n)},createObjectStore:n=>data.set(n,new Map()),close(){},
          transaction(storeName,mode){
            const records=data.get(storeName);const staged=new Map(records);const tx={};let pending=0;let finished=false;
            const complete=()=>{if(finished||pending)return;finished=true;
              if(mode==='readwrite'&&failCommit){failCommit=false;tx.error=new Error('quota');tx.onabort?.();return;}
              if(mode==='readwrite'){records.clear();for(const [k,v] of staged)records.set(k,v);}tx.oncomplete?.();};
            const request=fn=>{pending++;const r={};queueMicrotask(()=>{try{r.result=fn();r.onsuccess?.();}catch(e){r.error=e;r.onerror?.();tx.error=e;tx.onabort?.();}pending--;queueMicrotask(complete);});return r;};
            tx.objectStore=()=>({get:id=>request(()=>staged.get(id)),getAll:()=>request(()=>[...staged.values()]),put:value=>request(()=>{staged.set(value.id,value);return value.id;}),delete:id=>request(()=>staged.delete(id))});
            queueMicrotask(complete);return tx;
          }};
        req.result=db;if(fresh)req.onupgradeneeded?.();req.onsuccess?.();
      });return req;
    }
  };
}
export function fakeCloud({owner=OWNER}={}) {
  const calls=[];const media=new Map();const objects=new Map();let user={id:owner,is_anonymous:false,app_metadata:{}};
  const projects=new Map([[SERVER_PROJECT,{id:SERVER_PROJECT,owner_user_id:owner,client_project_id:PROJECT,environment:'LIVE',deleted_at:null}]]);
  const fields=new Map([[SERVER_FIELD,{id:SERVER_FIELD,project_id:SERVER_PROJECT,owner_user_id:owner,client_field_id:'field-a',deleted_at:null}]]);const listeners=new Set();
  const hooks={};let insertError=null,readyError=null,removeError=null,deleteError=null;
  const client={
    calls,media,objects,hooks,projects,fields,emitAuth(event){for(const listener of listeners)listener(event,user?{user}:null);},
    setUser(value){user=value;},failInsert(error){insertError=error;},failReady(error){readyError=error;},failRemove(error){removeError=error;},failDelete(error){deleteError=error;},
    auth:{onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};},async getSession(){await hooks.session?.();return {data:{session:user?{user}:null},error:null};}},
    from(table){
      let action='select',payload,filters=[],single=false;
      const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},order(){return q;},range(){return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},insert(v){action='insert';payload=v;return q;},update(v){action='update';payload=v;return q;},delete(){action='delete';return q;},
        then(resolve,reject){return (async()=>{
          calls.push([table,action,filters,payload]);await hooks[`${table}:${action}`]?.();
          let rows=table==='projects'?[...projects.values()]:table==='project_fields'?[...fields.values()]:[...media.values()];
          rows=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
          if(action==='insert'){if(insertError)return {data:null,error:insertError};const r={...payload,created_at:payload.created_at||'2026-10-13T10:00:00Z'};media.set(r.id,r);rows=[r];}
          if(action==='update'){if(readyError&&payload.status==='ready')return {data:null,error:readyError};rows=rows.map(r=>{const next={...r,...payload};media.set(r.id,next);return next;});}
          if(action==='delete'){if(deleteError)return {data:null,error:deleteError};rows.forEach(r=>media.delete(r.id));}
          return {data:single?(rows[0]||null):rows,error:null};
        })().then(resolve,reject);}
      };return q;
    },
    storage:{from(bucket){return {
      async upload(path,blob,options){calls.push(['upload',bucket,path,options]);await hooks.upload?.();objects.set(path,blob);return {data:{path},error:null};},
      async remove(paths){calls.push(['remove',bucket,paths]);await hooks.remove?.();if(removeError)return {data:null,error:removeError};paths.forEach(p=>objects.delete(p));return {data:paths,error:null};},
      async createSignedUrl(path,seconds,options){calls.push(['signed',bucket,path,seconds,options]);await hooks.signed?.();return {data:{signedUrl:`https://signed.example/${path}`},error:null};}
    };}}
  };return client;
}
