/** Field attachments live independently of project snapshots. Never stores data URLs. */
export const FIELD_MEDIA_BUCKET = 'field-media';
export const FIELD_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const TABLE = 'field_media';
const DB_NAME = 'vivai-obice-field-media-v1';
const COLUMNS = 'id,owner_user_id,project_id,project_field_id,client_project_id,client_field_id,environment,object_path,file_name,mime_type,size_bytes,kind,note,created_at,status';
const uuidDefault = () => globalThis.crypto.randomUUID();
function failure(code, message, cause) { return Object.assign(new Error(message, cause ? {cause} : undefined), {code}); }
function cloudError(error) { return error?.code && /^[A-Z_]+$/.test(error.code) ? error : failure('CLOUD_STORAGE_FAILED', 'Impossibile completare il salvataggio del media nel cloud.', error); }
function result({data, error} = {}) { if (error) throw cloudError(error); return data; }
function item(row, storage) {
  return {id:row.id,name:row.file_name,mime:row.mime_type,size:Number(row.size_bytes),kind:row.kind,note:row.note || '',createdAt:row.created_at,storage,status:row.status || 'ready'};
}
function newest(rows) { return rows.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id)); }

export function createFieldMediaStore({client=null,getContext,indexedDB=globalThis.indexedDB,maxFileBytes=FIELD_MEDIA_MAX_BYTES,now=()=>new Date(),uuid=uuidDefault,URL=globalThis.URL}={}) {
  if (typeof getContext !== 'function') throw new TypeError('getContext required');
  let dbPromise=null,disposed=false,epoch=0,activeKey=null,authIdentity;
  const identify=user=>JSON.stringify(user ? [user.id,Boolean(user.is_anonymous),user.app_metadata?.role || null] : null);
  const urls=new Map();
  function releaseURL(url) { if(urls.has(url)){URL.revokeObjectURL(url);urls.delete(url);} }
  function invalidate() { epoch++;for(const url of [...urls.keys()])releaseURL(url);activeKey=null; }
  const subscription=client?.auth?.onAuthStateChange?.((event,session)=>{const next=identify(session?.user);if(event==='SIGNED_OUT' || (authIdentity!==undefined && authIdentity!==next))invalidate();authIdentity=next;})?.data?.subscription;
  function snapshot() {
    if(disposed)throw failure('STORE_DISPOSED','Archivio media chiuso.');
    const source=getContext() || {};
    const context={ownerId:source.ownerId || null,guestId:String(source.guestId || 'guest'),projectId:String(source.projectId || ''),fieldId:String(source.fieldId || ''),environment:source.environment,readOnly:Boolean(source.readOnly)};
    if(!context.projectId || !context.fieldId || !['LIVE','TEST'].includes(context.environment))throw failure('CONTEXT_REQUIRED','Seleziona un progetto e un campo per i media.');
    const key=JSON.stringify([context.ownerId,context.guestId,context.projectId,context.fieldId,context.environment,context.readOnly]);
    if(activeKey!==null && activeKey!==key)invalidate();activeKey=key;
    return {...context,key,epoch,scope:JSON.stringify(['guest',context.guestId,context.projectId,context.fieldId,context.environment])};
  }
  function assertCurrent(context) {
    const current=snapshot();
    if(current.key!==context.key || current.epoch!==context.epoch)throw failure('CONTEXT_CHANGED','Il campo o l’account è cambiato durante l’operazione.');
  }
  async function authenticate(context,write=false) {
    assertCurrent(context);
    if(!client?.auth?.getSession)throw failure('AUTH_REQUIRED','Accedi per salvare i media nel cloud.');
    const {data,error}=await client.auth.getSession();assertCurrent(context);
    const user=data?.session?.user;authIdentity=identify(user);
    if(error || !user || user.is_anonymous===true)throw failure('AUTH_REQUIRED','Accedi per salvare i media nel cloud.',error);
    if(user.id!==context.ownerId && !(context.readOnly && !write && user.app_metadata?.role==='admin'))throw failure('OWNER_MISMATCH','L’account non è proprietario di questo campo.');
    return user;
  }
  function writable(context) { if(context.readOnly)throw failure('READ_ONLY','Questo campo è in sola lettura.'); }
  function scoped(query,context,fieldId) { return query.eq('owner_user_id',context.ownerId).eq('project_field_id',fieldId); }
  async function checked(context,operation,write=false) { await authenticate(context,write);const data=result(await operation());await authenticate(context,write);return data; }
  async function openDb() {
    if(!indexedDB?.open)throw failure('LOCAL_STORAGE_UNAVAILABLE','Il browser non offre un archivio locale per i media.');
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('media'))request.result.createObjectStore('media',{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(failure('LOCAL_STORAGE_FAILED','Impossibile aprire l’archivio media locale.',request.error));
      request.onblocked=()=>reject(failure('LOCAL_STORAGE_FAILED','Chiudi le altre schede e riprova ad aprire i media.'));
    }).catch(error=>{dbPromise=null;throw error;});
    return dbPromise;
  }
  async function localRequest(mode,action) {
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      let value;let transaction;
      try {
        transaction=db.transaction('media',mode);
        transaction.oncomplete=()=>resolve(value);
        transaction.onerror=()=>reject(failure('LOCAL_STORAGE_FAILED','Impossibile salvare i media sul dispositivo.',transaction.error));
        transaction.onabort=()=>reject(failure('LOCAL_STORAGE_FAILED','Spazio locale insufficiente o salvataggio interrotto.',transaction.error));
        const request=action(transaction.objectStore('media'));
        request.onsuccess=()=>{value=request.result;};
        request.onerror=()=>reject(failure('LOCAL_STORAGE_FAILED','Impossibile leggere o salvare il media locale.',request.error));
      }catch(error){reject(failure('LOCAL_STORAGE_FAILED','Impossibile accedere ai media locali.',error));}
    });
  }
  async function localRow(context,id) {
    const row=await localRequest('readonly',store=>store.get(String(id)));assertCurrent(context);
    if(!row || row.scope!==context.scope)throw failure('MEDIA_NOT_FOUND','Media non trovato in questo campo.');return row;
  }
  async function cloudRow(context,id) {
    const {fieldId}=await validateSavedField(context);
    const row=await checked(context,()=>scoped(client.from(TABLE).select(COLUMNS),context,fieldId).eq('id',String(id)).maybeSingle());
    if(!row || row.owner_user_id!==context.ownerId || row.project_field_id!==fieldId)throw failure('MEDIA_NOT_FOUND','Media non trovato in questo campo.');return row;
  }
  async function list() {
    const context=snapshot();
    if(!context.ownerId){const rows=await localRequest('readonly',store=>store.getAll());assertCurrent(context);return newest(rows.filter(row=>row.scope===context.scope).map(row=>item(row,'local')));}
    const {fieldId}=await validateSavedField(context);
    const rows=[];const pageSize=500;
    for(let offset=0;;offset+=pageSize){
      const page=await checked(context,()=>{let query=scoped(client.from(TABLE).select(COLUMNS),context,fieldId);if(context.readOnly)query=query.eq('status','ready');return query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize-1);});
      const filtered=(page || []).filter(row=>row.owner_user_id===context.ownerId && row.project_field_id===fieldId && (row.status==='ready' || (!context.readOnly && row.status==='pending')));
      rows.push(...filtered.map(row=>item(row,'cloud')));if((page || []).length<pageSize)break;
    }
    return newest(rows);
  }
  async function validateSavedField(context,write=false) {
    const project=await checked(context,()=>client.from('projects').select('id').eq('client_project_id',context.projectId).eq('owner_user_id',context.ownerId).eq('environment',context.environment).is('deleted_at',null).maybeSingle(),write);
    if(!project?.id)throw failure('PROJECT_NOT_SAVED','Salva prima il progetto e il campo nel cloud.');
    const field=await checked(context,()=>client.from('project_fields').select('id').eq('project_id',project.id).eq('owner_user_id',context.ownerId).eq('client_field_id',context.fieldId).is('deleted_at',null).maybeSingle(),write);
    if(!field?.id)throw failure('PROJECT_NOT_SAVED','Salva prima il progetto e il campo nel cloud.');return {projectId:project.id,fieldId:field.id};
  }
  async function cleanup(context,row,blobAttempted) {
    try {
      // Use the captured owner and path. RLS also prevents cleanup by a changed account.
      const {data,error}=await client.auth.getSession();
      if(error || data?.session?.user?.id!==context.ownerId || data.session.user.is_anonymous===true)throw failure('AUTH_REQUIRED','Account cambiato prima della pulizia.');
      if(blobAttempted)result(await client.storage.from(FIELD_MEDIA_BUCKET).remove([row.object_path]));
      result(await scoped(client.from(TABLE).delete(),context,row.project_field_id).eq('id',row.id));
    }catch(error){throw failure('CLEANUP_FAILED','Caricamento interrotto: un media incompleto richiede una nuova eliminazione.',error);}
  }
  async function upload(file,{kind='file',note=''}={}) {
    const context=snapshot();writable(context);
    if(!file || typeof file.size!=='number' || typeof file.arrayBuffer!=='function')throw failure('INVALID_FILE','Seleziona un file valido.');
    if(file.size<=0)throw failure('EMPTY_FILE','Il file è vuoto.');
    if(file.size>maxFileBytes)throw failure('FILE_TOO_LARGE',`Il limite per file è ${Math.floor(maxFileBytes/1024/1024)} MB.`);
    if(!['photo','file'].includes(kind))throw failure('INVALID_FILE','Tipo di media non valido.');
    const noteText=String(note).trim();if(noteText.length>2000)throw failure('INVALID_NOTE','La nota può contenere fino a 2000 caratteri.');
    const row={id:uuid(),file_name:String(file.name || (kind==='photo'?'Foto':'Allegato')).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,255)||'Allegato',mime_type:String(file.type || 'application/octet-stream').slice(0,255),size_bytes:file.size,kind,note:noteText};
    if(!context.ownerId){
      const local={...row,created_at:new Date(now()).toISOString(),scope:context.scope,blob:file};
      await openDb();assertCurrent(context);await localRequest('readwrite',store=>store.put(local));assertCurrent(context);return item(local,'local');
    }
    const {projectId,fieldId}=await validateSavedField(context,true);
    Object.assign(row,{owner_user_id:context.ownerId,project_id:projectId,project_field_id:fieldId,client_project_id:context.projectId,client_field_id:context.fieldId,environment:context.environment,object_path:`${context.ownerId}/${context.projectId}/${context.environment}/${row.id}`,status:'pending'});
    let reserveAttempted=false,blobAttempted=false;
    try {
      await authenticate(context,true);reserveAttempted=true;const reservedRow=result(await client.from(TABLE).insert(row).select(COLUMNS).single());await authenticate(context,true);
      blobAttempted=true;result(await client.storage.from(FIELD_MEDIA_BUCKET).upload(row.object_path,file,{upsert:false,contentType:row.mime_type,cacheControl:'60'}));await authenticate(context,true);
      const ready=result(await scoped(client.from(TABLE).update({status:'ready'}),context,fieldId).eq('id',row.id).select(COLUMNS).single());await authenticate(context,true);
      return item(ready || {...reservedRow,status:'ready'},'cloud');
    }catch(error){if(reserveAttempted)await cleanup(context,row,blobAttempted);throw cloudError(error);}
  }
  async function remove(id) {
    const context=snapshot();writable(context);
    if(!context.ownerId){await localRow(context,id);assertCurrent(context);await localRequest('readwrite',store=>store.delete(String(id)));assertCurrent(context);for(const [url,entry] of urls)if(entry.id===String(id))releaseURL(url);return true;}
    const row=await cloudRow(context,id);await authenticate(context,true);
    result(await client.storage.from(FIELD_MEDIA_BUCKET).remove([row.object_path]));await authenticate(context,true);
    result(await scoped(client.from(TABLE).delete(),context,row.project_field_id).eq('id',row.id));await authenticate(context,true);return true;
  }
  async function getURL(id,{download=false}={}) {
    const context=snapshot();
    if(!context.ownerId){const row=await localRow(context,id);if(!URL?.createObjectURL)throw failure('LOCAL_STORAGE_UNAVAILABLE','Anteprima non disponibile nel browser.');const url=URL.createObjectURL(row.blob);urls.set(url,{id:String(id),scope:context.scope});return url;}
    const row=await cloudRow(context,id);if(row.status!=='ready')throw failure('MEDIA_NOT_FOUND','Il caricamento del media non è completo.');
    const data=await checked(context,()=>client.storage.from(FIELD_MEDIA_BUCKET).createSignedUrl(row.object_path,3600,download?{download:row.file_name}:undefined));
    if(!data?.signedUrl || !/^https?:\/\//.test(data.signedUrl))throw failure('CLOUD_STORAGE_FAILED','URL del media non disponibile.');return data.signedUrl;
  }
  function dispose(){if(disposed)return;invalidate();disposed=true;subscription?.unsubscribe?.();dbPromise?.then(db=>db.close?.()).catch(()=>{});}
  return {list,upload,delete:remove,getURL,releaseURL,invalidate,dispose,maxFileBytes};
}
