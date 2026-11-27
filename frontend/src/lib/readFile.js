// Turns a file someone adds into details they can review. Calendar files and plain-text notes are read
// in the browser. Photos and PDFs are read by NVIDIA NIM only when the person allows it.
import { api } from './api';
import { EMPTY_FIELDS, KINDS, isoOf } from './savedPapers';

export const ACCEPT = 'image/*,application/pdf,.pdf,.ics,text/calendar,.txt,text/plain,.md';
const MAX_BYTES = 8 * 1024 * 1024;

function guessKind(text) {
  const t = text.toLowerCase();
  if (/warrant/.test(t)) return 'warranty';
  if (/receipt|invoice|order/.test(t)) return 'receipt';
  if (/\bbill\b|amount due|due date|electricity|water|gas|broadband/.test(t)) return 'bill';
  if (/workout|gym|squat|deadlift|reps|\bkm\b|run|yoga/.test(t)) return 'workout';
  if (/invite|meeting|event|party|wedding/.test(t)) return 'event';
  return 'other';
}

export function suggestTitle(kind, fields) {
  const words = (fields.item || fields.merchant || '').replace(/[^\p{L}\p{N} -]/gu, '').split(/\s+/).filter(Boolean);
  const label = KINDS[kind]?.label ?? 'Note';
  if (!words.length) return '';
  if (kind === 'event' || kind === 'workout' || kind === 'other') return words.slice(0, 5).join(' ');
  const last = words.at(-1);
  const short = words.length > 3 ? last : words.join(' ');
  return `${short.charAt(0).toUpperCase()}${short.slice(1)} ${label.toLowerCase()}`;
}

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

async function drawScaled(bitmap, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Read the file into the forms the review step needs: a preview, a small stored copy, and what to send for reading. */
export async function prepareFile(file) {
  const name = file.name || 'Photo';
  const type = file.type || (name.endsWith('.ics') ? 'text/calendar' : name.endsWith('.pdf') ? 'application/pdf' : '');
  const out = { fileName: name, mediaType: type, preview: null, thumb: null, payload: null, text: null, tooBig: file.size > MAX_BYTES };
  if (type.startsWith('image/')) {
    try {
      const bitmap = await createImageBitmap(file);
      const big = await drawScaled(bitmap, 1600, 0.85);
      out.thumb = await drawScaled(bitmap, 520, 0.72);
      out.preview = out.thumb;
      out.payload = big.split(',')[1];
      out.mediaType = 'image/jpeg';
      out.tooBig = false;
      bitmap.close?.();
    } catch {
      // A format this browser can't draw (some HEIC photos): no preview, and nothing to send for reading.
    }
  } else if (type === 'application/pdf') {
    if (!out.tooBig) out.payload = await toBase64(file);
  } else if (/^text\//.test(type) || /\.(ics|txt|md)$/i.test(name)) {
    out.text = await file.text();
  }
  return out;
}

function unescapeIcs(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function parseIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const event = unfolded.split(/BEGIN:VEVENT/)[1] ?? unfolded;
  const get = (key) => event.match(new RegExp(`^${key}(?:;[^:\\r\\n]*)?:(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const start = get('DTSTART');
  let date = '';
  let time = '';
  const m = start.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/);
  if (m) {
    if (m[4] && m[7] === 'Z') {
      const local = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      date = isoOf(local);
      time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
    } else {
      date = `${m[1]}-${m[2]}-${m[3]}`;
      time = m[4] ? `${m[4]}:${m[5]}` : '';
    }
  }
  const fields = { ...EMPTY_FIELDS, item: unescapeIcs(get('SUMMARY')), date, time, place: unescapeIcs(get('LOCATION')), notes: unescapeIcs(get('DESCRIPTION')).slice(0, 400) };
  return { kind: 'event', title: fields.item || 'Event', fields, unsure: [], source: 'file' };
}

function findDate(text) {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const dmy = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}

function parseText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const kind = guessKind(text);
  const first = (lines[0] ?? '').replace(/^#+\s*/, '').slice(0, 80);
  const fields = { ...EMPTY_FIELDS, item: first, date: findDate(text), notes: lines.slice(1).join(' ').slice(0, 500) };
  return { kind, title: first.slice(0, 60), fields, unsure: fields.date ? [] : [], source: 'file' };
}

/** Details read in the browser, for files that don't need the server. Null when the file needs reading. */
export function readLocally(prepared) {
  if (prepared.text == null) return null;
  if (/calendar/.test(prepared.mediaType) || /\.ics$/i.test(prepared.fileName) || /BEGIN:VCALENDAR/.test(prepared.text)) return parseIcs(prepared.text);
  return parseText(prepared.text);
}

/** Ask the server to read a photo or PDF. Resolves to review details, or rejects with { message, hint }. */
export async function readOnServer(prepared) {
  const r = await api('/api/read-document', { data: prepared.payload, mediaType: prepared.mediaType, fileName: prepared.fileName });
  if (!r.ok) throw { message: r.data?.error ?? 'Weave couldn’t read this file.', hint: r.data?.hint ?? '' };
  const d = r.data.details;
  if (!d.readable) throw { message: 'I couldn’t make out any details in this one.', hint: 'Try a sharper photo in good light, or type the details yourself.' };
  const fields = { ...EMPTY_FIELDS };
  for (const key of Object.keys(EMPTY_FIELDS)) if (typeof d[key] === 'string' && d[key]) fields[key] = d[key];
  const kind = KINDS[d.kind] ? d.kind : 'other';
  return { kind, title: d.title || suggestTitle(kind, fields), fields, unsure: (d.unsure ?? []).filter((k) => k in EMPTY_FIELDS), source: 'nvidia', content: r.data.content ?? null };
}

/** A starting point for typing details by hand, guessed from the file name only. */
export function blankDetails(prepared) {
  const kind = guessKind(prepared.fileName ?? '');
  return { kind: kind === 'other' ? 'receipt' : kind, title: '', fields: { ...EMPTY_FIELDS }, unsure: [], source: 'typed' };
}
