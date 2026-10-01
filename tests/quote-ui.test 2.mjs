import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createQuoteUI} from '../src/quote-ui.js';

test('quote dialog names the actual project, scopes fields and preloads the signed-in profile',()=>{
  const {document}=parseHTML('<html><body></body></html>');
  const field=(id,label)=>({id,label,geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44]]});
  const ui=createQuoteUI({document,getProfile:()=>({firstName:'Ada',email:'ada@example.it'}),onSubmit:async()=>{}});
  ui.dialog.showModal=()=>{};
  const form=ui.dialog.querySelector('form');
  form.reset=()=>{};
  Object.defineProperty(form,'elements',{value:{namedItem:name=>form.querySelector(`[name="${name}"]`)}});
  const projectItem={name:'Vigneto A',project:{fields:[field('a','Alfa'),field('b','Beta')]}};
  ui.open({projectItem,fieldId:'b'});
  assert.equal(ui.dialog.querySelector('[data-project]').textContent,'Progetto: Vigneto A');
  assert.deepEqual([...ui.dialog.querySelectorAll('[data-field]')].filter(input=>input.checked).map(input=>input.value),['b']);
  assert.equal(form.querySelector('[name="firstName"]').value,'Ada');
  assert.throws(()=>ui.open({projectItem,fieldId:'unrelated'}),/non appartiene/);
});
