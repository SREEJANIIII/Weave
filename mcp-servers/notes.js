#!/usr/bin/env node
// Weave demo MCP server: Notes (sample data, read-only).
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ } from './lib/kit.js';
import { notes as sampleNotes } from './lib/sample-data.js';
import { now, isoDate, addDays } from '../lib/dates.js';

const notes = sampleNotes();
const server = createServer('weave-notes');

const ACTION_RE = /^- \[( |x)\] @(\S+) (.+)$/;
function actionItems(body) {
  return body
    .split('\n')
    .map((line) => line.match(ACTION_RE))
    .filter(Boolean)
    .map((m) => ({ text: m[3].trim(), owner: m[2] === 'me' ? 'me' : m[2], done: m[1] === 'x' }));
}

const summary = (n, snippet) => ({
  id: n.id,
  kind: 'note',
  title: n.title,
  updated: n.updated,
  tags: n.tags,
  snippet: snippet ?? n.body.split('\n').find((l) => l.trim()) ?? '',
});

server.registerTool(
  'list_recent_notes',
  {
    title: 'List recent notes',
    description: 'List notes edited in the last N days (newest first), optionally only those with a tag such as "meeting".',
    inputSchema: {
      days: z.number().int().min(1).max(90).optional().describe('Look-back window in days (default 7)'),
      tag: z.string().optional().describe('Only notes with this tag, e.g. "meeting"'),
    },
    annotations: READ,
  },
  async ({ days = 7, tag }) => {
    const since = isoDate(addDays(now(), -days));
    const list = notes
      .filter((n) => n.updated >= since && (!tag || n.tags.includes(tag.toLowerCase())))
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .map((n) => summary(n));
    return ok({ since, notes: list });
  },
);

server.registerTool(
  'search_notes',
  {
    title: 'Search notes',
    description: 'Keyword search across note titles, tags and text. Returns the best matches with the matching line.',
    inputSchema: {
      query: z.string().min(2),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum results (default 5)'),
    },
    annotations: READ,
  },
  async ({ query, limit = 5 }) => {
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (!terms.length) return fail('Use at least one word of three or more letters.');
    const scored = notes
      .map((n) => {
        const title = n.title.toLowerCase();
        const lines = n.body.split('\n');
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 3;
          if (n.tags.some((tag) => tag.includes(t))) score += 2;
          if (n.body.toLowerCase().includes(t)) score += 1;
        }
        const best = lines.find((l) => terms.some((t) => l.toLowerCase().includes(t)));
        return { n, score, best };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ n, best }) => summary(n, best));
    return ok({ query, notes: scored });
  },
);

server.registerTool(
  'get_note',
  {
    title: 'Get note',
    description: 'Get the full text of a note, plus any checklist action items ("- [ ] @owner text") parsed out of it.',
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return fail(`No note with id ${id}.`);
    return ok({ note: { ...n, action_items: actionItems(n.body) } });
  },
);

await serve(server);
