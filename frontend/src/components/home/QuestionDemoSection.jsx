import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SplitWords } from '../SplitWords';

const TABS = [
  { id: 'work', name: 'Work', q: 'What did I promise?', status: 'Works today', live: true, yarn: 'notes' },
  { id: 'week', name: 'Your week', q: 'When can I run?', status: 'Works today', live: true, yarn: 'calendar' },
  { id: 'money', name: 'Money', q: 'Food costs last week?', status: 'Works today', live: true, yarn: 'money' },
  { id: 'email', name: 'Email', q: 'Who needs a reply?', status: 'Coming later', live: false, yarn: 'email' },
  { id: 'home', name: 'Home', q: 'Bills due soon?', status: 'Coming later', live: false, yarn: 'home' },
];

const AREAS = {
  work: {
    q: "What did I promise in yesterday's meetings?",
    yarns: ['notes', 'tasks'],
    check: 'Checked your notes and to-dos',
    head: "Two things from yesterday's team\u00a0sync.",
    items: [
      ['notes', 'Send the revised budget to the design team', 'Due today. Not on your to-dos yet.'],
      ['tasks', "Confirm Friday's venue booking", 'Already on your to-dos.'],
    ],
  },
  week: {
    q: 'When can I fit in a workout today?',
    yarns: ['calendar', 'workout'],
    check: 'Checked your calendar and workout plan',
    head: 'A 45 minute run fits from 6:15 to 7:00 pm.',
    items: [
      ['calendar', 'Your focus block ends at 6:00', "You're free until dinner at 7:30."],
      ['workout', 'Your plan says runs are 45 minutes', 'Best between 6 and 8 pm, with 15 minutes spare.'],
    ],
  },
  money: {
    q: 'How much did I spend on food last week?',
    yarns: ['money', 'calendar'],
    check: 'Checked your bank statement and calendar',
    head: '₹5,080 across 8 purchases.',
    items: [
      ['money', 'Biggest day: Thursday, ₹2,060', 'The night of the team dinner.'],
      ['money', 'Dining out came to ₹2,860', 'Groceries ₹1,240, delivery ₹980.'],
    ],
  },
  email: {
    later: true,
    q: "Who's still waiting for a reply?",
    yarns: ['email'],
    check: 'Email is not connected yet',
    head: 'Email is next on the list.',
    items: [
      ['email', "Weave can't read email in this prototype", 'When it can, it will only look when you ask.'],
    ],
  },
  home: {
    later: true,
    q: 'Which bills are due before Sunday?',
    yarns: ['home'],
    check: 'Home apps are not connected yet',
    head: 'Home apps come after email.',
    items: [
      ['home', 'Bills, warranties and repairs', 'Each one will need your OK to connect.'],
    ],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const QuestionDemoSection = forwardRef(function QuestionDemoSection(_, ref) {
  const sectionRef = useRef(null);
  const screenRef = useRef(null);
  const tabRefs = useRef([]);
  const tokenRef = useRef(0);
  const playedRef = useRef(false);

  const [selectedId, setSelectedId] = useState('work');
  const [phase, setPhase] = useState('idle'); // 'idle' | 'asking' | 'checking'
  const [typedQ, setTypedQ] = useState(AREAS.work.q);
  const [typing, setTyping] = useState(false);

  const play = useCallback(async (key) => {
    const my = ++tokenRef.current;
    const area = AREAS[key];
    setSelectedId(key);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedQ(area.q);
      setTyping(false);
      setPhase('idle');
      return;
    }
    setPhase('asking');
    setTyping(true);
    setTypedQ('');
    for (let i = 1; i <= area.q.length; i++) {
      if (my !== tokenRef.current) return;
      setTypedQ(area.q.slice(0, i));
      await sleep(20);
    }
    if (my !== tokenRef.current) return;
    setTyping(false);
    await sleep(250);
    if (my !== tokenRef.current) return;
    setPhase('checking');
    await sleep(650);
    if (my !== tokenRef.current) return;
    setPhase('idle');
  }, []);

  const select = useCallback(
    (key, focus = false) => {
      playedRef.current = true;
      if (focus) {
        const idx = TABS.findIndex((t) => t.id === key);
        tabRefs.current[idx]?.focus();
      }
      play(key);
    },
    [play],
  );

  useImperativeHandle(ref, () => ({
    show(key) {
      const idx = TABS.findIndex((t) => t.id === key);
      if (idx < 0) return;
      playedRef.current = true;
      sectionRef.current?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      select(key);
      tabRefs.current[idx]?.focus({ preventScroll: true });
    },
  }), [select]);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !playedRef.current) {
            playedRef.current = true;
            play('work');
            io.disconnect();
          }
        });
      },
      { threshold: 0.5 },
    );
    io.observe(screen);
    return () => {
      tokenRef.current += 1;
      io.disconnect();
    };
  }, [play]);

  const activeArea = AREAS[selectedId];
  const screenCls = [
    'screen',
    activeArea.later ? 'is-later' : '',
    phase === 'asking' ? 'is-asking' : phase === 'checking' ? 'is-checking' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section ref={sectionRef} className="ask" id="ask" aria-labelledby="ask-title">
      <div className="container">
        <div className="ask-head">
          <SplitWords as="h2" className="section-title" id="ask-title" text="Pick a part of your day. Watch it answer." />
        </div>
        <div className="demo">
          <div className="areas" role="tablist" aria-label="Parts of your day" aria-orientation="vertical">
            {TABS.map((t, i) => {
              const selected = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  ref={(el) => { tabRefs.current[i] = el; }}
                  className="area-tab"
                  role="tab"
                  type="button"
                  id={`tab-${t.id}`}
                  aria-controls="demo-panel"
                  aria-selected={String(selected)}
                  tabIndex={selected ? 0 : -1}
                  data-yarn={t.yarn}
                  onClick={() => select(t.id)}
                  onKeyDown={(e) => {
                    const keys = {
                      ArrowDown: i + 1,
                      ArrowRight: i + 1,
                      ArrowUp: i - 1,
                      ArrowLeft: i - 1,
                      Home: 0,
                      End: TABS.length - 1,
                    };
                    if (!(e.key in keys)) return;
                    e.preventDefault();
                    const next = TABS[(keys[e.key] + TABS.length) % TABS.length];
                    select(next.id, true);
                  }}
                >
                  <span className="ribbon" aria-hidden="true" />
                  <span className="area">{t.name}</span>
                  <span className="area-q">{t.q}</span>
                  <span className={`status${t.live ? ' is-live' : ''}`}>{t.status}</span>
                </button>
              );
            })}
          </div>
          <div
            ref={screenRef}
            className={screenCls}
            id="demo-panel"
            role="tabpanel"
            aria-labelledby={`tab-${selectedId}`}
            aria-live="polite"
            aria-busy={String(phase !== 'idle')}
          >
            <p className={`screen-q${typing ? ' is-typing' : ''}`}>{typedQ}</p>
            <p className="screen-check">
              <span className="yarns" aria-hidden="true">
                {activeArea.yarns.map((y) => (
                  <span key={y} data-yarn={y} />
                ))}
              </span>
              <span>{activeArea.check}</span>
            </p>
            <div className="screen-a">
              <p className="screen-head">{activeArea.head}</p>
              <ul className="screen-list">
                {activeArea.items.map(([yarn, strong, line]) => (
                  <li key={strong} data-yarn={yarn}>
                    <strong>{strong}</strong>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="screen-foot">Sample&nbsp;data.</p>
          </div>
        </div>
      </div>
    </section>
  );
});

