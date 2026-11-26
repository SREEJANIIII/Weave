import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoSymbol } from '../Icons';
import { SplitWords } from '../SplitWords';
import { useMagneticProps } from '../../hooks/usePageSetup';

const SAY = {
  list_events: (a) => `Looking at your calendar${a.date ? ` for ${dayName(a.date)}` : ''}`,
  find_free_slots: () => 'Finding free time this evening',
  get_event: () => 'Opening an event',
  create_event: () => 'Drafting a calendar event for your OK',
  list_recent_notes: () => 'Reading your recent meeting notes',
  search_notes: (a) => `Searching your notes for “${a.query}”`,
  get_note: (_a, s) => (s.summary && s.summary !== 'done' ? `Opening “${s.summary}”` : 'Opening a note'),
  list_tasks: () => 'Checking your to-dos',
  get_task: () => 'Opening a to-do',
  create_task: () => 'Drafting a to-do for your OK',
  summarize_spending: () => 'Adding up your spending',
  list_transactions: () => 'Going through the purchases',
};

const SHORT = {
  'What should I follow up on today, and when can I fit in a workout?': 'Follow-ups and a workout today',
  'How much did I spend on food last week, and what was happening on those days?': 'Food spending last week',
};

const PLAIN = { Calendar: 'calendar', Notes: 'notes', Tasks: 'to-dos', Money: 'bank statement' };
const plain = (app) => PLAIN[app] ?? app.toLowerCase();

function dayName(iso) {
  const today = new Date();
  const d = new Date(`${iso}T00:00:00`);
  if (d.toDateString() === today.toDateString()) return 'today';
  return d.toLocaleDateString('en-GB', { weekday: 'long' });
}

