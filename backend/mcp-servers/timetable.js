#!/usr/bin/env node
import * as z from 'zod/v4';
import { createServer, ok, serve, READ } from './lib/kit.js';
import { connectDatabase, closeDatabase } from '../db/database.js';
import { TimetableEntry } from '../models/timetable-entry.js';
import { now, isoDate } from '../lib/dates.js';

await connectDatabase();
const server = createServer('weave-timetable');
const ownerField = { owner_id: z.string().min(1).max(128).optional() };
const owner = (value) => String(value ?? 'default').trim() || 'default';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const publicEntry = (entry) => { const x = entry.toObject ? entry.toObject() : entry; const { ownerId, _id, ...rest } = x; return { id: _id ?? x.id, ...rest }; };

async function entries(ownerId, filter = {}) {
  const query = { ownerId: owner(ownerId), ...filter };
  const rows = await TimetableEntry.find(query).sort({ day: 1, startTime: 1 }).lean();
  return rows.map(publicEntry);
}

server.registerTool('get_timetable', { title: 'Get timetable', description: 'Retrieve the confirmed recurring timetable for this user. It contains weekdays, not invented calendar dates.', inputSchema: ownerField, annotations: READ }, async ({ owner_id }) => ok({ entries: await entries(owner_id), recurring: true }));
server.registerTool('get_classes_for_day', { title: 'Get classes for a day', description: 'List confirmed timetable classes on a weekday.', inputSchema: { ...ownerField, day: z.enum(DAYS) }, annotations: READ }, async ({ owner_id, day }) => ok({ day, entries: await entries(owner_id, { day }) }));
server.registerTool('get_next_class', { title: 'Get next class', description: 'Find the next confirmed recurring class relative to the current local weekday and time.', inputSchema: { ...ownerField, afterTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }, annotations: READ }, async ({ owner_id, afterTime }) => {
  const all = await entries(owner_id); const currentDay = now().getDay() === 0 ? 6 : now().getDay() - 1; const currentTime = afterTime ?? now().toTimeString().slice(0, 5);
  const ranked = all.map((item) => ({ item, dayOffset: (DAYS.indexOf(item.day) - currentDay + 7) % 7 })).sort((a, b) => a.dayOffset - b.dayOffset || a.item.startTime.localeCompare(b.item.startTime));
  const next = ranked.find(({ dayOffset, item }) => dayOffset > 0 || item.startTime >= currentTime)?.item ?? ranked[0]?.item ?? null;
  return ok({ entry: next, recurring: true, asOf: isoDate(now()) });
});
server.registerTool('get_next_class_by_subject', { title: 'Get next class by subject', description: 'Find the next confirmed recurring class matching a subject.', inputSchema: { ...ownerField, subject: z.string().min(1) }, annotations: READ }, async ({ owner_id, subject }) => {
  const all = await entries(owner_id, { subject: { $regex: subject, $options: 'i' } }); const currentDay = now().getDay() === 0 ? 6 : now().getDay() - 1; const currentTime = now().toTimeString().slice(0, 5);
  const ranked = all.map((item) => ({ item, dayOffset: (DAYS.indexOf(item.day) - currentDay + 7) % 7 })).sort((a, b) => a.dayOffset - b.dayOffset || a.item.startTime.localeCompare(b.item.startTime));
  const next = ranked.find(({ dayOffset, item }) => dayOffset > 0 || item.startTime >= currentTime)?.item ?? ranked[0]?.item ?? null;
  return ok({ subject, entry: next, recurring: true });
});
server.registerTool('get_free_slots', { title: 'Get free slots', description: 'Calculate gaps between confirmed classes on a weekday after an optional time.', inputSchema: { ...ownerField, day: z.enum(DAYS), afterTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), fromTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), toTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }, annotations: READ }, async ({ owner_id, day, afterTime, fromTime = '08:00', toTime = '18:00' }) => {
  const start = afterTime && afterTime > fromTime ? afterTime : fromTime; const classes = (await entries(owner_id, { day })).filter((item) => item.endTime > start && item.startTime < toTime); const slots = []; let cursor = start;
  for (const item of classes) { if (item.startTime > cursor) slots.push({ startTime: cursor, endTime: item.startTime }); if (item.endTime > cursor) cursor = item.endTime; }
  if (cursor < toTime) slots.push({ startTime: cursor, endTime: toTime }); return ok({ day, slots, classes });
});
server.registerTool('get_schedule_range', { title: 'Get schedule range', description: 'Retrieve confirmed classes for an inclusive weekday range.', inputSchema: { ...ownerField, startDay: z.enum(DAYS).optional(), endDay: z.enum(DAYS).optional() }, annotations: READ }, async ({ owner_id, startDay = 'Monday', endDay = 'Sunday' }) => { const all = await entries(owner_id); const start = DAYS.indexOf(startDay); const end = DAYS.indexOf(endDay); return ok({ entries: all.filter((item) => { const day = DAYS.indexOf(item.day); return start <= end ? day >= start && day <= end : day >= start || day <= end; }) }); });

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await closeDatabase(); process.exit(0); });
await serve(server);
