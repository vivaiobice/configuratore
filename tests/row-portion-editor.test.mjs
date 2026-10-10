import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
import {calculateProject} from '../src/project-calculator.js';
import {portionAtCoordinate,resolveRowPortions} from '../src/row-portions.js';
import {curvePointToLonLat,getRowCurveSegments,resolveRowCurvePoints} from '../src/row-curves.js';
import {ensureProjectFields,updateActiveFieldProject,switchProjectField} from '../src/fields.js';
import {initMap} from '../src/map.js';
const editor=await import('../src/row-portion-editor.js').catch(()=>({}));
const fixture=JSON.parse(await readFile(new URL('./fixtures/l-shaped-portions.json',import.meta.url)));
const project=()=>({...fixture,geometry:fixture.polygon,rowPortions:[],maintainRowEquidistance:true});
const rows=(p,id)=>calculateProject({...p,polygon:p.geometry}).rows.filter(row=>row.portionId===id);
const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');

test('the actual inherited curve controls keep Reset enabled without misreporting saved curves as straight',()=>{
 const p=project(),s=editor.rowPortionEditorState(p);
 const {document}=parseHTML('<div id="curve-points-list"></div><input id="curve-equidistance"><button id="curve-add-button"></button><button id="curve-edit-button"></button><button id="curve-reset-button"></button>');
 const context={document,$:selector=>document.querySelector(selector),state:{project:p},portionEditorState:()=>s,getRowCurveSegments,resolveRowCurvePoints,curveEditingActive:false,overviewMode:false};
 vm.createContext(context);vm.runInContext(appSource.slice(appSource.indexOf('function renderCurveControls(){'),appSource.indexOf('function patchProject(')),context);context.renderCurveControls();
 assert.equal(document.querySelector('#curve-reset-button').disabled,false);
 assert.equal(document.querySelector('#curve-edit-button').disabled,true);
 assert.doesNotMatch(document.querySelector('#curve-points-list').textContent,/Filari rettilinei/,'hidden inherited handles do not mean the saved drawing is straight');
});

test('native portion buttons select B without changing inherited rows or legacy controls',()=>{
 assert.equal(typeof editor.rowPortionEditorState,'function');
 const p=project(),initial=editor.rowPortionEditorState(p),{document}=parseHTML('<div id="picker"></div>');
 let selected;editor.renderRowPortionPicker(document.querySelector('#picker'),initial,id=>selected=id);
 const buttons=[...document.querySelectorAll('button:not([data-portion-clear])')];assert.equal(buttons.length,2);
 assert.deepEqual(buttons.map(b=>b.textContent),['Porzione 1','Porzione 2']);
 buttons[1].click();assert.equal(selected,initial.portions[1].id);
 const next=editor.rowPortionEditorState(p,selected);
 assert.equal(next.active.id,selected);assert.equal(next.points.length,0,'inherited global handles are never placed in the local frame');
 assert.deepEqual(next.portions,initial.portions);assert.deepEqual(p.rowCurvePoints,fixture.rowCurvePoints);
 const materialized={...p,rowPortions:next.portions};
 assert.deepEqual(rows(materialized,selected),rows(p,selected));
});

test('selected angle, Add and Reset patch only B and preserve A rows and the global base',()=>{
 assert.equal(typeof editor.rowPortionDesignPatch,'function');
 const p=project(),s=editor.rowPortionEditorState(p),[a,b]=s.portions;
 const initialA=rows(p,a.id);
 const directReset={...p,...editor.rowPortionDesignPatch(p,b.id,{rowCurvePoints:[]})};
 assert.equal(directReset.rowPortions[1].mode,'local');assert.deepEqual(directReset.rowPortions[1].rowCurvePoints,[]);assert.deepEqual(rows(directReset,a.id),initialA);
 const angled={...p,...editor.rowPortionDesignPatch(p,b.id,{orientationDeg:20})};
 assert.equal(angled.orientationDeg,86.5);assert.deepEqual(angled.rowCurvePoints,p.rowCurvePoints);
 assert.equal(angled.rowPortions[1].mode,'local');assert.equal(angled.rowPortions[1].orientationDeg,20);
 assert.deepEqual(angled.rowPortions[0],a);assert.deepEqual(rows(angled,a.id),initialA);
 const active=editor.rowPortionEditorState(angled,b.id).active;
 const point=editor.nextPortionCurvePoint(active,[],'local-first');
 const coordinate=curvePointToLonLat({polygon:active.geometry[0],orientationDeg:20,point});
 assert.equal(portionAtCoordinate([active],coordinate)?.id,b.id,'first local control lies inside B');
 const curved={...angled,...editor.rowPortionDesignPatch(angled,b.id,{rowCurvePoints:[point]})};
 assert.deepEqual(curved.rowPortions[0],a);assert.deepEqual(rows(curved,a.id),initialA);
 const reset={...curved,...editor.rowPortionDesignPatch(curved,b.id,{rowCurvePoints:[]})};
 assert.deepEqual(reset.rowPortions[1].rowCurvePoints,[]);assert.deepEqual(rows(reset,a.id),initialA);
 const directPoint=editor.nextPortionCurvePoint(b,[],'from-inherited');
 const directlyCurved={...p,...editor.rowPortionDesignPatch(p,b.id,{rowCurvePoints:[directPoint]})};
 assert.deepEqual(directlyCurved.rowPortions[1].rowCurvePoints,[directPoint]);assert.deepEqual(rows(directlyCurved,a.id),initialA);
});

