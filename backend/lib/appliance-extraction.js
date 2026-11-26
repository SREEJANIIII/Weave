// Extract appliance facts from prepared document text or verified page images.
import { FIELD_DEFS, DEADLINE_TYPES, normaliseExtraction } from './appliance-fields.js';
import { extractSource } from './document-pipeline.js';
import { extractFromImages, extractFromText } from './nvidia-vision.js';

function buildPrompt(kind, source) {
  const fields = Object.entries(FIELD_DEFS)
    .map(([key, def]) => `"${key}" (${def.label}, ${def.type})`)
    .join(', ');
  const types = Object.entries(DEADLINE_TYPES)
    .map(([key, label]) => `"${key}" (${label})`)
    .join(', ');
  return `You read appliance bills, warranty cards and service documents for Weave. ${kind === 'handwritten' ? 'This document is handwritten; read the handwriting carefully.' : ''}
Return ONE JSON object only, with this shape:
{
  "fields": { ${fields}: { "value": string|number|null, "status": "found"|"missing"|"unclear"|"conflicting"|"derived", "evidence": "exact words from the document", "candidates": [] } },
  "deadlines": [ { "type": ${types}, "title": string, "date": "YYYY-MM-DD", "amount": string|number|null, "recurrence": { "frequency": "monthly"|"yearly", "dayOfMonth": 1-31, "endDate": "YYYY-MM-DD" }|null, "status": "found"|"unclear"|"conflicting"|"derived", "evidence": "exact words from the document", "candidates": [] } ],
  "warnings": [string]
}

Hard rules:
- Use only information actually printed or written in the document. Do NOT invent, guess or compute a date or amount from today's date.
- If a fact is absent, set value null and status "missing". If it is illegible or ambiguous, status "unclear". If two different values appear, status "conflicting" and put both in candidates.
- "derived" is only for a value explicitly derivable from other written facts (for example a 1-year warranty from a written purchase date); always quote that written fact as evidence.
- Dates must be YYYY-MM-DD. Do not fill in a missing day or year.
- Include a deadline only when the document states it. An EMI schedule may use recurrence instead of one date.
- Keep evidence short and verbatim. Do not add commentary outside JSON.
${source.text ? `Prepared document text (from ${source.method}):\n${source.text.slice(0, 12000)}` : 'The document is supplied as page images; read them directly.'}`;
}

export async function extractApplianceDocument({ buffer, mimeType, kind = 'bill', deps = {} }) {
  const source = await (deps.extractSource ?? extractSource)({ buffer, mimeType, kind });
  const prompt = buildPrompt(kind, source);
  const call = deps.callExtraction ?? ((p, s) => (s.images.length ? extractFromImages(p, s.images, deps.fetchImpl) : extractFromText(p, s.text, deps.fetchImpl)));
  const raw = await call(prompt, source);
  if (!raw || typeof raw !== 'object') throw new Error('NVIDIA returned no extraction data for this document.');
  const extraction = normaliseExtraction({ ...raw, method: source.method, warnings: [...source.warnings, ...(Array.isArray(raw.warnings) ? raw.warnings : [])] });
  extraction.images_analysed = source.images.length;
  return extraction;
}
