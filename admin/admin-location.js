function canonicalLocation(value={}){
  return {
    municipality:String(value.municipality??'').trim(),
    province:String(value.province??'').trim(),
    region:String(value.region??'').trim(),
    locationLabel:String(value.locationLabel??'').trim()
  };
}

export function createAdminLocationManager({resolve,persist,onResolved=()=>{},onError=()=>{},operationIdFactory=()=>globalThis.crypto.randomUUID()}={}){
  if(typeof resolve!=='function'||typeof persist!=='function')throw new TypeError('Location resolver and persistence are required');
  const states=new Map();
  const generations=new Map();
  const retryOperations=new Map();

  function nextGeneration(rowId){const value=(generations.get(rowId)??0)+1;generations.set(rowId,value);return value;}
  function operationFor(rowId,location){
    const signature=JSON.stringify(location),current=retryOperations.get(rowId);
    if(current?.signature===signature)return current;
    const next={signature,operationId:operationIdFactory()};retryOperations.set(rowId,next);return next;
  }

  async function run(row,locationPromise,{throwOnError=false,generation=nextGeneration(row.rowId),waitFor=null}={}){
    try{
      const location=canonicalLocation(await locationPromise);
      if(!location.municipality||generations.get(row.rowId)!==generation)return null;
      if(waitFor)try{await waitFor;}catch{}
      if(generations.get(row.rowId)!==generation)return null;
      const operation=operationFor(row.rowId,location);
      await persist(row,location,{operationId:operation.operationId});
      if(generations.get(row.rowId)!==generation)return null;
      if(retryOperations.get(row.rowId)===operation)retryOperations.delete(row.rowId);
      states.set(row.rowId,{status:'resolved',location});
      onResolved(row,location);
      return location;
    }catch(error){if(generations.get(row.rowId)===generation)states.delete(row.rowId);onError(error,row);if(throwOnError)throw error;return null;}
  }

  function enrich(rows=[]){
    const jobs=[];
    for(const row of rows){
      if(row?.municipality||row?.field?.municipality){states.set(row.rowId,{status:'resolved'});continue;}
      if(!row?.rowId||!row.geometryValid||states.has(row.rowId))continue;
      const generation=nextGeneration(row.rowId);
      const promise=run(row,resolve(row.field),{generation});
      states.set(row.rowId,{status:'pending',promise});jobs.push(promise);
    }
    return Promise.all(jobs);
  }

  async function save(row,value){
    if(!row?.rowId)throw new TypeError('Field row required');
    const location=canonicalLocation(value);
    if(!location.municipality)throw new TypeError('Località/comune obbligatoria');
    const previous=states.get(row.rowId)?.promise??null;
    const generation=nextGeneration(row.rowId);
    const promise=run(row,Promise.resolve(location),{throwOnError:true,generation,waitFor:previous});
    states.set(row.rowId,{status:'pending',promise});
    return promise;
  }

  return {enrich,save,stateFor:rowId=>states.get(rowId)??null};
}
