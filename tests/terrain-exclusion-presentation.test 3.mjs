import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parseHTML} from 'linkedom';
import {buildReportMapModel,buildTechnicalReportMapModel} from '../src/report-map-model.js';
import {renderProjectDiagramSvg} from '../src/report-diagram.js';
import {captureSatelliteImage} from '../src/report-satellite.js?v=1.3.5';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';
import {resolveTerrainExclusionPresentation,terrainExclusionPresentationVerified} from '../src/terrain-exclusion-groups.js';

const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
const field=ring(0,0,10,10);
function fixture(){
 const outer=ring(1,1,9,9),hole=ring(4,4,6,6),second=ring(1,11,9,13),outside=ring(20,1,22,3);
 const parts=[ring(1,1,9,4),ring(1,6,9,9),ring(1,4,4,6),ring(6,4,9,6),second,outside];
 const exclusions=parts.map((geometry,index)=>({id:`member-${index}`,passageGroupId:'road',surfaceGroupVersion:1,type:'linear',geometry,
  ...(index?{}:{surfaceGroupOwner:true,surfaceGeometry:{type:'MultiPolygon',coordinates:[[outer,hole],[second],[outside]]},
   surfaceGeometryConvention:'domain-intersection',surfaceConstructionPolicy:'native-supported-axis-clip-1',sourceAxis:[[3,0],[3,14]],
   widthM:2,widthBasis:'model-surface',modelHash:'fixture',scopePortionId:'original',scopeGeometry:{type:'Polygon',coordinates:[ring(0,0,8,14)]}})}));
 return {polygon:ring(0,0,14,14),exclusions};
}
function paths(svg){return [...parseHTML(svg).document.querySelectorAll('path.linear-passage,path.excluded-area')];}
function fakeMap(){
 const sources=[],calls={created:0,images:0};
 return {sources,calls,maplibregl:{Map:class{
  constructor(){calls.created++;}fitBounds(){}once(_event,callback){queueMicrotask(callback);}project([x,y]){return {x:x*10,y:y*10};}
  addSource(id,source){sources.push({id,source});}addLayer(){}remove(){}
  getCanvas(){return {toDataURL(){calls.images++;return 'data:image/png;base64,fixture';}};}
 }}};
}
const pdfModel=({polygon,exclusions})=>({project:{generatedAt:'2026-10-06T00:00:00Z'},fields:[{id:'f',label:'Campo',geometry:polygon,exclusions,rows:[],layout:{},metrics:{},plantMaterial:{}}]});

test('map model carries one complete verified scoped MultiPolygon with a hole and no raw member seams',()=>{
 const input=fixture(),before=JSON.stringify(input),[view]=resolveTerrainExclusionPresentation({exclusions:input.exclusions,field:input.polygon});
 assert.equal(terrainExclusionPresentationVerified(view),true);assert.equal(view.geometry.coordinates.length,2);assert.equal(view.geometry.coordinates[0].length,2);
 const model=buildReportMapModel(input);
 assert.equal(model.exclusions.length,1);assert.equal(model.geo.exclusions.length,1);
 const area=model.geo.exclusions[0];assert.equal(area.id,'member-0');assert.equal(area.polygons.length,2);assert.equal(area.polygons[0].length,2);
 assert.ok(area.polygons.flat(2).every(([x])=>x<=8),'original scope masks the neighbouring portion');
 assert.equal(Object.hasOwn(area,'points'),false);assert.equal(JSON.stringify(input),before);
 const technical=buildTechnicalReportMapModel(model);assert.equal(technical.exclusions[0].polygons.length,2);
});

