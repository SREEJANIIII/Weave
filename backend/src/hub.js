// Weave's MCP client side: spawns each app's MCP server over stdio, discovers its tools
// (tools/list) and calls them (tools/call). Every call is logged so the UI can show it.
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const SERVER_DEFS = [
  { id: 'calendar', name: 'Calendar', script: 'mcp-servers/calendar.js', blurb: 'Events and free time' },
  { id: 'notes', name: 'Notes', script: 'mcp-servers/notes.js', blurb: 'Meeting notes and plans' },
  { id: 'tasks', name: 'Tasks', script: 'mcp-servers/tasks.js', blurb: 'To-dos and due dates' },
  { id: 'money', name: 'Money', script: 'mcp-servers/money.js', blurb: 'Imported statement' },
  { id: 'wishlist', name: 'Wishlist & sizes', script: 'mcp-servers/wishlist.js', blurb: 'Saved products and size intelligence' },
];

// Shown in the UI as planned. Nothing here is connected.
export const PLANNED = [
  { id: 'email', name: 'Email', blurb: 'Receipts and follow-ups' },
  { id: 'fitness', name: 'Fitness apps', blurb: 'Workouts and activity' },
  { id: 'travel', name: 'Travel', blurb: 'Bookings and itineraries' },
  { id: 'learning', name: 'Learning', blurb: 'Classes and deadlines' },
  { id: 'home', name: 'Home', blurb: 'Bills and warranties' },
];

/** A tool only runs without approval if its server explicitly marks it read-only. */
export const isReadOnly = (tool) => tool?.annotations?.readOnlyHint === true;

export class Hub {
  constructor(root) {
    this.root = root;
    this.servers = new Map();
    this.activity = [];
    this.seq = 0;
  }

  async start() {
    await Promise.all(SERVER_DEFS.map((def) => this.#connect(def)));
  }

  async restart() {
    await this.stop();
    const enabled = new Map([...this.servers].map(([id, s]) => [id, s.enabled]));
    this.servers.clear();
    this.activity = [];
    await Promise.all(SERVER_DEFS.map((def) => this.#connect(def, enabled.get(def.id) ?? true)));
  }

  async stop() {
    await Promise.allSettled([...this.servers.values()].map((s) => s.client?.close()));
  }

  async #connect(def, enabled = true) {
    const entry = { def, client: null, tools: [], status: 'connecting', enabled, error: null, data: 'sample data' };
    this.servers.set(def.id, entry);
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'TZ', 'WEAVE_TODAY', 'WEAVE_STATEMENT_CSV'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
    );
    try {
      const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(this.root, def.script)], cwd: this.root, env, stderr: 'inherit' });
      const client = new Client({ name: 'weave', version: '0.1.0' });
      const t0 = performance.now();
      await client.connect(transport);
      const { tools } = await client.listTools();
      Object.assign(entry, { client, tools, status: 'connected' });
      this.log({ server: def.id, method: 'tools/list', ms: performance.now() - t0, summary: `${tools.length} tools` });
    } catch (err) {
      Object.assign(entry, { status: 'error', error: err.message });
      this.log({ server: def.id, method: 'connect', ms: 0, summary: `failed: ${err.message}`, isError: true });
    }
  }

  log(item) {
    const safe = { ...item };
    // Measurements are sensitive personal information. Keep them out of the activity feed.
    if (safe.server === 'wishlist' && safe.args && ['get_size_profile', 'update_size_profile', 'match_product_size'].includes(safe.tool)) {
      safe.args = { ...safe.args };
      for (const key of ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height', 'measurements']) delete safe.args[key];
      safe.args.redacted = true;
    }
    const entry = { seq: ++this.seq, at: new Date().toISOString(), ...safe, ms: Math.round(item.ms ?? 0) };
    this.activity.push(entry);
    if (this.activity.length > 400) this.activity.shift();
    return entry;
  }

  setEnabled(id, enabled) {
    const s = this.servers.get(id);
    if (!s) throw new Error(`Unknown app ${id}`);
    s.enabled = Boolean(enabled);
  }

  isAvailable(id) {
    const s = this.servers.get(id);
    return Boolean(s && s.enabled && s.status === 'connected');
  }

  /** Tools the assistant may use right now (connected and switched on). */
  availableTools() {
    return [...this.servers.values()]
      .filter((s) => s.enabled && s.status === 'connected')
      .flatMap((s) => s.tools.map((tool) => ({ server: s.def.id, app: s.def.name, tool })));
  }

  findTool(serverId, name) {
    return this.servers.get(serverId)?.tools.find((t) => t.name === name) ?? null;
  }

  /** tools/call. Returns { isError, data, text, ms } and never throws for tool-level errors. */
  async call(serverId, name, args = {}, meta = {}) {
    const s = this.servers.get(serverId);
    if (!s || s.status !== 'connected') return { isError: true, text: `${serverId} is not connected.`, data: null, ms: 0 };
    if (!s.enabled) return { isError: true, text: `${s.def.name} is switched off by the user.`, data: null, ms: 0 };
    const t0 = performance.now();
    let result;
    try {
      result = await s.client.callTool({ name, arguments: args });
    } catch (err) {
      result = { isError: true, content: [{ type: 'text', text: err.message }] };
    }
    const ms = performance.now() - t0;
    const text = (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const isError = Boolean(result.isError);
    this.log({ server: serverId, method: 'tools/call', tool: name, args, ms, isError, write: !isReadOnly(this.findTool(serverId, name)), ...meta, summary: isError ? text.slice(0, 140) : meta.summary });
    return { isError, data: result.structuredContent ?? null, text, ms };
  }

  status() {
    return SERVER_DEFS.map((def) => {
      const s = this.servers.get(def.id);
      return {
        id: def.id,
        name: def.name,
        blurb: def.blurb,
        status: s?.status ?? 'missing',
        enabled: s?.enabled ?? false,
        error: s?.error ?? null,
        data: 'sample data',
        tools: (s?.tools ?? []).map((t) => ({ name: t.name, title: t.title ?? t.name, description: t.description ?? '', readOnly: isReadOnly(t) })),
      };
    });
  }
}
