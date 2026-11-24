#!/usr/bin/env node
// Weave demo MCP server: Money (read-only).
// Reads a statement CSV you provide (WEAVE_STATEMENT_CSV or data/statement.csv: date,merchant,amount,category).
// Without one it serves generated sample transactions. It never connects to a bank or payment app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';
import { createServer, ok, fail, serve, READ, DATE_RE } from './lib/kit.js';
import { transactions as sampleTransactions } from './lib/sample-data.js';
import { fmtDay } from '../lib/dates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = process.env.WEAVE_STATEMENT_CSV || path.join(here, '..', 'data', 'statement.csv');

function loadCsv(file) {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const cols = header.toLowerCase().split(',').map((c) => c.trim());
  const at = (name) => cols.indexOf(name);
  return rows.map((row, i) => {
    const cells = row.split(',').map((c) => c.trim());
    return {
      id: `txn_csv_${i + 1}`,
      kind: 'transaction',
      date: cells[at('date')],
      merchant: cells[at('merchant')],
      amount: Math.abs(Number(cells[at('amount')])),
      category: cells[at('category')] || 'Other',
    };
  });
}

const fromFile = fs.existsSync(csvPath);
const transactions = fromFile ? loadCsv(csvPath) : sampleTransactions();
const SOURCE = fromFile ? { type: 'imported file', name: path.basename(csvPath) } : { type: 'sample data', name: 'generated sample statement' };
const GROUPS = { food: ['Groceries', 'Dining out', 'Food delivery'] };

function expand(categories) {
  if (!categories?.length) return null;
  return categories.flatMap((c) => GROUPS[c.toLowerCase()] ?? [c]).map((c) => c.toLowerCase());
}
function select(start_date, end_date, categories) {
  const wanted = expand(categories);
  return transactions
    .filter((t) => t.date >= start_date && t.date <= end_date)
    .filter((t) => !wanted || wanted.includes(t.category.toLowerCase()))
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
    const list = select(start_date, end_date, categories);
    const sum = (xs) => xs.reduce((s, t) => s + t.amount, 0);
    const group = (key) =>
      Object.entries(Object.groupBy(list, (t) => t[key])).map(([k, xs]) => ({ [key]: k, total: sum(xs), count: xs.length }));
    const label = categories?.length ? categories.join(', ') : 'All';
    return ok({
      source: SOURCE,
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
    return ok({ source: SOURCE, currency: 'INR', transactions: select(start_date, end_date, categories) });
  },
);

await serve(server);
