import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createCoordinateEditor} from '../src/coordinate-editor.js';

const coordinate=[8.123456789123,44];
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(){
 const {document,window}=parseHTML('<html><body><button id="trigger">Punto</button></body></html>'),editor=createCoordinateEditor({document});
 function open(options={}){return editor.open({coordinate,trigger:document.querySelector('#trigger'),...options});}
 function submit(dialog=document.querySelector('.coordinate-dialog')){dialog.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));}
 function change(dialog=document.querySelector('.coordinate-dialog'),value='8,124'){dialog.querySelector('input').value=value;}
 function key(dialog,value,shiftKey=false){const event=new window.Event('keydown',{cancelable:true,bubbles:true});Object.defineProperties(event,{key:{value},shiftKey:{value:shiftKey}});dialog.dispatchEvent(event);return event;}
 return {document,window,editor,open,submit,change,key};
}

// Immediate close would discard pending state and permit duplicate publication.
test('pending apply keeps the dialog and disables edited controls until the actual promise resolves',async()=>{
 const f=fixture(),work=deferred();let calls=0,point,signal;
 const dialog=f.open({onApply:(next,options)=>{calls++;point=next;signal=options?.signal;return work.promise;}});f.change();f.submit();
 assert.ok(f.document.querySelector('.coordinate-dialog')===dialog,'current dialog remains open');assert.deepEqual(point,[8.124,44]);assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);
 assert.equal(dialog.querySelector('button[type=submit]').disabled,true);assert.equal(dialog.querySelector('select').disabled,true);assert.ok([...dialog.querySelectorAll('input')].every(input=>input.disabled));assert.equal(dialog.querySelector('[data-coordinate-cancel]').disabled,false);
 f.submit(dialog);assert.equal(calls,1);
 work.resolve();await work.promise;assert.equal(f.document.querySelector('.coordinate-dialog'),null);assert.equal(signal.aborted,true);
});

// Each externally supplied guard can dispatch a nested event on this same form.
for(const boundary of [1,2])test(`one-shot same-dialog submit at guard ${boundary} starts one cancellable operation`,async()=>{
 const f=fixture(),signals=[],work=[];let checks=0,nested=false,dialog;
 dialog=f.open({isCurrent:()=>{if(++checks===boundary&&!nested){nested=true;f.submit(dialog);}return true;},onApply:(point,{signal})=>{signals.push(signal);const operation=deferred();work.push(operation);return operation.promise;}});
 f.change(dialog);f.submit(dialog);
 const started=signals.length;f.editor.close();const allAborted=signals.every(signal=>signal.aborted);
 for(const operation of work)operation.resolve();await Promise.all(work.map(operation=>operation.promise));
 assert.equal(started,1);assert.equal(allAborted,true);assert.equal(f.document.querySelector('.coordinate-dialog'),null);
});

// LinkeDOM does not implement browser focus movement: this boundary tracks real
// focus() requests on connected, enabled DOM controls, without replacing events.
function focusFixture(){
 const f=fixture(),create=f.document.createElement.bind(f.document);let active=f.document.body;
 Object.defineProperty(f.document,'activeElement',{configurable:true,get:()=>active});
 const track=node=>{node.focus=()=>{if(node.isConnected&&!node.disabled)active=node;};return node;};
 f.document.createElement=(...args)=>track(create(...args));track(f.document.querySelector('#trigger'));
 return f;
}

test('pending input focus moves to Cancel, traps both Tab directions and keeps Escape reachable',async()=>{
 const f=focusFixture(),work=deferred(),dialog=f.open({onApply:()=>work.promise});
 assert.ok(f.document.activeElement===dialog.querySelector('input'));f.change(dialog);f.submit(dialog);
 const cancel=dialog.querySelector('[data-coordinate-cancel]');assert.ok(f.document.activeElement===cancel,'pending focus stays on enabled Cancel');
 for(const backwards of [false,true]){assert.equal(f.key(f.document.activeElement,'Tab',backwards).defaultPrevented,true);assert.ok(f.document.activeElement===cancel);}
 assert.equal(f.key(f.document.activeElement,'Escape').defaultPrevented,true);assert.equal(f.document.querySelector('.coordinate-dialog'),null);assert.ok(f.document.activeElement===f.document.querySelector('#trigger'));
 work.resolve();await work.promise;
});

