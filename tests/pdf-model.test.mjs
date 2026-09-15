import test from 'node:test';
import assert from 'node:assert/strict';
import { projectToPdfModel } from '../src/pdf-model.js';

test('projectToPdfModel builds the preliminary vineyard proposal without losing commercial quantities', () => {
  const state = {
    environment: 'TEST',
    contact: {
      companyName: 'Azienda Agricola Esempio', firstName: 'Mario', lastName: 'Rossi',
      phone: '3331234567', email: 'mario@example.it'
    },
    project: {
      geometry: [[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],
      locationLabel:'Santo Stefano Belbo, Cuneo, Piemonte', municipality:'Santo Stefano Belbo', province:'Cuneo', region:'Piemonte',
      rowSpacingM: 2.5, plantSpacingM: 1, orientationDeg: 45,
      headlandWidthM: 8, postSpacingM: 4.5, mechanizedHarvest: true,
      projectContextType: 'tender', projectContextNote: 'Bando regionale 2026',
      grapeVariety: 'Barbera N.', rootstock: '1103 P', cloneSelection: 'CVT 71'
    }
  };
  const metrics = {
    areaM2: 5240, perimeterM: 314, vertexCount: 5,
    rowCount: 23, rowLinearM: 2032, theoreticalPlants: 2096,
    simulatedPlants: 2032, commercialPlants25: 2050,
    headPosts: 46, intermediatePosts: 437, totalPosts: 483
  };

  const model = projectToPdfModel({
    state, metrics, publicCode: 'VO-AB12', generatedAt: '2026-09-15T08:00:00.000Z',
    resumeUrl: 'https://progetta.vivaiobice.com/p/secret'
  });

  assert.equal(model.title, "Proposta preliminare d’impianto");
  assert.equal(model.projectCode, 'VO-AB12');
  assert.equal(model.customer.companyName, 'Azienda Agricola Esempio');
  assert.equal(model.geometry.areaM2, 5240);
  assert.equal(model.location.municipality, 'Santo Stefano Belbo');
  assert.equal(model.layout.commercialPlants25, 2050);
  assert.equal(model.layout.totalPosts, 483);
  assert.equal(model.plantMaterial.grapeVariety, 'Barbera N.');
  assert.equal(model.context.label, 'Bando');
  assert.equal(model.resumeUrl, 'https://progetta.vivaiobice.com/p/secret');
  assert.match(model.disclaimer, /preliminare/i);
});

test('projectToPdfModel tolerates optional material and context fields', () => {
  const model = projectToPdfModel({
    state: { environment: 'TEST', project: { rowSpacingM: 2.5, plantSpacingM: 1, orientationDeg: 0 } },
    metrics: { areaM2: 1000, commercialPlants25: 400 },
    publicCode: 'VO-1', generatedAt: '2026-09-15T08:00:00.000Z'
  });
  assert.equal(model.customer, null);
  assert.equal(model.context, null);
  assert.equal(model.plantMaterial.grapeVariety, 'Da definire');
  assert.equal(model.plantMaterial.rootstock, 'Consigliami');
});

test('projectToPdfModel carries the generated vineyard rows into the technical drawing', () => {
  const rows = [{ start:[8,44], end:[8,44.01], lengthM:1110 }];
  const model = projectToPdfModel({ state:{ environment:'TEST', project:{ geometry:[[8,44],[8.01,44],[8,44.01],[8,44]], rowSpacingM:2.5, plantSpacingM:1 } }, metrics:{ areaM2:1000, rows }, publicCode:'VO-DRAW' });
  assert.deepEqual(model.geometry.rows, rows);
});
