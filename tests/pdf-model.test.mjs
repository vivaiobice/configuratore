import test from 'node:test';
import assert from 'node:assert/strict';
import { projectToPdfModel, buildProjectReportModel, ReportSelectionError } from '../src/pdf-model.js';

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

test('multi-field report selects fields and aggregates the existing calculated metrics', () => {
  const state={environment:'TEST',project:{
    localProjectName:'Impianto Langhe',campaignYear:2026,activeFieldId:'f1',
    fields:[
      {id:'f1',label:'Barbera',geometry:[[8,44],[8.01,44],[8,44.01],[8,44]],rowSpacingM:2.5,plantSpacingM:0.9,grapeVariety:'Barbera',rootstock:'1103 P',exclusions:[]},
      {id:'f2',label:'Nebbiolo',geometry:[[8.02,44],[8.03,44],[8.02,44.01],[8.02,44]],rowSpacingM:2.7,plantSpacingM:1,grapeVariety:'Nebbiolo',rootstock:'SO4',exclusions:[]},
      {id:'f3',label:'Incompleto',geometry:null,exclusions:[]}
    ]
  }};
  const metrics={
    f1:{areaM2:2000,netAreaM2:1800,perimeterM:190,rowCount:20,rowLinearM:750,simulatedPlants:820,commercialPlants25:825,headPosts:40,intermediatePosts:130,totalPosts:170,rows:[]},
    f2:{areaM2:2500,netAreaM2:2200,perimeterM:220,rowCount:24,rowLinearM:940,simulatedPlants:1032,commercialPlants25:1050,headPosts:48,intermediatePosts:150,totalPosts:198,rows:[]}
  };
  const model=buildProjectReportModel({
    state,selectedFieldIds:['f2','f1'],getMetrics:field=>metrics[field.id],
    report:{id:'r1',revisionNumber:4,generatedAt:'2026-09-24T10:00:00Z',projectCode:'VO-12'},
    recipient:{companyName:'Azienda Esempio'}
  });
  assert.equal(model.title,'Studio preliminare ed esemplificativo di impianto viticolo');
  assert.deepEqual(model.fields.map(field=>field.id),['f2','f1']);
  assert.equal(model.summary.commercialPlants,1875);
  assert.equal(model.summary.calculatedPlants,1852);
  assert.equal(model.summary.grossAreaM2,4500);
  assert.equal(model.summary.totalPosts,368);
  assert.equal(model.recipient.companyName,'Azienda Esempio');
});

test('multi-field report warns about unknown or invalid selected fields and rejects an empty result', () => {
  const state={project:{fields:[{id:'f1',label:'Incompleto',geometry:null,exclusions:[]}]}};
  assert.throws(()=>buildProjectReportModel({state,selectedFieldIds:['missing'],getMetrics:()=>({})}),ReportSelectionError);
  const model=buildProjectReportModel({state,selectedFieldIds:['f1'],getMetrics:()=>({})});
  assert.equal(model.fields.length,1);
  assert.equal(model.fields[0].geometryValid,false);
  assert.match(model.warnings[0],/perimetro/i);
});

test('multi-field report preserves zero values, project defaults and truly absent planting year', () => {
  const field={id:'f1',label:'Campo',geometry:[[8,44],[8.01,44],[8,44.01],[8,44]],orientationDeg:0,headlandWidthM:0,exclusions:[]};
  const model=buildProjectReportModel({state:{project:{fields:[field]}},selectedFieldIds:['f1'],getMetrics:()=>({areaM2:0,commercialPlants25:0})});
  assert.equal(model.fields[0].layout.orientationDeg,0);
  assert.equal(model.fields[0].layout.headlandWidthM,0);
  assert.equal(model.fields[0].layout.plantSpacingM,0.9);
  assert.equal(model.fields[0].plantingYear,null);
  assert.equal(model.fields[0].plantMaterial.plantHeightCm,40);
});

test('report carries a per-field requested barbatella height',()=>{
  const geometry=[[8,44],[8.01,44],[8,44.01],[8,44]];
  const state={project:{fields:[{id:'f1',geometry,plantHeightCm:60}]}};
  const model=buildProjectReportModel({state,selectedFieldIds:['f1']});
  assert.equal(model.fields[0].plantMaterial.plantHeightCm,60);
});

test('report carries the lifecycle status of every field',()=>{
  const geometry=[[8,44],[8.01,44],[8,44.01],[8,44]];
  const state={project:{fields:[{id:'f1',geometry,plantingStatus:'planted'}]}};
  const model=buildProjectReportModel({state,selectedFieldIds:['f1']});
  assert.equal(model.fields[0].plantingStatus,'planted');
});
