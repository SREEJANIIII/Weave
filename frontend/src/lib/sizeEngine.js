import { lookupBrandChart, normalizeCategoryLabel } from '../data/wishlistSample.js';
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
    category: normalizeCategoryLabel(product.category),
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

/**
 * Merges a live backend MCP `match_product_size` + `get_brand_size_chart` response with the
 * user's authorised profile so the modal shows backend confidence/disclaimers and full rows.
 */
export function mergeBackendSizeMatch(profile, product, apiPayload) {
  if (!apiPayload) return recommendSize(profile, product);
  const unit = profile?.unit || apiPayload.chart?.unit || 'cm';
  const catLabel = normalizeCategoryLabel(product?.category || apiPayload.chart?.category || '');

  if (apiPayload.status === 'unavailable' && !apiPayload.match) {
    const isNoProfile = /profile/i.test(apiPayload.reason || '');
    return {
      status: isNoProfile ? 'incomplete_profile' : 'no_chart',
      source: 'backend-mcp',
      brand: product?.brand || 'Unknown brand',
      category: catLabel,
      chart: null,
      recommendedSize: null,
      runnerUpSize: null,
      rows: [],
      explanation: apiPayload.reason || `No size recommendation is available for ${product?.brand || 'this brand'}.`,
      caveats: [
        isNoProfile
          ? 'Save measurements in My Size Profile so Weave can match against this brand chart.'
          : 'Weave never falls back to a universal S/M/L conversion when a chart is missing.',
      ],
    };
  }

  const m = apiPayload.match;
  const rawChart = apiPayload.chart;
  const normalizedChart = rawChart
    ? {
        brand: rawChart.brand,
        region: rawChart.region,
        note: rawChart.note || `Synthetic backend chart (${rawChart.region || 'IN'}, ${rawChart.unit}).`,
        category: normalizeCategoryLabel(rawChart.category),
        unit: rawChart.unit,
        sizes: (rawChart.sizes ?? []).map((row) => ({ size: row.size, ...(row.measurements ?? {}) })),
      }
    : lookupBrandChart(product?.brand, product?.category);

  if (!m || m.status !== 'matched') {
    return {
      status: 'no_chart',
      source: 'backend-mcp',
      brand: product?.brand || 'Unknown brand',
      category: catLabel,
      chart: normalizedChart,
      recommendedSize: null,
      runnerUpSize: null,
      rows: [],
      explanation: m?.reason || apiPayload.reason || 'Size recommendation unavailable.',
      caveats: ['Matched via backend Wishlist & sizes MCP server.'],
    };
  }

  const localFallback = normalizedChart ? recommendSize(profile, product) : null;
  const matchedRow = normalizedChart?.sizes?.find((r) => r.size === m.recommendation);
  const rows = matchedRow
    ? Object.keys(matchedRow)
        .filter((k) => k !== 'size')
        .map((k) => {
          const val = profile?.[k];
          const [minCm, maxCm] = matchedRow[k];
          const ev = val != null ? evaluateRow(k, Number(val), [minCm, maxCm], FIT_BIAS_CM[profile?.fit] ?? 0) : null;
          return {
            key: k,
            label: MEASURE_LABELS[k] ?? k,
            userCm: val ?? null,
            minCm,
            maxCm,
            verdict: ev ? ev.verdict : 'Not set',
            status: ev ? ev.status : 'ease',
            userFormatted: formatMeasure(val, unit, profile?.masked),
            rangeFormatted: formatRange(minCm, maxCm, unit),
          };
        })
    : (localFallback?.rows ?? []);

  const caveats = [];
  if (m.disclaimer) caveats.push(m.disclaimer);
  if (m.missingMeasurements?.length) {
    caveats.push(`Missing profile measurements for this chart: ${m.missingMeasurements.join(', ')}.`);
  }
  if (m.betweenSizes) {
    caveats.push('Your measurements sit close to two sizes on this brand chart.');
  }

  return {
    status: m.betweenSizes ? 'ambiguous' : 'recommended',
    source: 'backend-mcp',
    confidence: m.confidence,
    brand: m.chart?.brand ?? product?.brand,
    category: catLabel,
    chart: normalizedChart,
    recommendedSize: m.recommendation,
    runnerUpSize: m.betweenSizes && localFallback?.runnerUpSize && localFallback.runnerUpSize !== m.recommendation ? localFallback.runnerUpSize : null,
    rows,
    explanation: m.explanation || localFallback?.explanation || '',
    caveats,
  };
}
