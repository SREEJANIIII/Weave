import React, { useEffect, useRef, useState } from 'react';

/**
 * Renders a display headline with each word masked so CSS can animate words rising up.
 */
export function SplitWords({ as: Tag = 'h2', className = '', id, text, hero = false }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const words = text.replace(/[ \n\t]+/g, ' ').trim().split(' ');

  useEffect(() => {
    if (hero) return;
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hero]);

  return (
    <Tag
      ref={ref}
      id={id}
      className={`${className}${!hero && inView ? ' is-in' : ''}`}
      aria-label={text}
      data-words={!hero ? '' : undefined}
    >
      {words.map((word, i) => (
        <React.Fragment key={i}>
          <span className="w" aria-hidden="true">
            <span style={{ '--i': i }}>{word}</span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </Tag>
  );
}

