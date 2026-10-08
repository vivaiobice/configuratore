import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createScopedTerrainCutEvaluator} from '../src/terrain-contour-design.js?v=1.3.1';
import {readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.1';
import {resolveRowPortions} from '../src/row-portions.js';
import {createCanonicalCutChildDomain,canonicalCutDomainScope} from '../src/terrain-contour-domain.js?v=1.3.1';
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function foreignFixture(){
 // Both true divider boundaries reuse the actual saved perimeter vertices in
 // each scope and literal exclusion. The current field therefore has two real
 // physical components before the proposed road; no invented manual partition
 // or nominal XY snap supplies scope authority.
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[8.25,0],[9.75,0],[18,0],[18,9],[9.75,9],[8.25,9],[0,9],[0,0]]});
 const [a,leftLow,rightLow,b,c,rightHigh,leftHigh,d]=project.geometry;
 project.exclusions=[{id:'literal-divider',geometry:[leftLow,rightLow,rightHigh,leftHigh,leftLow]}];
 project.rowPortions=[
  {id:'source',geometry:[[a,leftLow,leftHigh,d,a]],mode:'inherited',orientationDeg:0},
  {id:'foreign',geometry:[[rightLow,b,c,rightHigh,rightLow]],mode:'local',orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true,custom:'retain raw'}
 ];
 return {project,model};
}

test('foreign fixture resolves two actual positive physical components before cut construction',()=>{
 const {project}=foreignFixture();
 const portions=resolveRowPortions({polygon:project.geometry,exclusions:project.exclusions,rowPortions:project.rowPortions});
 assert.deepEqual(portions.map(portion=>portion.id).sort(),['foreign','source']);
 assert.equal(portions.length,2);
});

test('first conversion measures actual foreign layout once and keeps the original whole-field pre-road reference',()=>{
 const {project,model}=foreignFixture();
 const portions=resolveRowPortions({polygon:project.geometry,exclusions:project.exclusions,rowPortions:project.rowPortions});
 assert.deepEqual(portions.map(portion=>portion.id).sort(),['foreign','source']);
 const original=JSON.stringify(project),foreignRaw=JSON.stringify(project.rowPortions[1]),budget=createTerrainBudget({kind:'cut',onProgress(value){console.info('foreign-cut-phase',JSON.stringify(value));}});
 const evaluator=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget});
 console.info('foreign-cut-usage',JSON.stringify({stage:'constructor',...budget.usage()}));
 assert.equal(evaluator.noCutFamily.ok,true,JSON.stringify(evaluator.noCutFamily.diagnostics));
 const candidate=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 console.info('foreign-cut-usage',JSON.stringify({stage:'candidate',...budget.usage()}));
 assert.equal(candidate.ok,true,JSON.stringify(candidate));
 assert.equal(candidate.result.coverage.referenceAreaM2,evaluator.referenceAreaM2);
 assert.ok(evaluator.referenceAreaM2>0);
 assert.ok(evaluator.referenceAreaM2<candidate.result.surfaceAreaM2);
 assert.ok(candidate.result.surfaceUsableAreaM2<evaluator.referenceAreaM2);
 assert.deepEqual(candidate.affectedPortionIds,[...candidate.cutOperation.afterPortionIds,'foreign']);
 assert.equal(JSON.stringify(candidate.rowPortions.find(portion=>portion.id==='foreign')),foreignRaw);
 const foreignResult=candidate.terrain.applied.portionResults.find(portion=>portion.id==='foreign');
 assert.equal(foreignResult.validation.automaticSpacing,false);
 assert.equal(foreignResult.validation.method,'manual-native-face-measurement');
 assert.ok(foreignResult.rows.length>0);
 const replay=readTerrainEnvelope({...project,...candidate.projectPatch},{budget});
 console.info('foreign-cut-usage',JSON.stringify({stage:'replay',...budget.usage()}));
 assert.equal(replay.terrainStatus,'applied');
 assert.equal(JSON.stringify(project),original);
});

