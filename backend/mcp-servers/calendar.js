#!/usr/bin/env node
// Weave MCP server: Calendar (MongoDB-backed; supports imported .ics calendars, manual events, and seeded sample data).
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, WRITE, DATE_RE, TIME_RE } from './lib/kit.js';
import { toMinutes, fromMinutes } from '../lib/dates.js';
import { connectDatabase, closeDatabase } from '../db/database.js';
import { AppDataRepository } from '../repositories/app-data-repository.js';

await connectDatabase();
const repo = new AppDataRepository();
await repo.ensureCalendarSeeded();

const server = createServer('weave-calendar');

server.registerTool(
  'list_events',
  {
    title: 'List events',
    description: 'List calendar events on one date, or across an inclusive date range. Times are 24-hour local time.',
    inputSchema: {
      date: z.string().regex(DATE_RE).optional().describe('A single date, YYYY-MM-DD'),
      start_date: z.string().regex(DATE_RE).optional().describe('Range start, YYYY-MM-DD'),
      end_date: z.string().regex(DATE_RE).optional().describe('Range end, YYYY-MM-DD (inclusive)'),
    },
    annotations: READ,
  },
  async ({ date, start_date, end_date }) => {
    const from = date ?? start_date;
    const to = date ?? end_date ?? start_date;
    if (!from) return fail('Pass either date, or start_date and end_date.');
    const events = await repo.listEvents({ date, start_date, end_date });
    return ok({ from, to, events });
  },
);

server.registerTool(
  'find_free_slots',
  {
    title: 'Find free time',
    description:
      'Find free slots on a date long enough for a given duration, inside an optional time window, keeping an optional buffer before and after existing events.',
    inputSchema: {
      date: z.string().regex(DATE_RE).describe('YYYY-MM-DD'),
      duration_minutes: z.number().int().min(5).max(600),
      not_before: z.string().regex(TIME_RE).optional().describe('Earliest start, HH:MM (default 08:00)'),
      not_after: z.string().regex(TIME_RE).optional().describe('Latest end, HH:MM (default 22:00)'),
      buffer_minutes: z.number().int().min(0).max(120).optional().describe('Free minutes to keep around existing events (default 0)'),
    },
    annotations: READ,
  },
  async ({ date, duration_minutes, not_before = '08:00', not_after = '22:00', buffer_minutes = 0 }) => {
    const lo = toMinutes(not_before);
    const hi = toMinutes(not_after);
    if (hi <= lo) return fail('not_after must be later than not_before.');
    const todays = await repo.listEvents({ date });
    const busy = todays
      .map((e) => [toMinutes(e.start) - buffer_minutes, toMinutes(e.end) + buffer_minutes])
      .sort((a, b) => a[0] - b[0]);
    const slots = [];
    let cursor = lo;
    for (const [s, e] of busy) {
      if (e <= cursor) continue;
      if (s > cursor) {
        const end = Math.min(s, hi);
        if (end - cursor >= duration_minutes) slots.push([cursor, end]);
      }
      cursor = Math.max(cursor, e);
      if (cursor >= hi) break;
    }
    if (hi - cursor >= duration_minutes) slots.push([cursor, hi]);
    return ok({
      date,
      duration_minutes,
      buffer_minutes,
      window: { from: not_before, to: not_after },
      slots: slots.map(([a, b]) => ({ start: fromMinutes(a), end: fromMinutes(b), minutes: b - a })),
      based_on_event_ids: todays.map((e) => e.id),
    });
  },
);

server.registerTool(
  'get_event',
  {
    title: 'Get event',
    description: 'Get one calendar event by id.',
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const event = await repo.getEvent(id);
    return event ? ok({ event }) : fail(`No event with id ${id}.`);
  },
);

server.registerTool(
  'create_event',
  {
    title: 'Create event',
    description: "Add an event to the calendar. This changes the user's calendar.",
    inputSchema: {
      title: z.string().min(2),
      date: z.string().regex(DATE_RE).describe('YYYY-MM-DD'),
      start: z.string().regex(TIME_RE).describe('HH:MM, 24-hour'),
      end: z.string().regex(TIME_RE).describe('HH:MM, 24-hour'),
      location: z.string().optional(),
      notes: z.string().optional(),
    },
    annotations: WRITE,
  },
  async ({ title, date, start, end, location = '', notes = '' }) => {
    if (toMinutes(end) <= toMinutes(start)) return fail('end must be later than start.');
    const existing = await repo.listEvents({ date });
    const conflicts = existing
      .filter((e) => toMinutes(e.start) < toMinutes(end) && toMinutes(start) < toMinutes(e.end))
      .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end }));
    const event = await repo.createEvent({
      title,
      date,
      start,
      end,
      location,
      notes,
      source: 'user event',
      createdBy: 'Weave (approved by you)',
    });
    return ok({ event, conflicts });
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await closeDatabase();
    process.exit(0);
  });
}
await serve(server);
