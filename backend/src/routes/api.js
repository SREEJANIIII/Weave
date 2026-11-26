// Express router for the Weave JSON/SSE API. Every /api endpoint lives here.
import { Router } from 'express';
import { PLANNED } from '../hub.js';
import { Run } from '../run.js';
import { runOffline, DEMO_QUESTIONS } from '../agent-offline.js';
import { runNim, explainError, hasCredentials, MODEL, BASE_URL } from '../agent-nim.js';
import { now, isoDate, fmtLongDate } from '../../lib/dates.js';
import { AppDataRepository } from '../../repositories/app-data-repository.js';
import { createConnectionsRouter } from './connections.js';

// Fields a person may edit on a draft before approving it.
const EDITABLE = {
  create_task: ['title', 'due'], create_event: ['title', 'date', 'start', 'end'],
  save_wishlist_item: ['product_name', 'brand', 'product_url', 'image_url', 'category', 'occasion', 'notes', 'description', 'price', 'status', 'product_id'],
  update_wishlist_item: ['product_name', 'brand', 'product_url', 'image_url', 'category', 'occasion', 'notes', 'description', 'price', 'status', 'product_id'],
  update_size_profile: ['bust', 'waist', 'hips', 'shoulder', 'inseam', 'height', 'unit', 'preferred_fit', 'preferred_categories'],
};

export async function statusPayload({ hub, state, appData }) {
  const T = now();
  let connections = {};
  if (appData) {
    try {
      connections = await appData.getConnectionsSummary();
    } catch {
      connections = {};
    }
  }
  const apps = hub.status().map((a) => {
    if (a.id === 'wishlist') return { ...a, data: 'MongoDB', sourceType: 'mongodb' };
    const conn = connections[a.id];
    return {
      ...a,
      data: conn?.sourceName ?? a.data,
      sourceType: conn?.sourceType ?? 'sample',
      providers: conn?.providers ?? ['sample'],
    };
  });
  return {
    today: isoDate(T),
    todayLabel: fmtLongDate(T),
    hour: T.getHours(),
    mode: state.mode,
    profileEncrypted: Boolean(process.env.WEAVE_PROFILE_ENCRYPTION_KEY),
    planners: {
      nim: { model: MODEL, baseUrl: BASE_URL, credentials: hasCredentials() },
      offline: { questions: DEMO_QUESTIONS },
    },
    apps,
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
  const record = res.data?.task ?? res.data?.event ?? res.data?.item ?? res.data?.profile ?? res.data?.deleted ?? res.data?.reminder ?? (Array.isArray(res.data?.reminders) ? res.data : null);
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
  } else if (p.tool === 'reconcile_reminders') {
    verified = !res.isError && Array.isArray(res.data?.reminders);
  } else if (p.tool === 'dismiss_reminder') {
    verified = !res.isError && Boolean(res.data?.reminder);
  }
  Object.assign(p, { status: verified ? 'done' : 'unverified', args, result: record, conflicts: res.data?.conflicts ?? [], decidedAt: new Date().toISOString() });
  return [200, { proposal: p }];
}

