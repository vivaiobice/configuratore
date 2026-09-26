import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {calculateManualPlants} from '../src/project-calculator.js';
import {
  createDesktopFieldSelectors,
  createDesktopMapSearchAction,
  createDesktopQuickCalculator
} from '../src/desktop-ux.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('desktop field selectors render the same fields and emit one selection',()=>{
  const {document}=parseHTML('<select id="field-select"></select><select id="map-field-select"></select>');
  const selected=[];
  const controls=createDesktopFieldSelectors({document,onSelect:id=>selected.push(id)});
  controls.mount();
  controls.render([{id:'a',label:'Moscato'},{id:'b',label:'Barbera'}],'b');
  for(const selector of ['#field-select','#map-field-select']){
    const select=document.querySelector(selector);
    assert.deepEqual([...select.options].map(option=>option.textContent),['Moscato','Barbera']);
    assert.equal(select.value,'b');
  }
  const mapSelect=document.querySelector('#map-field-select');
  mapSelect.options[0].selected=true;
  mapSelect.dispatchEvent(new document.defaultView.Event('change'));
  assert.deepEqual(selected,['a']);
});

test('desktop map search icon slides open and focuses a search box on the map',()=>{
  const {document}=parseHTML('<div class="map-search-control"><button id="map-search-button" aria-expanded="false"></button><form id="map-search-form" hidden><input id="map-search-input"></form></div>');
  let focused=false,selected=false;
  const input=document.querySelector('#map-search-input');
  input.focus=()=>focused=true;input.select=()=>selected=true;
  createDesktopMapSearchAction({document}).mount();
  document.querySelector('#map-search-button').click();
  assert.equal(document.querySelector('#map-search-form').hidden,false);
  assert.equal(document.querySelector('#map-search-button').getAttribute('aria-expanded'),'true');
  assert.equal(focused,true);assert.equal(selected,true);
  document.querySelector('#map-search-button').click();
  assert.equal(document.querySelector('#map-search-form').hidden,true);
});

test('desktop quick calculator uses its own spacing values',()=>{
  const {document}=parseHTML(`
    <button id="quick-calculator-trigger"></button>
    <dialog id="quick-calculator-dialog"></dialog>
    <button id="quick-calculator-close"></button>
    <input id="manual-area" value="5000">
    <input id="manual-plant-spacing" value="1">
    <input id="manual-row-spacing" value="2.5">
    <strong id="manual-theoretical"></strong>
    <strong id="manual-commercial"></strong>`);
  const controller=createDesktopQuickCalculator({document,calculate:calculateManualPlants});
  controller.mount();controller.render();
  assert.equal(document.querySelector('#manual-theoretical').textContent,'2.000');
  assert.equal(document.querySelector('#manual-commercial').textContent,'2.000');
  document.querySelector('#manual-plant-spacing').value='0.8';
  document.querySelector('#manual-plant-spacing').dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(document.querySelector('#manual-theoretical').textContent,'2.500');
  assert.equal(document.querySelector('#manual-commercial').textContent,'2.500');
});

test('desktop map exposes a compact ordered tool rail and a field picker',()=>{
  const {document}=parseHTML(html);
  assert.ok(document.querySelector('.topbar > .topbar-actions > .map-command-bar > #public-project-trigger'));
  assert.equal(document.querySelector('.app-shell > .map-command-bar'),null);
  assert.ok(document.querySelector('.app-shell > .map-wrap'));
  assert.equal(document.querySelector('.map-wrap > #public-project-trigger'),null);
  const visual=document.querySelector('[data-map-tools="visual"]');
  assert.ok(visual.contains(document.querySelector('[data-base="satellite"]')));
  const rail=document.querySelector('.desktop-tool-rail');
  const groups=[...rail.children].map(node=>node.dataset.mapTools);
  assert.deepEqual(groups,['editor','positioning','exclusions']);
  assert.ok(document.querySelector('.map-field-picker #map-field-select'));
  assert.ok(document.querySelector('.map-search-control #map-search-form #map-search-input'));
  assert.equal(document.querySelector('.field-select-label').firstChild.textContent.trim(),'Campi disponibili');
});

