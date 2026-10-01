import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteRequest, validateQuoteContact } from '../supabase/functions/_shared/quote-request.js';

const field={client_field_id:'field-1',label:'Vigna Nord',gross_area_m2:2500,simulated_plants:990,
  design_data:{grapeVariety:'Favorita B.',cloneSelection:'I - CVT 14',rootstock:'1103 Paulsen'}};

test('contact requires name phone email but allows empty company',()=>{
  assert.equal(validateQuoteContact({firstName:'Ada',lastName:'Rossi',phone:'3331234567',email:'ada@example.it',companyName:''}).companyName,'');
  assert.throws(()=>validateQuoteContact({firstName:'Ada',lastName:'',phone:'333',email:'x@y.it'}),/Cognome/);
});

test('quote message includes chosen field and unique lot without prices or other fields',()=>{
  const quote=buildQuoteRequest({project:{public_code:'VO-1234567',name:'Alba'},fields:[field,{...field,client_field_id:'field-2',label:'Non scelto'}],fieldIds:['field-1'],
    contact:{firstName:'Ada',lastName:'Rossi',phone:'3331234567',email:'ada@example.it',companyName:''}});
  assert.match(quote.text,/VO-1234567/);
  assert.match(quote.text,/Vigna Nord/);
  assert.match(quote.text,/Lotto univoco: R\d+\/26/);
  assert.doesNotMatch(quote.text,/Non scelto|€|prezzo|EUR/i);
  assert.deepEqual(quote.fieldIds,['field-1']);
});

test('missing or foreign field ID rejects the entire request',()=>{
  assert.throws(()=>buildQuoteRequest({project:{name:'Alba'},fields:[field],fieldIds:['field-2'],contact:{firstName:'Ada',lastName:'Rossi',phone:'333',email:'ada@example.it'}}),/campo/i);
});
