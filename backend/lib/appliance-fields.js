// Shared field vocabulary for appliance extraction, review and persistence.
// Nothing here invents a value: invalid or ambiguous input becomes `unclear`, and
// absent input becomes `missing`, so the review screen can ask the user instead.

export const FIELD_DEFS = {
  name: { label: 'Appliance', type: 'text' },
  brand: { label: 'Brand', type: 'text' },
  model: { label: 'Model', type: 'text' },
  serialNumber: { label: 'Serial number', type: 'text' },
  purchaseDate: { label: 'Purchase date', type: 'date' },
  price: { label: 'Price', type: 'amount' },
  warrantyMonths: { label: 'Warranty (months)', type: 'number' },
  serviceDetails: { label: 'Service details', type: 'text' },
  amcProvider: { label: 'AMC provider', type: 'text' },
};

export const DEADLINE_TYPES = {
  warranty_expiry: 'Warranty expiry',
  service: 'Scheduled service',
  amc_renewal: 'AMC renewal',
  emi_payment: 'EMI / payment',
  return_window: 'Return / replacement',
  other: 'Other deadline',
};

export const FIELD_STATUSES = ['missing', 'found', 'unclear', 'conflicting', 'derived', 'confirmed'];
const STATUS_SET = new Set(FIELD_STATUSES);

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** Strict local-date parser. Returns null for impossible dates and never uses "today". */
export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return valid(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return valid(m[3], m[2], m[1]); // Indian bills use DD/MM/YYYY
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase().slice(0, 3)]) return valid(m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], m[2]);
  return null;
}

function valid(y, mo, d) {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isAmbiguousDate(value) {
  return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(String(value ?? '').trim());
}

export function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return { value, currency: 'INR' };
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  const currency = /₹|inr|\bRs\.?\b|\brs\.?\b/i.test(s) ? 'INR' : /\$|usd/i.test(s) ? 'USD' : null;
  const n = s.replace(/[₹$,\s]/g, '').replace(/\/-$/, '').match(/-?\d+(?:\.\d{1,2})?/);
  if (!n) return null;
  const parsed = Number(n[0]);
  return Number.isFinite(parsed) ? { value: parsed, currency } : null;
}

const cleanText = (value, max = 240) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

function fieldStatus(rawStatus, evidence) {
  const status = STATUS_SET.has(rawStatus) ? rawStatus : 'unclear';
  if ((status === 'found' || status === 'derived') && !cleanText(evidence)) return 'unclear';
  return status;
}

function normaliseField(key, input) {
  const def = FIELD_DEFS[key];
  const blank = { value: null, status: 'missing', evidence: '', candidates: [] };
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : { value: input };
  const evidence = cleanText(raw.evidence);
  const candidates = Array.isArray(raw.candidates) ? raw.candidates.slice(0, 5).map((x) => cleanText(x)) : [];
  const status = fieldStatus(raw.status, evidence);
  if (raw.value === null || raw.value === undefined || String(raw.value).trim() === '') return { ...blank, status, evidence, candidates };

  if (def.type === 'date') {
    const date = parseDate(raw.value);
    if (!date) return { ...blank, status: 'unclear', evidence, candidates: [cleanText(raw.value, 60), ...candidates].filter(Boolean).slice(0, 5) };
    return { value: date, status, evidence, candidates, ambiguous: isAmbiguousDate(raw.value) && status === 'found' };
  }
  if (def.type === 'amount') {
    const amount = parseAmount(raw.value);
    if (!amount) return { ...blank, status: 'unclear', evidence, candidates: [cleanText(raw.value, 60), ...candidates].filter(Boolean).slice(0, 5) };
    return { value: amount.value, currency: amount.currency, status, evidence, candidates };
  }
  if (def.type === 'number') {
    const n = Number(String(raw.value).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return { ...blank, status: 'unclear', evidence, candidates: [cleanText(raw.value, 60), ...candidates].filter(Boolean).slice(0, 5) };
    return { value: Math.round(n), status, evidence, candidates: Array.isArray(candidates) ? candidates : [] };
  }
  return { value: cleanText(raw.value), status, evidence, candidates: Array.isArray(candidates) ? candidates : [] };
}

function normaliseRecurrence(input) {
  if (!input || typeof input !== 'object') return null;
  const frequency = String(input.frequency ?? '').toLowerCase();
  if (!['monthly', 'yearly'].includes(frequency)) return null;
  const dayOfMonth = frequency === 'monthly' ? Number(input.dayOfMonth) : null;
  if (frequency === 'monthly' && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) return null;
  return { frequency, ...(dayOfMonth ? { dayOfMonth } : {}), ...(parseDate(input.endDate) ? { endDate: parseDate(input.endDate) } : {}) };
}

/** Sanitise a model's extraction JSON into a predictable, reviewable shape. */
export function normaliseExtraction(raw = {}) {
  const fields = {};
  for (const key of Object.keys(FIELD_DEFS)) fields[key] = normaliseField(key, raw.fields?.[key]);
  const deadlines = [];
  for (const item of Array.isArray(raw.deadlines) ? raw.deadlines.slice(0, 24) : []) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type ?? '').toLowerCase();
    if (!DEADLINE_TYPES[type]) continue;
    const evidence = cleanText(item.evidence);
    const status = fieldStatus(item.status, evidence);
    const date = parseDate(item.date);
    const amount = item.amount === undefined || item.amount === null || item.amount === '' ? null : parseAmount(item.amount);
    if (!date && !amount && !item.recurrence) continue;
    deadlines.push({
      type,
      title: cleanText(item.title || DEADLINE_TYPES[type], 120),
      date,
      amount: amount?.value ?? null,
      currency: amount?.currency ?? null,
      recurrence: normaliseRecurrence(item.recurrence),
      status,
      evidence,
      candidates: Array.isArray(item.candidates) ? item.candidates.slice(0, 5).map((x) => cleanText(x)) : [],
    });
  }
  return {
    method: cleanText(raw.method) || null,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 8).map((x) => cleanText(x)) : [],
    fields,
    deadlines,
  };
}

/** Stable identity: prefer a serial number, then brand + model + name. */
export function dedupeKey({ name, brand, model, serialNumber, purchaseDate } = {}) {
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  if (serialNumber && norm(serialNumber)) return `serial:${norm(serialNumber)}`;
  const parts = [norm(brand), norm(model), norm(name)].filter(Boolean);
  if (!parts.length) return null;
  // A name on its own is too generic; add the purchase date when we have one.
  if (!norm(brand) && !norm(model) && norm(purchaseDate)) return `named:${norm(name)}|${norm(purchaseDate)}`;
  return `appliance:${parts.join('|')}`;
}

export function parseWindows(value, fallback = [30, 14, 7]) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const windows = [...new Set(raw.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 365))].sort((a, b) => b - a);
  return windows.length ? windows : fallback;
}

export function confirmedFieldValues(fields = {}) {
  const out = {};
  for (const [key, def] of Object.entries(FIELD_DEFS)) {
    const field = fields[key];
    if (!field || field.status !== 'confirmed' || field.value === null || field.value === undefined) continue;
    out[key] = field.value;
    if (def.type === 'amount' && field.currency) out.currency = field.currency;
  }
  return out;
}
