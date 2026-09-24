import { ensureProjectFields } from './fields.js';

export const DISCLAIMER_VERSION = 'VO-DISC-2026-01';

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());
}

function validGeometry(value) {
  if (!Array.isArray(value) || value.length < 4) return false;
  const points = value.filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
  if (points.length !== value.length) return false;
  const first = points[0]; const last = points.at(-1);
  return Number(first[0]) === Number(last[0]) && Number(first[1]) === Number(last[1]);
}

function firstValue(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) ?? '';
}

function preferredEmail(contact, profile) {
  const candidates = [contact?.email, profile?.email, profile?.authEmail];
  return candidates.map((value) => String(value ?? '').trim()).find(validEmail) ?? '';
}

function recipientFrom(contact = {}, profile = {}) {
  return {
    companyName: firstValue(contact.companyName, profile.companyName),
    firstName: firstValue(contact.firstName, profile.firstName, profile.displayName),
    lastName: firstValue(contact.lastName, profile.lastName),
    email: preferredEmail(contact, profile),
    phone: firstValue(contact.phone, profile.phone),
    address: firstValue(contact.address, profile.address),
    plantLocation: firstValue(contact.plantLocation),
    reference: firstValue(contact.reference)
  };
}

function validationErrors(model) {
  const errors = [];
  if (!model.selectedFieldIds.length) errors.push('Seleziona almeno un campo con perimetro valido.');
  if (model.recipient.email && !validEmail(model.recipient.email)) errors.push('L’indirizzo e-mail del destinatario non è valido.');
  return errors;
}

function finalized(model) {
  return { ...model, validationErrors: validationErrors(model) };
}

export function createReportPreflight({ state, profile = {}, contact = null } = {}) {
  const project = ensureProjectFields(state?.project ?? {});
  const fieldOptions = (project.fields ?? []).map((field, index) => ({
    id: String(field.id ?? field.clientFieldId ?? `field-${index + 1}`),
    label: String(field.label || `Campo ${index + 1}`),
    valid: validGeometry(field.geometry)
  }));
  const selectedFieldIds = fieldOptions.filter((field) => field.valid).map((field) => field.id);
  return finalized({
    fieldOptions,
    selectedFieldIds,
    selectionMode: selectedFieldIds.length === fieldOptions.length && fieldOptions.length ? 'all' : 'custom',
    singleField: fieldOptions.length === 1,
    recipient: recipientFrom(contact ?? state?.contact ?? {}, profile),
    disclaimerAccepted: false,
    disclaimerVersion: DISCLAIMER_VERSION,
    validationErrors: []
  });
}

export function updateReportPreflight(model, action = {}) {
  if (!model || typeof model !== 'object') throw new TypeError('Preflight documento non valido.');
  if (action.type === 'disclaimer/set') return finalized({ ...model, disclaimerAccepted: action.accepted === true });
  if (action.type === 'selection/set') {
    const allowed = new Set(model.fieldOptions.filter((field) => field.valid).map((field) => field.id));
    const selectedFieldIds = [...new Set((action.fieldIds ?? []).map(String).filter((id) => allowed.has(id)))];
    return finalized({
      ...model,
      selectedFieldIds,
      selectionMode: selectedFieldIds.length === allowed.size && allowed.size ? 'all' : 'custom',
      disclaimerAccepted: false
    });
  }
  if (action.type === 'recipient/update') {
    if (!Object.hasOwn(model.recipient, action.field)) return model;
    return finalized({
      ...model,
      recipient: { ...model.recipient, [action.field]: String(action.value ?? '') },
      disclaimerAccepted: false
    });
  }
  return model;
}

export function canIssueReport(model) {
  return Boolean(model)
    && model.selectedFieldIds.length > 0
    && model.disclaimerAccepted === true
    && model.disclaimerVersion === DISCLAIMER_VERSION
    && model.validationErrors.length === 0;
}
