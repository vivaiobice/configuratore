import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('excluded area management sits inside the collapsible refinement',()=>{
 const {document}=parseHTML(html);
 const advanced=document.querySelector('details.advanced');
 assert.ok(advanced.querySelector('.advanced-body > .exclusion-panel'));
 assert.equal(document.querySelectorAll('.exclusion-panel').length,1);
 const summary=advanced.querySelector('summary');
 assert.match(summary.textContent,/Affina il progetto/);
 assert.ok(summary.querySelector('.advanced-chevron'));
});
