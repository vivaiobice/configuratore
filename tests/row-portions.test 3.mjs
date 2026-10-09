import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateProject} from '../src/project-calculator.js';
import * as rowCurves from '../src/row-curves.js';
import {generateCurvedRows,getRowCurveSegments} from '../src/row-curves.js';
import {ensureProjectFields,updateActiveFieldProject,switchProjectField} from '../src/fields.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/l-shaped-portions.json',import.meta.url)));
const topology=await import('../src/row-portions.js').catch(()=>({}));
const resolve=(args)=>{assert.equal(typeof topology.resolveRowPortions,'function','topology resolver must exist');return topology.resolveRowPortions(args);};
const m=1/(6371008.8*Math.PI/180);
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(p=>p.map(v=>v*m));
const polygon=rect(0,0,40,60),road={id:'road',type:'linear',widthM:2,geometry:rect(-1,29,42,2)};
const input={polygon,exclusions:[road],rowSpacingM:5,plantSpacingM:1,postSpacingM:4.5};
const physical=rows=>rows.map(({portionId,...row})=>row);

test('translated L has two cultivable portions despite whole-guide heuristic and inherits physical drawing',()=>{
 assert.equal(getRowCurveSegments(fixture).length,1);
 const old=generateCurvedRows({...fixture,maintainEquidistance:true});
 const calculated=calculateProject(fixture);
 assert.equal(calculated.portions?.length,2);
 assert.deepEqual(physical(calculated.rows),old);
 assert.equal(new Set(calculated.rows.map(r=>r.portionId)).size,2);
});
test('first local direction or curve edit clears only inherited controls and leaves other rows byte-identical',()=>{
 const base={...fixture,rowPortions:resolve(fixture)};
 const before=calculateProject(base),[a,b]=base.rowPortions;
 for(const patch of [{orientationDeg:45},{rowCurvePoints:[{id:'local',position:.5,offsetM:7}]}]){
  const portions=topology.updateRowPortion(base.rowPortions,a.id,patch);
  assert.equal(portions[0].mode,'local');
  assert.deepEqual(portions[0].rowCurvePoints,patch.rowCurvePoints??[]);
  assert.equal(portions[1],b);
  const after=calculateProject({...base,rowPortions:portions});
  assert.deepEqual(after.rows.filter(r=>r.portionId===b.id),before.rows.filter(r=>r.portionId===b.id));
  assert.notDeepEqual(after.rows.filter(r=>r.portionId===a.id),before.rows.filter(r=>r.portionId===a.id));
 }
});
test('local portions trim only original perimeter: four metre headlands keep road endpoints and two posts per fragment',()=>{
 const portions=resolve(input).map(p=>({...p,mode:'local',rowCurvePoints:[]}));
 const result=calculateProject({...input,rowPortions:portions,headlandWidthM:4});
 assert.ok(result.rows.length>4);
 for(const row of result.rows){
  const ys=[row.start[1]/m,row.end[1]/m].sort((a,b)=>a-b);
  if(ys[0]<29) {assert.ok(Math.abs(ys[0]-4)<.01);assert.ok(Math.abs(ys[1]-29)<.01);}
  else {assert.ok(Math.abs(ys[0]-31)<.01);assert.ok(Math.abs(ys[1]-56)<.01);}
 }
 assert.equal(result.headPosts,result.rows.length*2);
});
test('holes, overlapping exclusions, partial roads and intersecting roads use actual topology',()=>{
 const hole=rect(10,10,10,10),overlap=rect(15,10,10,10);
 const result=calculateProject({...input,exclusions:[hole,overlap]});
 assert.ok(Math.abs(result.excludedAreaM2-150)<.1);
 const portions=resolve({...input,exclusions:[hole,overlap]});
 assert.equal(portions.length,1);assert.equal(portions[0].geometry.length,2);
 assert.equal(topology.portionAtCoordinate(portions,[12*m,12*m]),null);
 assert.equal(topology.portionAtCoordinate(portions,[2*m,2*m]).id,portions[0].id);
 assert.equal(resolve({...input,exclusions:[rect(-1,29,20,2)]}).length,1);
 assert.equal(resolve({...input,exclusions:[road,rect(19,-1,2,62)]}).length,4);
});
test('road movement retains geometry-matched IDs and merger explicitly resolves incompatible layouts',()=>{
 const saved=resolve(input).map((p,i)=>({...p,mode:'local',orientationDeg:20+i*40}));
 const moved=resolve({...input,rowPortions:saved,exclusions:[{...road,geometry:rect(-1,32,42,2)}]});
 for(const p of moved){const probe=[20*m,(p.geometry[0][0][1]<30*m?10:50)*m];assert.equal(topology.portionAtCoordinate(moved,probe).id,topology.portionAtCoordinate(saved,probe).id);}
 const merged=resolve({...input,rowPortions:saved,exclusions:[]});
 assert.equal(merged.length,1);assert.equal(merged[0].conflict?.type,'merged-layouts');
 assert.ok(saved.some(p=>p.id===merged[0].id&&p.orientationDeg===merged[0].orientationDeg));
 assert.equal(merged[0].conflict.portionIds.length,2);
});
test('field switch and JSON save/load keep independent layout with correct active-field mirror',()=>{
 let project=ensureProjectFields({fields:[{id:'a',geometry:polygon},{id:'b',geometry:polygon}],activeFieldId:'a'});
 const portions=resolve(input);
 project=updateActiveFieldProject(project,{rowPortions:portions});
 project=switchProjectField(JSON.parse(JSON.stringify(project)),'b');
 assert.deepEqual(project.rowPortions,[]);
 project=switchProjectField(project,'a');assert.deepEqual(project.rowPortions,portions);
});
test('invalid or fully removed topology fails safely and design edits cannot mutate cached geometry',()=>{
 assert.deepEqual(resolve({polygon:null}),[]);
 assert.deepEqual(resolve({...input,exclusions:[polygon]}),[]);
 const a=resolve(input);a[0].geometry[0][0][0]=999;
 const b=resolve({...input,orientationDeg:70});assert.notEqual(b[0].geometry[0][0][0],999);assert.equal(b[0].orientationDeg,70);
});
test('portion anchors lie in the cultivable interior and local equidistance belongs only to the selected portion',()=>{
 const portions=resolve(fixture);
 for(const p of portions)assert.equal(topology.portionAtCoordinate(portions,p.anchor)?.id,p.id);
 const edited=topology.updateRowPortion(portions,portions[0].id,{maintainRowEquidistance:false});
 assert.equal(edited[0].mode,'local');assert.equal(edited[0].maintainRowEquidistance,false);
 assert.equal(edited[1],portions[1]);
});
test('boundary-clipped road topology survives neutral translation and submillimetre cap serialization noise',()=>{
 const zero=r=>r.map(([x,y])=>[x,y-45]);
 const atZero={...fixture,polygon:zero(fixture.polygon),exclusions:fixture.exclusions.map(e=>({...e,geometry:zero(e.geometry)}))};
 assert.equal(resolve(atZero).length,2);
 for(const gap of [0,.0001]){
  const clipped={...road,geometry:rect(gap,29,40-2*gap,2)};
  assert.equal(resolve({...input,exclusions:[clipped]}).length,2);
 }
 assert.equal(resolve({...input,exclusions:[{...road,geometry:rect(.05,29,39.9,2)}]}).length,1);
});
test('malformed saved portion geometry is ignored safely',()=>{
 assert.equal(resolve({...input,rowPortions:[null,{id:'bad',geometry:'bad'}]}).length,2);
});
test('legacy extreme handles outside the L field preserve every physical row during migration with four metre headlands',()=>{
 const input={...fixture,rowCurvePoints:[{id:'a',position:.02,offsetM:-100},{id:'b',position:.98,offsetM:107.98492143266893}],headlandWidthM:4,maintainRowEquidistance:true};
 const legacy=generateCurvedRows({...input,maintainEquidistance:true});
 const migrated=calculateProject(input);
 assert.equal(migrated.portions.length,2);
 assert.deepEqual(physical(migrated.rows),legacy);
 assert.equal(migrated.headPosts,legacy.length*2);
 const saved=calculateProject({...input,rowPortions:JSON.parse(JSON.stringify(migrated.portions))});
 assert.deepEqual(saved.rows,migrated.rows);
});
test('near-tangent cap normalization remains bounded to millimetres',()=>{
 const skinny=[[.0001,29],[.0012,55],[.0012,57],[.0001,31],[.0001,29]].map(p=>p.map(v=>v*m));
 const [part]=resolve({...input,exclusions:[{...road,geometry:skinny}]});
 const newBoundary=part.geometry[0].filter(p=>Math.abs(p[0])<1e-12&&p[1]>m&&p[1]<59*m);
 assert.ok(newBoundary.length>0);
 assert.ok(newBoundary.every(p=>p[1]/m>=28.99&&p[1]/m<=57.01));
});
test('splitting a saved portion gives the new child a distinct selection label',()=>{
 const saved=resolve({...input,exclusions:[]});
 const split=resolve({...input,rowPortions:saved});
 assert.equal(split.length,2);
 assert.equal(new Set(split.map(p=>p.label)).size,2);
 assert.ok(split.some(p=>p.id===saved[0].id&&p.label===saved[0].label));
});
test('contact-normalized topology cannot create physical row gaps, fragments or head posts',()=>{
 const skinny=[[.0001,29],[.0012,55],[.0012,57],[.0001,31],[.0001,29]].map(p=>p.map(v=>v*m));
 const options={...input,exclusions:[skinny],rowSpacingM:4.999875};
 const rowPortions=resolve(options).map(p=>({...p,mode:'local'}));
 const actual=calculateProject({...options,rowPortions});
 const edgeRows=actual.rows.filter(r=>r.start[0]/m<.003);
 assert.equal(edgeRows.length,2,'only the actual skinny exclusion splits the edge row');
 assert.equal(actual.rowCount,10);
 assert.equal(actual.headPosts,20);
 assert.ok(Math.abs(actual.rowLinearM-537.5454641258918)<1e-6);
 assert.ok(Math.abs(edgeRows[0].start[1]/m)<1e-7);
 assert.ok(Math.abs(edgeRows[0].end[1]/m-38)<1e-7);
 assert.ok(Math.abs(edgeRows[1].start[1]/m-40.45453587410807)<1e-7);
 assert.ok(Math.abs(edgeRows[1].end[1]/m-60)<1e-7);
 const trimmed=calculateProject({...options,rowPortions,headlandWidthM:4});
 assert.equal(trimmed.rowCount,10);assert.equal(trimmed.headPosts,20);
 const trimmedEdge=trimmed.rows.filter(r=>r.start[0]/m<.003);
 assert.ok(Math.abs(trimmedEdge[0].start[1]/m-4)<1e-7);
 assert.ok(Math.abs(trimmedEdge[0].end[1]/m-38)<1e-7);
 assert.ok(Math.abs(trimmedEdge[1].start[1]/m-40.45453587410807)<1e-7);
 assert.ok(Math.abs(trimmedEdge[1].end[1]/m-56)<1e-7);
});

