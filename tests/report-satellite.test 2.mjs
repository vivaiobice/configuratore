import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSatelliteImage, SatelliteCaptureError } from '../src/report-satellite.js';
import * as satellite from '../src/report-satellite.js';
import {sideMeasurements,pointInPolygon} from '../src/geometry.js';

const model={valid:true,captureBounds:[[8,44],[8.01,44.01]]};

function fakeMapLibre({dataUrl='data:image/png;base64,abc',emitIdle=true,toDataError=null,project=([lon,lat])=>({x:lon*100,y:lat*10}),pixelRatio=1}={}){
  const calls={options:null,bounds:null,removed:0,sources:[],layers:[]};
  class Map{
    constructor(options){calls.options=options;this.canvas={width:options.container.clientWidth*pixelRatio,height:options.container.clientHeight*pixelRatio,toDataURL(){if(toDataError)throw toDataError;return dataUrl;}};}
    fitBounds(bounds,options){calls.bounds={bounds,options};}
    once(event,callback){if(event==='idle'&&emitIdle)queueMicrotask(callback);}
    getCanvas(){return this.canvas;}
    project(point){return project(point);}
    addSource(id,source){calls.sources.push({id,source});}
    addLayer(layer){calls.layers.push(layer);}
    remove(){calls.removed+=1;}
  }
  return {maplibregl:{Map},calls};
}

test('satellite capture uses an isolated satellite-only MapLibre canvas and cleans it up',async()=>{
  const {maplibregl,calls}=fakeMapLibre();
  const result=await captureSatelliteImage({container:{clientWidth:760,clientHeight:500},maplibregl,mapModel:model});
  assert.equal(result.dataUrl,'data:image/png;base64,abc');
  assert.equal(result.attribution,'Imagery © Esri');
  assert.equal(calls.options.preserveDrawingBuffer,true);
  assert.equal(calls.options.interactive,false);
  assert.equal(calls.options.attributionControl,false);
  assert.equal(calls.options.style.layers.length,2);
  assert.equal(calls.options.style.layers[0].source,'satellite');
  assert.equal(calls.options.style.layers[1].source,'satellite-reference');
  assert.deepEqual(calls.bounds.bounds,model.captureBounds);
  assert.equal(calls.removed,1);
});

test('satellite overlay uses the capture map projection for every geographic feature',async()=>{
  const {maplibregl,calls}=fakeMapLibre();
  const geo={
    polygon:[[8,44],[9,44],[9,45],[8,44]],
    rows:[{coordinates:[[8.1,44.1],[8.2,44.2]],lengthM:42}],
    exclusions:[{id:'e1',type:'area',points:[[8.3,44.3],[8.4,44.3],[8.3,44.4]]}],
    sideMeasurements:[{point:[8.5,44.5],label:'15 m'}]
  };
  const capture=await captureSatelliteImage({container:{clientWidth:760,clientHeight:500},maplibregl,mapModel:{...model,width:760,height:500,geo}});
  assert.deepEqual(capture.overlayModel.polygon[0],[800,440]);
  assert.deepEqual(capture.overlayModel.rows[0].coordinates[1],[819.9999999999999,442]);
  assert.deepEqual(capture.overlayModel.exclusions[0].points[0],[830.0000000000001,443]);
  assert.deepEqual(capture.overlayModel.sideMeasurements[0].point,[850,445]);
  assert.ok(calls.sources.some(({source})=>source.data.geometry?.type==='Polygon'));
  assert.ok(calls.layers.some(layer=>layer.type==='line'&&layer.id==='project-rows-line'));
  assert.ok(calls.layers.some(layer=>layer.type==='fill'&&layer.paint['fill-opacity']<=.12));
});

test('satellite capture times out with a typed error and still removes the map',async()=>{
  const {maplibregl,calls}=fakeMapLibre({emitIdle:false});
  await assert.rejects(
    captureSatelliteImage({container:{clientWidth:10,clientHeight:10},maplibregl,mapModel:model,timeoutMs:5}),
    error=>error instanceof SatelliteCaptureError&&error.code==='timeout'
  );
  assert.equal(calls.removed,1);
});

