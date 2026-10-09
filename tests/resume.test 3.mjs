import test from 'node:test';
import assert from 'node:assert/strict';
import { newResumeToken, sha256Hex, buildResumeUrl, parseResumeParams } from '../src/resume.js';

test('resume token is high entropy and non sequential', () => {
  const a = newResumeToken();
  const b = newResumeToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{40,}$/);
});

test('resume token is stored only as SHA-256 hash', async () => {
  const hash = await sha256Hex('test-token');
  assert.equal(hash, '4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e');
});

test('resume URL contains only project code and secret token', () => {
  const url = buildResumeUrl('https://progetta.vivaiobice.com/', 'ABC123', 'secret_token');
  assert.equal(url, 'https://progetta.vivaiobice.com/?project=ABC123&token=secret_token');
  assert.deepEqual(parseResumeParams(url), { publicCode:'ABC123', token:'secret_token' });
});
