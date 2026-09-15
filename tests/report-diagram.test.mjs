import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProjectDiagramSvg } from '../src/report-diagram.js';

test('report diagram renders perimeter and simulated rows into a self-contained SVG', () => {
  const svg = renderProjectDiagramSvg({
    polygon:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],
    rows:[{start:[8.002,44],end:[8.002,44.01],lengthM:100},{start:[8.006,44],end:[8.006,44.01],lengthM:100}]
  });
  assert.match(svg, /^<svg/);
  assert.match(svg, /class="parcel"/);
  assert.equal((svg.match(/class="vine-row"/g) ?? []).length, 2);
  assert.match(svg, /N/);
});

test('report diagram returns a neutral placeholder when no valid polygon exists', () => {
  const svg = renderProjectDiagramSvg({ polygon:null, rows:[] });
  assert.match(svg, /Perimetro non disponibile/);
});
