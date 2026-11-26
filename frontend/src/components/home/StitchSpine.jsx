import React, { useEffect, useState } from 'react';

const SECTIONS = [
  ['top', 'Start'],
  ['day', 'Your day'],
  ['ask', 'Try a question'],
  ['control', 'Your control'],
  ['faq', 'Questions'],
  ['start', 'Ask it for real'],
];

export function StitchSpine() {
  const [positions, setPositions] = useState(() => SECTIONS.map(() => 0));
  const [progress, setProgress] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    let max = 1;
    let ats = SECTIONS.map(() => 0);
    let ticking = false;

    const update = () => {
      ticking = false;
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      setProgress(p);
      let current = 0;
      ats.forEach((at, i) => {
        if (p >= at - 0.002) current = i;
      });
      setCurrentIdx(current);
    };

    const layout = () => {
      max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      ats = SECTIONS.map(([id]) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        return Math.min(1, Math.max(0, (el.getBoundingClientRect().top + window.scrollY - 80) / max));
      });
      setPositions(ats);
      update();
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(layout);
    ro.observe(document.body);
    layout();

    return () => {
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <nav className="spine" aria-label="Sections of this page">
      <span className="spine-track">
        <span className="spine-fill" style={{ '--p': progress.toFixed(4) }} />
      </span>
      {SECTIONS.map(([id, label], i) => {
        const passed = progress >= (positions[i] ?? 0) - 0.002;
        const isCurrent = i === currentIdx;
        return (
          <button
            key={id}
            type="button"
            className={`knot${passed ? ' is-passed' : ''}${isCurrent ? ' is-current' : ''}`}
            style={{ '--y': `${((positions[i] ?? 0) * 100).toFixed(2)}%` }}
            aria-label={`Go to ${label}`}
            onClick={() => scrollTo(id)}
          >
            <span className="knot-label" aria-hidden="true">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

