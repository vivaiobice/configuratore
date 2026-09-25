import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildAddressSuggestionUrl, normalizeAddressSuggestions, provinceFromAddress, parseAddressParts, mountReportAddressAutocomplete } from '../src/report-address.js';

test('autocomplete requests Italian suggestions only after a useful query',()=>{
  assert.equal(buildAddressSuggestionUrl('Via'),null);
  const url=new URL(buildAddressSuggestionUrl('Via del Sole 9'));
  assert.equal(url.searchParams.get('countryCode'),'ITA');
  assert.equal(url.searchParams.get('text'),'Via del Sole 9');
});

test('suggestions are sanitized and a province code can be inferred without guessing',()=>{
  const values=normalizeAddressSuggestions({suggestions:[{text:'Via del Sole 9, Borgo (CN), ITA'}, {text:'Via <img> di Prova 1, Cuneo, ITA'}, {text:''}]});
  assert.deepEqual(values,['Via del Sole 9, Borgo (CN), ITA','Via <img> di Prova 1, Cuneo, ITA']);
  assert.equal(provinceFromAddress(values[0]),'CN');
  assert.equal(provinceFromAddress(values[1]),'');
});

test('suggested Italian address is split into street, postal code, city and recipient province',()=>{
  assert.deepEqual(parseAddressParts('Via del Sole 9, 12058 Borgo, Cuneo, ITA'),{address:'Via del Sole 9',addressCity:'Borgo',addressPostalCode:'12058',addressProvince:'Cuneo'});
  assert.deepEqual(parseAddressParts('Via di Prova 1, Borgo (CN), ITA'),{address:'Via di Prova 1',addressCity:'Borgo',addressPostalCode:'',addressProvince:'CN'});
});

test('selecting an address fills only recipient location and never the planting location',async()=>{
  const {document}=parseHTML('<form><input name="address"><input name="addressCity"><input name="addressPostalCode"><input name="addressProvince"><input name="plantLocation"><input name="province"></form><span id="report-address-suggestions" hidden></span>');
  const form=document.querySelector('form');
  // linkedom does not implement HTMLFormElement.elements like browsers do.
  Object.defineProperty(form,'elements',{value:{namedItem:(name)=>form.querySelector(`[name="${name}"]`)}});
  const changes=[];form.addEventListener('input',event=>changes.push([event.target.name,event.target.value]));
  const cleanup=mountReportAddressAutocomplete({documentRef:document,form,fetchImpl:async url=>({ok:true,json:async()=>new URL(url).pathname.endsWith('/suggest')?{suggestions:[{text:'Via di Prova 1, Borgo (CN), ITA',magicKey:'token'}]}:{candidates:[{address:'Via di Prova 1, Borgo (CN), ITA',attributes:{StAddr:'Via di Prova 1',City:'Borgo',Postal:'12058',Subregion:'Cuneo'}}]}})});
  const address=form.elements.namedItem('address');address.value='Via di Prova';address.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,340));
  document.querySelector('[role="option"]').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(changes.slice(-4),[['address','Via di Prova 1'],['addressCity','Borgo'],['addressPostalCode','12058'],['addressProvince','Cuneo']]);
  assert.equal(form.elements.namedItem('plantLocation').value,'');
  assert.equal(form.elements.namedItem('province').value,'');
  assert.equal(document.querySelector('#report-address-suggestions').hidden,true);
  cleanup();
});
