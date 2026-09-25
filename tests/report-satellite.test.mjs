import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSatelliteImage, SatelliteCaptureError } from '../src/report-satellite.js';

const model={valid:true,captureBounds:[[8,44],[8.01,44.01]]};

function fakeMapLibre({dataUrl='data:image/png;base64,abc',emitIdle=true,toDataError=null}={}){
  const calls={options:null,bounds:null,removed:0,sources:[],layers:[]};
  class Map{
    constructor(options){calls.options=options;this.canvas={toDataURL(){if(toDataError)throw toDataError;return dataUrl;}};}
    fitBounds(bounds,options){calls.bounds={bounds,options};}
    once(event,callback){if(event==='idle'&&emitIdle)queueMicrotask(callback);}
    getCanvas(){return this.canvas;}
    project([lon,lat]){return {x:lon*100,y:lat*10};}
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
