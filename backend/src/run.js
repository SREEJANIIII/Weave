// One question = one Run. Both planners (NVIDIA and offline) work through this object, so the
// rules are enforced in one place:
//   - reads go through MCP and every record they return becomes a citable source;
//   - writes are never executed here, only drafted as proposals for the user to approve;
//   - the final answer may only cite records that were actually read.
import { randomUUID } from 'node:crypto';
import { isReadOnly } from './hub.js';

/** Walk a tool's structured result and collect records ({ id, kind, ... }). */
function collectRecords(value, out = [], depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectRecords(v, out, depth + 1);
    return out;
  }
  if (typeof value.id === 'string' && typeof value.kind === 'string') out.push(value);
  for (const v of Object.values(value)) if (v && typeof v === 'object') collectRecords(v, out, depth + 1);
  return out;
}

/** Copy of a result where each record carries the source_id the model should cite. */
function withSourceIds(server, value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) return value.map((v) => withSourceIds(server, v, depth + 1));
  const copy = {};
  for (const [k, v] of Object.entries(value)) copy[k] = withSourceIds(server, v, depth + 1);
  if (typeof value.id === 'string' && typeof value.kind === 'string') return { source_id: `${server}:${value.id}`, ...copy };
  return copy;
}

const COUNT_KEYS = ['events', 'notes', 'tasks', 'transactions', 'slots', 'items', 'reminders', 'appliances', 'documents', 'deadlines'];
function safeArgs(server, tool, args) {
  if (server !== 'wishlist' || !['get_size_profile', 'update_size_profile', 'match_product_size'].includes(tool)) return args;
  const copy = { ...args };
  for (const key of ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height', 'measurements']) delete copy[key];
  return { ...copy, redacted: true };
}
function describe(tool, data) {
  if (!data) return '';
  for (const key of COUNT_KEYS) {
    if (Array.isArray(data[key])) {
      const n = data[key].length;
      const noun = key === 'slots' ? 'free slot' : key.slice(0, -1);
      return `${n} ${noun}${n === 1 ? '' : 's'}`;
    }
  }
  if (data.summary?.title) return data.summary.title;
  if (data.note) return data.note.title;
  if (data.task) return data.task.title;
  if (data.event) return data.event.title;
  if (data.item) return data.item.product_name;
  if (data.appliance) return data.appliance.name;
  if (data.document) return data.document.originalName;
  if (data.deadline) return data.deadline.title;
  if (data.deleted?.product_name) return data.deleted.product_name;
  if (data.match?.recommendation) return `Size ${data.match.recommendation}`;
  if (data.profile) return 'size profile';
  return 'done';
}

export class ProposalStore {
  constructor() {
    this.items = new Map();
  }
  add(p) {
    this.items.set(p.id, p);
    return p;
  }
  get(id) {
    return this.items.get(id);
  }
  clear() {
    this.items.clear();
  }
}

export class Run {
  constructor({ hub, proposals, question, mode, model, emit }) {
    this.id = randomUUID();
    this.hub = hub;
    this.proposals = proposals;
    this.question = question;
    this.mode = mode;
    this.model = model;
    this.emit = emit;
    this.sources = new Map(); // source_id -> { source_id, server, app, record }
    this.steps = [];
    this.drafts = [];
    this.answer = null;
    this.started = performance.now();
  }

  app(server) {
    return this.hub.servers.get(server)?.def.name ?? server;
  }

  #step(step) {
    this.emit('step', step);
  }

  /** Read through MCP. Returns { ok, data (with source_ids), text, error }. */
  async read(server, tool, args = {}) {
    const step = { id: this.steps.length + 1, server, app: this.app(server), tool, args: safeArgs(server, tool, args), kind: 'read', status: 'running' };
    this.steps.push(step);
    this.#step(step);
    const res = await this.hub.call(server, tool, args, { run: this.id });
    step.ms = Math.round(res.ms);
    if (res.isError) {
      Object.assign(step, { status: 'error', summary: res.text.slice(0, 200) });
      this.#step(step);
      return { ok: false, error: res.text, data: null };
    }
    for (const record of collectRecords(res.data)) {
      const source_id = `${server}:${record.id}`;
      const seen = this.sources.get(source_id);
      // A record can come back twice (a list summary, then the full item): keep the richest copy.
      this.sources.set(source_id, { source_id, server, app: this.app(server), record: { ...(seen?.record ?? {}), ...record } });
    }
    Object.assign(step, { status: 'done', summary: describe(tool, res.data) });
    this.#step(step);
    return { ok: true, data: withSourceIds(server, res.data), raw: res.data };
  }

  /** Draft a change. Nothing is executed until the user approves it. */
  propose(server, tool, args, { why = '', sourceIds = [] } = {}) {
    const def = this.hub.findTool(server, tool);
    if (!def) throw new Error(`Unknown tool ${server}.${tool}`);
    if (isReadOnly(def)) throw new Error(`${server}.${tool} is read-only; call it directly instead.`);
    const proposal = this.proposals.add({
      id: randomUUID().slice(0, 8),
      run: this.id,
      server,
      app: this.app(server),
      tool,
      toolTitle: def.title ?? tool,
      args,
      why,
      sourceIds: sourceIds.filter((s) => this.sources.has(s)),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    this.drafts.push(proposal);
    const step = { id: this.steps.length + 1, server, app: this.app(server), tool, args: safeArgs(server, tool, args), kind: 'write', status: 'held', summary: 'waiting for your approval' };
    this.steps.push(step);
    this.hub.log({ server, method: 'held', tool, args, ms: 0, write: true, summary: 'drafted, not run (needs approval)', run: this.id });
    this.#step(step);
    this.emit('proposal', proposal);
    return proposal;
  }

  /** Validate citations, number the cited sources and send the answer to the client. */
  finish(answer) {
    const list = (value) => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []);
    const valid = (ids) => [...new Set(list(ids).filter((id) => this.sources.has(id)))];
    const sections = list(answer.sections)
      .map((s) => ({ title: s.title, items: list(s.items).map((it) => ({ text: it.text, detail: it.detail ?? '', sourceIds: valid(it.source_ids ?? it.sourceIds) })) }))
      .filter((s) => s.items.length);

    // Number sources in the order the answer first cites them, then the drafts' sources.
    const order = [];
    const cite = (id) => !order.includes(id) && order.push(id);
    sections.forEach((s) => s.items.forEach((it) => it.sourceIds.forEach(cite)));
    this.drafts.forEach((d) => d.sourceIds.forEach(cite));

    const sources = [...this.sources.values()].map((s) => ({ ...s, n: order.indexOf(s.source_id) + 1 || null }));
    sources.sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9));

    this.answer = {
      headline: answer.headline ?? '',
      sections,
      caveats: list(answer.caveats).filter(Boolean),
      sources,
      proposals: this.drafts,
      stats: {
        ms: Math.round(performance.now() - this.started),
        reads: this.steps.filter((s) => s.kind === 'read').length,
        apps: [...new Set(this.steps.filter((s) => s.kind === 'read' && s.status === 'done').map((s) => s.app))],
        mode: this.mode,
        model: this.model ?? null,
      },
    };
    this.emit('answer', this.answer);
    return this.answer;
  }
}
