import {buildTerrainProposal} from './terrain-design.js?v=1.3.6';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {TERRAIN_CONTOUR_ALGORITHM_VERSION} from './terrain-contour-contracts.js?v=1.3.6';
import {buildTerrainRestoreProposal,attachTerrainRestore,assertTerrainRestoreHistory} from './terrain-history.js?v=1.3.6';
import {buildTerrainCutSuggestions} from './terrain-cut-suggestions.js?v=1.3.6';
import {buildOwnedTerrainEndpointReplacement} from './terrain-contour-design.js?v=1.3.6';
import {resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.6';
import {validateCoordinate} from './coordinate-editor.js?v=1.3.6';
import {chargeTerrainOperationCopy} from './terrain-worker-client.js?v=1.3.6';

const invalidCut=message=>Object.assign(new Error(message),{status:'invalid-input'});
function cutProposal(options,budget){
 budget.check();
 if(typeof options.operationId!=='string'||!options.operationId)throw invalidCut('Identità del calcolo non valida.');
 const request=options.cutRequest;
 if(!request||typeof request!=='object'||Array.isArray(request))throw invalidCut('Richiesta di passaggio non valida.');
 if(request.action==='suggest'){
  if(Object.keys(request).some(key=>key!=='action'))throw invalidCut('Richiesta di passaggio non valida.');
  return buildTerrainCutSuggestions({project:options.project,model:options.model,portionId:options.portionId,diagnostics:options.diagnostics,noCutProposal:options.noCutProposal,budget});
 }
 if(request.action!=='endpoint'||Object.keys(request).some(key=>!['action','exclusionId','endpointIndex','coordinate'].includes(key))||typeof request.exclusionId!=='string'||!request.exclusionId||![0,1].includes(request.endpointIndex))throw invalidCut('Estremo del passaggio non valido.');
 validateCoordinate(request.coordinate);
 const project=options.project,model=options.model,matches=(project?.exclusions??[]).filter(member=>member?.id===request.exclusionId);
 if(matches.length!==1||typeof matches[0].passageGroupId!=='string'||!matches[0].passageGroupId)throw invalidCut('Il passaggio selezionato è cambiato.');
 const group=resolveTerrainExclusionGroups({exclusions:project.exclusions,field:project.geometry??project.polygon,budget}).groups.find(group=>group.groupId===matches[0].passageGroupId);
 if(!group||!group.members.some(member=>member.id===request.exclusionId)||group.owner.surfaceGeometryConvention!=='domain-intersection'||group.owner.modelHash!==model?.contentHash)throw invalidCut('Modifica degli estremi non disponibile per questo passaggio.');
 const owner=group.owner;
 if(request.coordinate.every((value,index)=>value===owner.sourceAxis[request.endpointIndex][index]))return {ok:false,status:'no-change',kind:'cut',message:'Le coordinate non sono cambiate.'};
 chargeTerrainOperationCopy(owner.sourceAxis,budget);const sourceAxis=structuredClone(owner.sourceAxis);
 chargeTerrainOperationCopy(request.coordinate,budget);sourceAxis[request.endpointIndex]=[...request.coordinate];
 return buildOwnedTerrainEndpointReplacement({project,model,exclusionId:request.exclusionId,sourceAxis,budget});
}

self.onmessage=event=>{
 const options=event.data;
 // Keep historical callers and their direct reply shape unchanged.
 if(options?.algorithmVersion!==TERRAIN_CONTOUR_ALGORITHM_VERSION){self.postMessage(buildTerrainProposal(options));return;}
 const kind=options.kind===undefined?(options.mode??(options.followTerrain===false?'measure':'adapt')):options.kind;
 let proposal,budget;
 try{
  budget=createTerrainBudget({kind,deadlineMs:options.deadlineMs,...(kind==='cut'?{initialNodeCount:options.initialNodeCount??0}:{}),onProgress:progress=>self.postMessage({type:'progress',...progress})});
  if(kind==='restore')proposal=buildTerrainRestoreProposal({...options,budget});
  else if(kind==='cut'){
   proposal=cutProposal(options,budget);
   if(proposal.ok){
    proposal=attachTerrainRestore({project:options.project,proposal,operationId:options.operationId,budget});
    assertTerrainRestoreHistory({project:{...options.project,...proposal.projectPatch,terrain:proposal.terrain,rowPortions:proposal.rowPortions},budget});
   }
  }
  else if(kind!=='adapt'&&kind!=='measure')proposal={ok:false,status:'unsupported-operation',kind,message:'Operazione terreno non disponibile.'};
  else proposal=buildTerrainProposal({...options,mode:kind,budget});
 }catch(error){proposal={ok:false,status:error.status??'invalid-input',kind,message:error.message,...(error.budgetReason?{budgetReason:error.budgetReason,diagnostics:{budget:{reason:error.budgetReason,phase:error.budgetPhase,...error.budgetUsage}}}:{})};}
 if(kind==='cut'){
  // The output postMessage is another owned clone. An exhausted ledger must
  // discard even a fully produced candidate before sending any partial patch.
  try{chargeTerrainOperationCopy(proposal,budget);budget.check();}
  catch(error){proposal={ok:false,status:error.status??'invalid-input',kind,message:error.message,...(error.budgetReason?{budgetReason:error.budgetReason,diagnostics:{budget:{reason:error.budgetReason,phase:error.budgetPhase,...error.budgetUsage}}}:{})};}
  self.postMessage({type:'result',proposal,operationId:options.operationId,usage:budget?.usage()});return;
 }
 self.postMessage({type:'result',proposal});
};
