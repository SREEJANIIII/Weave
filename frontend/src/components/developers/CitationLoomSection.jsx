import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, LogoSymbol } from '../Icons';
import { cubic, fmt, split } from '../../lib/svgGeom';

const SOURCES = [
  { src: '1', thread: 'notes', icon: 'i-notes', app: 'Notes', title: 'Team sync', detail: 'Send the revised budget, by today' },
  { src: '2', thread: 'tasks', icon: 'i-tasks', app: 'Tasks', title: 'Work list', detail: 'Venue due today. No budget task.' },
  { src: '3', thread: 'calendar', icon: 'i-calendar', app: 'Calendar', title: 'Today', detail: 'Focus block until 18:00, dinner at 19:30' },
  { src: '4', thread: 'workout', icon: 'i-fitness', app: 'Notes', title: 'Workout plan', detail: '45 minute runs, after 18:00' },
  { src: '5', thread: 'email', icon: 'i-mail', app: 'Email', title: 'Priya, Northwind', detail: 'Asked for a call recap' },
];

const POINTS = [
  {
    text: 'Send the revised budget. It isn\u2019t on your task list\u00a0yet.',
    cites: [
      { n: '1', label: 'Source 1, Team sync note' },
      { n: '2', label: 'Source 2, Work list' },
    ],
  },
  {
    text: 'Confirm Friday\u2019s venue booking, due\u00a0today.',
    cites: [{ n: '2', label: 'Source 2, Work list' }],
  },
  {
    text: 'Send Priya the call\u00a0recap.',
    cites: [{ n: '5', label: 'Source 5, email from Priya' }],
  },
  {
    text: 'Run from 18:15 to 19:00, before\u00a0dinner.',
    cites: [
      { n: '3', label: 'Source 3, today\u2019s calendar' },
      { n: '4', label: 'Source 4, workout plan' },
    ],
  },
];

