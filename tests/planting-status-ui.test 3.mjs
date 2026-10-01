import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const report=fs.readFileSync(new URL('../src/report-template.js',import.meta.url),'utf8');
const shared=fs.readFileSync(new URL('../src/shared-project.js',import.meta.url),'utf8');

test('desktop and mobile parameters expose field lifecycle beside campaign year',()=>{
  assert.match(html,/id="planting-status"/);
  assert.match(html,/id="planting-status-desktop"/);
  assert.match(html,/value="planned"[^>]*>Da realizzare/);
  assert.match(html,/value="planted"[^>]*>Impianto realizzato/);
  assert.match(app,/plantingStatus:event\.target\.value/);
});

test('print and shared documents describe lifecycle status',()=>{
  assert.match(report,/Stato impianto/);
  assert.match(shared,/Stato impianto/);
});
