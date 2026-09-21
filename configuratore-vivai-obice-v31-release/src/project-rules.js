export function normalizeHeadlandForMechanization(value, mechanizedHarvest) {
  if (value === null || value === undefined || value === '') return mechanizedHarvest ? 6 : null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return mechanizedHarvest ? 6 : null;
  return mechanizedHarvest ? Math.max(6, numeric) : numeric;
}
