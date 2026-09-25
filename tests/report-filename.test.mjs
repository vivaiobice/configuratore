import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportPdfFilename } from '../src/report-filename.js';

test('PDF filename uses public project digits and recipient name',()=>{
  assert.equal(buildReportPdfFilename({code:'VO-1234567',recipient:{firstName:'Mario',lastName:'Rossi'}}),'Progetto_VO1234567_MarioRossi.pdf');
});

test('PDF filename sanitizes user text and falls back to company when name is absent',()=>{
  assert.equal(buildReportPdfFilename({code:'VO-7654321',recipient:{companyName:'Vigneti / Collina & Figli'}}),'Progetto_VO7654321_VignetiCollinaFigli.pdf');
  assert.equal(buildReportPdfFilename({code:'VO-1111111',recipient:{firstName:'Èva<script>',lastName:'Test'}}),'Progetto_VO1111111_EvaTest.pdf');
});
