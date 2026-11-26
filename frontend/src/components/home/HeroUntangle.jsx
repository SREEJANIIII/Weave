import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon, LogoSymbol } from '../Icons';
import { SplitWords } from '../SplitWords';
import { useMagneticProps } from '../../hooks/usePageSetup';

const CARDS = [
  { app: 'calendar', yarn: 'calendar', icon: 'i-calendar', name: 'Calendar', detail: 'Review at 11:00', status: 'Checked', badge: '6 today' },
  { app: 'notes', yarn: 'notes', icon: 'i-notes', name: 'Notes', detail: '4 action items', status: 'Checked', badge: '2 new' },
  { app: 'tasks', yarn: 'tasks', icon: 'i-tasks', name: 'To-dos', detail: 'Venue due today', status: 'Checked', badge: '9 open' },
  { app: 'email', yarn: 'email', icon: 'i-mail', name: 'Email', detail: 'Priya: recap?', status: 'Not needed', badge: '4 unread', unused: true },
  { app: 'money', yarn: 'money', icon: 'i-money', name: 'Bank', detail: '8 food buys', status: 'Not needed', badge: '₹5,080', unused: true },
  { app: 'workout', yarn: 'workout', icon: 'i-fitness', name: 'Workout', detail: 'Run day, 45 min', status: 'Checked', badge: 'Today' },
];

const DEPTHS = [1.2, 0.8, 1.4, 1, 0.9, 1.3];

export function HeroUntangle() {
  const stageRef = useRef(null);
  const heroRef = useRef(null);
  const cardInRefs = useRef([]);
  const magneticCta = useMagneticProps();

  useEffect(() => {
    const hero = heroRef.current;
    const stage = stageRef.current;
    if (!hero || !stage) return undefined;

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;

    const tick = () => {
      x += (tx - x) * 0.1;
      y += (ty - y) * 0.1;
      cardInRefs.current.forEach((c, i) => {
        if (!c) return;
        c.style.setProperty('--px', `${(x * DEPTHS[i]).toFixed(1)}px`);
        c.style.setProperty('--py', `${(y * DEPTHS[i]).toFixed(1)}px`);
      });
      raf = Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05 ? requestAnimationFrame(tick) : 0;
    };

    const onMove = (e) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return;
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * -18;
      ty = ((e.clientY - r.top) / r.height - 0.5) * -12;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={heroRef} className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-pin">
        <div className="container hero-inner">
          <div className="hero-copy">
            <SplitWords as="h1" className="hero-title" id="hero-title" text="Your next step, without opening five apps." hero />
            <p className="hero-lede">Weave checks your calendar, notes and to-dos, then tells you what&nbsp;matters.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/app" {...magneticCta}>
                Try Weave
              </Link>
              <span className="hero-note">No account needed</span>
            </div>
          </div>

          <figure className="uv" aria-labelledby="uv-cap">
            <div ref={stageRef} className="uv-stage">
              <p className="uv-steps" aria-hidden="true">
                <span className="uv-step s1">Your day, spread across six apps.</span>
                <span className="uv-step s2">You ask one question.</span>
                <span className="uv-step s3">Weave checks only what it needs.</span>
                <span className="uv-step s4">One answer. You decide what happens.</span>
              </p>
              <svg className="uv-tangle" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength="1" d="M18,21 C48,-6 88,8 74,19 S30,60 46,41 S8,0 18,21 C26,48 2,84 20,65 S70,96 56,77 S92,24 80,51 S40,92 20,65" />
                <path className="ink" pathLength="1" d="M74,19 C96,40 60,58 80,51 S20,36 46,41 S66,84 56,77 S0,46 18,21" />
              </svg>
              <svg className="uv-strands" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path data-yarn="calendar" pathLength="1" d="M15.5,30 C15.5,38 22,40 22,48" />
                <path data-yarn="notes" pathLength="1" d="M50,30 C50,40 38,40 38,48" />
                <path data-yarn="tasks" pathLength="1" d="M84.5,30 C84.5,40 54,40 54,48" />
                <path data-yarn="workout" pathLength="1" d="M84.5,41 C84.5,45 70,44 70,48" />
              </svg>
              <p className="uv-q">What should I follow up on today, and when can I fit in a&nbsp;workout?</p>

              {CARDS.map((c, i) => (
                <div key={c.app} className={`uv-card${c.unused ? ' is-unused' : ''}`} data-app={c.app} data-yarn={c.yarn}>
                  <div className="uv-in" ref={(el) => { cardInRefs.current[i] = el; }}>
                    <span className="uv-name">
                      <Icon name={c.icon} />
                      {c.name}
                    </span>
                    <span className="uv-line">
                      <span className="uv-detail">{c.detail}</span>
                      <span className="uv-status">{c.status}</span>
                    </span>
                    <span className="uv-badge">{c.badge}</span>
                  </div>
                </div>
              ))}

              <div className="uv-answer">
                <p className="uv-from">
                  <LogoSymbol small />
                  Weave
                </p>
                <p className="uv-head">Three follow-ups, and a run at 6:15&nbsp;pm.</p>
                <ul className="uv-list">
                  <li data-yarn="notes">Send the revised budget</li>
                  <li data-yarn="tasks">Confirm Friday&rsquo;s venue</li>
                  <li data-yarn="tasks">Review Rohan&rsquo;s plan</li>
                </ul>
                <p className="uv-ask">
                  <span>Book the run?</span>
                  <span className="pill pill-yes" aria-hidden="true">Yes</span>
                </p>
              </div>
            </div>
            <figcaption className="caption" id="uv-cap">Example with sample&nbsp;data.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

