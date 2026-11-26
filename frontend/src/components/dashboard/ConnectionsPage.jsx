import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
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

function ServiceRow({ s, busy, focus, onConnect, onDisconnect, techDetails }) {
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
    </li>
  );
}

export function ConnectionsPage({ focusId, services, planned, offline, pending, onConnect, onDisconnect, onRetry, techDetails, activity }) {
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
            <ServiceRow key={s.id} s={s} busy={Boolean(pending[s.id])} focus={focusId === s.id} onConnect={onConnect} onDisconnect={onDisconnect} techDetails={techDetails} />
          ))}
        </ul>
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
