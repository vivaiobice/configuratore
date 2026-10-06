import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDraft, saveDraft, newSessionId, getOwnerSessionId, getConsentState, setConsentState } from '../src/storage.js';
import {ownerStorageKey,setLocalOwnerScope} from '../src/local-owner-scope.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}

test('V29 draft loads through the non-destructive in-memory migration', () => {
  const storage = memoryStorage();
  storage.setItem(ownerStorageKey('vivai-obice:configuratore:draft'), JSON.stringify({
    version:1, savedAt:'2026-01-02T00:00:00Z', state:{ project:{ localProjectId:'p-old', fields:[] } }
  }));
  const draft = loadDraft(storage);
  assert.equal(draft.cloud.clientProjectId, 'p-old');
  assert.equal(draft.project.campaignYear, 2026);
});

test('corrupt draft is never replaced while loading', () => {
  let setCalls=0;
  const store={ getItem:()=>'{bad', setItem:()=>{ setCalls+=1; } };
  assert.equal(loadDraft(store), null);
  assert.equal(setCalls, 0);
});

test('draft round-trips in a versioned envelope', () => {
  const storage = memoryStorage();
  saveDraft(storage, { environment: 'TEST', project: { rowSpacingM: 2.7 } });
  const draft = loadDraft(storage);
  assert.equal(draft.environment, 'TEST');
  assert.equal(draft.project.rowSpacingM, 2.7);
});

test('invalid or unsupported drafts fail closed', () => {
  const storage = memoryStorage();
  storage.setItem('vivai-obice:configuratore:draft', '{bad json');
  assert.equal(loadDraft(storage), null);
});

test('newSessionId returns high entropy non-sequential identifiers', () => {
  const a = newSessionId();
  const b = newSessionId();
  assert.notEqual(a, b);
  assert.ok(a.length >= 30);
});

test('browser session IDs are stable for one owner and distinct after account switching',()=>{
 const storage=memoryStorage();
 storage.setItem('vivai-obice:configuratore:session','old-shared-session');
 let counter=0;
 const next=()=>`session-${++counter}`;
 const guest=getOwnerSessionId(storage,'guest-user',next);
 assert.equal(getOwnerSessionId(storage,'guest-user',next),guest);
 const account=getOwnerSessionId(storage,'account-user',next);
 assert.notEqual(account,guest);
 assert.notEqual(account,'old-shared-session');
 assert.equal(getOwnerSessionId(storage,'account-user',next),account);
});

test('session IDs remain valid UUIDs without randomUUID',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{
    getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}
  }});
  try{assert.equal(newSessionId(),'00010203-0405-4607-8809-0a0b0c0d0e0f');}
  finally{if(previous)Object.defineProperty(globalThis,'crypto',previous);else delete globalThis.crypto;}
});

test('saving a new draft returns the stable identity used by subsequent saves',()=>{
  const storage=memoryStorage();
  const first=saveDraft(storage,{project:{fields:[]}});
  const second=saveDraft(storage,{...first,project:{...first.project,label:'Villa Ada'}});
  assert.match(first.project.localProjectId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(second.project.localProjectId,first.project.localProjectId);
  assert.equal(loadDraft(storage).project.label,'Villa Ada');
});

test('consent can be stored as necessary-only or analytics', () => {
  const storage = memoryStorage();
  assert.equal(getConsentState(storage), null);
  setConsentState(storage, 'necessary');
  assert.equal(getConsentState(storage), 'necessary');
  setConsentState(storage, 'analytics');
  assert.equal(getConsentState(storage), 'analytics');
});
