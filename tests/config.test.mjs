import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_CONFIG } from '../src/config.js';

test('LIVE app is connected to the real Supabase project with a publishable key', () => {
  assert.equal(APP_CONFIG.environment, 'LIVE');
  assert.equal(APP_CONFIG.supabaseUrl, 'https://lnclwslcjufwdbmsxljf.supabase.co');
  assert.match(APP_CONFIG.supabasePublishableKey, /^sb_publishable_/);
});
