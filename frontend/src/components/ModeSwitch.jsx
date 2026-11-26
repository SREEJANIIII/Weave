import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';

/**
 * Docked bottom-right toggle between the everyday landing page (/) and developer mode (/developers).
 * Slides the thumb before switching views and uses the woven-curtain View Transition when supported.
 */
export function ModeSwitch({ isOn }) {
  const [visualOn, setVisualOn] = useState(isOn);
  const navigate = useNavigate();

  useEffect(() => {
    setVisualOn(isOn);
  }, [isOn]);

  const target = isOn ? '/' : '/developers';
  const ariaLabel = isOn
    ? 'Developer mode is on. Switch back to the everyday page.'
    : 'Developer mode is off. Open the developer page.';

  function handleClick(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    setVisualOn((prev) => !prev);
    setTimeout(() => {
      if (typeof document.startViewTransition === 'function') {
        try {
          document.startViewTransition({
            update: () => flushSync(() => navigate(target)),
            types: ['mode'],
          });
          return;
        } catch {
          try {
            document.startViewTransition(() => flushSync(() => navigate(target)));
            return;
          } catch {
            // Fall through to plain navigation
          }
        }
      }
      navigate(target);
    }, 200);
  }

  return (
    <Link
      className={`mode-switch${visualOn ? ' is-on' : ''}`}
      to={target}
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      <span className="mode-switch-label" aria-hidden="true">
        <span className="mode-long">Developer mode</span>
        <span className="mode-short">Dev mode</span>
      </span>
      <span className="mode-switch-track" aria-hidden="true">
        <span className="mode-switch-thumb" />
      </span>
    </Link>
  );
}

