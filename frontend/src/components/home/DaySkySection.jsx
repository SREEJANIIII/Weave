import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SplitWords } from '../SplitWords';

const MOMENTS = [
  {
    time: '9:45',
    hour: 9.75,
    moment: 'After the team meeting',
    question: 'What did I just agree to\u00a0do?',
    apps: [
      { yarn: 'notes', name: 'Notes' },
      { yarn: 'tasks', name: 'To-dos' },
    ],
  },
  {
    time: '13:00',
    hour: 13,
    moment: 'Over lunch',
    question: 'Is there time for a run\u00a0today?',
    apps: [
      { yarn: 'calendar', name: 'Calendar' },
      { yarn: 'workout', name: 'Workout plan' },
    ],
  },
  {
    time: '16:30',
    hour: 16.5,
    moment: 'After a client call',
    question: 'Who\u2019s still waiting on\u00a0me?',
    apps: [
      { yarn: 'email', name: 'Email' },
      { yarn: 'notes', name: 'Notes' },
      { yarn: 'tasks', name: 'To-dos' },
    ],
  },
  {
    time: '21:00',
    hour: 21,
    moment: 'Before bed',
    question: 'Where did my money go this\u00a0week?',
    apps: [
      { yarn: 'money', name: 'Bank statement' },
      { yarn: 'calendar', name: 'Calendar' },
    ],
  },
];

const STARS = [
  [251, 237, 1.2, '2.5s'], [306, 235, 1.5, '0.4s'], [258, 131, 1.5, '1.4s'], [280, 234, 1.5, '5.0s'], [320, 64, 1, '3.5s'],
  [114, 221, 1.2, '3.8s'], [282, 137, 1.5, '1.4s'], [342, 173, 1, '2.8s'], [248, 93, 1, '2.0s'], [295, 223, 1.2, '1.9s'],
  [375, 178, 1, '4.2s'], [41, 168, 1, '1.1s'], [222, 131, 1, '2.3s'], [354, 205, 1.5, '2.0s'], [335, 182, 1, '2.8s'],
  [100, 175, 1, '3.9s'], [27, 228, 1.2, '1.7s'], [290, 32, 1.2, '1.7s'], [117, 241, 1.2, '3.8s'], [143, 169, 1, '0.7s'],
  [35, 215, 1.5, '0.5s'], [257, 99, 1, '2.3s'], [245, 167, 1.2, '0.9s'], [120, 148, 1.5, '0.9s'], [139, 179, 1.5, '1.0s'],
];

const SPOTS = { 2: [140, 260], 3: [112, 200, 288] };
const TOPS = [238, 222, 246];
const HOURS = MOMENTS.map((m) => m.hour);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function arcPoint(hour) {
  const frac = (hour - 6) / 14;
  const th = Math.PI * (1 - frac);
  return { x: 200 + 160 * Math.cos(th), y: 290 - 160 * Math.sin(th), frac };
}

