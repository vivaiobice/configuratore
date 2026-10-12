import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {setToolButtonLabel} from '../src/desktop-ux.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('dynamic map tool labels update without removing the icon-only structure',()=>{
  const {document}=parseHTML('<button><span class="tool-icon">✥</span><span class="tool-label">Modifica punti</span></button>');
  const button=document.querySelector('button');
  setToolButtonLabel(button,'Fine modifica',{icon:'✓'});
  assert.equal(button.querySelector('.tool-icon').textContent,'✓');
  assert.equal(button.querySelector('.tool-label').textContent,'Fine modifica');
});

test('vertex removal button becomes Fine modifica while its mode is active',async()=>{
  const desktopUx=await import('../src/desktop-ux.js');
  assert.equal(typeof desktopUx.syncVertexRemovalButton,'function');
  const {document}=parseHTML('<button aria-pressed="false"><span class="tool-icon">−</span><span class="tool-label">Punto</span></button>');
  const button=document.querySelector('button');
  desktopUx.syncVertexRemovalButton(button,true);
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(button.querySelector('.tool-icon').textContent,'✓');
  assert.equal(button.querySelector('.tool-label').textContent,'Fine modifica');
  desktopUx.syncVertexRemovalButton(button,false);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(button.querySelector('.tool-label').textContent,'Punto');
});

test('desktop map tools keep labels fully hidden until the individual icon is expanded',()=>{
  const {document}=parseHTML(html);
  const rail=document.querySelector('.desktop-tool-rail');
  assert.ok(rail);
  assert.equal(Boolean(rail.querySelector('#map-search-button')),false);
  for(const button of rail.querySelectorAll('.tool-button')){
    assert.ok(button.querySelector('.tool-icon'),`${button.id} exposes a dedicated icon`);
    assert.ok(button.querySelector('.tool-label'),`${button.id} exposes a dedicated sliding label`);
  }
});

test('location search is an isolated map action in the upper right corner',()=>{
  const {document}=parseHTML(html);
  const search=document.querySelector('.map-search-control');
  assert.ok(search);
  assert.equal(Boolean(search?.parentElement?.classList.contains('desktop-tool-rail')),false);
  assert.ok(search.querySelector('#map-search-button'));
});

test('map field selector contains only the switcher without a visible heading',()=>{
  const {document}=parseHTML(html);
  const picker=document.querySelector('.map-field-picker');
  assert.ok(picker.querySelector('#map-field-select'));
  const visibleText=[...picker.childNodes]
    .filter(node=>node.nodeType===3)
    .map(node=>node.textContent.trim())
    .filter(Boolean);
  assert.deepEqual(visibleText,[]);
});

test('desktop project refinement retains eight independent cards with their original controls',()=>{
  const {document}=parseHTML(html);
  const advanced=document.querySelector('.advanced');
  assert.match(advanced.querySelector('summary').textContent,/Affina il progetto/);
  const cards=[...advanced.querySelectorAll('.advanced-body > details.advanced-card')];
  const expected=['portions','curve','exclusions','plant','material','information','cadastre','soil'];
  assert.deepEqual(cards.map(card=>card.dataset.refinement),expected);
  const controls={portions:['#row-portion-picker','#orientation','#orientation-output'],curve:['#curve-add-button','#curve-edit-button','#curve-reset-button','#curve-points-list'],exclusions:['#exclusion-list'],plant:['#headland','#post-spacing','#mechanized'],material:['#grape-variety','#clone-selection','#rootstock'],information:['#campaign-year-desktop','#project-context','#project-context-note'],cadastre:['#cadastral-reference-editor','#cadastral-auto-refresh'],soil:['#soil-layer-select','#soil-analyze','#soil-profile']};
  for(const card of cards){
    assert.ok(card.querySelector('summary .refinement-title'),card.dataset.refinement);
    assert.equal(card.hasAttribute('name'),false,'cards do not form an exclusive accordion');
    for(const selector of controls[card.dataset.refinement]){assert.ok(card.querySelector(selector),`${card.dataset.refinement} retains ${selector}`);assert.equal(document.querySelectorAll(selector).length,1,`${selector} remains a single original control`);}
  }
});

test('V39 desktop styles standardize material inputs and compact map controls',()=>{
  const css=fs.readFileSync(new URL('../desktop-v39.css',import.meta.url),'utf8');
  const {document}=parseHTML(`<style>${css}</style>`);
  const collect=items=>[...items].flatMap(item=>item.cssRules ? collect(item.cssRules) : [item]);
  const rules=collect(document.querySelector('style').sheet.cssRules);
  const rule=selector=>rules.find(item=>item.selectorText===selector)?.style;

  const label=rule('.desktop-tool-rail .tool-label');
  assert.equal(label['max-width'],'0');
  assert.equal(label.opacity,'0');
  const expanded=rule('.desktop-tool-rail .tool-button:is(:hover,:focus-visible) .tool-label');
  assert.notEqual(expanded['max-width'],'0');
  assert.equal(expanded.opacity,'1');

  const search=rule('.map-search-control');
  assert.equal(search.top,'18px');
  assert.equal(search.right,'18px');

  const material=rule('.advanced-material select');
  assert.equal(material.height,'42px');
  assert.equal(material['font-size'],'12px');
  const mechanized=rule('.advanced-mechanization .check-row');
  assert.equal(mechanized['font-size'],'11px');
});

test('mobile tool buttons retain spacing between the shared icon and label markup',()=>{
  const css=fs.readFileSync(new URL('../desktop-v39.css',import.meta.url),'utf8');
  const {document}=parseHTML(`<style>${css}</style>`);
  const collect=items=>[...items].flatMap(item=>item.cssRules ? collect(item.cssRules) : [item]);
  const rules=collect(document.querySelector('style').sheet.cssRules);
  const mobileIcon=rules.find(item=>item.selectorText==='.tool-button .tool-icon')?.style;
  assert.equal(mobileIcon?.['margin-right'],'4px');
});

test('release shell retains the V39 desktop polish stylesheet',()=>{
  assert.match(html,/desktop-v39\.css\?v=39/);
});