test('SVG draws a single evenodd compound group path preserving every boundary cycle',()=>{
 const input=fixture(),model=buildReportMapModel(input);
 for(const mode of ['technical','technical-print','overlay']){
  const [path,...extra]=paths(renderProjectDiagramSvg({mapModel:model,mode}));assert.equal(extra.length,0);
  assert.equal(path.getAttribute('fill-rule'),'evenodd');assert.equal((path.getAttribute('d').match(/M/g)||[]).length,3);
 }
 const masked=fixture();masked.exclusions[0].scopeGeometry={type:'Polygon',coordinates:[ring(-5,-5,-1,-1)]};
 assert.equal(paths(renderProjectDiagramSvg(masked)).length,0,'fully masked raw groups have no outline');
});

test('literal canonical groups retain holes and components while current field masks exterior parts',()=>{
 const input=fixture(),owner=input.exclusions[0];owner.surfaceGeometryConvention='literal';
 for(const key of ['surfaceConstructionPolicy','sourceAxis','widthM','widthBasis','modelHash','scopePortionId','scopeGeometry'])delete owner[key];
 input.exclusions.reverse();
 const model=buildReportMapModel(input),[area]=model.geo.exclusions;
 assert.equal(model.exclusions.length,1);assert.equal(area.id,'member-0');assert.equal(area.polygons.length,2);
 assert.equal(area.polygons[0].length,2);assert.ok(area.polygons.flat(2).some(([x])=>x===9));
 assert.ok(area.polygons.flat(2).every(([x])=>x<=14));
 assert.equal((paths(renderProjectDiagramSvg({mapModel:model}))[0].getAttribute('d').match(/M/g)||[]).length,3);
});

test('satellite image and capture overlay use one scoped GeoJSON MultiPolygon rather than members',async()=>{
 const input=fixture(),model=buildReportMapModel(input),fake=fakeMap();
 const capture=await captureSatelliteImage({mapModel:model,maplibregl:fake.maplibregl,container:{clientWidth:760,clientHeight:360},documentRef:null});
 const feature=fake.sources.find(source=>source.id==='project-exclusions').source.data.features;
 assert.equal(feature.length,1);assert.equal(feature[0].geometry.type,'MultiPolygon');assert.equal(feature[0].geometry.coordinates[0].length,2);
 assert.ok(feature[0].geometry.coordinates.flat(2).every(([x])=>x<=8));
 assert.equal(capture.overlayModel.exclusions[0].polygons.length,2);assert.equal(paths(renderProjectDiagramSvg({mapModel:capture.overlayModel})).length,1);
});

test('corrupt or unknown groups fail closed before PDF assets or image capture and stale previews cannot render',async()=>{
 for(const mutate of [xs=>{xs[0].surfaceGroupVersion=9;},xs=>{xs[0].geometry[1][0]=7;},xs=>{delete xs[0].surfaceGroupOwner;}]){
  const input=fixture();mutate(input.exclusions);
  assert.throws(()=>buildReportMapModel(input),{status:'invalid-surface-group'});
  assert.throws(()=>renderProjectDiagramSvg(input),{status:'invalid-surface-group'});
  const require=createRequire(import.meta.url),pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');let loads=0;
  await assert.rejects(buildProjectPdfBytes(pdfModel(input),{pdfLib,assetLoader:async()=>{loads++;return null;}}),{status:'invalid-surface-group'});assert.equal(loads,0);
 }
 const input=fixture(),model=buildReportMapModel(input);input.exclusions[0].widthM=3;
 assert.throws(()=>renderProjectDiagramSvg({mapModel:model}),{status:'invalid-surface-group'});
 const fake=fakeMap();await assert.rejects(captureSatelliteImage({mapModel:model,maplibregl:fake.maplibregl,container:{clientWidth:760,clientHeight:360}}),{status:'invalid-surface-group'});
 assert.equal(fake.calls.created,0);assert.equal(fake.calls.images,0);
 const tampered=buildReportMapModel(fixture());tampered.exclusions[0].polygons[0][0][0][0]+=1;
 assert.throws(()=>renderProjectDiagramSvg({mapModel:tampered}),{status:'invalid-surface-group'});
 const copied=structuredClone(buildReportMapModel(fixture()));
 assert.throws(()=>renderProjectDiagramSvg({mapModel:copied}),{status:'invalid-surface-group'});
});

