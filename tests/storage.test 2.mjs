import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDraft, saveDraft, newSessionId, getConsentState, setConsentState } from '../src/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}

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

test('consent can be stored as necessary-only or analytics', () => {
  const storage = memoryStorage();
  assert.equal(getConsentState(storage), null);
  setConsentState(storage, 'necessary');
  assert.equal(getConsentState(storage), 'necessary');
  setConsentState(storage, 'analytics');
  assert.equal(getConsentState(storage), 'analytics');
});
