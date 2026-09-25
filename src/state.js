import { suggestRowOrientation } from './geometry.js?v=45';
import { ensureProjectFields, updateActiveFieldProject } from './fields.js?v=51';

export function createInitialState() {
  const state = {
    environment: 'TEST',
    map: { base: 'satellite', cadastralVisible: false },
    project: {
      campaignYear: new Date().getFullYear(),
      geometry: null,
      sourceType: 'manual',
      cadastralRefs: [],
      rowSpacingM: 2.5,
      plantSpacingM: 0.9,
      orientationDeg: 0,
      orientationLocked: false,
      rowCurvePoints: [],
      maintainRowEquidistance: true,
      locationLabel: '',
      municipality: '',
      province: '',
      region: '',
      headlandWidthM: null,
      postSpacingM: 4.5,
      exclusions: [],
      mechanizedHarvest: false,
      projectContextType: 'new_planting',
      projectContextNote: '',
      grapeVariety: '',
      rootstock: '',
      cloneSelection: '',
      plantHeightCm:40
    }
  };
  state.project = ensureProjectFields(state.project);
  return state;
}

export function mergeProjectState(current, patch) {
  return { ...current, project:updateActiveFieldProject(current.project, patch) };
}


export function applyGeometryWithSuggestedOrientation(project, geometry) {
  const next = { ...project, geometry };
  if (!geometry || project?.orientationLocked) return next;
  return {
    ...next,
    orientationDeg: suggestRowOrientation(geometry, Number(project?.rowSpacingM) || 2.5)
  };
}