test('field switches reconcile selection, preserve saved layouts and keep ordinary unsplit controls',()=>{
 assert.equal(typeof editor.rowPortionEditorState,'function');
 const p=project(),s=editor.rowPortionEditorState(p),b=s.portions[1];
 let fields=ensureProjectFields({activeFieldId:'l',fields:[{...p,id:'l'},{id:'plain',geometry:[[0,45],[.001,45],[.001,45.001],[0,45.001],[0,45]],orientationDeg:45,rowCurvePoints:[{id:'plain-curve',position:.5,offsetM:2}]}]});
 fields=updateActiveFieldProject(fields,editor.rowPortionDesignPatch(fields,b.id,{orientationDeg:30}));
 const plain=switchProjectField(fields,'plain'),plainState=editor.rowPortionEditorState(plain,b.id);
 assert.equal(plainState.enabled,false);assert.equal(plainState.active,null);assert.equal(plainState.orientationDeg,45);
 assert.deepEqual(plainState.points,plain.rowCurvePoints);
 assert.deepEqual(editor.rowPortionDesignPatch(plain,null,{orientationDeg:60}),{orientationDeg:60});
 const restored=switchProjectField(JSON.parse(JSON.stringify(plain)),'l');
 assert.equal(editor.rowPortionEditorState(restored,b.id).active.id,b.id);
 assert.equal(restored.rowPortions[1].orientationDeg,30);
 const reconciled=editor.rowPortionEditorState(restored,'deleted-id');assert.equal(reconciled.active.id,restored.rowPortions[0].id);
});

test('merged layouts show the surviving design until an explicit edit acknowledges the conflict',()=>{
 assert.equal(typeof editor.renderRowPortionPicker,'function');
 const p=project(),s=editor.rowPortionEditorState(p),[a,b]=s.portions;
 const edited={...p,rowPortions:s.portions.map(q=>({...q,mode:'local',orientationDeg:q.id===a.id?10:80,rowCurvePoints:[]})),exclusions:[]};
 const merged=editor.rowPortionEditorState(edited),{document}=parseHTML('<div id="picker"></div>');
 editor.renderRowPortionPicker(document.querySelector('#picker'),merged,()=>{});
 assert.match(document.querySelector('#picker').textContent,/mantenuto.*Porzione/i);
 assert.ok(merged.active.conflict);assert.equal(merged.portions.length,1);
 const patch=editor.rowPortionDesignPatch(edited,merged.active.id,{orientationDeg:40});assert.equal(patch.rowPortions[0].conflict,undefined);
});

class MapStub{
 constructor(){this.events=new Map();this.sources=new Map();this.canvas={style:{},classList:{toggle(){}}};this.container={addEventListener(){}};this.dragPan={enable(){},disable(){}};this.doubleClickZoom={enable(){},disable(){}};this.touchZoomRotate={enable(){}};this.dragRotate={disable(){}};}
 on(name,callback){const handlers=this.events.get(name)??[];handlers.push(callback);this.events.set(name,handlers);}off(){}once(name,callback){this.on(name,callback);}fire(name,event={}){for(const fn of this.events.get(name)??[])fn(event);}
 addControl(){}fitBounds(){}getCanvas(){return this.canvas;}getContainer(){return this.container;}getCanvasContainer(){return this.container;}
 getSource(id){return this.sources.get(id);}addSource(id,spec){this.sources.set(id,{...spec,setData(data){this.data=data;}});}addLayer(){}getLayer(){return null;}queryRenderedFeatures(){return [];}
 loaded(){return false;}project([lon,lat]){return{x:lon,y:lat};}unproject({x,y}){return{lng:x,lat:y};}
}
class Marker{constructor(){}setLngLat(){return this;}addTo(){return this;}remove(){}on(){return this;}}
const withMap=async fn=>{const prior={document:globalThis.document,maplibregl:globalThis.maplibregl};try{globalThis.document=parseHTML('<html><body></body></html>').document;globalThis.maplibregl={Map:MapStub,Marker,LngLatBounds:class{extend(){return this;}},NavigationControl:class{},ScaleControl:class{}};await fn();}finally{Object.assign(globalThis,prior);}};

