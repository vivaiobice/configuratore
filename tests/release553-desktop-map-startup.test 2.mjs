import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('desktop map can synchronously read view mode during initialization',()=>{
  const declaration='const viewMode=createViewMode();';
  const mapCall='mapApi = initMap(';
  const declarationAt=app.indexOf(declaration),mapAt=app.indexOf(mapCall);
  assert.ok(declarationAt>=0&&mapAt>=0,'both initialization steps exist');
  const steps=[{at:declarationAt,code:declaration},{at:mapAt,code:'mapApi=initMap({enableTouchRotation:isMobileMap});'}].sort((a,b)=>a.at-b.at);
  const result=runInNewContext(`function isMobileMap(){return viewMode.isMobile();} let mapApi=null; ${steps.map(step=>step.code).join(' ')} mapApi.ready`,{
    createViewMode:()=>({isMobile:()=>false}),
    initMap:({enableTouchRotation})=>({ready:enableTouchRotation()===false})
  });
  assert.equal(result,true);
});
