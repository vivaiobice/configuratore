import test from 'node:test';import assert from 'node:assert/strict';
const load=()=>import('../src/terrain-tile-client.js');
function workerFixture(){
 const sent=[];let terminated=0;const worker={postMessage:value=>sent.push(value),terminate:()=>terminated++};return {worker,sent,terminated:()=>terminated,deliver:value=>worker.onmessage({data:value})};
}
test('graphics worker receives model once, deduplicates tiles and bounds worker work to two and bounds waiting requests to eight',async()=>{
 const {createTerrainTileClient}=await load();const f=workerFixture(),model={contentHash:'native-grid'};const client=createTerrainTileClient({model,workerFactory:()=>f.worker});f.deliver({type:'ready',bounds:[6,44,8,46]});await client.ready;
 const tile={z:2,x:1,y:1};const a=client.tile(tile),duplicate=client.tile(tile),b=client.tile({z:2,x:2,y:1});const waiters=Array.from({length:8},(_,i)=>client.tile({z:4,x:i,y:3}));await assert.rejects(client.tile({z:4,x:9,y:3}),{name:'AbortError'});
 assert.equal(f.sent.filter(m=>m.type==='init').length,1);assert.equal(f.sent.filter(m=>m.type==='tile').length,2);assert.ok(f.sent.filter(m=>m.type==='tile').every(m=>!('model' in m)));
 for(let i=1;i<=10;i++){const m=f.sent.find(message=>message.id===i);assert.ok(m);f.deliver({type:'tile',id:m.id,data:new Uint8Array([m.id]).buffer});await new Promise(done=>setTimeout(done,0));}await Promise.all(waiters);assert.deepEqual(new Uint8Array(await a),new Uint8Array(await duplicate));await b;client.destroy();assert.equal(f.terminated(),1);
});
test('close terminates pending worker and late pixels cannot encode or enter cache',async()=>{
 const {createTerrainTileClient}=await load();const f=workerFixture();let encoded=0;const client=createTerrainTileClient({model:{},workerFactory:()=>f.worker,encodePNG:async()=>{encoded++;return new ArrayBuffer(1);}});f.deliver({type:'ready',bounds:[6,44,8,46]});await client.ready;const pending=client.tile({z:0,x:0,y:0});const id=f.sent[1].id;client.destroy();f.deliver({type:'tile',id,pixels:new Uint8ClampedArray(4),size:1});await assert.rejects(pending,{name:'AbortError'});assert.equal(encoded,0);assert.equal(f.terminated(),1);await assert.rejects(client.tile({z:0,x:0,y:0}),{name:'AbortError'});
});
test('abort is subscriber scoped for a deduplicated tile and aborting all requests terminates work',async()=>{
 const {createTerrainTileClient}=await load();const f=workerFixture();const client=createTerrainTileClient({model:{},workerFactory:()=>f.worker});f.deliver({type:'ready',bounds:[]});await client.ready;const a=new AbortController(),b=new AbortController();const one=client.tile({z:0,x:0,y:0},{signal:a.signal}),two=client.tile({z:0,x:0,y:0},{signal:b.signal});a.abort();await assert.rejects(one,{name:'AbortError'});assert.equal(f.terminated(),0);b.abort();await assert.rejects(two,{name:'AbortError'});assert.equal(f.terminated(),1);client.destroy();
});
test('graphics cache evicts after eight completed tiles and unavailable Worker explicitly fails',async()=>{
 const {createTerrainTileClient}=await load();const f=workerFixture();const client=createTerrainTileClient({model:{},workerFactory:()=>f.worker});f.deliver({type:'ready',bounds:[]});await client.ready;
 for(let x=0;x<9;x++){const promise=client.tile({z:4,x,y:0});const request=f.sent.at(-1);f.deliver({type:'tile',id:request.id,data:new ArrayBuffer(1)});await promise;}
 const extra=client.tile({z:4,x:0,y:0});assert.equal(f.sent.filter(m=>m.type==='tile').length,10);const request=f.sent.at(-1);f.deliver({type:'tile',id:request.id,data:new ArrayBuffer(1)});await extra;client.destroy();assert.throws(()=>createTerrainTileClient({model:{},workerFactory:null}),/Worker/);
});
test('aborted view requests terminate graphics work but a later request starts a fresh worker with the same model',async()=>{
 const {createTerrainTileClient}=await load();const workers=[];const model={contentHash:'same'};const client=createTerrainTileClient({model,workerFactory:()=>{const f=workerFixture();workers.push(f);return f.worker;}});workers[0].deliver({type:'ready',bounds:[]});await client.ready;const abort=new AbortController();const first=client.tile({z:0,x:0,y:0},{signal:abort.signal});abort.abort();await assert.rejects(first,{name:'AbortError'});const second=client.tile({z:0,x:0,y:0});assert.equal(workers.length,2);workers[1].deliver({type:'ready',bounds:[]});await new Promise(done=>setTimeout(done,0));const job=workers[1].sent.at(-1);workers[1].deliver({type:'tile',id:job.id,data:new ArrayBuffer(3)});assert.equal((await second).byteLength,3);assert.equal(workers[1].sent[0].model,model);client.destroy();
});
test('canceled PNG encoding cannot cache a late tile while another subscriber keeps the worker alive',async()=>{
 const {createTerrainTileClient}=await load();const f=workerFixture();let finish;const encode=new Promise(done=>finish=done);const client=createTerrainTileClient({model:{},workerFactory:()=>f.worker,encodePNG:()=>encode});f.deliver({type:'ready',bounds:[]});await client.ready;
 const abort=new AbortController();const canceled=client.tile({z:1,x:0,y:0},{signal:abort.signal}),other=client.tile({z:1,x:1,y:0});const first=f.sent[1],second=f.sent[2];f.deliver({type:'tile',id:first.id,pixels:new Uint8ClampedArray(4),size:1});abort.abort();await assert.rejects(canceled,{name:'AbortError'});finish(new ArrayBuffer(1));await new Promise(done=>setTimeout(done,0));const retried=client.tile({z:1,x:0,y:0});assert.equal(f.sent.filter(m=>m.type==='tile').length,3);f.deliver({type:'tile',id:second.id,data:new ArrayBuffer(2)});f.deliver({type:'tile',id:f.sent.at(-1).id,data:new ArrayBuffer(3)});assert.equal((await other).byteLength,2);assert.equal((await retried).byteLength,3);client.destroy();
});
test('production graphics worker validates one native frozen model and returns real terrain RGBA when OffscreenCanvas is absent',async()=>{
 const [{Worker:NodeWorker},{createTerrainModel},{fromUTM},{createTerrainTileClient}]=await Promise.all([import('node:worker_threads'),import('../src/terrain-model.js'),import('../src/coordinate-system.js'),load()]);
 const model=createTerrainModel({grid:{width:3,height:3,origin:[500000,5000010],step:[5,-5],values:Array(9).fill(123.25)}});const point=fromUTM([500005,5000005],32632),z=17,n=2**z,x=Math.floor((point[0]+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(point[1]*Math.PI/180))/Math.PI)/2*n);
 let captured;
 const workerURL=new URL('../src/terrain-tile-worker.js',import.meta.url).href;
 const client=createTerrainTileClient({model,encodePNG:async pixels=>{captured=pixels;return new ArrayBuffer(1);},workerFactory:()=>{
  const thread=new NodeWorker(`const {parentPort}=require('node:worker_threads');global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};const loaded=import(${JSON.stringify(workerURL)});parentPort.on('message',async data=>{await loaded;self.onmessage({data});});`,{eval:true});
  const boundary={postMessage:data=>thread.postMessage(data),terminate:()=>thread.terminate()};thread.on('message',data=>boundary.onmessage?.({data}));thread.on('error',error=>boundary.onerror?.(error));return boundary;
 }});
 try{const ready=await client.ready;assert.equal(ready.bounds.length,4);await client.tile({z,x,y,size:256});assert.equal(captured.length,256*256*4);for(const offset of [0,128*256*4+128*4,captured.length-4])assert.equal(captured[offset]*256+captured[offset+1]+captured[offset+2]/256-32768,123.25);}finally{client.destroy();}
});
