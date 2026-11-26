import React, { useEffect, useRef } from 'react';
import { Icon } from '../Icons';

/**
 * A panel over the dashboard: slides in from the right on wide screens and up from the bottom on
 * phones. Built on <dialog>, so focus stays inside, Escape closes it and the page behind is inert.
 */
export function Sheet({ open, onClose, title, description, children, footer, wide = false, labelId }) {
  const ref = useRef(null);
  const headingId = labelId ?? `sheet-${title.replace(/\W+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet${wide ? ' is-wide' : ''}`}
      aria-labelledby={headingId}
      onClose={() => open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-frame">
          <header className="sheet-head">
            <div>
              <h2 id={headingId}>{title}</h2>
              {description ? <p className="sheet-lede">{description}</p> : null}
            </div>
            <button className="icon-btn" type="button" onClick={onClose} aria-label={`Close ${title}`}>
              <Icon name="i-x" />
            </button>
          </header>
          <div className="sheet-body">{children}</div>
          {footer ? <footer className="sheet-foot">{footer}</footer> : null}
        </div>
      )}
    </dialog>
  );
}
