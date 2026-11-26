import React from 'react';
import { YARN_VAR } from '../../lib/services';


/** The same weave, small, as a badge for "what Weave can see". */
export function WeaveSwatch({ yarns }) {
  const colours = yarns.length ? yarns.map((y) => YARN_VAR[y]) : ['var(--d-line)', 'var(--d-sunk-2)'];
  const stops = colours.map((c, i) => `${c} ${(i * 100) / colours.length}% ${((i + 1) * 100) / colours.length}%`).join(', ');
  return <span className="weave-swatch" style={{ '--swatch': `linear-gradient(90deg, ${stops})` }} aria-hidden="true" />;
}
