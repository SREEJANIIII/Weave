import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../Icons';
import { api } from '../../lib/api';
import { fmtArgs } from '../../lib/formatters';
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

// Where each service's real data can come from. Google sign-in is handled by the backend
// (/api/oauth/google/*); bank statements go to /api/connections/money/csv.
const SOURCES = {
  calendar: { kind: 'google', label: 'Connect Google Calendar', start: '/api/oauth/google/start', hint: 'Brings in Google Tasks too' },
  tasks: { kind: 'google', label: 'Connect Google Tasks', start: '/api/oauth/google/start', hint: 'Same Google sign-in as Calendar' },
  notes: { kind: 'google', label: 'Connect Google Keep', start: '/api/oauth/google/keep/start' },
  money: { kind: 'csv', label: 'Upload bank statement (.csv)', hint: 'Needs date, description and amount columns' },
};
const SYNCABLE = ['ics_url', 'caldav', 'markdown_folder', 'google_oauth'];

function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `synced ${hours} h ago` : `synced ${Math.round(hours / 24)} d ago`;
}

/** "Connect Google Calendar", "Upload bank statement", plus the accounts already linked for one service. */
function AppLinks({ service, links, oauthReady, linksError, onChanged, onNotify, onLinked }) {
  const source = SOURCES[service.id];
  const [note, setNote] = useState('');
  const [working, setWorking] = useState('');
  const fileRef = useRef(null);
  if (!source) return null;
  const mine = links.filter((c) => c.app === service.id && c.sourceType !== 'sample');

  const startGoogle = () => {
    if (linksError) return setNote(linksError);
    if (!oauthReady) {
      return setNote('Google sign-in isn’t set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env, then restart the backend.');
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
    onNotify(`Imported ${r.data.imported} transaction${r.data.imported === 1 ? '' : 's'} from ${file.name}.`);
    onLinked(service.id);
    onChanged();
  };

  const sync = async (c) => {
    setWorking(c.id);
    const r = await api(`/api/connections/${encodeURIComponent(c.id)}/sync`, {});
    setWorking('');
    if (!r.ok) return setNote(r.data?.error ?? `Couldn’t sync ${c.sourceName}.`);
    onNotify(`Synced ${c.sourceName}${Number.isFinite(r.data?.imported) ? ` (${r.data.imported} items)` : ''}.`);
    onChanged();
  };

  const remove = async (c) => {
    setWorking(c.id);
    let ok = false;
    try {
      ok = (await fetch(`/api/connections/${encodeURIComponent(c.id)}`, { method: 'DELETE' })).ok;
    } catch {
      ok = false;
    }
    setWorking('');
    if (!ok) return setNote(`Couldn’t remove ${c.sourceName}. Nothing was changed.`);
    onNotify(`Removed ${c.sourceName}. Its items are no longer used.`);
    onChanged();
  };

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
              <button type="button" className="text-btn" disabled={Boolean(working)} onClick={() => remove(c)}>
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
        {source.hint ? <span className="fine">{source.hint}</span> : null}
      </div>
      {note || (linksError && source.kind === 'csv') ? (
        <p className="link-note" role="status">
          <Icon name="i-info" />
          <span>{note || linksError}</span>
        </p>
      ) : null}
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
    } else if (connected === 'google_keep') {
      const notes = Number(searchParams.get('notes') ?? 0);
      onNotify(`Google Keep connected: ${notes} note${notes === 1 ? '' : 's'} brought in.`);
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
        <p>Choose what Weave can look at. It only reads what a question needs, and asks before changing anything.</p>
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
        In this prototype every service uses sample data.
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
