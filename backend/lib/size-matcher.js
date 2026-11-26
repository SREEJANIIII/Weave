// Deterministic, measurement-based size matching. Charts are data, not opinions:
// callers must provide a brand/category/region-specific chart before matching.

const UNIT_FACTORS = { cm: 1, inches: 2.54 };
const MEASUREMENTS = ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height'];

export function convert(value, from, to) {
  if (!Number.isFinite(value) || !UNIT_FACTORS[from] || !UNIT_FACTORS[to]) throw new Error('Unsupported measurement unit. Use cm or inches.');
  return value * UNIT_FACTORS[from] / UNIT_FACTORS[to];
}

function normaliseMeasurements(profile, unit = 'cm') {
  return Object.fromEntries(MEASUREMENTS.filter((key) => profile?.measurements?.[key] != null).map((key) => [key, convert(Number(profile.measurements[key]), profile.unit, unit)]));
}

/**
 * Match a profile against rows shaped as { size, measurements: { bust: [min,max] } }.
 * A result is a recommendation, never a fit guarantee.
 */
export function matchSize(profile, chart, { category } = {}) {
  if (!profile || !chart) return { status: 'unavailable', reason: 'A size chart is unavailable.' };
  if (category && chart.category.toLowerCase() !== category.toLowerCase()) return { status: 'category_mismatch', reason: `The chart is for ${chart.category}, not ${category}.` };
  const measurements = normaliseMeasurements(profile, chart.unit);
  const missing = (chart.requiredMeasurements ?? Object.keys(chart.sizes[0]?.measurements ?? {})).filter((key) => measurements[key] == null);
  if (!chart.sizes?.length) return { status: 'unavailable', reason: 'The size chart has no size rows.' };
  const scored = chart.sizes.map((row) => {
    const matched = [];
    const outside = [];
    let distance = 0;
    for (const [key, range] of Object.entries(row.measurements)) {
      if (measurements[key] == null) continue;
      const value = measurements[key];
      const [min, max] = range;
      if (value >= min && value <= max) matched.push(key);
      else {
        const gap = value < min ? min - value : value - max;
        outside.push({ measurement: key, value, range: [min, max], gap: Number(gap.toFixed(2)) });
        distance += gap;
      }
    }
    return { row, matched, outside, distance };
  }).sort((a, b) => a.distance - b.distance || b.matched.length - a.matched.length);
  const best = scored[0];
  const second = scored[1];
  const betweenSizes = Boolean(second && best.distance > 0 && Math.abs(second.distance - best.distance) < 2);
  const confidence = missing.length ? 'low' : best.distance === 0 ? (betweenSizes ? 'medium' : 'high') : betweenSizes ? 'low' : 'medium';
  return {
    status: 'matched', recommendation: best.row.size, chart: { brand: chart.brand, category: chart.category, region: chart.region, unit: chart.unit, synthetic: chart.synthetic === true },
    confidence, betweenSizes, missingMeasurements: missing,
    matchedMeasurements: best.matched, outsideMeasurements: best.outside,
    explanation: best.distance === 0 ? 'All supplied measurements fall within this chart row.' : 'This is the closest row by total measurement distance; some supplied measurements fall outside it.',
    disclaimer: 'Measurement-based recommendation only; garment fit is not guaranteed.',
  };
}

