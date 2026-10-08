import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
const load=()=>import('../src/terrain-core-presentation.js');
const state={portionId:'p1',contextKey:'field/input/history',actualMode:'manual',requestedMode:'terrain',busy:false,viewOpening:false,
 canAdapt:true,canApply:false,canSuggestCut:false,proposal:null,progress:null,statusKind:'unavailable',lastProposalOutcome:null,
 restoreAvailability:{available:false,reason:'no-baseline'}};
const htmlDocument=html=>parseHTML(`<div id="host">${html}</div>`).document;

// Catches treating the initial requested mode as an already adapted manual field.
test('core mapper keeps untouched manual mode and strict eligibility without invented repeat or cut',async()=>{
 const {terrainCoreWidgetState}=await load();const dto=terrainCoreWidgetState(state,{project:{}});
 assert.ok(dto,'core state must be projected');assert.equal(dto.mode,'manual');assert.equal(dto.repeatMode,false);
 assert.equal(dto.canAdapt,true);assert.equal(dto.canSuggestCut,false);assert.equal(dto.status,null);
 assert.equal(terrainCoreWidgetState({...state,canAdapt:'true',canSuggestCut:true},{project:{terrain:{}}}).canAdapt,false);
 assert.equal(terrainCoreWidgetState({...state,canSuggestCut:true},{project:{terrain:{}}}).repeatMode,false);
});

test('core mapper projects only the actual strict cut eligibility while disabled views revoke it',async()=>{
 const {terrainCoreWidgetState}=await load();
 assert.equal(terrainCoreWidgetState({...state,canSuggestCut:true}).canSuggestCut,true);
 for(const value of [false,undefined,null,'true',1])assert.equal(terrainCoreWidgetState({...state,canSuggestCut:value}).canSuggestCut,false);
 assert.equal(terrainCoreWidgetState({...state,canSuggestCut:true},{enabled:false}).canSuggestCut,false);
});

let mountedCutWitness;
async function realMountedCutWitness(){
 if(mountedCutWitness)return mountedCutWitness;
 const [{createTerrainModel},{createContourDomain},{traceContourLevel},{certifyContourSpacing},{fromUTM}]=await Promise.all([
  import('../src/terrain-model.js'),import('../src/terrain-contour-domain.js?v=1.3.3'),import('../src/terrain-contours.js?v=1.3.3'),import('../src/terrain-contour-validation.js?v=1.3.3'),import('../src/coordinate-system.js')]);
 const geometry=[[-10,0],[10,0],[10,10],[-10,10],[-10,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:9,height:9,origin:[499980,5000030],step:[5,-5],values:Array.from({length:81},(_,i)=>{const x=-20+(i%9)*5,y=30-Math.floor(i/9)*5;return y/4+(x<0?x/16:x/2);})}});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[geometry]}});
 const axes=[1,2].flatMap((level,ordinal)=>traceContourLevel(domain,level,{portionId:'selected'}).axes.map(axis=>({...axis,ordinal})));
 const validation=certifyContourSpacing(domain,axes,{spacingM:3});
 assert.equal(validation.valid,false,'SETUP actual A has a continuous spacing violation');
 assert.ok(validation.critical.some(record=>['too-close','too-far'].includes(record.reason)&&record.proof==='exact-affine-interior-witness'),'SETUP actual native A witness');
 return mountedCutWitness={model,geometry,diagnostics:{portions:[{portionId:'selected',candidates:[{id:'actual-level-pair',valid:false,validation}],frontiers:[]}]}};
}

