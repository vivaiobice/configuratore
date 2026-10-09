import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

const load = () => import('../src/terrain-controls.js');
const base = {portionId:'p1',contextKey:'field-a/input-1',mode:'manual',busy:false,
 proposal:null,status:null,progress:null,restoreAvailability:{kind:'unavailable'},canSuggestCut:false,canAdapt:true};
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function setup(callbacks={}) {
 const {createTerrainControls}=await load();
 const {document}=parseHTML('<div class="row-curve-controls"><input id="manual-slider" value="12"><div id="terrain-curve-controls"></div></div><div id="mobile"></div>');
 const host=document.querySelector('#terrain-curve-controls');
 const events=[];
 const controls=createTerrainControls({host,...Object.fromEntries(['onModeChange','onApply','onCancel','onSuggestCut','onRestore'].map(name=>[name,payload=>events.push({name,payload})])),...callbacks});
 const render=state=>controls.render({...base,...state});
 const button=action=>host.querySelector(`[data-terrain-action="${action}"]`);
 return {document,host,controls,events,render,button};
}

// Catches optimistically changing modes or losing the selected callback target.
test('mode buttons expose the rendered mode and request a change for that selected portion',async()=>{
 const ui=await setup();ui.render();
 assert.ok(ui.button('manual'),'the widget exposes the manual mode');
 assert.ok(ui.button('terrain'),'the widget exposes the terrain mode');
 assert.equal(ui.button('manual').getAttribute('aria-pressed'),'true');
 assert.equal(ui.button('terrain').getAttribute('aria-pressed'),'false');
 ui.button('manual').click();assert.equal(ui.events.length,0);
 ui.button('terrain').click();
 assert.deepEqual(ui.events,[{name:'onModeChange',payload:{portionId:'p1',contextKey:'field-a/input-1',mode:'terrain'}}]);
 assert.equal(ui.button('manual').getAttribute('aria-pressed'),'true');
 ui.render({mode:'terrain'});
 assert.equal(ui.button('terrain').getAttribute('aria-pressed'),'true');
 ui.button('manual').click();
 assert.deepEqual(ui.events.at(-1),{name:'onModeChange',payload:{portionId:'p1',contextKey:'field-a/input-1',mode:'manual'}});
});

// Catches buttons applying another portion's preview, or showing actions without a preview.
test('apply and cancel exist only for a pending proposal and capture its rendered target',async()=>{
 const ui=await setup();ui.render();assert.equal(ui.button('apply'),null);assert.equal(ui.button('cancel'),null);
 ui.render({portionId:'p2',proposal:{pending:true,canApply:true}});
 assert.equal(ui.button('apply').disabled,false);ui.button('apply').click();
 assert.deepEqual(ui.events.at(-1),{name:'onApply',payload:{portionId:'p2',contextKey:'field-a/input-1'}});
 ui.render({portionId:'p2',proposal:{pending:true,canApply:false}});
 assert.equal(ui.button('apply').disabled,true);ui.button('apply').click();
 assert.equal(ui.events.length,1);ui.button('cancel').click();
 assert.deepEqual(ui.events.at(-1),{name:'onCancel',payload:{portionId:'p2',contextKey:'field-a/input-1'}});
 ui.render({proposal:{pending:false,canApply:true}});assert.equal(ui.button('apply'),null);assert.equal(ui.button('cancel'),null);
});

// Catches deriving cut or exact restore availability from a generic terrain mode.
test('cut and restore require explicit availability and target the selected portion',async()=>{
 const ui=await setup();ui.render({mode:'terrain'});
 assert.equal(ui.button('cut'),null);assert.equal(ui.button('restore'),null);
 ui.render({portionId:'p3',canSuggestCut:true});ui.button('cut').click();
 assert.deepEqual(ui.events.at(-1),{name:'onSuggestCut',payload:{portionId:'p3',contextKey:'field-a/input-1'}});
 for(const kind of ['exact','proposal']) {
  ui.render({portionId:'p3',restoreAvailability:{kind}});assert.ok(ui.button('restore'));ui.button('restore').click();
  assert.deepEqual(ui.events.at(-1),{name:'onRestore',payload:{portionId:'p3',contextKey:'field-a/input-1'}});
 }
});

// Catches enabling undo for old missing baselines or modified cut children.
test('unavailable and conflicting restore never offer an executable undo',async()=>{
 const ui=await setup();
 ui.render({restoreAvailability:{kind:'unavailable'}});assert.equal(ui.button('restore'),null);
 ui.render({restoreAvailability:{kind:'conflict'}});assert.equal(ui.button('restore'),null);
 assert.match(ui.host.textContent,/modific|ripristin/i);
 assert.equal(ui.events.length,0);
});

