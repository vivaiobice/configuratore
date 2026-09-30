import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, classifyIdentifier, validateRegistration, profileView } from '../src/auth-model.js';

test('numeric username remains an alias string with leading zeroes',()=>{
  assert.deepEqual(classifyIdentifier(' 001234 '),{kind:'username',value:'001234'});
});

test('email always uses the email path',()=>{
  assert.deepEqual(classifyIdentifier(' Marco@Example.IT '),{kind:'email',value:'marco@example.it'});
});

test('username accepts only the approved 3-32 character alphabet',()=>{
  assert.equal(normalizeUsername('Marco.Obice_1'),'marco.obice_1');
  assert.throws(()=>normalizeUsername('ab'),/username/i);
  assert.throws(()=>normalizeUsername('nome@azienda'),/username/i);
});

test('registration validates display name, email, username and password',()=>{
  assert.deepEqual(validateRegistration({displayName:' Marco ',email:' M@EXAMPLE.IT ',username:'001234',password:'12345678'}),{
    displayName:'Marco',email:'m@example.it',username:'001234',password:'12345678'
  });
  assert.throws(()=>validateRegistration({displayName:'',email:'x',username:'ab',password:'1'}));
});

test('admin view depends on app metadata, never user metadata',()=>{
  const session={user:{id:'u1',email:'m@example.it',is_anonymous:false,app_metadata:{},user_metadata:{role:'admin'}}};
  assert.equal(profileView(session,{display_name:'Marco',username:'marco'}).isAdmin,false);
  const admin={user:{...session.user,app_metadata:{role:'admin'}}};
  assert.equal(profileView(admin,{display_name:'Marco',username:'marco'}).isAdmin,true);
});
