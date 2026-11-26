import React, { useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { EDITABLE, YARN, describeRecord, fmtArgs, fmtDate, listJoin, plural } from '../../lib/formatters';

function CiteButton({ n, source, litN, onLight, onOpenSource }) {
  if (!source) return null;
  const { title } = describeRecord(source.record);
  return (
    <button
      className={`cite${litN === n ? ' is-lit' : ''}`}
      type="button"
      data-n={n}
      data-yarn={YARN[source.server] ?? source.server}
      aria-label={`Source ${n}: ${source.app}, ${title}`}
      onClick={() => onOpenSource(n)}
      onMouseEnter={() => onLight(n)}
      onMouseLeave={() => onLight(null)}
      onFocus={() => onLight(n)}
      onBlur={() => onLight(null)}
    >
      {n}
    </button>
  );
}

function DraftCard({ proposal, sourceMap, nFor, litN, onLight, onOpenSource, onApprove, onDismiss }) {
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState({});
  const approveBtnRef = useRef(null);
  const firstEditRef = useRef(null);

  const yarn = YARN[proposal.server] ?? proposal.server;
  const args = proposal.args ?? {};
  const isEditing = editing && proposal.status === 'pending';

  const meta =
    proposal.tool === 'create_event'
      ? [
          ['Date', fmtDate(args.date)],
          ['Time', `${args.start} to ${args.end}`],
          args.notes && ['Notes', args.notes],
        ]
      : [
          ['Due', args.due ? fmtDate(args.due) : 'No date'],
          args.list && ['List', args.list],
        ];

  const startEdit = () => {
    const initial = {};
    for (const [key] of EDITABLE[proposal.tool] ?? []) {
      initial[key] = args[key] ?? '';
    }
    setFormValues(initial);
    setEditing(true);
    requestAnimationFrame(() => firstEditRef.current?.focus());
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormValues({});
    requestAnimationFrame(() => approveBtnRef.current?.focus());
  };

  const submitEdit = (e) => {
    e.preventDefault();
    setEditing(false);
    onApprove(proposal, formValues);
  };

  const cardCls = [
    'draft',
    proposal.status === 'done' || proposal.status === 'unverified' ? 'is-done' : '',
    proposal.status === 'dismissed' ? 'is-dismissed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cardCls} data-yarn={yarn} aria-label={`Draft: ${proposal.toolTitle} in ${proposal.app}`}>
      <p className="draft-head">
        <span className="swatch" data-yarn={yarn} aria-hidden="true" />
        {`${proposal.toolTitle} in ${proposal.app}`}
      </p>
      <p className="draft-title">{args.title}</p>
      <dl className="draft-meta">
        {meta.filter(Boolean).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {proposal.why ? (
        <p className="draft-why">
          {proposal.why}
          {(proposal.sourceIds ?? []).map((id) => {
            const n = nFor(id);
            return n ? (
              <CiteButton
                key={id}
                n={n}
                source={sourceMap.get(n)}
                litN={litN}
                onLight={onLight}
                onOpenSource={onOpenSource}
              />
            ) : null;
          })}
        </p>
      ) : null}

      {isEditing ? (
        <form className="draft-edit" onSubmit={submitEdit}>
          {(EDITABLE[proposal.tool] ?? []).map(([key, type, label], idx) => (
            <div key={key} className={`field${key === 'title' ? ' field-wide' : ''}`}>
              <label htmlFor={`edit-${proposal.id}-${key}`}>{label}</label>
              <input
                ref={idx === 0 ? firstEditRef : undefined}
                id={`edit-${proposal.id}-${key}`}
                name={key}
                type={type}
                value={formValues[key] ?? args[key] ?? ''}
                required={key === 'title'}
                autoComplete="off"
                onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="draft-actions field-wide">
            <button className="btn btn-primary" type="submit">
              <Icon name="i-check" />
              Approve with changes
            </button>
            <button className="btn btn-link" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : proposal.status === 'pending' ? (
        <div className="draft-actions">
          <button
            ref={approveBtnRef}
            className="btn btn-primary"
            type="button"
            onClick={() => onApprove(proposal)}
          >
            <Icon name="i-check" />
            Approve
          </button>
          <button className="btn btn-quiet" type="button" onClick={startEdit}>
            <Icon name="i-pencil" />
            Edit first
          </button>
          <button className="btn btn-link" type="button" onClick={() => onDismiss(proposal)}>
            Dismiss
          </button>
        </div>
      ) : proposal.status === 'running' ? (
        <p className="draft-result is-muted">
          <span className="spinner" aria-hidden="true" />
          {`Adding to ${proposal.app}, then reading it back to confirm`}
        </p>
      ) : proposal.status === 'done' ? (
        <p className="draft-result is-ok" role="status">
          <Icon name="i-check" />
          <span>
            {`Added to ${proposal.app} and read back to confirm.${
              (proposal.conflicts ?? []).length
                ? ` It overlaps ${listJoin(proposal.conflicts.map((c) => `“${c.title}” (${c.start} to ${c.end})`))}.`
                : ''
            }`}
          </span>
        </p>
      ) : proposal.status === 'unverified' ? (
        <p className="draft-result is-warn" role="status">
          <Icon name="i-alert" />
          <span>{`${proposal.app} accepted it, but Weave couldn't read it back. Check ${proposal.app} before relying on it.`}</span>
        </p>
      ) : proposal.status === 'failed' ? (
        <p className="draft-result is-bad" role="alert">
          <Icon name="i-alert" />
          <span>{`${proposal.app} refused it: ${proposal.error ?? 'no reason given.'} Nothing was changed.`}</span>
        </p>
      ) : proposal.status === 'dismissed' ? (
        <p className="draft-result is-muted" role="status">
          <Icon name="i-x" />
          <span>Dismissed. Nothing was changed.</span>
        </p>
      ) : null}
    </article>
  );
}

export const RunView = React.forwardRef(function RunView(
  { run, busy, litN, onLight, onOpenSource, onApprove, onDismiss, onInspectSize, onOpenWishlist },
  ref,
) {
  const [callsOpenOverride, setCallsOpenOverride] = useState(null);
  const lastRunSeqRef = useRef(null);

  if ((run?.seq ?? null) !== lastRunSeqRef.current) {
    lastRunSeqRef.current = run?.seq ?? null;
    if (callsOpenOverride !== null) setCallsOpenOverride(null);
  }

  const sourceMap = useMemo(() => {
    const m = new Map();
    for (const s of run?.answer?.sources ?? []) {
      if (s.n) m.set(s.n, s);
    }
    return m;
  }, [run?.answer]);

  const nFor = useMemo(() => {
    const map = new Map();
    for (const s of run?.answer?.sources ?? []) {
      if (s.n) map.set(s.source_id, s.n);
    }
    return (id) => map.get(id) ?? null;
  }, [run?.answer]);

  if (!run) {
    return <section ref={ref} className="run" id="run" aria-live="polite" aria-busy="false" hidden />;
  }

  const drafts = [];
  let k = 0;
  for (const s of run.steps) {
    drafts.push(s.kind === 'write' ? run.proposals[k++] ?? null : null);
  }

  const reads = run.steps.filter((s) => s.kind === 'read');
  const pending = run.proposals.filter((p) => p.status === 'pending').length;

  let statusContent;
  if (!run.done) {
    const last = run.steps.at(-1);
    statusContent = (
      <>
        <span className="spinner" aria-hidden="true" />
        <span>
          {last ? `${last.kind === 'write' ? 'Drafting a change in' : 'Reading'} ${last.app}` : 'Planning which apps to read'}
        </span>
      </>
    );
  } else if (run.error && !run.answer) {
    statusContent = <span>Stopped before an answer.</span>;
  } else {
    const apps = [...new Set(reads.filter((s) => s.status === 'done').map((s) => s.app))];
    statusContent = (
      <span>
        {`Woven from ${plural(reads.length, 'read')}${apps.length ? ` across ${listJoin(apps)}` : ''}.${
          pending ? ` ${pending === 1 ? 'One change waits' : `${pending} changes wait`} for your OK.` : ''
        }`}
      </span>
    );
  }

  const callsOpen = callsOpenOverride ?? !run.answer;

  return (
    <section ref={ref} className="run" id="run" aria-live="polite" aria-busy={String(busy)}>
      <p className="run-q">{run.question}</p>

      <div className="loomstrip">
        <ol className="picks" aria-label="MCP calls in this run">
          {run.steps.map((s, i) => {
            const d = drafts[i];
            let state =
              s.status === 'running'
                ? 'is-running'
                : s.status === 'error'
                  ? 'is-error'
                  : s.kind === 'write'
                    ? 'is-held'
                    : '';
            if (d?.status === 'done' || d?.status === 'unverified') state = '';
            if (d?.status === 'dismissed' || d?.status === 'failed') state = 'is-held is-dropped';
            const label = `${s.app} ${s.tool}: ${
              s.kind === 'write'
                ? d?.status === 'done'
                  ? 'approved and added'
                  : d?.status === 'dismissed'
                    ? 'dismissed'
                    : 'held for your approval'
                : s.summary ?? s.status
            }`;
            return (
              <li
                key={s.id}
                className={`pick ${state}`.trim()}
                data-yarn={YARN[s.server] ?? s.server}
                title={label}
                aria-label={label}
              />
            );
          })}
        </ol>
        <p className="run-status" role="status">{statusContent}</p>
      </div>

      {run.steps.length > 0 && (
        <details
          className="calls"
          open={callsOpen}
          onToggle={(e) => setCallsOpenOverride(e.currentTarget.open)}
        >
          <summary>{`MCP calls in this run (${run.steps.length})`}</summary>
          <ol className="steps">
            {run.steps.map((s, i) => {
              const d = drafts[i];
              const held = s.kind === 'write';
              const yarn = YARN[s.server] ?? s.server;
              const isHeld = held && (!d || d.status === 'pending');
              return (
                <li
                  key={s.id}
                  className={`step${isHeld ? ' is-held' : ''}${s.status === 'error' ? ' is-error' : ''}`}
                >
                  <span className="swatch" data-yarn={yarn} aria-hidden="true" />
                  <span className="step-app">{s.app}</span>
                  <span className="step-call">
                    <code>{s.tool}</code> <span className="step-args">{fmtArgs(s.args)}</span>
                  </span>
                  <span className="step-out">
                    {s.status === 'running' ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        reading
                      </>
                    ) : s.status === 'error' ? (
                      'failed'
                    ) : held ? (
                      d?.status === 'done'
                        ? 'approved, added'
                        : d?.status === 'dismissed'
                          ? 'dismissed'
                          : d?.status === 'failed'
                            ? 'failed'
                            : 'held for approval'
                    ) : (
                      <>
                        {s.summary ?? 'done'}
                        {s.ms !== undefined ? `, ${s.ms} ms` : ''}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}

      {run.error && (
        <div className="notice run-error" role="alert">
          <Icon name="i-alert" />
          <div>
            <strong>{run.error.message ?? 'Something went wrong.'}</strong>
            {run.error.hint ? <p>{run.error.hint}</p> : null}
          </div>
        </div>
      )}

      {run.answer && (
        <div className="answer">
          <h2 className="answer-head">{run.answer.headline || 'Here is what I found.'}</h2>
          {run.answer.sections.map((sec) => (
            <div key={sec.title} className="answer-section">
              <h3>{sec.title}</h3>
              <ul className="items">
                {sec.items.map((it, idx) => (
                  <li key={idx} className="item">
                    <span className="item-text">{it.text}</span>
                    {it.detail ? <span className="item-detail">{it.detail}</span> : null}
                    <span className="cites">
                      {it.sourceIds.map((id) => {
                        const n = nFor(id);
                        return n ? (
                          <CiteButton
                            key={id}
                            n={n}
                            source={sourceMap.get(n)}
                            litN={litN}
                            onLight={onLight}
                            onOpenSource={onOpenSource}
                          />
                        ) : null;
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {run.answer.caveats.length > 0 && (
            <div className="caveats">
              {run.answer.caveats.map((c, i) => (
                <p key={i}>
                  <Icon name="i-alert" />
                  <span>{c}</span>
                </p>
              ))}
            </div>
          )}
          <p className="stats">
            {`${plural(run.answer.stats.reads, 'MCP read')} in ${run.answer.stats.ms} ms. Planner: ${
              run.answer.stats.mode === 'claude'
                ? `Claude (${run.answer.stats.model})`
                : run.answer.stats.mode === 'local-wishlist'
                  ? 'local Wishlist & Size Intelligence (sample data)'
                  : 'offline script'
            }.`}
          </p>
        </div>
      )}

      {run.highlightedProducts?.length > 0 && (
        <div className="wl-inline-results" aria-label="Matched wishlist items and size intelligence">
          <div className="wl-inline-head">
            <h3>Matched Wishlist &amp; Size Intelligence</h3>
            {onOpenWishlist && (
              <button className="btn btn-link btn-sm" type="button" onClick={onOpenWishlist}>
                Open full Wishlist
              </button>
            )}
          </div>
          <div className="wl-inline-grid">
            {run.highlightedProducts.map(({ item, rec }) => (
              <div key={item.id} className="wl-inline-card" data-yarn="wishlist">
                <img src={item.image} alt="" className="wl-inline-thumb" />
                <div className="wl-inline-info">
                  <span className="wl-inline-brand">{item.brand} · {item.occasion}</span>
                  <strong>{item.name}</strong>
                  <span className={`wl-size-chip is-${rec.status}`}>
                    {rec.recommendedSize
                      ? `Recommended: ${rec.recommendedSize}${rec.runnerUpSize ? ` / ${rec.runnerUpSize}` : ''}`
                      : rec.status === 'no_chart'
                        ? 'Size chart unavailable'
                        : 'Profile incomplete'}
                  </span>
                </div>
                {onInspectSize && (
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    onClick={() => onInspectSize(item)}
                  >
                    Find My Size
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {run.proposals.length > 0 && (run.answer || run.done) && (
        <div className="drafts">
          <h3>Changes Weave drafted</h3>
          <p className="drafts-sub">
            {pending
              ? 'Nothing below has happened yet. Each one runs only if you approve it.'
              : 'Every draft has been decided.'}
          </p>
          {run.proposals.map((p) => (
            <DraftCard
              key={p.id}
              proposal={p}
              sourceMap={sourceMap}
              nFor={nFor}
              litN={litN}
              onLight={onLight}
              onOpenSource={onOpenSource}
              onApprove={onApprove}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </section>
  );
});