// Catches stale detached controls dispatching to a new selection, even with a reused portion ID.
test('a new render invalidates old callbacks on portion and context switches',async()=>{
 const ui=await setup();ui.render({proposal:{pending:true,canApply:true}});const oldApply=ui.button('apply');
 ui.render({portionId:'p2',proposal:{pending:true,canApply:true}});oldApply.click();assert.equal(ui.events.length,0);
 const oldCancel=ui.button('cancel');ui.render({portionId:'p2',contextKey:'field-b/input-2',proposal:{pending:true,canApply:true}});
 oldCancel.click();assert.equal(ui.events.length,0);ui.button('cancel').click();
 assert.deepEqual(ui.events.at(-1),{name:'onCancel',payload:{portionId:'p2',contextKey:'field-b/input-2'}});
});

// Catches closure access to the caller's subsequently mutated DTO.
test('callbacks use a snapshot rather than a mutable render object',async()=>{
 const ui=await setup();const state={...base,canSuggestCut:true};ui.controls.render(state);state.portionId='other';state.contextKey='other-context';
 ui.button('cut').click();assert.deepEqual(ui.events[0].payload,{portionId:'p1',contextKey:'field-a/input-1'});
});

// Catches two applies while the first checkpoint is still pending.
test('a pending callback suppresses duplicate actions until it settles',async()=>{
 const pending=deferred();let applies=0;const ui=await setup({onApply:()=>{applies++;return pending.promise;}});
 ui.render({proposal:{pending:true,canApply:true}});const apply=ui.button('apply');apply.click();apply.click();ui.button('cancel').click();
 assert.equal(applies,1);assert.equal(ui.events.length,0);assert.equal(ui.host.firstElementChild.getAttribute('aria-busy'),'true');
 pending.resolve();await pending.promise;await Promise.resolve();
 assert.equal(ui.button('apply').disabled,false);
});

// Catches clearing a pending lock when the producer rerenders the same context.
test('rerendering the same context cannot duplicate an unresolved callback',async()=>{
 const pending=deferred();let calls=0;const ui=await setup({onApply:()=>{calls++;return pending.promise;}});
 ui.render({proposal:{pending:true,canApply:true}});ui.button('apply').click();
 ui.render({proposal:{pending:true,canApply:true}});ui.button('apply').click();assert.equal(calls,1);
 pending.resolve();await pending.promise;await Promise.resolve();assert.equal(ui.button('apply').disabled,false);
});

// Catches a late callback completion unlocking another selection's pending action.
test('late settlement never changes the pending state of a newer selected context',async()=>{
 const first=deferred(),second=deferred();const targets=[];
 const ui=await setup({onApply:payload=>{targets.push(payload);return payload.portionId==='p1'?first.promise:second.promise;}});
 ui.render({proposal:{pending:true,canApply:true}});ui.button('apply').click();
 ui.render({portionId:'p2',proposal:{pending:true,canApply:true}});ui.button('apply').click();
 first.resolve();await first.promise;await Promise.resolve();assert.equal(ui.button('apply').disabled,true);
 second.resolve();await second.promise;await Promise.resolve();assert.equal(ui.button('apply').disabled,false);
 assert.deepEqual(targets.map(t=>t.portionId),['p1','p2']);
});

// Catches callbacks and late status updates surviving teardown.
test('destroy removes owned content and disables detached callbacks and late completions',async()=>{
 const pending=deferred();let calls=0;const ui=await setup({onApply:()=>{calls++;return pending.promise;}});
 ui.render({proposal:{pending:true,canApply:true}});const oldApply=ui.button('apply');oldApply.click();
 ui.controls.destroy();ui.controls.destroy();oldApply.click();ui.render({mode:'terrain'});
 pending.resolve();await pending.promise;await Promise.resolve();
 assert.equal(calls,1);assert.equal(ui.host.children.length,0);assert.equal(ui.document.querySelector('#manual-slider').value,'12');
});

// Catches busy, missing targets, and unavailable adaptation still dispatching.
test('busy and unavailable states gate actions without guessing availability',async()=>{
 const ui=await setup();ui.render({busy:true,proposal:{pending:true,canApply:true},canSuggestCut:true,restoreAvailability:{kind:'exact'}});
 for(const action of ['manual','terrain','apply','cancel','cut','restore']) {assert.equal(ui.button(action).disabled,true);ui.button(action).click();}
 assert.equal(ui.events.length,0);
 ui.render({portionId:null,canSuggestCut:true,restoreAvailability:{kind:'exact'}});ui.button('terrain').click();assert.equal(ui.events.length,0);
 ui.render({canAdapt:false});assert.equal(ui.button('terrain').disabled,true);
 ui.render({proposal:{pending:true,canApply:true},canSuggestCut:true,restoreAvailability:{kind:'exact'}});
 assert.equal(ui.button('terrain').disabled,true);assert.equal(ui.button('cut').disabled,true);assert.equal(ui.button('restore').disabled,true);
});

