import assert from 'node:assert/strict';
import { matchSize, convert } from '../lib/size-matcher.js';

const chart = { brand: 'Test', category: 'dress', region: 'IN', unit: 'cm', synthetic: true, requiredMeasurements: ['bust', 'waist'], sizes: [
  { size: 'S', measurements: { bust: [80, 86], waist: [60, 68] } },
  { size: 'M', measurements: { bust: [86, 92], waist: [68, 76] } },
] };
const profile = (measurements, unit = 'cm') => ({ unit, measurements });

assert.equal(matchSize(profile({ bust: 84, waist: 66 }), chart).recommendation, 'S');
assert.equal(matchSize(profile({ bust: 90, waist: 74 }), chart).recommendation, 'M');
assert.equal(matchSize(profile({ bust: 86, waist: 68 }), chart).status, 'matched');
assert.ok(matchSize(profile({ bust: 85 }), chart).missingMeasurements.includes('waist'));
assert.equal(matchSize(profile({ bust: 100, waist: 90 }), chart).confidence, 'medium');
assert.equal(matchSize(profile({ bust: 84, waist: 66 }), chart, { category: 'saree' }).status, 'category_mismatch');
assert.equal(matchSize(profile({ bust: 84, waist: 66 }), null).status, 'unavailable');
assert.ok(Math.abs(convert(1, 'inches', 'cm') - 2.54) < 0.001);
assert.equal(matchSize(profile({ bust: 84 / 2.54, waist: 66 / 2.54 }, 'inches'), chart).recommendation, 'S');
console.log('  ✓ deterministic size matcher checks passed');
