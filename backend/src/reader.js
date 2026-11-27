// Reads a photo or PDF for the saved-papers review flow using the configured NVIDIA NIM model.
// Text and OCR are preferred; image input is sent only after the existing vision helper verifies support.
import { extractSource } from '../lib/document-pipeline.js';
import { extractFromImages, extractFromText, VISION_MODEL } from '../lib/nvidia-vision.js';
import { hasCredentials } from './agent-nvidia.js';
import { now, isoDate } from '../lib/dates.js';
import { cleanContent } from '../repositories/saved-paper-repository.js';

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const READABLE_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const FIELD_NAMES = ['item', 'merchant', 'date', 'amount', 'currency', 'warranty_until', 'due_date', 'time', 'place', 'reference', 'notes'];
const KINDS = new Set(['receipt', 'warranty', 'bill', 'event', 'workout', 'other']);

function promptFor(fileName, hasExtractedText = false) {
  return `Read this photo or PDF for Weave, a personal assistant. Today is ${isoDate(now())}.
Return ONE valid JSON object only (no markdown fences, no commentary outside JSON) with this exact shape:
{"readable":true,"kind":"receipt|warranty|bill|event|workout|other","title":"short useful title","item":"","merchant":"","date":"YYYY-MM-DD or empty","amount":"digits and optional decimal or empty","currency":"ISO currency code or empty","warranty_until":"YYYY-MM-DD or empty","due_date":"YYYY-MM-DD or empty","time":"HH:MM or empty","place":"","reference":"","notes":"","unsure":[],"text":"","tables":[{"title":"","columns":[],"rows":[[]]}]}
Rules:
- "text": ${hasExtractedText ? 'leave as "" (already captured verbatim) unless layout lines are garbled and need cleanup.' : 'transcribe ALL readable text in the document, in reading order, one line per printed line (use \\n). Include headings, legends, footnotes and names.'}
- "tables": transcribe EVERY table completely. "columns" is the header row; each entry of "rows" is one table row with its cells in column order. If a cell spans several columns, repeat its value in each. Keep codes, times and room numbers exactly as printed. For a timetable, keep one row per day (or per time slot) exactly as laid out.
- Copy only information visible in the document. Never guess or invent values. Leave missing fields empty.
- Use a date only when the full date is visible. Do not infer a year from today's date.
- Set readable to false if the document is blank, unreadable, or not a useful personal record.
- Put the names of any uncertain fields in unsure so the person can check them.
- The person reviews every field; nothing is saved by this request.
File name: ${String(fileName || 'not given').slice(0, 120)}`;
}

function cleanDetails(raw = {}) {
  const str = (key, max = 500) => (typeof raw[key] === 'string' || typeof raw[key] === 'number' ? String(raw[key]).trim().slice(0, max) : '');
  const unsure = Array.isArray(raw.unsure) ? raw.unsure.filter((key) => FIELD_NAMES.includes(key)) : [];
  for (const key of ['date', 'warranty_until', 'due_date']) {
    const value = str(key, 20);
    if (value && !validDate(value)) {
      raw[key] = '';
      unsure.push(key);
    }
  }
  for (const key of ['time']) {
    const value = str(key, 10);
    if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      raw[key] = '';
      unsure.push(key);
    }
  }
  return {
    readable: raw.readable === true,
    kind: KINDS.has(raw.kind) ? raw.kind : 'other',
    title: str('title', 120),
    ...Object.fromEntries(FIELD_NAMES.map((key) => [key, str(key)])),
    unsure: [...new Set(unsure)],
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The reader is available when NVIDIA is selected and its API key is configured. */
export function readerAvailable(state) {
  return state.mode === 'nvidia' && hasCredentials();
}

/** Extract reviewable fields with NIM; this never stores or persists the uploaded bytes. */
export async function readDocument({ data, mediaType, fileName = '' }) {
  if (!READABLE_TYPES.has(mediaType)) {
    throw Object.assign(new Error('Weave can read JPEG or PNG photos and PDFs.'), { status: 415 });
  }
  if (typeof data !== 'string' || !data) {
    throw Object.assign(new Error('Add a photo or PDF first.'), { status: 400 });
  }
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    throw Object.assign(new Error('That file is empty or too big to read (8 MB at most).'), { status: 413 });
  }

  // Photos go straight to the vision model: it keeps a timetable's grid, which plain OCR flattens.
  const source = await extractSource({ buffer, mimeType: mediaType, kind: mediaType === 'application/pdf' ? 'other' : 'handwritten' });
  const prompt = promptFor(fileName, source.images.length === 0 && Boolean(source.text));
  const raw = source.images.length
    ? await extractFromImages(prompt, source.images)
    : await extractFromText(prompt, source.text.slice(0, 16_000));
  const details = cleanDetails(raw);
  // Everything read from the document, kept with the paper so later questions can be answered from it.
  const content = cleanContent({
    text: typeof raw.text === 'string' && raw.text.trim() ? raw.text : source.text ?? '',
    tables: raw.tables,
    method: source.method,
  });
  return { details, content, model: VISION_MODEL, method: source.method, warnings: source.warnings };
}
