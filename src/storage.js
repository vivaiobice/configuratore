const DRAFT_KEY = 'vivai-obice:configuratore:draft';
const CONSENT_KEY = 'vivai-obice:configuratore:consent';
const DRAFT_VERSION = 2;
import { migrateDraftEnvelope } from './local-migrations.js?v=55.6.1';
import {ownerStorageKey} from './local-owner-scope.js';
import {APP_CONFIG} from './config.js';
import {secureUuid} from './secure-id.js';
const draftKey=()=>ownerStorageKey(DRAFT_KEY,APP_CONFIG.environment);

export function saveDraft(storage, state) {
  if (!storage?.setItem) return false;
  const envelope = migrateDraftEnvelope({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), state });
  storage.setItem(draftKey(), JSON.stringify(envelope));
  return envelope.state;
}

export function loadDraft(storage) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(draftKey());
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    return migrateDraftEnvelope(envelope).state;
  } catch {
    return null;
  }
}

export function newSessionId() {
  return secureUuid();
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
