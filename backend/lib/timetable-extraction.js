const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_RE = new RegExp(`\\b(${DAYS.join('|')})\\b`, 'ig');
const TIME_RE = /\b((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM)?)\b/i;

function time(value) {
  const match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || hour > 23 || (meridiem && hour > 12)) return null;
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function cleanSubject(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/^[-:|]+|[-:|]+$/g, '').trim();
}

function entry(day, range, subject, extras = {}) {
  const match = String(range).match(TIME_RE) ?? [null, ...String(range).split(/\s*(?:-|–|—|to)\s*/i)];
  const startTime = time(match[1]);
  const endTime = time(match[2]);
  const clean = cleanSubject(subject);
  if (!DAYS.includes(day) || !startTime || !endTime || !clean || /^(break|lunch|recess|free|-+)$/i.test(clean)) return null;
  return { day, startTime, endTime, subject: clean, classType: cleanSubject(extras.classType), location: cleanSubject(extras.location) };
}

function parseDelimited(lines) {
  const results = [];
  for (const line of lines) {
    const days = [...line.matchAll(DAY_RE)].map((m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
    const range = line.match(TIME_RE)?.[0];
    if (!range || !days.length) continue;
    const rest = line.replace(TIME_RE, '').replace(DAY_RE, '').split(/\s*\|\s*|\s{2,}/).map(cleanSubject).filter(Boolean);
    const subject = rest.find((value) => !/^(break|lunch|free|room|lab)$/i.test(value));
    for (const day of days) { const item = entry(day, range, subject); if (item) results.push(item); }
  }
  return results;
}

function parseGrid(lines) {
  const results = [];
  const header = lines.find((line) => [...line.matchAll(DAY_RE)].length >= 2);
  if (!header) return results;
  const days = [...header.matchAll(DAY_RE)].map((m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
  for (const line of lines) {
    const range = line.match(TIME_RE)?.[0];
    if (!range || line === header) continue;
    const rawCells = line.replace(TIME_RE, '').replace(/^\s*\|\s*/, '');
    const cells = (rawCells.includes('|') ? rawCells.split('|') : rawCells.split(/\t+|\s{3,}/)).map(cleanSubject);
    while (cells.length < days.length) cells.push('');
    days.forEach((day, index) => { const item = entry(day, range, cells[index]); if (item) results.push(item); });
  }
  return results;
}

export function extractTimetableEntries(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries = [...parseDelimited(lines), ...parseGrid(lines)];
  const unique = new Map(entries.map((item) => [`${item.day}|${item.startTime}|${item.endTime}|${item.subject.toLowerCase()}`, item]));
  return [...unique.values()].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.startTime.localeCompare(b.startTime));
}

export function looksLikeTimetable(text) {
  const value = String(text ?? '');
  return [...value.matchAll(DAY_RE)].length >= 2 && TIME_RE.test(value) && extractTimetableEntries(value).length > 0;
}
