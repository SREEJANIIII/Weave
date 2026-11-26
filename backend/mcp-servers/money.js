#!/usr/bin/env node
// Weave MCP server: Money (MongoDB-backed read-only; reads uploaded CSV statements, data/statement.csv, or seeded sample data).
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, DATE_RE } from './lib/kit.js';
import { fmtDay } from '../lib/dates.js';
import { connectDatabase, closeDatabase } from '../db/database.js';
import { AppDataRepository } from '../repositories/app-data-repository.js';

await connectDatabase();
const repo = new AppDataRepository();
await repo.ensureMoneySeeded();

// Categories are user-supplied (e.g. an uploaded CSV may simply say "Food"),
// so group names cover common labels and matching is substring-based.
const GROUPS = {
  food: ['Food', 'Groceries', 'Dining out', 'Food delivery', 'Dining', 'Cafe', 'Restaurant'],
};

const normalize = (value) => String(value ?? '').trim().toLowerCase();

function expand(categories) {
  if (!categories?.length) return null;
  return categories.flatMap((c) => GROUPS[normalize(c)] ?? [c]).map(normalize).filter(Boolean);
}

function matchesCategory(category, wanted) {
  if (!wanted) return true;
  const c = normalize(category);
  if (!c) return false;
  return wanted.some((w) => c.includes(w) || w.includes(c));
}

async function select(start_date, end_date, categories) {
  const transactions = await repo.listTransactions();
  const wanted = expand(categories);
  return transactions
    .filter((t) => t.date >= start_date && t.date <= end_date)
    .filter((t) => matchesCategory(t.category, wanted))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

const server = createServer('weave-money');
const rangeSchema = {
  start_date: z.string().regex(DATE_RE).describe('YYYY-MM-DD'),
  end_date: z.string().regex(DATE_RE).describe('YYYY-MM-DD (inclusive)'),
  categories: z
    .array(z.string())
    .optional()
    .describe('Categories to include. "food" means Groceries + Dining out + Food delivery. Others: Transport, Shopping, Bills.'),
};

server.registerTool(
  'summarize_spending',
  {
    title: 'Summarise spending',
    description: 'Total spending in a date range, broken down by category and by day (amounts in INR).',
    inputSchema: rangeSchema,
    annotations: READ,
  },
  async ({ start_date, end_date, categories }) => {
    if (end_date < start_date) return fail('end_date must not be before start_date.');
    const [list, source] = await Promise.all([select(start_date, end_date, categories), repo.getMoneySource()]);
    const sum = (xs) => xs.reduce((s, t) => s + t.amount, 0);
    const group = (key) =>
      Object.entries(Object.groupBy(list, (t) => t[key])).map(([k, xs]) => ({ [key]: k, total: sum(xs), count: xs.length }));
    const label = categories?.length ? categories.join(', ') : 'All';
    return ok({
      source,
      currency: 'INR',
      summary: {
        id: `sum_${start_date}_${end_date}_${label.toLowerCase().replace(/\W+/g, '-')}`,
        kind: 'summary',
        title: `${label[0].toUpperCase()}${label.slice(1)} spending, ${fmtDay(start_date)} – ${fmtDay(end_date)}`,
        total: sum(list),
        count: list.length,
      },
      by_category: group('category').sort((a, b) => b.total - a.total),
      by_day: group('date').sort((a, b) => a.date.localeCompare(b.date)),
      transaction_ids: list.map((t) => t.id),
    });
  },
);

server.registerTool(
  'list_transactions',
  {
    title: 'List transactions',
    description: 'List individual transactions in a date range (amounts in INR).',
    inputSchema: rangeSchema,
    annotations: READ,
  },
  async ({ start_date, end_date, categories }) => {
    if (end_date < start_date) return fail('end_date must not be before start_date.');
    const [transactions, source] = await Promise.all([select(start_date, end_date, categories), repo.getMoneySource()]);
    return ok({ source, currency: 'INR', transactions });
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await closeDatabase();
    process.exit(0);
  });
}
await serve(server);
