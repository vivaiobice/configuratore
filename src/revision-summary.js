const GROUPS = {
  geometry:['geometry'],
  exclusions:['exclusions'],
  layout:['rowSpacingM','plantSpacingM','orientationDeg','rowCurvePoints','maintainRowEquidistance','headlandWidthM','postSpacingM','mechanizedHarvest'],
  material:['grapeVariety','cloneSelection','rootstock','plantingYear'],
  identity:['label','locationLabel','municipality','province','region'],
  notes:['projectContextType','projectContextNote','materialRequestNote']
};

const ORDER = Object.keys(GROUPS);

function idOf(field, index = 0) {
  return String(field?.clientFieldId || field?.id || `field-${index + 1}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value ?? null;
}

function same(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function labelFor(categories) {
  const list = [...categories];
  if (!list.length) return 'Nessuna modifica rilevata';
  if (list.length === 1) return ({
    initial:'Prima versione salvata',
    geometry:'Perimetro e campi',
    exclusions:'Aree escluse e passaggi',
    layout:'Sesto d’impianto',
    material:'Materiale vegetale',
    identity:'Nomi e località',
    notes:'Informazioni e note'
  })[list[0]] || 'Aggiornamento progetto';
  if (list.length === 2 && list.includes('layout') && list.includes('material')) {
    return 'Sesto d’impianto e materiale vegetale';
  }
  return 'Aggiornamento progetto';
}

export function summarizeRevisionChanges(previous, current) {
  const currentFields = Array.isArray(current?.fields) ? current.fields : [];
  if (!previous) {
    return {
      categories:['initial'],
      fieldIds:currentFields.map(idOf),
      label:'Prima versione salvata'
    };
  }

  const categories = new Set();
  const fieldIds = new Set();
  if (!same(previous?.name, current?.name) || !same(previous?.campaignYear, current?.campaignYear)) {
    categories.add('identity');
  }

  const previousFields = Array.isArray(previous?.fields) ? previous.fields : [];
  const before = new Map(previousFields.map((field, index) => [idOf(field, index), field]));
  currentFields.forEach((field, index) => {
    const fieldId = idOf(field, index);
    const old = before.get(fieldId);
    if (!old) {
      categories.add('geometry');
      fieldIds.add(fieldId);
      return;
    }
    for (const [category, keys] of Object.entries(GROUPS)) {
      if (keys.some(key => !same(old?.[key], field?.[key]))) {
        categories.add(category);
        fieldIds.add(fieldId);
      }
    }
  });

  const currentIds = new Set(currentFields.map(idOf));
  previousFields.forEach((field, index) => {
    const fieldId = idOf(field, index);
    if (!currentIds.has(fieldId)) {
      categories.add('geometry');
      fieldIds.add(fieldId);
    }
  });

  const orderedCategories = ORDER.filter(category => categories.has(category));
  return {
    categories:orderedCategories,
    fieldIds:[...fieldIds],
    label:labelFor(orderedCategories)
  };
}
