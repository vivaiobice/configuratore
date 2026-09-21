import { loadDraft } from './storage.js';
import { calculateProject } from './project-calculator.js';
import { projectToPdfModel } from './pdf-model.js';
import { renderProposalHtml } from './report-template.js';

const state = loadDraft(globalThis.localStorage);
if (!state?.project) {
  document.body.innerHTML = '<main style="font-family:sans-serif;padding:32px"><h1>Progetto non trovato</h1><p>Apri il Configuratore e salva prima una bozza.</p><p><a href="./index.html">Torna al Configuratore</a></p></main>';
} else {
  const p = state.project;
  const metrics = calculateProject({ polygon:p.geometry, rowSpacingM:p.rowSpacingM, plantSpacingM:p.plantSpacingM, orientationDeg:p.orientationDeg, postSpacingM:p.postSpacingM, headlandWidthM:p.headlandWidthM });
  const model = projectToPdfModel({ state, metrics, publicCode: state.cloud?.publicCode ?? 'BOZZA-TEST', generatedAt: new Date().toISOString(), resumeUrl: state.cloud?.resumeUrl ?? null });
  document.open();
  document.write(renderProposalHtml(model));
  document.close();
}
