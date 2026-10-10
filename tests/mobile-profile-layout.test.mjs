import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mobileUserProfileHtml,readMobileProfileForm} from '../src/mobile-profile.js';

test('the compact profile groups identity and account actions without losing editable fields',()=>{
  const {document}=parseHTML(`<body>${mobileUserProfileHtml({
    displayName:'Marco <Obice>',username:'marco.obice',email:'marco@example.it',
    firstName:'Marco',lastName:'Obice',companyName:'Vivai Obice SSA',address:'Via lunga 123',
    postalCode:'12058',city:'Santo Stefano Belbo',province:'CN',vatNumber:'IT12345678901',phone:'+39 333 1234567'
  })}</body>`);
  const head=document.querySelector('.mobile-profile-head');
  assert.ok(head);
  assert.equal(head.querySelector('h2').textContent,'Marco <Obice>');
  assert.equal(head.querySelector('p').textContent,'@marco.obice');
  assert.equal(document.querySelector('Obice'),null);
  const actions=document.querySelector('.mobile-profile-account-actions');
  assert.ok(actions.querySelector('#mobile-public-project'));
  assert.ok(actions.querySelector('[data-mobile-profile-action="reset-password"]'));
  assert.ok(actions.querySelector('[data-mobile-profile-action="logout"]'));
  const form=document.querySelector('.mobile-profile-edit');
  assert.equal(form.querySelectorAll('input').length,10);
  assert.equal(form.querySelectorAll('input[readonly]').length,1);
  assert.equal(form.querySelector('[name="province"]').getAttribute('maxlength'),'2');
  form.querySelector('[name="city"]').value='  Santo Stefano Belbo  ';
  assert.deepEqual(readMobileProfileForm(form),{
    firstName:'Marco',lastName:'Obice',companyName:'Vivai Obice SSA',address:'Via lunga 123',
    postalCode:'12058',city:'Santo Stefano Belbo',province:'CN',vatNumber:'IT12345678901',phone:'+39 333 1234567'
  });
});
