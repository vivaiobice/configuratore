import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDefaultField,ensureProjectFields} from '../src/fields.js';
import {buildSoilMapUrl,buildSoilIdentifyUrl,parseSoilResponse,soilSamplePoints,normalizeSoilProfile,soilGeometrySignature,soilProfileIsCurrent} from '../src/soil.js';
import {toProjectRow,projectPayloadToState} from '../src/backend.js';
import {buildCloudSnapshot,snapshotToFieldRows} from '../src/cloud-project-model.js';
import {createSoilMapController} from '../src/soil-map.js';
import {renderSoilCard} from '../src/soil-card.js';
import {parseHTML} from 'linkedom';

test('soil WMS uses official Piemonte service with geographic axis order and selected layer',()=>{
  const viewport={west:8,south:44,east:8.1,north:44.1,width:400,height:300};
  const map=new URL(buildSoilMapUrl(viewport,'texture'));
  assert.match(map.hostname,/piemonte\.it$/);assert.equal(map.searchParams.get('VERSION'),'1.1.1');assert.equal(map.searchParams.get('BBOX'),'8,44,8.1,44.1');assert.equal(map.searchParams.get('LAYERS'),'TessituraTopsoil');
  const identify=new URL(buildSoilIdentifyUrl(viewport,{x:80,y:60},'texture'));
  assert.equal(identify.searchParams.get('QUERY_LAYERS'),'TessituraTopsoil');assert.equal(identify.searchParams.get('X'),'80');assert.equal(identify.searchParams.get('Y'),'60');
});
test('soil response retains only source-returned details and rejects service exceptions',()=>{
  assert.deepEqual(parseSoilResponse('DESCRIZIONE = "Franco sabbioso"\nCODICE = 3'),{description:'Franco sabbioso',code:'3'});
  assert.deepEqual(parseSoilResponse('UNITA_PEDOLOGICA = U7\nTESSITURA = Franco limoso\nSABBIA = 24\nLIMO = 52\nARGILLA = 24\nPH = 7,8\nCALCARE = medio\nSOSTANZA_ORGANICA = 2,1'),{soilUnit:'U7',texture:'Franco limoso',description:'Franco limoso',sand:24,silt:52,clay:24,ph:7.8,limestone:'medio',organicMatter:'2,1'});
  assert.deepEqual(parseSoilResponse('SABBIA = 130\nPH = 22\nCODICE = 5'),{code:'5'});
  assert.equal(parseSoilResponse('<ServiceExceptionReport><ServiceException>Unavailable</ServiceException></ServiceExceptionReport>'),null);
  assert.equal(parseSoilResponse('no features were found'),null);
});
test('sample points are capped and kept inside the field',()=>{
  const ring=[[8,44],[8.02,44],[8.02,44.02],[8,44.02],[8,44]];
  const points=soilSamplePoints(ring);assert.ok(points.length>=1&&points.length<=9);
  assert.ok(points.every(([x,y])=>x>8&&x<8.02&&y>44&&y<44.02));
});
test('soil results are marked stale after the field perimeter changes',()=>{
  const ring=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
  const profile=normalizeSoilProfile({layer:'texture',description:'Franco',geometrySignature:soilGeometrySignature(ring)});
  assert.equal(soilProfileIsCurrent(profile,ring),true);
  assert.equal(soilProfileIsCurrent(profile,[[8,44],[8.02,44],[8.02,44.01],[8,44.01],[8,44]]),false);
  assert.equal(profile.cartographic.description,'Franco');assert.equal(profile.labAnalysis,null);
});
test('legacy soil values migrate into separate cartographic data without losing the laboratory slot',()=>{
  const legacy={layer:'soil',description:'Franco',code:'5',samples:3,observedAt:'2026-09-26T00:00:00Z'};
  const migrated=normalizeSoilProfile(legacy);
  assert.equal(migrated.cartographic.description,'Franco');assert.equal(migrated.cartographic.retrievedAt,legacy.observedAt);
  assert.equal(migrated.cartographic.sand,null);assert.equal(migrated.labAnalysis,null);
  assert.deepEqual(normalizeSoilProfile(migrated),migrated);
});
test('soil profile belongs to its field and survives project payload round trip',()=>{
  const soil=normalizeSoilProfile({layer:'texture',description:'Franco sabbioso',samples:4,source:'Regione Piemonte',observedAt:'2026-09-26T00:00:00Z'});
  const project=ensureProjectFields({fields:[createDefaultField('a',1,{soil}),createDefaultField('b',2,{soil:null})],activeFieldId:'a'});
  const row=toProjectRow({environment:'TEST',project},{},{});
  const restored=projectPayloadToState({...row,id:'p'}).project;
  assert.deepEqual(restored.fields[0].soil,soil);assert.equal(restored.fields[1].soil,null);
  const snapshot=buildCloudSnapshot({environment:'TEST',project},()=>({}));
  assert.deepEqual(snapshotToFieldRows(snapshot,'p','u').map(field=>field.design_data.soil),[soil,null]);
});
test('V55 exposes soil tools on desktop and mobile entry paths',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');const mobile=readFileSync(new URL('../src/mobile-ui.js',import.meta.url),'utf8');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.version,'0.55.2');assert.match(html,/AMBIENTE TEST · V55\.2/);assert.match(html,/src\/app\.js\?v=55\.2/);assert.match(html,/id="soil-button"/);assert.match(html,/id="soil-analyze"/);assert.match(mobile,/#soil-button/);
});
test('soil map loads only on activation and a failed query never invents a soil value',async()=>{
  const handlers=new Map(),sources=new Map(),layers=new Map();const map={loaded:()=>true,getZoom:()=>14,getBounds:()=>({getWest:()=>8,getSouth:()=>44,getEast:()=>8.1,getNorth:()=>44.1}),getCanvas:()=>({clientWidth:400,clientHeight:300}),on:(event,fn)=>handlers.set(event,fn),off:(event)=>handlers.delete(event),getLayer:id=>layers.get(id),getSource:id=>sources.get(id),addSource:(id,source)=>sources.set(id,{...source,updateImage(value){this.url=value.url;}}),addLayer:layer=>layers.set(layer.id,layer),setLayoutProperty(){},project:()=>({x:100,y:100})};
  const controller=createSoilMapController({map,fetchImpl:async()=>({ok:false,status:503})});
  assert.equal(sources.size,0);controller.setActive(true);assert.equal(sources.size,1);
  assert.equal(await controller.analyze([[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]]),null);
  controller.destroy();assert.equal(handlers.size,0);
});
test('point card displays only supplied attributes and the cartographic disclaimer',()=>{
  const {document}=parseHTML('<html><body><aside id="soil-card" hidden></aside></body></html>');globalThis.document=document;
  const card=document.querySelector('#soil-card');renderSoilCard(card,{description:'Franco',sand:24,ph:7.8},{layer:'texture',close:true});
  assert.match(card.textContent,/Sabbia/);assert.match(card.textContent,/24%/);assert.match(card.textContent,/pH/);
  assert.doesNotMatch(card.textContent,/Argilla/);assert.match(card.textContent,/Indicazione cartografica del suolo/);
  assert.match(card.textContent,/analisi del terreno effettuata su campione/);
  card.querySelector('button').click();assert.equal(card.hidden,true);
  delete globalThis.document;
});
test('field analysis saves multiple sampled units without invented area percentages and reuses successful query cache',async()=>{
  const handlers=new Map(),sources=new Map(),layers=new Map(),ring=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];
  const map={loaded:()=>true,getBounds:()=>({getWest:()=>8,getSouth:()=>44,getEast:()=>8.1,getNorth:()=>44.1}),getCanvas:()=>({clientWidth:400,clientHeight:300}),on:(event,fn)=>handlers.set(event,fn),off:(event)=>handlers.delete(event),getLayer:id=>layers.get(id),getSource:id=>sources.get(id),addSource:(id,source)=>sources.set(id,{...source,updateImage(){}}),addLayer:item=>layers.set(item.id,item),setLayoutProperty(){}};
  let calls=0;const controller=createSoilMapController({map,fetchImpl:async()=>({ok:true,async text(){return `DESCRIZIONE = ${++calls%2?'Franco':'Sabbioso'}\nCODICE = ${calls%2?'1':'2'}`;}})});
  const first=await controller.analyze(ring);assert.equal(first.cartographic.units.length,2);assert.equal(first.cartographic.samples,9);
  assert.equal(first.cartographic.units.some(unit=>unit.description==='Sabbioso'),true);
  assert.equal('percentage' in first.cartographic,false);assert.equal(calls,9);
  await controller.analyze(ring);assert.equal(calls,9);
  await controller.analyze(ring,{refresh:true});assert.equal(calls,18);
  controller.destroy();
});
