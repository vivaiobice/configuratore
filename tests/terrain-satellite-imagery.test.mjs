import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/terrain-satellite-imagery.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const requireAPI=name=>{assert.equal(typeof api[name],'function',`${name} is required for native satellite draping`);return api[name];};
// Synthetic equatorial fixture: no actual user's coordinates or network.
const scene={reference:{anchor:[.5,.5,0]},positions:new Float32Array([0,0,0,1/1024,0,1e-5,0,1/1024,-1e-5,1/1024,1/1024,0])};
const source={tiles:['https://imagery.test/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imagery fixture'};

test('Mercator atlas covers elevated native vertices at field zoom and UVs retain north orientation',()=>{
 const plan=requireAPI('satelliteAtlasPlan')(scene,{zoom:10,maxTextureSize:4096,maxTiles:64,source});
 assert.equal(plan.zoom,10);assert.deepEqual(plan.tiles.map(({x,y})=>[x,y]),[[512,512]]);assert.equal(plan.width,256);assert.equal(plan.height,256);
 const uv=requireAPI('satelliteUVs')(scene,plan.coverage);
 assert.deepEqual(Array.from(uv),[0,0,0,1,0,0,0,1,0,1,1,0]);
 assert.equal(scene.positions[5],new Float32Array([1e-5])[0],'UV generation leaves native heights unchanged');
});

test('large native coverage reduces tile zoom to obey both tile and GPU limits',()=>{
 const broad={reference:{anchor:[.5,.5,0]},positions:new Float32Array([0,0,0,1/16,1/16,1])};
 const plan=requireAPI('satelliteAtlasPlan')(broad,{zoom:19,maxTextureSize:1024,maxTiles:8,source});
 assert.equal(plan.zoom,5);assert.equal(plan.width,512);assert.equal(plan.height,512);assert.equal(plan.tiles.length,4);
 assert.ok(plan.tiles.every(tile=>tile.url.startsWith('https://imagery.test/tile/5/')));
});

function fakeCanvas(){const draws=[];return {width:0,height:0,draws,getContext:()=>({drawImage(...args){draws.push(args);}})};}
test('tile atlas loads bounded parallel requests and places neighbouring images without georeference seams',async()=>{
 const create=requireAPI('createSatelliteImageryClient'),canvas=fakeCanvas(),requests=[],images=[];
 const wide={reference:{anchor:[.5,.5,0]},positions:new Float32Array([0,0,0,1/512,1/512,1])};
 let active=0,peak=0;
 const client=create({scene:wide,source,zoom:10,concurrency:2,canvasFactory:()=>canvas,fetchImpl:async(url,{signal})=>{assert.ok(signal instanceof AbortSignal);requests.push(url);active++;peak=Math.max(peak,active);await Promise.resolve();active--;return {ok:true,blob:async()=>({url})};},decodeImage:async blob=>{const image={width:256,height:256,url:blob.url,closed:0,close(){this.closed++;}};images.push(image);return image;}});
 const atlas=await client.ready;
 assert.equal(peak,2);assert.equal(requests.length,4);assert.equal(atlas.width,512);assert.equal(atlas.height,512);assert.equal(atlas.attribution,'Imagery fixture');
 assert.deepEqual(canvas.draws.map(args=>args.slice(1)),[[0,0,256,256],[256,0,256,256],[0,256,256,256],[256,256,256,256]]);
 assert.ok(images.every(image=>image.closed===1),'decoded tile images are released after mosaic copying');
 client.destroy();client.destroy();assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});

test('cancellation aborts outstanding imagery and prevents a late atlas from resolving',async()=>{
 const create=requireAPI('createSatelliteImageryClient'),canvas=fakeCanvas();let requestSignal,resolveFetch;
 const client=create({scene,source,zoom:10,canvasFactory:()=>canvas,fetchImpl:(_url,{signal})=>{requestSignal=signal;return new Promise(resolve=>resolveFetch=resolve);},decodeImage:async()=>({width:256,height:256,close(){}})});
 client.destroy();assert.equal(requestSignal.aborted,true);
 resolveFetch({ok:true,blob:async()=>({})});await assert.rejects(client.ready,{name:'AbortError'});assert.equal(canvas.width,0);
});

test('failed satellite request rejects instead of silently creating a coloured terrain substitute',async()=>{
 const create=requireAPI('createSatelliteImageryClient');
 const client=create({scene,source,zoom:10,canvasFactory:fakeCanvas,fetchImpl:async()=>({ok:false,status:503})});
 await assert.rejects(client.ready,/satellit|503/i);client.destroy();
});

test('imagery deadline frees the atlas even when the underlying transport never settles',async()=>{
 const canvas=fakeCanvas(),client=requireAPI('createSatelliteImageryClient')({scene,source,zoom:10,timeoutMs:1,canvasFactory:()=>canvas,fetchImpl:()=>new Promise(()=>{})});
 await assert.rejects(client.ready,/tempo|caricamento/i);assert.equal(canvas.width,0);assert.equal(canvas.height,0);client.destroy();
});
