export function adviseProject(project = {}) {
  const advice = [];
  const rowSpacing = Number(project.rowSpacingM);
  const plantSpacing = Number(project.plantSpacingM);
  if (!Number.isFinite(rowSpacing) || rowSpacing <= 0 || !Number.isFinite(plantSpacing) || plantSpacing <= 0) {
    advice.push({ code:'spacing_incomplete', level:'info', message:'Completa le distanze tra filari e piante per ottenere una simulazione attendibile.' });
  }
  if (project.mechanizedHarvest) {
    const headland = Number(project.headlandWidthM);
    if (!Number.isFinite(headland) || headland <= 0) {
      advice.push({ code:'mechanization_headland_missing', level:'attention', message:'Vendemmia meccanica prevista: indica la capezzagna per poter verificare lo spazio di manovra rispetto alla macchina che verrà utilizzata.' });
    } else {
      advice.push({ code:'mechanization_verify_machine', level:'info', message:'Vendemmia meccanica prevista: verifica che sesto e capezzagne siano compatibili con ingombri e raggio di manovra della macchina scelta.' });
    }
  }
  return advice;
}