export function CitationLoomSection() {
  const loomRef = useRef(null);
  const replyRef = useRef(null);
  const sourceRefs = useRef({});
  const pointRefs = useRef([]);

  const [activeSrc, setActiveSrc] = useState(null);
  const [inView, setInView] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [threads, setThreads] = useState({ w: 0, h: 0, under: [], over: [] });

  const draw = useCallback(() => {
    const loomEl = loomRef.current;
    const reply = replyRef.current;
    if (!loomEl || !reply) return;
    if (matchMedia('(max-width: 60rem)').matches) {
      setThreads({ w: 0, h: 0, under: [], over: [] });
      return;
    }

    const base = loomEl.getBoundingClientRect();
    const rel = (r) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    const rb = rel(reply.getBoundingClientRect());

    const under = [];
    const over = [];
    let n = 0;

    POINTS.forEach((pt, idx) => {
      const li = pointRefs.current[idx];
      if (!li) return;
      const lb = rel(li.getBoundingClientRect());
      pt.cites.forEach((cite, j) => {
        const srcEl = sourceRefs.current[cite.n];
        if (!srcEl) return;
        const sb = rel(srcEl.getBoundingClientRect());
        const S = { x: sb.x + sb.w - 10, y: sb.y + sb.h / 2 };
        const E = { x: rb.x + 12, y: lb.y + lb.h / 2 + (j - (pt.cites.length - 1) / 2) * 10 };
        const dx = E.x - S.x;
        const halves = split(S, { x: S.x + dx * 0.5, y: S.y }, { x: E.x - dx * 0.5, y: E.y }, E);
        const thread = SOURCES.find((s) => s.src === cite.n)?.thread ?? 'notes';

        halves.forEach((h, half) => {
          const item = { key: `${n}-${half}`, d: cubic(...h), src: cite.n, thread, i: n };
          if ((Number(cite.n) + half) % 2) over.push(item);
          else under.push(item);
        });
        n++;
      });
    });

    setThreads({ w: fmt(base.width), h: fmt(base.height), under, over });
  }, []);

  useEffect(() => {
    const loomEl = loomRef.current;
    if (!loomEl) return undefined;

    const narrow = matchMedia('(max-width: 60rem)');
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(loomEl);
    narrow.addEventListener('change', draw);
    document.fonts?.ready.then(draw);

    let io;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setInView(true);
              io.disconnect();
              break;
            }
          }
        },
        { threshold: 0.3 },
      );
      io.observe(loomEl);
    }

    return () => {
      ro.disconnect();
      narrow.removeEventListener('change', draw);
      io?.disconnect();
    };
  }, [draw]);

  const jumpToSource = (e, src) => {
    e.preventDefault();
    const card = sourceRefs.current[src];
    if (!card) return;
    card.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    card.focus({ preventScroll: true });
    setActiveSrc(src);
  };

  const renderPaths = (list) =>
    list.map((p) => (
      <React.Fragment key={p.key}>
        <path className="lm-gap" d={p.d} pathLength="1" data-src={p.src} style={{ '--i': p.i }} />
        <path className={`lm-line lm-${p.thread}`} d={p.d} pathLength="1" data-src={p.src} style={{ '--i': p.i }} />
      </React.Fragment>
    ));

  return (
    <section className="example" id="example" aria-labelledby="example-title">
      <div className="container">
        <h2 id="example-title" className="example-q">&ldquo;What should I follow up on today, and when can I fit in a&nbsp;workout?&rdquo;</h2>

        <div
          ref={loomRef}
          className={`loom${inView ? ' is-in' : ''}`}
          data-loom=""
          data-active={activeSrc || undefined}
        >
          <svg
            className="loom-threads"
            viewBox={threads.w ? `0 0 ${threads.w} ${threads.h}` : undefined}
            width={threads.w || undefined}
            height={threads.h || undefined}
            aria-hidden="true"
          >
            <g>{renderPaths(threads.under)}</g>
            <g>{renderPaths(threads.over)}</g>
          </svg>

          <ol className="sources" aria-label="Records Weave read">
            {SOURCES.map((s) => (
              <li
                key={s.src}
                ref={(el) => { sourceRefs.current[s.src] = el; }}
                className={`source${activeSrc === s.src ? ' is-lit' : ''}`}
                id={`src-${s.src}`}
                tabIndex={-1}
                data-src={s.src}
                data-thread={s.thread}
                onPointerEnter={() => setActiveSrc(s.src)}
                onPointerLeave={() => setActiveSrc(null)}
                onFocus={() => setActiveSrc(s.src)}
                onBlur={() => setActiveSrc(null)}
              >
                <span className="source-app">
                  <Icon name={s.icon} />
                  {s.app}
                </span>
                <span className="source-title">{s.title}</span>
                <span className="source-detail">{s.detail}</span>
              </li>
            ))}
          </ol>

          <article ref={replyRef} className="reply" aria-labelledby="reply-head">
            <p className="reply-from">
              <LogoSymbol small />
              Weave&rsquo;s answer
            </p>
            <h3 className="reply-head" id="reply-head">Three follow-ups, and a run at&nbsp;18:15.</h3>
            <ul className="reply-points">
              {POINTS.map((pt, idx) => (
                <li key={idx} ref={(el) => { pointRefs.current[idx] = el; }}>
                  <span>{pt.text}</span>
                  <span className="cites">
                    {pt.cites.map((c) => (
                      <a
                        key={c.n}
                        className={`cite${activeSrc === c.n ? ' is-lit' : ''}`}
                        href={`#src-${c.n}`}
                        data-cite={c.n}
                        aria-label={c.label}
                        onPointerEnter={() => setActiveSrc(c.n)}
                        onPointerLeave={() => setActiveSrc(null)}
                        onFocus={() => setActiveSrc(c.n)}
                        onBlur={() => setActiveSrc(null)}
                        onClick={(e) => jumpToSource(e, c.n)}
                      >
                        {c.n}
                      </a>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p className="caption">Sample data. Point at a number to follow its&nbsp;thread.</p>
      </div>
    </section>
  );
}