test('physical fragment ownership uses greatest overlap and nearest fallback without clipping',()=>{
 assert.equal(typeof rowCurves.rowOwnerId,'function');
 const a={id:'a',geometry:[rect(0,0,10,10)]},b={id:'b',geometry:[rect(0,12,10,20)]};
 assert.equal(rowCurves.rowOwnerId({coordinates:[[5*m,0],[5*m,32*m]],portions:[a,b]}),'b');
 const right={id:'right',geometry:[rect(20,0,10,10)]};
 assert.equal(rowCurves.rowOwnerId({coordinates:[[11*m,2*m],[11*m,8*m]],portions:[right,a]}),'a');
 assert.equal(rowCurves.rowOwnerId({coordinates:[[15*m,2*m],[15*m,8*m]],portions:[right,a]}),'a');
});
test('separate local portions own whole actual fragments without duplicate rows or normalized gaps',()=>{
 const skinny=[[.0001,29],[.0012,55],[.0012,57],[.0001,31],[.0001,29]].map(p=>p.map(v=>v*m));
 const options={...input,exclusions:[rect(-1,10,42,2),skinny],rowSpacingM:4.999875};
 const rowPortions=resolve(options).map(p=>({...p,mode:'local'}));
 assert.equal(rowPortions.length,2);
 const actual=calculateProject({...options,rowPortions});
 assert.equal(actual.rows.filter(r=>r.start[0]/m<.003).length,3);
 assert.equal(actual.rowCount,19);assert.equal(actual.headPosts,38);
 assert.ok(Math.abs(actual.rowLinearM-519.5454641258918)<.001);
 assert.equal(new Set(actual.rows.map(r=>r.portionId)).size,2);
 assert.equal(new Set(actual.rows.map(r=>JSON.stringify([r.start,r.end]))).size,19);
});
