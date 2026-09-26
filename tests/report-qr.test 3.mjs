import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReportQrSvg } from '../src/report-qr.js';

const sharedUrl='https://vivaiobice.github.io/configuratore/shared-project.html?report=11111111-1111-4111-8111-111111111111&token='+'ab'.repeat(32);

test('report QR is a local accessible SVG with a four-module quiet zone',()=>{
  const svg=renderReportQrSvg(sharedUrl,{size:168,margin:4});
  assert.match(svg,/^<svg /);
  assert.match(svg,/role="img" aria-label="QR code del progetto"/);
  assert.match(svg,/viewBox="0 0 \d+ \d+"/);
  assert.match(svg,/class="qr-background"/);
  assert.match(svg,/class="qr-modules"/);
  assert.doesNotMatch(svg,new RegExp(sharedUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(svg,/<(?:script|image|foreignObject|a)\b/i);
});

test('report QR output is deterministic and uses integer module coordinates',()=>{
  const first=renderReportQrSvg(sharedUrl);
  const second=renderReportQrSvg(sharedUrl);
  assert.equal(first,second);
  const path=first.match(/class="qr-modules" d="([^"]+)"/)?.[1]??'';
  assert.match(path,/^M\d+ \d+h1v1h-1z/);
  assert.doesNotMatch(path,/\./);
});

test('report QR validates size, margin and destination security',()=>{
  assert.throws(()=>renderReportQrSvg(''),/link/i);
  assert.throws(()=>renderReportQrSvg('javascript:alert(1)'),/HTTPS/i);
  assert.throws(()=>renderReportQrSvg('http://example.com/report'),/HTTPS/i);
  assert.doesNotThrow(()=>renderReportQrSvg('http://localhost:8080/shared-project.html?x=1'));
  assert.doesNotThrow(()=>renderReportQrSvg('http://127.0.0.1:8080/shared-project.html?x=1'));
  assert.throws(()=>renderReportQrSvg(sharedUrl,{size:0}),/dimensione/i);
  assert.throws(()=>renderReportQrSvg(sharedUrl,{margin:-1}),/margine/i);
});
