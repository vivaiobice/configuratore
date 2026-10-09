import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTS_CONFIG} from '../conteggi/config.js';
const server=await import('../supabase/functions/_shared/counts-config.js').catch(()=>({}));
const config=values=>{assert.equal(typeof server.resolveCountsFlags,'function','the deployed counts configuration must resolve explicit kill switches');return server.resolveCountsFlags(key=>values[key]??'');};

test('the coordinated release enables account storage and voluntary transmission using existing mail secrets',()=>{
  const flags=config({RESEND_API_KEY:'fixture-provider-key',QUOTE_EMAIL_FROM:'verified@example.com'});
  assert.equal(flags.sync,true);assert.equal(flags.submit,true);assert.equal(flags.admin,false);assert.equal(flags.emailEnabled,true);
  assert.equal(flags.environment,'LIVE');assert.equal(flags.noticeVersion,COUNTS_CONFIG.noticeVersion);
  assert.deepEqual(flags.allowedOrigins,['https://progettaimpianto.vivaiobice.com']);
  assert.equal(COUNTS_CONFIG.syncEnabled,true);assert.equal(COUNTS_CONFIG.submitEnabled,true);assert.equal(COUNTS_CONFIG.guestTransferEnabled,true);assert.equal(COUNTS_CONFIG.adminEnabled,false);
});

test('explicit server flags disable collection, transmission and email independently',()=>{
  const flags=config({COUNTS_SYNC_ENABLED:'false',COUNTS_SUBMIT_ENABLED:'false',COUNTS_EMAIL_ENABLED:'false',RESEND_API_KEY:'fixture-provider-key',QUOTE_EMAIL_FROM:'verified@example.com'});
  assert.equal(flags.sync,false);assert.equal(flags.submit,false);assert.equal(flags.emailEnabled,false);assert.equal(flags.admin,false);
  const missingSecrets=config({});assert.equal(missingSecrets.emailEnabled,false);
  const testFlags=config({COUNTS_ENVIRONMENT:'TEST',COUNTS_NOTICE_VERSION:'test-notice',COUNTS_ALLOWED_ORIGINS:'https://one.example, https://two.example'});
  assert.equal(testFlags.environment,'TEST');assert.equal(testFlags.noticeVersion,'test-notice');assert.deepEqual(testFlags.allowedOrigins,['https://one.example','https://two.example']);
});
