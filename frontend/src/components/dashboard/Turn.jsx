import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, LogoSymbol } from '../Icons';
import { EDITABLE, describeRecord, fmtArgs } from '../../lib/formatters';
import { joinNames, serviceName, stepText } from '../../lib/services';
import { fmtDate, imageFor, summarize } from '../../lib/savedPapers';
import { followUpsFor, STARTERS } from '../../lib/followUps';

const to12 = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};
const timeRange = (a, b) => (a && b ? `${to12(a)}–${to12(b)}` : to12(a));

function describe(record) {
  if (record.kind === 'document') return { title: record.title, meta: record.meta, snippet: record.snippet };
  return describeRecord(record);
}

function Cite({ n, source, lit, onLight, onOpen }) {
  if (!source) return null;
  return (
    <button
      type="button"
      className={`cite${lit ? ' is-lit' : ''}`}
      data-yarn={source.server}
      aria-label={`Source ${n}: ${describe(source.record).title}, from ${serviceName(source.server, source.app)}`}
      onClick={() => onOpen(n)}
      onMouseEnter={() => onLight(n)}
      onMouseLeave={() => onLight(null)}
      onFocus={() => onLight(n)}
      onBlur={() => onLight(null)}
    >
      {n}
    </button>
  );
}

function Draft({ proposal: p, dismissing, onApprove, onDismiss, onUndoDismiss }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({});
  const firstRef = useRef(null);
  const args = p.args ?? {};
  const where = serviceName(p.server, p.app);
  const title = args.title ?? args.product_name ?? p.toolTitle;
  const isAdd = p.tool === 'create_event' || p.tool === 'create_task';
  const question = isAdd ? `Add this to your ${where}?` : `${p.toolTitle}?`;
  const when =
    p.tool === 'create_event'
      ? `${fmtDate(args.date)}, ${timeRange(args.start, args.end)}`
      : p.tool === 'create_task'
        ? args.due
          ? `Due ${fmtDate(args.due)}`
          : 'No due date'
        : '';
  const fields = EDITABLE[p.tool] ?? [];

  const startEdit = () => {
    setValues(Object.fromEntries(fields.map(([key]) => [key, args[key] ?? ''])));
    setEditing(true);
    requestAnimationFrame(() => firstRef.current?.focus());
  };

  let body;
  if (dismissing) {
    body = (
      <p className="draft-result is-muted" role="status">
        <span>Okay, I won’t {isAdd ? 'add it' : 'do that'}.</span>
        <button type="button" className="link-btn" onClick={() => onUndoDismiss(p)}>
          Undo
        </button>
      </p>
    );
  } else if (editing && p.status === 'pending') {
    body = (
      <form
        className="draft-edit"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          onApprove(p, values);
        }}
      >
        {fields.map(([key, type, label], i) => (
          <label key={key} className={`d-field${key === 'title' ? ' is-wide' : ''}`}>
            <span>{label}</span>
            <input
              ref={i === 0 ? firstRef : undefined}
              type={type}
              value={values[key] ?? ''}
              required={key === 'title'}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </label>
        ))}
        <div className="draft-actions is-wide">
          <button className="d-btn is-ink" type="submit">
            <Icon name="i-check" />
            {isAdd ? 'Add it with these changes' : 'Do it with these changes'}
          </button>
          <button className="d-btn is-plain" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  } else if (p.status === 'pending') {
    body = (
      <div className="draft-actions">
        <button className="d-btn is-ink" type="button" onClick={() => onApprove(p)}>
          <Icon name="i-check" />
          {isAdd ? 'Yes, add it' : 'Yes, do it'}
        </button>
        {fields.length > 0 && (
          <button className="d-btn is-line" type="button" onClick={startEdit}>
            <Icon name="i-pencil" />
            Change details
          </button>
        )}
        <button className="d-btn is-plain" type="button" onClick={() => onDismiss(p)}>
          No thanks
        </button>
      </div>
    );
  } else if (p.status === 'running') {
    body = (
      <p className="draft-result is-muted" role="status">
        <span className="spin" aria-hidden="true" />
        <span>Adding it to your {where}, then checking it’s there…</span>
      </p>
    );
  } else if (p.status === 'done') {
    const clash = (p.conflicts ?? []).map((c) => `“${c.title}” (${timeRange(c.start, c.end)})`);
    body = (
      <p className="draft-result is-ok" role="status">
        <Icon name="i-check" />
        <span>
          Added to your {where}. I checked, and it’s there.
          {clash.length ? ` Heads up: it overlaps ${joinNames(clash)}.` : ''}
        </span>
      </p>
    );
  } else if (p.status === 'unverified') {
    body = (
      <p className="draft-result is-warn" role="status">
        <Icon name="i-alert" />
        <span>Your {where} accepted it, but I couldn’t confirm it’s there. Check your {where} before relying on it.</span>
      </p>
    );
  } else if (p.status === 'failed') {
    body = (
      <p className="draft-result is-bad" role="alert">
        <Icon name="i-alert" />
        <span>
          Your {where} didn’t accept it{p.error ? `: ${p.error}` : '.'} Nothing was changed.
        </span>
      </p>
    );
  } else if (p.status === 'expired') {
    body = (
      <p className="draft-result is-muted" role="status">
        <span>This suggestion has expired, so nothing was changed. Ask again to get a fresh one.</span>
      </p>
    );
  } else if (p.status === 'dismissed') {
    body = (
      <p className="draft-result is-muted" role="status">
        <span>Not added. Nothing was changed.</span>
      </p>
    );
  }

  return (
    <div className={`draft is-${dismissing ? 'dismissing' : p.status}`} data-yarn={p.server}>
      <p className="draft-q">
        <span className="yarn-dot" data-yarn={p.server} aria-hidden="true" />
        {p.status === 'pending' && !dismissing ? question : where}
      </p>
      <p className="draft-title">{title}</p>
      {when ? <p className="draft-when">{when}</p> : null}
      {p.why ? <p className="draft-why">{p.why}</p> : null}
      {body}
    </div>
  );
}

