import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateProject} from '../src/project-calculator.js?v=1.3.11';
import {terrainPortionEditorState} from '../src/terrain-controller.js?v=1.3.11';
import {fieldCalculationInputs} from '../src/field-calculation-inputs.js?v=1.3.11';
import {createTerrainCalculationPresentationCache} from '../src/terrain-calculation-presentation-cache.js?v=1.3.11';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8')).cases[0];
function section(start,end){
 const first=app.indexOf(start),last=app.indexOf(end,first);
 assert.ok(first>=0&&last>first);
 return app.slice(first,last);
}
const actualFunctions=section('function calculateFieldProject(','function syncOrientationControl(')
 +section('function renderFieldManager(','function renderExclusions(')
 +section('function loadActiveFieldOnMap(',"$('#field-name')?.addEventListener");

function harness(){
 const field={...structuredClone(fixture.project),id:'f',label:'Saved field'},project={...field,activeFieldId:'f',localProjectId:'p',fields:[field]};
 const state={project,environment:'LIVE'},events=[],nodes=new Map(),metrics=[];
 let methods,displayed,mapRows,calls=0,selectors;
 const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',disabled:false,hidden:false});return nodes.get(selector);};
 const observe=name=>(...args)=>{events.push(name);return args;};
 const scope={state,$,fieldCalculationInputs,createTerrainCalculationPresentationCache,terrainPortionEditorState,
  // The extracted app functions now notify the independent Media dialog when
  // selection changes; its real integration is covered by browser acceptance.
  fieldMediaUI:{contextChanged(){}},
  calculateProject:inputs=>{events.push('calculate');calls++;const result=calculateProject(inputs);metrics.push(result);return result;},
  APP_CONFIG:{environment:'LIVE'},authBridge:{getState:()=>({user:{id:'owner'}})},identityFrozen:false,NO_ROW_PORTION:'none',
  mobileUi:{renderField(){events.push('mobile');displayed=methods.calculateFieldPresentation(state.project);},isActive:()=>true,captureSession:()=>({screen:'editor'})},
  desktopFieldSelectors:{render(fields,id){events.push('selectors');selectors={fields,id};}},
  terrainController:{close3D:observe('close3D'),refresh:observe('refresh')},
  mapApi:{finishRowCurveEditing:observe('finishCurve'),clearGeometry:observe('clearGeometry'),setGeometry:observe('geometry'),setExclusions:observe('exclusions'),setRowPortions:observe('portions'),setRows(rows){events.push('rows');mapRows=rows;},setActiveFieldLabel:observe('label')},
  renderRowPortionPicker:observe('picker'),selectRowPortion:()=>{},syncOrientationControl:observe('orientation'),formatArea:String,formatMetres:String,setText:()=>{},terrainUsesCertifiedQuantities:()=>false,
  renderManualAreaCalculation:observe('manual'),syncOtherFieldsOnMap:observe('otherFields'),setOverviewControls:observe('overview'),renderProjectAdvice:observe('advice'),renderCurveControls:observe('curveControls'),syncCurveEditor:observe('curveEditor'),setStatus:observe('status'),
  scheduleCadastralLookup:observe('cadastral'),activeField:p=>p.fields.find(f=>f.id===p.activeFieldId),syncProjectControls:observe('controls'),renderExclusions:observe('exclusionList')};
 methods=Function(...Object.keys(scope),'let latestMetrics, rowPortionFieldId, activeRowPortionId, curveEditingActive=false, overviewMode=false, curveControlInteracting=false;\n'+actualFunctions+'\nreturn {loadActiveFieldOnMap,renderFieldManager,calculateFieldPresentation,getMetrics:()=>latestMetrics};')(...Object.values(scope));
 return {methods,state,events,nodes,metrics,get calls(){return calls;},get displayed(){return displayed;},get mapRows(){return mapRows;},get selectors(){return selectors;}};
}

test('actual saved-field load calculates fresh once before mobile displays independently copied metrics',()=>{
 const h=harness();h.methods.loadActiveFieldOnMap();
 assert.equal(h.calls,1,'mobile must not replay saved terrain before the mandatory fresh main calculation');
 assert.equal(h.metrics[0].terrainStatus,'applied');
 assert.deepEqual(h.mapRows,fixture.result.rows);
 assert.strictEqual(h.methods.getMetrics(),h.metrics[0],'main publishes the genuine fresh result');
 assert.deepEqual(h.displayed,h.metrics[0]);assert.notStrictEqual(h.displayed,h.metrics[0]);
 assert.deepEqual(h.events.filter(event=>['controls','selectors','exclusionList','calculate','mobile','rows','refresh','cadastral'].includes(event)),['controls','selectors','exclusionList','calculate','mobile','rows','refresh','cadastral']);
 assert.equal(h.selectors.id,'f');assert.strictEqual(h.selectors.fields,h.state.project.fields);
 assert.equal(h.nodes.get('#field-name').value,'Saved field');assert.equal(h.nodes.get('#remove-field-button').disabled,true);
 h.displayed.rows.length=0;assert.equal(h.mapRows.length,fixture.result.rows.length);
});
test('standalone field manager still refreshes mobile metrics and field controls',()=>{
 const h=harness();h.methods.renderFieldManager();
 assert.equal(h.calls,1);assert.equal(h.displayed.terrainStatus,'applied');
 assert.deepEqual(h.events,['mobile','calculate','selectors']);
 assert.equal(h.nodes.get('#field-name').value,'Saved field');assert.equal(h.selectors.id,'f');
});
test('each load still executes a fresh main proof and changed inputs cannot reuse saved display success',()=>{
 const h=harness();h.methods.loadActiveFieldOnMap();h.methods.loadActiveFieldOnMap();
 assert.equal(h.calls,2);assert.equal(h.metrics[1].terrainStatus,'applied');
 h.state.project.rowSpacingM+=1;h.methods.loadActiveFieldOnMap();
 assert.equal(h.metrics[2].terrainStatus,'invalid');assert.equal(h.displayed.terrainStatus,'invalid');
 assert.notStrictEqual(h.metrics[0],h.metrics[1]);
});
