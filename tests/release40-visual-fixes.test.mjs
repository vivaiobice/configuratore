import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const map=fs.readFileSync(new URL('../src/map.js',import.meta.url),'utf8');
const mobileUi=fs.readFileSync(new URL('../src/mobile-ui.js',import.meta.url),'utf8');
const mobileCss=fs.readFileSync(new URL('../mobile.css',import.meta.url),'utf8');

test('desktop sidebar headings no longer expose decorative step numbers',()=>{
  const {document}=parseHTML(html);
  const headings=[...document.querySelectorAll('.step-heading')];
  assert.ok(headings.length>=2);
  assert.equal(headings.some(heading=>heading.querySelector(':scope>span')),false);
});

test('commercial vines are the primary quantity and calculated vines are secondary',()=>{
  const {document}=parseHTML(html);
  const summary=document.querySelector('.summary-primary');
  assert.equal(summary.querySelector(':scope>span').textContent.trim(),'Quantità commerciale');
  assert.equal(summary.querySelector(':scope>strong')?.id,'summary-commercial');
  assert.equal(summary.querySelector('small #summary-plants')?.id,'summary-plants');
  assert.match(app,/setText\('#summary-commercial',\s*commercialPlantsText\)/);
  assert.match(app,/setText\('#summary-plants',\s*plantsText\)/);
});

test('mobile field summaries use the same commercial-first hierarchy',()=>{
  assert.match(mobileUi,/class="mobile-vines-summary"/);
  assert.match(mobileUi,/class="mobile-commercial-vines"/);
  assert.match(mobileUi,/class="mobile-calculated-vines"/);
  assert.match(mobileCss,/\.mobile-commercial-vines\s*\{[^}]*font-size:/s);
});

test('mobile GPS and field-centering controls restore compact circular icon layout',()=>{
  assert.match(mobileCss,/#mobile-app \.mobile-home-tools #map-gps-button\s*\{[^}]*flex-direction:column/s);
  assert.match(mobileCss,/#mobile-app \.mobile-home-tools #center-field-button \.tool-label\s*\{[^}]*display:none/s);
  assert.match(mobileCss,/#mobile-app \.mobile-home-tools :is\(#map-gps-button,#center-field-button\) \.tool-icon\s*\{[^}]*margin:0/s);
});

test('desktop active perimeter uses the same light subordinate treatment as mobile',()=>{
  assert.match(map,/PROJECT_GEOMETRY_LINE_ID[\s\S]*?'line-color':'#f5f6ed'[\s\S]*?'line-width':1\.1[\s\S]*?'line-opacity':0\.62/);
});

test('V40 visual fixes remain present in the V41 release shell',()=>{
  assert.match(html,/AMBIENTE TEST · V52.1/);
  assert.match(html,/mobile\.css\?v=45/);
  assert.match(html,/desktop-v40\.css\?v=40/);
  assert.match(html,/manifest\.webmanifest\?v=45/);
  assert.match(html,/src\/app\.js\?v=52.1/);
  assert.match(mobileUi,/AMBIENTE TEST · V45/);
});
