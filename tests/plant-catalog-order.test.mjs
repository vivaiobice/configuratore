import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listVarieties,listClonesForVariety,listRootstocksForSelection} from '../src/plant-catalog.js';

const sorted=(values)=>[...values].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base',numeric:true}));
test('varieties are alphabetic, leaving placeholder and Other to the select shell',()=>{
  const values=listVarieties();
  assert.deepEqual(values,sorted(values));
});
test('clones and rootstocks are alphabetic for selected grape varieties',()=>{
  assert.deepEqual(listClonesForVariety('Moscato Bianco B.'),sorted(listClonesForVariety('Moscato Bianco B.')));
  assert.deepEqual(listRootstocksForSelection('Moscato Bianco B.',''),sorted(listRootstocksForSelection('Moscato Bianco B.','')));
});

test('main entry cache-busts the catalog and profile module used on the deployed site',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/from '\.\/plant-catalog\.js\?v=45'/);
  assert.match(app,/from '\.\/profile-ui\.js\?v=49'/);
});