test('current V2 replacement preserves owner width and cached foreign result while retiring all old split children coherently',()=>{
 const {project,model}=foreignFixture();
 const creationBudget=createTerrainBudget({kind:'cut',onProgress(value){console.info('current-v2-create-phase',JSON.stringify(value));}});
 const creation=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget:creationBudget});
 console.info('current-v2-cut-usage',JSON.stringify({operation:'create',stage:'constructor',...creationBudget.usage()}));
 assert.equal(creation.noCutFamily.ok,true,JSON.stringify(creation.noCutFamily.diagnostics));
 const first=creation.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 console.info('current-v2-cut-usage',JSON.stringify({operation:'create',stage:'candidate',...creationBudget.usage()}));
 assert.equal(first.ok,true,JSON.stringify(first));
 assert.equal(first.isSplit,true);
 assert.deepEqual(first.cutOperation.beforePortionIds,['source']);
 assert.deepEqual(first.createdChildIds,first.cutOperation.afterPortionIds.filter(id=>id!=='source'));
 const current={...project,...first.projectPatch};
 assert.equal(readTerrainEnvelope(current,{budget:creationBudget}).terrainStatus,'applied');
 console.info('current-v2-cut-usage',JSON.stringify({operation:'create',stage:'replay',...creationBudget.usage()}));

 const before=JSON.stringify(current),oldOwner=current.exclusions.find(item=>item.surfaceGroupOwner&&item.passageGroupId==='road');
 const beforeIds=first.cutOperation.afterPortionIds,foreignRaw=JSON.stringify(current.rowPortions.find(portion=>portion.id==='foreign'));
 const foreignResult=JSON.stringify(current.terrain.applied.portionResults.find(portion=>portion.id==='foreign'));
 // Replacement is a new user transaction with one fresh normal budget. All
 // failed/valid candidates and its final native/replay checks share that same
 // instance; there is no reset between candidates in this evaluator.
 const replacementBudget=createTerrainBudget({kind:'cut',onProgress(value){console.info('current-v2-replace-phase',JSON.stringify(value));}});
 const replacement=createScopedTerrainCutEvaluator({project:current,model,portionId:beforeIds.find(id=>id!=='source'),groupId:'road',budget:replacementBudget});
 console.info('current-v2-cut-usage',JSON.stringify({operation:'replace',stage:'constructor',...replacementBudget.usage()}));
 assert.equal(replacement.noCutFamily.ok,true,JSON.stringify(replacement.noCutFamily.diagnostics));
 assert.equal(replacement.referenceAreaM2,creation.referenceAreaM2);
 let allocated=0;
 const mismatch=replacement.evaluateCandidate({sourceAxis:geographic([[4.5,3],[4.5,6]]),widthM:2,groupId:'road',createId:()=>`unexpected-${++allocated}`});
 console.info('current-v2-cut-usage',JSON.stringify({operation:'replace',stage:'width-rejection',...replacementBudget.usage()}));
 assert.equal(mismatch.ok,false);
 assert.equal(mismatch.status,'invalid-input');
 assert.equal(allocated,0);
 for(const key of ['result','terrain','rowPortions','projectPatch','cutOperation'])assert.equal(Object.hasOwn(mismatch,key),false);
 assert.equal(JSON.stringify(current),before);

 const candidate=replacement.evaluateCandidate({sourceAxis:geographic([[4.5,3],[4.5,6]]),groupId:'road'});
 console.info('current-v2-cut-usage',JSON.stringify({operation:'replace',stage:'candidate',...replacementBudget.usage()}));
 assert.equal(candidate.ok,true,JSON.stringify(candidate));
 assert.equal(candidate.cut.widthM,oldOwner.widthM);
 assert.deepEqual(candidate.cut.scopeGeometry,oldOwner.scopeGeometry);
 assert.equal(candidate.isSplit,false);
 assert.equal(candidate.cutOperation.action,'replace');
 assert.equal(candidate.cutOperation.scopePortionId,'source');
 assert.deepEqual(candidate.cutOperation.beforePortionIds,beforeIds);
 assert.deepEqual(candidate.cutOperation.afterPortionIds,['source']);
 assert.deepEqual(candidate.createdChildIds,candidate.cutOperation.afterPortionIds.filter(id=>!beforeIds.includes(id)));
 assert.deepEqual(candidate.affectedPortionIds,[...new Set([...beforeIds,...candidate.cutOperation.afterPortionIds])]);
 for(const id of beforeIds.filter(id=>!candidate.cutOperation.afterPortionIds.includes(id)))assert.equal(candidate.rowPortions.some(portion=>portion.id===id),false);
 assert.equal(candidate.affectedPortionIds.includes('foreign'),false);
 assert.equal(JSON.stringify(candidate.rowPortions.find(portion=>portion.id==='foreign')),foreignRaw);
 assert.equal(JSON.stringify(candidate.terrain.applied.portionResults.find(portion=>portion.id==='foreign')),foreignResult);
 assert.equal(candidate.result.coverage.referenceAreaM2,creation.referenceAreaM2);
 const proposed={...current,...candidate.projectPatch},child=candidate.rowPortions.find(portion=>portion.id==='source');
 const nativeChild=createCanonicalCutChildDomain({project:proposed,model,recipe:child.terrainScopeRecipe,budget:replacementBudget});
 assert.equal(canonicalCutDomainScope(nativeChild).boundaries.filter(ring=>ring.hole).length,1);
 console.info('current-v2-cut-usage',JSON.stringify({operation:'replace',stage:'canonical-child',...replacementBudget.usage()}));
 assert.equal(readTerrainEnvelope(proposed,{budget:replacementBudget}).terrainStatus,'applied');
 console.info('current-v2-cut-usage',JSON.stringify({operation:'replace',stage:'replay',...replacementBudget.usage()}));
 assert.equal(JSON.stringify(current),before);
});
