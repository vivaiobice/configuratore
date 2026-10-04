import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {calculateProject} from '../src/project-calculator.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/v126-legacy-compatibility.json',import.meta.url),'utf8'));

test('unapplied terrain preserves complete 1.2.6 results for 144 independent legacy fields',()=>{
  assert.equal(fixture.cases.length,144);
  assert.equal(fixture.baseline,'7b1e0165e559cbd66864af1751dfc6fa7b2617a5');
  for(const entry of fixture.cases){
    const result=calculateProject(entry.input);
    const hash=createHash('sha256').update(JSON.stringify(result)).digest('hex');
    assert.equal(hash,entry.resultHash,entry.name+' changed geometry, ownership or quantities');
  }
});
