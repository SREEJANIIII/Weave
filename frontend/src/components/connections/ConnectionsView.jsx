import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { ICON, YARN, fmtDate, money, plural } from '../../lib/formatters';
import { OCCASION_SUGGESTIONS } from '../../data/wishlistSample';

const APPS = [
  { id: 'calendar', name: 'Calendar', desc: 'Connect Google Calendar, iPhone / iCloud Calendar, Samsung Calendar, or Outlook simultaneously.' },
  { id: 'notes', name: 'Notes', desc: 'Connect Google Keep via OAuth, Obsidian folders, Apple Notes, Samsung Notes, or Markdown exports.' },
  { id: 'tasks', name: 'Tasks', desc: 'Connect Apple Reminders (.ics), Todoist (.csv), Google Tasks, or Markdown checklists.' },
  { id: 'money', name: 'Money', desc: 'Import Bank, Credit Card, Splitwise, or UPI CSV statements into MongoDB.' },
  { id: 'external', name: 'All Apps & Guides', desc: 'Supported device flows, OAuth configuration, and adding custom MCP servers.' },
];

const CALENDAR_PROVIDERS = [
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    tag: 'OAuth or Secret iCal link',
    blurb: 'Connect via 1-click Google OAuth (if configured) or copy your Google Calendar Secret iCal URL / .ics export.',
    steps: [
      'Open calendar.google.com → Settings → choose your calendar → Integrate calendar.',
      'Copy "Secret address in iCal format" (ends in basic.ics) and paste below — or click Export → .ics.',
    ],
  },
  {
    id: 'apple_calendar',
    name: 'iPhone / Apple Calendar',
    tag: 'webcal://, .ics, or iCloud CalDAV',
    blurb: 'Sync iPhone / iCloud Calendar with a Public webcal:// link OR privately using an Apple App-Specific Password.',
    steps: [
      'Public URL method: iPhone Calendar app → Calendars → tap (i) → turn on Public Calendar → Share Link.',
      'Private CalDAV method: Go to appleid.apple.com → App-Specific Passwords → generate a password & sign in below.',
    ],
  },
  {
    id: 'samsung_calendar',
    name: 'Samsung Calendar',
    tag: '.ics Export or Linked Account',
    blurb: 'Import Samsung Calendar .ics exports/shares, or connect the Google/Outlook account your Samsung Calendar syncs with.',
    steps: [
      'On Samsung phone: Share / Export events as .ics (or sync your Samsung Calendar to Google/Outlook and connect that feed).',
      'Choose the exported .ics file below to load your phone schedule & birthdays/events.',
    ],
  },
  {
    id: 'outlook_calendar',
    name: 'Outlook / Microsoft 365',
    tag: 'Published .ics link or export',
    blurb: 'Sync Outlook.com or Microsoft 365 calendars via Shared Calendar ICS feed or exported .ics file.',
    steps: [
      'Outlook Web → Settings → Calendar → Shared calendars → Publish a calendar → copy ICS link.',
    ],
  },
];

const NOTES_PROVIDERS = [
  {
    id: 'google_keep',
    name: 'Google Keep',
    tag: 'Google Takeout export',
    blurb: 'Export via takeout.google.com → Keep → download zip → upload the .json files here. Checklists, labels, pinned notes all import.',
  },
  {
    id: 'obsidian',
    name: 'Obsidian / Local Folder',
    tag: 'Live folder sync',
    blurb: 'Read .md and .txt files straight from your local vault folder (supports - [ ] @me tasks and #tags).',
  },
  {
    id: 'apple_notes',
    name: 'Apple Notes (iPhone / Mac)',
    tag: '.md / .txt export upload',
    blurb: 'Export notes from Mac Notes or Exporter app as .md/.txt files and upload multiple files at once.',
  },
  {
    id: 'samsung_notes',
    name: 'Samsung Notes',
    tag: 'Text / Markdown export',
    blurb: 'In Samsung Notes tap Save as file → Text/Markdown, then upload the exported .txt/.md files here.',
  },
  {
    id: 'notion',
    name: 'Notion',
    tag: 'Markdown export',
    blurb: 'In Notion pick Export → Markdown & CSV, unzip, and upload any .md files or select the folder.',
  },
];

