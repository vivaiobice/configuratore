import {readFile,writeFile} from 'node:fs/promises';
import {buildTerrainProposal} from '../src/terrain-design.js';
import {fromUTM} from '../src/coordinate-system.js';
import {loadTerrainForField,clearTerrainProviderCache} from '../src/terrain-provider.js';
import {contourFixture} from '../tests/helpers/terrain-contour-fixtures.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const engine=option('--engine','legacy');
if(engine!=='legacy')throw new Error('Only --engine legacy is supported by this baseline profiler.');
const output=option('--output','/tmp/terrain-revision-profile-legacy.json');
const requests=JSON.parse(await readFile(new URL('../tests/fixtures/terrain/requests.json',import.meta.url),'utf8'));
const cases=[];
for(const f of requests){
 clearTerrainProviderCache();const geometry=f.fieldRing.map(p=>fromUTM(p));
 // Captured TIFF bytes only; no provider requests leave this process.
 const model=await loadTerrainForField({polygon:geometry,fetchImpl:async()=>new Response(await readFile(new URL(`../tests/fixtures/terrain/${f.file}`,import.meta.url)))});
 cases.push({name:f.file,project:{geometry,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:2},model});
}
const geometryXY=[[0,0],[40,0],[40,10],[10,10],[10,40],[0,40],[0,0]];
cases.push({name:'L-native-5m',...contourFixture({height:(x,y)=>.2*x+.1*y,geometryXY,headlandM:2})});
// A deliberately shortened deadline exercises reporting interrupted phases.
cases.push({name:'L-native-5m-short-deadline',...contourFixture({height:(x,y)=>.2*x+.1*y,geometryXY,headlandM:2}),deadlineMs:1});
const profiles=[];
for(const item of cases){
 const phases=Object.fromEntries(['chart','guide','clipping','distances','headlands','envelope'].map(name=>[name,{elapsedMs:0,spans:0}])),events=[];
 const started=performance.now();
 const proposal=buildTerrainProposal({...item,onPhase:event=>{events.push(event);const phase=phases[event.name]??={elapsedMs:0,spans:0};phase.elapsedMs+=event.elapsedMs;phase.spans++;}});
 profiles.push({name:item.name,elapsedMs:performance.now()-started,dimensions:{width:item.model.grid.width,height:item.model.grid.height,nativeCells:item.model.grid.width*item.model.grid.height,nativeFaces:2*(item.model.grid.width-1)*(item.model.grid.height-1),boundaryVertices:item.project.geometry.length,exclusions:item.project.exclusions?.length??0},deadlineMs:item.deadlineMs??10000,status:proposal.status,ok:proposal.ok,message:proposal.message,phases,lastPhase:events.at(-1)?.name??null,result:proposal.ok?{rowCount:proposal.result.rowCount,rowLinearM:proposal.result.rowLinearM,resultHash:proposal.terrain.applied.resultHash,inputHash:proposal.terrain.applied.inputHash,snapshotHash:proposal.terrain.applied.snapshotHash}:null});
}
await writeFile(output,JSON.stringify({engine,recordedAt:new Date().toISOString(),node:process.version,cases:profiles},null,2)+'\n');
console.log(JSON.stringify({output,cases:profiles.map(p=>({name:p.name,status:p.status,elapsedMs:p.elapsedMs,lastPhase:p.lastPhase}))}));
