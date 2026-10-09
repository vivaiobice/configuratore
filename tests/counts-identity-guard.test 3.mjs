import test from 'node:test';
import assert from 'node:assert/strict';
import {installIdentityGuard,bindBackendToIdentity} from '../src/identity-guard.js';
import {createBackend} from '../src/backend.js';
import {mountWorkspaceRestoreGate,workspaceContextMatches} from '../src/workspace-restore-gate.js';
import {parseHTML} from 'linkedom';

test('external identity change suspends before saving under the previous owner and hides before reload',async()=>{
 let callback;const events=[];
 const guard=installIdentityGuard({client:{auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}},ownerId:'A',onSuspend:()=>events.push('suspend'),onCheckpoint:()=>events.push('save A'),onHide:()=>events.push('hide'),onReload:()=>events.push('reload')});
 callback('TOKEN_REFRESHED',{user:{id:'A'}});assert.deepEqual(events,[]);
 callback('SIGNED_IN',{user:{id:'B'}});assert.deepEqual(events,['suspend','save A','hide']);await Promise.resolve();assert.deepEqual(events,['suspend','save A','hide','reload']);assert.equal(guard.isStopped(),true);
});
test('failed identity checkpoint hides private UI but never reloads or saves in the new scope',async()=>{
 let callback,reloads=0,hidden=false;
 installIdentityGuard({client:{auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}},ownerId:'A',onSuspend:()=>{},onCheckpoint:()=>{throw new Error('Quota');},onHide:()=>hidden=true,onReload:()=>reloads++});
 callback('SIGNED_OUT',null);await Promise.resolve();assert.equal(hidden,true);assert.equal(reloads,0);
});
test('coordinated login waits for transfer completion rather than reloading from its Auth callback',async()=>{
 let callback,reloads=0;
 installIdentityGuard({client:{auth:{onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}},ownerId:'A',isCoordinated:()=>true,onSuspend:()=>{},onCheckpoint:()=>{},onHide:()=>{},onReload:()=>reloads++});
 callback('SIGNED_IN',{user:{id:'B'}});await Promise.resolve();assert.equal(reloads,0);
});
test('pending map restoration blocks field mutation and allows the original logo tool selector',()=>{
 const {document,window}=parseHTML('<html><body><button id="field">Cambia campo</button><button class="mobile-brand-tool-trigger">Strumenti</button></body></html>');let pending=true,changes=0,tools=0;
 const captures=new Map(),captureDocument={addEventListener:(name,fn)=>captures.set(name,fn),removeEventListener:name=>captures.delete(name)};const gate=mountWorkspaceRestoreGate({document:captureDocument,isPending:()=>pending});document.querySelector('#field').addEventListener('click',()=>changes++);document.querySelector('.mobile-brand-tool-trigger').addEventListener('click',()=>tools++);
 let blocked=false;captures.get('click')({target:document.querySelector('#field'),preventDefault(){},stopImmediatePropagation(){blocked=true;}});if(!blocked)document.querySelector('#field').click();assert.equal(changes,0);
 blocked=false;captures.get('click')({target:document.querySelector('.mobile-brand-tool-trigger'),preventDefault(){},stopImmediatePropagation(){blocked=true;}});if(!blocked)document.querySelector('.mobile-brand-tool-trigger').click();assert.equal(tools,1);pending=false;blocked=false;captures.get('click')({target:document.querySelector('#field'),preventDefault(){},stopImmediatePropagation(){blocked=true;}});if(!blocked)document.querySelector('#field').click();assert.equal(changes,1);gate.destroy();
 const workspace={ownerId:'A',projectId:'P',fieldId:'F'};assert.equal(workspaceContextMatches(workspace,{ownerId:'A',projectId:'P',fieldId:'F'},workspace),true);assert.equal(workspaceContextMatches(workspace,{ownerId:'A',projectId:'P',fieldId:'OTHER'},workspace),false);assert.equal(workspaceContextMatches(workspace,{ownerId:'A',projectId:'P',fieldId:'F'},{...workspace}),false);
});

test('owner-bound backend drops late responses and refuses new requests after account change',async()=>{
 const controller=new AbortController();let finish,calls=0;const bound=bindBackendToIdentity({save:async()=>{calls++;return new Promise(resolve=>finish=resolve);}},controller.signal);
 const pending=bound.save();controller.abort();finish({projectId:'A'});await assert.rejects(pending,/Account cambiato/);await assert.rejects(bound.save(),/Account cambiato/);assert.equal(calls,1);
});
test('project RPC receives the owner cancellation signal so a late token cannot start its old operation',async()=>{
 const controller=new AbortController();let supplied,calls=0;
 const backend=createBackend({rpc:()=>{calls++;return {abortSignal:async signal=>{supplied=signal;controller.abort();return {data:{}};}};}},{requestSignal:controller.signal});
 await assert.rejects(backend.applyProjectOperation({operationId:'op',snapshot:{},expectedVersion:0}),/Account cambiato/);assert.equal(supplied,controller.signal);await assert.rejects(backend.applyProjectOperation({operationId:'op',snapshot:{},expectedVersion:0}),/Account cambiato/);assert.equal(calls,1);
});
