import { PRODUCTION_LOTS_2026 } from './production-lots-2026.js';

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function cloneKey(value) {
  return normalized(value).replace(/^i /, '');
}

export function resolveProductionLot({ variety, clone, rootstock } = {}) {
  if (!variety || !clone || !rootstock || [variety, clone, rootstock].some(value => normalized(value) === 'altro'))
    return { status:'unknown', lot:null, candidates:[] };
  const key=[normalized(variety), cloneKey(clone), normalized(rootstock)].join('|');
  const candidates=[...new Set(PRODUCTION_LOTS_2026.filter(([v,c,r]) =>
    [normalized(v),cloneKey(c),normalized(r)].join('|') === key).map(([, , , lot]) => lot))];
  if (candidates.length === 1) return { status:'unique', lot:candidates[0], candidates };
  if (candidates.length > 1) return { status:'ambiguous', lot:null, candidates };
  return { status:'unknown', lot:null, candidates:[] };
}
