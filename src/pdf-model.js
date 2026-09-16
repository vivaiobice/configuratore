import { isOtherMaterialSelection } from './plant-catalog.js';

const CONTEXT_LABELS = {
  application: 'Domanda',
  tender: 'Bando',
  contribution: 'Contributo / finanziamento',
  other: 'Altro'
};

export function projectToPdfModel({ state, metrics = {}, publicCode = '', generatedAt = new Date().toISOString(), resumeUrl = null }) {
  const project = state?.project ?? {};
  const contact = state?.contact ?? null;
  const contextType = project.projectContextType || '';

  return {
    title: 'Proposta preliminare d’impianto',
    brand: 'Vivai Obice',
    environment: state?.environment ?? 'TEST',
    projectCode: publicCode,
    generatedAt,
    location: (project.locationLabel || project.municipality || project.province || project.region) ? {
      label: project.locationLabel || '',
      municipality: project.municipality || '',
      province: project.province || '',
      region: project.region || ''
    } : null,
    customer: contact ? {
      companyName: contact.companyName || '',
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      phone: contact.phone || '',
      email: contact.email || ''
    } : null,
    context: contextType ? {
      type: contextType,
      label: CONTEXT_LABELS[contextType] ?? 'Altro',
      note: project.projectContextNote || ''
    } : null,
    geometry: {
      areaM2: metrics.areaM2 ?? 0,
      netAreaM2: metrics.netAreaM2 ?? metrics.areaM2 ?? 0,
      headlandAreaM2: metrics.headlandAreaM2 ?? 0,
      perimeterM: metrics.perimeterM ?? 0,
      vertexCount: metrics.vertexCount ?? 0,
      polygon: project.geometry ?? null,
      sourceType: project.sourceType ?? 'manual',
      rows: Array.isArray(metrics.rows) ? metrics.rows : []
    },
    layout: {
      rowSpacingM: project.rowSpacingM ?? null,
      plantSpacingM: project.plantSpacingM ?? null,
      orientationDeg: project.orientationDeg ?? 0,
      headlandWidthM: project.headlandWidthM ?? null,
      postSpacingM: project.postSpacingM ?? null,
      mechanizedHarvest: Boolean(project.mechanizedHarvest),
      rowCount: metrics.rowCount ?? 0,
      rowLinearM: metrics.rowLinearM ?? 0,
      theoreticalPlants: metrics.theoreticalPlants ?? 0,
      simulatedPlants: metrics.simulatedPlants ?? 0,
      commercialPlants25: metrics.commercialPlants25 ?? 0,
      headPosts: metrics.headPosts ?? 0,
      intermediatePosts: metrics.intermediatePosts ?? 0,
      totalPosts: metrics.totalPosts ?? 0
    },
    plantMaterial: {
      grapeVariety: project.grapeVariety || 'Da definire',
      rootstock: project.rootstock || 'Consigliami',
      cloneSelection: project.cloneSelection || null,
      requestNote: project.materialRequestNote || '',
      requiresVerification: [project.grapeVariety, project.rootstock, project.cloneSelection].some(isOtherMaterialSelection) || Boolean(project.materialRequestNote),
      quantity: metrics.commercialPlants25 ?? 0
    },
    resumeUrl,
    disclaimer: 'Simulazione preliminare e indicativa. Non sostituisce elaborati catastali, rilievi o progettazioni tecniche professionali quando richiesti.',
    cta: 'Richiedi preventivo a Vivai Obice'
  };
}
