import test from 'node:test';
import assert from 'node:assert/strict';
import { projectContactFromProfile, missingProjectProfileFields, assertSavedRevision } from '../src/project-profile.js';

test('signed-in project uses existing personal profile details and optional company', () => {
  const profile={kind:'user',firstName:' Marco ',lastName:' Obice ',phone:' 3331234567 ',email:' MARCO@EXAMPLE.IT ',companyName:''};
  assert.deepEqual(missingProjectProfileFields(profile),[]);
  assert.deepEqual(projectContactFromProfile(profile),{firstName:'Marco',lastName:'Obice',phone:'3331234567',email:'marco@example.it',companyName:''});
});

test('an account with only a display name must complete name and phone in Profile', () => {
  const profile={kind:'user',displayName:'Marco Obice',email:'marco@example.it',firstName:'',lastName:'',phone:''};
  assert.deepEqual(missingProjectProfileFields(profile),['Nome','Cognome','Telefono']);
  assert.throws(()=>projectContactFromProfile(profile),/Nome, Cognome, Telefono/);
});

test('invalid account email blocks project save without asking for a second email', () => {
  assert.deepEqual(missingProjectProfileFields({kind:'user',firstName:'M',lastName:'O',phone:'333',email:'wrong'}),['E-mail']);
});

test('a failed cloud revision cannot be shown as a successful project save', () => {
  assert.throws(()=>assertSavedRevision({state:'error',lastError:'timeout'}),/timeout/);
  assert.throws(()=>assertSavedRevision({state:'conflict'}),/conflitto/i);
  assert.doesNotThrow(()=>assertSavedRevision({state:'synced'}));
});
