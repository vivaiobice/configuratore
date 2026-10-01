import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductionLot } from '../supabase/functions/_shared/lot-lookup.js';

test('a unique combination carries its production lot without a price', () => {
  const result = resolveProductionLot({ variety:'Favorita B.', clone:'I - CVT 14', rootstock:'1103 Paulsen' });
  assert.equal(result.status, 'unique');
  assert.match(result.lot, /^R\d+(?:-[A-Z]+)?\/26$/);
  assert.equal(JSON.stringify(result).includes('price'), false);
});

test('different production lots for one combination remain unassigned', () => {
  const result = resolveProductionLot({ variety:'Moscato Bianco B.', clone:'Standard', rootstock:'775 Paulsen' });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.lot, null);
  assert.ok(result.candidates.length > 1);
});

test('unknown material never receives a guessed lot', () => {
  assert.deepEqual(resolveProductionLot({ variety:'Altro', clone:'Standard', rootstock:'775 Paulsen' }),
    { status:'unknown', lot:null, candidates:[] });
});