export function Turn({
  turn,
  services,
  saved,
  techDetails,
  dismissing,
  onApprove,
  onDismiss,
  onUndoDismiss,
  onAsk,
  onRetry,
  onOpenSaved,
  onOpenConnections,
  onAddFile,
  onOpenWishlist,
  onTyped,
}) {
  const [lit, setLit] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const sourcesRef = useRef(null);
  const answer = turn.answer;

  const sourceMap = useMemo(() => new Map((answer?.sources ?? []).filter((s) => s.n).map((s) => [s.n, s])), [answer]);
  const nFor = useMemo(() => {
    const m = new Map((answer?.sources ?? []).filter((s) => s.n).map((s) => [s.source_id, s.n]));
    return (id) => m.get(id) ?? null;
  }, [answer]);

  const cited = (answer?.sources ?? []).filter((s) => s.n);
  const usedServers = [...new Set(cited.map((s) => s.server))];
  const usedNames = usedServers.map((id) => (id === 'saved' ? 'saved papers' : serviceName(id)));
  const savedItems = (turn.savedItems ?? []).map((id) => saved.find((it) => it.id === id)).filter(Boolean);
  const noInfo = answer && !answer.sources?.length && !turn.proposals.length && !turn.highlightedProducts?.length && !savedItems.length;
  const unanswered = Boolean(answer) && (turn.unanswered || noInfo);
  const missing = services.filter((s) => s.state !== 'connected' && answer && `${answer.headline} ${answer.caveats.join(' ')}`.toLowerCase().includes(s.name.toLowerCase()));
  const tryInstead = answer?.sections.flatMap((s) => s.items).filter((it) => !it.sourceIds.length).map((it) => it.text);

  // Letter-by-letter reveal of a fresh answer: headline, then each section and point in order.
  const { parts, partIndex } = useMemo(() => {
    const list = [];
    const index = { sections: [] };
    if (!answer) return { parts: list, partIndex: index };
    index.head = list.push(answer.headline || 'Here’s what I found.') - 1;
    for (const sec of answer.sections) {
      const entry = { title: list.push(sec.title) - 1, items: [] };
      for (const it of sec.items) entry.items.push({ text: list.push(it.text) - 1, detail: list.push(it.detail || '') - 1 });
      index.sections.push(entry);
    }
    return { parts: list, partIndex: index };
  }, [answer]);
  const offsets = useMemo(() => {
    let at = 0;
    return parts.map((p) => {
      const start = at;
      at += p.length;
      return start;
    });
  }, [parts]);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(() => (turn.fresh && !reduce ? 0 : Infinity));
  const typing = Boolean(answer) && shown < total;

  useEffect(() => {
    if (!answer) return undefined;
    if (shown >= total) {
      if (turn.fresh) onTyped?.(turn.seq);
      return undefined;
    }
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const step = Math.max(1, Math.round(((now - last) / 16) * 2.4));
      last = now;
      setShown((s) => Math.min(total, s + step));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, total, shown >= total]);

  const started = (i) => shown > offsets[i] || (shown >= offsets[i] && parts[i].length === 0 && shown > 0);
  const vis = (i) => (shown === Infinity ? parts[i] : parts[i].slice(0, Math.max(0, shown - offsets[i])));
  const caretAt = typing ? parts.findIndex((p, i) => shown >= offsets[i] && shown < offsets[i] + p.length) : -1;
  const caret = (i) => (caretAt === i ? <span className="caret" aria-hidden="true" /> : null);

  const openSource = (n) => {
    setShowSources(true);
    setLit(n);
    requestAnimationFrame(() => sourcesRef.current?.querySelector(`[data-n="${n}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  const paperCards = savedItems.length > 0 && (
                <div className={`paper-cards${savedItems.length === 1 ? ' is-single' : ''}`}>
                  {savedItems.map((it) => {
                    const img = imageFor(it);
                    return (
                      <button key={it.id} type="button" className="paper-card" onClick={() => onOpenSaved(it.id)}>
                        {img ? <img src={img} alt={`Photo of your ${it.title.toLowerCase()}`} /> : <span className="paper-ph"><Icon name="i-file" /></span>}
                        <span className="paper-text">
                          <strong>{it.title}</strong>
                          <span>{summarize(it)}</span>
                          <span className="paper-open">
                            Open in Saved <Icon name="i-chevron-right" />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );

  const last = turn.steps.at(-1);
  const checked = [...new Set(turn.steps.filter((s) => s.kind === 'read').map((s) => s.server))];

  return (
    <article className="turn" aria-busy={!turn.done}>
      <p className="turn-q">
        <span className="visually-hidden">You asked: </span>
        {turn.question}
      </p>

      <div className="turn-a">
        <span className="turn-mark" aria-hidden="true">
          <LogoSymbol small className="turn-logo" />
        </span>

        <div className="turn-body">
          {!turn.done && !answer && (
            <div className="working" role="status">
              <p className="working-line">
                <span className="working-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {stepText(last)}
              </p>
              {checked.length > 0 && (
                <p className="working-trail">
                  Checked{' '}
                  {checked.map((id) => (
                    <span key={id} className="chip-service">
                      <span className="yarn-dot" data-yarn={id} aria-hidden="true" />
                      {serviceName(id)}
                    </span>
                  ))}
                </p>
              )}
              <div className="d-skel" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {turn.error && !answer && (
            <div className="problem" role="alert">
              <h2 className="a-head">I couldn’t finish that.</h2>
              <p>{turn.error.message}</p>
              {turn.error.hint ? <p className="muted">{turn.error.hint}</p> : null}
              <div className="row-actions">
                <button className="d-btn is-ink" type="button" onClick={() => onRetry(turn.question)}>
                  <Icon name="i-replay" />
                  Try again
                </button>
                <button className="d-btn is-line" type="button" onClick={() => onOpenConnections()}>
                  Check connections
                </button>
              </div>
            </div>
          )}

          {unanswered && (
            <div className="cant">
              <h2 className="a-head">{answer.headline}</h2>
              {answer.caveats.map((c, i) => (
                <p key={i} className="cant-why">
                  {c}
                </p>
              ))}
              {!answer.caveats.length && (
                <p className="cant-why">I didn’t find anything about this in your saved papers or the services you’ve connected.</p>
              )}
              <p className="cant-next">What you can do:</p>
              <div className="row-actions">
                {missing.map((s) => (
                  <button key={s.id} className="d-btn is-ink" type="button" onClick={() => onOpenConnections(s.id)}>
                    <Icon name={s.icon} />
                    Connect {s.name}
                  </button>
                ))}
                <button className="d-btn is-line" type="button" onClick={onAddFile}>
                  <Icon name="i-camera" />
                  Add a photo or file
                </button>
                {!missing.length && (
                  <button className="d-btn is-line" type="button" onClick={() => onOpenConnections()}>
                    <Icon name="i-link" />
                    See connections
                  </button>
                )}
              </div>
              <div className="next-asks">
                <span>Or ask something I can answer:</span>
                {(tryInstead?.length ? tryInstead : STARTERS).slice(0, 4).map((q) => (
                  <button key={q} type="button" className="ask-chip" onClick={() => onAsk(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {answer && !unanswered && (
            <div className={`answer${typing ? ' is-typing' : ''}`}>
              <h2 className="a-head">
                {typing ? (
                  <>
                    <span className="visually-hidden">{parts[partIndex.head]}</span>
                    <span aria-hidden="true">
                      {vis(partIndex.head)}
                      {caret(partIndex.head)}
                    </span>
                  </>
                ) : (
                  parts[partIndex.head]
                )}
              </h2>

              {turn.showFirst && paperCards}

              {answer.sections.map((sec, si) => {
                const pi = partIndex.sections[si];
                if (!started(pi.title)) return null;
                return (
                <section key={sec.title} className="a-section">
                  <h3>
                    {vis(pi.title)}
                    {caret(pi.title)}
                  </h3>
                  <ul>
                    {sec.items.map((it, i) => {
                      if (!started(pi.items[i].text)) return null;
                      const firstN = it.sourceIds.map(nFor).find(Boolean);
                      const yarn = firstN ? sourceMap.get(firstN)?.server : undefined;
                      return (
                        <li key={i} className={it.sourceIds.some((id) => nFor(id) === lit) ? 'is-lit' : ''}>
                          <span className="yarn-dot" data-yarn={yarn ?? 'none'} aria-hidden="true" />
                          <span className="a-text">
                            {vis(pi.items[i].text)}
                            {caret(pi.items[i].text)}
                            {it.detail && started(pi.items[i].detail) ? (
                              <span className="a-detail">
                                {vis(pi.items[i].detail)}
                                {caret(pi.items[i].detail)}
                              </span>
                            ) : null}
                          </span>
                          <span className="cites">
                            {it.sourceIds.map((id) => {
                              const n = nFor(id);
                              return n ? (
                                <Cite key={id} n={n} source={sourceMap.get(n)} lit={lit === n} onLight={setLit} onOpen={openSource} />
                              ) : null;
                            })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                );
              })}

              {!typing && (
              <div className="a-rest">
              {!turn.showFirst && paperCards}

              {turn.highlightedProducts?.length > 0 && (
                <div className="products">
                  {turn.highlightedProducts.map(({ item, rec }) => (
                    <div key={item.id} className="product">
                      <img src={item.image} alt="" />
                      <span>
                        <strong>{item.name}</strong>
                        <span className="muted">
                          {item.brand} · {item.occasion}
                        </span>
                      </span>
                      <span className={`size-chip is-${rec.status}`}>
                        {rec.recommendedSize ? `Size ${rec.recommendedSize}${rec.runnerUpSize ? ` or ${rec.runnerUpSize}` : ''}` : rec.status === 'no_chart' ? 'No size chart' : 'Needs measurements'}
                      </span>
                    </div>
                  ))}
                  <button className="d-btn is-line" type="button" onClick={onOpenWishlist}>
                    Open Wishlist
                  </button>
                </div>
              )}

              {turn.proposals.length > 0 && (
                <div className="drafts">
                  {turn.proposals.map((p) => (
                    <Draft
                      key={p.id}
                      proposal={p}
                      dismissing={dismissing.has(p.id)}
                      onApprove={onApprove}
                      onDismiss={onDismiss}
                      onUndoDismiss={onUndoDismiss}
                    />
                  ))}
                  <p className="drafts-note">Nothing here happens until you say yes.</p>
                </div>
              )}

              {answer.caveats.length > 0 && (
                <div className="good-to-know">
                  {answer.caveats.map((c, i) => (
                    <p key={i}>
                      <Icon name="i-info" />
                      <span>{c}</span>
                    </p>
                  ))}
                </div>
              )}

              <footer className="a-foot">
                {usedNames.length ? (
                  <p className="a-from">
                    <span className="a-from-label">From your</span>
                    {usedServers.map((id) => (
                      <span key={id} className="chip-service">
                        <span className="yarn-dot" data-yarn={id} aria-hidden="true" />
                        {id === 'saved' ? 'saved papers (this device)' : serviceName(id)}
                      </span>
                    ))}
                  </p>
                ) : null}
                {cited.length > 0 && (
                  <button type="button" className="link-btn" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
                    {showSources ? 'Hide where this came from' : 'Where this came from'}
                    <Icon name="i-chevron-down" className={`icon chev${showSources ? ' is-open' : ''}`} />
                  </button>
                )}
              </footer>

              {showSources && (
                <ol className="sources" ref={sourcesRef}>
                  {cited.map((s) => {
                    const r = describe(s.record);
                    return (
                      <li key={s.source_id} data-n={s.n} className={lit === s.n ? 'is-lit' : ''}>
                        <span className="source-n">{s.n}</span>
                        <span className="source-text">
                          <strong>{r.title}</strong>
                          {r.meta ? <span>{r.meta}</span> : null}
                          {r.snippet ? <span className="muted">{r.snippet}</span> : null}
                        </span>
                        <span className="chip-service">
                          <span className="yarn-dot" data-yarn={s.server} aria-hidden="true" />
                          {s.server === 'saved' ? 'Saved' : serviceName(s.server, s.app)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {turn.done && (
                <div className="next-asks">
                  <span>You could also ask</span>
                  {followUpsFor(turn.question).map((q) => (
                    <button key={q} type="button" className="ask-chip" onClick={() => onAsk(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              </div>
              )}
            </div>
          )}

          {techDetails && turn.steps.length > 0 && (
            <details className="tech">
              <summary>Technical details: {turn.steps.length} MCP calls</summary>
              <ol>
                {turn.steps.map((s) => (
                  <li key={s.id}>
                    <code>
                      {s.server}.{s.tool}
                    </code>{' '}
                    <span className="muted">{fmtArgs(s.args)}</span>{' '}
                    <span>
                      {s.kind === 'write' ? 'held for approval' : s.status === 'error' ? 'failed' : `${s.summary ?? s.status}${s.ms !== undefined ? `, ${s.ms} ms` : ''}`}
                    </span>
                  </li>
                ))}
              </ol>
              {answer?.stats ? (
                <p className="muted">
                  Planner: {answer.stats.mode === 'nvidia' ? `NVIDIA (${answer.stats.model})` : answer.stats.mode === 'offline' ? 'offline script' : answer.stats.mode}
                  {answer.stats.ms ? ` · ${answer.stats.ms} ms` : ''}
                </p>
              ) : null}
            </details>
          )}
        </div>
      </div>
    </article>
  );
}