function LiveDraft({ draft, onPulse }) {
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(null); // null | { text, ok }

  const args = draft.args ?? {};
  const prompt =
    draft.tool === 'create_event'
      ? `Add “${args.title}” to your calendar, ${args.start} to ${args.end}?`
      : `Add “${args.title}” to your to-dos${args.due ? `, due ${dayName(args.due)}` : ''}?`;

  const approve = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/proposals/${encodeURIComponent(draft.id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: {} }),
      });
      const j = await r.json();
      const st = j.proposal?.status;
      if (st === 'done') {
        setSettled({ text: `Added, and checked in your ${plain(draft.app)}.`, ok: true });
        onPulse(draft.server);
      } else if (st === 'unverified') {
        setSettled({ text: `Added, but Weave couldn't double-check it.`, ok: false });
      } else {
        setSettled({ text: j.error ?? `${draft.app} didn't accept it. Nothing changed.`, ok: false });
      }
    } catch {
      setSettled({ text: "Couldn't reach the Weave server. Nothing changed.", ok: false });
    }
    setBusy(false);
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      await fetch(`/api/proposals/${encodeURIComponent(draft.id)}/dismiss`, { method: 'POST' });
    } catch {
      // nothing to undo
    }
    setSettled({ text: 'Left out. Nothing changed.', ok: false });
    setBusy(false);
  };

  return (
    <div className={`live-draft${settled?.ok ? ' is-done' : ''}`}>
      <p>{prompt}</p>
      <div className="row">
        {settled ? (
          <span className={settled.ok ? 'ok' : 'from'}>{settled.text}</span>
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={approve}>
              Yes, add it
            </button>
            <button type="button" className="btn btn-link btn-sm" disabled={busy} onClick={dismiss}>
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export const LiveFinaleSection = forwardRef(function LiveFinaleSection(_, ref) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const markRef = useRef(null);
  const fieldApiRef = useRef({ pulse() {} });
  const magneticCta = useMagneticProps();

  const [suggestions, setSuggestions] = useState([]);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runState, setRunState] = useState(null); // { question, steps: [], answer, error }

  // Woven field cloth simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;

    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const YARNS = ['--yarn-calendar', '--yarn-notes', '--yarn-tasks-night', '--yarn-workout', '--yarn-email'].map((v) =>
      css.getPropertyValue(v).trim(),
    );
    const WEFT = css.getPropertyValue('--color-on-night').trim();
    const YARN_INDEX = { calendar: 0, notes: 1, tasks: 2, money: 3, workout: 3, email: 4, wishlist: 4 };
    const glow = new Float32Array(5);
    const pulses = [];
    let W = 0;
    let H = 0;
    let dpr = 1;
    let SP = 26;
    let cols = 0;
    let rows = 0;
    let dx = new Float32Array(0);
    let dy = dx;
    let vx = dx;
    let vy = dx;
    let px = -1e4;
    let py = -1e4;
    let lx = 0;
    let ly = 0;
    let pvx = 0;
    let pvy = 0;
    let inside = false;
    let visible = false;
    let raf = 0;
    let greeted = false;

    const X = (c) => (c - 1) * SP;
    const Y = (r) => (r - 1) * SP;

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1;
      ctx.strokeStyle = WEFT;
      ctx.globalAlpha = 0.09;
      for (let r = 0; r < rows; r++) {
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = X(c) + dx[i];
          const y = Y(r) + dy[i];
          if (c) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1.6;
      for (let c = 0; c < cols; c++) {
        const k = Math.floor(c / 6) % 5;
        ctx.strokeStyle = YARNS[k];
        ctx.globalAlpha = Math.min(0.95, 0.24 + glow[k] * 0.65);
        ctx.beginPath();
        for (let r = 0; r < rows; r++) {
          const i = r * cols + c;
          const x = X(c) + dx[i];
          const y = Y(r) + dy[i];
          if (r) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function resize() {
      const r = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      SP = W < 640 ? 34 : 26;
      cols = Math.ceil(W / SP) + 3;
      rows = Math.ceil(H / SP) + 3;
      const n = cols * rows;
      dx = new Float32Array(n);
      dy = new Float32Array(n);
      vx = new Float32Array(n);
      vy = new Float32Array(n);
      draw();
    }

    function step(now) {
      for (const p of pulses) p.r = (now - p.t0) * 0.55;
      while (pulses.length && pulses[0].r > Math.hypot(W, H) + 60) pulses.shift();
      const C = 0.24;
      const K = 0.014;
      const D = 0.93;
      const R = 130;
      const R2 = R * R;
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c;
          let ax = ((dx[i - 1] + dx[i + 1] + dx[i - cols] + dx[i + cols]) * 0.25 - dx[i]) * C - dx[i] * K;
          let ay = ((dy[i - 1] + dy[i + 1] + dy[i - cols] + dy[i + cols]) * 0.25 - dy[i]) * C - dy[i] * K;
          const x = X(c);
          const y = Y(r);
          if (inside) {
            const ex = x - px;
            const ey = y - py;
            const d2 = ex * ex + ey * ey;
            if (d2 < R2) {
              const f = 1 - Math.sqrt(d2) / R;
              ax += pvx * f * 0.05;
              ay += pvy * f * 0.05;
            }
          }
          for (const p of pulses) {
            const ex = x - p.x;
            const ey = y - p.y;
            const d = Math.hypot(ex, ey) || 1;
            const band = Math.abs(d - p.r);
            if (band < 34) {
              const s = (1 - band / 34) * p.s * Math.max(0, 1 - p.r / 1100);
              ax += (ex / d) * s;
              ay += (ey / d) * s;
            }
          }
          vx[i] = (vx[i] + ax) * D;
          vy[i] = (vy[i] + ay) * D;
        }
      }
      let energy = 0;
      for (let i = 0; i < dx.length; i++) {
        dx[i] += vx[i];
        dy[i] += vy[i];
        energy += Math.abs(vx[i]) + Math.abs(vy[i]);
      }
      for (let k = 0; k < 5; k++) glow[k] *= 0.965;
      pvx *= 0.75;
      pvy *= 0.75;
      draw();
      const active =
        energy > 0.4 ||
        pulses.length ||
        glow.some((g) => g > 0.02) ||
        (inside && Math.abs(pvx) + Math.abs(pvy) > 0.05);
      raf = visible && active ? requestAnimationFrame(step) : 0;
    }

    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(step);
    };
    const ripple = (x, y, s) => {
      pulses.push({ x, y, s, r: 0, t0: performance.now() });
      kick();
    };

    fieldApiRef.current = {
      pulse(yarn) {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches || !W) return;
        const k = YARN_INDEX[yarn] ?? 1;
        glow[k] = 1;
        let best = 0;
        let bestD = Infinity;
        for (let g = 0; g * 6 < cols; g++) {
          if (g % 5 === k) {
            const d = Math.abs(X(g * 6 + 3) - W * 0.55);
            if (d < bestD) {
              bestD = d;
              best = g;
            }
          }
        }
        ripple(X(best * 6 + 3), H * 0.45, 0.9);
      },
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      return () => ro.disconnect();
    }

    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (inside) {
        pvx = pvx * 0.5 + (x - lx) * 0.5;
        pvy = pvy * 0.5 + (y - ly) * 0.5;
      }
      lx = x;
      ly = y;
      px = x;
      py = y;
      inside = true;
      kick();
    };
    const onLeave = () => {
      inside = false;
      kick();
    };
    const onDown = (e) => {
      if (e.target.closest('a, button, input, label')) return;
      const r = host.getBoundingClientRect();
      ripple(e.clientX - r.left, e.clientY - r.top, 1.3);
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown);

    let io;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            visible = e.isIntersecting;
            if (visible && !greeted) {
              greeted = true;
              const m = markRef.current?.getBoundingClientRect();
              const r = host.getBoundingClientRect();
              ripple(m ? m.left + m.width / 2 - r.left : W * 0.2, m ? m.top + m.height / 2 - r.top : H * 0.5, 1.1);
            }
            if (visible) kick();
          });
        },
        { threshold: 0.1 },
      );
      io.observe(host);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Load status chips
  useEffect(() => {
    let cancelled = false;
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((status) => {
        if (!cancelled) {
          setSuggestions(status.suggestions ?? []);
          setStatusError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStatusError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = useCallback(async (q) => {
    if (busy) return;
    setBusy(true);
    setRunState({ question: q, steps: [], answer: null, error: null });
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev || !data) continue;
          const p = JSON.parse(data);
          if (ev === 'step') {
            if (p.kind === 'read' && p.status === 'done') fieldApiRef.current.pulse(p.server);
            setRunState((prev) => {
              if (!prev) return prev;
              const idx = prev.steps.findIndex((s) => s.id === p.id);
              const steps = idx >= 0 ? prev.steps.map((s, k) => (k === idx ? p : s)) : [...prev.steps, p];
              return { ...prev, steps };
            });
          } else if (ev === 'answer') {
            setRunState((prev) => (prev ? { ...prev, answer: p } : prev));
          } else if (ev === 'error') {
            setRunState((prev) => (prev ? { ...prev, error: p } : prev));
          }
        }
      }
    } catch {
      setRunState((prev) =>
        prev
          ? {
              ...prev,
              error: {
                message: "Couldn't reach the Weave server.",
                hint: 'Open the full app once the server is running.',
              },
            }
          : prev,
      );
    }
    setBusy(false);
  }, [busy]);

  const forArea = useCallback(
    (area) =>
      suggestions.find((q) => (area === 'money' ? /spen[dt]|food/i : /follow|workout/i).test(q) && ['work', 'week', 'money'].includes(area)),
    [suggestions],
  );

  useImperativeHandle(
    ref,
    () => ({
      canAsk: (area) => Boolean(forArea(area)),
      askArea: (area) => {
        const q = forArea(area);
        if (!q) return;
        hostRef.current?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
        ask(q);
      },
    }),
    [ask, forArea],
  );

  const sourceAppMap = new Map((runState?.answer?.sources ?? []).map((s) => [s.source_id, s.app]));

  return (
    <section ref={hostRef} className="closing night" id="start" aria-labelledby="closing-title">
      <canvas ref={canvasRef} className="field" aria-hidden="true" />
      <div className="container closing-grid">
        <svg ref={markRef} className="closing-mark logo-symbol" viewBox="0 0 256 256" aria-hidden="true">
          <use href="#logo-symbol" />
        </svg>
        <div className="closing-copy">
          <SplitWords as="h2" className="closing-title" id="closing-title" text="Ask your first question." />
          <p className="section-lede">Ask it right here. Each app Weave reads lights up the&nbsp;cloth.</p>
          <div className="live-chips">
            {statusError ? (
              <p className="live-note">The live demo needs the Weave server running. Open the full app once it is up.</p>
            ) : (
              suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy}
                  aria-label={`Ask: ${q}`}
                  onClick={() => ask(q)}
                >
                  {SHORT[q] ?? q}
                </button>
              ))
            )}
          </div>
          <div className="live-out" aria-live="polite" aria-busy={String(busy)}>
            {runState && (
              <>
                <p className="live-q">{runState.question}</p>
                <ol className="live-steps">
                  {runState.steps.map((p) => {
                    const say = (SAY[p.tool] ?? (() => `Using ${p.app}`))(p.args ?? {}, p);
                    const opened = /^get_/.test(p.tool);
                    let right;
                    if (p.kind === 'write') {
                      right = <span className="held">waits for you</span>;
                    } else if (p.status === 'done') {
                      right = <span className="done">{opened ? '' : p.summary ?? ''}</span>;
                    } else if (p.status === 'error') {
                      right = <span className="done">could not read</span>;
                    } else {
                      right = <span className="done">reading</span>;
                    }
                    return (
                      <li key={p.id} data-yarn={p.server}>
                        <span>{say}</span>
                        {right}
                      </li>
                    );
                  })}
                </ol>
                {runState.answer && (
                  <div className="live-answer">
                    <h3>{runState.answer.headline}</h3>
                    <ul>
                      {runState.answer.sections.flatMap((sec) =>
                        sec.items.map((it, idx) => {
                          const from = [...new Set(it.sourceIds.map((id) => sourceAppMap.get(id)).filter(Boolean))];
                          return (
                            <li key={`${sec.title}-${idx}`}>
                              {it.text}
                              {from.length ? <span className="from">{`From your ${from.map(plain).join(' and ')}`}</span> : null}
                            </li>
                          );
                        }),
                      )}
                    </ul>
                    {(runState.answer.caveats ?? []).map((c, i) => (
                      <p key={i} className="from">{c}</p>
                    ))}
                    {(runState.answer.proposals ?? []).map((d) => (
                      <LiveDraft key={d.id} draft={d} onPulse={(s) => fieldApiRef.current.pulse(s)} />
                    ))}
                  </div>
                )}
                {runState.error && (
                  <p className="live-error">
                    {`${runState.error.message} ${runState.error.hint ?? ''}`.trim()}
                  </p>
                )}
              </>
            )}
          </div>
          <Link className="btn btn-primary" to="/app" {...magneticCta}>
            Open the full app
          </Link>
        </div>
      </div>
    </section>
  );
});