const TASKS_PROVIDERS = [
  {
    id: 'apple_reminders',
    name: 'Apple Reminders (iPhone)',
    tag: '.ics VTODO import',
    blurb: 'Import Reminders exported as .ics (VTODO entries preserve titles, due dates, and completion status).',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    tag: 'CSV export import',
    blurb: 'Upload a Todoist project CSV export (CONTENT, DATE, DESCRIPTION columns parsed cleanly).',
  },
  {
    id: 'google_tasks',
    name: 'Google Tasks',
    tag: 'Google OAuth sync',
    blurb: 'Connects automatically alongside Google Calendar when Google OAuth is signed in.',
  },
  {
    id: 'samsung_reminder',
    name: 'Samsung Reminder / Checklists',
    tag: 'Checklist import',
    blurb: 'Paste checklists (- [ ] Task) or plain line items exported/shared from your phone.',
  },
];

const MONEY_PROVIDERS = [
  {
    id: 'bank_csv',
    name: 'Bank / Credit Card Statement',
    tag: 'HDFC, ICICI, SBI, Axis CSV',
    blurb: 'Upload CSV statement files with date, merchant/narration, and debit/amount columns.',
  },
  {
    id: 'upi_csv',
    name: 'GPay / PhonePe / Splitwise',
    tag: 'Export CSV',
    blurb: 'Import Splitwise (Date, Description, Category, Cost) or UPI statement CSVs into Money.',
  },
];

const SAMPLE_CSV = `date,merchant,amount,category
2026-11-24,Corner Brew Café,260,Dining out
2026-11-25,Fresh Basket,1480,Groceries
2026-11-26,Metro Card,400,Transport`;

