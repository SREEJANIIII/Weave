import React from 'react';
import { Icon } from '../Icons';

/** One message at a time, read out politely, with an optional action such as Undo. */
export function Toast({ toast, onAction, onDismiss }) {
  return (
    <div className={`d-toast${toast ? ' is-on' : ''}`} role="status" aria-live="polite">
      {toast ? (
        <>
          <span>{toast.message}</span>
          {toast.action ? (
            <button type="button" className="d-toast-act" onClick={onAction}>
              {toast.action.label}
            </button>
          ) : null}
          <button type="button" className="d-toast-x" onClick={onDismiss} aria-label="Dismiss message">
            <Icon name="i-x" />
          </button>
        </>
      ) : null}
    </div>
  );
}
