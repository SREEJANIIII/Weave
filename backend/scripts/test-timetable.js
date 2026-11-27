import assert from 'node:assert/strict';
import { extractTimetableEntries, looksLikeTimetable } from '../lib/timetable-extraction.js';
import { Run } from '../src/run.js';
import { runOffline } from '../src/agent-offline.js';

const text = `Weekly timetable\nTime | Monday | Tuesday | Wednesday | Thursday\n09:00 - 10:00 | DSA | DBMS | Java | Physics\n10:00 - 11:00 | Java | Break | DBMS Lab | Mathematics\n15:00 - 17:00 | Lab | DSA | Free | DBMS`;
assert.equal(looksLikeTimetable(text), true);
const entries = extractTimetableEntries(text);
assert.ok(entries.some((entry) => entry.day === 'Monday' && entry.subject === 'DSA' && entry.startTime === '09:00' && entry.endTime === '10:00'));
assert.ok(entries.some((entry) => entry.day === 'Wednesday' && entry.subject === 'DBMS Lab' && entry.startTime === '10:00'));
assert.ok(!entries.some((entry) => entry.subject === 'Break' || entry.subject === 'Free'));
assert.equal(extractTimetableEntries('A document without days or class times').length, 0);

const schedule = [
  { id: 'm-dsa', kind: 'timetable_entry', day: 'Monday', startTime: '09:00', endTime: '10:00', subject: 'DSA' },
  { id: 'm-java', kind: 'timetable_entry', day: 'Monday', startTime: '10:00', endTime: '11:00', subject: 'Java' },
  { id: 't-dbms', kind: 'timetable_entry', day: 'Tuesday', startTime: '11:00', endTime: '12:00', subject: 'DBMS' },
  { id: 'w-java', kind: 'timetable_entry', day: 'Wednesday', startTime: '09:00', endTime: '10:00', subject: 'Java' },
  { id: 'w-dbms', kind: 'timetable_entry', day: 'Wednesday', startTime: '10:00', endTime: '12:00', subject: 'DBMS' },
  { id: 'th-dsa', kind: 'timetable_entry', day: 'Thursday', startTime: '09:00', endTime: '10:00', subject: 'DSA' },
  { id: 'th-dbms', kind: 'timetable_entry', day: 'Thursday', startTime: '15:00', endTime: '16:00', subject: 'DBMS' },
];
const hub = { servers: new Map([['timetable', { def: { name: 'Timetable' } }]]), isAvailable: (id) => id === 'timetable', log: () => {}, findTool: () => ({ annotations: { readOnlyHint: true } }), async call(server, tool, args) { const dayEntries = schedule.filter((item) => !args.day || item.day === args.day); if (tool === 'get_classes_for_day') return { isError: false, data: { day: args.day, entries: dayEntries }, ms: 1 }; if (tool === 'get_next_class_by_subject') return { isError: false, data: { entry: schedule.find((item) => item.subject.toLowerCase().includes(String(args.subject).toLowerCase())) ?? null }, ms: 1 }; if (tool === 'get_free_slots') return { isError: false, data: { day: args.day, slots: [{ startTime: '17:00', endTime: '18:00' }] }, ms: 1 }; return { isError: false, data: { entry: schedule[0] }, ms: 1 }; } };
async function ask(question) { return runOffline(new Run({ hub, proposals: { add: (item) => item }, question, mode: 'offline', emit: () => {} })); }
assert.match((await ask('When is my next DSA class?')).headline, /DSA/);
assert.match((await ask('What classes do I have on Monday?')).headline, /2 classes/);
assert.match((await ask('When is my next DBMS class?')).headline, /DBMS/);
assert.match((await ask('What is my last class on Thursday?')).headline, /DBMS/);
assert.match((await ask('Am I free on Tuesday after 3 PM?')).headline, /free period/);
assert.match((await ask('What do I have after Java on Monday?')).headline, /Java|DSA/);
assert.match((await ask('How many classes do I have on Wednesday?')).headline, /2 classes/);
console.log('  ✓ timetable detection preserves weekday/time/subject rows, skips breaks, and rejects unstructured text');
