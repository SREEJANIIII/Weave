import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icons';
import { cubic, fmt } from '../../lib/svgGeom';

const APPS = [
  { yarn: 'calendar', icon: 'i-calendar', name: 'Calendar', text: 'Focus block until 18:00' },
  { yarn: 'notes', icon: 'i-notes', name: 'Notes', text: 'Send the revised budget' },
  { yarn: 'tasks', icon: 'i-tasks', name: 'Tasks', text: 'Venue booking, due today' },
  { yarn: 'workout', icon: 'i-fitness', name: 'Workout', text: '45 minute run after 18:00' },
  { yarn: 'email', icon: 'i-mail', name: 'Email', text: 'Priya: recap when you can?' },
];

const COLS = 30;
const ROWS = 12;
const PER = COLS / APPS.length;
const POINT = [0, 1, 2, 3, 2, 1];
const isUp = (c, r) => (POINT[c % 6] + POINT[r % 6]) % 4 < 2;

export function DrawdownHero() {
  const figRef = useRef(null);
  const warpRef = useRef(null);
  const clothRef = useRef(null);
  const appRefs = useRef([]);

  const [pressedYarn, setPressedYarn] = useState(null);
  const [hoverYarn, setHoverYarn] = useState(null);
  const [weaving, setWeaving] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [reduceMotion, setReduceMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [warpLayout, setWarpLayout] = useState({ w: 0, h: 0, paths: [] });

  const focusYarn = hoverYarn ?? pressedYarn;

  const clothRows = useMemo(() => {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const cells = [];
      for (let c = 0; c < COLS; c++) {
        const yarn = APPS[Math.floor(c / PER)].yarn;
        const up = isUp(c, r);
        cells.push({
          key: `${r}-${c}`,
          x: c * 10 + 0.5,
          y: r * 10 + 0.5,
          up,
          yarn,
        });
      }
      rows.push({ r, cells });
    }
    return rows;
  }, []);

  const threadWarp = useCallback(() => {
    const warp = warpRef.current;
    const cloth = clothRef.current;
    if (!warp || !cloth) return;
    const wr = warp.getBoundingClientRect();
    const cr = cloth.getBoundingClientRect();
    if (!wr.width) return;

    const colW = cr.width / COLS;
    const paths = [];
    APPS.forEach((app, i) => {
      const btn = appRefs.current[i];
      if (!btn) return;
      const ar = btn.getBoundingClientRect();
      for (let k = 0; k < PER; k++) {
        const S = { x: ar.left - wr.left + ar.width * (0.3 + (0.4 * k) / (PER - 1)), y: -2 };
        const E = { x: cr.left - wr.left + (i * PER + k + 0.5) * colW, y: wr.height + 2 };
        paths.push({
          key: `${app.yarn}-${k}`,
          d: cubic(S, { x: S.x, y: wr.height * 0.55 }, { x: E.x, y: wr.height * 0.45 }, E),
          yarn: app.yarn,
          i: i * PER + k,
        });
      }
    });
    setWarpLayout({ w: fmt(wr.width), h: fmt(wr.height), paths });
  }, []);

  useEffect(() => {
    const fig = figRef.current;
    if (!fig) return undefined;

    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', onMq);

    threadWarp();
    const ro = new ResizeObserver(threadWarp);
    ro.observe(fig);
    document.fonts?.ready.then(threadWarp);

    return () => {
      mq.removeEventListener('change', onMq);
      ro.disconnect();
    };
  }, [threadWarp]);

  const replayWeave = () => {
    setWeaving(false);
    requestAnimationFrame(() => {
      void figRef.current?.offsetWidth;
      setWeaving(true);
    });
  };

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="container hero-inner">
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-title">Every loose thread, pulled into one answer.</h1>
          <p className="hero-lede">Weave reads the apps you connect, shows sources, and asks before&nbsp;acting.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/app">Try the prototype</Link>
          </div>
        </div>

        <figure
          ref={figRef}
          className={`drawdown${weaving ? ' is-weaving' : ''}`}
          data-focus={focusYarn || undefined}
          aria-labelledby="stage-cap"
        >
          <ol className="heddles" aria-label="Apps Weave reads. Choose one to follow its thread.">
            {APPS.map((a, i) => {
              const pressed = pressedYarn === a.yarn;
              return (
                <li key={a.yarn}>
                  <button
                    ref={(el) => { appRefs.current[i] = el; }}
                    className="app"
                    type="button"
                    data-yarn={a.yarn}
                    aria-pressed={String(pressed)}
                    onPointerEnter={() => setHoverYarn(a.yarn)}
                    onPointerLeave={() => setHoverYarn(null)}
                    onFocus={() => setHoverYarn(a.yarn)}
                    onBlur={() => setHoverYarn(null)}
                    onClick={() => setPressedYarn((prev) => (prev === a.yarn ? null : a.yarn))}
                  >
                    <span className="app-name">
                      <Icon name={a.icon} />
                      {a.name}
                    </span>
                    <span className="app-text">{a.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <svg
            ref={warpRef}
            className="warp"
            viewBox={warpLayout.w ? `0 0 ${warpLayout.w} ${warpLayout.h}` : undefined}
            width={warpLayout.w || undefined}
            height={warpLayout.h || undefined}
            aria-hidden="true"
          >
            {warpLayout.paths.map((p) => (
              <path
                key={p.key}
                d={p.d}
                pathLength="1"
                className={`y-${p.yarn}`}
                data-yarn={p.yarn}
                style={{ '--i': p.i }}
              />
            ))}
          </svg>

          <svg ref={clothRef} className="cloth" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
            {clothRows.map((row) => (
              <g key={row.r} className="pick" style={{ '--r': row.r }}>
                {row.cells.map((cell) => (
                  <rect
                    key={cell.key}
                    x={cell.x}
                    y={cell.y}
                    width={9}
                    height={9}
                    rx={1.2}
                    className={cell.up ? `up y-${cell.yarn}` : 'dn'}
                    data-yarn={cell.up ? cell.yarn : undefined}
                  />
                ))}
              </g>
            ))}
          </svg>

          <div className="answer">
            <p className="answer-q">What should I follow up on today, and when can I fit in a workout?</p>
            <p className="answer-a">Send the revised budget and confirm Friday&rsquo;s venue. A 45&nbsp;minute run fits at&nbsp;18:15.</p>
            <ul className="answer-sources" aria-label="Sources">
              <li data-yarn="notes">Notes</li>
              <li data-yarn="tasks">Tasks</li>
              <li data-yarn="calendar">Calendar</li>
              <li data-yarn="workout">Workout plan</li>
            </ul>
          </div>

          <figcaption className="stage-cap" id="stage-cap">
            <span>Illustrative example with sample data</span>
            <button className="replay" type="button" hidden={reduceMotion} onClick={replayWeave}>
              <Icon name="i-replay" />
              <span>Weave again</span>
            </button>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