test('mounted cut action uses the actual guarded controller and stays readonly before explicit Apply',async()=>{
 const {createTerrainCoreMount}=await load(),{createTerrainController}=await import('../src/terrain-controller.js');
 const {model,geometry,diagnostics}=await realMountedCutWitness();
 const project={localProjectId:'mounted-cut-project',activeFieldId:'mounted-cut-field',geometry,rowPortions:[{id:'selected',geometry:[geometry],orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}],exclusions:[],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowCurvePoints:[],maintainRowEquidistance:true};
 const before=JSON.stringify(project),{document}=parseHTML('<div id="terrain-curve-controls"></div><div id="terrain-proposal-review"></div><div id="terrain-summary"></div><div id="terrain-retry-controls"></div>');
 let enabled=true,writes=0,reply={ok:false,status:'review-required',kind:'adapt',diagnostics};const calls=[];
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({owner:'anonymous',projectId:project.localProjectId,fieldId:project.activeFieldId}),getPortionId:()=> 'selected',getResult:()=>null,loadTerrain:async()=>model,summarize:async()=>({valid:true}),covers:async()=>true,runProposal:async options=>{calls.push(options);return structuredClone(reply);},applyProposal:()=>{writes++;return true;}});
 const mount=createTerrainCoreMount({document,getController:()=>controller,getProject:()=>project,getMetrics:()=>null,isEnabled:()=>enabled});
 try{
  await controller.refresh();await controller.propose({mode:'terrain'});
  assert.equal(controller.getState().canSuggestCut,true,'SETUP controller owns the real current A convergence');
  assert.equal(typeof mount.actions.onSuggestCut,'function','the actual mounted widget must dispatch its readonly cut action');
  mount.render(controller.getState());assert.ok(document.querySelector('[data-terrain-action="cut"]'),'the actual eligible state exposes the existing cut button');
  const target={portionId:'selected',contextKey:controller.getState().contextKey},count=calls.length;
  assert.equal(await mount.actions.onSuggestCut({...target,contextKey:'stale'}),null);assert.equal(calls.length,count);
  reply={ok:false,status:'uncovered',kind:'cut'};
  const pending=mount.actions.onSuggestCut(target);assert.equal(typeof pending.then,'function');assert.equal((await pending).ok,false);
  assert.equal(calls.length,count+1);assert.equal(calls.at(-1).kind,'cut');assert.deepEqual(calls.at(-1).cutRequest,{action:'suggest'});assert.equal(calls.at(-1).portionId,'selected');assert.deepEqual(calls.at(-1).diagnostics,diagnostics);
  assert.equal(writes,0);assert.equal(JSON.stringify(project),before);
  enabled=false;assert.equal(await mount.actions.onSuggestCut(target),null);assert.equal(calls.length,count+1);
  mount.destroy();assert.equal(await mount.actions.onSuggestCut(target),null);assert.equal(writes,0);
 }finally{mount.destroy();controller.destroy();}
});

// Catches inferring repeat eligibility from unrelated or unknown saved designs.
test('repeat eligibility requires a selected recognized saved design and real current eligibility',async()=>{
 const {terrainCoreWidgetState}=await load();
 const project={terrain:{applied:{schemaVersion:2,algorithmVersion:'terrain-contour-family-1'}},rowPortions:[{id:'p1',terrainDesign:{mode:'adapt'}}]};
 assert.equal(terrainCoreWidgetState({...state,actualMode:'terrain'},{project}).repeatMode,true);
 for(const value of [{...state,canAdapt:false},{...state,busy:true},{...state,viewOpening:true},{...state,portionId:'p2'},{...state,proposal:{ok:true}}]) {
  assert.equal(terrainCoreWidgetState(value,{project}).repeatMode,false);
 }
 assert.equal(terrainCoreWidgetState(state,{project:{...project,terrain:{applied:{schemaVersion:2,algorithmVersion:'future'}}}}).repeatMode,false);
 assert.equal(terrainCoreWidgetState(state,{project:{...project,rowPortions:[{id:'p1',terrainDesign:{mode:'unknown'}}]}}).repeatMode,false);
});

