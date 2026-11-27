import crypto from 'node:crypto';
import { Router } from 'express';
import { encryptProfile, decryptProfile } from '../../db/database.js';
import {
  createGoogleAuthUrl,
  createGoogleKeepAuthUrl,
  exchangeGoogleCode,
  fetchCalDavEvents,
  fetchGoogleCalendarEvents,
  fetchGoogleKeepNotes,
  fetchGoogleTasks,
  fetchIcsFeed,
  fetchWishlistUrlMetadata,
  getGoogleOAuthConfig,
  parseGoogleKeepJson,
  parseIcs,
  parseIcsTodos,
  parseMarkdownNote,
  parseStatementCsv,
  parseTasksText,
  parseTodoistCsv,
  readMarkdownFolder,
  refreshGoogleToken,
} from '../../lib/connectors.js';

const OAUTH_STATES = new Map(); // state -> { createdAt, returnTo }

/** Where to send the person after Google sign-in: only this machine's Weave or its Vite dev server. */
function safeReturn(origin) {
  const port = Number(process.env.PORT) || 4321;
  const allowed = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  return allowed.includes(String(origin ?? '')) ? String(origin) : '';
}

/** Read and forget an OAuth state; returns null when it is unknown or older than 10 minutes. */
function takeState(state) {
  const entry = OAUTH_STATES.get(String(state ?? ''));
  OAUTH_STATES.delete(String(state ?? ''));
  if (!entry || Date.now() - entry.createdAt > 10 * 60 * 1000) return null;
  return entry;
}

const EXTERNAL_CONNECTORS = [
  {
    id: 'google_calendar',
    name: 'Google Calendar & Tasks',
    category: 'Supported via iCal link, .ics, or Google OAuth',
    supportedNow: 'Connect immediately using your Google Calendar Secret iCal URL or exported .ics, or add GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in backend/.env for 1-click OAuth.',
    whyNeedsOAuth: 'Direct 2-way Google API sync requires your own Google Cloud OAuth client credentials.',
  },
  {
    id: 'apple_calendar',
    name: 'iPhone / Apple iCloud Calendar & Reminders',
    category: 'Supported via webcal://, .ics export, or CalDAV',
    supportedNow: 'Turn on Shared Calendar (webcal://) on iPhone OR use Apple ID + App-Specific Password via private CalDAV.',
    whyNeedsOAuth: 'iOS does not offer web OAuth APIs; Apple uses iCloud CalDAV and standard .ics feeds.',
  },
  {
    id: 'samsung_calendar',
    name: 'Samsung Calendar & Notes',
    category: 'Supported via .ics export / Google & Outlook sync',
    supportedNow: 'Export/Share events as .ics from Samsung Calendar, or connect the Google/Outlook account your Samsung Calendar syncs with.',
    whyNeedsOAuth: 'Samsung Account does not expose a third-party calendar web API.',
  },
  {
    id: 'email',
    name: 'Email (Gmail / Outlook)',
    category: 'Planned OAuth integration',
    supportedNow: 'Paste order receipts into Notes or product links into Smart Wishlist.',
    whyNeedsOAuth: 'Requires verified Google/Microsoft Mail OAuth scopes.',
  },
  {
    id: 'fitness',
    name: 'Fitness (Apple Health / Strava)',
    category: 'Planned integration',
    supportedNow: 'Edit your Workout plan in Notes and Weave finds buffered free slots in your live Calendar.',
    whyNeedsOAuth: 'HealthKit is on-device iOS only; Strava requires OAuth app registration.',
  },
];

function redactConnection(conn) {
  if (!conn) return conn;
  const safeConfig = { ...(conn.config ?? {}) };
  delete safeConfig.encryptedAuth;
  delete safeConfig.encryptedTokens;
  return { ...conn, config: safeConfig, hasCredentials: Boolean(conn.config?.encryptedAuth || conn.config?.encryptedTokens) };
}

