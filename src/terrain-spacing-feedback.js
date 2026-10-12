const SPACING_TOLERANCE_M=.20;
const quantity=value=>value.toLocaleString('it-IT',{maximumFractionDigits:2});
const nativeFaceId=value=>Number.isSafeInteger(value)&&value>=0;

function validDistance(distanceM,minimumM) {
 return Number.isFinite(minimumM)&&minimumM>0&&Array.isArray(distanceM)&&distanceM.length===2
  &&distanceM.every(Number.isFinite)&&distanceM[0]>=0&&distanceM[0]<=distanceM[1]
  &&distanceM[1]>0&&distanceM[1]<minimumM;
}

/** Read only the current owner's failed candidate diagnostics. The recognized
 * surface path proves an actual approach; an XYZ chord or unresolved estimate
 * cannot supply this feedback. This projection never certifies a new design.
 */
export function terrainSpacingFailureFeedback(diagnostics,{portionId,spacingM}={}) {
 if(typeof portionId!=='string'||!portionId.trim()||!Number.isFinite(spacingM)||!Array.isArray(diagnostics?.portions))return null;
 const minimumM=spacingM-SPACING_TOLERANCE_M;
 let distanceM=null;
 for(const portion of diagnostics.portions) {
  if(portion?.portionId!==portionId||!Array.isArray(portion.candidates))continue;
  for(const candidate of portion.candidates) {
   if(candidate?.valid!==false||!Array.isArray(candidate.validation?.critical))continue;
   for(const record of candidate.validation.critical) {
    if(record?.reason!=='too-close'||record.proof!=='continuous-surface-path'
     ||!nativeFaceId(record.sourceFaceId)||!nativeFaceId(record.targetFaceId)
     ||!validDistance(record.distanceM,minimumM))continue;
    if(!distanceM||record.distanceM[1]<distanceM[1])distanceM=[...record.distanceM];
   }
  }
 }
 return distanceM?{distanceM,minimumM}:null;
}

/** Format validated numbers as text only, ignoring all caller-supplied prose. */
export function terrainSpacingFailureText(feedback) {
 if(!validDistance(feedback?.distanceM,feedback?.minimumM))return null;
 return `Nelle disposizioni provate i filari si avvicinano a ${quantity(feedback.distanceM[1])} m (minimo ${quantity(feedback.minimumM)} m). Separa le zone con un passaggio o modifica le aree escluse.`;
}
