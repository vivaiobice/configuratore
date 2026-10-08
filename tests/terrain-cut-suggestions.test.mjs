import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.2';
import {toUTM} from '../src/coordinate-system.js?v=1.3.2';

const api=existsSync(new URL('../src/terrain-cut-suggestions.js',import.meta.url))
 ?await import('../src/terrain-cut-suggestions.js?v=1.3.2'):{};
function search(options){
 assert.equal(typeof api.buildTerrainCutSuggestions,'function');
 return api.buildTerrainCutSuggestions(options);
}
function plane(){
 const value=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 value.project.rowPortions=[{id:'source',geometry:[value.project.geometry],mode:'inherited',orientationDeg:0}];
 return value;
}
function noPatch(proposal){
 assert.equal(proposal.ok,false);
 for(const key of ['result','projectPatch','terrain','rowPortions','cut','comparison'])assert.equal(Object.hasOwn(proposal,key),false,key);
}

// A nested default budget would turn this explicitly expired operation into
// a fresh search and violate the caller's cancellation/accounting boundary.
test('full cut search honors an explicitly expired shared budget without producing a patch',()=>{
 const {project,model}=plane(),before=JSON.stringify(project);
 const proposal=search({project,model,portionId:'source',budget:createTerrainBudget({kind:'cut',deadlineMs:0})});
 noPatch(proposal);
 assert.equal(proposal.status,'budget-exceeded');
 assert.equal(proposal.diagnostics.completeCandidates,0);
 assert.equal(JSON.stringify(project),before);
});

// Invalid source input must fail before a fabricated baseline or an externally
// declared successful proposal can authorize native quantities.
test('full cut search rejects an invalid actual model despite a declared no-cut proposal',()=>{
 const {project,model}=plane(),before=JSON.stringify(project);
 const invalidModel={...model,contentHash:'not-the-actual-model'};
 const proposal=search({project,model:invalidModel,portionId:'source',noCutProposal:{ok:true,result:{coverage:{servedAreaM2:0}}},budget:createTerrainBudget({kind:'cut'})});
 noPatch(proposal);
 assert.equal(proposal.status,'stale-context');
 assert.equal(proposal.diagnostics.completeCandidates,0);
 assert.equal(JSON.stringify(project),before);
});

// Even a declared zero baseline and a huge fragment count cannot create a
// passage on a plane that has no eligible physical native convergence.
test('a genuine plane baseline is evaluated once and no eligible cut publishes no quantities',()=>{
 const {project,model}=plane(),before=JSON.stringify(project),phases=[];
 const proposal=search({project,model,portionId:'source',
  noCutProposal:{ok:true,result:{rowFragmentCount:99999,coverage:{servedAreaM2:0}},diagnostics:{portions:[{portionId:'foreign',candidates:[{valid:false,validation:{critical:[{reason:'too-close',proof:'exact-affine-interior-witness',seedFaceIds:[0],itinerary:[0]}]}}]}]}},
  budget:createTerrainBudget({kind:'cut',onProgress(value){phases.push(value.phase);}})});
 noPatch(proposal);
 assert.equal(proposal.status,'no-viable-cut');
 assert.equal(proposal.diagnostics.completeCandidates,0);
 assert.equal(proposal.diagnostics.baseline.certified,true);
 assert.equal(proposal.diagnostics.baseline.measurementCount,1);
 // This approved baseline is one complete level: a 9 m row by 3 m ground
 // width, hence 27 m², rather than a filled family covering the whole field.
 // Native cap/width errors stay <=1e-5 m. Include actual fixture reprojection
 // and the plane's maximum surface stretch in e; expanding a L×W rectangle
 // by e on each side changes area by at most 2e(L+W)+4e².
 const expectedXY=[[0,0],[9,0],[9,9],[0,9],[0,0]];
 const reprojectionMaxM=Math.max(...project.geometry.map((point,index)=>{const xy=toUTM(point,32632);return Math.hypot(xy[0]-500000-expectedXY[index][0],xy[1]-5000000-expectedXY[index][1]);}));
 const surfaceStretch=Math.sqrt(1+.25**2),coordinateAllowanceM=surfaceStretch*(1e-5+reprojectionMaxM);
 const analyticAreaM2=9*project.rowSpacingM,areaAllowanceM2=2*coordinateAllowanceM*(9+project.rowSpacingM)+4*coordinateAllowanceM**2;
 assert.ok(Math.abs(proposal.diagnostics.baseline.servedAreaM2-analyticAreaM2)<=areaAllowanceM2,'genuine single-level service matches the independent ground-area oracle');
 assert.equal(phases.filter(phase=>phase==='cut-preselection').length,1);
 assert.equal(JSON.stringify(project),before);
});

// The baseline is real numerical work. Expiry at the next phase must discard
// the operation instead of retaining a successful partial baseline as a cut.
test('expiry after the genuine baseline discards every partial search result',()=>{
 const {project,model}=plane(),before=JSON.stringify(project);
 let now=0;
 const budget=createTerrainBudget({kind:'cut',clock:()=>now,onProgress({phase}){if(phase==='cut-preselection')now=60000;}});
 const proposal=search({project,model,portionId:'source',budget});
 noPatch(proposal);
 assert.equal(proposal.status,'budget-exceeded');
 assert.equal(proposal.diagnostics.completeCandidates,0);
 assert.equal(proposal.diagnostics.baseline.measurementCount,1);
 assert.equal(JSON.stringify(project),before);
});
