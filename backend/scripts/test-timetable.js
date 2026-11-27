import assert from 'node:assert/strict';
import { extractTimetableEntries, looksLikeTimetable } from '../lib/timetable-extraction.js';

const text = `Weekly timetable\nTime | Monday | Tuesday | Wednesday | Thursday\n09:00 - 10:00 | DSA | DBMS | Java | Physics\n10:00 - 11:00 | Java | Break | DBMS Lab | Mathematics\n15:00 - 17:00 | Lab | DSA | Free | DBMS`;
assert.equal(looksLikeTimetable(text), true);
const entries = extractTimetableEntries(text);
assert.ok(entries.some((entry) => entry.day === 'Monday' && entry.subject === 'DSA' && entry.startTime === '09:00' && entry.endTime === '10:00'));
assert.ok(entries.some((entry) => entry.day === 'Wednesday' && entry.subject === 'DBMS Lab' && entry.startTime === '10:00'));
assert.ok(!entries.some((entry) => entry.subject === 'Break' || entry.subject === 'Free'));
assert.equal(extractTimetableEntries('A document without days or class times').length, 0);
console.log('  ✓ timetable detection preserves weekday/time/subject rows, skips breaks, and rejects unstructured text');
