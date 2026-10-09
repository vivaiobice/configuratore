import test from 'node:test';
import assert from 'node:assert/strict';

const access=await import('../src/public-project-access.js').catch(()=>({}));

test('human project codes normalize only the exact VO plus seven digit format',()=>{
  assert.equal(typeof access.normalizePublicProjectCode,'function');
  assert.equal(access.normalizePublicProjectCode(' vo-1234567 '),'VO-1234567');
  assert.equal(access.normalizePublicProjectCode('1234567'),'VO-1234567');
  assert.equal(access.normalizePublicProjectCode('VO1234567'),'VO-1234567');
  assert.equal(access.normalizePublicProjectCode('VO-123'),'');
  assert.equal(access.normalizePublicProjectCode('VO-12345678'),'');
});

test('public project URL contains only the human code',()=>{
  assert.equal(access.buildPublicProjectUrl('https://example.test/configuratore/index.html','vo-1234567'),'https://example.test/configuratore/shared-project.html?code=VO-1234567');
});

test('public project URL parser rejects malformed codes',()=>{
  assert.equal(access.parsePublicProjectCodeUrl('https://example.test/shared-project.html?code=VO-7654321'),'VO-7654321');
  assert.equal(access.parsePublicProjectCodeUrl('https://example.test/shared-project.html?code=VO-1'),null);
});
