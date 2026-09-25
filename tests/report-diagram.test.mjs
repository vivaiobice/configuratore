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

test('report diagram renders satellite overlay and clean technical modes from the same geometry', () => {
  const input={
    polygon:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],
    rows:[{start:[8.005,44],end:[8.005,44.01],lengthM:100}],
    exclusions:[
      {type:'area',geometry:[[8.002,44.002],[8.004,44.002],[8.004,44.004],[8.002,44.002]]},
      {type:'linear',geometry:[[8.006,44],[8.007,44],[8.007,44.01],[8.006,44]]}
    ]
  };
  const overlay=renderProjectDiagramSvg({...input,mode:'overlay'});
  const technical=renderProjectDiagramSvg({...input,mode:'technical'});
  assert.match(overlay,/class="map-overlay"/);
  assert.doesNotMatch(overlay,/fill="#eef2ed"/);
  assert.match(overlay,/\.map-overlay \.parcel\{fill:none;/);
  assert.match(technical,/\.technical-diagram \.parcel\{fill:#dce8d7;/);
  assert.match(technical,/class="technical-background"/);
  assert.match(technical,/class="excluded-area"/);
  assert.match(technical,/class="linear-passage"/);
  assert.equal((technical.match(/class="side-label"/g)??[]).length,4);
});

test('report diagram preserves a curved row as a polyline', () => {
  const coordinates=[[8.002,44],[8.004,44.006],[8.006,44.003],[8.008,44.01]];
  const svg=renderProjectDiagramSvg({
    polygon:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],
    rows:[{start:coordinates[0],end:coordinates.at(-1),coordinates,lengthM:1400}]
  });
  assert.match(svg,/<polyline class="vine-row" points="[^"]+"/);
  assert.doesNotMatch(svg,/<line class="vine-row"/);
});
