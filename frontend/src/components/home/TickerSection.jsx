import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

const ITEMS = [
  { area: 'work', yarn: 'notes', label: 'What did I promise yesterday?' },
  { area: 'wishlist', yarn: 'wishlist', label: 'What outfits did I save for Diwali?' },
  { area: 'week', yarn: 'calendar', label: 'When can I fit in a workout?' },
  { area: 'money', yarn: 'money', label: 'What did food cost last week?' },
  { area: 'email', yarn: 'email', label: 'Who’s waiting for a reply?' },
  { area: 'work', yarn: 'tasks', label: 'What should I follow up on?' },
  { area: 'home', yarn: 'home', label: 'Which bills are due soon?' },
];

export function TickerSection({ onPickArea }) {
  const rootRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setOffscreen(!e.isIntersecting)),
      { threshold: 0 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={rootRef}
      className={`ticker night${paused ? ' is-paused' : ''}${offscreen ? ' is-offscreen' : ''}`}
      aria-labelledby="ticker-title"
    >
      <h2 className="visually-hidden" id="ticker-title">Questions people ask Weave</h2>
      <div className="ticker-window">
        <div className="ticker-track">
          <ul className="ticker-list">
            {ITEMS.map((item) => (
              <li key={item.label}>
                <button type="button" data-yarn={item.yarn} onClick={() => onPickArea(item.area)}>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <ul className="ticker-list ticker-copy" aria-hidden="true">
            {ITEMS.map((item) => (
              <li key={`copy-${item.label}`}>
                <button type="button" tabIndex={-1} data-yarn={item.yarn} onClick={() => onPickArea(item.area)}>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button
        className="ticker-pause"
        type="button"
        aria-pressed={String(paused)}
        onClick={() => setPaused((p) => !p)}
      >
        <Icon name={paused ? 'i-play' : 'i-pause'} />
        <span>{paused ? 'Play' : 'Pause'}</span>
      </button>
    </section>
  );
}