test('projected group DTOs reject a geographic coordinate reference in live and shallow copied wrappers',async()=>{
 for(const shallowCopy of [false,true]){
  const model=buildReportMapModel(fixture()),area=model.exclusions[0];
  if(shallowCopy)model.exclusions[0]={...area,polygons:area.presentationView.geometry.coordinates};
  else area.polygons=area.presentationView.geometry.coordinates;
  assert.throws(()=>renderProjectDiagramSvg({mapModel:model}),{status:'invalid-surface-group'});
  assert.throws(()=>renderProjectDiagramSvg({mapModel:model,mode:'technical-print'}),{status:'invalid-surface-group'});
  const fake=fakeMap();await assert.rejects(captureSatelliteImage({mapModel:model,maplibregl:fake.maplibregl,container:{clientWidth:760,clientHeight:360}}),{status:'invalid-surface-group'});
  assert.equal(fake.calls.created,0);assert.equal(fake.calls.images,0);
 }
});

test('erasing grouped preview properties cannot fall back to legacy geometry with or without points',async()=>{
 for(const shallowCopy of [false,true])for(const substitutePoints of [false,true]){
  const model=buildReportMapModel(fixture());
  if(shallowCopy)model.exclusions[0]={...model.exclusions[0]};
  const area=model.exclusions[0];delete area.polygons;delete area.presentationView;
  if(substitutePoints)area.points=ring(1,1,9,9);
  assert.throws(()=>renderProjectDiagramSvg({mapModel:model}),{status:'invalid-surface-group'});
  const fake=fakeMap();await assert.rejects(captureSatelliteImage({mapModel:model,maplibregl:fake.maplibregl,container:{clientWidth:760,clientHeight:360}}),{status:'invalid-surface-group'});
  assert.equal(fake.calls.created,0);assert.equal(fake.calls.images,0);
 }
});

test('native PDF draws only scoped exterior and hole boundaries in the unchanged technical panel',async()=>{
 const require=createRequire(import.meta.url),pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
 const pdfjs=await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdfjs-dist/legacy/build/pdf.mjs');
 const input=fixture(),bytes=await buildProjectPdfBytes(pdfModel(input),{pdfLib,assetLoader:async()=>null});
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 try{
  assert.equal(doc.numPages,4);const page=await doc.getPage(2),ops=await page.getOperatorList();
  let rust=false,lines=0;
  for(let i=0;i<ops.fnArray.length;i++){
   if(ops.fnArray[i]===pdfjs.OPS.setStrokeRGBColor)rust=ops.argsArray[i][0]==='#8f5747';
   if(rust&&(ops.fnArray[i]===pdfjs.OPS.stroke||ops.fnArray[i]===pdfjs.OPS.constructPath&&ops.argsArray[i][0]===pdfjs.OPS.stroke))lines++;
  }
  assert.equal(lines,12,'three rectangle boundary cycles, no construction seams or masked exterior');
  const labels=(await page.getTextContent()).items.filter(item=>/^[\d.]+ m$/.test(item.str));assert.equal(labels.length,4);
  assert.ok(labels.every(item=>item.height===8),'existing quote font is retained');
 }finally{await doc.destroy();}
});

test('unmarked legacy exclusion DTOs keep points and ordinary SVG style',()=>{
 const input={polygon:field,exclusions:[{id:'legacy',type:'linear',geometry:ring(1,1,2,9),widthM:1.5,label:'Passaggio'}]},model=buildReportMapModel(input);
 assert.deepEqual(Object.keys(model.geo.exclusions[0]),['id','type','label','widthM','points']);
 const [path]=paths(renderProjectDiagramSvg({mapModel:model}));assert.equal(path.getAttribute('fill-rule'),null);assert.equal(path.getAttribute('class'),'linear-passage');
 assert.equal(model.sideMeasurements.length,4);
});
