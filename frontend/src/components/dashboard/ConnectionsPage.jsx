import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../Icons';
import { api } from '../../lib/api';
import { fmtArgs, fmtDate, money } from '../../lib/formatters';
import { joinNames } from '../../lib/services';

function Switch({ on, busy, label, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      disabled={disabled || busy}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

const SOURCES = {
  calendar: {
    kind: 'google',
    label: 'Connect Google Calendar',
    start: '/api/oauth/google/start',
    hint: 'Or add iPhone / Samsung / Outlook below',
    moreLabel: 'iPhone, Samsung, Outlook & events',
  },
  tasks: {
    kind: 'google',
    label: 'Connect Google Tasks',
    start: '/api/oauth/google/start',
    hint: 'Or import Apple Reminders / Todoist / Samsung below',
    moreLabel: 'Apple Reminders, Todoist & to-dos',
  },
  notes: {
    kind: 'google',
    label: 'Connect Google Docs & Drive',
    start: '/api/oauth/google/notes/start',
    hint: 'Or import Keep Takeout .json, Obsidian, Apple/Samsung Notes',
    moreLabel: 'Keep, Apple Notes, Samsung & Obsidian',
  },
  money: {
    kind: 'csv',
    label: 'Upload statement (.csv)',
    hint: 'Bank, Card, GPay / PhonePe, or Splitwise CSV',
    moreLabel: 'Sample CSV, add expense & history',
  },
};

const CAL_PROVIDERS = [
  { id: 'google_calendar', name: 'Google Calendar', tag: 'OAuth or iCal URL', hint: 'Use 1-click Google OAuth above, OR paste calendar.google.com → Settings → "Secret address in iCal format".' },
  { id: 'apple_calendar', name: 'iPhone / Apple iCloud', tag: 'webcal://, .ics, or CalDAV', hint: 'Turn on Shared Calendar (webcal://) on iPhone, OR enter your Apple ID + App-Specific Password (appleid.apple.com) for private CalDAV.' },
  { id: 'samsung_calendar', name: 'Samsung Calendar', tag: '.ics Export / Sync', hint: 'Share/Export events as .ics from Samsung Calendar and upload below — or sync Samsung Calendar with your Google/Outlook account and connect that.' },
  { id: 'outlook_calendar', name: 'Outlook / 365', tag: 'Published .ics link or file', hint: 'Outlook Web → Settings → Calendar → Shared calendars → Publish a calendar → copy ICS link or export .ics.' },
];

const NOTE_PROVIDERS = [
  { id: 'google_drive', name: 'Google Docs & Keep', tag: 'OAuth or Takeout .json', hint: 'Google blocks the Keep REST API for personal @gmail.com accounts. Connect Google Docs & Drive with 1 click above (tip: tap ⋮ → "Copy to Google Docs" inside Keep), OR upload Keep Takeout .json files below.' },
  { id: 'obsidian', name: 'Obsidian / Folder', tag: 'Live local vault sync', hint: 'Point Weave at any local folder of .md/.txt files and click Sync any time.' },
  { id: 'apple_notes', name: 'Apple Notes', tag: '.md / .txt export', hint: 'Export from Mac Notes / Exporter app as .md or .txt files and upload multiple at once.' },
  { id: 'samsung_notes', name: 'Samsung Notes', tag: 'Text / Markdown export', hint: 'In Samsung Notes tap Save as file → Text/Markdown and upload the exported files here.' },
  { id: 'notion', name: 'Notion', tag: 'Markdown export', hint: 'In Notion pick Export → Markdown & CSV, unzip, and upload any .md files or connect the unzipped folder.' },
];

const TASK_PROVIDERS = [
  { id: 'apple_reminders', name: 'Apple Reminders', tag: '.ics VTODO file', hint: 'Export Reminders list as .ics and upload here (preserves due dates and done status).' },
  { id: 'todoist', name: 'Todoist', tag: '.csv export', hint: 'Export a Todoist project as CSV (CONTENT, DATE, DESCRIPTION) and upload here.' },
  { id: 'google_tasks', name: 'Google Tasks', tag: 'Google OAuth sync', hint: 'Sign in with Google using the Connect button above — your default Google Tasks list syncs automatically.' },
  { id: 'samsung_reminder', name: 'Samsung Reminder / Lists', tag: 'Checklist paste', hint: 'Paste checkboxes (- [ ] Task) or plain line items exported from Samsung Reminder or Notes.' },
];

const SYNCABLE = ['ics_url', 'caldav', 'markdown_folder', 'google_oauth'];

function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `synced ${hours} h ago` : `synced ${Math.round(hours / 24)} d ago`;
}

/** Connect Google, Apple iCloud/Reminders, Samsung, Outlook, Obsidian, CSVs, and view stored items per service. */
function AppLinks({ service, links, oauthReady, linksError, onChanged, onNotify, onLinked }) {
  const source = SOURCES[service.id];
  const [note, setNote] = useState('');
  const [working, setWorking] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Selected sub-provider + inputs per app
  const [calProv, setCalProv] = useState('apple_calendar');
  const [icsUrl, setIcsUrl] = useState('');
  const [davServer, setDavServer] = useState('https://caldav.icloud.com/');
  const [davUser, setDavUser] = useState('');
  const [davPass, setDavPass] = useState('');
  const [davRemember, setDavRemember] = useState(true);
  const [calTitle, setCalTitle] = useState('');
  const [calDate, setCalDate] = useState('');
  const [calStart, setCalStart] = useState('18:00');
  const [calEnd, setCalEnd] = useState('19:00');

  const [noteProv, setNoteProv] = useState('google_drive');
  const [folderPath, setFolderPath] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteTags, setNoteTags] = useState('personal');
  const [noteBody, setNoteBody] = useState('- [ ] @me Follow up item');

  const [taskProv, setTaskProv] = useState('apple_reminders');
  const [taskText, setTaskText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');

  const [txnDate, setTxnDate] = useState('');
  const [txnMerchant, setTxnMerchant] = useState('');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnCategory, setTxnCategory] = useState('Groceries');

  const fileRef = useRef(null);
  const mine = links.filter((c) => c.app === service.id && c.sourceType !== 'sample');

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    const r = await api(`/api/app-data/${encodeURIComponent(service.id)}`);
    setLoadingItems(false);
    if (!r.ok) return;
    if (service.id === 'calendar') setItems(r.data.events ?? []);
    else if (service.id === 'notes') setItems(r.data.notes ?? []);
    else if (service.id === 'tasks') setItems(r.data.tasks ?? []);
    else if (service.id === 'money') setItems(r.data.transactions ?? []);
  }, [service.id]);

  useEffect(() => {
    if (expanded) loadItems();
  }, [expanded, loadItems]);

  if (!source) return null;

  const afterMutate = async (msg) => {
    setNote('');
    if (msg) onNotify(msg);
    onLinked(service.id);
    await Promise.all([onChanged(), expanded ? loadItems() : Promise.resolve()]);
  };

  const startGoogle = () => {
    if (linksError) return setNote(linksError);
    if (!oauthReady) {
      return setNote('Google sign-in isn’t set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env, or use the iCal URL / export options below.');
    }
    window.location.href = `${source.start}?return=${encodeURIComponent(window.location.origin)}`;
  };

  const uploadCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNote('');
    setWorking('csv');
    const csvText = await file.text();
    const r = await api('/api/connections/money/csv', { csvText, fileName: file.name, provider: 'csv_upload' });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'That file couldn’t be imported. Nothing was changed.');
    await afterMutate(`Imported ${r.data.imported} transaction${r.data.imported === 1 ? '' : 's'} from ${file.name}.`);
  };

  const sync = async (c) => {
    setWorking(c.id);
    const r = await api(`/api/connections/${encodeURIComponent(c.id)}/sync`, {});
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? `Couldn’t sync ${c.sourceName}.`);
    await afterMutate(`Synced ${c.sourceName}${Number.isFinite(r.data?.imported) ? ` (${r.data.imported} items)` : ''}.`);
  };

  const removeConn = async (c) => {
    setWorking(c.id);
    let ok = false;
    try {
      ok = (await fetch(`/api/connections/${encodeURIComponent(c.id)}`, { method: 'DELETE' })).ok;
    } catch {
      ok = false;
    }
    setWorking('');
    if (!ok) return setNote(`Couldn’t remove ${c.sourceName}. Nothing was changed.`);
    await afterMutate(`Removed ${c.sourceName}. Its items are no longer used.`);
  };

  const resetSample = async () => {
    setWorking('sample');
    const r = await api(`/api/connections/${encodeURIComponent(service.id)}/sample`, {});
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not restore sample data.');
    await afterMutate(`Restored ${service.name} sample data.`);
  };

  // Calendar actions
  const connectIcsUrl = async (e) => {
    e.preventDefault();
    if (!icsUrl.trim()) return;
    setWorking('icsUrl');
    const r = await api('/api/connections/calendar/ics', { icsUrl: icsUrl.trim(), provider: calProv });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not load that calendar URL.');
    setIcsUrl('');
    await afterMutate(`Connected ${r.data.sourceName} (${r.data.imported} events).`);
  };

  const uploadIcsFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setWorking('icsFile');
    const icsText = await file.text();
    const r = await api('/api/connections/calendar/ics', { icsText, fileName: file.name, provider: calProv });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not parse that .ics file.');
    await afterMutate(`Imported ${r.data.imported} events from ${file.name}.`);
  };

  const connectCalDav = async (e) => {
    e.preventDefault();
    setWorking('caldav');
    const r = await api('/api/connections/calendar/caldav', {
      serverUrl: davServer.trim(),
      username: davUser.trim(),
      password: davPass,
      provider: calProv,
      rememberCredentials: davRemember,
    });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'CalDAV connection failed.');
    setDavPass('');
    await afterMutate(`Connected ${r.data.sourceName} (${r.data.imported} events).`);
  };

  const addManualEvent = async (e) => {
    e.preventDefault();
    setWorking('ev');
    const r = await api('/api/connections/calendar/event', { title: calTitle, date: calDate, start: calStart, end: calEnd });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not add event.');
    setCalTitle('');
    await afterMutate('Event added to Calendar.');
  };

  // Notes actions
  const connectFolder = async (e) => {
    e.preventDefault();
    if (!folderPath.trim()) return;
    setWorking('folder');
    const r = await api('/api/connections/notes/markdown', { folderPath: folderPath.trim(), provider: noteProv });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not read folder.');
    await afterMutate(`Connected ${r.data.sourceName} (${r.data.imported} notes).`);
  };

  const uploadNotesFiles = async (e) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    setWorking('notesFiles');
    const files = await Promise.all(picked.map(async (f) => ({ name: f.name, content: await f.text(), updated: new Date(f.lastModified).toISOString().slice(0, 10) })));
    const r = await api('/api/connections/notes/markdown', { files, provider: noteProv === 'google_drive' ? 'google_keep' : noteProv });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not import notes.');
    await afterMutate(`Imported ${r.data.imported} notes from ${r.data.sourceName}.`);
  };

  const addManualNote = async (e) => {
    e.preventDefault();
    setWorking('note');
    const r = await api('/api/connections/notes/note', { title: noteTitle, tags: noteTags, body: noteBody });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not save note.');
    setNoteTitle('');
    await afterMutate('Note saved.');
  };

  // Tasks actions
  const uploadTasksFile = async (e, format) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setWorking('tasksFile');
    const text = await file.text();
    const r = await api('/api/connections/tasks/import', { text, format, provider: taskProv, fileName: file.name });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not import tasks.');
    await afterMutate(`Imported ${r.data.imported} tasks from ${file.name}.`);
  };

  const importChecklist = async (e) => {
    e.preventDefault();
    if (!taskText.trim()) return;
    setWorking('checklist');
    const r = await api('/api/connections/tasks/import', { text: taskText, format: 'checklist', provider: taskProv, fileName: 'Checklist import' });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not import checklist.');
    setTaskText('');
    await afterMutate(`Imported ${r.data.imported} tasks.`);
  };

  const addManualTask = async (e) => {
    e.preventDefault();
    setWorking('task');
    const r = await api('/api/connections/tasks/task', { title: taskTitle, due: taskDue || null });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not add task.');
    setTaskTitle('');
    await afterMutate('Task added.');
  };

  // Money manual expense
  const addManualTxn = async (e) => {
    e.preventDefault();
    setWorking('txn');
    const r = await api('/api/connections/money/transaction', { date: txnDate, merchant: txnMerchant, amount: Number(txnAmount), category: txnCategory });
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? 'Could not save expense.');
    setTxnMerchant('');
    setTxnAmount('');
    await afterMutate('Expense saved.');
  };

  const activeCal = CAL_PROVIDERS.find((p) => p.id === calProv);
  const activeNote = NOTE_PROVIDERS.find((p) => p.id === noteProv);
  const activeTask = TASK_PROVIDERS.find((p) => p.id === taskProv);

  return (
    <div className="prow-links">
      {mine.length > 0 && (
        <ul className="linked">
          {mine.map((c) => (
            <li key={c.id}>
              <Icon name="i-link" />
              <span className="linked-text">
                <strong>{c.sourceName}</strong>
                <span>
                  {c.itemCount ? `${c.itemCount} item${c.itemCount === 1 ? '' : 's'}` : ''}
                  {c.itemCount && c.lastSyncedAt ? ' · ' : ''}
                  {ago(c.lastSyncedAt)}
                </span>
              </span>
              {SYNCABLE.includes(c.sourceType) && (
                <button type="button" className="text-btn" disabled={Boolean(working)} onClick={() => sync(c)}>
                  {working === c.id ? 'Syncing…' : 'Sync'}
                </button>
              )}
              <button type="button" className="text-btn" disabled={Boolean(working)} onClick={() => removeConn(c)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="link-actions">
        {source.kind === 'google' ? (
          <button type="button" className="d-btn is-line is-sm" onClick={startGoogle}>
            <Icon name="i-link" />
            {mine.some((c) => c.sourceType === 'google_oauth') ? 'Reconnect Google' : source.label}
          </button>
        ) : (
          <>
            <button type="button" className="d-btn is-line is-sm" disabled={working === 'csv' || Boolean(linksError)} onClick={() => fileRef.current?.click()}>
              {working === 'csv' ? <span className="spin" aria-hidden="true" /> : <Icon name="i-file" />}
              {working === 'csv' ? 'Importing…' : source.label}
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={uploadCsv} />
          </>
        )}
        <button type="button" className="text-btn" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Hide options' : source.moreLabel}
        </button>
        {source.hint && !expanded ? <span className="fine">{source.hint}</span> : null}
      </div>

      {note || (linksError && source.kind === 'csv') ? (
        <p className="link-note" role="status">
          <Icon name="i-info" />
          <span>{note || linksError}</span>
        </p>
      ) : null}

      {expanded && (
        <div className="link-panel">
          {service.id === 'calendar' && (
            <>
              <div className="link-tabs" role="tablist" aria-label="Calendar app">
                {CAL_PROVIDERS.map((p) => (
                  <button key={p.id} type="button" className={`link-tab${calProv === p.id ? ' is-on' : ''}`} onClick={() => setCalProv(p.id)}>
                    <strong>{p.name}</strong>
                    <span>{p.tag}</span>
                  </button>
                ))}
              </div>
              <div className="link-box">
                <p>{activeCal?.hint}</p>
                {calProv !== 'samsung_calendar' && (
                  <form className="link-inline" onSubmit={connectIcsUrl}>
                    <input type="text" placeholder={calProv === 'apple_calendar' ? 'webcal://p...-caldav.icloud.com/published/2/...' : 'https://calendar.google.com/calendar/ical/.../basic.ics'} value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} />
                    <button type="submit" className="d-btn is-ink is-sm" disabled={Boolean(working) || !icsUrl.trim()}>
                      {working === 'icsUrl' ? 'Syncing…' : 'Connect URL'}
                    </button>
                  </form>
                )}
                {calProv === 'apple_calendar' && (
                  <form className="link-grid" onSubmit={connectCalDav}>
                    <label>iCloud / CalDAV Server<input type="text" value={davServer} onChange={(e) => setDavServer(e.target.value)} /></label>
                    <label>Apple ID Email<input type="email" placeholder="you@icloud.com" value={davUser} onChange={(e) => setDavUser(e.target.value)} required /></label>
                    <label>App-Specific Password<input type="password" placeholder="xxxx-xxxx-xxxx-xxxx" value={davPass} onChange={(e) => setDavPass(e.target.value)} required /></label>
                    <div className="link-inline" style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                        <input type="checkbox" style={{ minHeight: 0, width: 'auto' }} checked={davRemember} onChange={(e) => setDavRemember(e.target.checked)} />
                        Save encrypted credentials for 1-click Sync
                      </label>
                      <button type="submit" className="d-btn is-line is-sm" disabled={Boolean(working)}>
                        {working === 'caldav' ? 'Connecting…' : 'Connect Private iCloud CalDAV'}
                      </button>
                    </div>
                  </form>
                )}
                <div className="link-inline">
                  <label className="d-btn is-line is-sm" style={{ cursor: 'pointer' }}>
                    <Icon name="i-file" />
                    {working === 'icsFile' ? 'Importing…' : `Upload ${activeCal?.name} .ics file`}
                    <input type="file" accept=".ics,text/calendar" hidden disabled={Boolean(working)} onChange={uploadIcsFile} />
                  </label>
                  <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                </div>
              </div>

              <form className="link-box" onSubmit={addManualEvent}>
                <h4>Add an event</h4>
                <div className="link-grid">
                  <label>Title *<input type="text" required placeholder="e.g. Diwali Dinner" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} /></label>
                  <label>Date *<input type="date" required value={calDate} onChange={(e) => setCalDate(e.target.value)} /></label>
                  <label>Start<input type="time" value={calStart} onChange={(e) => setCalStart(e.target.value)} /></label>
                  <label>End<input type="time" value={calEnd} onChange={(e) => setCalEnd(e.target.value)} /></label>
                </div>
                <div className="link-inline">
                  <button type="submit" className="d-btn is-line is-sm" disabled={Boolean(working)}>Add event</button>
                </div>
              </form>

              <div className="link-box">
                <h4>Stored calendar events ({loadingItems ? '…' : items.length})</h4>
                <ul className="link-items">
                  {items.map((ev) => (
                    <li key={ev.id}>
                      <div>
                        <strong>{ev.title}</strong>
                        <span>{fmtDate(ev.date)} · {ev.start}–{ev.end}{ev.source && ev.source !== 'sample data' ? ` · ${ev.source}` : ''}</span>
                      </div>
                      <button type="button" className="text-btn" onClick={async () => { await fetch(`/api/connections/calendar/event/${encodeURIComponent(ev.id)}`, { method: 'DELETE' }); await afterMutate(); }}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {service.id === 'notes' && (
            <>
              <div className="link-tabs" role="tablist" aria-label="Notes app">
                {NOTE_PROVIDERS.map((p) => (
                  <button key={p.id} type="button" className={`link-tab${noteProv === p.id ? ' is-on' : ''}`} onClick={() => setNoteProv(p.id)}>
                    <strong>{p.name}</strong>
                    <span>{p.tag}</span>
                  </button>
                ))}
              </div>
              <div className="link-box">
                <p>{activeNote?.hint}</p>
                {noteProv === 'google_drive' && (
                  <ol className="link-steps">
                    <li>For live cloud sync: click <strong>Connect Google Docs &amp; Drive</strong> above (works for personal Gmail; copy any Keep note via <em>⋮ → Copy to Google Docs</em>).</li>
                    <li>Or go to <strong>takeout.google.com</strong> → export <strong>Keep</strong> → upload the <code>.json</code> files below.</li>
                  </ol>
                )}
                {noteProv === 'obsidian' && (
                  <form className="link-inline" onSubmit={connectFolder}>
                    <input type="text" placeholder="C:\Users\You\Documents\ObsidianVault" value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
                    <button type="submit" className="d-btn is-ink is-sm" disabled={Boolean(working)}>
                      {working === 'folder' ? 'Reading…' : 'Connect folder'}
                    </button>
                  </form>
                )}
                <div className="link-inline">
                  <label className="d-btn is-line is-sm" style={{ cursor: 'pointer' }}>
                    <Icon name="i-file" />
                    {working === 'notesFiles' ? 'Importing…' : noteProv === 'google_drive' ? 'Upload Keep Takeout .json files' : `Upload ${activeNote?.name} (.md / .txt)`}
                    <input type="file" multiple accept={noteProv === 'google_drive' ? '.json,.md,.txt' : '.md,.markdown,.txt,.json'} hidden disabled={Boolean(working)} onChange={uploadNotesFiles} />
                  </label>
                  <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                </div>
              </div>

              <form className="link-box" onSubmit={addManualNote}>
                <h4>Create a note</h4>
                <div className="link-grid">
                  <label>Title *<input type="text" required placeholder="e.g. Project kick-off notes" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} /></label>
                  <label>Tags<input type="text" value={noteTags} onChange={(e) => setNoteTags(e.target.value)} /></label>
                </div>
                <textarea rows={3} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
                <div className="link-inline">
                  <button type="submit" className="d-btn is-line is-sm" disabled={Boolean(working)}>Save note</button>
                </div>
              </form>

              <div className="link-box">
                <h4>Stored notes ({loadingItems ? '…' : items.length})</h4>
                <ul className="link-items">
                  {items.map((n) => (
                    <li key={n.id}>
                      <div>
                        <strong>{n.title}</strong>
                        <span>Updated {fmtDate(n.updated)}{(n.tags ?? []).length ? ` · ${n.tags.join(', ')}` : ''}</span>
                      </div>
                      <button type="button" className="text-btn" onClick={async () => { await fetch(`/api/connections/notes/note/${encodeURIComponent(n.id)}`, { method: 'DELETE' }); await afterMutate(); }}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {service.id === 'tasks' && (
            <>
              <div className="link-tabs" role="tablist" aria-label="Tasks app">
                {TASK_PROVIDERS.map((p) => (
                  <button key={p.id} type="button" className={`link-tab${taskProv === p.id ? ' is-on' : ''}`} onClick={() => setTaskProv(p.id)}>
                    <strong>{p.name}</strong>
                    <span>{p.tag}</span>
                  </button>
                ))}
              </div>
              <div className="link-box">
                <p>{activeTask?.hint}</p>
                {taskProv === 'apple_reminders' && (
                  <div className="link-inline">
                    <label className="d-btn is-line is-sm" style={{ cursor: 'pointer' }}>
                      <Icon name="i-file" />
                      Upload Apple Reminders .ics
                      <input type="file" accept=".ics,text/calendar" hidden disabled={Boolean(working)} onChange={(e) => uploadTasksFile(e, 'ics_vtodo')} />
                    </label>
                    <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                  </div>
                )}
                {taskProv === 'todoist' && (
                  <div className="link-inline">
                    <label className="d-btn is-line is-sm" style={{ cursor: 'pointer' }}>
                      <Icon name="i-file" />
                      Upload Todoist .csv
                      <input type="file" accept=".csv,text/csv" hidden disabled={Boolean(working)} onChange={(e) => uploadTasksFile(e, 'todoist_csv')} />
                    </label>
                    <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                  </div>
                )}
                {taskProv === 'google_tasks' && (
                  <div className="link-inline">
                    <button type="button" className="d-btn is-line is-sm" onClick={startGoogle}>Connect / Sync Google Tasks</button>
                    <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                  </div>
                )}
                {taskProv === 'samsung_reminder' && (
                  <form className="link-box" style={{ padding: 0 }} onSubmit={importChecklist}>
                    <textarea rows={3} placeholder="- [ ] Renew passport&#10;- [ ] Book tickets" value={taskText} onChange={(e) => setTaskText(e.target.value)} />
                    <div className="link-inline">
                      <button type="submit" className="d-btn is-line is-sm" disabled={Boolean(working)}>Import checklist</button>
                      <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                    </div>
                  </form>
                )}
              </div>

              <form className="link-box" onSubmit={addManualTask}>
                <h4>Add a task</h4>
                <div className="link-grid">
                  <label>Task title *<input type="text" required placeholder="e.g. Call tailor" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /></label>
                  <label>Due date<input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></label>
                </div>
                <div className="link-inline">
                  <button type="submit" className="d-btn is-line is-sm" disabled={Boolean(working)}>Add task</button>
                </div>
              </form>

              <div className="link-box">
                <h4>Stored to-dos ({loadingItems ? '…' : items.length})</h4>
                <ul className="link-items">
                  {items.map((t) => (
                    <li key={t.id} className={t.status === 'done' ? 'is-done' : ''}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={t.status === 'done'}
                          onChange={async () => {
                            await fetch(`/api/connections/tasks/${encodeURIComponent(t.id)}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: t.status === 'done' ? 'open' : 'done' }),
                            });
                            await afterMutate();
                          }}
                        />
                        <div>
                          <strong>{t.title}</strong>
                          <span>{t.due ? `Due ${fmtDate(t.due)} · ` : ''}{t.list}{t.source ? ` · ${t.source}` : ''}</span>
                        </div>
                      </div>
                      <button type="button" className="text-btn" onClick={async () => { await fetch(`/api/connections/tasks/${encodeURIComponent(t.id)}`, { method: 'DELETE' }); await afterMutate(); }}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {service.id === 'money' && (
            <>
              <div className="link-box">
                <p>Upload CSV exports from HDFC, ICICI, SBI, Axis, GPay / PhonePe / Paytm, or Splitwise (<code>Date, Description, Category, Cost</code>).</p>
                <div className="link-inline">
                  <button
                    type="button"
                    className="d-btn is-line is-sm"
                    disabled={Boolean(working)}
                    onClick={async () => {
                      const csvText = `date,merchant,amount,category\n2026-11-24,Corner Brew Café,260,Dining out\n2026-11-25,Fresh Basket,1480,Groceries\n2026-11-26,Metro Card,400,Transport`;
                      const r = await api('/api/connections/money/csv', { csvText, fileName: 'demo-statement.csv', provider: 'csv_upload' });
                      if (!r.ok) return setNote(r.data?.error ?? 'Could not import CSV.');
                      await afterMutate(`Imported ${r.data.imported} demo transactions.`);
                    }}
                  >
                    Import 3-row demo CSV
                  </button>
                  <button type="button" className="text-btn" disabled={Boolean(working)} onClick={resetSample}>Restore sample</button>
                </div>
              </div>

              <form className="link-box" onSubmit={addManualTxn}>
                <h4>Add expense</h4>
                <div className="link-grid">
                  <label>Date *<input type="date" required value={txnDate} onChange={(e) => setTxnDate(e.target.value)} /></label>
                  <label>Merchant *<input type="text" required placeholder="e.g. Swiggy" value={txnMerchant} onChange={(e) => setTxnMerchant(e.target.value)} /></label>
                  <label>Amount (₹) *<input type="number" min="1" required placeholder="450" value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} /></label>
                  <label>Category
                    <select value={txnCategory} onChange={(e) => setTxnCategory(e.target.value)}>
                      <option>Groceries</option><option>Dining out</option><option>Food delivery</option><option>Transport</option><option>Shopping</option><option>Bills</option><option>Other</option>
                    </select>
                  </label>
                </div>
                <div className="link-inline">
                  <button type="submit" className="d-btn is-line is-sm" disabled={Boolean(working)}>Save expense</button>
                </div>
              </form>

              <div className="link-box">
                <h4>Transactions ({loadingItems ? '…' : items.length})</h4>
                <ul className="link-items">
                  {items.map((tx) => (
                    <li key={tx.id}>
                      <div>
                        <strong>{tx.merchant} · {money.format(tx.amount)}</strong>
                        <span>{fmtDate(tx.date)} · {tx.category}</span>
                      </div>
                      <button type="button" className="text-btn" onClick={async () => { await fetch(`/api/connections/money/transaction/${encodeURIComponent(tx.id)}`, { method: 'DELETE' }); await afterMutate(); }}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ s, busy, focus, onConnect, onDisconnect, techDetails, links }) {
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const on = s.state === 'connected';

  useEffect(() => {
    if (!focus) return;
    if (s.state === 'off') setAsking(true);
    else setOpen(true);
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'center' }));
  }, [focus, s.state]);

  useEffect(() => {
    if (on) setAsking(false);
  }, [on]);

  const sub = on ? 'Connected' : s.notSetUp ? 'Not set up yet' : s.state === 'unavailable' ? 'Can’t reach it right now' : 'Not connected';

  return (
    <li ref={ref} className={`prow is-${s.state}`} data-yarn={s.id}>
      <div className="prow-main">
        <span className="prow-icon" aria-hidden="true">
          <Icon name={s.icon} />
        </span>
        <button type="button" className="prow-text" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="prow-title">{s.name}</span>
          <span className="prow-sub">
            <span className="dot" aria-hidden="true" />
            {sub}
            <span className="prow-helps"> · {s.helps}</span>
          </span>
        </button>
        {s.state !== 'unavailable' && (
          <Switch
            on={on || asking}
            busy={busy}
            label={`${s.name}: ${on ? 'connected' : 'not connected'}`}
            onChange={(next) => {
              if (next) setAsking(true);
              else if (asking) setAsking(false);
              else onDisconnect(s.id);
            }}
          />
        )}
      </div>

      {asking && !on && (
        <div className="prow-detail is-ask" role="group" aria-label={`Allow Weave to use ${s.name}`}>
          <p>
            <strong>Weave will be able to see</strong> {s.sees.charAt(0).toLowerCase() + s.sees.slice(1)} {s.changes}
          </p>
          <div className="row-actions">
            <button type="button" className="d-btn is-ink is-sm" disabled={busy} onClick={() => onConnect(s.id)}>
              Allow
            </button>
            <button type="button" className="d-btn is-plain is-sm" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && !asking && (
        <div className="prow-detail">
          <p>
            <strong>Can see:</strong> {s.sees}
          </p>
          <p>
            <strong>Changes:</strong> {s.changes}
          </p>
          {s.state === 'unavailable' && <p>{s.notSetUp ? 'This service hasn’t been set up on this Weave server yet.' : 'Answers won’t include it until Weave can reach it again.'}</p>}
          {techDetails && (
            <p className="mono">
              {s.tools.map((t) => `${t.name}${t.readOnly ? '' : ' (asks first)'}`).join(' · ') || s.error}
            </p>
          )}
        </div>
      )}

      {!s.notSetUp && links}
    </li>
  );
}

export function ConnectionsPage({ focusId, services, planned, offline, pending, onConnect, onDisconnect, onRetry, reader, readerAllowed, onSetReader, techDetails, activity, onNotify = () => {}, onLinked = () => {} }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [linked, setLinked] = useState({ list: [], oauthReady: false, error: '' });
  const focus = focusId ?? searchParams.get('app');

  const loadLinks = useCallback(async () => {
    const r = await api('/api/connections');
    if (r.ok) setLinked({ list: r.data.list ?? [], oauthReady: Boolean(r.data.oauth?.google?.configured), error: '' });
    else setLinked({ list: [], oauthReady: false, error: 'Linking apps needs the database. Add MONGODB_URI to backend/.env and restart the backend.' });
  }, []);

  useEffect(() => {
    if (!offline) loadLinks();
  }, [offline, loadLinks]);

  // Coming back from Google sign-in: say what happened, turn the service on, tidy the address bar.
  useEffect(() => {
    const connected = searchParams.get('connected');
    const failed = searchParams.get('oauth_error');
    if (!connected && !failed) return;
    if (failed) {
      onNotify(failed === 'access_denied' ? 'Google sign-in was cancelled. Nothing was connected.' : `Google sign-in didn’t work: ${failed}`);
    } else if (connected === 'google') {
      const events = Number(searchParams.get('events') ?? 0);
      const tasks = Number(searchParams.get('tasks') ?? 0);
      onNotify(`Google connected: ${events} event${events === 1 ? '' : 's'} and ${tasks} task${tasks === 1 ? '' : 's'} brought in.`);
      onLinked('calendar');
      if (tasks) onLinked('tasks');
    } else if (connected === 'google_drive' || connected === 'google_keep') {
      const notes = Number(searchParams.get('notes') ?? 0);
      onNotify(`${connected === 'google_drive' ? 'Google Docs & Drive' : 'Google Keep'} connected: ${notes} note${notes === 1 ? '' : 's'} brought in.`);
      onLinked('notes');
    }
    loadLinks();
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const k of ['connected', 'oauth_error', 'events', 'tasks', 'notes']) p.delete(k);
        return p;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Connections</h1>
        <p>Choose what Weave can look at and link real accounts or exports. Nothing changes without your approval.</p>
      </header>

      {offline ? (
        <div className="page-note">
          <Icon name="i-alert" />
          <p>Weave can’t reach its server right now, so services can’t be used. Your saved papers still work.</p>
          <button type="button" className="d-btn is-line is-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <ul className="plist">
          {services.map((s) => (
            <ServiceRow
              key={s.id}
              s={s}
              busy={Boolean(pending[s.id])}
              focus={focus === s.id}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              techDetails={techDetails}
              links={
                <AppLinks
                  service={s}
                  links={linked.list}
                  oauthReady={linked.oauthReady}
                  linksError={linked.error}
                  onChanged={loadLinks}
                  onNotify={onNotify}
                  onLinked={onLinked}
                />
              }
            />
          ))}
        </ul>
      )}

      {reader?.available && (
        <>
          <h2 className="page-sub">On this device</h2>
          <ul className="plist">
            <li className="prow">
              <div className="prow-main">
                <span className="prow-icon" aria-hidden="true">
                  <Icon name="i-camera" />
                </span>
                <span className="prow-text">
                  <span className="prow-title">Read photos and PDFs</span>
                  <span className="prow-sub">Photos you add are sent to NVIDIA NIM to fill in the details</span>
                </span>
                <Switch on={readerAllowed} label="Read photos and PDFs with NVIDIA NIM" onChange={onSetReader} />
              </div>
            </li>
          </ul>
        </>
      )}

      <p className="page-foot">
        {planned?.length ? `Coming later: ${joinNames(planned.map((p) => p.name))}. ` : ''}
        Services start with demo sample data until you connect Google, Apple, Samsung, Outlook, Obsidian, or CSV exports.
      </p>

      {techDetails && !offline && activity.length > 0 && (
        <details className="tech">
          <summary>Recent MCP calls ({Math.min(activity.length, 40)})</summary>
          <ol className="tech-log">
            {[...activity].reverse().slice(0, 40).map((x) => (
              <li key={x.seq}>
                <code>
                  {x.server}
                  {x.tool ? `.${x.tool}` : ` ${x.method}`}
                </code>
                <span className="muted">
                  {x.method === 'held' ? 'held for approval' : `${x.ms} ms`}
                  {x.summary ? ` · ${x.summary}` : ''}
                  {x.args && Object.keys(x.args).length ? ` · ${fmtArgs(x.args)}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