export function DaySkySection() {
  const skyRef = useRef(null);
  const sunRef = useRef(null);
  const scrubRef = useRef(null);
  const timelineRef = useRef(null);
  const itemRefs = useRef([]);
  const tRef = useRef(0);
  const tweenRef = useRef(0);
  const shownRef = useRef(-1);
  const seqRef = useRef(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [skyOffscreen, setSkyOffscreen] = useState(false);
  const [timelineIn, setTimelineIn] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [threadNodes, setThreadNodes] = useState([]);
  const [clockNodes, setClockNodes] = useState([{ key: 'init-0', text: MOMENTS[0].time, state: '' }]);

  const triggerMomentContent = useCallback((idx) => {
    if (idx === shownRef.current) return;
    shownRef.current = idx;
    setActiveIndex(idx);
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apps = MOMENTS[idx].apps;
    const xs = SPOTS[apps.length] ?? SPOTS[3];
    const batch = ++seqRef.current;

    // Threads + tags
    const nextThreads = apps.map((app, k) => ({
      key: `${batch}-${k}`,
      yarn: app.yarn,
      name: app.name,
      x: xs[k],
      top: TOPS[k],
      delay: `${(k * 0.12).toFixed(2)}s`,
      state: instant ? '' : 'is-in',
    }));

    setThreadNodes((prev) => {
      const kept = instant ? [] : prev.filter((n) => n.state !== 'is-out').map((n) => ({ ...n, state: 'is-out' }));
      return [...kept, ...nextThreads];
    });

    if (!instant) {
      setTimeout(() => {
        setThreadNodes((prev) => prev.filter((n) => !(n.state === 'is-out' && !nextThreads.some((nt) => nt.key === n.key))));
      }, 340);
    }

    // Rolling clock
    const nextTime = MOMENTS[idx].time;
    setClockNodes((prev) => {
      const current = prev.find((c) => c.state !== 'is-out');
      if (current && current.text === nextTime) return prev;
      const incoming = { key: `${batch}-clock`, text: nextTime, state: instant ? '' : 'is-in' };
      if (instant) return [incoming];
      return [...prev.filter((c) => c.state !== 'is-out').map((c) => ({ ...c, state: 'is-out' })), incoming];
    });

    if (!instant) {
      setTimeout(() => {
        setClockNodes((prev) => prev.filter((c) => c.state !== 'is-out'));
      }, 340);
    }
  }, []);

  const renderSkyAt = useCallback(
    (value) => {
      const sky = skyRef.current;
      const sun = sunRef.current;
      const scrub = scrubRef.current;
      if (!sky || !sun) return;

      const t = clamp(value, 0, 3);
      tRef.current = t;
      const k = Math.min(2, Math.floor(t));
      const hour = HOURS[k] + (HOURS[k + 1] - HOURS[k]) * (t - k);
      const p = arcPoint(hour);

      sun.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      sky.style.setProperty('--done', clamp(p.frac, 0, 1).toFixed(3));
      for (let j = 0; j < 4; j++) {
        sky.style.setProperty(`--o${j}`, Math.max(0, 1 - Math.abs(t - j)).toFixed(3));
      }
      sky.style.setProperty('--night', clamp((t - 2.2) / 0.8, 0, 1).toFixed(3));
      sky.style.setProperty('--sun', (1 - clamp((hour - 19.4) / 0.9, 0, 1)).toFixed(3));
      sky.style.setProperty('--moon', clamp((t - 2.4) / 0.6, 0, 1).toFixed(3));
      sky.classList.toggle('is-night', t >= 2.5);

      const i = Math.round(t);
      sky.dataset.moment = String(i);
      if (scrub) {
        scrub.value = String(Math.round(t * 100));
        scrub.setAttribute('aria-valuetext', `${MOMENTS[i].time}, ${MOMENTS[i].moment.toLowerCase()}`);
      }
      triggerMomentContent(i);
    },
    [triggerMomentContent],
  );

  const goTo = useCallback(
    (target) => {
      cancelAnimationFrame(tweenRef.current);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        renderSkyAt(target);
        return;
      }
      const from = tRef.current;
      const start = performance.now();
      const dur = 900;
      const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const step = (now) => {
        const f = Math.min(1, (now - start) / dur);
        renderSkyAt(from + (target - from) * ease(f));
        if (f < 1) tweenRef.current = requestAnimationFrame(step);
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [renderSkyAt],
  );

  useEffect(() => {
    renderSkyAt(0);
    const sky = skyRef.current;
    const tl = timelineRef.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let skyIo;
    let itemIo;
    let tlIo;

    if ('IntersectionObserver' in window) {
      if (sky) {
        skyIo = new IntersectionObserver((entries) => {
          entries.forEach((e) => setSkyOffscreen(!e.isIntersecting));
        }, { threshold: 0 });
        skyIo.observe(sky);
      }

      itemIo = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (en.isIntersecting) goTo(Number(en.target.dataset.at));
        }
      }, { rootMargin: '-45% 0px -45% 0px' });
      itemRefs.current.forEach((li) => li && itemIo.observe(li));

      if (!reduce && tl) {
        tlIo = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              setTimelineIn(true);
              tlIo.disconnect();
            }
          });
        }, { threshold: 0.2 });
        tlIo.observe(tl);
      }
    }

    return () => {
      cancelAnimationFrame(tweenRef.current);
      skyIo?.disconnect();
      itemIo?.disconnect();
      tlIo?.disconnect();
    };
  }, [goTo, renderSkyAt]);

  return (
    <section className="day" id="day" aria-labelledby="day-title">
      <div className="container day-grid">
        <div className="day-head">
          <SplitWords as="h2" className="section-title" id="day-title" text="Small questions shouldn’t need multiple apps." />
          <div
            ref={skyRef}
            className={`sky is-live${skyOffscreen ? ' is-offscreen' : ''}`}
            aria-hidden="true"
            data-moment={activeIndex}
            onClick={() => goTo((Math.round(tRef.current) + 1) % 4)}
          >
            <span className="sky-layer l0" />
            <span className="sky-layer l1" />
            <span className="sky-layer l2" />
            <span className="sky-layer l3" />
            <svg className="sky-scene" viewBox="0 0 400 400">
              <defs>
                <pattern id="w-calendar" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect className="w-base" width="6" height="6" />
                  <rect className="w-line" width="2" height="6" />
                </pattern>
                <pattern id="w-notes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <rect className="w-base" width="6" height="6" />
                  <rect className="w-line" width="2" height="6" />
                </pattern>
                <pattern id="w-tasks" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect className="w-base" width="6" height="6" />
                  <rect className="w-line" width="2" height="6" />
                </pattern>
                <pattern id="w-workout" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <rect className="w-base" width="6" height="6" />
                  <rect className="w-line" width="2" height="6" />
                </pattern>
                <mask id="moon-cut" maskUnits="userSpaceOnUse" x="-20" y="-20" width="40" height="40">
                  <rect x="-20" y="-20" width="40" height="40" fill="white" />
                  <circle cx="6" cy="-4" r="10" fill="black" />
                </mask>
              </defs>
              <g className="stars">
                {STARS.map(([cx, cy, r, d], i) => (
                  <circle key={i} cx={cx} cy={cy} r={r} style={{ '--d': d }} />
                ))}
              </g>
              <path className="arc-track" d="M40,290 A160,160 0 0 1 360,290" />
              <path className="arc-done" pathLength="1" d="M40,290 A160,160 0 0 1 360,290" />
              <g className="ticks">
                <line x1="98.7" y1="176.7" x2="88.1" y2="164.7" />
                <text className="tick-label t0" x="76.1" y="155.3">9:45</text>
                <line x1="200.0" y1="138.0" x2="200.0" y2="122.0" />
                <text className="tick-label t1" x="200.0" y="108.0">13:00</text>
                <line x1="307.5" y1="182.5" x2="318.8" y2="171.2" />
                <text className="tick-label t2" x="331.5" y="162.5">16:30</text>
              </g>
              <g className="moon" transform="translate(316 96)">
                <circle r="12" mask="url(#moon-cut)" />
              </g>
              <g ref={sunRef} className="sun" transform="translate(93.3 170.8)">
                <circle className="halo h2" r="34" />
                <circle className="halo h1" r="22" />
                <circle className="disc" r="12" />
              </g>
              <g className="ground">
                <rect className="band" x="0" y="290" width="400" height="28" fill="url(#w-calendar)" />
                <rect className="band" x="0" y="318" width="400" height="28" fill="url(#w-notes)" />
                <rect className="band" x="0" y="346" width="400" height="28" fill="url(#w-tasks)" />
                <rect className="band" x="0" y="374" width="400" height="26" fill="url(#w-workout)" />
                <rect className="ground-night" x="0" y="290" width="400" height="110" />
                <line className="horizon" x1="0" y1="290" x2="400" y2="290" />
              </g>
              <g className="threads">
                {threadNodes.map((n) => (
                  <g key={n.key} className={`thread${n.state ? ` ${n.state}` : ''}`} data-yarn={n.yarn} style={{ '--d': n.delay }}>
                    <line x1={n.x} y1={290} x2={n.x} y2={n.top} />
                    <circle cx={n.x} cy={n.top} r={3} />
                  </g>
                ))}
              </g>
            </svg>
            <span className="sky-labels">
              {threadNodes.map((n) => (
                <span
                  key={n.key}
                  className={`sky-label${n.state ? ` ${n.state}` : ''}`}
                  style={{ '--lx': `${(n.x / 4).toFixed(2)}%`, '--ly': `${(n.top / 4).toFixed(2)}%`, '--d': n.delay }}
                >
                  {n.name}
                </span>
              ))}
            </span>
            <span className="sky-clock">
              <span className="sky-time-wrap">
                {clockNodes.map((c) => (
                  <span key={c.key} className={`sky-time${c.state ? ` ${c.state}` : ''}`}>
                    {c.text}
                  </span>
                ))}
              </span>
              <span className="sky-moment">{MOMENTS[activeIndex].moment}</span>
            </span>
          </div>
          <label className="scrub" htmlFor="scrub">
            <span className="scrub-label">Drag through the day</span>
            <input
              ref={scrubRef}
              id="scrub"
              type="range"
              min="0"
              max="300"
              step="1"
              defaultValue="0"
              aria-valuetext="9:45, after the team meeting"
              onInput={(e) => {
                cancelAnimationFrame(tweenRef.current);
                renderSkyAt(Number(e.currentTarget.value) / 100);
              }}
            />
          </label>
        </div>
        <ol ref={timelineRef} className={`timeline${timelineIn ? ' is-in' : ''}`} data-reveal="">
          {MOMENTS.map((m, i) => (
            <li
              key={m.time}
              ref={(el) => { itemRefs.current[i] = el; }}
              data-at={i}
              className={i === activeIndex ? 'is-now' : undefined}
            >
              <time>{m.time}</time>
              <span className="moment">{m.moment}</span>
              <p className="q">{m.question}</p>
              <span className="apps-used">
                {m.apps.map((a) => (
                  <span key={a.yarn} data-yarn={a.yarn}>{a.name}</span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

