import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSecureConnection } from '../src/secure-context.js';

test('cloud contact save requires HTTPS before processing personal data', () => {
  assert.throws(() => requireSecureConnection(false), /https:\/\/progettaimpianto\.vivaiobice\.com/);
  assert.doesNotThrow(() => requireSecureConnection(true));
});
