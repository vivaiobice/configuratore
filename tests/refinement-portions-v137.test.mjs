import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {rowPortionEditorState,rowPortionDesignPatch,renderRowPortionPicker} from '../src/row-portion-editor.js';
import {calculateProject} from '../src/project-calculator.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/l-shaped-portions.json',import.meta.url),'utf8'));
const project={...fixture,geometry:fixture.polygon,rowPortions:[]};

test('neutral portion selection exposes no local editing target and preserves the actual design',()=>{
 const before=structuredClone(project),initial=rowPortionEditorState(project),selected=rowPortionEditorState(project,initial.portions[1].id);
 const neutral=rowPortionEditorState(project,'__none__');
 assert.equal(neutral.enabled,true);assert.equal(neutral.active,null);assert.equal(neutral.selectionEmpty,true);
 assert.deepEqual(neutral.points,[]);assert.deepEqual(neutral.portions,selected.portions);
 assert.deepEqual(rowPortionDesignPatch(project,'__none__',{orientationDeg:15,rowCurvePoints:[]}),{});
 assert.deepEqual(project,before);assert.deepEqual(calculateProject({...project,polygon:project.geometry}).rows,calculateProject({...before,polygon:before.geometry}).rows);
 assert.equal(rowPortionEditorState(project,initial.portions[1].id).active.id,initial.portions[1].id);
});

test('native clear button is accessible and distinct from selecting a portion',()=>{
 const {document}=parseHTML('<section id="picker"></section>'),state=rowPortionEditorState(project,'__none__');let selected;
 renderRowPortionPicker(document.querySelector('#picker'),state,id=>selected=id);
 const clear=document.querySelector('[data-portion-clear]');assert.ok(clear);assert.equal(clear.getAttribute('aria-label'),'Mostra tutte le porzioni');
 assert.equal(clear.getAttribute('aria-pressed'),'true');assert.equal(document.querySelectorAll('button:not([data-portion-clear])[aria-pressed="true"]').length,0);
 clear.click();assert.equal(selected,'__none__');
 document.querySelector('button:not([data-portion-clear])').click();assert.equal(selected,state.portions[0].id);
});

test('the eight refinement cards retain their real controls, ordered and independently collapsible',async()=>{
 const {document}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 const cards=[...document.querySelectorAll('.advanced-body > details.advanced-card')];
 assert.deepEqual(cards.map(c=>c.dataset.refinement),['portions','curve','exclusions','plant','material','information','cadastre','soil']);
 const controls=['#row-portion-picker','#curve-add-button','#exclusion-list','#headland','#grape-variety','#project-context','#cadastral-reference-editor','#soil-profile'];
 cards.forEach((card,i)=>{assert.ok(card.querySelector(controls[i]));assert.ok(card.querySelector('summary svg'));assert.equal(card.hasAttribute('name'),false);});
 for(const control of controls)assert.equal(document.querySelectorAll(control).length,1);
 assert.equal(document.querySelector('.step[data-step="2"] .row-curve-controls'),null);
});
