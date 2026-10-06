import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newReportShareToken, hashReportShareToken, buildSharedReportUrl, parseSharedReportUrl
} from '../src/report-share.js';

test('share tokens contain 256 bits and URLs round trip without leaking into the path', async () => {
  const token = newReportShareToken(() => Uint8Array.from({length:32},(_,i)=>i));
  assert.equal(token,'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  assert.equal((await hashReportShareToken(token)).length,64);
  const reportId='00000000-0000-4000-8000-000000000123';
  const url=buildSharedReportUrl('https://vivaiobice.github.io/configuratore/index.html',reportId,token);
  assert.equal(new URL(url).pathname,'/configuratore/shared-project.html');
  assert.deepEqual(parseSharedReportUrl(url),{reportId,token});
});

test('shared report parser rejects malformed ids and tokens', () => {
  assert.equal(parseSharedReportUrl('https://example.test/shared-project.html?report=no&token=abc'),null);
  assert.throws(()=>buildSharedReportUrl('https://example.test/','not-a-uuid','a'.repeat(64)),/report/i);
  assert.throws(()=>buildSharedReportUrl('https://example.test/','00000000-0000-4000-8000-000000000123','weak'),/token/i);
});
