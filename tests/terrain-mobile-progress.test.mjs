import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createMobileUI} from '../src/mobile-ui.js?v=1.3.11';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const callback=app.match(/onStateChange:terrainState=>\{([\s\S]*?)\},onProposalChange:/)?.[1];
assert.ok(callback,'actual app controller callback must be found');
function setup(mobile=true){
 const {document}=parseHTML(html);globalThis.document=document;globalThis.window={};
 const field={id:'f',activeFieldId:'f',label:'Saved field',localProjectId:'project',geometry:[[9,45],[9.001,45],[9.001,45.001],[9,45]],exclusions:[],rowPortions:[]};
 field.fields=[{...field}];
 let metricReads=0,presentationReads=0;
 const metrics={areaM2:1000,netAreaM2:900,rows:[],simulatedPlants:400,commercialPlants25:400,rowCount:20,intermediatePosts:80,headPosts:20,totalPosts:100};
 let presentation=null;
 const noop=()=>{};
 const ui=createMobileUI({isMobile:()=>mobile,getField:()=>field,getFields:()=>field.fields,getMetrics:()=>{metricReads++;return metrics;},getTerrainPresentation:()=>{presentationReads++;return presentation;},getMap:()=>null,
  resizeMap:noop,focusAll:noop,stopTools:noop,focusField:noop,selectField:noop,undoPoint:noop,finishEdit:noop,listProjects:()=>[],getProfile:()=>({}),auth:{getState:()=>({kind:'guest'}),subscribe:()=>()=>{}}});
 const coreStates=[],mapStates=[];
 const emit=Function('mapApi','terrainCoreMount','mobileUi',`return terrainState=>{${callback}};`)({terrainControl:{setState:state=>mapStates.push(state)}},{render:state=>coreStates.push(state)},ui);
 return {document,field,metrics,ui,emit,coreStates,mapStates,setPresentation:value=>{presentation=value;},reset(){metricReads=0;presentationReads=0;},counts:()=>({metricReads,presentationReads})};
}

// Reverting the app callback to full renderField reproduces 25 expensive
// saved-metric requests here, even though no durable input changes.
for(const screen of ['map','editor','fields','projects','profile'])test(`terrain progress on ${screen} updates core controls without rereading saved field metrics`,()=>{
 const c=setup();c.ui.navigate(screen);c.reset();
 const header=c.document.querySelector('#mobile-active-field').textContent;
 for(let i=0;i<25;i++)c.emit({available:true,busy:true,in3D:false,viewOpening:false,progress:{phase:'finite-polyline-contours',index:i}});
 c.emit({available:true,busy:false,in3D:false,viewOpening:false,canApply:true,proposal:{ok:true}});
 assert.deepEqual(c.counts(),{metricReads:0,presentationReads:0});assert.equal(c.coreStates.length,26);assert.equal(c.mapStates.length,26);
 assert.equal(c.coreStates.at(-1).canApply,true);assert.equal(c.mapStates.at(-1).busy,false);
 assert.equal(c.document.querySelector('#mobile-active-field').textContent,header);
});
for(const screen of ['parameters','detail'])test(`terrain preview remains live on the ${screen} page and cancellation removes it`,()=>{
 const c=setup();c.ui.navigate(screen);c.reset();
 c.setPresentation({proposal:{result:{terrainStatus:'applied',quantityBasis:'model-surface',terrainSource:{id:'fixture',label:'Preview source'}}}});
 c.emit({available:true,busy:false,canApply:true});
 const selector=screen==='parameters'?'#mobile-parameters-metrics':'#mobile-field-detail';
 assert.match(c.document.querySelector(selector).textContent,/Anteprima.*Preview source/);assert.ok(c.counts().metricReads>0);assert.ok(c.counts().presentationReads>0);
 c.setPresentation(null);c.emit({available:true,busy:false,proposal:null});
 assert.doesNotMatch(c.document.querySelector(selector).textContent,/Anteprima|Preview source/);
});
test('full durable refresh still updates the editor header and geometry-dependent controls',()=>{
 const c=setup();c.ui.navigate('editor');c.reset();
 c.field.label='Renamed field';c.metrics.areaM2=2345;c.ui.renderField();
 assert.equal(c.counts().metricReads,1);assert.match(c.document.querySelector('#mobile-active-field').textContent,/Renamed field.*2[.,]?345 m²/);
 c.field.geometry=null;c.ui.renderField();
 assert.equal(c.document.querySelector('#mobile-active-field').textContent,'I tuoi campi sulla mappa');assert.equal(c.document.querySelector('#mobile-editor-next').disabled,true);
 const calculateBody=app.slice(app.indexOf('function calculateAndRender()'),app.indexOf('function rowEditingProject()'));
 assert.match(calculateBody,/mobileUi\?\.renderField\(\)/,'the authoritative calculate/render path retains its full mobile refresh');
});
test('desktop terrain notifications preserve core updates and do not read mobile metrics',()=>{
 const c=setup(false);c.reset();c.emit({available:true,busy:true,viewOpening:true});
 assert.deepEqual(c.counts(),{metricReads:0,presentationReads:0});assert.equal(c.coreStates.length,1);assert.equal(c.mapStates[0].busy,true);
});
test('editor terrain refresh still adapts newly rendered choices and synchronizes disabled state',()=>{
 const c=setup();c.ui.navigate('editor');c.reset();
 const label=c.document.createElement('label');label.textContent='New curve option';
 const select=c.document.createElement('select');select.id='new-curve-option';select.innerHTML='<option value="one">First option</option>';label.append(select);c.document.querySelector('#mobile-app').append(label);
 c.emit({available:true,busy:true});
 const button=c.document.querySelector('[data-mobile-select="new-curve-option"]');assert.ok(button);assert.equal(button.disabled,false);
 select.disabled=true;c.emit({available:true,busy:false});assert.equal(button.disabled,true);
 assert.deepEqual(c.counts(),{metricReads:0,presentationReads:0});
});
