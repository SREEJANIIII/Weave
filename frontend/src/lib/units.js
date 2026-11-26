export const CM_PER_INCH = 2.54;

export const round1 = (n) => Math.round(n * 10) / 10;

export function cmToUnit(cm, unit = 'cm') {
  if (cm === null || cm === undefined || cm === '' || Number.isNaN(Number(cm))) return '';
  const v = Number(cm);
  return unit === 'in' ? round1(v / CM_PER_INCH) : round1(v);
}

export function unitToCm(val, unit = 'cm') {
  if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return null;
  const v = Number(val);
  if (v <= 0) return null;
  return unit === 'in' ? round1(v * CM_PER_INCH) : round1(v);
}

export function formatMeasure(cm, unit = 'cm', masked = false) {
  if (cm === null || cm === undefined || Number.isNaN(Number(cm))) return 'Not set';
  if (masked) return '••';
  const v = cmToUnit(cm, unit);
  return `${v} ${unit}`;
}

export function formatRange(minCm, maxCm, unit = 'cm') {
  if (minCm === undefined || maxCm === undefined) return '—';
  const a = cmToUnit(minCm, unit);
  const b = cmToUnit(maxCm, unit);
  return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`;
}

