import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('desktop sidebar follows field, terrain, spacing and orientation order',()=>{
 const {document}=parseHTML(html);const panel=document.querySelector('.panel-scroll');
 const manager=panel.querySelector(':scope>.field-manager');
 const terrain=panel.querySelector(':scope>.step[data-step="1"]');
 const spacing=panel.querySelector(':scope>.step[data-step="2"]');
 assert.ok(manager&&terrain&&spacing);
 const children=[...panel.children];
 assert.ok(children.indexOf(manager)<children.indexOf(terrain));
 assert.ok(children.indexOf(terrain)<children.indexOf(spacing));
 assert.ok(spacing.querySelector('.range-field'));
 assert.equal(panel.querySelector('.manual-calculator'),null);
});

test('field manager exposes clear actions and a validated planting year',()=>{
 const {document}=parseHTML(html);const manager=document.querySelector('.field-manager');
 assert.equal(document.querySelector('#add-field-button').textContent.trim(),'Aggiungi campo');
 assert.equal(document.querySelector('#remove-field-button').textContent.trim(),'Elimina campo');
 const year=document.querySelector('#campaign-year');
 assert.ok(year&&manager.contains(year));assert.equal(year.getAttribute('min'),'2000');assert.equal(year.getAttribute('max'),'2100');
});

test('desktop quick calculator opens from the top bar instead of occupying the sidebar',async()=>{
 const {document}=parseHTML(html);
 const {createDesktopQuickCalculator}=await import('../src/desktop-ux.js');
 createDesktopQuickCalculator({document}).mount();
 const trigger=document.querySelector('#quick-calculator-trigger');
 const dialog=document.querySelector('#quick-calculator-dialog');
 assert.ok(trigger&&dialog);
 assert.ok(dialog.querySelector('.manual-calculator'));
 trigger.click();assert.equal(dialog.hasAttribute('open'),true);
 dialog.querySelector('#quick-calculator-close').click();assert.equal(dialog.hasAttribute('open'),false);
});

test('desktop save feedback exposes saving, success, dirty and error states',async()=>{
 const {document}=parseHTML('<button id="save">Salva il progetto</button>');
 const {createSaveFeedback}=await import('../src/desktop-ux.js');
 const feedback=createSaveFeedback(document.querySelector('#save'));
 feedback.saving();assert.equal(document.querySelector('#save').textContent,'Salvataggio…');
 feedback.saved();assert.equal(document.querySelector('#save').textContent,'✓ Progetto salvato');
 feedback.dirty();assert.equal(document.querySelector('#save').textContent,'Salva il progetto');
 feedback.error();assert.equal(document.querySelector('#save').textContent,'Salvataggio non riuscito');
});