test('pending Cancel restores trigger focus and an obsolete completion cannot steal replacement focus',async()=>{
 const f=focusFixture(),work=deferred(),old=f.open({onApply:()=>work.promise});f.change(old);f.submit(old);old.querySelector('[data-coordinate-cancel]').click();
 assert.ok(f.document.activeElement===f.document.querySelector('#trigger'));
 const replacement=f.open({coordinate:[9,45]});assert.ok(f.document.activeElement===replacement.querySelector('input'));
 old.querySelector('[data-coordinate-cancel]').click();f.key(old,'Escape');work.resolve();await work.promise;
 assert.ok(f.document.activeElement===replacement.querySelector('input'),'stale close cannot steal replacement focus');
});

test('reentrant close abort listener preserves focus in its replacement dialog',async()=>{
 const f=focusFixture(),work=deferred();let replacement;
 const old=f.open({onApply:(point,{signal})=>{signal.addEventListener('abort',()=>{replacement=f.open({coordinate:[9,45]});});return work.promise;}});f.change(old);f.submit(old);f.editor.close();
 assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);assert.ok(f.document.activeElement===replacement.querySelector('input'),'outer close must not restore the old trigger');
 work.reject(new Error('obsolete'));await work.promise.catch(()=>{});assert.ok(f.document.activeElement===replacement.querySelector('input'));
});

test('synchronous changed and untouched applies retain immediate historical behavior',()=>{
 const f=fixture();let calls=0,signal;
 f.open({onApply:(next,options)=>{calls++;signal=options?.signal;assert.deepEqual(next,[8.124,44]);}});f.change();f.submit();
 assert.equal(calls,1);assert.equal(f.document.querySelector('.coordinate-dialog'),null);assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,true);
 f.open({onApply:()=>calls++});f.submit();assert.equal(calls,1);assert.equal(f.document.querySelector('.coordinate-dialog'),null);
});

test('asynchronous rejection retains entered coordinates, localized error and retry availability',async()=>{
 const f=fixture(),first=deferred();let calls=0;
 const dialog=f.open({onApply:()=>++calls===1?first.promise:undefined});f.change();f.submit();
 first.reject(new Error('backend failed'));await first.promise.catch(()=>{});
 assert.ok(f.document.querySelector('.coordinate-dialog')===dialog,'current dialog remains open');assert.equal(dialog.querySelector('input').value,'8,124');assert.match(dialog.querySelector('[role=alert]').textContent,/coordinate|applic/i);
 assert.equal(dialog.querySelector('button[type=submit]').disabled,false);assert.equal(dialog.querySelector('select').disabled,false);assert.ok([...dialog.querySelectorAll('input')].every(input=>!input.disabled));
 f.submit();assert.equal(calls,2);assert.equal(f.document.querySelector('.coordinate-dialog'),null);
});

for(const action of ['cancel','escape','close','destroy','replace'])for(const outcome of ['resolve','reject']){
 test(`${action} physically aborts pending apply and a late ${outcome} cannot change the replacement dialog`,async()=>{
  const f=fixture(),work=deferred();let signal,aborts=0;
  const old=f.open({onApply:(point,options)=>{signal=options?.signal;signal?.addEventListener('abort',()=>aborts++);return work.promise;}});f.change();f.submit();
  if(action==='cancel')old.querySelector('[data-coordinate-cancel]').click();
  else if(action==='escape')assert.equal(f.key(old,'Escape').defaultPrevented,true);
  else if(action==='close')f.editor.close();
  else if(action==='destroy')f.editor.destroy();
  const replacement=f.open({coordinate:[9,45],title:'Nuovo punto'});
  assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,true);assert.equal(aborts,1);
  if(outcome==='resolve')work.resolve();else work.reject(new Error('obsolete'));
  await work.promise.catch(()=>{});
  assert.ok(f.document.querySelector('.coordinate-dialog')===replacement,'replacement dialog remains current');assert.equal(replacement.querySelector('input').value,'9');assert.equal(replacement.querySelector('[role=alert]').textContent,'');assert.equal(replacement.querySelector('button[type=submit]').disabled,false);
 });
}

test('context gone before submit never starts apply',()=>{
 const f=fixture();let current=true,calls=0;f.open({isCurrent:()=>current,onApply:()=>calls++});f.change();current=false;f.submit();
 assert.equal(calls,0);assert.equal(f.document.querySelector('.coordinate-dialog'),null);
});

for(const outcome of ['resolve','reject'])test(`context gone after apply discards ${outcome} and aborts the old signal`,async()=>{
 const f=fixture(),work=deferred();let current=true,signal;
 f.open({isCurrent:()=>current,onApply:(point,options)=>{signal=options?.signal;return work.promise;}});f.change();f.submit();current=false;
 if(outcome==='resolve')work.resolve();else work.reject(new Error('stale context'));await work.promise.catch(()=>{});
 assert.equal(f.document.querySelector('.coordinate-dialog'),null);assert.equal(signal.aborted,true);
});