// Catches guessing legacy automatic mode from mere terrain presence.
test('actual frozen legacy automatic metadata enables truthful manual conversion without rewriting the archive',async()=>{
 const {terrainCoreWidgetState,terrainFieldSummaryHtml}=await load();
 const archive=JSON.parse(await readFile(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8'));
 const project=archive.cases.find(c=>c.name==='automatic').project,before=structuredClone(project);
 const automatic=project.rowPortions.find(p=>p.terrainDesign?.followTerrain===true);
 assert.ok(automatic,'frozen historical fixture has an explicit automatic guide');
 const dto=terrainCoreWidgetState({...state,portionId:automatic.id},{project});
 assert.equal(dto.mode,'terrain');assert.equal(dto.repeatMode,true);assert.deepEqual(project,before);
 const {createTerrainControls}=await import('../src/terrain-controls.js');const document=htmlDocument(''),requests=[];
 const controls=createTerrainControls({host:document.querySelector('#host'),onModeChange:target=>requests.push(target)});
 controls.render(dto);document.querySelector('[data-terrain-action="manual"]').click();
 assert.deepEqual(requests,[{portionId:automatic.id,contextKey:'field/input/history',mode:'manual'}]);controls.destroy();
 const summary=htmlDocument(terrainFieldSummaryHtml({metrics:archive.cases.find(c=>c.name==='automatic').result,model:project.terrain.model}));
 assert.ok(summary.querySelector('#host').textContent.includes(project.terrain.model.source.label));
 assert.ok(!summary.querySelector('#host').textContent.includes('Dislivello'));assert.deepEqual(project,before);
 const manual=project.rowPortions.find(p=>p.terrainDesign?.followTerrain===false);
 if(manual)assert.equal(terrainCoreWidgetState({...state,portionId:manual.id},{project}).mode,'manual');
});

// Catches stale proposal/outcome misuse or loss of availability distinctions.
test('mapper uses only visible pending proposals and actual restore reasons',async()=>{
 const {terrainCoreWidgetState}=await load();
 const dto=terrainCoreWidgetState({...state,proposal:{ok:true},canApply:true,progress:{phase:'restore'},busy:true,statusKind:'ready'});
 assert.deepEqual(dto.proposal,{pending:true,canApply:true});assert.deepEqual(dto.progress,{phase:'restore'});assert.equal(dto.busy,true);
 assert.equal(terrainCoreWidgetState({...state,proposal:null,lastProposalOutcome:{ok:true},canApply:true}).proposal,null);
 assert.equal(terrainCoreWidgetState({...state,proposal:{ok:true},canApply:'true'}).proposal.canApply,false);
 for(const [available,reason,kind] of [[true,'exact','exact'],[true,'recompute-required','proposal'],[false,'restore-conflict','conflict'],[false,'no-baseline','unavailable'],[false,'invalid-history','unavailable'],[true,'future','unavailable']]) {
  assert.deepEqual(terrainCoreWidgetState({...state,restoreAvailability:{available,reason}}).restoreAvailability,{kind});
 }
 const hidden=terrainCoreWidgetState({...state,proposal:{ok:true},canApply:true},{enabled:false});
 assert.equal(hidden.portionId,null);assert.equal(hidden.canAdapt,false);assert.equal(hidden.proposal,null);
});

// Catches raw failure text escaping normalization or successful acquisition appearing unavailable.
test('mapper preserves normalized failure status while suppressing only acquired idle unavailable',async()=>{
 const {terrainCoreWidgetState}=await load();
 assert.deepEqual(terrainCoreWidgetState({...state,statusKind:'timeout',status:'solver details'}).status,{kind:'timeout'});
 assert.deepEqual(terrainCoreWidgetState({...state,canAdapt:false,lastProposalOutcome:{ok:false}}).status,{kind:'unavailable'});
 assert.deepEqual(terrainCoreWidgetState({...state,lastProposalOutcome:{ok:false}}).status,{kind:'unavailable'});
 assert.equal(terrainCoreWidgetState({...state,viewOpening:true}).busy,true);
});

test('actual saving status overrides completed solver phase with truthful checkpoint progress',async()=>{
 const {terrainCoreWidgetState}=await load();
 assert.deepEqual(terrainCoreWidgetState({...state,busy:true,statusKind:'saving',progress:{phase:'envelope'}}).progress,{phase:'checkpoint'});
});

// Catches displaying padding-wide slope/zero for unknown field relief and losing valid flat zero.
test('field summary uses only provided verified field relief and preserves genuine zero',async()=>{
 const {terrainFieldSummaryHtml}=await load();
 const model={source:{id:'dtm',label:'Campo DTM'},rangeM:999,maxSlopePercent:999};
 const metrics={terrainStatus:'applied',terrainSource:model.source,terrainRelief:{basis:'native-field-domain-before-exclusions',minM:100,maxM:106,rangeM:6,maxSlopePercent:null}};
 let document=htmlDocument(terrainFieldSummaryHtml({metrics,model})),text=document.querySelector('#host').textContent;
 assert.match(text,/6 m/);assert.ok(!text.includes('999'));assert.ok(!text.includes('Pendenza'));
 document=htmlDocument(terrainFieldSummaryHtml({metrics:{...metrics,terrainRelief:{basis:'native-field-domain-before-exclusions',rangeM:0,maxSlopePercent:0}},model}));
 assert.match(document.querySelector('#host').textContent,/Dislivello.*0 m/);assert.match(document.querySelector('#host').textContent,/Pendenza.*0%/);
 for(const relief of [null,{basis:'whole-model',rangeM:99,maxSlopePercent:99},{basis:'native-field-domain-before-exclusions',rangeM:null,maxSlopePercent:null}]) {
  text=htmlDocument(terrainFieldSummaryHtml({metrics:{...metrics,terrainRelief:relief},model})).querySelector('#host').textContent;
  assert.ok(!text.includes('Dislivello'));assert.ok(!text.includes('Pendenza'));assert.match(text,/Campo DTM/);
 }
 assert.equal(terrainFieldSummaryHtml({metrics:{...metrics,terrainStatus:'invalid'},model}), '');
 assert.equal(terrainFieldSummaryHtml({metrics,model,enabled:false}), '');
});

// Catches unescaped metadata/URLs and invented acquisition date or headland density basis.
test('source details preserve actual metadata safely and label theoretical density before unavailable headlands',async()=>{
 const {terrainFieldSummaryHtml}=await load();
 const source={id:'dtm',label:'DTM <img src=x>',resolutionM:5,surveyEpoch:'2019',release:'2023',citation:'A & B',license:'CC0',url:'https://example.test/source?q="x"'};
 const metrics={terrainStatus:'applied',terrainSource:source,theoreticalPlantsBasis:'surface-after-explicit-exclusions-before-headlands'};
 const document=htmlDocument(terrainFieldSummaryHtml({metrics,model:{source,acquiredAt:'2026-10-06T00:00:00Z'},preview:true}));
 const text=document.querySelector('#host').textContent;
 assert.match(text,/Anteprima/);assert.match(text,/5 m/);assert.match(text,/2019/);assert.match(text,/2023/);assert.match(text,/CC0/);assert.match(text,/A & B/);assert.match(text,/2026/);assert.match(text,/prima delle capezzagne/);
 assert.equal(document.querySelector('img'),null);assert.equal(document.querySelector('a').getAttribute('rel'),'noopener noreferrer');assert.equal(document.querySelector('a').getAttribute('href'),source.url);
 const unsafe=htmlDocument(terrainFieldSummaryHtml({metrics:{...metrics,terrainSource:{...source,url:'javascript:alert(1)'}},model:null}));
 assert.equal(unsafe.querySelector('a'),null);assert.ok(!unsafe.querySelector('#host').textContent.includes('Acquisizione'));
});

// Catches exposing a retained model on a new field before current availability is established.
test('acquired source without applied relief requires explicit current source availability',async()=>{
 const {terrainFieldSummaryHtml}=await load();const model={source:{label:'Acquired DTM',id:'a'},rangeM:999};
 assert.equal(terrainFieldSummaryHtml({metrics:null,model}), '');
 const text=htmlDocument(terrainFieldSummaryHtml({metrics:null,model,sourceAvailable:true})).querySelector('#host').textContent;
 assert.match(text,/Acquired DTM/);assert.ok(!text.includes('Dislivello'));
});

// Catches pending comparison being lost with the old card or null becoming zero.
test('proposal review preserves scope and nullable comparisons without duplicate action buttons',async()=>{
 const {terrainProposalReviewHtml}=await load();
 const proposal={ok:true,scope:'field',result:{terrainStatus:'applied',rowAxisCount:4,rowFragmentCount:5,rowLinearM:42,surfaceRowLinearM:null,simulatedPlants:40,totalPosts:16,theoreticalPlantsBasis:'surface-after-explicit-exclusions-before-headlands'},beforeTotals:null,
 changes:[{portionId:'p1',label:'Porzione <b>1</b>',before:{rowCount:null,rowLinearM:null,simulatedPlants:null,totalPosts:null},after:{rowAxisCount:4,rowFragmentCount:5,rowLinearM:42,simulatedPlants:40,totalPosts:16}}]};
 const document=htmlDocument(terrainProposalReviewHtml(proposal,{hasSavedTerrain:false}));const text=document.querySelector('#host').textContent;
 assert.match(text,/tutto il campo/);assert.match(text,/— → 42/);assert.match(text,/Assi/);assert.match(text,/Tratti/);assert.match(text,/prima delle capezzagne/);
 assert.equal(document.querySelector('button'),null);assert.equal(document.querySelector('b'),null);
 assert.equal(terrainProposalReviewHtml({...proposal,ok:false}), '');
 const scoped=htmlDocument(terrainProposalReviewHtml({...proposal,scope:'portion'},{hasSavedTerrain:true}));assert.match(scoped.querySelector('#host').textContent,/porzione selezionata/);
});

// Catches removing the old card without mounting the real curvature/review/source hosts.
test('production markup places the single core controls and review inside existing curvature',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),document=parseHTML(html).document;
 assert.equal(Boolean(document.querySelector('#terrain-card')),false);
 assert.ok(document.querySelector('.row-curve-controls #terrain-curve-controls'));
 assert.ok(document.querySelector('.row-curve-controls #terrain-proposal-review'));
 assert.ok(document.querySelector('.row-curve-controls #terrain-retry-controls'));
 assert.ok(document.querySelector('#map-summary #terrain-summary'));
 assert.ok(document.querySelector('#curve-points-list'));assert.ok(document.querySelector('#curve-equidistance'));
});

