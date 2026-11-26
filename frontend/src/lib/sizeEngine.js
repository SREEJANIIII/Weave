import { lookupBrandChart } from '../data/wishlistSample.js';
import { formatMeasure, formatRange } from './units.js';

const MEASURE_LABELS = {
  bust: 'Bust',
  waist: 'Waist',
  hips: 'Hips',
  shoulder: 'Shoulder',
  inseam: 'Inseam',
};

const CATEGORY_PRIMARY = {
  Dresses: ['bust', 'waist', 'hips'],
  Ethnic: ['bust', 'waist', 'hips'],
  Tops: ['bust', 'shoulder'],
  Trousers: ['waist', 'hips'],
  Outerwear: ['bust', 'shoulder'],
  Footwear: [],
};

const FIT_BIAS_CM = {
  slim: -1.0,
  regular: 0,
  oversized: 2.0,
};

function evaluateRow(key, userCm, range, fitBias) {
  const [min, max] = range;
  const adjusted = userCm + fitBias;
  let penalty = 0;
  let verdict = 'Ideal fit';
  let status = 'match';

  if (adjusted < min) {
    const diff = min - adjusted;
    penalty = diff * 0.85;
    verdict = diff <= 2 ? 'Slightly roomy' : 'Roomy';
    status = diff <= 2.5 ? 'ease' : 'loose';
  } else if (adjusted > max) {
    const diff = adjusted - max;
    // Too tight carries stronger penalty than roomy
    penalty = diff * 1.75;
    verdict = diff <= 1.8 ? 'Slightly snug' : 'Too tight';
    status = diff <= 1.8 ? 'snug' : 'tight';
  }

  return {
    key,
    label: MEASURE_LABELS[key] ?? key,
    userCm,
    minCm: min,
    maxCm: max,
    penalty,
    verdict,
    status,
  };
}

/**
 * Computes brand-specific size intelligence by comparing the user's private measurements
 * against a specific brand + category chart, accounting for preferred fit.
 */
export function recommendSize(profile, product) {
  const chart = lookupBrandChart(product?.brand, product?.category);
  const unit = profile?.unit || 'cm';

  if (!chart) {
    return {
      status: 'no_chart',
      brand: product?.brand || 'Unknown brand',
      category: product?.category || '',
      chart: null,
      recommendedSize: null,
      runnerUpSize: null,
      rows: [],
      explanation: `No size chart is currently available for ${product?.brand || 'this brand'} (${product?.category || 'this category'}) in the prototype.`,
      caveats: [
        'Weave does not guess a universal S/M/L conversion when a brand chart is missing.',
        'Check the brand listing directly or note your measurement notes on the card.',
      ],
    };
  }

  const chartKeys = Object.keys(chart.sizes[0]).filter((k) => k !== 'size');
  const primaryKeys = (CATEGORY_PRIMARY[product.category] ?? chartKeys).filter((k) => chartKeys.includes(k));
  const availableKeys = chartKeys.filter((k) => profile?.[k] !== null && profile?.[k] !== undefined && Number(profile[k]) > 0);
  const missingPrimary = primaryKeys.filter((k) => !availableKeys.includes(k));

  if (availableKeys.length === 0 || missingPrimary.length === primaryKeys.length) {
    return {
      status: 'incomplete_profile',
      brand: chart.brand,
      category: product.category,
      chart,
      recommendedSize: null,
      runnerUpSize: null,
      missingKeys: missingPrimary.map((k) => MEASURE_LABELS[k] ?? k),
      rows: [],
      explanation: `Add your ${missingPrimary.map((k) => (MEASURE_LABELS[k] ?? k).toLowerCase()).join(', ')} measurements in My Size Profile to match ${chart.brand}'s ${product.category.toLowerCase()} chart.`,
      caveats: ['Your size profile is incomplete for this garment category.'],
    };
  }

  const fit = profile?.fit || 'regular';
  const fitBias = FIT_BIAS_CM[fit] ?? 0;

  const scored = chart.sizes.map((sizeRow, idx) => {
    const evals = availableKeys.map((k) => evaluateRow(k, Number(profile[k]), sizeRow[k], fitBias));
    const totalPenalty = evals.reduce((sum, r) => sum + r.penalty, 0);
    return { size: sizeRow.size, idx, sizeRow, evals, totalPenalty };
  });

  scored.sort((a, b) => a.totalPenalty - b.totalPenalty || a.idx - b.idx);
  const best = scored[0];
  const second = scored[1] ?? null;

  // Detect split-size ambiguity (different primary keys point to different non-adjacent or borderline bands)
  const keyBestIndices = primaryKeys
    .filter((k) => availableKeys.includes(k))
    .map((k) => {
      const val = Number(profile[k]) + fitBias;
      let bestIdx = 0;
      let bestDist = Infinity;
      chart.sizes.forEach((row, idx) => {
        const [min, max] = row[k];
        const dist = val < min ? (min - val) * 0.85 : val > max ? (val - max) * 1.75 : 0;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      return { key: k, idx: bestIdx };
    });

  const idxSpread =
    keyBestIndices.length > 1
      ? Math.max(...keyBestIndices.map((x) => x.idx)) - Math.min(...keyBestIndices.map((x) => x.idx))
      : 0;
  const nearTie = second && Math.abs(second.totalPenalty - best.totalPenalty) < 1.2 && best.totalPenalty > 0.5;
  const tightOnBest = best.evals.some((r) => r.status === 'tight');
  const ambiguous = idxSpread >= 1 && (nearTie || tightOnBest);

  const caveats = [];
  if (missingPrimary.length > 0) {
    caveats.push(
      `Missing ${missingPrimary.map((k) => (MEASURE_LABELS[k] ?? k).toLowerCase()).join(' and ')} in your profile; matched using ${availableKeys.map((k) => (MEASURE_LABELS[k] ?? k).toLowerCase()).join(', ')}.`,
    );
  }
  if (ambiguous && second) {
    caveats.push(
      `Your measurements sit between ${best.size} and ${second.size} on ${chart.brand}'s chart (${keyBestIndices
        .map((x) => `${MEASURE_LABELS[x.key]} → ${chart.sizes[x.idx].size}`)
        .join(', ')}).`,
    );
  }

  const matchedText = best.evals
    .map(
      (r) =>
        `${r.label} (${formatMeasure(r.userCm, unit)} vs ${formatRange(r.minCm, r.maxCm, unit)}: ${r.verdict.toLowerCase()})`,
    )
    .join('; ');

  const fitNote =
    fit === 'slim'
      ? 'Adjusted slightly down for your slim fit preference.'
      : fit === 'oversized'
        ? 'Biased toward extra ease for your oversized fit preference.'
        : 'Matched for your regular fit preference.';

  const explanation = ambiguous
    ? `Closest match is ${best.size} (with ${second?.size} also close) for ${chart.brand}: ${matchedText}. ${fitNote}`
    : `${chart.brand} size ${best.size} fits best: ${matchedText}. ${fitNote}`;

  return {
    status: ambiguous ? 'ambiguous' : 'recommended',
    brand: chart.brand,
    category: product.category,
    chart,
    recommendedSize: best.size,
    runnerUpSize: ambiguous && second ? second.size : null,
    rows: best.evals.map((r) => ({
      ...r,
      userFormatted: formatMeasure(r.userCm, unit, profile?.masked),
      rangeFormatted: formatRange(r.minCm, r.maxCm, unit),
    })),
    explanation,
    caveats,
  };
}