export function createConnectionsRouter({ appData }) {
  const router = Router();

  router.get('/connections', async (req, res) => {
    const [connectionsList, summary, events, notes, tasks, txns] = await Promise.all([
      appData.listConnections(),
      appData.getConnectionsSummary(),
      appData.listEvents(),
      appData.listNotes(),
      appData.listTasks(),
      appData.listTransactions(),
    ]);
    const googleOAuth = getGoogleOAuthConfig();
    return res.json({
      connections: summary,
      list: connectionsList.map(redactConnection),
      counts: { calendar: events.length, notes: notes.length, tasks: tasks.length, money: txns.length },
      oauth: { google: { configured: googleOAuth.configured, redirectUri: googleOAuth.redirectUri } },
      external: EXTERNAL_CONNECTORS,
    });
  });

  router.get('/app-data/:app', async (req, res) => {
    const id = req.params.app;
    if (id === 'calendar') return res.json({ events: await appData.listEvents() });
    if (id === 'notes') return res.json({ notes: await appData.listNotes() });
    if (id === 'tasks') return res.json({ tasks: await appData.listTasks() });
    if (id === 'money') {
      const [transactions, source] = await Promise.all([appData.listTransactions(), appData.getMoneySource()]);
      return res.json({ transactions, source });
    }
    return res.status(404).json({ error: 'Unknown app.' });
  });

  router.post('/connections/:app/sample', async (req, res) => {
    const id = req.params.app;
    if (id === 'calendar') await appData.resetCalendarSample();
    else if (id === 'notes') await appData.resetNotesSample();
    else if (id === 'tasks') await appData.resetTasksSample();
    else if (id === 'money') await appData.resetMoneySample();
    else return res.status(404).json({ error: 'Unknown app.' });
    return res.json({ ok: true, list: (await appData.listConnections()).map(redactConnection) });
  });

  router.delete('/connections/:id', async (req, res) => {
    const removed = await appData.removeConnection(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Connection not found.' });
    return res.json({ ok: true, removed: redactConnection(removed), list: (await appData.listConnections()).map(redactConnection) });
  });

  router.post('/connections/:id/sync', async (req, res) => {
    const conn = await appData.getConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });
    try {
      if (conn.sourceType === 'ics_url' && conn.config?.feedUrl) {
        const events = await fetchIcsFeed(conn.config.feedUrl);
        const result = await appData.importEvents(events, {
          connectionId: conn.id,
          provider: conn.provider,
          sourceType: 'ics_url',
          sourceName: conn.sourceName,
          config: conn.config,
        });
        return res.json({ ok: true, imported: result.imported, connection: redactConnection(result.connection) });
      }
      if (conn.sourceType === 'caldav' && conn.config?.encryptedAuth) {
        const creds = decryptProfile(conn.config.encryptedAuth.payload, conn.config.encryptedAuth.encrypted);
        const events = await fetchCalDavEvents({ serverUrl: conn.config.serverUrl, username: creds.username, password: creds.password });
        const result = await appData.importEvents(events, {
          connectionId: conn.id,
          provider: conn.provider,
          sourceType: 'caldav',
          sourceName: conn.sourceName,
          config: conn.config,
        });
        return res.json({ ok: true, imported: result.imported, connection: redactConnection(result.connection) });
      }
      if (conn.sourceType === 'markdown_folder' && conn.config?.folderPath) {
        const parsedNotes = readMarkdownFolder(conn.config.folderPath);
        const result = await appData.importNotes(parsedNotes, {
          connectionId: conn.id,
          provider: conn.provider,
          sourceType: 'markdown_folder',
          sourceName: conn.sourceName,
          config: conn.config,
        });
        return res.json({ ok: true, imported: result.imported, connection: redactConnection(result.connection) });
      }
      if (conn.sourceType === 'google_oauth' && conn.config?.encryptedTokens) {
        const cfg = getGoogleOAuthConfig();
        if (!cfg.configured) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.');
        const toks = decryptProfile(conn.config.encryptedTokens.payload, conn.config.encryptedTokens.encrypted);
        let accessToken = toks.access_token;
        if (toks.refresh_token) {
          const refreshed = await refreshGoogleToken({ refreshToken: toks.refresh_token, clientId: cfg.clientId, clientSecret: cfg.clientSecret });
          accessToken = refreshed.access_token || accessToken;
        }
        if (conn.app === 'calendar') {
          const events = await fetchGoogleCalendarEvents(accessToken);
          const result = await appData.importEvents(events, {
            connectionId: conn.id,
            provider: 'google_calendar',
            sourceType: 'google_oauth',
            sourceName: conn.sourceName,
            config: conn.config,
          });
          return res.json({ ok: true, imported: result.imported, connection: redactConnection(result.connection) });
        }
        if (conn.app === 'tasks') {
          const tasks = await fetchGoogleTasks(accessToken);
          const result = await appData.importTasks(tasks, {
            connectionId: conn.id,
            provider: 'google_tasks',
            sourceType: 'google_oauth',
            sourceName: conn.sourceName,
            config: conn.config,
          });
          return res.json({ ok: true, imported: result.imported, connection: redactConnection(result.connection) });
        }
        if (conn.app === 'notes' && conn.provider === 'google_keep') {
          const notes = await fetchGoogleKeepNotes(accessToken);
          const result = await appData.importNotes(notes, {
            connectionId: conn.id,
            provider: 'google_keep',
            sourceType: 'google_oauth',
            sourceName: conn.sourceName,
            config: conn.config,
            replaceAll: false,
          });
          return res.json({ ok: true, imported: result.imported, connection: redactConnection(result.connection) });
        }
      }
      return res.status(400).json({ error: 'This connection was uploaded from a local file; upload a newer file to update it.' });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Sync failed.' });
    }
  });

  // Calendar .ics file upload, ICS feed URL, and CalDAV (iPhone/iCloud)
  router.post('/connections/calendar/ics', async (req, res) => {
    const { icsText, icsUrl, fileName, provider = 'custom_ics', replaceExisting = false } = req.body ?? {};
    const providerLabels = {
      google_calendar: 'Google Calendar',
      apple_calendar: 'iPhone / iCloud Calendar',
      samsung_calendar: 'Samsung Calendar',
      outlook_calendar: 'Outlook Calendar',
      custom_ics: 'Imported calendar',
    };
    try {
      let events;
      let sourceType = 'ics_file';
      let sourceName = fileName || `${providerLabels[provider] || 'Calendar'} (.ics)`;
      const config = {};
      if (icsUrl) {
        events = await fetchIcsFeed(icsUrl);
        sourceType = 'ics_url';
        const host = new URL(String(icsUrl).replace(/^webcal:\/\//i, 'https://')).hostname;
        sourceName = provider && provider !== 'custom_ics'
          ? `${providerLabels[provider] || provider} (${host})`
          : fileName || `Feed: ${host}`;
        config.feedUrl = String(icsUrl).trim();
      } else if (icsText) {
        events = parseIcs(icsText);
        if (!events.length) throw new Error('No valid VEVENT entries found in that .ics file.');
      } else {
        return res.status(400).json({ error: 'Provide either an .ics file or a calendar feed URL.' });
      }
      const result = await appData.importEvents(events, {
        provider,
        sourceType,
        sourceName,
        config,
        replaceAll: Boolean(replaceExisting),
      });
      return res.status(201).json({
        imported: result.imported,
        sourceName,
        connection: redactConnection(result.connection),
        events: await appData.listEvents(),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not import calendar.' });
    }
  });

  router.post('/connections/calendar/caldav', async (req, res) => {
    const {
      serverUrl = 'https://caldav.icloud.com/',
      username,
      password,
      provider = 'apple_calendar',
      rememberCredentials = true,
      replaceExisting = false,
    } = req.body ?? {};
    try {
      const events = await fetchCalDavEvents({ serverUrl, username, password });
      const cleanHost = new URL(String(serverUrl).startsWith('http') ? serverUrl : `https://${serverUrl}`).hostname;
      const sourceName = provider === 'apple_calendar' ? `iPhone iCloud (${username})` : `CalDAV (${cleanHost})`;
      const config = { serverUrl, username };
      if (rememberCredentials) {
        config.encryptedAuth = encryptProfile({ username, password });
      }
      const result = await appData.importEvents(events, {
        provider,
        sourceType: 'caldav',
        sourceName,
        config,
        replaceAll: Boolean(replaceExisting),
      });
      return res.status(201).json({
        imported: result.imported,
        sourceName,
        connection: redactConnection(result.connection),
        events: await appData.listEvents(),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'CalDAV sync failed.' });
    }
  });

  router.post('/connections/calendar/event', async (req, res) => {
    const { title, date, start = '10:00', end = '11:00', location = '', occasion = '', notes = '' } = req.body ?? {};
    if (!title || !date) return res.status(400).json({ error: 'Title and date are required.' });
    if (end <= start) return res.status(400).json({ error: 'End time must be after start time.' });
    const event = await appData.createEvent({
      title: String(title).trim(),
      date,
      start,
      end,
      location,
      occasion,
      notes,
      source: 'manual event',
      createdBy: 'You',
    });
    return res.status(201).json({ event, events: await appData.listEvents() });
  });

  router.delete('/connections/calendar/event/:id', async (req, res) => {
    await appData.deleteEvent(req.params.id);
    return res.json({ ok: true, events: await appData.listEvents() });
  });

  // Notes: Obsidian folder, .md/.txt uploads, Google Keep Takeout .json, manual note
  router.post('/connections/notes/markdown', async (req, res) => {
    const { folderPath, files, provider = 'obsidian', replaceExisting = false } = req.body ?? {};
    try {
      let parsedNotes;
      let sourceType;
      let sourceName;
      const config = {};
      if (folderPath) {
        parsedNotes = readMarkdownFolder(folderPath);
        sourceType = 'markdown_folder';
        sourceName = `Folder: ${String(folderPath).trim().split(/[\\/]/).filter(Boolean).at(-1) || folderPath}`;
        config.folderPath = String(folderPath).trim();
      } else if (Array.isArray(files) && files.length) {
        parsedNotes = files
          .filter((f) => f && f.name && typeof f.content === 'string')
          .map((f) =>
            /\.json$/i.test(f.name)
              ? parseGoogleKeepJson(f.name, f.content)
              : parseMarkdownNote(f.name, f.content, f.updated),
          )
          .filter(Boolean);
        if (!parsedNotes.length) throw new Error('No readable Markdown, text, or Google Keep JSON notes found.');
        const hasJson = files.some((f) => /\.json$/i.test(f.name));
        sourceType = hasJson ? 'google_keep' : 'markdown_upload';
        sourceName = hasJson ? `Google Keep (${parsedNotes.length})` : files.length === 1 ? files[0].name : `${files.length} notes`;
      } else {
        return res.status(400).json({ error: 'Provide a local folder path or upload .md/.txt/.json files.' });
      }
      const result = await appData.importNotes(parsedNotes, {
        provider,
        sourceType,
        sourceName,
        config,
        replaceAll: Boolean(replaceExisting),
      });
      return res.status(201).json({
        imported: result.imported,
        sourceName,
        connection: redactConnection(result.connection),
        notes: await appData.listNotes(),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not import notes.' });
    }
  });

  router.post('/connections/notes/note', async (req, res) => {
    const { title, body = '', tags = [] } = req.body ?? {};
    if (!title || String(title).trim().length < 2) return res.status(400).json({ error: 'Note title is required.' });
    const parsedTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : String(tags).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const note = await appData.createNote({
      title: String(title).trim(),
      body: String(body),
      tags: parsedTags.length ? parsedTags : ['personal'],
    });
    return res.status(201).json({ note, notes: await appData.listNotes() });
  });

  router.delete('/connections/notes/note/:id', async (req, res) => {
    await appData.deleteNote(req.params.id);
    return res.json({ ok: true, notes: await appData.listNotes() });
  });

  // Tasks: manual, Markdown checklists, Apple Reminders (.ics VTODO), Todoist (.csv)
  router.post('/connections/tasks/task', async (req, res) => {
    const { title, due = null, list = 'Personal', notes = '' } = req.body ?? {};
    if (!title || String(title).trim().length < 2) return res.status(400).json({ error: 'Task title is required.' });
    const task = await appData.createTask({
      title: String(title).trim(),
      due: due || null,
      list: list || 'Personal',
      notes,
      createdBy: 'You',
    });
    return res.status(201).json({ task, tasks: await appData.listTasks() });
  });

  router.patch('/connections/tasks/:id', async (req, res) => {
    const task = await appData.updateTask(req.params.id, req.body ?? {});
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    return res.json({ task, tasks: await appData.listTasks() });
  });

  router.delete('/connections/tasks/:id', async (req, res) => {
    await appData.deleteTask(req.params.id);
    return res.json({ ok: true, tasks: await appData.listTasks() });
  });

  router.post('/connections/tasks/import', async (req, res) => {
    const { text, format = 'checklist', provider = 'checklist', fileName = '', list = 'Personal', replaceExisting = false } = req.body ?? {};
    try {
      let parsed = [];
      let sourceType = 'manual';
      let sourceName = fileName || 'Imported checklist';
      if (format === 'ics_vtodo') {
        parsed = parseIcsTodos(text, list);
        sourceType = 'ics_vtodo';
        sourceName = fileName || 'Apple Reminders (.ics)';
        if (!parsed.length) throw new Error('No VTODO reminder tasks found in that .ics file.');
      } else if (format === 'todoist_csv') {
        parsed = parseTodoistCsv(text, list);
        sourceType = 'todoist_csv';
        sourceName = fileName || 'Todoist export (.csv)';
      } else {
        parsed = parseTasksText(text, list);
        if (!parsed.length) throw new Error('No tasks or checklist lines (- [ ] ...) found.');
      }
      const result = await appData.importTasks(parsed, {
        provider,
        sourceType,
        sourceName,
        replaceAll: Boolean(replaceExisting),
      });
      return res.status(201).json({
        imported: result.imported,
        sourceName,
        connection: redactConnection(result.connection),
        tasks: await appData.listTasks(),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not import tasks.' });
    }
  });

  // Money CSV (Bank, Card, GPay/PhonePe, Splitwise) & manual transactions
  router.post('/connections/money/csv', async (req, res) => {
    const { csvText, fileName = 'statement.csv', provider = 'csv_upload', replaceExisting = false } = req.body ?? {};
    try {
      const txns = parseStatementCsv(csvText);
      const result = await appData.importTransactions(txns, {
        provider,
        sourceType: 'csv_upload',
        sourceName: fileName,
        replaceAll: Boolean(replaceExisting),
      });
      return res.status(201).json({
        imported: result.imported,
        sourceName: fileName,
        connection: redactConnection(result.connection),
        transactions: await appData.listTransactions(),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not parse CSV statement.' });
    }
  });

  router.post('/connections/money/transaction', async (req, res) => {
    const { date, merchant, amount, category = 'Other' } = req.body ?? {};
    if (!date || !merchant || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Date, merchant, and positive amount are required.' });
    }
    const transaction = await appData.createTransaction({
      date,
      merchant: String(merchant).trim(),
      amount: Number(amount),
      category,
    });
    return res.status(201).json({ transaction, transactions: await appData.listTransactions() });
  });

  router.delete('/connections/money/transaction/:id', async (req, res) => {
    await appData.deleteTransaction(req.params.id);
    return res.json({ ok: true, transactions: await appData.listTransactions() });
  });

  // Safe OpenGraph URL preview for Wishlist quick-save (no bot/CAPTCHA bypassing)
  router.post('/connections/wishlist/preview-url', async (req, res) => {
    try {
      const meta = await fetchWishlistUrlMetadata(req.body?.url);
      return res.json({ meta });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not preview URL.' });
    }
  });

  // Google Keep OAuth — separate scope (keep.readonly), separate callback
  router.get('/oauth/google/keep/start', (req, res) => {
    const cfg = getGoogleOAuthConfig();
    if (!cfg.configured) {
      return res.status(400).json({
        error: 'Google OAuth client credentials are not configured.',
        hint: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.',
      });
    }
    const state = crypto.randomBytes(16).toString('hex');
    OAUTH_STATES.set(state, { createdAt: Date.now(), returnTo: safeReturn(req.query.return) });
    const keepRedirectUri = cfg.redirectUri.replace('/callback', '/keep/callback');
    const authUrl = createGoogleKeepAuthUrl({ clientId: cfg.clientId, redirectUri: keepRedirectUri, state });
    if (req.query.format === 'json') return res.json({ authUrl });
    return res.redirect(authUrl);
  });

  router.get('/oauth/google/keep/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const entry = takeState(state);
    const back = entry?.returnTo ?? '';
    if (error) return res.redirect(`${back}/app/connections?app=notes&oauth_error=${encodeURIComponent(String(error))}`);
    if (!code || !entry) return res.redirect(`${back}/app/connections?app=notes&oauth_error=invalid_state`);
    const cfg = getGoogleOAuthConfig();
    const keepRedirectUri = cfg.redirectUri.replace('/callback', '/keep/callback');
    try {
      const tokens = await exchangeGoogleCode({
        code: String(code),
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: keepRedirectUri,
      });
      const encryptedTokens = encryptProfile(tokens);
      const notes = await fetchGoogleKeepNotes(tokens.access_token);
      await appData.importNotes(notes, {
        connectionId: 'conn_google_keep_oauth',
        provider: 'google_keep',
        sourceType: 'google_oauth',
        sourceName: 'Google Keep (OAuth)',
        config: { encryptedTokens },
        replaceAll: false,
      });
      return res.redirect(`${back}/app/connections?app=notes&connected=google_keep&notes=${notes.length}`);
    } catch (err) {
      return res.redirect(`${back}/app/connections?app=notes&oauth_error=${encodeURIComponent(err.message || 'keep_oauth_failed')}`);
    }
  });

  // Sync handler for Keep OAuth connection
  // (handled generically via /connections/:id/sync below using stored encryptedTokens)

  // Optional direct Google OAuth 2.0 flow (Google Calendar + Google Tasks)
  router.get('/oauth/google/start', (req, res) => {
    const cfg = getGoogleOAuthConfig();
    if (!cfg.configured) {
      return res.status(400).json({
        error: 'Google OAuth client credentials are not configured.',
        hint: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env, or use the Google Calendar Secret iCal URL without OAuth.',
      });
    }
    const state = crypto.randomBytes(16).toString('hex');
    OAUTH_STATES.set(state, { createdAt: Date.now(), returnTo: safeReturn(req.query.return) });
    const authUrl = createGoogleAuthUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state });
    if (req.query.format === 'json') return res.json({ authUrl });
    return res.redirect(authUrl);
  });

  router.get('/oauth/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const entry = takeState(state);
    const back = entry?.returnTo ?? '';
    if (error) return res.redirect(`${back}/app/connections?app=calendar&oauth_error=${encodeURIComponent(String(error))}`);
    if (!code || !entry) return res.redirect(`${back}/app/connections?app=calendar&oauth_error=invalid_state`);
    const cfg = getGoogleOAuthConfig();
    try {
      const tokens = await exchangeGoogleCode({
        code: String(code),
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: cfg.redirectUri,
      });
      const encryptedTokens = encryptProfile(tokens);
      const [events, tasks] = await Promise.all([
        fetchGoogleCalendarEvents(tokens.access_token),
        fetchGoogleTasks(tokens.access_token).catch(() => []),
      ]);
      await appData.importEvents(events, {
        connectionId: 'conn_google_calendar_oauth',
        provider: 'google_calendar',
        sourceType: 'google_oauth',
        sourceName: 'Google Calendar (OAuth)',
        config: { encryptedTokens },
      });
      if (tasks.length) {
        await appData.importTasks(tasks, {
          connectionId: 'conn_google_tasks_oauth',
          provider: 'google_tasks',
          sourceType: 'google_oauth',
          sourceName: 'Google Tasks (OAuth)',
          config: { encryptedTokens },
        });
      }
      return res.redirect(`${back}/app/connections?app=calendar&connected=google&events=${events.length}&tasks=${tasks.length}`);
    } catch (err) {
      return res.redirect(`${back}/app/connections?app=calendar&oauth_error=${encodeURIComponent(err.message || 'oauth_failed')}`);
    }
  });

  return router;
}

