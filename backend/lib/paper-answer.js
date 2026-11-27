// Answers a question from one saved paper's stored text and tables.
// "Tomorrow", "today", "Friday" and similar are turned into a real date and weekday first, so
// "tomorrow's timetable" returns the routine for the right day. The NVIDIA model writes the answer
// when it is available; otherwise a plain table search answers from the same stored content.
import { now, isoDate, addDays, WEEKDAYS, fmtLongDate } from './dates.js';
import { extractFromText } from './nvidia-vision.js';

const DAY_ALIASES = {
  monday: ['monday', 'mon'],
  tuesday: ['tuesday', 'tue', 'tues'],
  wednesday: ['wednesday', 'wed'],
  thursday: ['thursday', 'thu', 'thur', 'thurs'],
  friday: ['friday', 'fri'],
  saturday: ['saturday', 'sat'],
  sunday: ['sunday', 'sun'],
};

/** Work out which day a question is about. Returns { date, weekday, label } or null. */
export function resolveDay(question, today = now()) {
  const q = String(question).toLowerCase();
  const at = (n, label) => {
    const d = addDays(today, n);
    return { date: isoDate(d), weekday: WEEKDAYS[d.getDay()], label: `${label} (${fmtLongDate(d)})` };
  };
  if (/day after tomorrow/.test(q)) return at(2, 'the day after tomorrow');
  if (/\btomm?orr?ow'?s?\b|\btmrw\b|\btmr\b/.test(q)) return at(1, 'tomorrow');
  if (/\byesterday'?s?\b/.test(q)) return at(-1, 'yesterday');
  if (/\btoday'?s?\b|\btonight\b|\bthis (morning|afternoon|evening)\b/.test(q)) return at(0, 'today');
  for (const [day, names] of Object.entries(DAY_ALIASES)) {
    if (names.some((n) => new RegExp(`\\b${n}('?s)?\\b`).test(q))) {
      const target = WEEKDAYS.findIndex((w) => w.toLowerCase() === day);
      const ahead = (target - today.getDay() + 7) % 7;
      const next = /\bnext\b/.test(q) && ahead === 0 ? 7 : ahead;
      const d = addDays(today, next);
      return { date: isoDate(d), weekday: WEEKDAYS[target], label: fmtLongDate(d), named: true };
    }
  }
  return null;
}

const STOP = new Set('the a an my me i is are was were what whats which when where how show tell give find for of to on in at it its this that have has do does did please can you could get time table timetable schedule routine class classes lecture lectures period periods about from with and or today todays tomorrow tomorrows yesterday next'.split(' '));
const terms = (q) => String(q).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

function dayMatches(cell, weekday) {
  const names = DAY_ALIASES[weekday.toLowerCase()] ?? [weekday.toLowerCase()];
  const c = String(cell).toLowerCase().trim();
  return names.some((n) => c === n || c.startsWith(`${n} `) || c.startsWith(`${n}.`) || c.startsWith(`${n}day`) || new RegExp(`\\b${n}\\b`).test(c));
}

/** Rows (or a column) of a table that belong to a weekday: timetables put days down the side or across the top. */
function pickDay(table, weekday) {
  const rows = table.rows.filter((r) => dayMatches(r[0] ?? '', weekday) || r.slice(0, 2).some((c) => dayMatches(c, weekday)));
  if (rows.length === 1 && table.columns.length > 2) {
    // One row per day: turn it into a "Time | Class" list, which reads far better than one wide row.
    const row = rows[0];
    const list = table.columns.slice(1).map((c, i) => [c, row[i + 1] ?? '']).filter(([, v]) => String(v).trim());
    return { title: `${table.title || 'Timetable'}: ${weekday}`, columns: [table.columns[0] && !dayMatches(row[0] ?? '', weekday) ? table.columns[0] : 'Time', 'Class'], rows: list };
  }
  if (rows.length) return { title: `${table.title || 'Timetable'}: ${weekday}`, columns: table.columns, rows };
  const col = table.columns.findIndex((c) => dayMatches(c, weekday));
  if (col > 0) {
    return {
      title: `${table.title || 'Timetable'}: ${weekday}`,
      columns: [table.columns[0] || 'Time', weekday],
      rows: table.rows.map((r) => [r[0] ?? '', r[col] ?? '']).filter((r) => r[1]),
    };
  }
  return null;
}

/** Answer without the model: find the right day's rows, or rows and lines that mention the question's words. */
export function searchAnswer(paper, question, day) {
  const tables = paper.content?.tables ?? [];
  const text = paper.content?.text ?? '';
  if (day) {
    for (const t of tables) {
      const hit = pickDay(t, day.weekday);
      if (hit) {
        return { found: true, headline: `Here’s your ${paper.title.toLowerCase()} for ${day.label}.`, table: hit, points: [], note: '' };
      }
    }
    if (['Saturday', 'Sunday'].includes(day.weekday) && tables.length) {
      return { found: true, headline: `${day.label[0].toUpperCase()}${day.label.slice(1)} is a ${day.weekday}, and your ${paper.title.toLowerCase()} has nothing listed for it.`, table: null, points: [], note: '' };
    }
  }
  const ts = terms(question);
  if (ts.length) {
    for (const t of tables) {
      const rows = t.rows.filter((r) => r.some((c) => ts.some((w) => String(c).toLowerCase().includes(w))));
      if (rows.length) return { found: true, headline: `Here’s what your ${paper.title.toLowerCase()} says about “${ts.join(' ')}”.`, table: { title: t.title, columns: t.columns, rows }, points: [], note: '' };
    }
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && ts.some((w) => l.toLowerCase().includes(w))).slice(0, 12);
    if (lines.length) return { found: true, headline: `Here’s what your ${paper.title.toLowerCase()} says.`, table: null, points: lines.map((l) => ({ text: l, detail: '' })), note: '' };
  }
  if (!day && tables.length) return { found: true, headline: `Here’s your ${paper.title.toLowerCase()}.`, table: tables[0], points: [], note: '' };
  return {
    found: false,
    headline: day ? `I couldn’t find ${day.weekday} in your ${paper.title.toLowerCase()}.` : `I couldn’t find that in your ${paper.title.toLowerCase()}.`,
    table: null,
    points: [],
    note: '',
  };
}

function promptFor(paper, question, day) {
  const T = now();
  return `You answer one question using ONLY the saved document below. Today is ${WEEKDAYS[T.getDay()]}, ${isoDate(T)}.
${day ? `The question is about ${day.label}, which is a ${day.weekday} (${day.date}). Answer for ${day.weekday} only.` : ''}
Return one JSON object only, no markdown, with this exact shape:
{"found":true,"headline":"one plain sentence that directly answers","table":{"title":"","columns":["..."],"rows":[["..."]]},"points":[{"text":"","detail":""}],"note":""}
Rules:
- Be specific to the question. For a timetable or routine question about a day, return only that day's periods in "table", one row per period, with columns such as Time, Subject, Faculty/Room taken from the document.
- If the document lists subject or faculty codes with their full names elsewhere (a legend), show the full name next to the code, e.g. "BCS301 · Data Structures".
- Use "table": null when a table does not help, and "points" for short facts. Keep "points" empty when the table already answers.
- Copy names, codes, times and rooms exactly as written. Never invent anything.
- If the day has no classes (e.g. a weekend) say so in "headline" with "table": null.
- If the answer is not in the document, set "found": false and say so plainly in "headline".
- Plain text only inside strings: no asterisks or markdown.

DOCUMENT TITLE: ${paper.title}
DOCUMENT DETAILS: ${JSON.stringify(paper.fields ?? {})}
TABLES (JSON): ${JSON.stringify(paper.content?.tables ?? []).slice(0, 40_000)}

QUESTION: ${question}`;
}

const plain = (s) => String(s ?? '').replace(/\*\*|__|`/g, '').trim();

function cleanAnswer(raw, fallback) {
  const table = raw?.table && Array.isArray(raw.table.rows) && raw.table.rows.length
    ? { title: plain(raw.table.title), columns: (raw.table.columns ?? []).map(plain), rows: raw.table.rows.map((r) => (Array.isArray(r) ? r : [r]).map(plain)) }
    : null;
  const headline = plain(raw?.headline);
  const points = (Array.isArray(raw?.points) ? raw.points : [])
    .map((p) => ({ text: plain(p?.text ?? p), detail: plain(p?.detail) }))
    .filter((p) => p.text && p.text !== headline);
  if (!headline && !table && !points.length) return fallback;
  return { found: raw?.found !== false, headline: headline || fallback.headline, table, points, note: plain(raw?.note) };
}

/** { found, headline, table, points, note, day, method } */
export async function answerFromPaper(paper, question, { useModel = true } = {}) {
  const day = resolveDay(question);
  const fallback = searchAnswer(paper, question, day);
  if (!useModel || !paper.content?.text) return { ...fallback, day, method: 'search' };
  const document = `${paper.content.text}`.slice(0, 40_000);
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await extractFromText(promptFor(paper, question, day), document);
      return { ...cleanAnswer(raw, fallback), day, method: 'model' };
    } catch (err) {
      lastError = err;
    }
  }
  // The search answer stands on its own when it found something; only say why when it didn't.
  const note = fallback.found ? '' : `The AI couldn’t answer just now (${String(lastError?.message ?? '').slice(0, 120)}).`;
  return { ...fallback, day, method: 'search', note };
}
