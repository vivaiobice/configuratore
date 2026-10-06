import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdminFieldPreviewData,mountAdminFieldMap} from '../admin/admin-field-map.js';

const polygon=[[8,44],[8.002,44],[8.002,44.002],[8,44.002],[8,44]];
const exclusion=[[8.0005,44.0005],[8.001,44.0005],[8.001,44.001],[8.0005,44.001],[8.0005,44.0005]];

test('preview uses the production row calculator for curved rows and exclusions',()=>{
 const preview=buildAdminFieldPreviewData({field:{geometry:polygon,rowSpacingM:2.5,plantSpacingM:.9,orientationDeg:35,rowCurvePoints:[{id:'bend',position:.5,offsetM:4}],maintainRowEquidistance:true,exclusions:[{id:'excluded-1',geometry:exclusion}],headlandWidthM:6,postSpacingM:4.5}});
 assert.equal(preview.valid,true);assert.ok(preview.rows.length>0);assert.deepEqual(preview.exclusions,[exclusion]);
 assert.ok(preview.rows.some(row=>row.length>2));
});

test('field map removes its MapLibre instance exactly once',()=>{
 let removed=0,options=null;const handlers={};
 class FakeMap{constructor(value){options=value;this.sources=new Map();}on(name,fn){handlers[name]=fn;}addSource(id,value){this.sources.set(id,{...value,setData(){}});}addLayer(){}getSource(id){return this.sources.get(id);}fitBounds(){}resize(){}remove(){removed++;}}
 const mounted=mountAdminFieldMap({container:{},row:{field:{geometry:polygon,rowSpacingM:2.5,plantSpacingM:.9}},maplibregl:{Map:FakeMap}});
 handlers.load();mounted.destroy();mounted.destroy();assert.equal(removed,1);assert.notEqual(options.interactive,false);
});
