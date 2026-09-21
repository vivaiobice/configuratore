const DRAFT_KEY = 'vivai-obice:configuratore:draft';
const CONSENT_KEY = 'vivai-obice:configuratore:consent';
const DRAFT_VERSION = 2;
import { migrateDraftEnvelope } from './local-migrations.js';

export function saveDraft(storage, state) {
  if (!storage?.setItem) return false;
  const envelope = migrateDraftEnvelope({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), state });
  storage.setItem(DRAFT_KEY, JSON.stringify(envelope));
  return true;
}

export function loadDraft(storage) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    return migrateDraftEnvelope(envelope).state;
  } catch {
    return null;
  }
}

export function newSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure random generator unavailable');
}

export function getConsentState(storage) {
  const value = storage?.getItem?.(CONSENT_KEY) ?? null;
  return value === 'necessary' || value === 'analytics' ? value : null;
}

export function setConsentState(storage, state) {
  if (state !== 'necessary' && state !== 'analytics') throw new TypeError('Invalid consent state');
  storage?.setItem?.(CONSENT_KEY, state);
  return state;
}
