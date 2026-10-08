import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
const api=existsSync(new URL('../src/terrain-ground-spacing.js',import.meta.url))?await import('../src/terrain-ground-spacing.js'):{};
const xy=([x,y])=>[500000+x,5000000+y];
const geometry=(points=[[0,0],[20,0],[20,20],[0,20],[0,0]])=>({type:'Polygon',coordinates:[points.map(xy)]});
function axes({horizontal=false,portionId='p',size=20}={}){return Array.from({length:6},(_,i)=>({axisId:`${portionId}:${i}`,portionId,ordinal:i,components:[{coordinatesXY:(horizontal?[[0,1+3*i],[size,1+3*i]]:[[1+3*i,0],[1+3*i,size]]).map(xy)}]}));}
function run(height,extra={}){assert.equal(typeof api.groundSpaceManualAxes,'function','native ground-spacing baseline is required');return api.groundSpaceManualAxes({model:contourFixture({height}).model,axes:axes(),geometryXY:geometry(),rowSpacingM:3,portionId:'p',...extra});}

test('flat terrain and absent terrain preserve exact legacy axes without mutating inputs',()=>{
 const input=axes(),before=structuredClone(input);
 const flat=run(()=>0,{axes:input});assert.deepEqual(flat.axes,before);assert.notEqual(flat.axes,input);assert.equal(flat.validation.groundSpacing,true);
 const bypass=api.groundSpaceManualAxes({axes:input,model:null});assert.deepEqual(bypass.axes,before);assert.equal(bypass.validation.groundSpacing,false);assert.deepEqual(input,before);
});
test('cross-row planar slope compresses the top-down baseline by the exact surface factor',()=>{
 const result=run(x=>x);assert.ok(result.axes.length>6);const xs=result.axes.map(a=>a.components[0].coordinatesXY[0][0]);
 for(let i=1;i<xs.length;i++)assert.ok(Math.abs((xs[i]-xs[i-1])*Math.sqrt(2)-3)<1e-7);
 assert.equal(result.validation.method,'native-plane-ground-spacing');assert.equal(result.validation.originalNativeTriangles,true);
});
test('along-row slope keeps 3 metre top-down spacing and mixed slope uses surface-perpendicular distance',()=>{
 const along=run((x,y)=>y);for(let i=1;i<along.axes.length;i++)assert.ok(Math.abs(along.axes[i].components[0].coordinatesXY[0][0]-along.axes[i-1].components[0].coordinatesXY[0][0]-3)<1e-7);
 const mixed=run((x,y)=>x+y);for(let i=1;i<mixed.axes.length;i++)assert.ok(Math.abs((mixed.axes[i].components[0].coordinatesXY[0][0]-mixed.axes[i-1].components[0].coordinatesXY[0][0])*Math.sqrt(1.5)-3)<1e-7);
});
test('varying native profile steps through every original slope change with certified spacing',()=>{
 const result=run(x=>x<=10?x:10+2*(x-10));const xs=result.axes.map(a=>a.components[0].coordinatesXY[0][0]-500000);
 const ground=x=>x<=10?x*Math.sqrt(2):10*Math.sqrt(2)+(x-10)*Math.sqrt(5);
 for(let i=1;i<xs.length;i++)assert.ok(Math.abs(ground(xs[i])-ground(xs[i-1])-3)<1e-7);
 assert.equal(result.validation.method,'native-extruded-profile-ground-spacing');assert.ok(result.validation.maxSpacingErrorM<1e-6);
});
test('independent arms of an L field retain their own row direction and phase',()=>{
 const a=run(x=>x,{portionId:'vertical',axes:axes({portionId:'vertical'}),geometryXY:geometry([[0,0],[8,0],[8,20],[0,20],[0,0]])});
 const b=run(x=>x,{portionId:'horizontal',axes:axes({portionId:'horizontal',horizontal:true}),geometryXY:geometry([[8,0],[20,0],[20,8],[8,8],[8,0]])});
 assert.ok(a.axes.every(a=>a.portionId==='vertical'&&Math.abs(a.components[0].coordinatesXY[1][0]-a.components[0].coordinatesXY[0][0])<1e-8));
 assert.ok(b.axes.every(a=>a.portionId==='horizontal'&&Math.abs(a.components[0].coordinatesXY[1][1]-a.components[0].coordinatesXY[0][1])<1e-8));
 assert.ok(a.axes.every(a=>a.components[0].coordinatesXY[0][0]<=500008));assert.ok(b.axes.every(a=>a.components[0].coordinatesXY[0][1]<=5000008));
});
test('unsupported curved families and terrain varying along rows fail explicitly without mutations',()=>{
 const curved=axes();curved[0].components[0].coordinatesXY.splice(1,0,xy([2,10]));const before=structuredClone(curved);
 assert.throws(()=>run(x=>x,{axes:curved}),e=>e.status==='ground-spacing-unsupported'&&e.reason==='manual-curvature');assert.deepEqual(curved,before);
 assert.throws(()=>run((x,y)=>x*y/5),e=>e.status==='ground-spacing-unsupported'&&e.reason==='non-extruded-terrain');
});