test('project lookup shares the desktop top menu row without reducing map height',()=>{
  const css=fs.readFileSync(new URL('../v48-fixes.css',import.meta.url),'utf8');
  assert.match(css,/\.topbar>\.topbar-actions>\.map-command-bar/);
  assert.doesNotMatch(css,/\.app-shell\s*\{[^}]*grid-template-rows/i);
  assert.doesNotMatch(css,/\.app-shell>\.map-wrap\s*\{[^}]*grid-row/i);
});

test('desktop advanced controls expose the requested orderable groups without removing the mobile year control',()=>{
  const {document}=parseHTML(html);
  assert.ok(document.querySelector('.field-manager #campaign-year'));
  assert.ok(document.querySelector('.advanced-body #campaign-year-desktop'));
  assert.ok(document.querySelector('.advanced-mechanization #mechanized-advice'));
  assert.ok(document.querySelector('.advanced-material #grape-variety'));
  assert.match(document.querySelector('.advanced-context').textContent,/Inquadramento dell’impianto/);
  assert.ok(document.querySelector('.advanced-notes #project-context-note'));
  assert.equal(document.querySelector('.exclusion-heading strong').textContent.trim(),'Gestione aree escluse');
});

test('quick calculator markup provides independent planting spacing inputs',()=>{
  const {document}=parseHTML(html);
  const calculator=document.querySelector('#quick-calculator-dialog');
  assert.ok(calculator.querySelector('#manual-area'));
  assert.ok(calculator.querySelector('#manual-plant-spacing'));
  assert.ok(calculator.querySelector('#manual-row-spacing'));
  assert.equal(calculator.querySelector('#plant-spacing'),null);
  assert.equal(calculator.querySelector('#row-spacing'),null);
});

test('desktop V38 stylesheet positions the compact rail and separates rotation from zoom and compass',()=>{
  const cssPath=new URL('../desktop-v38.css',import.meta.url);
  assert.equal(fs.existsSync(cssPath),true);
  const css=fs.readFileSync(cssPath,'utf8');
  const {document}=parseHTML(`<style>${css}</style>`);
  const rules=[...document.querySelector('style').sheet.cssRules];
  const rule=selector=>rules.find(item=>item.selectorText===selector)?.style;
  const rail=rule('.desktop-tool-rail');
  assert.equal(rail.right,'18px');assert.equal(rail['flex-direction'],'column');
  const button=rule('.desktop-tool-rail .tool-button');
  assert.equal(button.width,'44px');assert.equal(button.overflow,'hidden');
  assert.equal(rule('.desktop-tool-rail .tool-button:is(:hover,:focus-visible)').width,'158px');
  const rotation=rule('.desktop-map-tools .map-rotation');
  const navigation=rule('.map-wrap > .maplibregl-ctrl-bottom-right');
  assert.equal(rotation.bottom,'10px');assert.equal(rotation.right,'52px');
  assert.equal(navigation.bottom,'0');assert.equal(navigation.right,'0');
});

test('desktop V38 stylesheet orders advanced groups and keeps desktop-only controls out of mobile',()=>{
  const css=fs.readFileSync(new URL('../desktop-v38.css',import.meta.url),'utf8');
  const {document}=parseHTML(`<style>${css}</style>`);
  const rules=[...document.querySelector('style').sheet.cssRules];
  const rule=selector=>rules.find(item=>item.selectorText===selector)?.style;
  assert.equal(rule('.advanced-spacing').order,'1');
  assert.equal(rule('.advanced-mechanization').order,'2');
  assert.equal(rule('.advanced-material').order,'3');
  assert.equal(rule('.advanced-context').order,'4');
  assert.equal(rule('.advanced-notes').order,'5');
  assert.equal(rule('.desktop-campaign-year').order,'6');
  assert.equal(rule('.mobile-campaign-year').display,'none');
  assert.match(css,/@media\(max-width:800px\),\(max-width:1100px\) and \(pointer:coarse\)/);
  assert.match(css,/\.map-field-picker,\.desktop-campaign-year\{display:none!important\}/);
});

test('V38 stylesheet remains loaded beneath the current release overrides',()=>{
  const mobileUi=fs.readFileSync(new URL('../src/mobile-ui.js',import.meta.url),'utf8');
  assert.match(html,/desktop-v38\.css\?v=38/);
  assert.match(html,/AMBIENTE TEST · V55/);
  assert.match(mobileUi,/AMBIENTE TEST · V55\.2/);
});