// Catches target guard/promise loss, unmounted review/retry, and mutated saved state before Apply.
test('mounted core drives real adapt measure apply and restore with actual guarded controller promises',async()=>{
 const {createTerrainCoreMount}=await load();assert.equal(typeof createTerrainCoreMount,'function');
 const [{createTerrainController,checkpointTerrainProposal},{createTerrainModel},{fromUTM},{buildContourTerrainProposal},{buildTerrainRestoreProposal},{createInitialState,mergeProjectState},{ensureProjectFields},{calculateProject}]=await Promise.all([
  import('../src/terrain-controller.js'),import('../src/terrain-model.js'),import('../src/coordinate-system.js'),import('../src/terrain-contour-design.js'),import('../src/terrain-history.js'),import('../src/state.js'),import('../src/fields.js'),import('../src/project-calculator.js')]);
 const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
 const model=createTerrainModel({acquiredAt:'2026-10-06T00:00:00Z',grid:{width:5,height:5,origin:[499995,5000015],step:[5,-5],values:Array.from({length:25},(_,i)=>(15-Math.floor(i/5)*5)/2)}});
 let saved=createInitialState();saved.project=ensureProjectFields({...saved.project,activeFieldId:'f',fields:[{...saved.project.fields[0],id:'f',geometry:[[0,0],[12,0],[12,12],[0,12],[0,0]].map(geo),rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowCurvePoints:[]}]});
 const document=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8')).document;
 const context=()=>({ownerId:'anonymous',projectId:saved.project.localProjectId,fieldId:'f'});
 const metrics=()=>calculateProject({...saved.project,polygon:saved.project.geometry});let controller,writes=0;
 const mount=createTerrainCoreMount({document,getController:()=>controller,getProject:()=>saved.project,getMetrics:metrics});
 controller=createTerrainController({document,getProject:()=>saved.project,getContext:context,getResult:metrics,onStateChange:mount.render,
  loadTerrain:async()=>model,runProposal:async options=>options.kind==='restore'?buildTerrainRestoreProposal(options):buildContourTerrainProposal(options),
  applyProposal:(proposal,captured)=>{saved=checkpointTerrainProposal({state:saved,proposal,context:captured,currentContext:context(),mergeState:mergeProjectState,saveCheckpoint:next=>{writes++;return next;}});return true;}});
 await controller.refresh();mount.render(controller.getState());const original=structuredClone(saved.project);
 const actions=mount.actions;
 const target=()=>{const {portionId,contextKey}=controller.getState();return {portionId,contextKey};};
 assert.equal(await actions.onModeChange({...target(),contextKey:'stale',mode:'terrain'}),null);assert.equal(controller.getState().proposal,null);
 const pending=actions.onModeChange({...target(),mode:'terrain'});assert.equal(typeof pending.then,'function');assert.equal((await pending).ok,true);
 assert.deepEqual(saved.project,original);assert.match(document.querySelector('#terrain-proposal-review').textContent,/tutto il campo/);
 assert.ok(document.querySelector('[data-terrain-action="apply"]'));assert.match(document.querySelector('#terrain-summary').textContent,/Anteprima/);
 assert.equal(await actions.onApply(target()),true);assert.equal(writes,1);assert.equal(saved.project.terrain.history.entries.length,1);
 assert.equal(document.querySelector('#terrain-proposal-review').textContent,'');assert.ok(document.querySelector('[data-terrain-action="restore"]'));
 assert.equal((await actions.onModeChange({...target(),mode:'manual'})).kind,'measure');await actions.onCancel(target());assert.equal(writes,1);
 assert.equal((await actions.onRestore(target())).kind,'restore');assert.equal(writes,1);assert.equal(await actions.onApply(target()),true);assert.equal(writes,2);
 assert.equal(saved.project.terrain.history.entries.length,0);
 mount.render({...controller.getState(),model:null,busy:false,proposal:null,statusKind:'unavailable',canAdapt:false});
 assert.ok(document.querySelector('[data-terrain-retry]'));mount.destroy();controller.destroy();
 assert.equal(document.querySelector('#terrain-curve-controls').children.length,0);
});