test('synchronous callback replacement is not closed by the old submission',()=>{
 const f=fixture();let replacement;
 f.open({onApply:()=>{replacement=f.open({coordinate:[9,45],title:'Nuovo'});}});f.change();f.submit();assert.ok(f.document.querySelector('.coordinate-dialog')===replacement,'replacement dialog remains current');
});

// A reentrant context guard must not install the old operation on a new opening.
test('replacement during the before-apply guard remains able to submit its own coordinates',()=>{
 const f=fixture();let checks=0,oldCalls=0,newCalls=0,replacement;
 f.open({isCurrent:()=>{if(++checks===2)replacement=f.open({coordinate:[9,45],onApply:()=>newCalls++});return true;},onApply:()=>oldCalls++});f.change();f.submit();
 assert.equal(oldCalls,0);assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);
 f.change(replacement,'9.5');f.submit(replacement);assert.equal(newCalls,1);assert.equal(f.document.querySelector('.coordinate-dialog'),null);
});

test('pending CRS events cannot reset edited values or enable duplicate apply',async()=>{
 const f=fixture(),work=deferred();let calls=0;
 const dialog=f.open({onApply:()=>{calls++;return work.promise;}});f.change();f.submit();
 dialog.querySelector('select').dispatchEvent(new f.window.Event('change'));
 assert.equal(dialog.querySelector('input').value,'8,124');assert.equal(dialog.querySelector('button[type=submit]').disabled,true);f.submit(dialog);assert.equal(calls,1);
 work.resolve();await work.promise;
});

test('a thenable callback also remains pending until its own completion',async()=>{
 const f=fixture();let complete;
 const dialog=f.open({onApply:()=>({then(resolve){complete=resolve;}})});f.change();f.submit();
 assert.ok(f.document.querySelector('.coordinate-dialog')===dialog);await Promise.resolve();complete();await Promise.resolve();await Promise.resolve();
 assert.equal(f.document.querySelector('.coordinate-dialog'),null);
});

test('retained Cancel and Escape events from an old pending dialog cannot close its replacement',async()=>{
 const f=fixture(),work=deferred();const old=f.open({onApply:()=>work.promise});f.change();f.submit();const replacement=f.open({coordinate:[9,45]});
 old.querySelector('[data-coordinate-cancel]').click();f.key(old,'Escape');assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);
 work.resolve();await work.promise;assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);
});

test('a synchronous thrown non-Error value keeps the edited dialog available for correction',()=>{
 const f=fixture(),dialog=f.open({onApply:()=>{throw null;}});f.change();assert.doesNotThrow(()=>f.submit());
 assert.ok(f.document.querySelector('.coordinate-dialog')===dialog);assert.equal(dialog.querySelector('input').value,'8,124');assert.equal(dialog.querySelector('button[type=submit]').disabled,false);assert.match(dialog.querySelector('[role=alert]').textContent,/coordinate|applic/i);
});

for(const outcome of ['resolve','reject'])test(`replacement during the after-${outcome} context guard is never changed by the old completion`,async()=>{
 const f=fixture(),work=deferred();let replace=false,replacement,newCalls=0;
 const old=f.open({isCurrent:()=>{if(replace){replace=false;replacement=f.open({coordinate:[9,45],onApply:()=>newCalls++});}return true;},onApply:()=>work.promise});f.change();f.submit();replace=true;
 if(outcome==='resolve')work.resolve();else work.reject(new Error('old'));await work.promise.catch(()=>{});
 assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);assert.equal(replacement.querySelector('[role=alert]').textContent,'');
 f.change(replacement,'9.5');f.submit(replacement);assert.equal(newCalls,1);assert.equal(f.document.querySelector('.coordinate-dialog'),null);f.submit(old);assert.equal(newCalls,1);
});

test('an abort listener opening a new dialog wins over the obsolete outer open',async()=>{
 const f=fixture(),work=deferred();let replacement;
 f.open({onApply:(point,{signal})=>{signal.addEventListener('abort',()=>{replacement=f.open({coordinate:[9,45],title:'Da annullamento'});});return work.promise;}});f.change();f.submit();
 const returned=f.open({coordinate:[10,46],title:'Obsoleto'});assert.ok(returned===replacement);assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);assert.equal(f.document.querySelectorAll('.coordinate-dialog').length,1);
 work.resolve();await work.promise;assert.ok(f.document.querySelector('.coordinate-dialog')===replacement);
});
