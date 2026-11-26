// Weave prototype server: serves the web UI and a small JSON/SSE API on localhost.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hub, PLANNED } from './hub.js';
import { Run, ProposalStore } from './run.js';
import { runOffline, DEMO_QUESTIONS } from './agent-offline.js';
import { runClaude, explainError, hasCredentials, MODEL, EFFORT } from './agent-claude.js';
import { now, isoDate, fmtLongDate } from '../lib/dates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, '..', 'frontend');
const PORT = Number(process.env.PORT) || 4321;
const HOST = '127.0.0.1';

const hub = new Hub(root);
const proposals = new ProposalStore();
const state = {
  mode: ['claude', 'offline'].includes(process.env.WEAVE_MODE) ? process.env.WEAVE_MODE : hasCredentials() ? 'claude' : 'offline',
};

// Fields a person may edit on a draft before approving it.
const EDITABLE = { create_task: ['title', 'due'], create_event: ['title', 'date', 'start', 'end'] };

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) throw new Error('Request too large');
  }
  return body ? JSON.parse(body) : {};
}

function statusPayload() {
  const T = now();
  return {
    today: isoDate(T),
    todayLabel: fmtLongDate(T),
    hour: T.getHours(),
    mode: state.mode,
    planners: {
      claude: { model: MODEL, effort: EFFORT, credentials: hasCredentials() },
      offline: { questions: DEMO_QUESTIONS },
    },
    apps: hub.status(),
    planned: PLANNED,
    suggestions: DEMO_QUESTIONS,
  };
}

async function ask(req, res) {
  const { question = '' } = await readJson(req);
  const q = String(question).trim().slice(0, 600);
  if (!q) return json(res, 400, { error: 'Ask a question first.' });

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (event, data) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const mode = state.mode;
  const run = new Run({ hub, proposals, question: q, mode, model: mode === 'claude' ? MODEL : null, emit: send });
  send('run', { id: run.id, mode, model: run.model, question: q });
  try {
    if (mode === 'claude') await runClaude(run);
    else await runOffline(run);
  } catch (err) {
    console.error('[ask]', err);
    send('error', explainError(err));
  }
  send('done', { ms: Math.round(performance.now() - run.started) });
  res.end();
}

async function approve(id, changes = {}) {
  const p = proposals.get(id);
  if (!p) return [404, { error: 'No such draft.' }];
  if (p.status !== 'pending') return [409, { error: `This draft is already ${p.status}.`, proposal: p }];
  const args = { ...p.args };
  for (const key of EDITABLE[p.tool] ?? []) {
    if (changes[key] !== undefined && changes[key] !== null && String(changes[key]).trim() !== '') args[key] = String(changes[key]).trim();
  }
  p.status = 'running';
  const res = await hub.call(p.server, p.tool, args, { summary: 'approved by you' });
  if (res.isError) {
    Object.assign(p, { status: 'failed', error: res.text, args });
    return [200, { proposal: p }];
  }
  // Only report success after reading the new record back from the app.
  const record = res.data?.task ?? res.data?.event ?? null;
  const getter = { create_task: 'get_task', create_event: 'get_event' }[p.tool];
  let verified = false;
  if (record?.id && getter) {
    const check = await hub.call(p.server, getter, { id: record.id }, { summary: 'read back to confirm' });
    verified = !check.isError && (check.data?.task?.id === record.id || check.data?.event?.id === record.id);
  }
  Object.assign(p, { status: verified ? 'done' : 'unverified', args, result: record, conflicts: res.data?.conflicts ?? [], decidedAt: new Date().toISOString() });
  return [200, { proposal: p }];
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(webRoot, rel));
  if (!file.startsWith(webRoot + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (!pathname.startsWith('/api/')) return serveStatic(req, res);
    if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'Cross-origin requests are not allowed.' });

    if (req.method === 'GET' && pathname === '/api/status') return json(res, 200, statusPayload());
    if (req.method === 'GET' && pathname === '/api/activity') return json(res, 200, { activity: hub.activity.slice(-150) });
    if (req.method === 'POST' && pathname === '/api/ask') return await ask(req, res);

    let m;
    if (req.method === 'POST' && (m = pathname.match(/^\/api\/proposals\/([\w-]+)\/approve$/))) {
      const { changes } = await readJson(req);
      const [status, body] = await approve(m[1], changes ?? {});
      return json(res, status, body);
    }
    if (req.method === 'POST' && (m = pathname.match(/^\/api\/proposals\/([\w-]+)\/dismiss$/))) {
      const p = proposals.get(m[1]);
      if (!p) return json(res, 404, { error: 'No such draft.' });
      if (p.status === 'pending') Object.assign(p, { status: 'dismissed', decidedAt: new Date().toISOString() });
      return json(res, 200, { proposal: p });
    }
    if (req.method === 'POST' && (m = pathname.match(/^\/api\/apps\/(\w+)$/))) {
      const { enabled } = await readJson(req);
      hub.setEnabled(m[1], enabled);
      return json(res, 200, statusPayload());
    }
    if (req.method === 'POST' && pathname === '/api/mode') {
      const { mode } = await readJson(req);
      if (!['claude', 'offline'].includes(mode)) return json(res, 400, { error: 'Unknown planner.' });
      state.mode = mode;
      return json(res, 200, statusPayload());
    }
    if (req.method === 'POST' && pathname === '/api/reset') {
      proposals.clear();
      await hub.restart();
      return json(res, 200, statusPayload());
    }
    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
});

await hub.start();
server.listen(PORT, HOST, () => {
  const apps = hub.status().map((a) => `${a.id} (${a.status === 'connected' ? `${a.tools.length} tools` : a.status})`).join(', ');
  console.log(`\n  Weave prototype  →  http://localhost:${PORT}\n`);
  console.log(`  Planner   ${state.mode === 'claude' ? `Claude (${MODEL}, effort ${EFFORT})` : 'Offline script'}${hasCredentials() ? '' : '  ·  no Anthropic credentials found'}`);
  console.log(`  MCP apps  ${apps}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await hub.stop();
    process.exit(0);
  });
}