export function createApiRouter({ hub, proposals, state }) {
  const router = Router();
  const appData = new AppDataRepository();

  router.get('/status', async (req, res) => res.json(await statusPayload({ hub, state, appData })));
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
    const run = new Run({ hub, proposals, question: q, mode, model: mode === 'nim' ? MODEL : null, emit: send });
    send('run', { id: run.id, mode, model: run.model, question: q });
    try {
      if (mode === 'nim') await runNim(run);
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

  router.post('/apps/:id', async (req, res) => {
    const { enabled } = req.body ?? {};
    hub.setEnabled(req.params.id, enabled);
    res.json(await statusPayload({ hub, state, appData }));
  });

  router.post('/mode', async (req, res) => {
    const { mode } = req.body ?? {};
    if (!['nim', 'offline'].includes(mode)) return res.status(400).json({ error: 'Unknown planner.' });
    state.mode = mode;
    res.json(await statusPayload({ hub, state, appData }));
  });

  router.post('/reset', async (req, res) => {
    proposals.clear();
    await appData.resetAllDemo();
    await hub.restart();
    res.json(await statusPayload({ hub, state, appData }));
  });

  // Direct MCP-backed workspace routes for Wishlist UI, Size Profile, Size Intelligence, Reminders & Occasions.
  const appGuard = (res, serverId) => {
    if (hub.isAvailable(serverId)) return false;
    res.status(503).json({ error: `${serverId} app is switched off or unavailable.` });
    return true;
  };

  router.get('/wishlist', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const { occasion, brand, category, status = 'all' } = req.query;
    const r = await hub.call('wishlist', 'list_wishlist_items', { occasion, brand, category, status }, { summary: 'loaded wishlist items' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.post('/wishlist', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'save_wishlist_item', req.body ?? {}, { summary: 'saved wishlist item' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.status(201).json(r.data);
  });

  router.patch('/wishlist/:id', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'update_wishlist_item', { id: req.params.id, ...(req.body ?? {}) }, { summary: 'updated wishlist item' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.delete('/wishlist/:id', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'delete_wishlist_item', { id: req.params.id }, { summary: 'deleted wishlist item' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.get('/size-profile', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'get_size_profile', {}, { summary: 'loaded size profile' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json({ ...(r.data ?? {}), encrypted: Boolean(process.env.WEAVE_PROFILE_ENCRYPTION_KEY) });
  });

  router.put('/size-profile', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'update_size_profile', req.body ?? {}, { summary: 'updated size profile' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.delete('/size-profile', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'delete_size_profile', {}, { summary: 'deleted size profile' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.post('/size-match', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const { item_id, brand, category, region } = req.body ?? {};
    const m = await hub.call('wishlist', 'match_product_size', { item_id, brand, category, region }, { summary: 'matched product size' });
    if (m.isError) return res.status(400).json({ error: m.text });
    const targetBrand = brand ?? m.data?.item?.brand;
    const targetCategory = category ?? m.data?.item?.category;
    let chart = null;
    if (targetBrand && targetCategory) {
      const c = await hub.call('wishlist', 'get_brand_size_chart', { brand: targetBrand, category: targetCategory, region }, { summary: 'loaded brand chart' });
      if (!c.isError) chart = c.data?.chart ?? null;
    }
    return res.json({ ...(m.data ?? {}), chart });
  });

  router.get('/reminders', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const status = req.query.status ? String(req.query.status) : undefined;
    const r = await hub.call('wishlist', 'list_reminders', status ? { status } : {}, { summary: 'loaded reminders' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.post('/reminders/reconcile', async (req, res) => {
    if (appGuard(res, 'wishlist') || appGuard(res, 'calendar')) return;
    const T = now();
    const today = isoDate(T);
    const future = isoDate(new Date(T.getFullYear(), T.getMonth(), T.getDate() + 365));
    const [wRes, cRes] = await Promise.all([
      hub.call('wishlist', 'list_wishlist_items', { status: 'saved' }, { summary: 'reconcile items' }),
      hub.call('calendar', 'list_events', { start_date: today, end_date: future }, { summary: 'reconcile events' }),
    ]);
    if (wRes.isError) return res.status(400).json({ error: wRes.text });
    if (cRes.isError) return res.status(400).json({ error: cRes.text });
    const rawWindows = Array.isArray(req.body?.windows) ? req.body.windows : [30, 14, 7];
    const windows = [...new Set(rawWindows.map(Number).filter((w) => [30, 14, 7].includes(w)))];
    const r = await hub.call(
      'wishlist',
      'reconcile_reminders',
      {
        items: (wRes.data?.items ?? []).map((it) => ({ id: it.id, occasion: it.occasion || '', status: it.status || 'saved' })),
        events: (cRes.data?.events ?? []).map((ev) => ({ id: ev.id, title: ev.title, date: ev.date, occasion: ev.occasion })),
        windows: windows.length ? windows : [30, 14, 7],
      },
      { summary: 'reconciled reminders' },
    );
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.post('/reminders/:id/dismiss', async (req, res) => {
    if (appGuard(res, 'wishlist')) return;
    const r = await hub.call('wishlist', 'dismiss_reminder', { id: req.params.id }, { summary: 'dismissed reminder' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.get('/calendar/events', async (req, res) => {
    if (appGuard(res, 'calendar')) return;
    const T = now();
    const start_date = String(req.query.start_date || isoDate(T));
    const future = new Date(T.getFullYear(), T.getMonth(), T.getDate() + 180);
    const end_date = String(req.query.end_date || isoDate(future));
    const r = await hub.call('calendar', 'list_events', { start_date, end_date }, { summary: 'loaded calendar events' });
    if (r.isError) return res.status(400).json({ error: r.text });
    return res.json(r.data);
  });

  router.use(createConnectionsRouter({ appData }));

  // Unknown API routes keep the original JSON 404 contract.
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}
