import { suggestRowOrientation } from './geometry.js';

export function createInitialState() {
  return {
    environment: 'TEST',
    map: { base: 'satellite', cadastralVisible: false },
    project: {
      geometry: null,
      sourceType: 'manual',
      cadastralRefs: [],
      rowSpacingM: 2.5,
      plantSpacingM: 0.9,
      orientationDeg: 0,
      orientationLocked: false,
      locationLabel: '',
      municipality: '',
      province: '',
      region: '',
      headlandWidthM: null,
      postSpacingM: null,
      mechanizedHarvest: false,
      projectContextType: '',
      projectContextNote: '',
      grapeVariety: '',
      rootstock: '',
      cloneSelection: ''
    }
  };
}

export function mergeProjectState(current, patch) {
  return {
    ...current,
    project: {
      ...current.project,
      ...patch
    }
  };
}


export function applyGeometryWithSuggestedOrientation(project, geometry) {
  const next = { ...project, geometry };
  if (!geometry || project?.orientationLocked) return next;
  return {
    ...next,
    orientationDeg: suggestRowOrientation(geometry, Number(project?.rowSpacingM) || 2.5)
  };
}
