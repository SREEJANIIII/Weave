import React, { useRef } from 'react';
import { Icon } from '../Icons';
import { ICON, YARN, clock, describeRecord, fmtArgs, plural } from '../../lib/formatters';

const TABS = ['apps', 'sources', 'activity'];

export function InspectorPanel({
  tab,
  onSelectTab,
  status,
  offline,
  busy,
  run,
  activity,
  litN,
  sourceRefs,
  onToggleApp,
}) {
  const tabRefs = useRef({});
  const switchRefs = useRef({});

  const answer = run?.answer;
  const citedSources = answer ? answer.sources.filter((s) => s.n) : [];
  const uncitedSources = answer ? answer.sources.filter((s) => !s.n) : [];
  const activityItems = [...activity].reverse();

  const select = (name, focus = false) => {
    onSelectTab(name);
    if (focus) requestAnimationFrame(() => tabRefs.current[name]?.focus());
  };

  const renderSourceCard = (s, idx) => {
    const r = describeRecord(s.record);
    return (
      <li
        key={s.source_id || idx}
        ref={
          s.n
            ? (el) => {
                if (el) sourceRefs.current.set(s.n, el);
                else sourceRefs.current.delete(s.n);
              }
            : undefined
        }
        className={`source${s.n && litN === s.n ? ' is-lit' : ''}`}
        id={s.n ? `src-${s.n}` : undefined}
        tabIndex={s.n ? -1 : undefined}
        data-yarn={YARN[s.server] ?? s.server}
        data-n={s.n ?? undefined}
      >
        <span className="source-n">{s.n ? String(s.n) : ''}</span>
        <span className="source-app">
          <Icon name={ICON[s.server] ?? 'i-plug'} />
          {s.app}
        </span>
        <span className="source-title">{r.title}</span>
        {r.meta ? <span className="source-meta">{r.meta}</span> : null}
        {r.snippet ? <span className="source-snippet">{r.snippet}</span> : null}
      </li>
    );
  };

  return (
    <aside className="inspector" aria-label="Apps, sources and MCP activity">
      <div className="tabs" role="tablist" aria-label="Inspector">
        {[
          { id: 'apps', label: 'Apps', count: '' },
          { id: 'sources', label: 'Sources', count: citedSources.length ? String(citedSources.length) : '' },
          { id: 'activity', label: 'MCP activity', count: activityItems.length ? String(activityItems.length) : '' },
        ].map((t, i) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              className="tab"
              role="tab"
              id={`tab-${t.id}`}
              aria-controls={`panel-${t.id}`}
              aria-selected={String(on)}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') select(TABS[(i + 1) % TABS.length], true);
                else if (e.key === 'ArrowLeft') select(TABS[(i + TABS.length - 1) % TABS.length], true);
                else if (e.key === 'Home') select(TABS[0], true);
                else if (e.key === 'End') select(TABS.at(-1), true);
              }}
            >
              {t.label} <span className="count">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Apps Panel */}
      <div className="panel" id="panel-apps" role="tabpanel" aria-labelledby="tab-apps" hidden={tab !== 'apps'}>
        {offline ? (
          <div className="empty">
            <strong>No apps to show</strong>
            The Weave server is not running, so no MCP servers are connected.
          </div>
        ) : !status ? (
          <>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="skeleton" aria-hidden="true" />
            ))}
            <p className="panel-note">Connecting to the MCP servers</p>
          </>
        ) : (
          <>
            <h2>Connected through MCP</h2>
            <p className="panel-note">Switch an app off and Weave stops reading it. Tools that change data always ask first.</p>
            <ul className="apps">
              {status.apps.map((a) => {
                const yarn = YARN[a.id] ?? a.id;
                const on = a.enabled && a.status === 'connected';
                const broken = a.status !== 'connected';
                const reads = a.tools.filter((t) => t.readOnly).length;
                const line = broken
                  ? `Couldn't connect: ${a.error ?? a.status}`
                  : a.enabled
                    ? `${a.blurb}. ${plural(a.tools.length, 'tool')}, sample data.`
                    : 'Switched off. Weave will not read it.';
                return (
                  <li key={a.id} className={`app${on ? '' : ' is-off'}`} data-yarn={yarn}>
                    <div className="app-row">
                      <span className="swatch" data-yarn={yarn} aria-hidden="true" />
                      <div>
                        <div className="app-name">{a.name}</div>
                        <div className="app-blurb">{line}</div>
                      </div>
                      <button
                        ref={(el) => { switchRefs.current[a.id] = el; }}
                        className="switch"
                        type="button"
                        role="switch"
                        aria-checked={String(a.enabled)}
                        aria-label={`Let Weave use ${a.name}`}
                        disabled={broken || busy}
                        onClick={async () => {
                          await onToggleApp(a);
                          requestAnimationFrame(() => switchRefs.current[a.id]?.focus());
                        }}
                      />
                    </div>
                    {a.tools.length > 0 && (
                      <details>
                        <summary>{`${plural(a.tools.length, 'tool')}: ${reads} read, ${a.tools.length - reads} ask first`}</summary>
                        <ul className="tools">
                          {a.tools.map((t) => (
                            <li key={t.name}>
                              <code title={t.description}>{t.name}</code>
                              <span className={`tool-kind${t.readOnly ? '' : ' is-write'}`}>
                                {t.readOnly ? 'reads' : 'asks first'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            <h2>Wishlist &amp; Size Intelligence</h2>
            <ul className="apps">
              <li className="app" data-yarn="wishlist">
                <div className="app-row">
                  <span className="swatch" data-yarn="wishlist" aria-hidden="true" />
                  <div>
                    <div className="app-name">Smart Wishlist &amp; Size Profile</div>
                    <div className="app-blurb">Local browser sample data. External brand APIs are not connected yet.</div>
                  </div>
                </div>
              </li>
            </ul>
            <h2>Planned, not connected</h2>
            <ul className="planned">
              {(status.planned ?? []).map((p) => (
                <li key={p.id}>
                  <span className="swatch" data-yarn={p.id} aria-hidden="true" />
                  <span>
                    <span>{p.name}</span>
                    <br />
                    <span>{p.blurb}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Sources Panel */}
      <div className="panel" id="panel-sources" role="tabpanel" aria-labelledby="tab-sources" hidden={tab !== 'sources'}>
        {!answer ? (
          busy ? (
            <>
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton" aria-hidden="true" />
              ))}
              <p className="panel-note">Records appear here once the answer is ready.</p>
            </>
          ) : (
            <div className="empty">
              <strong>No sources yet</strong>
              Every record Weave reads lands here, numbered when the answer cites it.
            </div>
          )
        ) : (
          <>
            <h2>{citedSources.length ? 'Cited in the answer' : 'Read for this answer'}</h2>
            {citedSources.length ? (
              <ol className="sources">{citedSources.map(renderSourceCard)}</ol>
            ) : (
              <p className="panel-note">The answer cites no records.</p>
            )}
            {uncitedSources.length > 0 && (
              <details className="uncited">
                <summary>{`Also read, not cited (${uncitedSources.length})`}</summary>
                <ul className="sources">{uncitedSources.map(renderSourceCard)}</ul>
              </details>
            )}
          </>
        )}
      </div>

      {/* Activity Panel */}
      <div className="panel" id="panel-activity" role="tabpanel" aria-labelledby="tab-activity" hidden={tab !== 'activity'}>
        {offline ? (
          <div className="empty">
            <strong>No activity</strong>
            Start the Weave server to see its MCP messages.
          </div>
        ) : !activityItems.length ? (
          <div className="empty">
            <strong>No MCP calls yet</strong>
            Ask a question and every tools/call appears here.
          </div>
        ) : (
          <>
            <p className="panel-note">Every MCP message between Weave and your apps, newest first.</p>
            <ol className="log">
              {activityItems.map((x) => {
                const flags = [];
                if (x.method === 'held') flags.push({ cls: 'log-flag is-held', text: 'held for approval' });
                else if (x.summary === 'approved by you') flags.push({ cls: 'log-flag', text: 'approved by you' });
                else if (x.summary === 'read back to confirm') flags.push({ cls: 'log-flag', text: 'read back' });
                if (x.isError) flags.push({ cls: 'log-flag is-error', text: 'error' });
                const app = status?.apps.find((a) => a.id === x.server)?.name ?? x.server;
                const yarn = YARN[x.server] ?? x.server;
                return (
                  <li key={x.seq}>
                    <span className="swatch" data-yarn={yarn} aria-hidden="true" />
                    <span className="log-what">
                      {`${app} `}
                      {x.tool ? <code>{x.tool}</code> : <span className="log-method">{x.method}</span>}
                      {x.tool ? <span className="log-method">{` ${x.method === 'held' ? 'drafted' : x.method}`}</span> : null}
                      {flags.map((f, idx) => (
                        <span key={idx} className={f.cls}>{f.text}</span>
                      ))}
                    </span>
                    <span className="log-ms">{x.method === 'held' ? clock(x.at) : `${x.ms} ms`}</span>
                    {x.args && Object.keys(x.args).length > 0 && (
                      <span className="log-args">{fmtArgs(x.args)}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </aside>
  );
}

