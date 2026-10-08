import {serializeTerrainSnapshot} from './terrain-serialization.js?v=1.3.1';
const DRAFT_KEY = 'vivai-obice:configuratore:draft';
const CONSENT_KEY = 'vivai-obice:configuratore:consent';
const DRAFT_VERSION = 3;
import { migrateDraftEnvelope } from './local-migrations.js?v=55.6.1&counts=1';
import {ownerStorageKey} from './local-owner-scope.js';
import {APP_CONFIG} from './config.js?v=1.3.1';
import {secureUuid} from './secure-id.js';
const draftKey=()=>ownerStorageKey(DRAFT_KEY,APP_CONFIG.environment);

export function saveDraft(storage, state, workspace = null) {
  if (!storage?.setItem) return false;
  const envelope = migrateDraftEnvelope({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), state, workspace });
  storage.setItem(draftKey(), serializeTerrainSnapshot(envelope));
  return envelope.state;
}

export function loadDraftRecord(storage) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(draftKey());
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    return migrateDraftEnvelope(envelope);
  } catch {
    return null;
  }
}

export function loadDraft(storage) { return loadDraftRecord(storage)?.state??null; }

export function newSessionId() {
  return secureUuid();
}

export function getOwnerSessionId(storage,ownerUserId,idFactory=newSessionId) {
  if(!ownerUserId)throw new TypeError('Session owner required');
  const key=`vivai-obice:configuratore:session:${ownerUserId}`;
  const existing=storage?.getItem?.(key);
  if(existing)return existing;
  const id=idFactory();
  storage?.setItem?.(key,id);
  return id;
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
