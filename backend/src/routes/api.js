// Express router for the Weave JSON/SSE API. Every /api endpoint lives here.
import { Router } from 'express';
import { PLANNED } from '../hub.js';
import { Run } from '../run.js';
import { runOffline, DEMO_QUESTIONS } from '../agent-offline.js';
import { runClaude, explainError, hasCredentials, MODEL, EFFORT } from '../agent-claude.js';
import { now, isoDate, fmtLongDate } from '../../lib/dates.js';

// Fields a person may edit on a draft before approving it.
const EDITABLE = {
  create_task: ['title', 'due'], create_event: ['title', 'date', 'start', 'end'],
  save_wishlist_item: ['product_name', 'brand', 'product_url', 'image_url', 'category', 'occasion', 'notes', 'product_id'],
  update_wishlist_item: ['product_name', 'brand', 'product_url', 'image_url', 'category', 'occasion', 'notes', 'product_id'],
  update_size_profile: ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height', 'unit', 'preferred_fit', 'preferred_categories'],
};

export function statusPayload({ hub, state }) {
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

async function approve(hub, proposals, id, changes = {}) {
  const p = proposals.get(id);
  if (!p) return [404, { error: 'No such draft.' }];
  if (p.status !== 'pending') return [409, { error: `This draft is already ${p.status}.`, proposal: p }];
  const args = { ...p.args };
  for (const key of EDITABLE[p.tool] ?? []) {
    if (changes[key] !== undefined && changes[key] !== null && (Array.isArray(changes[key]) || String(changes[key]).trim() !== '')) args[key] = Array.isArray(changes[key]) ? changes[key] : String(changes[key]).trim();
  }
  p.status = 'running';
  const res = await hub.call(p.server, p.tool, args, { summary: 'approved by you' });
  if (res.isError) {
    Object.assign(p, { status: 'failed', error: res.text, args });
    return [200, { proposal: p }];
  }
  // Only report success after reading the new record back from the app.
  const record = res.data?.task ?? res.data?.event ?? res.data?.item ?? res.data?.profile ?? res.data?.deleted ?? null;
  const getter = { create_task: 'get_task', create_event: 'get_event', save_wishlist_item: 'get_wishlist_item', update_wishlist_item: 'get_wishlist_item' }[p.tool];
  let verified = false;
  if (record?.id && getter) {
    const check = await hub.call(p.server, getter, { id: record.id }, { summary: 'read back to confirm' });
    verified = !check.isError && (check.data?.task?.id === record.id || check.data?.event?.id === record.id || check.data?.item?.id === record.id);
  } else if (p.tool === 'update_size_profile') {
    verified = !res.isError && Boolean(res.data?.profile);
  } else if (p.tool === 'delete_size_profile') {
    verified = !res.isError && res.data?.deleted === true;
  } else if (p.tool === 'delete_wishlist_item') {
    verified = !res.isError && Boolean(res.data?.deleted);
  }
  Object.assign(p, { status: verified ? 'done' : 'unverified', args, result: record, conflicts: res.data?.conflicts ?? [], decidedAt: new Date().toISOString() });
  return [200, { proposal: p }];
}

export function createApiRouter({ hub, proposals, state }) {
  const router = Router();

  router.get('/status', (req, res) => res.json(statusPayload({ hub, state })));
  router.get('/activity', (req, res) => res.json({ activity: hub.activity.slice(-150) }));

  router.post('/ask', async (req, res) => {
    const { question = '' } = req.body ?? {};
    const q = String(question).trim().slice(0, 600);
    if (!q) return res.status(400).json({ error: 'Ask a question first.' });

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
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
  });

  router.post('/proposals/:id/approve', async (req, res) => {
    const { changes } = req.body ?? {};
    const [status, body] = await approve(hub, proposals, req.params.id, changes ?? {});
    res.status(status).json(body);
  });

  router.post('/proposals/:id/dismiss', (req, res) => {
    const p = proposals.get(req.params.id);
    if (!p) return res.status(404).json({ error: 'No such draft.' });
    if (p.status === 'pending') Object.assign(p, { status: 'dismissed', decidedAt: new Date().toISOString() });
    return res.json({ proposal: p });
  });

  router.post('/apps/:id', (req, res) => {
    const { enabled } = req.body ?? {};
    hub.setEnabled(req.params.id, enabled);
    res.json(statusPayload({ hub, state }));
  });

  router.post('/mode', (req, res) => {
    const { mode } = req.body ?? {};
    if (!['claude', 'offline'].includes(mode)) return res.status(400).json({ error: 'Unknown planner.' });
    state.mode = mode;
    res.json(statusPayload({ hub, state }));
  });

  router.post('/reset', async (req, res) => {
    proposals.clear();
    await hub.restart();
    res.json(statusPayload({ hub, state }));
  });

  // Unknown API routes keep the original JSON 404 contract.
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}
