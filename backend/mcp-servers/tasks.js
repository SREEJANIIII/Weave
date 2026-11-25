#!/usr/bin/env node
// Weave demo MCP server: Tasks (sample data, in memory).
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, WRITE, DATE_RE } from './lib/kit.js';
import { tasks as sampleTasks } from './lib/sample-data.js';

const tasks = sampleTasks();
let created = 0;
const server = createServer('weave-tasks');

const byDue = (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id.localeCompare(b.id);
const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

server.registerTool(
  'list_tasks',
  {
    title: 'List tasks',
    description: 'List tasks, soonest due first. Defaults to open tasks.',
    inputSchema: {
      status: z.enum(['open', 'done', 'all']).optional().describe('Default "open"'),
      due_on_or_before: z.string().regex(DATE_RE).optional().describe('Only tasks due on or before this date, YYYY-MM-DD'),
      list: z.string().optional().describe('Only tasks in this list, e.g. "Work"'),
    },
    annotations: READ,
  },
  async ({ status = 'open', due_on_or_before, list }) => {
    const result = tasks
      .filter((t) => status === 'all' || t.status === status)
      .filter((t) => !due_on_or_before || (t.due && t.due <= due_on_or_before))
      .filter((t) => !list || t.list.toLowerCase() === list.toLowerCase())
      .sort(byDue);
    return ok({ status, tasks: result });
  },
);

server.registerTool(
  'get_task',
  {
    title: 'Get task',
    description: 'Get one task by id.',
    inputSchema: { id: z.string() },
    annotations: READ,
  },
  async ({ id }) => {
    const task = tasks.find((t) => t.id === id);
    return task ? ok({ task }) : fail(`No task with id ${id}.`);
  },
);

server.registerTool(
  'create_task',
  {
    title: 'Create task',
    description: "Add a task to the user's task list. This changes the user's tasks.",
    inputSchema: {
      title: z.string().min(3),
      due: z.string().regex(DATE_RE).optional().describe('Due date, YYYY-MM-DD'),
      list: z.string().optional().describe('List name (default "Inbox")'),
      notes: z.string().optional(),
    },
    annotations: WRITE,
  },
  async ({ title, due, list = 'Inbox', notes = '' }) => {
    const duplicate = tasks.find((t) => t.status === 'open' && normalise(t.title) === normalise(title));
    if (duplicate) return fail(`An open task with this title already exists (${duplicate.id}).`);
    created += 1;
    const task = { id: `t_${200 + created}`, kind: 'task', title, due: due ?? null, list, status: 'open', notes, created_by: 'Weave (approved by you)' };
    tasks.push(task);
    return ok({ task });
  },
);

await serve(server);
