// Small local-time date helpers shared by the app and the MCP servers.
// Dates are "YYYY-MM-DD" strings and times are 24-hour "HH:MM" strings, both in local time.

export const pad = (n) => String(n).padStart(2, '0');

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Now", optionally pinned to a date with WEAVE_TODAY=YYYY-MM-DD for repeatable demos and tests. */
export function now() {
  const fixed = process.env.WEAVE_TODAY;
  const real = new Date();
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) {
    const [y, m, d] = fixed.split('-').map(Number);
    return new Date(y, m - 1, d, real.getHours(), real.getMinutes());
  }
  return real;
}

export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Add whole calendar months, clamping the day to the last day of the target month. */
export function addMonths(d, n) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), lastDay));
}

export const weekday = (d) => WEEKDAYS[d.getDay()];
export const shortWeekday = (d) => WEEKDAYS[d.getDay()].slice(0, 3);

/** Monday–Sunday of the week before the one containing `d`. */
export function lastWeek(d) {
  const day = addDays(d, 0);
  const sinceMonday = (day.getDay() + 6) % 7;
  const start = addDays(day, -sinceMonday - 7);
  return { start, end: addDays(start, 6) };
}

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMinutes = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** "18:15" -> "6:15 pm" */
export function fmtTime(hhmm, withSuffix = true) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return withSuffix ? `${h12}:${pad(m)} ${h >= 12 ? 'pm' : 'am'}` : `${h12}:${pad(m)}`;
}

/** "18:15","19:00" -> "6:15–7:00 pm"; mixed halves keep both suffixes. */
export function fmtRange(start, end) {
  const sameHalf = (toMinutes(start) >= 720) === (toMinutes(end) >= 720);
  return sameHalf ?`${fmtTime(start, false)}–${fmtTime(end)}` : `${fmtTime(start)}–${fmtTime(end)}`;
}

/** "2026-11-19" -> "Thu 19 Nov" */
export function fmtDay(iso) {
  const d = parseDate(iso);
  return `${shortWeekday(d)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** Date -> "Tuesday, 24 November" */
export const fmtLongDate = (d) => `${weekday(d)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** Relative label for a date compared with today: "today", "tomorrow", "yesterday" or "Thu 19 Nov". */
export function fmtRelative(iso, today = now()) {
  const diff = Math.round((parseDate(iso) - parseDate(isoDate(today))) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return fmtDay(iso);
}

export const fmtMoney = (n, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
