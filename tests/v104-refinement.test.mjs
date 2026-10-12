import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('excluded area management retains its independent card inside the collapsible refinement',()=>{
 const {document}=parseHTML(html);
 const advanced=document.querySelector('details.advanced');
 const card=advanced.querySelector('.advanced-body > details[data-refinement="exclusions"]');assert.ok(card);
 const panel=card.querySelector('#refinement-exclusions-body > .exclusion-panel');assert.ok(panel);
 assert.equal(card.hasAttribute('name'),false,'exclusion controls remain independently collapsible');
 assert.match(card.querySelector('summary .refinement-title').textContent,/Gestione aree escluse/);
 assert.ok(panel.querySelector('#exclusion-list'));assert.equal(document.querySelectorAll('#exclusion-list').length,1);
 assert.equal(document.querySelectorAll('.exclusion-panel').length,1);
 const summary=advanced.querySelector('summary');
 assert.match(summary.textContent,/Affina il progetto/);
 assert.ok(summary.querySelector('.advanced-chevron'));
});
