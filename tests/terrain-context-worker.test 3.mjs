import test from 'node:test';import assert from 'node:assert/strict';import {createTerrainModel} from '../src/terrain-model.js';import {fromUTM} from '../src/coordinate-system.js';
// The real worker message handler runs here; only browser image decoding and
// network transport are replaced with opaque constant-height PNG fixtures.
test('worker output cache evicts untouched contextual PNGs as well as composed tiles',async()=>{
 const old={self:globalThis.self,fetch:globalThis.fetch,OffscreenCanvas:globalThis.OffscreenCanvas,createImageBitmap:globalThis.createImageBitmap},requests=new Map(),responses=[];let handler;
 const rgba=new Uint8ClampedArray(256*256*4);for(let i=0;i<rgba.length;i+=4){rgba[i]=128;rgba[i+1]=100;rgba[i+3]=255;}
 globalThis.self={addEventListener(_name,fn){handler=fn;},postMessage:value=>responses.push(value)};
 globalThis.fetch=async url=>{requests.set(url,(requests.get(url)??0)+1);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};};
 globalThis.createImageBitmap=async()=>({width:256,height:256,close(){}});
 globalThis.OffscreenCanvas=class{getContext(){return {drawImage(){},getImageData:()=>({data:rgba})};}};
 try{
  await import('../src/terrain-context-worker.js?cache-test');const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632),model=createTerrainModel({grid:{width:5,height:5,origin:[499900,5000100],step:[50,-50],values:Array(25).fill(100)}});
  await handler({data:{type:'init',model,geometry:[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]].map(geo),source:{urlTemplate:'https://context.test/{z}/{x}/{y}.png',maxzoom:15,attribution:'Anonymous'}}});assert.equal(responses.at(-1).type,'ready');
  for(let x=0;x<100;x++){await handler({data:{type:'tile',id:x,z:7,x,y:0,size:256}});assert.equal(responses.at(-1).type,'tile');}
  assert.equal(requests.get('https://context.test/7/0/0.png'),1);await handler({data:{type:'tile',id:101,z:7,x:0,y:0,size:256}});
  assert.equal(requests.get('https://context.test/7/0/0.png'),2,'old passthrough tile must leave both bounded caches');
 }finally{Object.assign(globalThis,old);}
});
test('worker cancellation removes queued context fetches and aborts unshared active requests',async()=>{
 const old={self:globalThis.self,fetch:globalThis.fetch,OffscreenCanvas:globalThis.OffscreenCanvas,createImageBitmap:globalThis.createImageBitmap},held=[],responses=[];let handler,hold=false;
 const rgba=new Uint8ClampedArray(256*256*4);for(let i=0;i<rgba.length;i+=4){rgba[i]=128;rgba[i+1]=100;rgba[i+3]=255;}
 globalThis.self={addEventListener(_name,fn){handler=fn;},postMessage:value=>responses.push(value)};
 globalThis.fetch=async(_url,{signal})=>{if(hold)await new Promise(resolve=>held.push({resolve,signal}));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};};
 globalThis.createImageBitmap=async()=>({width:256,height:256,close(){}});globalThis.OffscreenCanvas=class{getContext(){return {drawImage(){},getImageData:()=>({data:rgba})};}};
 try{
  await import('../src/terrain-context-worker.js?cancel-test');const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632),model=createTerrainModel({grid:{width:5,height:5,origin:[499900,5000100],step:[50,-50],values:Array(25).fill(100)}});
  await handler({data:{type:'init',model,geometry:[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]].map(geo),source:{urlTemplate:'https://context.test/{z}/{x}/{y}.png',maxzoom:15,attribution:'Anonymous'}}});hold=true;
  const tasks=Array.from({length:8},(_,x)=>handler({data:{type:'tile',id:x,z:7,x,y:0,size:256}}));assert.equal(held.length,4);
  for(let id=0;id<8;id++)await handler({data:{type:'cancel',id}});for(const request of held)request.resolve();await new Promise(resolve=>setImmediate(resolve));for(const request of held)request.resolve();await Promise.all(tasks);
  assert.equal(held.length,4,'retired queue never starts its remaining four fetches');assert.ok(held.every(request=>request.signal.aborted),'active requests lose their final consumer');assert.equal(responses.filter(message=>message.type==='tile').length,0,'cancelled jobs return no tile');
 }finally{for(const request of held)request.resolve();Object.assign(globalThis,old);}
});