// Catches inaccessible/raw internal phase diagnostics or a stale busy announcement.
test('progress announces friendly Italian phases without displaying internal implementation text',async()=>{
 const ui=await setup();
 for(const [phase,expected] of [['domain',/terreno/i],['contours',/filari/i],['contour-spacing',/distanze/i],['restore',/ripristino/i],['secret-solver-phase',/elaborazione/i]]) {
  ui.render({busy:true,progress:{phase,elapsedMs:1234}});const status=ui.host.querySelector('[role="status"]');
  assert.match(status.textContent,expected);assert.equal(status.getAttribute('aria-live'),'polite');assert.ok(!status.textContent.includes(phase));
 }
 ui.render({busy:false,progress:{phase:'domain'}});assert.equal(ui.host.firstElementChild.getAttribute('aria-busy'),'false');
 assert.ok(!ui.host.textContent.includes('Elaborazione'));
});

// Catches timeout being presented as geometric incompatibility, and vice versa.
test('status distinguishes time limit, incompatibility and cancellation without raw error text',async()=>{
 const ui=await setup();
 for(const [kind,expected] of [['budget-exceeded',/tempo/i],['incompatible',/compatibile/i],['cancelled',/annullata/i]]) {
  ui.render({status:{kind,...(kind==='budget-exceeded'?{budgetReason:'time'}:{}),message:'solver nativeXY secret detail'}});assert.match(ui.host.textContent,expected);assert.ok(!ui.host.textContent.includes('nativeXY'));
 }
});

// Catches orphaned handlers or recreated host ownership during mobile reparenting.
test('the widget survives host reparenting and preserves existing manual controls',async()=>{
 const ui=await setup();ui.render();const slider=ui.document.querySelector('#manual-slider');
 ui.document.querySelector('#mobile').append(ui.document.querySelector('.row-curve-controls'));
 ui.button('terrain').click();assert.equal(ui.events.length,1);assert.equal(ui.document.querySelector('#manual-slider'),slider);assert.equal(slider.value,'12');
 ui.render({mode:'terrain'});assert.equal(ui.host.querySelectorAll('[data-terrain-action="terrain"]').length,1);
});

// Catches unhandled rejections that strand all UI actions.
test('rejected callbacks release their lock with friendly feedback',async()=>{
 const pending=deferred();const ui=await setup({onApply:()=>pending.promise});
 ui.render({proposal:{pending:true,canApply:true}});ui.button('apply').click();pending.reject(new Error('private implementation details'));
 await pending.promise.catch(()=>{});await Promise.resolve();
 assert.equal(ui.button('apply').disabled,false);assert.match(ui.host.textContent,/riuscita|riprova/i);assert.ok(!ui.host.textContent.includes('private implementation'));
});

// Catches inherited dictionary properties bypassing the promised Italian fallback.
for(const key of ['constructor','toString','__proto__','valueOf','hasOwnProperty','ordinary-unknown']) {
 test(`unknown progress key ${key} uses the exact Italian fallback`,async()=>{
  const ui=await setup();ui.render({busy:true,progress:{phase:key}});
  const text=ui.host.querySelector('[role="status"]').textContent;
  assert.equal(text,'Elaborazione in corso…');assert.doesNotMatch(text,/function|\[object|native code/);
 });
 test(`unknown status key ${key} uses the exact Italian fallback`,async()=>{
  const ui=await setup();ui.render({status:{kind:key}});
  const text=ui.host.querySelector('[role="status"]').textContent;
  assert.equal(text,'Operazione non disponibile per questa porzione.');assert.doesNotMatch(text,/function|\[object|native code/);
 });
}

// Catches same-mode requests escaping strict opt-in or duplicate/context guards.
test('repeatMode strict opt-in permits an explicit same-mode proposal with the existing locks',async()=>{
 const pending=deferred();const calls=[];
 const ui=await setup({onModeChange:target=>{calls.push(target);return pending.promise;}});
 ui.render({repeatMode:'true'});ui.button('manual').click();assert.equal(calls.length,0);
 ui.render({repeatMode:true});const oldManual=ui.button('manual');oldManual.click();ui.button('manual').click();
 assert.deepEqual(calls,[{portionId:'p1',contextKey:'field-a/input-1',mode:'manual'}]);
 ui.render({repeatMode:true});ui.button('manual').click();assert.equal(calls.length,1);
 ui.render({portionId:'p2',repeatMode:true});oldManual.click();assert.equal(calls.length,1);
 pending.resolve();await pending.promise;await Promise.resolve();
 ui.render({portionId:'p2',repeatMode:true,proposal:{pending:true,canApply:true}});ui.button('manual').click();assert.equal(calls.length,1);
 ui.controls.destroy();oldManual.click();assert.equal(calls.length,1);
});