test('satellite capture classifies canvas security failures as CORS errors',async()=>{
  const error=new Error('The operation is insecure');error.name='SecurityError';
  const {maplibregl}=fakeMapLibre({toDataError:error});
  await assert.rejects(
    captureSatelliteImage({container:{clientWidth:10,clientHeight:10},maplibregl,mapModel:model}),
    failure=>failure instanceof SatelliteCaptureError&&failure.code==='cors'
  );
});

test('satellite capture rejects missing runtime, invalid bounds, zero size and empty canvases',async()=>{
  const container={clientWidth:10,clientHeight:10};
  await assert.rejects(captureSatelliteImage({container,maplibregl:null,mapModel:model}),error=>error.code==='unavailable');
  await assert.rejects(captureSatelliteImage({container,maplibregl:{Map:class{}},mapModel:{valid:false,captureBounds:[]}}),error=>error.code==='unavailable');
  await assert.rejects(captureSatelliteImage({container:{clientWidth:0,clientHeight:10},maplibregl:{Map:class{}},mapModel:model}),error=>error.code==='empty');
  const {maplibregl}=fakeMapLibre({dataUrl:'data:,'});
  await assert.rejects(captureSatelliteImage({container,maplibregl,mapModel:model}),error=>error.code==='empty');
});

function assertReadableExternalLabels(annotations,polygons,width,height){
  for(const annotation of annotations){
    const {x,y,width:boxWidth,height:boxHeight}=annotation.box;
    assert.ok(x>=4&&y>=4&&x+boxWidth<=width-4&&y+boxHeight<=height-4,'the complete quote fits inside the capture');
    assert.ok(annotation.fontSize>=13,'the quote remains readable at PDF image size');
    const samples=[[x,y],[x+boxWidth,y],[x+boxWidth,y+boxHeight],[x,y+boxHeight],[x+boxWidth/2,y+boxHeight/2]];
    assert.ok(polygons.every(polygon=>samples.every(point=>!pointInPolygon(point,polygon))),'the complete label stays outside the fields');
    assert.ok(annotation.leader.length===2&&Math.hypot(...annotation.leader[0].map((v,i)=>v-annotation.leader[1][i]))>3,'a visible leader identifies the quoted edge / field');
  }
  for(let i=0;i<annotations.length;i++)for(let j=i+1;j<annotations.length;j++){
    const a=annotations[i].box,b=annotations[j].box;
    assert.ok(a.x+a.width+2<=b.x||b.x+b.width+2<=a.x||a.y+a.height+2<=b.y||b.y+b.height+2<=a.y,'labels have a visible gap');
  }
}

test('crowded irregular satellite side quotes remain readable, outside and disjoint',()=>{
  assert.equal(typeof satellite.layoutSatelliteAnnotations,'function','satellite needs a shared collision-aware annotation layout');
  const polygon=[[130,110],[350,110],[350,140],[370,145],[350,150],[350,180],[370,185],[350,190],[350,220],[370,225],[350,230],[350,360],[290,360],[285,345],[280,360],[240,360],[235,345],[230,360],[130,360],[130,110]];
  const sideQuotes=sideMeasurements(polygon).map((side,index)=>({...side,point:side.midpoint,label:`${index+10} m`}));
  const input={polygon,sideMeasurements:sideQuotes,width:500,height:470};
  const annotations=satellite.layoutSatelliteAnnotations(input);
  assert.equal(annotations.length,sideQuotes.length,'no dense quote is dropped');
  assertReadableExternalLabels(annotations,[polygon],500,470);
  assert.deepEqual(satellite.layoutSatelliteAnnotations(input),annotations,'layout is deterministic');
});

