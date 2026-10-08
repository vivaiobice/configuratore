import {createTerrainBudget} from './terrain-budget.js?v=1.3.3';
import {createScopedTerrainCutEvaluator} from './terrain-contour-design.js?v=1.3.3';
import {preselectTerrainPassageCandidates} from './terrain-cut-candidates.js?v=1.3.3';
import {compareMeasuredSurfaceAreas} from './terrain-surface-bands.js?v=1.3.3';
import {legacyTerrainInputs} from './terrain-replay.js?v=1.3.3';
import {terrainInputHash,validateTerrainModel} from './terrain-model.js?v=1.3.3';

const failure=(status,message)=>Object.assign(new Error(message),{status});
function geometryNodes(value,budget,path=new WeakSet()){
 budget.check();
 if(!value||typeof value!=='object')return 0;
 if(path.has(value))throw failure('invalid-input','Dati ciclici nel progetto.');
 if(Array.isArray(value)&&(value.length===2||value.length===3)&&value.every(Number.isFinite))return 1;
 path.add(value);
 let count=0;
 for(const key of Object.keys(value))count+=geometryNodes(value[key],budget,path);
 path.delete(value);
 return count;
}
function fingerprint(project,model,budget){
 budget.check();
 const inputs=legacyTerrainInputs(project);
 // Existing hash/validation functions materialize canonical input arrays and
 // decode the frozen native grid. Account before either operation, without
 // retaining a second model, geometry or private certificate.
 budget.check(geometryNodes(inputs,budget)+(model?.grid?.width??0)*(model?.grid?.height??0));
 if(!validateTerrainModel(model).valid)throw failure('stale-context','Il modello terreno non corrisponde ai dati acquisiti.');
 const value=terrainInputHash({inputs,modelHash:model.contentHash});
 budget.check();return value;
}
function availableGroupId(project,portionId,requested,budget){
 const occupied=new Set();
 for(const item of [...(project.exclusions??[]),...(project.rowPortions??[])]){
  budget.check();
  if(item?.id)occupied.add(item.id);
  if(item?.passageGroupId)occupied.add(item.passageGroupId);
 }
 if(requested!==undefined){
  if(typeof requested!=='string'||!requested||occupied.has(requested))throw failure('invalid-input','Identità del nuovo passaggio non disponibile.');
  return requested;
 }
 const base=`${portionId}:terrain-cut`;
 let id=base,index=0;
 while(occupied.has(id)){budget.check();id=`${base}:${++index}`;}
 return id;
}
function heuristicInput(evaluator,portionId,noCutProposal,diagnostics){
 // Submitted DTOs can localize heuristic choices only. The baseline and every
 // applicable result are produced afresh by the real scoped evaluator.
 return {portions:[
  {portionId,...evaluator.noCutFamily.diagnostics},
  ...(noCutProposal?.diagnostics?.portions??[]),
  ...(diagnostics?.portions??[])
 ]};
}
/** One bounded, read-only search. Only actual completed native child families
 * and live private measurements can authorize the returned atomic proposal.
 * noCutProposal/diagnostics are heuristic input, never quantity certificates. */
