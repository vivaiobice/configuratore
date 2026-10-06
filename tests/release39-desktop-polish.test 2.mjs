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

test('advanced desktop project refinement is split into three dedicated cards',()=>{
  const {document}=parseHTML(html);
  const advanced=document.querySelector('.advanced');
  assert.match(advanced.querySelector('summary').textContent,/Affina il progetto/);
  const cards=[...advanced.querySelectorAll('.advanced-card')];
  assert.deepEqual(cards.map(card=>card.dataset.refinement),['plant','material','information']);
  assert.ok(cards[0].querySelector('#headland'));
  assert.ok(cards[0].querySelector('#post-spacing'));
  assert.ok(cards[0].querySelector('#mechanized'));
  assert.ok(cards[1].querySelector('#grape-variety'));
  assert.ok(cards[1].querySelector('#clone-selection'));
  assert.ok(cards[1].querySelector('#rootstock'));
  assert.ok(cards[2].querySelector('#campaign-year-desktop'));
  assert.ok(cards[2].querySelector('#project-context'));
  assert.ok(cards[2].querySelector('#project-context-note'));
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
