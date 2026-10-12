import {fieldCalculationInputs} from './field-calculation-inputs.js?v=1.3.10';
import {actualTerrainContentKey,isSupportedActualTerrainContent} from './terrain-actual-content.js?v=1.3.10';

/** A single applied display result. Authority paths call the calculator fresh. */
export function createTerrainCalculationPresentationCache(calculate){
 let previous=null;
 function read(project,getContext,fresh){
   // A failed fresh proof cannot leave an older successful display result.
   if(fresh)previous=null;
   // Inspect actual source descriptors before normalization reads properties.
   const context=getContext(),supported=isSupportedActualTerrainContent(project);
   const inputs=fieldCalculationInputs(project),key=supported?actualTerrainContentKey({inputs,context}):null;
   if(!fresh&&key!==null&&previous?.key===key)return structuredClone(previous.result);
   const result=calculate(inputs);
   // Ordinary manual/failed display reads do not evict the one applied value.
   // Fresh reads already cleared it above. Neither input hashes nor API receipts
   // establish reuse; actual operands and context must still match afterward.
   if(key!==null&&isSupportedActualTerrainContent(result)&&result?.terrainStatus==='applied'){
    const afterContext=getContext();
    if(isSupportedActualTerrainContent(project)&&actualTerrainContentKey({inputs:fieldCalculationInputs(project),context:afterContext})===key){
     previous={key,result:structuredClone(result)};
     if(!fresh)return structuredClone(previous.result);
    }
   }
   return result;
 }
 return {
  read:(project,context)=>read(project,()=>context,false),
  readFresh:(project,getContext=()=>undefined)=>read(project,getContext,true)
 };
}