test('map click and short touch select portions once; holes, drags and perimeter drawing do not select',async()=>withMap(async()=>{
 const portions=resolveRowPortions(fixture),selected=[];const api=initMap({container:'map'});
 assert.equal(typeof api.setRowPortions,'function');
 api.setRowPortions({portions,activeId:portions[0].id,onSelect:id=>selected.push(id)});
 api.map.fire('load');assert.equal(api.map.getSource('row-portions').data.features.length,2,'setter queued before first load');
 const [x,y]=portions[1].anchor;
 api.map.fire('click',{point:{x,y},lngLat:{lng:x,lat:y}});assert.deepEqual(selected,[portions[1].id]);
 api.map.fire('touchstart',{points:[{x,y}]});api.map.fire('touchend',{});api.map.fire('click',{point:{x,y},lngLat:{lng:x,lat:y}});
 assert.equal(selected.length,2,'compatibility click after touch is deduplicated');
 api.map.fire('touchstart',{points:[{x,y}]});api.map.fire('touchmove',{points:[{x:x+15,y}]});api.map.fire('touchend',{});assert.equal(selected.length,2);
 api.map.fire('touchstart',{points:[{x:10,y:10}]});api.map.fire('touchend',{});assert.equal(selected.length,2,'outside cultivable polygon is not a portion');
 api.setGeometry(fixture.polygon);api.beginDraw();api.map.fire('touchstart',{points:[{x,y}]});api.map.fire('touchend',{lngLat:{lng:x,lat:y}});
 assert.equal(selected.length,2);assert.equal(api.capturePendingEdit().vertices.length,1,'perimeter handler receives touch');
}));

test('real linear passage drawing clips locally and keeps portion selection disabled until finish',async()=>withMap(async()=>{
 const lonM=1/(111195*Math.cos(45*Math.PI/180)),latM=1/111195,coord=([x,y])=>[x*lonM,45+y*latM];
 const geometry=[[0,0],[40,0],[40,60],[0,60],[0,0]].map(coord),added=[],selected=[];
 const api=initMap({container:'map',requiresLinearConfirmation:()=>true,onExclusionAdd:(geometry,meta)=>added.push({geometry,...meta})});
 api.map.fire('load');api.setGeometry(geometry);
 assert.equal(typeof api.setRowPortions,'function');api.setRowPortions({portions:resolveRowPortions({polygon:geometry}),onSelect:id=>selected.push(id)});
 api.beginLinearExclusionDraw();
 for(const c of [[-2,30],[42,30]].map(coord)){api.map.fire('click',{point:{x:c[0],y:c[1]},lngLat:{lng:c[0],lat:c[1]}});}
 assert.equal(selected.length,0);assert.equal(api.capturePendingEdit().vertices.length,2);
 assert.equal(await api.finishDraw(),true);assert.equal(added.length,1);assert.equal(added[0].type,'linear');assert.equal(added[0].widthM,1.5);
 assert.equal(resolveRowPortions({polygon:geometry,exclusions:added}).length,2,'actual clipped 1.50 m passage splits topology');
}));

test('viewer map taps retain field navigation when portion selection is disabled',async()=>withMap(async()=>{
 const portions=resolveRowPortions(fixture),selected=[],fields=[];
 const api=initMap({container:'map',onFieldSelect:id=>fields.push(id)});
 assert.equal(typeof api.setRowPortions,'function');
 api.setRowPortions({portions,canSelect:()=>false,onSelect:id=>selected.push(id)});
 api.map.queryRenderedFeatures=()=>[{properties:{fieldId:'current-field'}}];
 const [x,y]=portions[0].anchor;api.map.fire('touchstart',{points:[{x,y}]});api.map.fire('touchend',{});
 assert.deepEqual(selected,[]);assert.deepEqual(fields,['current-field']);
}));
