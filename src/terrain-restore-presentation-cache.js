import {actualTerrainContentKey} from './terrain-actual-content.js?v=1.3.10';

// This key belongs only to an interface value. It is never a terrain proof,
// budget exemption, persisted fingerprint or caller-supplied source identity.
/** One exact-content UI result; every operation keeps its authoritative reader. */
export function createTerrainRestorePresentationCache(readAvailability){
 let previous=null;
 return {
  clear(){previous=null;},
  read(project,portionId){
   const projectKey=actualTerrainContentKey(project),portionKey=actualTerrainContentKey(portionId),key=projectKey===null||portionKey===null?null:projectKey+'|'+portionKey;
   if(key!==null&&previous?.key===key)return {...previous.value};
   previous=null;
   const value=readAvailability({project,portionId});
   if(key!==null&&(value.available===true||value.reason==='no-baseline'))previous={key,value:{...value}};
   return {...value};
  }
 };
}
