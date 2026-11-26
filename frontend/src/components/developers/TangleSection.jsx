import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { boxIn, fmt } from '../../lib/svgGeom';

const CHIPS = [
  { app: 'calendar', icon: 'i-calendar', label: 'Calendar' },
  { app: 'notes', icon: 'i-notes', label: 'Notes' },
  { app: 'tasks', icon: 'i-tasks', label: 'Tasks' },
  { app: 'workout', icon: 'i-fitness', label: 'Workout plan' },
  { app: 'email', icon: 'i-mail', label: 'Email' },
];

const HOPS = [
  { hop: 'calendar', text: 'What\u2019s left on my calendar?' },
  { hop: 'notes', text: 'What did I promise?' },
  { hop: 'tasks', text: 'Is it on my list?' },
  { hop: 'calendar', text: 'Any free hour today?' },
  { hop: 'workout', text: 'How long is my run?' },
  { hop: 'email', text: 'Who else needs a reply?' },
];

const rot = (v, deg) => {
  const r = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
};

export function TangleSection() {
  const stageRef = useRef(null);
  const chipRefs = useRef({});
  const [inView, setInView] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [layout, setLayout] = useState({ w: 0, h: 0, d: '', knots: [] });

  const draw = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W) return;

    const seen = {};
    const knots = [];
    const pts = HOPS.map((item, i) => {
      const chip = chipRefs.current[item.hop];
      if (!chip) return { x: 0, y: 0 };
      const b = boxIn(chip, stage);
      const visit = (seen[item.hop] = (seen[item.hop] ?? -1) + 1);
      knots.push({
        i,
        left: `${fmt(b.x + b.w - 10 + visit * 30)}px`,
        top: `${fmt(b.y - 14)}px`,
      });
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    });

    let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const sign = i % 2 ? 1 : -1;
      const v = { x: q.x - p.x, y: q.y - p.y };
      const a = rot(v, 58 * sign);
      const b = rot({ x: -v.x, y: -v.y }, -48 * sign);
      d += ` C${fmt(p.x + a.x * 0.5)},${fmt(p.y + a.y * 0.5)} ${fmt(q.x + b.x * 0.45)},${fmt(q.y + b.y * 0.45)} ${fmt(q.x)},${fmt(q.y)}`;
    }
    setLayout({ w: fmt(W), h: fmt(H), d, knots });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(stage);
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
      io.observe(stage);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, [draw]);

  return (
    <section className="scattered" id="scattered" aria-labelledby="scattered-title">
      <div className="container scattered-grid">
        <div className="scattered-copy">
          <h2 id="scattered-title" className="section-title">Right now, you are the&nbsp;glue.</h2>
          <p className="section-lede">One question sends you through five apps to rebuild the answer by&nbsp;hand.</p>
        </div>

        <figure className="tangle" aria-labelledby="tangle-cap">
          <div
            ref={stageRef}
            className={`tangle-stage${inView ? ' is-in' : ''}`}
            data-tangle=""
            data-reveal=""
          >
            <svg
              className="tangle-thread"
              viewBox={layout.w ? `0 0 ${layout.w} ${layout.h}` : undefined}
              width={layout.w || undefined}
              height={layout.h || undefined}
              aria-hidden="true"
            >
              {layout.d && <path className="tg-path" pathLength="1" d={layout.d} />}
            </svg>
            {CHIPS.map((c) => (
              <span
                key={c.app}
                ref={(el) => { chipRefs.current[c.app] = el; }}
                className="chip"
                data-app={c.app}
              >
                <Icon name={c.icon} />
                {c.label}
              </span>
            ))}
            {layout.knots.map((k) => (
              <span
                key={k.i}
                className="knot"
                aria-hidden="true"
                style={{ '--i': k.i, left: k.left, top: k.top }}
              >
                {k.i + 1}
              </span>
            ))}
          </div>

          <figcaption className="hops-wrap" id="tangle-cap">
            <span className="visually-hidden">The trip you take today, one app at a time:</span>
            <ol className="hops">
              {HOPS.map((h, i) => (
                <li key={i} data-hop={h.hop}>{h.text}</li>
              ))}
            </ol>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