async function req(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fmtSyncTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ConnectionsView({ initialApp = 'calendar', offline = false, onDataChanged, onNotify }) {
  const [activeApp, setActiveApp] = useState(APPS.some((a) => a.id === initialApp) ? initialApp : 'calendar');
  const [summary, setSummary] = useState({});
  const [connList, setConnList] = useState([]);
  const [counts, setCounts] = useState({});
  const [oauthGoogle, setOauthGoogle] = useState({ configured: false });
  const [external, setExternal] = useState([]);
  const [records, setRecords] = useState({ calendar: [], notes: [], tasks: [], money: [], moneySource: null });
  const [busy, setBusy] = useState(false);

  // Selected providers inside each app
  const [calProvider, setCalProvider] = useState('google_calendar');
  const [notesProvider, setNotesProvider] = useState('google_keep');
  const [tasksProvider, setTasksProvider] = useState('apple_reminders');
  const [moneyProvider, setMoneyProvider] = useState('bank_csv');

  // Calendar inputs
  const [icsUrl, setIcsUrl] = useState('');
  const [davServer, setDavServer] = useState('https://caldav.icloud.com/');
  const [davUser, setDavUser] = useState('');
  const [davPass, setDavPass] = useState('');
  const [davRemember, setDavRemember] = useState(true);
  const [calTitle, setCalTitle] = useState('');
  const [calDate, setCalDate] = useState('');
  const [calStart, setCalStart] = useState('18:00');
  const [calEnd, setCalEnd] = useState('19:00');
  const [calOccasion, setCalOccasion] = useState('');
  const [calLocation, setCalLocation] = useState('');

  // Notes inputs
  const [folderPath, setFolderPath] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteTags, setNoteTags] = useState('meeting, personal');
  const [noteBody, setNoteBody] = useState('- [ ] @me Follow up item');

  // Tasks inputs
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskList, setTaskList] = useState('Personal');
  const [taskImportText, setTaskImportText] = useState('');

  // Money inputs
  const [csvText, setCsvText] = useState('');
  const [txnDate, setTxnDate] = useState('');
  const [txnMerchant, setTxnMerchant] = useState('');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnCategory, setTxnCategory] = useState('Groceries');

  useEffect(() => {
    if (APPS.some((a) => a.id === initialApp)) setActiveApp(initialApp);
  }, [initialApp]);

  const loadMeta = useCallback(async () => {
    if (offline) return;
    const r = await req('/api/connections');
    if (r.ok) {
      setSummary(r.data.connections ?? {});
      setConnList(r.data.list ?? []);
      setCounts(r.data.counts ?? {});
      setOauthGoogle(r.data.oauth?.google ?? { configured: false });
      setExternal(r.data.external ?? []);
    }
  }, [offline]);

  const loadAppRecords = useCallback(
    async (appId) => {
      if (offline || appId === 'external') return;
      const r = await req(`/api/app-data/${encodeURIComponent(appId)}`);
      if (!r.ok) return;
      setRecords((prev) => ({
        ...prev,
        ...(appId === 'calendar' ? { calendar: r.data.events ?? [] } : {}),
        ...(appId === 'notes' ? { notes: r.data.notes ?? [] } : {}),
        ...(appId === 'tasks' ? { tasks: r.data.tasks ?? [] } : {}),
        ...(appId === 'money' ? { money: r.data.transactions ?? [], moneySource: r.data.source ?? null } : {}),
      }));
    },
    [offline],
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadAppRecords(activeApp);
  }, [activeApp, loadAppRecords]);

  const afterChange = async (msg, appId = activeApp) => {
    await Promise.all([loadMeta(), loadAppRecords(appId)]);
    await onDataChanged?.();
    if (msg) onNotify?.(msg);
  };

  const handleSyncConnection = async (conn) => {
    setBusy(true);
    const r = await req(`/api/connections/${encodeURIComponent(conn.id)}/sync`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Sync failed.');
    await afterChange(`Synced ${conn.sourceName} (${plural(r.data.imported, 'item')}).`, conn.app);
  };

  const handleRemoveConnection = async (conn) => {
    setBusy(true);
    const r = await req(`/api/connections/${encodeURIComponent(conn.id)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not disconnect.');
    await afterChange(`Disconnected ${conn.sourceName}.`, conn.app);
  };

  const handleIcsUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const icsText = await file.text();
    const r = await req('/api/connections/calendar/ics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icsText, fileName: file.name, provider: calProvider }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not import .ics file.');
    await afterChange(`Connected ${r.data.sourceName} (${plural(r.data.imported, 'event')}).`, 'calendar');
  };

  const handleIcsUrl = async (e) => {
    e.preventDefault();
    if (!icsUrl.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/calendar/ics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icsUrl: icsUrl.trim(), provider: calProvider }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not sync calendar feed URL.');
    setIcsUrl('');
    await afterChange(`Connected ${r.data.sourceName} (${plural(r.data.imported, 'event')}).`, 'calendar');
  };

  const handleCalDavSync = async (e) => {
    e.preventDefault();
    if (!davUser.trim() || !davPass.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/calendar/caldav', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: davServer.trim(),
        username: davUser.trim(),
        password: davPass.trim(),
        provider: calProvider,
        rememberCredentials: davRemember,
      }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'iCloud / CalDAV sync failed.');
    setDavPass('');
    await afterChange(`Synced ${r.data.sourceName} (${plural(r.data.imported, 'event')}).`, 'calendar');
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!calTitle.trim() || !calDate) return;
    setBusy(true);
    const r = await req('/api/connections/calendar/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: calTitle.trim(),
        date: calDate,
        start: calStart,
        end: calEnd,
        location: calLocation.trim(),
        occasion: calOccasion.trim(),
      }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not add calendar event.');
    setCalTitle('');
    setCalLocation('');
    await afterChange('Added calendar event to MongoDB.', 'calendar');
  };

  const handleFolderConnect = async (e) => {
    e.preventDefault();
    if (!folderPath.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/notes/markdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: folderPath.trim(), provider: notesProvider }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not read folder.');
    await afterChange(`Connected folder and imported ${plural(r.data.imported, 'note')}.`, 'notes');
  };

  const handleNotesFiles = async (e) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    setBusy(true);
    const files = await Promise.all(
      picked.map(async (f) => ({
        name: f.name,
        content: await f.text(),
        updated: new Date(f.lastModified || Date.now()).toISOString().slice(0, 10),
      })),
    );
    const r = await req('/api/connections/notes/markdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, provider: notesProvider }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not import notes.');
    await afterChange(`Imported ${plural(r.data.imported, 'note')}.`, 'notes');
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/notes/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: noteTitle.trim(), tags: noteTags, body: noteBody }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not save note.');
    setNoteTitle('');
    await afterChange('Saved note to MongoDB.', 'notes');
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/tasks/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: taskTitle.trim(), due: taskDue || null, list: taskList || 'Personal' }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not create task.');
    setTaskTitle('');
    await afterChange('Added task to MongoDB.', 'tasks');
  };

  const handleToggleTask = async (task) => {
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    const r = await req(`/api/connections/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (r.ok) await afterChange(null, 'tasks');
  };

  const handleTasksFileImport = async (e, format) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    const r = await req('/api/connections/tasks/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        format,
        provider: tasksProvider,
        fileName: file.name,
        list: tasksProvider === 'apple_reminders' ? 'Reminders' : 'Todoist',
      }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not import tasks.');
    await afterChange(`Imported ${plural(r.data.imported, 'task')} from ${file.name}.`, 'tasks');
  };

  const handleImportTasks = async (e) => {
    e.preventDefault();
    if (!taskImportText.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/tasks/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: taskImportText, provider: tasksProvider, list: taskList || 'Personal' }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not import tasks.');
    setTaskImportText('');
    await afterChange(`Imported ${plural(r.data.imported, 'task')}.`, 'tasks');
  };

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    const r = await req('/api/connections/money/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: text, fileName: file.name, provider: moneyProvider }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not parse CSV statement.');
    await afterChange(`Imported ${plural(r.data.imported, 'transaction')} from ${file.name}.`, 'money');
  };

  const handleCsvPaste = async (e) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    setBusy(true);
    const r = await req('/api/connections/money/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText, fileName: 'pasted-statement.csv', provider: moneyProvider }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not parse CSV.');
    setCsvText('');
    await afterChange(`Imported ${plural(r.data.imported, 'transaction')}.`, 'money');
  };

  const handleAddTxn = async (e) => {
    e.preventDefault();
    if (!txnDate || !txnMerchant.trim() || !txnAmount) return;
    setBusy(true);
    const r = await req('/api/connections/money/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: txnDate, merchant: txnMerchant.trim(), amount: Number(txnAmount), category: txnCategory }),
    });
    setBusy(false);
    if (!r.ok) return onNotify?.(r.data.error || 'Could not add transaction.');
    setTxnMerchant('');
    setTxnAmount('');
    await afterChange('Added expense to MongoDB.', 'money');
  };

  const restoreSample = async (appId) => {
    setBusy(true);
    const r = await req(`/api/connections/${encodeURIComponent(appId)}/sample`, { method: 'POST' });
    setBusy(false);
    if (r.ok) await afterChange(`Restored sample ${appId} data.`, appId);
  };

  const currentMeta = APPS.find((a) => a.id === activeApp);
  const activeConns = connList.filter((c) => c.app === activeApp);
  const appSummary = summary[activeApp];
  const selectedCalMeta = CALENDAR_PROVIDERS.find((p) => p.id === calProvider);
  const selectedNotesMeta = NOTES_PROVIDERS.find((p) => p.id === notesProvider);
  const selectedTasksMeta = TASKS_PROVIDERS.find((p) => p.id === tasksProvider);

  return (
    <div className="wl-page">
      <div className="wl-head">
        <div>
          <div className="wl-head-title-row">
            <h1 className="greeting">Connect Your Apps</h1>
            <span className="wl-sample-tag">
              {offline ? 'Server offline' : 'Live MongoDB + MCP'}
            </span>
          </div>
          <p className="ask-sub">
            Connect multiple calendars and note/task/spending apps simultaneously — Google Calendar, iPhone iCloud Calendar &amp; Reminders, Samsung Calendar &amp; Notes, Google Keep, Obsidian, Todoist, and Bank CSVs.
          </p>
        </div>
      </div>

      {offline ? (
        <div className="notice" role="alert">
          <Icon name="i-alert" />
          <div>
            <strong>Weave backend server is offline.</strong>
            <p>Start the server with npm start to connect real app feeds and persist data into MongoDB.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="cn-tabs" role="tablist" aria-label="App categories">
            {APPS.map((a) => {
              const meta = summary[a.id];
              const isCustom = meta && meta.sourceType !== 'sample';
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={String(activeApp === a.id)}
                  className={`cn-tab${activeApp === a.id ? ' is-on' : ''}`}
                  data-yarn={YARN[a.id] ?? a.id}
                  onClick={() => setActiveApp(a.id)}
                >
                  <span className="swatch" data-yarn={YARN[a.id] ?? a.id} aria-hidden="true" />
                  <span className="cn-tab-text">
                    <strong>{a.name}</strong>
                    <small>
                      {a.id === 'external'
                        ? 'OAuth & MCP guide'
                        : `${counts[a.id] ?? 0} · ${isCustom ? meta.sourceName : 'Sample'}`}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cn-header-bar">
            <div>
              <h2>{currentMeta?.name}</h2>
              <p className="panel-note">{currentMeta?.desc}</p>
            </div>
            {activeApp !== 'external' && (
              <div className="cn-source-status">
                <span className="wl-sample-tag">
                  Active: {appSummary?.sourceName || 'sample data'}
                </span>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => restoreSample(activeApp)}
                >
                  <Icon name="i-replay" />
                  Reset to sample
                </button>
              </div>
            )}
          </div>

          {/* Connected sources bar for active app */}
          {activeApp !== 'external' && activeConns.length > 0 && (
            <div className="cn-conn-strip" aria-label="Connected sources">
              {activeConns.map((c) => {
                const canSync = ['ics_url', 'caldav', 'markdown_folder', 'google_oauth'].includes(c.sourceType);
                return (
                  <div key={c.id} className="cn-conn-pill" data-yarn={YARN[c.app] ?? c.app}>
                    <span className="swatch" data-yarn={YARN[c.app] ?? c.app} aria-hidden="true" />
                    <div>
                      <strong>{c.sourceName}</strong>
                      <span>
                        {plural(c.itemCount ?? 0, 'item')}
                        {c.lastSyncedAt ? ` · ${fmtSyncTime(c.lastSyncedAt)}` : ''}
                      </span>
                    </div>
                    <div className="cn-conn-actions">
                      {canSync && (
                        <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => handleSyncConnection(c)}>
                          Sync
                        </button>
                      )}
                      {c.sourceType !== 'sample' && (
                        <button type="button" className="btn btn-link btn-sm" disabled={busy} onClick={() => handleRemoveConnection(c)}>
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeApp === 'calendar' && (
            <div className="cn-grid">
              <div className="cn-forms">
                <div className="sp-card">
                  <h3>Choose calendar app to connect</h3>
                  <div className="cn-providers">
                    {CALENDAR_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`cn-provider-card${calProvider === p.id ? ' is-on' : ''}`}
                        onClick={() => setCalProvider(p.id)}
                      >
                        <strong>{p.name}</strong>
                        <span className="cn-provider-tag">{p.tag}</span>
                      </button>
                    ))}
                  </div>

                  {selectedCalMeta && (
                    <div className="cn-guide">
                      <p className="panel-note">{selectedCalMeta.blurb}</p>
                      <ol>
                        {selectedCalMeta.steps.map((s, idx) => <li key={idx}>{s}</li>)}
                      </ol>
                    </div>
                  )}

                  {calProvider === 'google_calendar' && (
                    <div className="cn-oauth-box">
                      {oauthGoogle.configured ? (
                        <a className="btn btn-primary btn-sm" href="/api/oauth/google/start">
                          <Icon name="i-calendar" /> Sign in with Google (Calendar + Tasks)
                        </a>
                      ) : (
                        <p className="panel-note">
                          Tip: Use your <strong>Secret iCal URL</strong> or <code>.ics</code> file below right away (no OAuth setup needed), or add <code>GOOGLE_CLIENT_ID</code> &amp; <code>GOOGLE_CLIENT_SECRET</code> in <code>backend/.env</code> for 1-click OAuth.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="cn-btn-row">
                    <label className="cn-file-btn btn btn-primary btn-sm">
                      <Icon name="i-calendar" />
                      <span>Upload {selectedCalMeta?.name} .ics</span>
                      <input type="file" accept=".ics,text/calendar" hidden disabled={busy} onChange={handleIcsUpload} />
                    </label>
                  </div>

                  <form className="cn-inline-form" onSubmit={handleIcsUrl}>
                    <input
                      type="text"
                      placeholder={
                        calProvider === 'apple_calendar'
                          ? 'webcal://p...-caldav.icloud.com/published/2/...'
                          : calProvider === 'google_calendar'
                            ? 'https://calendar.google.com/calendar/ical/.../basic.ics'
                            : 'https://... or webcal://... (.ics calendar URL)'
                      }
                      value={icsUrl}
                      onChange={(e) => setIcsUrl(e.target.value)}
                    />
                    <button className="btn btn-quiet btn-sm" type="submit" disabled={busy || !icsUrl.trim()}>
                      Connect feed
                    </button>
                  </form>

                  {calProvider === 'apple_calendar' && (
                    <form className="cn-caldav-box" onSubmit={handleCalDavSync}>
                      <h4>Private iPhone iCloud CalDAV (App-Specific Password)</h4>
                      <div className="wl-form-grid">
                        <div className="field wl-span-2">
                          <label htmlFor="dav-srv">CalDAV server</label>
                          <input id="dav-srv" type="text" value={davServer} onChange={(e) => setDavServer(e.target.value)} />
                        </div>
                        <div className="field">
                          <label htmlFor="dav-usr">Apple ID email</label>
                          <input id="dav-usr" type="email" required placeholder="you@icloud.com" value={davUser} onChange={(e) => setDavUser(e.target.value)} />
                        </div>
                        <div className="field">
                          <label htmlFor="dav-pwd">App-specific password</label>
                          <input id="dav-pwd" type="password" required placeholder="xxxx-xxxx-xxxx-xxxx" value={davPass} onChange={(e) => setDavPass(e.target.value)} />
                        </div>
                      </div>
                      <label className="sp-check-row">
                        <input type="checkbox" checked={davRemember} onChange={(e) => setDavRemember(e.target.checked)} />
                        <span>Remember AES-256-GCM encrypted credentials for one-click re-sync</span>
                      </label>
                      <button className="btn btn-quiet btn-sm" type="submit" disabled={busy}>
                        Sync iPhone iCloud Calendar
                      </button>
                    </form>
                  )}
                </div>

                <form className="sp-card" onSubmit={handleAddEvent}>
                  <h3>Add calendar event manually</h3>
                  <div className="wl-form-grid">
                    <div className="field wl-span-2">
                      <label htmlFor="cn-ev-title">Event title *</label>
                      <input id="cn-ev-title" type="text" required placeholder="e.g. Riya's wedding reception" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-ev-date">Date *</label>
                      <input id="cn-ev-date" type="date" required value={calDate} onChange={(e) => setCalDate(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-ev-occ">Occasion tag (optional)</label>
                      <input id="cn-ev-occ" type="text" list="cn-occ-list" placeholder="Wedding, Diwali..." value={calOccasion} onChange={(e) => setCalOccasion(e.target.value)} />
                      <datalist id="cn-occ-list">
                        {OCCASION_SUGGESTIONS.map((o) => <option key={o} value={o} />)}
                      </datalist>
                    </div>
                    <div className="field">
                      <label htmlFor="cn-ev-start">Start</label>
                      <input id="cn-ev-start" type="time" value={calStart} onChange={(e) => setCalStart(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-ev-end">End</label>
                      <input id="cn-ev-end" type="time" value={calEnd} onChange={(e) => setCalEnd(e.target.value)} />
                    </div>
                    <div className="field wl-span-2">
                      <label htmlFor="cn-ev-loc">Location (optional)</label>
                      <input id="cn-ev-loc" type="text" placeholder="Venue or video call" value={calLocation} onChange={(e) => setCalLocation(e.target.value)} />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                    <Icon name="i-plus" /> Add event
                  </button>
                </form>
              </div>

              <div className="sp-card">
                <h3>Calendar events ({records.calendar.length})</h3>
                <ul className="cn-list">
                  {records.calendar.map((ev) => (
                    <li key={ev.id}>
                      <div>
                        <strong>{ev.title}</strong>
                        <span>
                          {fmtDate(ev.date)} · {ev.start}–{ev.end}
                          {ev.location ? ` · ${ev.location}` : ''}
                          {ev.occasion ? ` · Occasion: ${ev.occasion}` : ''}
                          {ev.source && ev.source !== 'sample data' ? ` · ${ev.source}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        aria-label={`Delete ${ev.title}`}
                        onClick={async () => {
                          await req(`/api/connections/calendar/event/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
                          await afterChange(null, 'calendar');
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeApp === 'notes' && (
            <div className="cn-grid">
              <div className="cn-forms">
                <div className="sp-card">
                  <h3>Choose notes app to connect</h3>
                  <div className="cn-providers">
                    {NOTES_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`cn-provider-card${notesProvider === p.id ? ' is-on' : ''}`}
                        onClick={() => setNotesProvider(p.id)}
                      >
                        <strong>{p.name}</strong>
                        <span className="cn-provider-tag">{p.tag}</span>
                      </button>
                    ))}
                  </div>
                  {selectedNotesMeta && <p className="panel-note">{selectedNotesMeta.blurb}</p>}

                  {notesProvider === 'obsidian' && (
                    <form className="cn-inline-form" onSubmit={handleFolderConnect}>
                      <input
                        type="text"
                        placeholder="C:\Users\You\Documents\ObsidianVault"
                        value={folderPath}
                        onChange={(e) => setFolderPath(e.target.value)}
                      />
                      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                        Connect folder
                      </button>
                    </form>
                  )}

                  {notesProvider === 'google_keep' && (
                    <div className="cn-keep-connect">
                      <div className="cn-oauth-hint">
                        <span>ℹ️ Google Keep has no public OAuth API for personal Gmail accounts. Use Google Takeout to export your notes instead.</span>
                      </div>
                      <div className="cn-keep-steps">
                        <ol>
                          <li>Go to <strong>takeout.google.com</strong></li>
                          <li>Deselect all → select only <strong>Keep</strong> → Export</li>
                          <li>Download the zip → open <code>Takeout/Keep/</code> folder</li>
                          <li>Upload the <code>.json</code> files below ↓</li>
                        </ol>
                      </div>
                      <label className="cn-file-btn btn btn-primary btn-sm">
                        <Icon name="i-notes" />
                        <span>Upload Keep Takeout .json files</span>
                        <input
                          type="file"
                          multiple
                          accept=".json"
                          hidden
                          disabled={busy}
                          onChange={handleNotesFiles}
                        />
                      </label>
                    </div>
                  )}

                  {notesProvider !== 'obsidian' && notesProvider !== 'google_keep' && (
                    <label className="cn-file-btn btn btn-primary btn-sm">
                      <Icon name="i-notes" />
                      <span>{`Upload ${selectedNotesMeta?.name} (.md / .txt)`}</span>
                      <input
                        type="file"
                        multiple
                        accept=".md,.markdown,.txt,.json"
                        hidden
                        disabled={busy}
                        onChange={handleNotesFiles}
                      />
                    </label>
                  )}
                </div>

                <form className="sp-card" onSubmit={handleAddNote}>
                  <h3>Create a note</h3>
                  <div className="field">
                    <label htmlFor="cn-n-title">Title *</label>
                    <input id="cn-n-title" type="text" required placeholder="e.g. Project kick-off notes" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cn-n-tags">Tags (comma-separated)</label>
                    <input id="cn-n-tags" type="text" value={noteTags} onChange={(e) => setNoteTags(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cn-n-body">Markdown body</label>
                    <textarea id="cn-n-body" rows={4} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                    <Icon name="i-plus" /> Save note
                  </button>
                </form>
              </div>

              <div className="sp-card">
                <h3>Stored notes ({records.notes.length})</h3>
                <ul className="cn-list">
                  {records.notes.map((n) => (
                    <li key={n.id}>
                      <div>
                        <strong>{n.title}</strong>
                        <span>
                          Updated {fmtDate(n.updated)}
                          {(n.tags ?? []).length ? ` · ${n.tags.join(', ')}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        aria-label={`Delete ${n.title}`}
                        onClick={async () => {
                          await req(`/api/connections/notes/note/${encodeURIComponent(n.id)}`, { method: 'DELETE' });
                          await afterChange(null, 'notes');
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeApp === 'tasks' && (
            <div className="cn-grid">
              <div className="cn-forms">
                <div className="sp-card">
                  <h3>Choose tasks / reminders app</h3>
                  <div className="cn-providers">
                    {TASKS_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`cn-provider-card${tasksProvider === p.id ? ' is-on' : ''}`}
                        onClick={() => setTasksProvider(p.id)}
                      >
                        <strong>{p.name}</strong>
                        <span className="cn-provider-tag">{p.tag}</span>
                      </button>
                    ))}
                  </div>
                  {selectedTasksMeta && <p className="panel-note">{selectedTasksMeta.blurb}</p>}

                  {tasksProvider === 'apple_reminders' && (
                    <label className="cn-file-btn btn btn-primary btn-sm">
                      <Icon name="i-tasks" />
                      <span>Upload Apple Reminders .ics</span>
                      <input type="file" accept=".ics,text/calendar" hidden disabled={busy} onChange={(e) => handleTasksFileImport(e, 'ics_vtodo')} />
                    </label>
                  )}

                  {tasksProvider === 'todoist' && (
                    <label className="cn-file-btn btn btn-primary btn-sm">
                      <Icon name="i-tasks" />
                      <span>Upload Todoist .csv export</span>
                      <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => handleTasksFileImport(e, 'todoist_csv')} />
                    </label>
                  )}

                  {tasksProvider === 'google_tasks' && (
                    oauthGoogle.configured ? (
                      <a className="btn btn-primary btn-sm" href="/api/oauth/google/start">
                        <Icon name="i-tasks" /> Connect Google Tasks via OAuth
                      </a>
                    ) : (
                      <p className="panel-note">
                        Add <code>GOOGLE_CLIENT_ID</code> &amp; <code>GOOGLE_CLIENT_SECRET</code> in <code>backend/.env</code> to sync Google Tasks, or paste your tasks below.
                      </p>
                    )
                  )}

                  <form className="cn-stack-form" onSubmit={handleImportTasks}>
                    <textarea
                      rows={3}
                      placeholder={'- [ ] Order Diwali lights\n- [ ] Confirm tailor pickup'}
                      value={taskImportText}
                      onChange={(e) => setTaskImportText(e.target.value)}
                    />
                    <button className="btn btn-quiet btn-sm" type="submit" disabled={busy || !taskImportText.trim()}>
                      Import checklist lines
                    </button>
                  </form>
                </div>

                <form className="sp-card" onSubmit={handleAddTask}>
                  <h3>Add task</h3>
                  <div className="wl-form-grid">
                    <div className="field wl-span-2">
                      <label htmlFor="cn-t-title">Task title *</label>
                      <input id="cn-t-title" type="text" required placeholder="e.g. Book alterations appointment" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-t-due">Due date</label>
                      <input id="cn-t-due" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-t-list">List</label>
                      <input id="cn-t-list" type="text" value={taskList} onChange={(e) => setTaskList(e.target.value)} />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                    <Icon name="i-plus" /> Add task
                  </button>
                </form>
              </div>

              <div className="sp-card">
                <h3>Tasks ({records.tasks.length})</h3>
                <ul className="cn-list">
                  {records.tasks.map((t) => (
                    <li key={t.id}>
                      <label className="cn-task-row">
                        <input type="checkbox" checked={t.status === 'done'} onChange={() => handleToggleTask(t)} />
                        <div>
                          <strong className={t.status === 'done' ? 'is-done' : ''}>{t.title}</strong>
                          <span>
                            {t.list}
                            {t.due ? ` · Due ${fmtDate(t.due)}` : ''}
                          </span>
                        </div>
                      </label>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        aria-label={`Delete ${t.title}`}
                        onClick={async () => {
                          await req(`/api/connections/tasks/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
                          await afterChange(null, 'tasks');
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeApp === 'money' && (
            <div className="cn-grid">
              <div className="cn-forms">
                <div className="sp-card">
                  <h3>Import Bank / UPI / Splitwise Statement CSV</h3>
                  <div className="cn-providers">
                    {MONEY_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`cn-provider-card${moneyProvider === p.id ? ' is-on' : ''}`}
                        onClick={() => setMoneyProvider(p.id)}
                      >
                        <strong>{p.name}</strong>
                        <span className="cn-provider-tag">{p.tag}</span>
                      </button>
                    ))}
                  </div>
                  <p className="panel-note">
                    {MONEY_PROVIDERS.find((p) => p.id === moneyProvider)?.blurb}
                  </p>
                  <div className="cn-btn-row">
                    <label className="cn-file-btn btn btn-primary btn-sm">
                      <Icon name="i-money" />
                      <span>Upload .csv file</span>
                      <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={handleCsvFile} />
                    </label>
                    <button type="button" className="btn btn-link btn-sm" onClick={() => setCsvText(SAMPLE_CSV)}>
                      Fill example CSV
                    </button>
                  </div>
                  <form className="cn-stack-form" onSubmit={handleCsvPaste}>
                    <textarea
                      rows={4}
                      placeholder="date,merchant,amount,category"
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                    />
                    <button className="btn btn-quiet btn-sm" type="submit" disabled={busy || !csvText.trim()}>
                      Import pasted CSV
                    </button>
                  </form>
                </div>

                <form className="sp-card" onSubmit={handleAddTxn}>
                  <h3>Add manual transaction</h3>
                  <div className="wl-form-grid">
                    <div className="field">
                      <label htmlFor="cn-m-date">Date *</label>
                      <input id="cn-m-date" type="date" required value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-m-amt">Amount (INR) *</label>
                      <input id="cn-m-amt" type="number" min="1" step="any" required placeholder="450" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-m-merch">Merchant *</label>
                      <input id="cn-m-merch" type="text" required placeholder="e.g. Fresh Basket" value={txnMerchant} onChange={(e) => setTxnMerchant(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="cn-m-cat">Category</label>
                      <select id="cn-m-cat" value={txnCategory} onChange={(e) => setTxnCategory(e.target.value)}>
                        {['Groceries', 'Dining out', 'Food delivery', 'Transport', 'Shopping', 'Bills', 'Other'].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                    <Icon name="i-plus" /> Add transaction
                  </button>
                </form>
              </div>

              <div className="sp-card">
                <h3>
                  Transactions ({records.money.length}){records.moneySource ? ` · ${records.moneySource.name}` : ''}
                </h3>
                <ul className="cn-list">
                  {records.money.map((t) => (
                    <li key={t.id}>
                      <div>
                        <strong>{t.merchant} — {money.format(t.amount)}</strong>
                        <span>{fmtDate(t.date)} · {t.category}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        aria-label={`Delete ${t.merchant}`}
                        onClick={async () => {
                          await req(`/api/connections/money/transaction/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
                          await afterChange(null, 'money');
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeApp === 'external' && (
            <div className="cn-ext-grid">
              {external.map((item) => (
                <article key={item.id} className="sp-card">
                  <div className="wl-head-title-row">
                    <Icon name={ICON[item.id] ?? 'i-plug'} />
                    <h3>{item.name}</h3>
                  </div>
                  <span className="wl-sample-tag">{item.category}</span>
                  <p className="panel-note"><strong>What works now:</strong> {item.supportedNow}</p>
                  <p className="panel-note"><strong>Why OAuth / manual steps:</strong> {item.whyNeedsOAuth}</p>
                </article>
              ))}
              <article className="sp-card">
                <div className="wl-head-title-row">
                  <Icon name="i-plug" />
                  <h3>Add a Custom MCP Server</h3>
                </div>
                <span className="wl-sample-tag">Developer extension</span>
                <p className="panel-note">
                  Weave connects via official MCP stdio servers configured in <code>backend/src/hub.js</code> (<code>SERVER_DEFS</code>). Add any external MCP server command (Google Workspace, Notion, Todoist MCP) and Weave discovers its tools with approval gating.
                </p>
              </article>
            </div>
          )}
        </>
      )}
    </div>
  );
}
