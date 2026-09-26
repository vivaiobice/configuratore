import {normalizeCadastralReferences} from './cadastral-references.js?v=54';
import {normalizeSoilProfile} from './soil.js?v=55';

const FIELD_KEYS = [
  'label','labelCustomized','geometry','sourceType','cadastralRefs','rowSpacingM','plantSpacingM','orientationDeg','orientationLocked','rowCurvePoints','maintainRowEquidistance',
  'locationLabel','municipality','province','region','headlandWidthM','postSpacingM','mechanizedHarvest','projectContextType',
  'projectContextNote','grapeVariety','rootstock','cloneSelection','plantHeightCm','materialRequestNote','exclusions'
  ,'plantingStatus','soil'
];

export function normalizePlantingStatus(value) {
  return value === 'planted' ? 'planted' : 'planned';
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `field-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
}

export function createDefaultField(id = newId(), index = 1, overrides = {}) {
  const label = String(overrides.label ?? `Campo ${index}`);
  const labelCustomized = Object.prototype.hasOwnProperty.call(overrides, 'labelCustomized')
    ? Boolean(overrides.labelCustomized)
    : !/^Campo\s+\d+$/i.test(label.trim());
  return {
    id,
    label,
    labelCustomized,
    geometry:null,
    sourceType:'manual',
    cadastralRefs:[],soil:null,
    rowSpacingM:2.5,
    plantSpacingM:0.9,
    orientationDeg:0,
    orientationLocked:false,
    rowCurvePoints:[],
    maintainRowEquidistance:true,
    locationLabel:'', municipality:'', province:'', region:'',
    headlandWidthM:null,
    postSpacingM:4.5,
    mechanizedHarvest:false,
    plantingStatus:'planned',
    projectContextType:'new_planting',
    projectContextNote:'',
    grapeVariety:'', rootstock:'', cloneSelection:'', plantHeightCm:40, materialRequestNote:'',
    exclusions:[],
    ...overrides,
    id,
    plantingStatus:normalizePlantingStatus(overrides.plantingStatus),
    cadastralRefs:normalizeCadastralReferences(overrides.cadastralRefs),
    soil:normalizeSoilProfile(overrides.soil)
  };
}

function legacyField(project, index = 1) {
  const overrides = {};
  for (const key of FIELD_KEYS) if (key in (project ?? {})) overrides[key] = project[key];
  if (!Number.isFinite(Number(overrides.postSpacingM)) || Number(overrides.postSpacingM) <= 0) overrides.postSpacingM = 4.5;
  if (!Array.isArray(overrides.exclusions)) overrides.exclusions = [];
  if (!Array.isArray(overrides.rowCurvePoints)) overrides.rowCurvePoints = [];
  return createDefaultField(project?.activeFieldId || 'field-1', index, overrides);
}

function mirrorField(project, field) {
  const next = { ...project, activeFieldId:field.id };
  for (const key of FIELD_KEYS) next[key] = field[key];
  return next;
}

export function ensureProjectFields(project = {}) {
  const fields = Array.isArray(project.fields) && project.fields.length
    ? project.fields.map((field, index) => createDefaultField(field.id || `field-${index+1}`, index+1, field))
    : [legacyField(project, 1)];
  const active = fields.find((field) => field.id === project.activeFieldId) || fields[0];
  return mirrorField({ ...project, fields }, active);
}

export function updateActiveFieldProject(project, patch = {}) {
  const base = ensureProjectFields(project);
  const fieldPatch = {};
  const projectPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (FIELD_KEYS.includes(key)) fieldPatch[key] = value;
    else projectPatch[key] = value;
  }
  const fields = base.fields.map((field) => field.id === base.activeFieldId ? { ...field, ...fieldPatch } : field);
  const active = fields.find((field) => field.id === base.activeFieldId) || fields[0];
  return mirrorField({ ...base, ...projectPatch, fields }, active);
}

export function updateProjectField(project, fieldId, patch = {}) {
  const base=ensureProjectFields(project);
  const targetId=String(fieldId??'');
  const fields=base.fields.map(field=>String(field.id)===targetId?{...field,...patch}:field);
  const active=fields.find(field=>field.id===base.activeFieldId)??fields[0];
  return mirrorField({...base,fields},active);
}

export function addProjectField(project) {
  const base = ensureProjectFields(project);
  const field = createDefaultField(newId(), base.fields.length + 1);
  return mirrorField({ ...base, fields:[...base.fields, field] }, field);
}

export function switchProjectField(project, fieldId) {
  const base = ensureProjectFields(project);
  const active = base.fields.find((field) => field.id === fieldId);
  return active ? mirrorField(base, active) : base;
}

export function removeActiveProjectField(project) {
  const base = ensureProjectFields(project);
  if (base.fields.length <= 1) return base;
  const fields = base.fields.filter((field) => field.id !== base.activeFieldId);
  return mirrorField({ ...base, fields }, fields[0]);
}

export function renameActiveProjectField(project, label) {
  return updateActiveFieldProject(project, { label:String(label ?? '').trim() || 'Campo', labelCustomized:true });
}

export function autoNameActiveProjectField(project) {
  const base = ensureProjectFields(project);
  const index = base.fields.findIndex((field) => field.id === base.activeFieldId);
  const active = base.fields[index] ?? base.fields[0];
  if (active.labelCustomized) return base;
  const parts = [active.grapeVariety, active.rootstock].map(value=>String(value ?? '').trim()).filter(Boolean);
  const label = parts.length ? parts.join(' · ') : `Campo ${Math.max(0,index)+1}`;
  return updateActiveFieldProject(base, { label, labelCustomized:false });
}

export function activeField(project) {
  const base = ensureProjectFields(project);
  return base.fields.find((field) => field.id === base.activeFieldId) || base.fields[0];
}

export { FIELD_KEYS };