// Catches the mobile metrics replacement omitting field source/relief or borrowing a foreign active result.
test('actual mobile metrics hook retains field source and scoped optional relief in detail and parameters',async()=>{
 const {createMobileUI}=await import('../src/mobile-ui.js');
 const document=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8')).document;
 globalThis.document=document;globalThis.window={};
 const field={id:'f',activeFieldId:'f',label:'Campo',geometry:[[9,45],[9.001,45],[9.001,45.001],[9,45]],exclusions:[],terrain:{model:{source:{id:'dtm',label:'DTM del campo'}}}};
 const metrics={terrainStatus:'applied',quantityBasis:'model-surface',terrainSource:field.terrain.model.source,terrainRelief:{basis:'native-field-domain-before-exclusions',rangeM:6,maxSlopePercent:null},areaM2:100,netAreaM2:null,rows:[],rowCount:2,rowLinearM:24,simulatedPlants:20,commercialPlants25:25,totalPosts:8,intermediatePosts:4,headPosts:4};
 const auth={getState:()=>({kind:'guest'}),subscribe(fn){fn(this.getState());return ()=>{};}};
 const api={isMobile:()=>true,getField:()=>field,getFields:()=>[field],getMetrics:()=>metrics,auth,resizeMap(){},focusAll(){},focusField(){},stopTools(){},finishEdit(){},undoPoint(){},beginEdit(){},selectField(){},listProjects:()=>[]};
 const ui=createMobileUI(api);ui.navigate('detail');
 assert.match(document.querySelector('#mobile-field-detail').textContent,/DTM del campo/);assert.match(document.querySelector('#mobile-field-detail').textContent,/6 m/);
 assert.ok(!document.querySelector('#mobile-field-detail').textContent.includes('Pendenza'));
 const netRow=[...document.querySelectorAll('#mobile-field-detail .mobile-metrics div')].find(row=>row.querySelector('dt').textContent==='Superficie netta');
 assert.equal(netRow.querySelector('dd').textContent,'—');
 ui.navigate('parameters');assert.match(document.querySelector('#mobile-parameters-metrics').textContent,/DTM del campo/);
 assert.equal(document.querySelectorAll('#terrain-curve-controls').length,1);assert.ok(document.querySelector('#mobile-curve-controls #terrain-curve-controls'));
});