export function buildTerrainCutSuggestions({project,model,portionId,noCutProposal,diagnostics:submittedDiagnostics,groupId,createId,referenceLevelM,budget=createTerrainBudget({kind:'cut'})}={}){
 const diagnostics={searchScope:'finite-width-priority-first-verified',globalOptimality:false,offeredCandidates:0,attemptedCandidates:0,evaluatedCandidates:0,completeCandidates:0,rejectedCandidates:0,skippedCandidates:0,feasibleSplits:0,candidates:[],unresolved:[]};
 const unsuccessful=(status,message)=>({ok:false,status,kind:'cut',message,diagnostics,timings:budget.timings()});
 try{
  budget.check();
  if(!project||typeof portionId!=='string'||!portionId)throw failure('invalid-input','Selezionare una porzione per il passaggio.');
  const initialFingerprint=fingerprint(project,model,budget);
  let baselineMeasurement,baselineCount=0;
  budget.phase('cut-search-baseline');
  const evaluator=createScopedTerrainCutEvaluator({project,model,portionId,referenceLevelM,budget,
   onBaselineAreaMeasurement(value){baselineCount++;baselineMeasurement=value;}});
  budget.check();
  const baselineCertified=evaluator.noCutFamily.ok===true;
  if(baselineCertified?baselineCount!==1:baselineCount!==0)throw failure('area-order-unresolved','Riferimento senza passaggio non verificabile.');
  if(baselineCertified)compareMeasuredSurfaceAreas(baselineMeasurement,baselineMeasurement,{budget});
  diagnostics.baseline={certified:baselineCertified,measurementCount:baselineCount,status:baselineCertified?'verified':evaluator.noCutFamily.status,
   servedAreaM2:baselineCertified?baselineMeasurement.areaM2:null,reason:evaluator.noCutFamily.diagnostics?.reason??null,
   diagnostics:evaluator.noCutFamily.diagnostics};
  const preselection=preselectTerrainPassageCandidates({domain:evaluator.physicalDomain,model,portionId,
   diagnostics:heuristicInput(evaluator,portionId,noCutProposal,submittedDiagnostics),budget});
  diagnostics.preselection=preselection.diagnostics;
  budget.check();
  if(preselection.diagnostics.status==='budget-exceeded')throw failure('budget-exceeded','Tempo o memoria di ricerca superati.');
  if(preselection.candidates.length>3)throw failure('candidate-limit','Troppi passaggi da verificare.');
  diagnostics.offeredCandidates=preselection.candidates.length;
  const candidateGroupId=preselection.candidates.length?availableGroupId(project,portionId,groupId,budget):null;
  let best=null;
  for(const [index,tuple] of preselection.candidates.entries()){
   budget.check();
   diagnostics.attemptedCandidates++;
   diagnostics.evaluatedCandidates++;
   let measurement,measurementCount=0;
   const proposal=evaluator.evaluateCandidate({sourceAxis:tuple.sourceAxis,widthM:tuple.widthM,groupId:candidateGroupId,createId,
    onSelectedAreaMeasurement(value){measurementCount++;measurement=value;}});
   budget.check();
   const summary={index,widthM:tuple.widthM,status:proposal.status,complete:proposal.ok===true,isSplit:proposal.isSplit===true,diagnostics:proposal.diagnostics};
   diagnostics.candidates.push(summary);
   if(!proposal.ok){
    diagnostics.rejectedCandidates++;
    diagnostics.unresolved.push({index,widthM:tuple.widthM,status:proposal.status,message:proposal.message});
    if(proposal.status==='budget-exceeded'||proposal.status==='stale-context')throw failure(proposal.status,proposal.message);
    continue;
   }
   diagnostics.completeCandidates++;
   if(measurementCount!==1)throw failure('area-order-unresolved','Superficie del passaggio non verificabile.');
   compareMeasuredSurfaceAreas(measurement,measurement,{budget});
   if(proposal.isSplit!==true||proposal.cutOperation.afterPortionIds.length<2){diagnostics.rejectedCandidates++;summary.reason='did-not-split';continue;}
   diagnostics.feasibleSplits++;
   const gainOrder=baselineCertified?compareMeasuredSurfaceAreas(measurement,baselineMeasurement,{budget}):null;
   summary.gainOrder=gainOrder;
   if(gainOrder!==null&&gainOrder<=0){diagnostics.rejectedCandidates++;summary.reason='no-served-area-gain';continue;}
   // Width-priority is an explicit finite search policy, not a claim about
   // unevaluated widths. Only a complete split and actual positive private
   // gain (or the separate uncertified-baseline branch) can stop the search.
   best={proposal,measurement,index};
   break;
  }
  diagnostics.skippedCandidates=diagnostics.offeredCandidates-diagnostics.evaluatedCandidates;
  budget.check();
  if(fingerprint(project,model,budget)!==initialFingerprint)throw failure('stale-context','Il progetto è cambiato durante la ricerca.');
  budget.check();
  if(!best)return unsuccessful(diagnostics.feasibleSplits&&baselineCertified?'no-benefit':'no-viable-cut',
   diagnostics.feasibleSplits&&baselineCertified?'Nessun passaggio verificato migliora la superficie servita.':'Nessun passaggio completamente verificato divide questa porzione.');
  diagnostics.selectedCandidateIndex=best.index;
  diagnostics.selectionReason=baselineCertified?'first-verified-positive-gain-in-width-order':'first-verified-split-in-width-order-no-certified-baseline';
  diagnostics.portions=best.proposal.diagnostics.portions;
  diagnostics.baselineQualification=baselineCertified?'certified-no-cut-family':'saved-drawing-not-certified';
  const comparison={...best.proposal.comparison,baselineCertified,
   noCutServedAreaM2:baselineCertified?baselineMeasurement.areaM2:null,
   cutServedAreaM2:best.measurement.areaM2,
   servedAreaGainM2:baselineCertified?best.measurement.areaM2-baselineMeasurement.areaM2:null,
   improved:baselineCertified?true:null,
   referenceQualification:diagnostics.baselineQualification};
  budget.check();
  return {...best.proposal,comparison,diagnostics,
   message:baselineCertified?'Passaggio verificato con maggiore superficie servita.':'Passaggio verificato. Confronto con il disegno precedente non certificato.',timings:budget.timings()};
 }catch(error){
  // The private comparator reports area-order-unresolved for its own exhausted
  // budget. Recheck the SAME ledger so a partial incumbent is never promoted.
  let status=error.status??(error instanceof RangeError?'invalid-input':'review-required'),message=error.message;
  diagnostics.skippedCandidates=diagnostics.offeredCandidates-diagnostics.evaluatedCandidates;
  try{budget.check();}catch(budgetError){status=budgetError.status??status;message=budgetError.message;}
  return unsuccessful(status,message);
 }
}