test('varying slope only along rows leaves exact perpendicular ground spacing unchanged',()=>{
 const result=run((x,y)=>y<=10?y:10+2*(y-10));
 const xs=result.axes.map(a=>a.components[0].coordinatesXY[0][0]);
 for(let i=1;i<xs.length;i++)assert.ok(Math.abs(xs[i]-xs[i-1]-3)<1e-7);
 assert.equal(result.validation.groundSpacing,true);
});
test('incomplete native coverage is rejected even when the covered part is flat',()=>{
 assert.throws(()=>run(()=>0,{geometryXY:geometry([[0,0],[100,0],[100,20],[0,20],[0,0]])}),e=>e.status==='ground-spacing-unsupported'&&e.reason==='terrain-coverage');
});
test('a Float32 approximate plane uses an original-face metric envelope instead of flattening',()=>{
 const result=run((x,y)=>x/3+y/7);
 assert.equal(result.validation.method,'native-metric-envelope-ground-spacing');
 assert.ok(result.validation.spacingIntervalM[0]>=2.8);assert.ok(result.validation.spacingIntervalM[1]<=3.2);
 assert.ok(result.validation.maxSpacingErrorM<0.00001);assert.equal(result.validation.originalNativeTriangles,true);
});

test('large nonflat native terrain preserves exact profile spacing with bounded work and no model mutation',async()=>{
 const {createTerrainModel}=await import('../src/terrain-model.js');
 const model=createTerrainModel({grid:{width:161,height:161,origin:[500000,5000800],step:[5,-5],values:Array.from({length:161*161},(_,i)=>{const x=(i%161)*5;return x<=400?x:400+2*(x-400);})}});
 const before=model.contentHash;let work=0;
 const result=api.groundSpaceManualAxes({model,axes:axes({size:800}),geometryXY:geometry([[0,0],[800,0],[800,800],[0,800],[0,0]]),rowSpacingM:3,portionId:'large',budget:{check(n=0){work+=n;}}});
 const ground=x=>x<=400?x*Math.sqrt(2):400*Math.sqrt(2)+(x-400)*Math.sqrt(5);
 const xs=result.axes.map(a=>a.components[0].coordinatesXY[0][0]-500000);
 assert.ok(result.axes.length>480);for(let i=1;i<xs.length;i++)assert.ok(Math.abs(ground(xs[i])-ground(xs[i-1])-3)<1e-7);
 assert.equal(model.contentHash,before);assert.ok(work<2000);
});
test('budget cancellation propagates without modifying reference axes',()=>{
 const input=axes(),before=structuredClone(input),cancel=Object.assign(new Error('cancel'),{status:'budget-exceeded'});
 assert.throws(()=>run(x=>x,{axes:input,budget:{check(){throw cancel;}}}),e=>e===cancel);assert.deepEqual(input,before);
});


test('weakly varying native slopes certify carrier separation with a full-support metric envelope',()=>{
 const result=run((x,y)=>x/5+y/10+x*y/10000);
 const v=result.validation;assert.equal(v.method,'native-metric-envelope-ground-spacing');
 assert.ok(v.spacingIntervalM[0]>=2.8&&v.spacingIntervalM[1]<=3.2);
 assert.equal(v.supportSegmentChecks,result.axes.length-1);assert.equal(v.nativeSupport,'complete-acquired-mesh');
});