// Catches applying native-null formatting to historical absent-basis manual values.
test('mobile preserves legacy absent-basis null coercion while explicit native null metrics stay unknown',async()=>{
 const {createMobileUI}=await import('../src/mobile-ui.js');
 const archive=JSON.parse(await readFile(new URL('./fixtures/v126-legacy-compatibility.json',import.meta.url),'utf8'));
 const {calculateProject}=await import('../src/project-calculator.js');
 const old=archive.cases[0],field={...old.input,id:'legacy',activeFieldId:'legacy',label:'Archivio',geometry:old.input.polygon,metrics:null,terrain:null};
 const calculated=calculateProject(old.input);assert.equal(calculated.rowCount,old.metrics.rowCount);assert.equal(calculated.rowLinearM,old.metrics.rowLinearM);
 const before=structuredClone(field);
 for(const metrics of [calculated,{rows:[],areaM2:null,netAreaM2:null,rowLinearM:null,simulatedPlants:null,commercialPlants25:null,totalPosts:null},
  {rows:[],terrainStatus:'applied',quantityBasis:'model-surface',areaM2:null,netAreaM2:null,rowLinearM:null,simulatedPlants:null,commercialPlants25:null,totalPosts:null}]){
  const document=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8')).document;globalThis.document=document;globalThis.window={};
  const auth={getState:()=>({kind:'guest'}),subscribe(fn){fn(this.getState());return()=>{};}};
  const api={isMobile:()=>true,getField:()=>field,getFields:()=>[field],getMetrics:()=>metrics,auth,resizeMap(){},focusAll(){},focusField(){},stopTools(){},listProjects:()=>[]};
  const ui=createMobileUI(api);ui.navigate('detail');
  const values=Object.fromEntries([...document.querySelectorAll('#mobile-field-detail .mobile-metrics div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]));
  if(metrics===calculated){assert.equal(values['Tratti di filare'],'31');assert.equal(values['Metri di filare'],`${calculated.rowLinearM.toLocaleString('it-IT',{maximumFractionDigits:1})} m`);}
  else if(metrics.quantityBasis){assert.equal(values.Superficie,'—');assert.equal(values['Metri di filare'],'—');assert.equal(document.querySelector('.mobile-commercial-vines').textContent,'—');}
  else{assert.equal(values.Superficie,'0 m²');assert.equal(values['Superficie netta'],'0 m²');assert.equal(values['Metri di filare'],'0 m');assert.equal(document.querySelector('.mobile-commercial-vines').textContent,'0');}
  assert.deepEqual(field,before);
 }
});
