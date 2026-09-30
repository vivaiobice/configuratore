import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateManualPlants } from '../src/project-calculator.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('manual area calculator derives theoretical vines and commercial quantity rounded to 25', () => {
  const result = calculateManualPlants({ areaM2: 5120, rowSpacingM: 2.5, plantSpacingM: 0.9 });
  assert.equal(result.theoreticalPlants, 2276);
  assert.equal(result.commercialPlants25, 2300);
});

test('manual area calculator fails closed for missing or invalid values', () => {
  assert.deepEqual(calculateManualPlants({ areaM2: 0, rowSpacingM: 2.5, plantSpacingM: 1 }), { theoreticalPlants: 0, commercialPlants25: 0 });
  assert.deepEqual(calculateManualPlants({ areaM2: 1000, rowSpacingM: 0, plantSpacingM: 1 }), { theoreticalPlants: 0, commercialPlants25: 0 });
  assert.deepEqual(calculateManualPlants({ areaM2: 1000, rowSpacingM: 2.5, plantSpacingM: null }), { theoreticalPlants: 0, commercialPlants25: 0 });
});

test('public UI exposes a manual surface calculator independent from polygon drawing', () => {
  assert.match(html, /id="manual-area"/);
  assert.match(html, /id="manual-theoretical"/);
  assert.match(html, /id="manual-commercial"/);
  assert.match(html, /Calcolo rapido senza mappa/);
  assert.match(app, /calculateManualPlants/);
  assert.match(app, /renderManualAreaCalculation/);
});