test('nearby overview field tags stay outside all fields and connect to their own perimeter',()=>{
  assert.equal(typeof satellite.layoutSatelliteAnnotations,'function');
  const fields=Array.from({length:6},(_,index)=>{
    const x=250+(index%3)*102,y=160+Math.floor(index/3)*92;
    return {id:`f${index}`,label:`Campo ${index+1} - Moscato`,color:'#ffe082',polygon:[[x,y],[x+100,y],[x+100,y+90],[x,y+90],[x,y]],labelPoint:[x+50,y+45]};
  });
  const annotations=satellite.layoutSatelliteAnnotations({fields,width:1000,height:650});
  assert.equal(annotations.length,fields.length);
  assertReadableExternalLabels(annotations,fields.map(field=>field.polygon),1000,650);
  for(const annotation of annotations){
    const own=fields.find(field=>field.id===annotation.id).polygon;
    const [x,y]=annotation.anchor;
    assert.ok(own.slice(1).some((end,index)=>{
      const start=own[index];
      return Math.abs((x-start[0])*(end[1]-start[1])-(y-start[1])*(end[0]-start[0]))<1e-6&&x>=Math.min(start[0],end[0])&&x<=Math.max(start[0],end[0])&&y>=Math.min(start[1],end[1])&&y<=Math.max(start[1],end[1]);
    }),'leader terminates on its own field perimeter');
  }
});

test('capture paints the external layout in map pixels even on a double-density canvas',async()=>{
  const polygon=[[120,100],[380,100],[380,360],[120,360],[120,100]];
  const quotes=sideMeasurements(polygon).map(side=>({...side,point:side.midpoint,label:'42 m'}));
  const calls=[];
  const context={measureText:label=>({width:label.length*7}),drawImage(){},scale(...values){calls.push(['scale',values]);},beginPath(){},moveTo(){},lineTo(){},stroke(){},roundRect(...values){calls.push(['box',values]);},fill(){},fillText(...values){calls.push(['text',values]);}};
  const documentRef={createElement:()=>({getContext:()=>context,toDataURL:()=> 'data:image/png;base64,labelled'})};
  const {maplibregl,calls:mapCalls}=fakeMapLibre({project:([x,y])=>({x,y}),pixelRatio:2});
  const result=await captureSatelliteImage({container:{clientWidth:500,clientHeight:470},maplibregl,mapModel:{...model,geo:{polygon,rows:[],exclusions:[],sideMeasurements:quotes}},documentRef});
  assert.equal(result.dataUrl,'data:image/png;base64,labelled');
  assert.deepEqual(calls.find(([type])=>type==='scale')[1],[2,2]);
  assert.ok(mapCalls.bounds.options.padding>0,'satellite capture reserves annotation space');
  assert.equal(calls.filter(([type])=>type==='text').length,quotes.length);
  assertReadableExternalLabels(result.overlayModel.annotations,[polygon],500,470);
});

test('a surrounded overview field still has an external readable tag connected to its own boundary',()=>{
  const fields=Array.from({length:9},(_,index)=>{
    const x=250+(index%3)*102,y=170+Math.floor(index/3)*92;
    return {id:`f${index}`,label:`Campo ${index+1}`,color:'#ffe082',polygon:[[x,y],[x+100,y],[x+100,y+90],[x,y+90],[x,y]],labelPoint:[x+50,y+45]};
  });
  const annotations=satellite.layoutSatelliteAnnotations({fields,width:1000,height:650});
  assert.equal(annotations.length,9,'a surrounded field must not prevent PDF generation or lose its name');
  assertReadableExternalLabels(annotations,fields.map(field=>field.polygon),1000,650);
  const center=annotations.find(annotation=>annotation.id==='f4');
  assert.ok(center.anchor[0]>=352&&center.anchor[0]<=452&&center.anchor[1]>=262&&center.anchor[1]<=352);
});

test('satellite quote layout handles reversed winding and refuses an unreadable overfilled capture',()=>{
  const polygon=[[60,60],[240,60],[240,220],[60,220],[60,60]].reverse();
  const quotes=sideMeasurements(polygon).map(side=>({...side,point:side.midpoint,label:'90 m'}));
  assertReadableExternalLabels(satellite.layoutSatelliteAnnotations({polygon,sideMeasurements:quotes,width:300,height:280}),[polygon],300,280);
  assert.throws(()=>satellite.layoutSatelliteAnnotations({polygon,sideMeasurements:quotes,width:30,height:30}),error=>error instanceof SatelliteCaptureError&&error.code==='annotations');
});