test('metric-envelope upper witnesses agree with independent native-triangle polyline measurement',async()=>{
 const {terrainPolylineLength}=await import('../src/terrain-model.js');const {fromUTM}=await import('../src/coordinate-system.js');
 const model=contourFixture({height:(x,y)=>x/5+y/10+x*y/10000}).model;
 const result=run(()=>0,{model}),v=result.validation;
 for(let i=1;i<result.axes.length;i++){
  const x0=result.axes[i-1].components[0].coordinatesXY[0][0],x1=result.axes[i].components[0].coordinatesXY[0][0];
  const path=[[x0,5000010],[x1,5000010+v.tangentDriftPerCrossM*(x1-x0)]].map(p=>fromUTM(p,32632));
  const ground=terrainPolylineLength(model,path);
  assert.ok(ground>=v.spacingIntervalM[0]-1e-6&&ground<=v.spacingIntervalM[1]+1e-6);
 }
});

test('declared straight legacy rows tolerate native projection convergence across a 100 m field',async()=>{
 const {sourceManualRows,manualAxes}=await import('../src/terrain-manual-axes.js');
 const {createTerrainModel}=await import('../src/terrain-model.js');
 const {fromUTM}=await import('../src/coordinate-system.js');
 const field=[[600000,5000000],[600100,5000000],[600100,5000100],[600000,5000100],[600000,5000000]];
 const input={polygon:field.map(p=>fromUTM(p,32632)),rowSpacingM:3};
 const portion={id:'projection',mode:'inherited',orientationDeg:27,rowCurvePoints:[]};
 const budget={check(){}};
 const source=manualAxes(input,portion,sourceManualRows(input,portion,budget),32632,budget),before=structuredClone(source);
 const model=createTerrainModel({grid:{width:41,height:41,origin:[599950,5000150],step:[5,-5],values:Array.from({length:41*41},(_,i)=>(i%41)*5)}});
 const args={model,axes:source,geometryXY:{type:'Polygon',coordinates:[field]},rowSpacingM:3,portionId:portion.id};
 assert.throws(()=>api.groundSpaceManualAxes(args),e=>e.status==='ground-spacing-unsupported'&&e.reason==='manual-curvature');
 const result=api.groundSpaceManualAxes({...args,manualStraight:true}),transformation=result.validation.manualReferenceTransformation;
 assert.equal(transformation.manualStraight,true);assert.equal(transformation.referenceAxisId,source[0].axisId);
 assert.ok(transformation.maxTransverseAdjustmentM>0.0001&&transformation.maxTransverseAdjustmentM<0.02);
 assert.equal(transformation.maximumAllowedAdjustmentM,0.20);
 const [tx,ty]=transformation.tangentXY,normal=[ty,-tx],factor=Math.sqrt(1+normal[0]**2/(1+tx**2));
 const qs=result.axes.map(a=>{const p=a.components[0].coordinatesXY[0];return (p[0]-600000)*normal[0]+(p[1]-5000000)*normal[1];});
 for(let i=1;i<qs.length;i++)assert.ok(Math.abs((qs[i]-qs[i-1])*factor-3)<1e-7);
 assert.deepEqual(source,before);assert.deepEqual(api.groundSpaceManualAxes({...args,manualStraight:true}),result);
});
test('declared straight intent still rejects source distortion above the explicit 0.20 m bound',()=>{
 const source=axes();source[1].components[0].coordinatesXY[1][0]+=.21;const before=structuredClone(source);
 assert.throws(()=>run(x=>x,{axes:source,manualStraight:true}),e=>e.status==='ground-spacing-unsupported'&&e.reason==='manual-curvature');
 assert.deepEqual(source,before);
});

test('native metric-envelope proofs record declared straight intent deterministically',()=>{
 const source=axes();source[1].components[0].coordinatesXY[1][0]+=.002;
 const extra={axes:source,manualStraight:true};
 const first=run((x,y)=>x/3+y/7,extra),second=run((x,y)=>x/3+y/7,extra);
 assert.equal(first.validation.method,'native-metric-envelope-ground-spacing');
 assert.equal(first.validation.manualReferenceTransformation.manualStraight,true);
 assert.ok(first.validation.manualReferenceTransformation.maxTransverseAdjustmentM>.0019);
 assert.deepEqual(first,second);
 assert.throws(()=>run((x,y)=>x/3+y/7,{axes:source}),e=>e.reason==='manual-curvature');
});
