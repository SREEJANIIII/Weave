import React, { useEffect } from 'react';

export function IntroCurtain() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('is-intro')) return undefined;
    const skip = () => html.classList.add('is-intro-done');
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  return (
    <div className="intro" aria-hidden="true">
      <svg className="intro-threads" viewBox="0 0 1000 200" preserveAspectRatio="none">
        <path data-yarn="calendar" style={{ '--i': 0 }} pathLength="1" d="M-10,52 C200,38 320,66 500,52 S800,38 1010,52" />
        <path data-yarn="notes" style={{ '--i': 1 }} pathLength="1" d="M-10,78 C200,64 320,92 500,78 S800,64 1010,78" />
        <path data-yarn="tasks" style={{ '--i': 2 }} pathLength="1" d="M-10,104 C200,90 320,118 500,104 S800,90 1010,104" />
        <path data-yarn="workout" style={{ '--i': 3 }} pathLength="1" d="M-10,130 C200,116 320,144 500,130 S800,116 1010,130" />
        <path data-yarn="email" style={{ '--i': 4 }} pathLength="1" d="M-10,156 C200,142 320,170 500,156 S800,142 1010,156" />
      </svg>
      <svg className="intro-logo" viewBox="0 0 953 256">
        <use href="#logo-lockup" />
      </svg>
    </div>
  );
}

